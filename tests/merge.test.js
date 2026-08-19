import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/merge.js', 'utf8')).call(window);
});

describe('mergeCompletedUnits', () => {
  it('unions both sides', () => {
    expect(window.PyPathMerge.mergeCompletedUnits([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });

  it('is never destructive when remote is empty', () => {
    expect(window.PyPathMerge.mergeCompletedUnits([1, 2], [])).toEqual([1, 2]);
  });

  it('is never destructive when local is empty', () => {
    expect(window.PyPathMerge.mergeCompletedUnits([], [4])).toEqual([4]);
  });

  it('returns numbers sorted ascending', () => {
    const out = window.PyPathMerge.mergeCompletedUnits([10, 2], [1]);
    expect(out).toEqual([1, 2, 10]);
    expect(typeof out[0]).toBe('number');
  });

  it('coerces string input to numbers', () => {
    expect(window.PyPathMerge.mergeCompletedUnits(['1'], [2])).toEqual([1, 2]);
  });
});

describe('pickNewer', () => {
  it('prefers the higher updatedAt', () => {
    const local = { content: 'new', updatedAt: 200 };
    const remote = { content: 'old', updatedAt: 100 };
    expect(window.PyPathMerge.pickNewer(local, remote).content).toBe('new');
  });

  it('prefers remote when remote is newer', () => {
    const local = { content: 'old', updatedAt: 100 };
    const remote = { content: 'new', updatedAt: 200 };
    expect(window.PyPathMerge.pickNewer(local, remote).content).toBe('new');
  });

  it('returns the only side present when the other is null', () => {
    const only = { content: 'x', updatedAt: 1 };
    expect(window.PyPathMerge.pickNewer(only, null)).toBe(only);
    expect(window.PyPathMerge.pickNewer(null, only)).toBe(only);
  });

  it('returns null when both are null', () => {
    expect(window.PyPathMerge.pickNewer(null, null)).toBe(null);
  });

  it('prefers remote on an exact timestamp tie, so devices converge', () => {
    const local = { content: 'L', updatedAt: 100 };
    const remote = { content: 'R', updatedAt: 100 };
    expect(window.PyPathMerge.pickNewer(local, remote).content).toBe('R');
  });
});
