import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');

// The page half needs the manifest, the store, and the session role. Loading
// each one is idempotent, so a suite that boots more than once is safe.
function loadDeps() {
  ['storage-keys', 'progress-store', 'roles', 'curriculum', 'classroom-policy'].forEach((name) => {
    new Function(fs.readFileSync(`assets/js/${name}.js`, 'utf8')).call(window);
  });
}

// `path` and `unit` are captured when the file runs, so the URL has to be set
// before booting, never after.
function bootAt(pathname, html) {
  history.pushState({}, '', pathname);
  document.body.innerHTML = html;
  new Function(SRC).call(window);
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

// The page coalesces progress repaints to one a frame, because CodeMirror
// writes the editor contents on every keystroke. Tests have to wait a frame.
function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 20);
  });
}

function progressArrived() {
  document.dispatchEvent(
    new CustomEvent('pypath:progress', { detail: { key: 'pypath-progress-lessons' } })
  );
  return nextFrame();
}

function seedLessons(map) {
  localStorage.setItem('pypath-progress-lessons', JSON.stringify(map));
}

beforeAll(() => {
  // The page-wiring half is guarded on a lesson URL, so loading the file in
  // jsdom exercises only the pure rules.
  new Function(fs.readFileSync('assets/js/lesson-progress.js', 'utf8')).call(window);
});

const P = () => window.PyPathLessonProgress;

describe('normalizeMap', () => {
  it('keeps well-formed entries', async () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x', 'y'], passed: true } }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: true } });
  });

  it('dedupes item ids', async () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x', 'x', 'y'], passed: false } }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: false } });
  });

  it('treats the legacy array shape as partial, never passed', async () => {
    expect(P().normalizeMap({ '/a.html': ['x', 'y'] }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: false } });
  });

  it('coerces a non-boolean passed to false', async () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x'], passed: 'yes' } })['/a.html'].passed).toBe(false);
  });

  it('drops entries with no done array', async () => {
    expect(P().normalizeMap({ '/a.html': { passed: true }, '/b.html': { done: ['y'], passed: true } }))
      .toEqual({ '/b.html': { done: ['y'], passed: true } });
  });

  it('drops empty and non-string ids', async () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x', '', null, 3, 'y'], passed: false } }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: false } });
  });

  it('returns an empty object for junk', async () => {
    [null, undefined, 'nope', 42, []].forEach((v) => {
      expect(P().normalizeMap(v)).toEqual({});
    });
  });
});

describe('passedLessons', () => {
  it('returns only lessons flagged passed', async () => {
    const map = {
      '/a.html': { done: ['x'], passed: true },
      '/b.html': { done: ['x'], passed: false },
      '/c.html': { done: ['x', 'y'], passed: true }
    };
    expect(P().passedLessons(map).sort()).toEqual(['/a.html', '/c.html']);
  });

  it('does not count a lesson that was merely touched', async () => {
    // The bug this guards: partial progress must never satisfy a unit.
    const touched = {
      '/a.html': { done: ['x'], passed: false },
      '/b.html': { done: ['x'], passed: false }
    };
    expect(P().passedLessons(touched)).toEqual([]);
    expect(P().unitComplete(['/a.html', '/b.html'], P().passedLessons(touched))).toBe(false);
  });

  it('returns an empty list for an empty map', async () => {
    expect(P().passedLessons({})).toEqual([]);
  });
});

