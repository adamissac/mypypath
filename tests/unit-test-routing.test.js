import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

// The end of unit test is only reachable if the last lesson in a unit actually
// hands it to the learner. It used to sit in the header actions alone, while
// the nav at the foot of that lesson pointed straight at the next unit, so the
// obvious way forward walked past the test. These guard the foot of the page.
const UNITS = 10;

let lastLesson = {};

beforeAll(() => {
  const src = fs.readFileSync('assets/js/curriculum.js', 'utf8');
  for (const m of src.matchAll(/^\s*(\d+): \[(.*?)\]/gms)) {
    const lessons = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    lastLesson[Number(m[1])] = lessons[lessons.length - 1];
  }
});

function read(n) {
  return fs.readFileSync(lastLesson[n].replace(/^\//, ''), 'utf8');
}

describe('end of unit test routing', () => {
  it('knows the last lesson of all ten units', () => {
    expect(Object.keys(lastLesson).map(Number).sort((a, b) => a - b))
      .toEqual(Array.from({ length: UNITS }, (_, i) => i + 1));
  });

  for (let n = 1; n <= UNITS; n += 1) {
    it(`unit ${n} ends on a card that routes to its own test`, () => {
      const html = read(n);
      expect(html).toContain('<div class="lesson-finish lesson-finish--test">');
      expect(html).toContain(
        `<a class="btn btn-primary route" data-unit-test-link="${n}" href="/unit-test.html?unit=${n}">Take the Unit ${n} test</a>`
      );
      // The score line lesson-progress.js paints, so a retake shows a best score.
      expect(html).toContain(`data-unit-test-status="${n}"`);
    });

    it(`unit ${n} states the paper as facts, not a sentence of arithmetic`, () => {
      const html = read(n);
      expect(html).toContain('lesson-finish__stats');
      // Authored, not injected, so the page still says what the test is with
      // JavaScript off -- the same reason the test links are real markup.
      expect(html).toContain('<b>100</b><span>points in total</span>');
      expect(html).toContain('lesson-finish__stat--pass"><b>70</b><span>to pass</span>');
    });

    it(`unit ${n} asks for the score bar rather than the plain sentence`, () => {
      // The unit pages and the curriculum share this status line and keep the
      // sentence; only the end-of-unit card opts into the meter.
      expect(read(n)).toContain('data-unit-test-meter');
    });

    it(`unit ${n} does not let the foot nav outrank the test`, () => {
      const nav = read(n).match(/<div class="lesson-nav">[\s\S]*?<\/div>/);
      expect(nav).not.toBeNull();
      expect(nav[0]).not.toContain('btn-primary');
    });

    it(`unit ${n} points its test card at no other unit`, () => {
      /* Sliced to the foot nav rather than to the first </div>.
         The card holds nested elements now -- a head block wrapping the badge,
         eyebrow and title -- so a non-greedy match to the first closing tag
         stops before the link it is supposed to be checking. That failure mode
         is the dangerous one: it finds no links at all, and "every link points
         at unit n" is vacuously true of an empty list. The length assertion
         below is what caught it, and it stays for that reason. */
      const html = read(n);
      const start = html.indexOf('<div class="lesson-finish lesson-finish--test">');
      const end = html.indexOf('<div class="lesson-nav">', start);
      expect(start, 'card not found').toBeGreaterThan(-1);
      expect(end, 'foot nav not found after the card').toBeGreaterThan(start);
      const links = [...html.slice(start, end).matchAll(/unit-test\.html\?unit=(\d+)/g)]
        .map((m) => Number(m[1]));
      expect(links).not.toHaveLength(0);
      expect(links.every((u) => u === n)).toBe(true);
    });
  }
});
