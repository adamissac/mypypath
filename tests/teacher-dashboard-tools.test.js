import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* The teacher dashboard's working tools: the test results table, editing an
 * assignment, quiz results, the "Saved" confirmation, the guide, and the
 * settings panels that used to show in the wrong mode. */

let CORE;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  CORE = window.PyPathClassroom;
});

const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('classroom.html');
const dash = read('assets/js/classroom-dashboard.js');
const css = read('assets/css/classroom.css');

const test = (unit, score, total = 100, at = 1000) =>
  ({ type: 'test.submitted', at, payload: { unit, score, total } });

describe('bestTestScore: the one place a best unit test mark is worked out', () => {
  it('is null for a test never sat', () => {
    expect(CORE.bestTestScore([], 1)).toBe(null);
    expect(CORE.bestTestScore([test(2, 90)], 1)).toBe(null);
  });

  it('keeps the best of several sittings, never the latest', () => {
    const best = CORE.bestTestScore([test(1, 55, 100, 1), test(1, 84, 100, 2), test(1, 60, 100, 3)], 1);
    expect(best.percent).toBe(84);
    expect(best.passed).toBe(true);
  });

  it('compares by percentage, so papers with different totals are fair', () => {
    expect(CORE.bestTestScore([test(3, 7, 10), test(3, 60, 100)], 3).percent).toBe(70);
  });

  it('uses the same 70 pass mark as the test page', () => {
    expect(CORE.UNIT_TEST_PASS_MARK).toBe(70);
    expect(CORE.bestTestScore([test(1, 69)], 1).passed).toBe(false);
    expect(CORE.bestTestScore([test(1, 70)], 1).passed).toBe(true);
  });

  it('reads the canonical log a summary expands to, which carries unit as a number', () => {
    expect(CORE.bestTestScore([test(4, 77)], '4').percent).toBe(77);
  });

  it('is what the results table uses, with the shared grade-override helper', () => {
    expect(dash).toMatch(/CORE\.bestTestScore\(st\.events, u\)/);
    expect(dash).toMatch(/withGradeOverride\(\{ unit: u, score: best\.percent \}, st\.overrides\)/);
    // The roster column applies corrections through the same helper.
    expect(dash).toMatch(/return best \? withGradeOverride\(best, overrides\) : best;/);
  });
});

describe('the settings show only the controls that do something', () => {
  it('hides the tick panels for real, whatever display the grid sets', () => {
    expect(css).toMatch(/\.cr-access__pick\[hidden\],\s*\n\.cr-access__units\[hidden\]/);
  });

  it('toggles the wrapper for each mode', () => {
    expect(dash).toMatch(/show\(\$\('\[data-cr-access-pick\]'\), mode === 'manual'\)/);
    expect(dash).toMatch(/show\(\$\('\[data-cr-test-pick\]'\), gate === 'manual'\)/);
  });

  it('keeps the honest caveats, folded rather than removed', () => {
    const joined = html.replace(/\s+/g, ' ');
    expect(joined).toMatch(/<details class="cr-how">/);
    expect(joined).toMatch(/The lesson is not shown to them/);
    expect(joined).toMatch(/not by the database/);
    expect(joined).toMatch(/It does not remove the answer/);
  });
});

describe('tools a teacher uses every week', () => {
  it('confirms every save out loud', () => {
    expect(html).toMatch(/data-cr-toast role="status" aria-live="polite"/);
    for (const call of [/saved\('Saved\. ' \+ \(\{/, /saved\(result \? 'Saved\. Students can reveal/,
      /saved\(closing \? 'Quiz closed/, /saved\('Saved\. "' \+ title\.value/]) {
      expect(dash).toMatch(call);
    }
  });

  it('edits an assignment in place, in the class time zone', () => {
    expect(dash).toMatch(/function toggleEditor\(item, assignment, button\)/);
    expect(dash).toMatch(/CORE\.endOfDayIn\(due\.value, classTimezone\(\)\)/);
    expect(dash).toMatch(/updateAssignment\(classId, assignment\.id, \{\s*title: title\.value,/);
  });

  it('reads only quiz submissions for quiz results', () => {
    const store = read('assets/js/classroom-store.js');
    expect(store).toMatch(/export async function readQuizAttempts/);
    expect(store).toMatch(/where\('type', '==', 'quiz\.submitted'\)/);
    expect(dash).toMatch(/async function toggleQuizResults/);
  });

  it('has a guide whose links all land somewhere', () => {
    const targets = [...html.matchAll(/<a href="#([a-z-]+)">/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThanOrEqual(4);
    for (const id of targets) expect(html).toContain(`id="${id}"`);
  });

  it('remembers the guide folded without needing storage to work', () => {
    expect(dash).toMatch(/try \{ if \(localStorage\.getItem\(GUIDE_KEY\) === '1'\) guide\.open = false; \} catch \(e\) \{\}/);
  });
});
