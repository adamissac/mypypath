import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/question-types.js', 'utf8')).call(window);
});

const Q = () => window.PyPathQuestions;

describe('kindOfQuestion', () => {
  it('reads an explicit kind', () => {
    Q().QUESTION_KINDS.forEach((k) => {
      expect(Q().kindOfQuestion({ kind: k })).toBe(k);
    });
  });

  /* Every question in the repo today is a single-answer MCQ with no kind on
     it, so the default is what makes this a pure addition rather than a
     rewrite of twenty pool files. */
  it('defaults to mcq when there is no kind', () => {
    expect(Q().kindOfQuestion({ prompt: 'x', choices: [], answer: 0 })).toBe('mcq');
    expect(Q().kindOfQuestion(null)).toBe('mcq');
  });

  it('reads an unknown kind as mcq rather than throwing', () => {
    expect(Q().kindOfQuestion({ kind: 'parsons' })).toBe('mcq');
  });
});

describe('kindOfCase', () => {
  it('reads an explicit kind', () => {
    expect(Q().kindOfCase({ kind: 'property' })).toBe('property');
    expect(Q().kindOfCase({ kind: 'value', call: 'x' })).toBe('value');
    expect(Q().kindOfCase({ kind: 'stdout' })).toBe('stdout');
  });

  /* The inference checker.js has always used, kept exactly as the fallback so
     that no authored file has to be rewritten. */
  it('infers a property case from any property key', () => {
    ['nonempty', 'min_lines', 'max_lines', 'stdout_matches', 'source_matches'].forEach((key) => {
      const testCase = {};
      testCase[key] = 1;
      expect(Q().kindOfCase(testCase), key).toBe('property');
    });
  });

  it('infers a value case from call', () => {
    expect(Q().kindOfCase({ call: 'total', expect: '3' })).toBe('value');
  });

  it('falls through to stdout', () => {
    expect(Q().kindOfCase({ expect_stdout: '40' })).toBe('stdout');
    expect(Q().kindOfCase({})).toBe('stdout');
  });

  it('lets an explicit kind beat the inference', () => {
    // An author who wrote both keys is told which one is graded, rather than
    // silently losing one of them.
    expect(Q().kindOfCase({ kind: 'stdout', call: 'x' })).toBe('stdout');
  });
});

describe('scoreMulti', () => {
  const q = { kind: 'multi', choices: ['a', 'b', 'c', 'd'], answers: [0, 2] };

  it('marks every choice, not only the correct ones', () => {
    expect(Q().scoreMulti(q, [0, 2])).toEqual({ correct: 4, total: 4, right: true });
  });

  /* The whole reason multi-select is not four MCQs: ticking everything has to
     score badly, or it is a free pass. */
  it('penalises ticking everything', () => {
    const s = Q().scoreMulti(q, [0, 1, 2, 3]);
    expect(s.correct).toBe(2);
    expect(s.right).toBe(false);
  });

  it('gives credit for correctly leaving boxes alone', () => {
    // Nothing ticked: the two wrong ones are correctly untouched.
    expect(Q().scoreMulti(q, []).correct).toBe(2);
  });

  it('marks a partly right answer partly', () => {
    expect(Q().scoreMulti(q, [0]).correct).toBe(3);
  });

  it('tolerates junk and duplicate selections', () => {
    expect(Q().scoreMulti(q, [0, 0, 2, 99, null]).right).toBe(true);
    expect(Q().scoreMulti(q, null).total).toBe(4);
    expect(Q().scoreMulti(null, []).total).toBe(0);
  });
});

describe('scoreMatch', () => {
  const q = { kind: 'match', left: ['list', 'tuple', 'dict'], right: ['a', 'b', 'c'], answer: [0, 1, 2] };

  it('marks one point per left item', () => {
    expect(Q().scoreMatch(q, [0, 1, 2])).toEqual({ correct: 3, total: 3, right: true });
    expect(Q().scoreMatch(q, [0, 2, 1]).correct).toBe(1);
  });

  it('counts an unanswered row as wrong, never as skipped', () => {
    expect(Q().scoreMatch(q, [0, null, undefined]).correct).toBe(1);
    expect(Q().scoreMatch(q, []).correct).toBe(0);
  });

  it('tolerates numeric strings from a select', () => {
    expect(Q().scoreMatch(q, ['0', '1', '2']).right).toBe(true);
  });
});

