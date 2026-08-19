import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  // The page-wiring half is guarded on a lesson URL, so loading the file in
  // jsdom exercises only the pure rules.
  new Function(fs.readFileSync('assets/js/lesson-progress.js', 'utf8')).call(window);
});

const P = () => window.PyPathLessonProgress;

describe('normalizeMap', () => {
  it('keeps well-formed entries', () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x', 'y'], passed: true } }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: true } });
  });

  it('dedupes item ids', () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x', 'x', 'y'], passed: false } }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: false } });
  });

  it('treats the legacy array shape as partial, never passed', () => {
    expect(P().normalizeMap({ '/a.html': ['x', 'y'] }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: false } });
  });

  it('coerces a non-boolean passed to false', () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x'], passed: 'yes' } })['/a.html'].passed).toBe(false);
  });

  it('drops entries with no done array', () => {
    expect(P().normalizeMap({ '/a.html': { passed: true }, '/b.html': { done: ['y'], passed: true } }))
      .toEqual({ '/b.html': { done: ['y'], passed: true } });
  });

  it('drops empty and non-string ids', () => {
    expect(P().normalizeMap({ '/a.html': { done: ['x', '', null, 3, 'y'], passed: false } }))
      .toEqual({ '/a.html': { done: ['x', 'y'], passed: false } });
  });

  it('returns an empty object for junk', () => {
    [null, undefined, 'nope', 42, []].forEach((v) => {
      expect(P().normalizeMap(v)).toEqual({});
    });
  });
});

describe('passedLessons', () => {
  it('returns only lessons flagged passed', () => {
    const map = {
      '/a.html': { done: ['x'], passed: true },
      '/b.html': { done: ['x'], passed: false },
      '/c.html': { done: ['x', 'y'], passed: true }
    };
    expect(P().passedLessons(map).sort()).toEqual(['/a.html', '/c.html']);
  });

  it('does not count a lesson that was merely touched', () => {
    // The bug this guards: partial progress must never satisfy a unit.
    const touched = {
      '/a.html': { done: ['x'], passed: false },
      '/b.html': { done: ['x'], passed: false }
    };
    expect(P().passedLessons(touched)).toEqual([]);
    expect(P().unitComplete(['/a.html', '/b.html'], P().passedLessons(touched))).toBe(false);
  });

  it('returns an empty list for an empty map', () => {
    expect(P().passedLessons({})).toEqual([]);
  });
});

