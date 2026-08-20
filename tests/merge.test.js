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

describe('needsFullSync', () => {
  const N = (...args) => window.PyPathMerge.needsFullSync(...args);
  const TTL = 1000;

  it('syncs when this device has never synced', () => {
    expect(N(0, 5000, TTL)).toBe(true);
    expect(N(null, 5000, TTL)).toBe(true);
    expect(N(undefined, 5000, TTL)).toBe(true);
  });

  // The stamp comes out of sessionStorage as a string, and anything could be
  // sitting under that key.
  it('syncs when the stamp will not parse', () => {
    expect(N('', 5000, TTL)).toBe(true);
    expect(N('soon', 5000, TTL)).toBe(true);
    expect(N(NaN, 5000, TTL)).toBe(true);
  });

  it('reads a numeric string stamp', () => {
    expect(N('4500', 5000, TTL)).toBe(false);
    expect(N('3000', 5000, TTL)).toBe(true);
  });

  it('holds off inside the window', () => {
    expect(N(5000, 5001, TTL)).toBe(false);
    expect(N(5000, 5999, TTL)).toBe(false);
  });

  it('syncs once the window has elapsed', () => {
    expect(N(5000, 6000, TTL)).toBe(true);
    expect(N(5000, 60000, TTL)).toBe(true);
  });

  // A stamp in the future means the clock moved backwards. Trusting it would
  // strand the learner unsynced for as long as the skew lasts.
  it('syncs when the stamp is in the future', () => {
    expect(N(9000, 5000, TTL)).toBe(true);
  });

  it('falls back to the default window when the ttl is junk', () => {
    const d = window.PyPathMerge.RESYNC_AFTER_MS;
    expect(N(5000, 5000 + d - 1, 'soon')).toBe(false);
    expect(N(5000, 5000 + d, 'soon')).toBe(true);
    expect(N(5000, 5000 + d, -1)).toBe(true);
  });

  it('ships a window measured in minutes, not seconds or hours', () => {
    const d = window.PyPathMerge.RESYNC_AFTER_MS;
    expect(d).toBeGreaterThanOrEqual(60 * 1000);
    expect(d).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
