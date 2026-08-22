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

    it(`unit ${n} does not let the foot nav outrank the test`, () => {
      const nav = read(n).match(/<div class="lesson-nav">[\s\S]*?<\/div>/);
      expect(nav).not.toBeNull();
      expect(nav[0]).not.toContain('btn-primary');
    });

    it(`unit ${n} points its test card at no other unit`, () => {
      const card = read(n).match(/<div class="lesson-finish lesson-finish--test">[\s\S]*?<\/div>/);
      const links = [...card[0].matchAll(/unit-test\.html\?unit=(\d+)/g)].map((m) => Number(m[1]));
      expect(links).not.toHaveLength(0);
      expect(links.every((u) => u === n)).toBe(true);
    });
  }
});