describe('lessonPassed', () => {
  it('passes when every required item is done', async () => {
    expect(P().lessonPassed(['practice1', 'exercise1'], ['practice1', 'exercise1'])).toBe(true);
  });

  it('ignores order and extra done items', async () => {
    expect(P().lessonPassed(['a', 'b'], ['b', 'z', 'a'])).toBe(true);
  });

  it('fails when one required item is missing', async () => {
    expect(P().lessonPassed(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });

  it('fails on an empty done list', async () => {
    expect(P().lessonPassed(['a'], [])).toBe(false);
  });

  it('a lesson with no interactive items cannot be passed by opening it', async () => {
    // This is the whole point of the change: visiting must never be enough.
    expect(P().lessonPassed([], [])).toBe(false);
    expect(P().lessonPassed([], ['anything'])).toBe(false);
  });

  it('fails on non-arrays', async () => {
    expect(P().lessonPassed(null, ['a'])).toBe(false);
    expect(P().lessonPassed(['a'], null)).toBe(false);
  });
});

describe('unitComplete', () => {
  const unit = ['/units/unit-1/a.html', '/units/unit-1/b.html'];

  it('is true when every lesson in the unit has passed', async () => {
    expect(P().unitComplete(unit, unit)).toBe(true);
  });

  it('is false when one lesson is outstanding', async () => {
    expect(P().unitComplete(unit, ['/units/unit-1/a.html'])).toBe(false);
  });

  it('is false when nothing has passed', async () => {
    expect(P().unitComplete(unit, [])).toBe(false);
  });

  it('is not satisfied by passing lessons from another unit', async () => {
    expect(P().unitComplete(unit, ['/units/unit-2/a.html', '/units/unit-2/b.html'])).toBe(false);
  });

  it('is false for an unknown or empty unit', async () => {
    expect(P().unitComplete([], [])).toBe(false);
    expect(P().unitComplete(null, [])).toBe(false);
  });
});

describe('isUnitUnlocked', () => {
  it('always opens unit 1', async () => {
    expect(P().isUnitUnlocked(1, [])).toBe(true);
  });

  it('opens a unit once the previous one is complete', async () => {
    expect(P().isUnitUnlocked(2, [1])).toBe(true);
    expect(P().isUnitUnlocked(5, [1, 2, 3, 4])).toBe(true);
  });

  it('keeps a unit shut while the previous one is outstanding', async () => {
    expect(P().isUnitUnlocked(2, [])).toBe(false);
    expect(P().isUnitUnlocked(4, [1, 2])).toBe(false);
  });

  it('does not let a later completion skip the gap', async () => {
    expect(P().isUnitUnlocked(5, [1, 2, 3, 10])).toBe(false);
  });

  it('grandfathers units earned under the old visit-based rule', async () => {
    // Anything already in pypath-completed-units still unlocks the next unit.
    expect(P().isUnitUnlocked(7, [6])).toBe(true);
  });

  it('tolerates numeric strings from storage', async () => {
    expect(P().isUnitUnlocked(3, ['2'])).toBe(true);
  });

  it('rejects junk unit numbers', async () => {
    [0, -1, null, undefined, 'two', 1.5].forEach((v) => {
      expect(P().isUnitUnlocked(v, [1, 2, 3])).toBe(false);
    });
  });

  // A teacher previewing unit 7 for tomorrow's class is not a learner working
  // through the course in order.
  it('opens every unit for a teacher', async () => {
    for (let u = 1; u <= 10; u++) {
      expect(P().isUnitUnlocked(u, [], true)).toBe(true);
    }
  });

  it('still rejects junk unit numbers for a teacher', async () => {
    [0, -1, null, 'two'].forEach((v) => {
      expect(P().isUnitUnlocked(v, [], true)).toBe(false);
    });
  });

  it('only an explicit true counts as teaching', async () => {
    expect(P().isUnitUnlocked(5, [], 'teacher')).toBe(false);
    expect(P().isUnitUnlocked(5, [], undefined)).toBe(false);
  });
});

describe('nextUnfinished', () => {
  const lessons = ['/a.html', '/b.html', '/c.html'];

  it('returns the first lesson that has not passed', async () => {
    expect(P().nextUnfinished(lessons, ['/a.html'])).toBe('/b.html');
  });

  it('respects curriculum order, not completion order', async () => {
    expect(P().nextUnfinished(lessons, ['/b.html', '/c.html'])).toBe('/a.html');
  });

  it('returns the first lesson when nothing has passed', async () => {
    expect(P().nextUnfinished(lessons, [])).toBe('/a.html');
  });

  it('returns null when the unit is finished', async () => {
    expect(P().nextUnfinished(lessons, lessons)).toBe(null);
  });

  it('returns null for an empty lesson list', async () => {
    expect(P().nextUnfinished([], [])).toBe(null);
  });
});

describe('curriculum manifest', () => {
  beforeAll(() => {
    new Function(fs.readFileSync('assets/js/curriculum.js', 'utf8')).call(window);
  });

  it('covers all ten units', async () => {
    expect(window.PyPathCurriculum.TOTAL_UNITS).toBe(10);
    for (let u = 1; u <= 10; u++) {
      expect(window.PyPathCurriculum.lessonsIn(u).length).toBeGreaterThan(0);
    }
  });

  it('lists every lesson on disk exactly once', async () => {
    const all = [];
    for (let u = 1; u <= 10; u++) all.push(...window.PyPathCurriculum.lessonsIn(u));
    expect(all.length).toBe(99);
    expect(new Set(all).size).toBe(99);
  });

  it('maps a lesson path and a unit page back to their unit', async () => {
    expect(window.PyPathCurriculum.unitOf('/units/unit-3/functions.html')).toBe(3);
    expect(window.PyPathCurriculum.unitOf('/units/unit-10.html')).toBe(10);
    expect(window.PyPathCurriculum.unitOf('/sandbox.html')).toBe(null);
  });

  it('keeps each unit list inside its own unit directory', async () => {
    for (let u = 1; u <= 10; u++) {
      window.PyPathCurriculum.lessonsIn(u).forEach((p) => {
        expect(p.startsWith(`/units/unit-${u}/`)).toBe(true);
      });
    }
  });
});

describe('lesson check-off on a unit page', () => {
  const A = '/units/unit-1/what-is-python.html';
  const B = '/units/unit-1/installing-python-ide.html';
  const C = '/units/unit-1/first-program.html';

  const LIST = `<main><h2>Lessons</h2><ol class="unit-lesson-list">
      <li><a class="route" href="${A}">1. What is Python</a></li>
      <li><a class="route" href="${B}">2. Installing Python</a></li>
      <li><a class="route" href="${C}">3. Your first program</a></li>
    </ol></main>`;

  const items = () => Array.from(document.querySelectorAll('.unit-lesson-list li'));
  const mark = (n) => items()[n].querySelector('[data-lesson-check]');
  const summary = () => document.querySelector('[data-unit-lesson-summary]');

  beforeAll(() => {
    loadDeps();
    localStorage.clear();
    sessionStorage.clear();
    bootAt('/units/unit-1.html', LIST);
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = LIST;
  });

  afterAll(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.pushState({}, '', '/');
  });

  it('ticks a passed lesson, dots a started one, leaves an untouched one bare', async () => {
    seedLessons({
      [A]: { done: ['x'], passed: true },
      [B]: { done: ['x'], passed: false }
    });
    await progressArrived();

    expect(items()[0].classList.contains('is-lesson-done')).toBe(true);
    expect(mark(0).textContent).toBe('✓');
    expect(mark(0).getAttribute('aria-label')).toBe('Complete');

    expect(items()[1].classList.contains('is-lesson-started')).toBe(true);
    expect(mark(1).textContent).toBe('•');

    expect(items()[2].classList.contains('is-lesson-done')).toBe(false);
    expect(mark(2)).toBeNull();
  });

  it('counts the finished lessons in the summary', async () => {
    seedLessons({ [A]: { done: ['x'], passed: true } });
    await progressArrived();
    expect(summary().textContent).toBe('1 of 3 lessons complete.');
    expect(summary().classList.contains('is-complete')).toBe(false);
  });

  it('says so when the whole unit is done', async () => {
    seedLessons({
      [A]: { done: ['x'], passed: true },
      [B]: { done: ['x'], passed: true },
      [C]: { done: ['x'], passed: true }
    });
    await progressArrived();
    expect(summary().textContent).toBe('All 3 lessons complete.');
    expect(summary().classList.contains('is-complete')).toBe(true);
  });

  // The point of listening to pypath:progress: a lesson finished on a phone
  // shows up ticked here without a reload.
  it('re-paints when progress lands from a sync', async () => {
    await progressArrived();
    expect(mark(0)).toBeNull();

    seedLessons({ [A]: { done: ['x'], passed: true } });
    await progressArrived();
    expect(mark(0).textContent).toBe('✓');
  });

  it('keeps exactly one mark per lesson across repeated paints', async () => {
    seedLessons({ [A]: { done: ['x'], passed: true } });
    await progressArrived();
    await progressArrived();
    await progressArrived();
    expect(items()[0].querySelectorAll('[data-lesson-check]').length).toBe(1);
  });

  it('drops the mark again if the progress goes away', async () => {
    seedLessons({ [A]: { done: ['x'], passed: true } });
    await progressArrived();
    expect(mark(0)).not.toBeNull();

    seedLessons({});
    await progressArrived();
    expect(mark(0)).toBeNull();
    expect(items()[0].classList.contains('is-lesson-done')).toBe(false);
  });

  it('ignores links that are not lessons', async () => {
    document.body.innerHTML = `<main><ol class="unit-lesson-list">
        <li><a href="/units/unit-1.html">Back to the unit</a></li>
        <li><a href="/curriculum.html">Curriculum</a></li>
      </ol></main>`;
    await progressArrived();
    expect(document.querySelectorAll('[data-lesson-check]').length).toBe(0);
    expect(summary()).toBeNull();
  });
});

describe('teacher view', () => {
  const LOCKED_UNIT = '/units/unit-5.html';
  const LESSON = '/units/unit-5/what-are-modules.html';

  const HTML = `<main><h2>Lessons</h2><ol class="unit-lesson-list">
      <li><a class="route" href="${LESSON}">1. What are modules</a></li>
    </ol></main>`;

  const notice = () => document.querySelector('.unit-locked-notice');
  const banner = () => document.querySelector('.teacher-view-note');

  function becomeTeacher() {
    window.PyPathRoles.rememberRole('teacher');
    document.dispatchEvent(new CustomEvent('pypath:role', { detail: { role: 'teacher' } }));
  }

  beforeAll(() => {
    loadDeps();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterAll(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.pushState({}, '', '/');
  });

  it('still locks unit 5 for a learner who has not earned it', async () => {
    bootAt(LOCKED_UNIT, HTML);
    expect(notice()).not.toBeNull();
    expect(banner()).toBeNull();
  });

  it('opens the unit and says so once the role resolves', async () => {
    bootAt(LOCKED_UNIT, HTML);
    expect(notice()).not.toBeNull();

    becomeTeacher();
    expect(notice()).toBeNull();
    expect(banner()).not.toBeNull();
    expect(banner().textContent).toContain('Teacher view');
    expect(banner().querySelector('a').getAttribute('href')).toBe('/classroom.html');
  });

  it('never paints the lock for a session already known to be a teacher', async () => {
    window.PyPathRoles.rememberRole('teacher');
    bootAt(LOCKED_UNIT, HTML);
    expect(notice()).toBeNull();
    expect(banner()).not.toBeNull();
  });

  // A teacher has no learner progress, so ticks and counts would be noise at
  // best and a wrong report on their class at worst.
  it('shows a teacher no learner check-offs or counts', async () => {
    seedLessons({ [LESSON]: { done: ['x'], passed: true } });
    window.PyPathRoles.rememberRole('teacher');
    bootAt(LOCKED_UNIT, HTML);
    expect(document.querySelectorAll('[data-lesson-check]').length).toBe(0);
    expect(document.querySelector('[data-unit-lesson-summary]')).toBeNull();
  });

  it('takes the banner down again if the account is not a teacher', async () => {
    window.PyPathRoles.rememberRole('teacher');
    bootAt(LOCKED_UNIT, HTML);
    expect(banner()).not.toBeNull();

    window.PyPathRoles.rememberRole('student');
    document.dispatchEvent(new CustomEvent('pypath:role', { detail: { role: 'student' } }));
    expect(banner()).toBeNull();
    expect(notice()).not.toBeNull();
  });
});

/* The class lock policy is an optional fourth argument. Everything above this
   block calls with three, and every assertion there is the regression guard
   for the compatibility claim: a page that never hears from class-policy.js
   must behave exactly as it did before class lock modes existed. */
describe('isUnitUnlocked with a class policy', () => {
  const seq = { mode: 'sequential', manualUnlocks: [], assignmentUnlocks: [] };

  it('treats an omitted policy as no policy', async () => {
    expect(P().isUnitUnlocked(3, [1, 2])).toBe(true);
    expect(P().isUnitUnlocked(3, [1])).toBe(false);
  });

  it('treats an explicit null the same way', async () => {
    expect(P().isUnitUnlocked(3, [1, 2], false, null)).toBe(true);
    expect(P().isUnitUnlocked(3, [1], false, null)).toBe(false);
  });

  it('leaves the sequential mode reading as the plain chain', async () => {
    expect(P().isUnitUnlocked(3, [1, 2], false, seq)).toBe(true);
    expect(P().isUnitUnlocked(3, [1], false, seq)).toBe(false);
  });

  it('opens everything in free-roam', async () => {
    const free = { mode: 'free', manualUnlocks: [], assignmentUnlocks: [] };
    expect(P().isUnitUnlocked(9, [], false, free)).toBe(true);
  });

  it('honours a manual list, in both directions', async () => {
    const manual = { mode: 'manual', manualUnlocks: [5], assignmentUnlocks: [] };
    expect(P().isUnitUnlocked(5, [], false, manual)).toBe(true);
    // Closed even though the chain would have opened it. That is what manual
    // mode is for.
    expect(P().isUnitUnlocked(3, [1, 2], false, manual)).toBe(false);
  });

  it('opens an assigned unit whatever the mode says', async () => {
    const manual = { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [6] };
    expect(P().isUnitUnlocked(6, [], false, manual)).toBe(true);
  });

  it('keeps a teacher ahead of every mode', async () => {
    const manual = { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [] };
    expect(P().isUnitUnlocked(8, [], true, manual)).toBe(true);
  });
});
