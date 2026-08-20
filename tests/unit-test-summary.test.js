import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  summarizeUnitTests, normalizeScores, passedUnits, scoreRows,
  UNIT_TESTS_KEY, PASS_MARK, TOTAL_UNITS,
} from '../assets/js/unit-test-summary.js';

// The shape sync.js reads out of localStorage, per the unit tests design spec.
function record(best, extra) {
  return Object.assign({ best: best, passed: best >= PASS_MARK, attempts: 1 }, extra || {});
}

describe('constants', () => {
  it('names the key the spec allowlists', () => {
    expect(UNIT_TESTS_KEY).toBe('pypath-unit-tests');
    expect(PASS_MARK).toBe(70);
    expect(TOTAL_UNITS).toBe(10);
  });

  // Two files name this key: storage-keys.js decides whether it syncs, this one
  // decides what it means. If they ever disagree the teacher's column silently
  // empties, so pin them together here.
  it('agrees with the syncing allowlist in storage-keys.js', () => {
    new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
    expect(window.PyPathKeys.UNIT_TESTS_KEY).toBe(UNIT_TESTS_KEY);
    expect(window.PyPathKeys.isSyncable(UNIT_TESTS_KEY)).toBe(true);
  });
});

describe('summarizeUnitTests', () => {
  it('reports nothing for an empty store', () => {
    expect(summarizeUnitTests('{}')).toEqual({ testScores: {}, testsPassed: [] });
  });

  it('reports nothing when the key has never been written', () => {
    [null, undefined, ''].forEach((raw) => {
      expect(summarizeUnitTests(raw)).toEqual({ testScores: {}, testsPassed: [] });
    });
  });

  it('carries a score that is below the pass mark without passing it', () => {
    const raw = JSON.stringify({ 1: record(63) });
    expect(summarizeUnitTests(raw)).toEqual({ testScores: { 1: 63 }, testsPassed: [] });
  });

  it('passes a score exactly on the pass mark', () => {
    const raw = JSON.stringify({ 2: record(70) });
    expect(summarizeUnitTests(raw)).toEqual({ testScores: { 2: 70 }, testsPassed: [2] });
  });

  it('handles a mix of passes and failures, in unit order', () => {
    const raw = JSON.stringify({
      3: record(100), 1: record(85), 10: record(69), 2: record(70),
    });
    const out = summarizeUnitTests(raw);
    expect(out.testScores).toEqual({ 1: 85, 2: 70, 3: 100, 10: 69 });
    expect(out.testsPassed).toEqual([1, 2, 3]);
  });

  it('accepts an already parsed object as well as a string', () => {
    expect(summarizeUnitTests({ 4: record(90) }))
      .toEqual({ testScores: { 4: 90 }, testsPassed: [4] });
  });

  it('derives the verdict from the score, not from the stored passed flag', () => {
    // A stored flag that disagrees with its own score is what a tampered or
    // half migrated record looks like; the mark is the thing that was earned.
    const raw = JSON.stringify({ 1: { best: 40, passed: true }, 2: { best: 95, passed: false } });
    expect(summarizeUnitTests(raw).testsPassed).toEqual([2]);
  });

  it('falls back to the last attempt when best is missing', () => {
    const raw = JSON.stringify({ 5: { attempts: 1, last: { score: 77 } } });
    expect(summarizeUnitTests(raw)).toEqual({ testScores: { 5: 77 }, testsPassed: [5] });
  });

  it('does not throw on a malformed stored value', () => {
    const junk = [
      'not json at all',
      '{"1":',
      '[]',
      '"a string"',
      '42',
      'null',
      JSON.stringify([1, 2, 3]),
      JSON.stringify({ 1: 'eighty five' }),
      JSON.stringify({ 1: null }),
      JSON.stringify({ 1: [85] }),
      JSON.stringify({ 1: { best: 'x' } }),
      JSON.stringify({ 1: { best: null, last: 'no' } }),
    ];
    junk.forEach((raw) => {
      expect(() => summarizeUnitTests(raw)).not.toThrow();
      expect(summarizeUnitTests(raw)).toEqual({ testScores: {}, testsPassed: [] });
    });
  });

  it('drops units outside 1 to 10 and keeps the rest', () => {
    const raw = JSON.stringify({
      0: record(90), 11: record(90), '-1': record(90), '2.5': record(90),
      abc: record(90), 7: record(90),
    });
    expect(summarizeUnitTests(raw)).toEqual({ testScores: { 7: 90 }, testsPassed: [7] });
  });

  it('clamps and rounds a score that arrived out of range', () => {
    const raw = JSON.stringify({ 1: { best: 140 }, 2: { best: -5 }, 3: { best: 69.6 } });
    expect(summarizeUnitTests(raw).testScores).toEqual({ 1: 100, 2: 0, 3: 70 });
  });

  it('returns a fresh object each call, so a caller cannot poison the next one', () => {
    const first = summarizeUnitTests('{}');
    first.testScores[1] = 99;
    first.testsPassed.push(1);
    expect(summarizeUnitTests('{}')).toEqual({ testScores: {}, testsPassed: [] });
  });
});

describe('normalizeScores', () => {
  it('cleans the map a dashboard reads back off a document', () => {
    expect(normalizeScores({ 1: 85, 2: '70', 3: null, 12: 90, x: 50 }))
      .toEqual({ 1: 85, 2: 70 });
  });

  it('treats anything that is not a map as no scores', () => {
    [null, undefined, 'nope', 7, [], [['1', 85]]].forEach((v) => {
      expect(normalizeScores(v)).toEqual({});
    });
  });
});

describe('passedUnits', () => {
  it('sorts numerically, not as strings', () => {
    expect(passedUnits({ 10: 80, 2: 80, 1: 80 })).toEqual([1, 2, 10]);
  });

  it('is empty when nothing reaches the pass mark', () => {
    expect(passedUnits({ 1: 69, 2: 0 })).toEqual([]);
  });
});

describe('scoreRows', () => {
  it('lists attempted units in order with their verdict', () => {
    expect(scoreRows({ 3: 100, 1: 69, 10: 70 })).toEqual([
      { unit: 1, score: 69, passed: false },
      { unit: 3, score: 100, passed: true },
      { unit: 10, score: 70, passed: true },
    ]);
  });

  it('is empty for a learner who has sat nothing', () => {
    expect(scoreRows({})).toEqual([]);
    expect(scoreRows(undefined)).toEqual([]);
  });
});
