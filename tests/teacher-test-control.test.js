import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* Teacher control over unit tests and quizzes, and the quiz sign-in bug.
 *
 * Three things a teacher asked for, in their words:
 *   1. "Is there a way for me to view the specific test questions my students
 *      received?"        -> each sitting's paper is kept in the test record.
 *   2. "Restrict access to unit tests so they are only available when I
 *      manually enable them"      -> testGate / openTests on the class.
 *   3. Students who were logged in were told to log in to sit a quiz.
 *                                 -> quiz-page.js waits for auth to settle.
 * Plus the general ask, more control: a quiz can be closed and reopened.
 *
 * The server half (firestore.rules) is in tests/rules/test-gate-rules.test.js;
 * this file is the pure rules and the wiring that must not regress. */

let P;
let UT;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/unit-test.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/unit-test-page.js', 'utf8')).call(window);
  P = window.PyPathPolicy;
  UT = window.PyPathUnitTestPage;
});

const read = (p) => fs.readFileSync(p, 'utf8');

describe('a teacher can hold tests shut until they open them', () => {
  const gated = (open) => ({ mode: 'free', manualUnlocks: [], testGate: 'manual', openTests: open });

  it('leaves every test open by default', () => {
    // Every class that existed before the setting, every learner in no class,
    // and every failed policy read.
    expect(P.testOpen(1, null, false)).toBe(true);
    expect(P.testOpen(4, { mode: 'free', manualUnlocks: [] }, false)).toBe(true);
    expect(P.testOpen(4, { testGate: 'unit' }, false)).toBe(true);
    expect(P.testOpen(4, { testGate: 'something-else' }, false)).toBe(true);
  });

  it('opens only the ticked tests, and Unit 1 is not exempt', () => {
    expect(P.testOpen(1, gated([]), false)).toBe(false);
    expect(P.testOpen(1, gated([1]), false)).toBe(true);
    expect(P.testOpen(3, gated([1, 2]), false)).toBe(false);
    // Firestore and a checkbox both hand numbers back as strings.
    expect(P.testOpen(2, gated(['2']), false)).toBe(true);
  });

  it('never stops a teacher looking at the paper', () => {
    expect(P.testOpen(5, gated([]), true)).toBe(true);
  });

  it('reads the setting off the class document', () => {
    const src = read('assets/js/class-policy.js');
    expect(src).toMatch(/testGate: POLICY \? POLICY\.normalizeTestGate\(data\.testGate\)/);
    expect(src).toMatch(/openTests: Array\.isArray\(data\.openTests\)/);
  });

  it('is checked by the test page before the retake cap', () => {
    const src = read('assets/js/unit-test-page.js');
    const gate = src.indexOf('POLICY.testOpen(unit, classPolicy, teaching())');
    const cap = src.indexOf('POLICY.attemptsLeft(classPolicy, attemptsUsed(), teaching())');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(cap);
  });

  it('is enforced by the rules on test.submitted', () => {
    const rules = read('firestore.rules');
    expect(rules).toMatch(/function testAllowed\(\)/);
    expect(rules).toMatch(/unitAllowed\(\) && testAllowed\(\) && quizAllowed\(\)/);
    expect(rules).toMatch(/'testGate', 'openTests'\]\);/);
  });

  it('has a control on the dashboard', () => {
    const html = read('classroom.html');
    expect(html).toMatch(/name="cr-test-gate" value="unit"/);
    expect(html).toMatch(/name="cr-test-gate" value="manual"/);
    expect(html).toMatch(/data-cr-test-units/);
  });
});

