import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  // Both files guard their page wiring, so loading them in jsdom exercises
  // only the pure rules. unit-test.js has no page half at all; the page half
  // of lesson-progress.js hangs off DOMContentLoaded, which has already fired.
  new Function(fs.readFileSync('assets/js/unit-test.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/lesson-progress.js', 'utf8')).call(window);
});

const T = () => window.PyPathUnitTest;
const P = () => window.PyPathLessonProgress;

// A rand that walks a fixed list, so selection is a value to assert on rather
// than something to sample. Falls back to 0 once the list runs out.
function seqRand(values) {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
}

describe('the weights', () => {
  it('matches the contract', () => {
    expect(T().MCQ_COUNT).toBe(10);
    expect(T().MCQ_WEIGHT).toBe(7);
    expect(T().FRQ_WEIGHT).toBe(30);
    expect(T().PASS_MARK).toBe(70);
  });

  it('makes a perfect paper exactly 100', () => {
    const s = T().scoreAttempt({ mcqCorrect: 10, frqCasesPassed: 6, frqCasesTotal: 6 });
    expect(s).toEqual({ mcqPoints: 70, frqPoints: 30, total: 100, passed: true });
  });

  it('charges 7 a question for the multiple choice half', () => {
    for (let n = 0; n <= 10; n++) {
      const s = T().scoreAttempt({ mcqCorrect: n, frqCasesPassed: 0, frqCasesTotal: 5 });
      expect(s.mcqPoints).toBe(n * 7);
      expect(s.total).toBe(n * 7);
    }
  });

  it('pays the full 30 for a free response with every case passing', () => {
    const s = T().scoreAttempt({ mcqCorrect: 0, frqCasesPassed: 5, frqCasesTotal: 5 });
    expect(s.frqPoints).toBe(30);
    expect(s.total).toBe(30);
    expect(s.passed).toBe(false);
  });

  it('never goes over 100 even if the counts are nonsense', () => {
    const s = T().scoreAttempt({ mcqCorrect: 99, frqCasesPassed: 99, frqCasesTotal: 99 });
    expect(s.total).toBe(100);
  });
});

describe('partial credit on the free response', () => {
  it('pays a share of 30 and rounds to the nearest point', () => {
    const points = (passed, total) =>
      T().scoreAttempt({ mcqCorrect: 0, frqCasesPassed: passed, frqCasesTotal: total }).frqPoints;

    expect(points(3, 6)).toBe(15);
    expect(points(2, 3)).toBe(20);   // 20.0 exactly
    expect(points(1, 3)).toBe(10);
    expect(points(1, 7)).toBe(4);    // 4.285... rounds down
    expect(points(2, 7)).toBe(9);    // 8.571... rounds up
    expect(points(1, 4)).toBe(8);    // 7.5 rounds up, the .5 case
    expect(points(5, 6)).toBe(25);
    expect(points(0, 6)).toBe(0);
  });

  it('scores 0 rather than dividing by zero when there are no cases', () => {
    const s = T().scoreAttempt({ mcqCorrect: 10, frqCasesPassed: 0, frqCasesTotal: 0 });
    expect(s.frqPoints).toBe(0);
    expect(Number.isNaN(s.frqPoints)).toBe(false);
    expect(s.total).toBe(70);
  });

  it('cannot pass more cases than exist', () => {
    const s = T().scoreAttempt({ mcqCorrect: 0, frqCasesPassed: 9, frqCasesTotal: 3 });
    expect(s.frqPoints).toBe(30);
  });

  it('treats a missing or unreadable result as a zero, not a throw', () => {
    expect(T().scoreAttempt(undefined).total).toBe(0);
    expect(T().scoreAttempt(null).total).toBe(0);
    expect(T().scoreAttempt({ mcqCorrect: 'four', frqCasesTotal: 'lots' }).total).toBe(0);
  });
});

describe('the 70 boundary', () => {
  it('fails at 69', () => {
    // 9 right at 7 each is 63, plus 1 case of 5 on the free response is 6.
    const s = T().scoreAttempt({ mcqCorrect: 9, frqCasesPassed: 1, frqCasesTotal: 5 });
    expect(s.total).toBe(69);
    expect(s.passed).toBe(false);
    expect(T().hasPassed(69)).toBe(false);
  });

  it('passes at 70', () => {
    const s = T().scoreAttempt({ mcqCorrect: 10, frqCasesPassed: 0, frqCasesTotal: 5 });
    expect(s.total).toBe(70);
    expect(s.passed).toBe(true);
    expect(T().hasPassed(70)).toBe(true);
  });

  it('reads a score that is not a number as a fail', () => {
    expect(T().hasPassed(NaN)).toBe(false);
    expect(T().hasPassed(undefined)).toBe(false);
    expect(T().hasPassed('ninety')).toBe(false);
  });
});