describe('scoreOrder', () => {
  const q = { kind: 'order', items: ['a', 'b', 'c', 'd'], answer: [0, 1, 2, 3] };

  it('marks a perfect order', () => {
    expect(Q().scoreOrder(q, [0, 1, 2, 3])).toEqual({ correct: 3, total: 3, right: true });
  });

  /* Adjacent pairs, not absolute position. One item dropped in at the top
     shifts every later index, and marking by position would score zero for a
     learner who had the whole structure right. */
  it('scores a leading insertion as nearly right, not as zero', () => {
    const s = Q().scoreOrder(q, [3, 0, 1, 2]);
    expect(s.correct).toBe(2);
    expect(s.right).toBe(false);
  });

  it('scores a full reversal as nothing', () => {
    expect(Q().scoreOrder(q, [3, 2, 1, 0]).correct).toBe(0);
  });

  /* Swapping two neighbours breaks all three adjacencies in a four-line
     answer, where moving one line to the front breaks only two. That
     asymmetry is real and is the point: a learner who has b and c the wrong
     way round has misunderstood the sequence, where one stray line at the top
     still has the body in order. */
  it('scores a middle swap harder than a stray line at the top', () => {
    expect(Q().scoreOrder(q, [0, 2, 1, 3]).correct).toBe(0);
    expect(Q().scoreOrder(q, [3, 0, 1, 2]).correct).toBe(2);
  });

  it('handles a two-item question', () => {
    const two = { items: ['a', 'b'], answer: [0, 1] };
    expect(Q().scoreOrder(two, [0, 1])).toEqual({ correct: 1, total: 1, right: true });
    expect(Q().scoreOrder(two, [1, 0]).correct).toBe(0);
  });

  it('reads an unordered or missing answer as nothing right', () => {
    expect(Q().scoreOrder(q, []).correct).toBe(0);
    expect(Q().scoreOrder(q, null).right).toBe(false);
  });
});

describe('scoreBlank', () => {
  const q = { kind: 'blank', blanks: [{ accept: ['range'] }, { accept: ['len', 'len()'] }] };

  it('marks one point per blank', () => {
    expect(Q().scoreBlank(q, ['range', 'len'])).toEqual({ correct: 2, total: 2, right: true });
    expect(Q().scoreBlank(q, ['range', 'nope']).correct).toBe(1);
  });

  it('accepts any listed alternative', () => {
    expect(Q().scoreBlank(q, ['range', 'len()']).right).toBe(true);
  });

  it('ignores surrounding whitespace and case by default', () => {
    expect(Q().scoreBlank(q, ['  RANGE ', 'Len']).right).toBe(true);
  });

  /* Python cares about case in exactly the places where it cares, and True is
     not true. Per blank, so a lesson can ask for both in one question. */
  it('respects caseSensitive where an author sets it', () => {
    const strict = { blanks: [{ accept: ['True'], caseSensitive: true }] };
    expect(Q().scoreBlank(strict, ['True']).right).toBe(true);
    expect(Q().scoreBlank(strict, ['true']).right).toBe(false);
  });

  it('counts an empty blank as wrong', () => {
    expect(Q().scoreBlank(q, ['', '']).correct).toBe(0);
    expect(Q().scoreBlank(q, null).correct).toBe(0);
  });
});

describe('score', () => {
  it('dispatches on the question kind', () => {
    expect(Q().score({ kind: 'multi', choices: ['a', 'b'], answers: [0] }, [0]).right).toBe(true);
    expect(Q().score({ kind: 'order', items: ['a', 'b'], answer: [0, 1] }, [0, 1]).right).toBe(true);
    expect(Q().score({ kind: 'match', left: ['a'], right: ['x'], answer: [0] }, [0]).right).toBe(true);
    expect(Q().score({ kind: 'blank', blanks: [{ accept: ['x'] }] }, ['x']).right).toBe(true);
  });

  it('scores an mcq the way scoreMcq always has', () => {
    const q = { choices: ['a', 'b', 'c'], answer: 1 };
    expect(Q().score(q, 1)).toEqual({ correct: 1, total: 1, right: true });
    expect(Q().score(q, 0)).toEqual({ correct: 0, total: 1, right: false });
    expect(Q().score(q, null).right).toBe(false);
  });
});
