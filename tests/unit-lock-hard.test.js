import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

/* The unit lock, which used to be a banner over a fully working lesson.

   lesson-progress.js called it a "soft lock" in its own comment: the notice
   was painted, and every exercise underneath it still ran, still ticked, and
   still rolled the unit up. firestore.rules never looked at an event's unit at
   all, so the write that made it count was accepted too. Between them a class's
   lock mode was a suggestion.

   These tests are about the client half. The rules half is in
   tests/rules/unit-lock-rules.test.js, against the emulator, because a claim
   about what the server refuses is not worth making against a regex. */

const SRC = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
const read = fs.readFileSync('assets/js/class-policy.js', 'utf8');
const page = fs.readFileSync('assets/js/unit-test-page.js', 'utf8');

const LESSON = '/units/unit-2/understanding-control-flow.html';

function loadDeps() {
  ['storage-keys', 'progress-store', 'roles', 'curriculum', 'classroom-policy'].forEach((name) => {
    new Function(fs.readFileSync(`assets/js/${name}.js`, 'utf8')).call(window);
  });
}

/* A lesson page with one of each thing the lock has to reach: a reflection
   that would tick the lesson off, and the two buttons that would do work. */
const MARKUP = `
  <main>
    <h1 class="lesson-title">Control flow</h1>
    <div class="exercise-item">
      <p class="exercise-prompt">Why?</p>
      <textarea class="reflection-input" id="reflect-1"></textarea>
      <button type="button" class="btn btn-primary btn-save submit-btn">Save</button>
    </div>
    <button type="button" class="btn-run">Run</button>
    <button type="button" class="btn-check">Check</button>
  </main>`;