describe('pickQuestions', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

  it('returns exactly the count asked for', () => {
    expect(T().pickQuestions(pool, 10).length).toBe(10);
    expect(T().pickQuestions(pool, 1).length).toBe(1);
    expect(T().pickQuestions(pool, 0).length).toBe(0);
  });

  it('never repeats a question, over many draws', () => {
    for (let i = 0; i < 200; i++) {
      const picked = T().pickQuestions(pool, 10);
      expect(new Set(picked).size).toBe(10);
    }
  });

  it('honours an injected rand', () => {
    // i=0: floor(0.4 * 5) = 2, swap 0 and 2. i=1: floor(0.9 * 4) = 3, swap 1
    // and 4. i=2: floor(0.1 * 3) = 0, no swap.
    const picked = T().pickQuestions(['a', 'b', 'c', 'd', 'e'], 3, seqRand([0.4, 0.9, 0.1]));
    expect(picked).toEqual(['c', 'e', 'a']);
  });

  it('leaves the order alone when rand always returns 0', () => {
    expect(T().pickQuestions(pool, 4, () => 0)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the pool it was handed', () => {
    const original = pool.slice();
    T().pickQuestions(pool, 10);
    expect(pool).toEqual(original);
  });

  it('survives a rand that returns 1 or something out of range', () => {
    expect(T().pickQuestions(pool, 5, () => 1).length).toBe(5);
    expect(new Set(T().pickQuestions(pool, 5, () => 1)).size).toBe(5);
    expect(new Set(T().pickQuestions(pool, 5, () => -3)).size).toBe(5);
    expect(new Set(T().pickQuestions(pool, 5, () => NaN)).size).toBe(5);
  });

  it('gives back what it has when the pool is short', () => {
    expect(T().pickQuestions(['a', 'b'], 10).length).toBe(2);
    expect(T().pickQuestions([], 10)).toEqual([]);
  });

  it('reads a non-array pool or a nonsense count as nothing to pick', () => {
    expect(T().pickQuestions(null, 10)).toEqual([]);
    expect(T().pickQuestions({ 0: 'a' }, 10)).toEqual([]);
    expect(T().pickQuestions(pool, -4)).toEqual([]);
    expect(T().pickQuestions(pool, 'ten')).toEqual([]);
  });
});

describe('pickOne', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];

  it('honours an injected rand', () => {
    // floor(0.6 * 5) = 3, so index 3 is swapped to the front and returned.
    expect(T().pickOne(pool, seqRand([0.6]))).toBe('d');
    expect(T().pickOne(pool, () => 0)).toBe('a');
  });

  it('always returns a member of the pool', () => {
    for (let i = 0; i < 200; i++) {
      expect(pool).toContain(T().pickOne(pool));
    }
  });

  it('returns null when there is nothing to pick', () => {
    expect(T().pickOne([])).toBe(null);
    expect(T().pickOne(null)).toBe(null);
  });
});

describe('scoreMcq', () => {
  const picked = [
    { id: 'q1', answer: 0 },
    { id: 'q2', answer: 1 },
    { id: 'q3', answer: 2 },
    { id: 'q4', answer: 3 }
  ];

  it('counts the right answers', () => {
    expect(T().scoreMcq(picked, [0, 1, 2, 3])).toBe(4);
    expect(T().scoreMcq(picked, [1, 1, 1, 1])).toBe(1);
    expect(T().scoreMcq(picked, [3, 3, 3, 0])).toBe(0);
  });

  it('counts a skipped answer as wrong rather than throwing on it', () => {
    expect(T().scoreMcq(picked, [null, 1, null, 3])).toBe(2);
    expect(T().scoreMcq(picked, [null, null, null, null])).toBe(0);
    expect(T().scoreMcq(picked, [undefined, 1, '', 3])).toBe(2);
  });

  it('counts a short answer list as skipped, not as an error', () => {
    expect(T().scoreMcq(picked, [0, 1])).toBe(2);
    expect(T().scoreMcq(picked, [])).toBe(0);
  });

  it('does not count index 0 as a skip', () => {
    expect(T().scoreMcq([{ answer: 0 }], [0])).toBe(1);
  });

  it('accepts an answer stored as a string, which is what a radio value is', () => {
    expect(T().scoreMcq(picked, ['0', '1', '2', '3'])).toBe(4);
  });

  it('reads missing or malformed arguments as no marks, never a throw', () => {
    expect(T().scoreMcq(null, null)).toBe(0);
    expect(T().scoreMcq(picked, null)).toBe(0);
    expect(T().scoreMcq([null, undefined, 'q', { answer: 1 }], [1, 1, 1, 1])).toBe(1);
  });
});

