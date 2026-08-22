import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

let U;
let LP;
let K;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/unit-progress.js', 'utf8')).call(window);
  U = window.PyPathUnitProgress;
});

describe('the shared percentage formula', () => {
  it('counts the end-of-unit test as one part alongside each lesson', () => {
    // Ten lessons plus the test is eleven parts.
    expect(U.percentFor({ lessonsTotal: 10, lessonsPassed: 10, testPassed: true })).toBe(100);
    expect(U.percentFor({ lessonsTotal: 10, lessonsPassed: 0, testPassed: false })).toBe(0);
  });

  it('does not show 100% for a unit whose test has not been passed', () => {
    // The whole point: a bar reading 100% beside an unfinished unit would be
    // the site lying to the learner and their teacher about the same thing.
    const all = { lessonsTotal: 10, lessonsPassed: 10, testPassed: false };
    expect(U.percentFor(all)).toBe(91);
    expect(U.isComplete(all)).toBe(false);
  });

  it('gives partial credit for partial work', () => {
    expect(U.percentFor({ lessonsTotal: 10, lessonsPassed: 6, testPassed: false })).toBe(55);
    expect(U.percentFor({ lessonsTotal: 10, lessonsPassed: 6, testPassed: true })).toBe(64);
  });

  it('never divides by zero on a unit with no lessons', () => {
    expect(U.percentFor({ lessonsTotal: 0, lessonsPassed: 0, testPassed: true })).toBe(0);
    expect(U.percentFor({})).toBe(0);
    expect(U.percentFor(null)).toBe(0);
  });

  it('clamps a lesson count that exceeds the total', () => {
    expect(U.percentFor({ lessonsTotal: 4, lessonsPassed: 99, testPassed: true })).toBe(100);
    expect(U.percentFor({ lessonsTotal: 4, lessonsPassed: -5, testPassed: false })).toBe(0);
  });

  it('treats only a real boolean as a passed test', () => {
    expect(U.percentFor({ lessonsTotal: 1, lessonsPassed: 0, testPassed: 'yes' })).toBe(0);
  });

  it('decides completeness from the rule, never from the percentage', () => {
    // A rounding change must not be able to complete a unit.
    expect(U.isComplete({ lessonsTotal: 10, lessonsPassed: 10, testPassed: false })).toBe(false);
    expect(U.isComplete({ lessonsTotal: 10, lessonsPassed: 9, testPassed: true })).toBe(false);
    expect(U.isComplete({ lessonsTotal: 10, lessonsPassed: 10, testPassed: true })).toBe(true);
    expect(U.isComplete({ lessonsTotal: 0, lessonsPassed: 0, testPassed: true })).toBe(false);
  });
});

describe('the sentence under the bar', () => {
  it('says how many lessons are done out of how many', () => {
    expect(U.describe({ lessonsTotal: 10, lessonsPassed: 6, lessonsStarted: 6, testPassed: false }))
      .toContain('6 of 10 lessons done');
  });

  it('mentions lessons started but not finished', () => {
    expect(U.describe({ lessonsTotal: 10, lessonsPassed: 6, lessonsStarted: 8, testPassed: false }))
      .toContain('2 in progress');
  });

  it('always says where the test stands', () => {
    expect(U.describe({ lessonsTotal: 10, lessonsPassed: 10, testPassed: false }))
      .toContain('test not passed yet');
    expect(U.describe({ lessonsTotal: 10, lessonsPassed: 4, testPassed: true }))
      .toContain('test passed');
  });

  it('says Complete only when it is', () => {
    expect(U.describe({ lessonsTotal: 10, lessonsPassed: 10, testPassed: true })).toBe('Complete');
    expect(U.describe({ lessonsTotal: 10, lessonsPassed: 10, testPassed: false }))
      .not.toBe('Complete');
  });

  it('handles a unit with no lessons without saying "0 of 0"', () => {
    expect(U.describe({ lessonsTotal: 0 })).toBe('No lessons in this unit yet');
  });
});

describe('the student and the teacher see the same number', () => {
  beforeAll(() => {
    new Function(fs.readFileSync('assets/js/curriculum.js', 'utf8')).call(window);
    new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
    new Function(fs.readFileSync('assets/js/progress-store.js', 'utf8')).call(window);
    new Function(fs.readFileSync('assets/js/lesson-progress.js', 'utf8')).call(window);
    new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
    LP = window.PyPathLessonProgress;
    K = window.PyPathClassroom;
  });

  beforeEach(() => localStorage.clear());

  /* The two are computed from different sources -- a stored lesson map on the
     student's machine, an event log on the teacher's -- so this is the test
     that stops them drifting apart. */
  function seedStudent(unit, passedPaths, testScore) {
    const map = {};
    for (const path of passedPaths) map[path] = { done: ['a'], passed: true };
    localStorage.setItem('pypath-progress-lessons', JSON.stringify(map));
    if (testScore != null) {
      localStorage.setItem('pypath-unit-tests', JSON.stringify({
        [String(unit)]: { best: testScore, passed: testScore >= 70, attempts: 1 },
      }));
    }
  }

  function seedTeacher(passedPaths, unit, testScore) {
    const events = passedPaths.map((path) => ({
      type: 'code.tests_passed', at: Date.now(), lessonPath: path, unit,
      payload: { lessonPath: path, editorId: 'e1', passed: 3, total: 3 },
    }));
    if (testScore != null) {
      events.push({
        type: 'test.submitted', at: Date.now(), unit,
        payload: { unit, score: testScore, total: 100, attempt: 1, durationSec: 60 },
      });
    }
    return events;
  }

  const cases = [
    ['no work at all', 0, null],
    ['some lessons, no test', 3, null],
    ['all lessons, no test', 8, null],
    ['some lessons, test passed', 3, 85],
    ['all lessons, test passed', 8, 85],
    ['all lessons, test failed', 8, 40],
  ];

  for (const [label, lessonCount, testScore] of cases) {
    it(`agrees on "${label}"`, () => {
      const paths = window.PyPathCurriculum.lessonsIn(1);
      const passed = paths.slice(0, lessonCount);

      seedStudent(1, passed, testScore);
      const student = LP.unitBreakdown(1);
      const teacher = K.unitProgress(seedTeacher(passed, 1, testScore), paths, 1);

      expect(teacher.percent, label).toBe(student.percent);
      expect(teacher.lessonsPassed, label).toBe(student.lessonsPassed);
      expect(teacher.testPassed, label).toBe(student.testPassed);
      expect(teacher.summary, label).toBe(student.summary);
    });
  }

  it('reports the real lesson count for the unit, not a guess', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    for (let unit = 1; unit <= 10; unit += 1) {
      const expected = manifest.lessons.filter((l) => l.unit === unit).length;
      expect(LP.unitBreakdown(unit).lessonsTotal, `unit ${unit}`).toBe(expected);
    }
  });

  it('counts a started-but-unfinished lesson as started', () => {
    const paths = window.PyPathCurriculum.lessonsIn(1);
    localStorage.setItem('pypath-progress-lessons', JSON.stringify({
      [paths[0]]: { done: ['a'], passed: true },
      [paths[1]]: { done: ['a'], passed: false },
    }));
    const info = LP.unitBreakdown(1);
    expect(info.lessonsPassed).toBe(1);
    expect(info.lessonsStarted).toBe(2);
    expect(info.summary).toContain('1 in progress');
  });

  it('gives every unit a breakdown', () => {
    expect(LP.allUnitBreakdowns().length).toBe(10);
    expect(LP.allUnitBreakdowns().map((b) => b.unit)).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 1)
    );
  });
});
