import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

/* The unit lock, which used to be a banner over a fully working lesson.

   lesson-progress.js called it a "soft lock" in its own comment: the notice
   was painted, and every exercise underneath it still ran, still ticked, and
   still rolled the unit up. firestore.rules never looked at an event's unit at
   all, so the write that made it count was accepted too. Between them a class's
   lock mode was a suggestion.

   Then the lock became real but the lesson stayed on the page: a banner over
   readable content, saying the exercises would not count. That is what these
   tests were written against, and it is what has now changed. A locked unit
   shows a lock screen and no lesson -- the lesson body is taken out of the
   document, not hidden, because a student can turn a stylesheet off.

   The gating tests below are unchanged in what they assert: nothing ticks,
   nothing rolls up. Two of them reach the guard by a different route now,
   because the control they used to click is no longer on the page to click --
   which is the point.

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

/* A lesson page shaped like a real one, because what the lock screen keeps and
   what it takes away is now a question about this structure. The sidebar and
   the title say which lesson this is; .lesson-overview and .lesson-content are
   the lesson itself. */
const MARKUP = `
  <main>
    <section class="section">
      <div class="container layout-course">
        <aside class="course-sidebar">
          <nav><ul><li><a href="/units/unit-2/understanding-control-flow.html">1. Control flow</a></li></ul></nav>
        </aside>
        <section class="course-main">
          <nav aria-label="Breadcrumb"><span class="current">Control flow</span></nav>
          <div class="eyebrow">Unit 2 &bull; Lesson 1</div>
          <h1 class="lesson-title">Control flow</h1>
          <div class="lesson-overview">
            <p class="lesson-summary">Loops repeat a block of code.</p>
          </div>
          <div class="lesson-content">
            <div class="content-section">
              <p class="lesson-prose">A while loop runs until its condition stops being true.</p>
            </div>
            <div class="exercise-item" data-exercise-id="ex-1">
              <p class="exercise-prompt">Why?</p>
              <textarea class="code-editor-small" data-editor-id="editor-1"></textarea>
              <textarea class="reflection-input" id="reflect-1"></textarea>
              <button type="button" class="btn btn-primary btn-save submit-btn">Save</button>
            </div>
            <button type="button" class="btn-run">Run</button>
            <button type="button" class="btn-check">Check</button>
          </div>
          <div class="lesson-nav"><a href="/units/unit-2/next.html">Next</a></div>
        </section>
      </div>
    </section>
  </main>`;