function boot() {
  history.pushState({}, '', LESSON);
  document.body.innerHTML = MARKUP;
  new Function(SRC).call(window);
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

// class-policy.js announces this once it has read the class. null is the
// answer for a guest, for an offline page and for a learner in no class.
function policyArrives(value) {
  document.dispatchEvent(new CustomEvent('pypath:policy', { detail: { policy: value } }));
}

const LOCKED = { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [] };
const OPEN_BY_MODE = { mode: 'free', manualUnlocks: [], assignmentUnlocks: [] };
const OPEN_BY_ASSIGNMENT = { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [2] };

function saveReflection() {
  document.querySelector('.submit-btn').click();
}

function lessonRecord() {
  const raw = localStorage.getItem('pypath-progress-lessons');
  return raw ? (JSON.parse(raw)[LESSON] || null) : null;
}

function runButtons() {
  return Array.from(document.querySelectorAll('.btn-run, .btn-check, .submit-btn'));
}

beforeAll(() => { loadDeps(); });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('a classroom student on a locked unit', () => {
  it('cannot tick anything off the lesson', () => {
    boot();
    policyArrives(LOCKED);
    document.querySelector('.reflection-input').value =
      'A loop repeats a block of code until its condition stops being true.';
    saveReflection();
    // Not "ticked but not counted" -- nothing is recorded at all, because a
    // half-finished lesson on a unit that was never open is not a fact worth
    // storing either.
    expect(lessonRecord()).toBe(null);
  });

  it('is not offered the controls that would do the work', () => {
    boot();
    policyArrives(LOCKED);
    runButtons().forEach((btn) => {
      expect(btn.disabled, btn.className).toBe(true);
      expect(btn.getAttribute('title')).toMatch(/not open for your class/);
    });
  });

  it('still gets the notice saying why', () => {
    boot();
    policyArrives(LOCKED);
    const notice = document.querySelector('.unit-locked-notice');
    expect(notice).not.toBe(null);
    expect(notice.getAttribute('data-lock-variant')).toBe('teacher');
    expect(notice.textContent).toMatch(/exercises are turned off/);
  });

  it('can still read the lesson', () => {
    // Reading ahead was never the thing anybody wanted to stop, and taking the
    // page away would be a different feature.
    boot();
    policyArrives(LOCKED);
    expect(document.querySelector('.reflection-input')).not.toBe(null);
    expect(document.querySelector('.exercise-prompt').textContent).toBe('Why?');
  });

  it('does not complete the unit even if the roll-up is asked directly', () => {
    // unit-test-page.js calls rollUpUnitNumber from a URL that belongs to no
    // unit, so this is reachable without ever loading a locked lesson.
    boot();
    policyArrives(LOCKED);
    expect(window.PyPathLessonProgress.rollUpUnitNumber(2)).toBe(false);
    expect(window.ProgressStore.getCompletedUnits()).not.toContain(2);
  });
});

describe('a classroom student whose teacher has opened the unit', () => {
  it('is let through when the mode opens it', () => {
    boot();
    policyArrives(OPEN_BY_MODE);
    document.querySelector('.reflection-input').value =
      'A loop repeats a block of code until its condition stops being true.';
    saveReflection();
    expect(lessonRecord()).not.toBe(null);
    expect(lessonRecord().done).toContain('reflect-1');
  });

  it('is let through when work has been set on it', () => {
    // The guarantee the unit access panel prints in as many words: a unit you
    // assign is reachable whatever the mode says.
    boot();
    policyArrives(OPEN_BY_ASSIGNMENT);
    runButtons().forEach((btn) => expect(btn.disabled).toBe(false));
  });

  it('gets its buttons back when the unit opens mid-session', () => {
    boot();
    policyArrives(LOCKED);
    expect(document.querySelector('.btn-run').disabled).toBe(true);
    policyArrives(OPEN_BY_MODE);
    expect(document.querySelector('.btn-run').disabled).toBe(false);
    expect(document.querySelector('.btn-run').hasAttribute('title')).toBe(false);
  });
});

describe('a learner in no class is untouched', () => {
  it('follows the sequential chain and nothing else', () => {
    // null policy is the guest, the offline page, the denied read and the
    // learner with no teacher. Unit 2 with unit 1 unfinished is shut by the
    // chain that existed before any of this, not by a class.
    boot();
    policyArrives(null);
    expect(document.querySelector('.btn-run').disabled).toBe(true);
    expect(document.querySelector('.unit-locked-notice').getAttribute('data-lock-variant'))
      .toBe('sequential');
  });

  it('works normally once they have earned the unit', () => {
    window.ProgressStore.setCompletedUnits([1]);
    boot();
    policyArrives(null);
    expect(document.querySelector('.btn-run').disabled).toBe(false);
    expect(document.querySelector('.unit-locked-notice')).toBe(null);
    document.querySelector('.reflection-input').value =
      'A loop repeats a block of code until its condition stops being true.';
    saveReflection();
    expect(lessonRecord().done).toContain('reflect-1');
  });
});

describe('the end-of-unit test refuses a locked unit too', () => {
  it('checks the lock before it checks the retake cap', () => {
    // Telling somebody how many attempts they have left at a test they cannot
    // reach is the wrong sentence, so the order is part of the behaviour.
    const fn = page.slice(page.indexOf('function blockedReason'),
      page.indexOf('function paintRetakeLine'));
    expect(fn.indexOf('resolveUnlocked')).toBeLessThan(fn.indexOf('attemptsLeft'));
  });

  it('names the teacher when the teacher shut it, and the chain when it did', () => {
    const fn = page.slice(page.indexOf('function blockedReason'),
      page.indexOf('function paintRetakeLine'));
    expect(fn).toMatch(/is not open for your class yet/);
    expect(fn).toMatch(/is not unlocked yet/);
  });
});

describe('the lock is no longer only a banner', () => {
  it('the file no longer calls itself a soft lock', () => {
    expect(SRC).not.toMatch(/Soft lock/i);
  });

  it('the roll-up refuses a locked unit', () => {
    const fn = SRC.slice(SRC.indexOf('function rollUpUnitNumber'), SRC.indexOf('function rollUpUnit()'));
    expect(fn).toMatch(/isUnitUnlocked\(target/);
  });

  it('the events rule consults the unit, not just the shape', () => {
    expect(rules).toMatch(/&& unitAllowed\(\)/);
    expect(rules).toMatch(/function unitIsOpen\(unit\)/);
  });

  it('the rule gates the three types that count for credit', () => {
    const fn = rules.slice(rules.indexOf('function countsForCredit'), rules.indexOf('function unitAllowed'));
    ['test.submitted', 'unit.completed', 'code.tests_passed'].forEach((t) => {
      expect(fn).toContain(t);
    });
  });

  it('the rule leaves the record of what happened alone', () => {
    // Refusing lesson.opened on a locked unit would make the log lie about a
    // thing the student really did.
    const fn = rules.slice(rules.indexOf('function countsForCredit'), rules.indexOf('function unitAllowed'));
    ['lesson.opened', 'code.run', 'code.error'].forEach((t) => {
      expect(fn).not.toContain(t);
    });
  });
});

describe('client and rules read the same unlock list', () => {
  /* The drift this is guarding against: a rule that re-derives the lock from
     its own idea of what is open will eventually disagree with the page, and
     the student is the one caught in the middle -- doing work that is then
     refused with nothing on screen to say why. */
  it('the assignment unlock is stored, because a rule cannot enumerate one', () => {
    expect(store).toMatch(/export async function refreshAssignmentUnlocks/);
    expect(store).toMatch(/assignmentUnlocks: merged/);
  });

  it('the reader prefers the stored list to deriving its own', () => {
    expect(read).toMatch(/if \(Array\.isArray\(data\.assignmentUnlocks\)\) return data\.assignmentUnlocks;/);
  });

  it('an unmigrated class is permitted rather than silently refused', () => {
    // Both sides fall back together: the rule permits, the reader derives.
    expect(rules).toMatch(/!\('assignmentUnlocks' in c\)/);
    expect(read).toMatch(/POLICY\.assignmentUnlocks\(live, Date\.now\(\)\)/);
  });

  it('a new assignment opens its units before it exists', () => {
    // Reversed, there is a window in which a student meets a unit that is
    // assigned to them and locked against them.
    const fn = store.slice(store.indexOf('export async function createAssignment'),
      store.indexOf('export async function readAssignments'));
    expect(fn.indexOf('widenUnlocks')).toBeLessThan(fn.indexOf('await setDoc(ref'));
  });

  it('a deleted assignment re-locks after the delete, not before', () => {
    const fn = store.slice(store.indexOf('export async function deleteAssignment'));
    expect(fn.indexOf('deleteDoc')).toBeLessThan(fn.indexOf('refreshAssignmentUnlocks'));
  });
});

describe('what the rules do not claim to enforce', () => {
  it('says sequential mode is not enforceable here, and why', () => {
    // Completion is attested by the student's own browser, so a rule that
    // consulted it would be asking the student for permission.
    const note = rules.slice(rules.indexOf('THE UNIT LOCK'), rules.indexOf('function unitIsOpen'));
    expect(note).toMatch(/NOT enforced here/);
    expect(note).toMatch(/no\s+\*?\s*Cloud Functions/);
    expect(note).toMatch(/By hand \('manual'\) is enforced/);
  });
});