describe('lessonPassed', () => {
  it('passes when every required item is done', () => {
    expect(P().lessonPassed(['practice1', 'exercise1'], ['practice1', 'exercise1'])).toBe(true);
  });

  it('ignores order and extra done items', () => {
    expect(P().lessonPassed(['a', 'b'], ['b', 'z', 'a'])).toBe(true);
  });

  it('fails when one required item is missing', () => {
    expect(P().lessonPassed(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });

  it('fails on an empty done list', () => {
    expect(P().lessonPassed(['a'], [])).toBe(false);
  });

  it('a lesson with no interactive items cannot be passed by opening it', () => {
    // This is the whole point of the change: visiting must never be enough.
    expect(P().lessonPassed([], [])).toBe(false);
    expect(P().lessonPassed([], ['anything'])).toBe(false);
  });

  it('fails on non-arrays', () => {
    expect(P().lessonPassed(null, ['a'])).toBe(false);
    expect(P().lessonPassed(['a'], null)).toBe(false);
  });
});

describe('unitComplete', () => {
  const unit = ['/units/unit-1/a.html', '/units/unit-1/b.html'];

  it('is true when every lesson in the unit has passed', () => {
    expect(P().unitComplete(unit, unit)).toBe(true);
  });

  it('is false when one lesson is outstanding', () => {
    expect(P().unitComplete(unit, ['/units/unit-1/a.html'])).toBe(false);
  });

  it('is false when nothing has passed', () => {
    expect(P().unitComplete(unit, [])).toBe(false);
  });

  it('is not satisfied by passing lessons from another unit', () => {
    expect(P().unitComplete(unit, ['/units/unit-2/a.html', '/units/unit-2/b.html'])).toBe(false);
  });

  it('is false for an unknown or empty unit', () => {
    expect(P().unitComplete([], [])).toBe(false);
    expect(P().unitComplete(null, [])).toBe(false);
  });
});

describe('isUnitUnlocked', () => {
  it('always opens unit 1', () => {
    expect(P().isUnitUnlocked(1, [])).toBe(true);
  });

  it('opens a unit once the previous one is complete', () => {
    expect(P().isUnitUnlocked(2, [1])).toBe(true);
    expect(P().isUnitUnlocked(5, [1, 2, 3, 4])).toBe(true);
  });

  it('keeps a unit shut while the previous one is outstanding', () => {
    expect(P().isUnitUnlocked(2, [])).toBe(false);
    expect(P().isUnitUnlocked(4, [1, 2])).toBe(false);
  });

  it('does not let a later completion skip the gap', () => {
    expect(P().isUnitUnlocked(5, [1, 2, 3, 10])).toBe(false);
  });

  it('grandfathers units earned under the old visit-based rule', () => {
    // Anything already in pypath-completed-units still unlocks the next unit.
    expect(P().isUnitUnlocked(7, [6])).toBe(true);
  });

  it('tolerates numeric strings from storage', () => {
    expect(P().isUnitUnlocked(3, ['2'])).toBe(true);
  });

  it('rejects junk unit numbers', () => {
    [0, -1, null, undefined, 'two', 1.5].forEach((v) => {
      expect(P().isUnitUnlocked(v, [1, 2, 3])).toBe(false);
    });
  });
});

describe('nextUnfinished', () => {
  const lessons = ['/a.html', '/b.html', '/c.html'];

  it('returns the first lesson that has not passed', () => {
    expect(P().nextUnfinished(lessons, ['/a.html'])).toBe('/b.html');
  });

  it('respects curriculum order, not completion order', () => {
    expect(P().nextUnfinished(lessons, ['/b.html', '/c.html'])).toBe('/a.html');
  });

  it('returns the first lesson when nothing has passed', () => {
    expect(P().nextUnfinished(lessons, [])).toBe('/a.html');
  });

  it('returns null when the unit is finished', () => {
    expect(P().nextUnfinished(lessons, lessons)).toBe(null);
  });

  it('returns null for an empty lesson list', () => {
    expect(P().nextUnfinished([], [])).toBe(null);
  });
});

describe('curriculum manifest', () => {
  beforeAll(() => {
    new Function(fs.readFileSync('assets/js/curriculum.js', 'utf8')).call(window);
  });

  it('covers all ten units', () => {
    expect(window.PyPathCurriculum.TOTAL_UNITS).toBe(10);
    for (let u = 1; u <= 10; u++) {
      expect(window.PyPathCurriculum.lessonsIn(u).length).toBeGreaterThan(0);
    }
  });

  it('lists every lesson on disk exactly once', () => {
    const all = [];
    for (let u = 1; u <= 10; u++) all.push(...window.PyPathCurriculum.lessonsIn(u));
    expect(all.length).toBe(99);
    expect(new Set(all).size).toBe(99);
  });

  it('maps a lesson path and a unit page back to their unit', () => {
    expect(window.PyPathCurriculum.unitOf('/units/unit-3/functions.html')).toBe(3);
    expect(window.PyPathCurriculum.unitOf('/units/unit-10.html')).toBe(10);
    expect(window.PyPathCurriculum.unitOf('/sandbox.html')).toBe(null);
  });

  it('keeps each unit list inside its own unit directory', () => {
    for (let u = 1; u <= 10; u++) {
      window.PyPathCurriculum.lessonsIn(u).forEach((p) => {
        expect(p.startsWith(`/units/unit-${u}/`)).toBe(true);
      });
    }
  });
});