function boot() {
  history.pushState({}, '', LESSON);
  document.body.innerHTML = MARKUP;
  // The real page's Run button calls this; lesson-progress.js wraps it, and the
  // wrapper is the DOM-free way into markItem().
  window.runEditorCode = function () { return Promise.resolve(); };
  delete window.checkExercise;
  new Function(SRC).call(window);
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

// Everything inside the lesson column that is the lesson rather than its name.
function lessonBody() {
  return document.querySelectorAll('.lesson-overview, .lesson-content, .lesson-nav, .exercise-item, .reflection-input, .lesson-prose');
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// class-policy.js announces this once it has read the class. null is the
// answer for a guest, for an offline page and for a learner in no class.
function policyArrives(value) {
  document.dispatchEvent(new CustomEvent('pypath:policy', { detail: { policy: value } }));
}

// roles.js reads the role out of sessionStorage, so this is how a page comes up
// as a teacher without a Firestore round trip.
function signedInAsTeacher() {
  sessionStorage.setItem(window.PyPathRoles.SESSION_KEY, 'teacher');
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
  it('cannot tick anything off the lesson', async () => {
    // The Save button this used to click is no longer on the page -- the lock
    // screen took the lesson with it -- so the guard is reached the way
    // anything left over would reach it: through the wrapped global the Run
    // button calls. The assertion is the one it always was.
    boot();
    policyArrives(LOCKED);
    await window.runEditorCode('editor-1');
    await settle();
    // Not "ticked but not counted" -- nothing is recorded at all, because a
    // half-finished lesson on a unit that was never open is not a fact worth
    // storing either.
    expect(lessonRecord()).toBe(null);
  });

  it('cannot submit an answer to it either', () => {
    // Same guard, reached through the reflection path. The box is put back on
    // the page by hand, standing in for any control that could still reach
    // markItem() once the lesson column is gone.
    boot();
    policyArrives(LOCKED);
    const box = document.createElement('textarea');
    box.className = 'reflection-input';
    box.id = 'reflect-1';
    box.value = 'A loop repeats a block of code until its condition stops being true.';
    document.body.appendChild(box);
    box.dispatchEvent(new Event('change', { bubbles: true }));
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

  it('gets a lock screen saying why, and what they can do now', () => {
    boot();
    policyArrives(LOCKED);
    const screen = document.querySelector('.unit-lock-screen');
    expect(screen).not.toBe(null);
    expect(screen.getAttribute('data-lock-variant')).toBe('teacher');
    expect(screen.getAttribute('data-lesson-hidden')).toBe('true');
    expect(screen.textContent).toMatch(/Your teacher chooses which units are open/);
    // The way out: what is open to them, and their own record.
    const hrefs = Array.from(screen.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/curriculum.html');
    expect(hrefs).toContain('/progress.html');
  });

  it('no longer says the lesson is readable, because it is not', () => {
    boot();
    policyArrives(LOCKED);
    const screen = document.querySelector('.unit-lock-screen');
    expect(screen.textContent).not.toMatch(/read the lesson/i);
    expect(screen.textContent).not.toMatch(/exercises are turned off/);
    expect(SRC).not.toMatch(/exercises are turned off/);
  });

  it('cannot read the lesson: it is absent from the document, not hidden', () => {
    // Absent rather than styled away, because a student who turns CSS off has
    // undone anything weaker than this.
    boot();
    policyArrives(LOCKED);
    expect(lessonBody().length).toBe(0);
    expect(document.querySelector('.exercise-prompt')).toBe(null);
    expect(document.body.textContent).not.toMatch(/while loop runs until/);
    expect(document.body.textContent).not.toMatch(/Loops repeat a block/);
    expect(document.body.innerHTML).not.toMatch(/data-exercise-id/);
  });

  it('still knows which lesson and unit it is', () => {
    // The title is not the content. A student is allowed to know the name of
    // the thing they cannot open yet -- the unit lists say as much already.
    boot();
    policyArrives(LOCKED);
    expect(document.querySelector('.lesson-title').textContent).toBe('Control flow');
    expect(document.querySelector('nav[aria-label="Breadcrumb"]')).not.toBe(null);
    expect(document.querySelector('.course-sidebar a')).not.toBe(null);
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
    expect(document.querySelector('.lesson-content')).not.toBe(null);
    expect(runButtons().length).toBeGreaterThan(0);
    runButtons().forEach((btn) => expect(btn.disabled).toBe(false));
  });

  it('gets the whole lesson back when the unit opens mid-session', () => {
    // Stowed rather than destroyed, so a teacher ticking the unit while the
    // student has the page open does not need a reload to make it work.
    boot();
    policyArrives(LOCKED);
    expect(document.querySelector('.btn-run')).toBe(null);
    policyArrives(OPEN_BY_MODE);
    expect(document.querySelector('.unit-lock-screen')).toBe(null);
    expect(document.querySelector('.lesson-content')).not.toBe(null);
    expect(document.querySelector('.exercise-prompt').textContent).toBe('Why?');
    expect(document.querySelector('.btn-run').disabled).toBe(false);
    expect(document.querySelector('.btn-run').hasAttribute('title')).toBe(false);
  });

  it('puts it back in its own place, not in a heap at the bottom', () => {
    boot();
    policyArrives(LOCKED);
    policyArrives(OPEN_BY_MODE);
    const kids = Array.from(document.querySelector('.course-main').children)
      .map((el) => el.className.split(' ')[0]);
    expect(kids).toEqual(['', 'eyebrow', 'lesson-title', 'lesson-progress-chip',
      'lesson-overview', 'lesson-content', 'lesson-nav']);
  });
});

describe('a learner in no class is untouched', () => {
  it('follows the sequential chain and nothing else', () => {
    // null policy is the guest, the offline page, the denied read and the
    // learner with no teacher. Unit 2 with unit 1 unfinished is shut by the
    // chain that existed before any of this, not by a class.
    boot();
    policyArrives(null);
    expect(document.querySelector('.btn-run')).toBe(null);
    expect(document.querySelector('.unit-lock-screen').getAttribute('data-lock-variant'))
      .toBe('sequential');
  });

  it('works normally once they have earned the unit', () => {
    window.ProgressStore.setCompletedUnits([1]);
    boot();
    policyArrives(null);
    expect(document.querySelector('.btn-run').disabled).toBe(false);
    expect(document.querySelector('.unit-lock-screen')).toBe(null);
    document.querySelector('.reflection-input').value =
      'A loop repeats a block of code until its condition stops being true.';
    saveReflection();
    expect(lessonRecord().done).toContain('reflect-1');
  });
});

describe('a teacher previewing their own class\'s curriculum', () => {
  it('sees the whole lesson on a unit that is shut to their students', () => {
    // Locking a teacher out of the curriculum they are choosing units from
    // would make the setting unusable by the person who sets it.
    signedInAsTeacher();
    boot();
    policyArrives(LOCKED);
    expect(document.querySelector('.unit-lock-screen')).toBe(null);
    expect(document.querySelector('.lesson-content')).not.toBe(null);
    expect(document.querySelector('.exercise-prompt').textContent).toBe('Why?');
    expect(document.querySelector('.teacher-view-note')).not.toBe(null);
  });

  it('gets the lesson back if the role resolves after the page has locked it', () => {
    // role-nav.js answers after this file has already painted once, so the
    // first paint of a teacher's page is the student's answer.
    boot();
    policyArrives(LOCKED);
    expect(document.querySelector('.lesson-content')).toBe(null);
    signedInAsTeacher();
    document.dispatchEvent(new Event('pypath:role'));
    expect(document.querySelector('.unit-lock-screen')).toBe(null);
    expect(document.querySelector('.lesson-content')).not.toBe(null);
  });
});

describe('the blurred backdrop is a shape, not the lesson', () => {
  /* The thing this design invites, and must not become. It LOOKS like blurred
     lesson text, which is the point visually and the trap structurally: the
     obvious "improvement" later is to blur the real lesson behind the card
     instead of drawing an empty shape. That is the behaviour the rework this
     belongs to removed -- a student turns CSS off and reads it. These pin the
     backdrop as decorative and empty so that change cannot land quietly. */
  it('carries no text of any kind', () => {
    boot();
    policyArrives(LOCKED);
    const ghost = document.querySelector('.unit-lock-screen__ghost');
    expect(ghost).not.toBe(null);
    expect(ghost.textContent.trim()).toBe('');
  });

  it('holds no lesson nodes: the bars are empty elements', () => {
    boot();
    policyArrives(LOCKED);
    const ghost = document.querySelector('.unit-lock-screen__ghost');
    expect(ghost.querySelectorAll('[data-exercise-id], [data-editor-id]').length).toBe(0);
    Array.from(ghost.querySelectorAll('*')).forEach((node) => {
      expect(node.childElementCount === 0 || node.className.includes('ghost-page')).toBe(true);
      if (node.childElementCount === 0) expect(node.textContent).toBe('');
    });
  });

  it('is hidden from assistive tech, being decoration', () => {
    boot();
    policyArrives(LOCKED);
    expect(document.querySelector('.unit-lock-screen__ghost').getAttribute('aria-hidden'))
      .toBe('true');
  });

  it('is not drawn where there is no lesson to stand in for', () => {
    // On a unit page the card sits above a real list of lessons. A decorative
    // blur over content the student can actually use would read as that
    // content being obscured.
    boot();
    policyArrives(OPEN_BY_MODE);
    expect(document.querySelector('.unit-lock-screen__ghost')).toBe(null);
  });

  it('leads with a lock, and says which unit before it says anything else', () => {
    boot();
    policyArrives(LOCKED);
    const card = document.querySelector('.unit-lock-screen__card');
    expect(card.querySelector('.unit-lock-screen__badge svg')).not.toBe(null);
    expect(card.querySelector('.unit-lock-screen__eyebrow').textContent)
      .toMatch(/Locked .* Unit 2/);
  });
});

describe('what the lock screen does not claim', () => {
  it('says in the code what tier of protection this is', () => {
    // The same disclosure maxTestAttempts and showSolutions make about
    // themselves, in the same voice, because it is the same kind of gate.
    const note = SRC.slice(SRC.indexOf('---------- the lock screen ----------'),
      SRC.indexOf('var LESSON_FURNITURE'));
    expect(note).toMatch(/static file that ships with the site/);
    expect(note).toMatch(/does not\s+\*?\s*put the file out of reach/);
    expect(note).toMatch(/same\s+tier as every other gate/);
  });

  it('tells the teacher the same thing where they choose the setting', () => {
    const html = fs.readFileSync('classroom.html', 'utf8');
    const core = fs.readFileSync('assets/js/classroom-core.js', 'utf8');
    const section = html.slice(html.indexOf('<section class="cr-access"'),
      html.indexOf('<section class="cr-solutions"'));
    expect(section.replace(/\s+/g, ' ')).toMatch(/The lesson is not shown to them/);
    expect(section.replace(/\s+/g, ' ')).toMatch(/does not put the material beyond reach/);
    expect(core).toMatch(/the lesson itself is not shown/);
  });

  it('never says it to the student, who is only told they cannot open it', () => {
    boot();
    policyArrives(LOCKED);
    const screen = document.querySelector('.unit-lock-screen');
    expect(screen.textContent).not.toMatch(/browser|source|static|cryptograph/i);
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