describe('unitTestPassed', () => {
  it('reads no records at all as not passed', () => {
    expect(P().unitTestPassed({}, 1)).toBe(false);
    expect(P().unitTestPassed({ '2': { best: 100, passed: true } }, 1)).toBe(false);
  });

  it('reads a score below the mark as not passed', () => {
    expect(P().unitTestPassed({ '1': { best: 69, passed: false, attempts: 3 } }, 1)).toBe(false);
    expect(P().unitTestPassed({ '1': { best: 0, attempts: 1 } }, 1)).toBe(false);
  });

  it('reads a score at or above the mark as passed', () => {
    expect(P().unitTestPassed({ '1': { best: 70 } }, 1)).toBe(true);
    expect(P().unitTestPassed({ '1': { best: 100, passed: true } }, 1)).toBe(true);
  });

  it('trusts a passed flag that has no best beside it', () => {
    // Still true, and for the original reason: with no score stored the flag is
    // the only evidence there is, and a record truncated mid-write must not
    // cost a learner a unit they really passed.
    expect(P().unitTestPassed({ '1': { passed: true } }, 1)).toBe(true);
  });

  it('lets a stored score overrule the flag beside it', () => {
    /* Changed deliberately. This used to read as passed, so a record carrying
       `passed: true` next to a failing score unlocked the next unit at any mark
       at all -- the one way "score 70 or higher" was not literally true of the
       sequential chain. `passed` is derived from `best` and `best` only
       ratchets upward, so neither of these can come from sitting the test. */
    expect(P().unitTestPassed({ '1': { passed: true, best: 0 } }, 1)).toBe(false);
    expect(P().unitTestPassed({ '1': { passed: true, best: 30 } }, 1)).toBe(false);
    expect(P().unitTestPassed({ '1': { passed: true, best: 70 } }, 1)).toBe(true);
  });

  it('accepts the unit as a number or a numeric string', () => {
    const records = { '3': { best: 80 } };
    expect(P().unitTestPassed(records, 3)).toBe(true);
    expect(P().unitTestPassed(records, '3')).toBe(true);
  });

  it('does not throw on a malformed blob', () => {
    const bad = [null, undefined, 'nonsense', 42, [], [{ best: 100 }], true];
    bad.forEach((blob) => {
      expect(() => P().unitTestPassed(blob, 1)).not.toThrow();
      expect(P().unitTestPassed(blob, 1)).toBe(false);
    });

    const badEntries = [
      { '1': null },
      { '1': 'passed' },
      { '1': [] },
      { '1': 100 },
      { '1': { best: 'lots' } },
      { '1': { passed: 'yes' } }
    ];
    badEntries.forEach((records) => {
      expect(() => P().unitTestPassed(records, 1)).not.toThrow();
      expect(P().unitTestPassed(records, 1)).toBe(false);
    });
  });

  it('refuses a unit number that is not a whole number of at least 1', () => {
    const records = { '1': { best: 100 } };
    [0, -1, 1.5, NaN, null, undefined, 'one', {}].forEach((unit) => {
      expect(P().unitTestPassed(records, unit)).toBe(false);
    });
  });
});

describe('unitFinished', () => {
  const lessons = ['/units/unit-1/a.html', '/units/unit-1/b.html'];
  const records = { '1': { best: 85, passed: true } };

  it('needs every lesson and the test', () => {
    expect(P().unitFinished(lessons, lessons, records, 1)).toBe(true);
  });

  it('is not finished with the lessons done but the test unpassed', () => {
    expect(P().unitFinished(lessons, lessons, {}, 1)).toBe(false);
    expect(P().unitFinished(lessons, lessons, { '1': { best: 69 } }, 1)).toBe(false);
  });

  it('is not finished with the test passed but a lesson outstanding', () => {
    expect(P().unitFinished(lessons, [lessons[0]], records, 1)).toBe(false);
    expect(P().unitFinished(lessons, [], records, 1)).toBe(false);
  });

  it('is not finished when the unit has no lessons to speak of', () => {
    expect(P().unitFinished([], [], records, 1)).toBe(false);
    expect(P().unitFinished(null, null, records, 1)).toBe(false);
  });

  it('does not throw on a malformed test blob', () => {
    expect(() => P().unitFinished(lessons, lessons, 'nonsense', 1)).not.toThrow();
    expect(P().unitFinished(lessons, lessons, 'nonsense', 1)).toBe(false);
  });

  it('leaves unitComplete meaning what it always meant', () => {
    expect(P().unitComplete(lessons, lessons)).toBe(true);
  });
});