describe('each sitting keeps the paper it drew', () => {
  const paper = (at, extra) => ({
    at, score: 63,
    mcqIds: ['u1-m01', 'u1-m02', 'u1-m03'],
    answers: [0, null, 3],
    frqId: 'u1-f2', frqCode: 'def greet(name):\n    return name\n',
    frqPassed: 1, frqTotal: 5,
    ...extra,
  });

  it('records the paper alongside the mark', () => {
    const rec = UT.mergeAttempt(null, { score: 63, at: 10, paper: paper(10) });
    expect(rec.papers).toHaveLength(1);
    expect(rec.papers[0].mcqIds).toEqual(['u1-m01', 'u1-m02', 'u1-m03']);
    expect(rec.papers[0].answers).toEqual([0, null, 3]);
    expect(rec.papers[0].frqCode).toMatch(/def greet/);
  });

  it('keeps the most recent few and never touches the best mark', () => {
    let rec = null;
    for (let i = 1; i <= 6; i += 1) {
      rec = UT.mergeAttempt(rec, { score: i === 2 ? 95 : 40, at: i, paper: paper(i, { score: i }) });
    }
    expect(rec.best).toBe(95);
    expect(rec.attempts).toBe(6);
    expect(rec.papers.map((p) => p.at)).toEqual([4, 5, 6]);
    expect(rec.papers).toHaveLength(UT.PAPERS_PER_UNIT);
  });

  it('survives a round trip through normalizeRecords', () => {
    // normalizeRecords runs on every read. If it dropped papers, they would be
    // gone the first time the record was rewritten.
    const rec = UT.mergeAttempt(null, { score: 63, at: 10, paper: paper(10) });
    const back = UT.normalizeRecords(JSON.parse(JSON.stringify({ 1: rec })));
    expect(back['1'].papers).toEqual(rec.papers);
  });

  it('works for a record from before papers existed', () => {
    const old = { best: 80, passed: true, attempts: 2, lastAt: 5, last: { score: 80, at: 5 } };
    expect(UT.normalizeRecords({ 1: old })['1'].papers).toEqual([]);
    const next = UT.mergeAttempt(old, { score: 50, at: 9, paper: paper(9) });
    expect(next.best).toBe(80);
    expect(next.papers).toHaveLength(1);
  });

  it('refuses ids and answers that are not the shape the pools use', () => {
    const p = UT.normalizePaper(paper(1, {
      mcqIds: ['u1-m01', '<script>', 7], answers: [2, 'x'], frqId: '../../etc',
    }));
    expect(p.mcqIds).toEqual(['u1-m01']);
    expect(p.answers).toEqual([2]);
    expect(p.frqId).toBe('');
  });

  it('caps the free response code it keeps', () => {
    const p = UT.normalizePaper(paper(1, { frqCode: 'x'.repeat(UT.FRQ_CODE_MAX + 500) }));
    expect(p.frqCode).toHaveLength(UT.FRQ_CODE_MAX);
  });

  it('keeps the whole record well inside the 100KB mirror cap', () => {
    // Twenty test records (both courses), three full papers each, maximal code.
    const records = {};
    for (const prefix of ['', 'data-']) {
      for (let u = 1; u <= 10; u += 1) {
        let rec = null;
        for (let i = 0; i < 3; i += 1) {
          rec = UT.mergeAttempt(rec, {
            score: 50, at: u * 10 + i,
            paper: paper(u * 10 + i, { frqCode: 'y'.repeat(UT.FRQ_CODE_MAX) }),
          });
        }
        records[prefix + u] = rec;
      }
    }
    const trimmed = UT.trimPapers(records);
    expect(JSON.stringify(trimmed).length).toBeLessThanOrEqual(UT.PAPERS_BUDGET);
    // Marks are never what gets trimmed.
    expect(Object.values(trimmed).every((r) => r.attempts === 3 && r.best === 50)).toBe(true);
    // The oldest papers went first; the newest is still there.
    expect(trimmed['10'].papers.length + trimmed['data-10'].papers.length).toBeGreaterThan(0);
  });

  it('is written by the test page at submit time', () => {
    const src = read('assets/js/unit-test-page.js');
    expect(src).toMatch(/paper: \{[\s\S]*mcqIds: paper\.mcq\.map/);
    expect(src).toMatch(/JSON\.stringify\(trimPapers\(records\)\)/);
  });

  it('is shown to the teacher in the student drill-down', () => {
    expect(read('assets/js/student-detail.js')).toMatch(/async function paintPapers/);
    expect(read('classroom.html')).toMatch(/data-sd-papers/);
  });
});

describe('the quiz page knows a signed-in student is signed in', () => {
  const quiz = read('assets/js/quiz-page.js');
  const auth = read('assets/js/auth.js');

  it('waits for Firebase to answer before deciding who is there', () => {
    // currentUser() is synchronous and null until onAuthStateChanged first
    // fires, which on a fresh load is after this module's boot. That was the
    // "not available until you log in" message logged-in students saw.
    expect(quiz).not.toMatch(/await currentUser\(\)/);
    expect(quiz).toMatch(/const user = await authReady\(\);/);
    expect(auth).toMatch(/export function authReady\(\)/);
  });

  it('settles authReady on the same path that announces pypath:auth', () => {
    const settle = auth.indexOf('settle(next);');
    const announce = auth.indexOf("new CustomEvent('pypath:auth', { detail: { user: next } })");
    expect(settle).toBeGreaterThan(-1);
    expect(settle).toBeLessThan(announce);
  });

  it('judges the unit lock with the normalized policy, not the raw class', () => {
    // The raw class document says lockMode; resolveUnlocked reads mode. Passing
    // the document made every By-hand class look like In order.
    expect(quiz).toMatch(/loadPolicy\(classId, true\)/);
    expect(quiz).not.toMatch(/readClass\(/);
  });
});

describe('a teacher can close and reopen a quiz', () => {
  it('refuses to start a closed quiz', () => {
    expect(read('assets/js/quiz-page.js')).toMatch(/if \(assignment\.closed === true\)/);
  });

  it('is a field the store writes and the rules type and enforce', () => {
    expect(read('assets/js/classroom-store.js')).toMatch(/patch\.closed = changes\.closed === true/);
    const rules = read('firestore.rules');
    expect(rules).toMatch(/request\.resource\.data\.closed is bool/);
    expect(rules).toMatch(/function quizAllowed\(\)/);
  });

  it('has the button on the dashboard and the note on the student list', () => {
    expect(read('assets/js/classroom-dashboard.js')).toMatch(/'Reopen quiz' : 'Close quiz'/);
    expect(read('assets/js/student-work.js')).toMatch(/Your teacher has closed this quiz/);
  });
});

describe('the test page never misses its class settings', () => {
  /* The policy can be announced before unit-test-page.js runs: the page loads
     after the CodeMirror scripts, and the answer can come from Firebase's local
     cache. Measured in a browser: policy at 509ms, the page's script at ~600ms.
     It then ran with no class settings at all. */
  it('class-policy.js leaves the last answer where a late listener can find it', () => {
    expect(read('assets/js/class-policy.js')).toMatch(/if \(POLICY\) POLICY\.announced = \{ policy: value \};/);
  });

  it('the test page catches up instead of waiting for an event that already fired', () => {
    const src = read('assets/js/unit-test-page.js');
    expect(src).toMatch(/var already = window\.PyPathPolicy && window\.PyPathPolicy\.announced;\s*\n\s*if \(already\) classPolicy = already\.policy \|\| null;/);
  });

  it('the test page script really does load after event-sink.js', () => {
    // The ordering that makes the catch-up necessary. If this ever flips, the
    // catch-up is harmless; if it is removed while this holds, the race is back.
    const html = read('unit-test.html');
    expect(html.indexOf('/assets/js/event-sink.js')).toBeLessThan(html.indexOf('/assets/js/unit-test-page.js'));
  });
});
