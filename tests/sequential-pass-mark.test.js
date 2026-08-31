import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

/* "In order" mode gates the next unit on a score, not on having sat the test.
 *
 * WORTH READING BEFORE CHANGING ANY OF THIS. The 70 threshold was not added
 * here -- it was already the rule, through a chain that is easy to misread from
 * the copy alone. resolveUnlocked() asks whether the previous unit is in
 * completedUnits; completedUnits is only ever written by rollUpUnitNumber();
 * and that requires unitFinished(), which is every lesson passed AND
 * unitTestPassed(), which is a score of 70 or higher. So the gate has always
 * been the mark rather than the attempt.
 *
 * What was not true is the literal claim. unitTestPassed() used to accept a
 * stored `passed: true` flag whatever the score, so a record carrying that flag
 * with a best of 30 unlocked the next unit. These tests pin the score as the
 * authority and the flag as no longer consulted.
 *
 * Everything here is browser-side and that is the honest limit: firestore.rules
 * cannot check a sequential chain, because the only record of finishing a unit
 * is one the learner's own browser wrote. "By hand" is the mode with a real
 * server-side lock, and its tests are in unit-lock-hard.test.js and
 * tests/rules/unit-lock-rules.test.js.
 */

const SRC = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');
const UNIT_1 = '/units/unit-1/what-is-python.html';
const UNIT_2 = '/units/unit-2/understanding-control-flow.html';

beforeAll(() => {
  ['storage-keys', 'progress-store', 'roles', 'curriculum', 'classroom-policy',
    'unit-progress'].forEach((name) => {
    new Function(fs.readFileSync(`assets/js/${name}.js`, 'utf8')).call(window);
  });
});

/* A lesson page carrying the two things the lock has to reach: a reflection
   that would tick the lesson off, and the buttons that would do the work. */
const MARKUP = `
  <main>
    <h1 class="lesson-title">A lesson</h1>
    <div class="exercise-item">
      <p class="exercise-prompt">Why?</p>
      <textarea class="reflection-input" id="reflect-1"></textarea>
      <button type="button" class="btn btn-primary submit-btn">Save</button>
    </div>
    <button type="button" class="btn-run">Run</button>
    <button type="button" class="btn-check">Check</button>
  </main>`;

function boot(path) {
  history.pushState({}, '', path);
  document.body.innerHTML = MARKUP;
  new Function(SRC).call(window);
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

function policyArrives(value) {
  document.dispatchEvent(new CustomEvent('pypath:policy', { detail: { policy: value } }));
}

/* Every lesson in unit 1 finished, and a test record at `score`. This is the
   learner who has done all the work and is waiting on the mark. */
function unitOneDone(score, extra) {
  const map = {};
  window.PyPathCurriculum.lessonsIn(1).forEach((p) => {
    map[p] = { done: ['x'], passed: true };
  });
  localStorage.setItem('pypath-progress-lessons', JSON.stringify(map));
  if (score !== null) {
    localStorage.setItem('pypath-unit-tests', JSON.stringify({
      1: Object.assign(
        { best: score, passed: score >= 70, attempts: 1, lastAt: 1, last: null },
        extra || {}
      ),
    }));
  }
}

function rollUpUnitOne() {
  return window.PyPathLessonProgress.rollUpUnitNumber(1);
}

function completed() {
  return window.ProgressStore.getCompletedUnits();
}

function unitTwoOpen(policy) {
  return window.PyPathPolicy.resolveUnlocked(2, policy || null, completed(), false);
}

function buttons() {
  return Array.from(document.querySelectorAll('.btn-run, .btn-check, .submit-btn'));
}

// A learner in no class. class-policy.js announces null for exactly this, and
// null is the sequential chain.
const SELF_STUDY = null;
const IN_ORDER = { mode: 'sequential', manualUnlocks: [], assignmentUnlocks: [] };
const BY_HAND = { mode: 'manual', manualUnlocks: [2], assignmentUnlocks: [] };
const OPEN = { mode: 'free', manualUnlocks: [], assignmentUnlocks: [] };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('a score below the pass mark does not open the next unit', () => {
  it('holds unit 2 shut at 69, one mark short', () => {
    unitOneDone(69);
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(false);
    expect(completed()).not.toContain(1);
    expect(unitTwoOpen(IN_ORDER)).toBe(false);
  });

  it('holds it shut when every lesson is done but the test was never sat', () => {
    unitOneDone(null);
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(false);
    expect(unitTwoOpen(IN_ORDER)).toBe(false);
  });

  it('is not fooled by a stored passed flag under the mark', () => {
    /* The one way "70 or higher" was not literally true. `passed` is derived
       from `best` and `best` only ratchets up, so this record cannot come from
       sitting the test -- only from a hand-edited store or a bad merge. */
    unitOneDone(30, { passed: true });
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(false);
    expect(completed()).not.toContain(1);
    expect(unitTwoOpen(IN_ORDER)).toBe(false);
  });
});

describe('clearing the mark opens the next unit', () => {
  it('opens unit 2 at exactly 70', () => {
    unitOneDone(70);
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(true);
    expect(completed()).toContain(1);
    expect(unitTwoOpen(IN_ORDER)).toBe(true);
  });

  it('opens it on a retake that clears the mark, not only a first attempt', () => {
    // best ratchets upward across sittings, so what is read here is the best
    // score so far rather than the most recent one.
    unitOneDone(45);
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(false);

    localStorage.setItem('pypath-unit-tests', JSON.stringify({
      1: { best: 82, passed: true, attempts: 3, lastAt: 2, last: { score: 82 } },
    }));
    expect(rollUpUnitOne()).toBe(true);
    expect(unitTwoOpen(IN_ORDER)).toBe(true);
  });

  it('does not take back a unit already earned if a later record looks worse', () => {
    // The ratchet the rest of this codebase keeps: completedUnits only adds.
    unitOneDone(88);
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(true);
    localStorage.setItem('pypath-unit-tests', JSON.stringify({
      1: { best: 10, passed: false, attempts: 4, lastAt: 3, last: null },
    }));
    expect(completed()).toContain(1);
    expect(unitTwoOpen(IN_ORDER)).toBe(true);
  });
});

describe('a self-study learner is held to the same rule', () => {
  /* Sequential is the site-wide default for anyone not in a class with another
     mode set, so this is not a classroom-only feature the way the retake cap
     and the by-hand lock are. A null policy is the guest, the offline page, the
     denied read and the learner with no teacher. */
  it('is blocked below the mark with no class at all', () => {
    unitOneDone(60);
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(false);
    expect(unitTwoOpen(SELF_STUDY)).toBe(false);
  });

  it('is let through at the mark with no class at all', () => {
    unitOneDone(70);
    boot(UNIT_1);
    expect(rollUpUnitOne()).toBe(true);
    expect(unitTwoOpen(SELF_STUDY)).toBe(true);
  });
});

describe('reading ahead is still allowed; only credit is gated', () => {
  it('leaves the locked unit readable', () => {
    unitOneDone(65);
    boot(UNIT_2);
    policyArrives(IN_ORDER);
    expect(document.querySelector('.exercise-prompt').textContent).toBe('Why?');
    expect(document.querySelector('.reflection-input')).not.toBe(null);
  });

  it('turns off the controls that would count', () => {
    unitOneDone(65);
    boot(UNIT_2);
    policyArrives(IN_ORDER);
    buttons().forEach((btn) => expect(btn.disabled, btn.className).toBe(true));
  });

  it('records nothing when a locked lesson is worked through anyway', () => {
    unitOneDone(65);
    boot(UNIT_2);
    policyArrives(IN_ORDER);
    document.querySelector('.reflection-input').value =
      'A loop repeats a block until its condition stops being true.';
    document.querySelector('.submit-btn').click();
    const raw = localStorage.getItem('pypath-progress-lessons');
    expect(JSON.parse(raw)[UNIT_2]).toBe(undefined);
  });

  it('gives the controls back the moment the mark is cleared', () => {
    unitOneDone(65);
    boot(UNIT_2);
    policyArrives(IN_ORDER);
    expect(document.querySelector('.btn-run').disabled).toBe(true);

    localStorage.setItem('pypath-unit-tests', JSON.stringify({
      1: { best: 74, passed: true, attempts: 2, lastAt: 2, last: null },
    }));
    window.PyPathLessonProgress.rollUpUnitNumber(1);
    policyArrives(IN_ORDER);
    expect(document.querySelector('.btn-run').disabled).toBe(false);
  });
});

describe('the notice says the number rather than just "pass"', () => {
  it('names the mark a learner has to clear', () => {
    unitOneDone(65);
    boot(UNIT_2);
    policyArrives(IN_ORDER);
    const notice = document.querySelector('.unit-locked-notice');
    expect(notice.getAttribute('data-lock-variant')).toBe('sequential');
    const text = notice.textContent.replace(/\s+/g, ' ');
    expect(text).toMatch(/score 70 or higher on the Unit 1 test/);
    // The old wording, which left a learner to guess what "pass" meant.
    expect(text).not.toMatch(/and pass the Unit 1 test/);
  });

  it('agrees with the number the test page prints back', () => {
    // Two places tell a learner the bar; they must not disagree about it.
    new Function(fs.readFileSync('assets/js/unit-test.js', 'utf8')).call(window);
    expect(window.PyPathLessonProgress.UNIT_TEST_PASS_MARK)
      .toBe(window.PyPathUnitTest.PASS_MARK);
  });
});

describe('the other two modes are untouched', () => {
  it('by hand ignores the score entirely: the list is the whole truth', () => {
    // Unit 2 is on the teacher's list, so it is open however unit 1 went.
    unitOneDone(12);
    boot(UNIT_1);
    expect(unitTwoOpen(BY_HAND)).toBe(true);
  });

  it('by hand still shuts a unit the teacher did not tick, whatever the score', () => {
    unitOneDone(100);
    boot(UNIT_1);
    rollUpUnitOne();
    const shut = { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [] };
    expect(window.PyPathPolicy.resolveUnlocked(3, shut, completed(), false)).toBe(false);
  });

  it('open mode is free roam, at any score', () => {
    unitOneDone(5);
    boot(UNIT_1);
    expect(unitTwoOpen(OPEN)).toBe(true);
    expect(window.PyPathPolicy.resolveUnlocked(9, OPEN, completed(), false)).toBe(true);
  });

  it('a teacher previewing is unaffected in every mode', () => {
    [SELF_STUDY, IN_ORDER, BY_HAND, OPEN].forEach((policy) => {
      expect(window.PyPathPolicy.resolveUnlocked(7, policy, [], true)).toBe(true);
    });
  });
});

describe('where this is enforced, written down', () => {
  it('says in the code that the sequential chain is browser-side only', () => {
    expect(SRC).toMatch(/browser-side rule/);
    expect(SRC).toMatch(/firestore\.rules cannot check it/);
  });

  it('says why dropping the stored flag takes nothing away', () => {
    expect(SRC).toMatch(/completedUnits is a ratchet/);
  });
});
