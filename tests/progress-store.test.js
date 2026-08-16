import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

function loadStore() {
  new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/progress-store.js', 'utf8')).call(window);
}

beforeEach(() => {
  localStorage.clear();
  loadStore();
});

describe('completed units', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(window.ProgressStore.getCompletedUnits()).toEqual([]);
  });

  it('stores numbers, not strings', () => {
    window.ProgressStore.setCompletedUnits([1, 2]);
    const read = window.ProgressStore.getCompletedUnits();
    expect(read).toEqual([1, 2]);
    expect(typeof read[0]).toBe('number');
  });

  it('deduplicates', () => {
    window.ProgressStore.setCompletedUnits([1, 1, 2]);
    expect(window.ProgressStore.getCompletedUnits()).toEqual([1, 2]);
  });

  it('writes through to localStorage under the legacy key', () => {
    window.ProgressStore.setCompletedUnits([3]);
    expect(JSON.parse(localStorage.getItem('pypath-completed-units'))).toEqual([3]);
  });

  it('reads pre-existing localStorage data written before the store existed', () => {
    localStorage.setItem('pypath-completed-units', '[4,5]');
    loadStore();
    expect(window.ProgressStore.getCompletedUnits()).toEqual([4, 5]);
  });

  it('survives corrupt JSON without throwing', () => {
    localStorage.setItem('pypath-completed-units', 'not json');
    loadStore();
    expect(window.ProgressStore.getCompletedUnits()).toEqual([]);
  });

  it('rejects out-of-range, non-integer, and non-numeric junk', () => {
    localStorage.setItem('pypath-completed-units', JSON.stringify([0, 11, 1.5, null, '', [], 3, 7]));
    loadStore();
    expect(window.ProgressStore.getCompletedUnits()).toEqual([3, 7]);
  });

  it('setCompletedUnits applies the same range filter', () => {
    window.ProgressStore.setCompletedUnits([0, 1, 11, 5, 1.5]);
    expect(window.ProgressStore.getCompletedUnits()).toEqual([1, 5]);
  });
});

describe('generic items', () => {
  it('round-trips a value', () => {
    window.ProgressStore.setItem('pypath-lesson-/a.html-editor-1', 'print(1)');
    expect(window.ProgressStore.getItem('pypath-lesson-/a.html-editor-1')).toBe('print(1)');
  });

  it('returns null for a missing key', () => {
    expect(window.ProgressStore.getItem('pypath-lesson-/nope.html-editor-1')).toBe(null);
  });

  it('removes a value', () => {
    window.ProgressStore.setItem('exercise_/a.html_q1', 'x');
    window.ProgressStore.removeItem('exercise_/a.html_q1');
    expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe(null);
    expect(localStorage.getItem('exercise_/a.html_q1')).toBe(null);
  });
});

describe('stamps', () => {
  it('snapshot returns {content, updatedAt} objects with a fresh timestamp', () => {
    window.ProgressStore.setItem('exercise_/a.html_q1', 'x');
    const snap = window.ProgressStore.snapshot();
    expect(snap['exercise_/a.html_q1'].content).toBe('x');
    expect(typeof snap['exercise_/a.html_q1'].updatedAt).toBe('number');
    expect(snap['exercise_/a.html_q1'].updatedAt).toBeGreaterThan(0);
  });

  it('reports updatedAt: 0 for a key written before stamps existed', () => {
    localStorage.setItem('pypath-completed-units', '[4,5]');
    loadStore();
    const snap = window.ProgressStore.snapshot();
    expect(snap['pypath-completed-units'].content).toBe('[4,5]');
    expect(snap['pypath-completed-units'].updatedAt).toBe(0);
  });

  it('isSyncable(pypath-progress-stamps) is false', () => {
    expect(window.PyPathKeys.isSyncable('pypath-progress-stamps')).toBe(false);
  });

  it('the stamp map never appears in snapshot()', () => {
    window.ProgressStore.setItem('exercise_/a.html_q1', 'x');
    window.ProgressStore.setCompletedUnits([1]);
    const snap = window.ProgressStore.snapshot();
    expect(snap['pypath-progress-stamps']).toBeUndefined();
  });
});

describe('applyRemote', () => {
  it('writes locally without calling the adapter push', () => {
    const seen = [];
    window.ProgressStore._setRemoteAdapter({ push(k, v) { seen.push([k, v]); } });
    window.ProgressStore.applyRemote('exercise_/a.html_q1', 'from-server');
    expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe('from-server');
    expect(seen).toEqual([]);
  });

  it('records a supplied updatedAt as the stamp', () => {
    window.ProgressStore.applyRemote('exercise_/a.html_q1', 'v', 12345);
    const snap = window.ProgressStore.snapshot();
    expect(snap['exercise_/a.html_q1'].updatedAt).toBe(12345);
  });
});

describe('snapshot', () => {
  it('includes syncable keys and excludes device-local ones', () => {
    window.ProgressStore.setItem('pypath-lesson-/a.html-editor-1', 'code');
    window.ProgressStore.setCompletedUnits([1]);
    localStorage.setItem('pypath-theme', 'dark');
    localStorage.setItem('pypath-sandbox-projects', '[]');

    const snap = window.ProgressStore.snapshot();
    expect(snap['pypath-lesson-/a.html-editor-1'].content).toBe('code');
    expect(snap['pypath-completed-units'].content).toBe('[1]');
    expect(snap['pypath-theme']).toBeUndefined();
    expect(snap['pypath-sandbox-projects']).toBeUndefined();
  });
});

describe('remote adapter', () => {
  it('is not called when no adapter is set', () => {
    expect(() => window.ProgressStore.setItem('exercise_/a.html_q1', 'v')).not.toThrow();
  });

  it('receives writes for syncable keys once set', () => {
    const seen = [];
    window.ProgressStore._setRemoteAdapter({
      push(key, value) { seen.push([key, value]); }
    });
    window.ProgressStore.setItem('exercise_/a.html_q1', 'v');
    expect(seen).toEqual([['exercise_/a.html_q1', 'v']]);
  });

  it('never forwards device-local keys to the adapter', () => {
    const seen = [];
    window.ProgressStore._setRemoteAdapter({ push(k, v) { seen.push([k, v]); } });
    window.ProgressStore.setItem('pypath-theme', 'dark');
    expect(seen).toEqual([]);
  });

  it('still writes locally when the adapter throws', () => {
    window.ProgressStore._setRemoteAdapter({
      push() { throw new Error('offline'); }
    });
    expect(() => window.ProgressStore.setItem('exercise_/a.html_q1', 'v')).not.toThrow();
    expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe('v');
  });

  it('removeItem calls adapter.remove, not push(key, null)', () => {
    const pushed = [];
    const removed = [];
    window.ProgressStore._setRemoteAdapter({
      push(k, v) { pushed.push([k, v]); },
      remove(k) { removed.push(k); }
    });
    window.ProgressStore.setItem('exercise_/a.html_q1', 'v');
    window.ProgressStore.removeItem('exercise_/a.html_q1');
    expect(removed).toEqual(['exercise_/a.html_q1']);
    expect(pushed).toEqual([['exercise_/a.html_q1', 'v']]);
  });

  it('still removes locally when the adapter has no remove method', () => {
    window.ProgressStore._setRemoteAdapter({ push() {} });
    window.ProgressStore.setItem('exercise_/a.html_q1', 'v');
    expect(() => window.ProgressStore.removeItem('exercise_/a.html_q1')).not.toThrow();
    expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe(null);
  });
});

describe('pypath:progress event', () => {
  it('fires for setCompletedUnits with the units key', () => {
    const seen = [];
    const handler = (e) => seen.push(e.detail.key);
    document.addEventListener('pypath:progress', handler);
    window.ProgressStore.setCompletedUnits([1]);
    document.removeEventListener('pypath:progress', handler);
    expect(seen).toEqual(['pypath-completed-units']);
  });

  it('fires for setItem with the written key', () => {
    const seen = [];
    const handler = (e) => seen.push(e.detail.key);
    document.addEventListener('pypath:progress', handler);
    window.ProgressStore.setItem('exercise_/a.html_q1', 'v');
    document.removeEventListener('pypath:progress', handler);
    expect(seen).toEqual(['exercise_/a.html_q1']);
  });

  it('fires for removeItem with the removed key', () => {
    window.ProgressStore.setItem('exercise_/a.html_q1', 'v');
    const seen = [];
    const handler = (e) => seen.push(e.detail.key);
    document.addEventListener('pypath:progress', handler);
    window.ProgressStore.removeItem('exercise_/a.html_q1');
    document.removeEventListener('pypath:progress', handler);
    expect(seen).toEqual(['exercise_/a.html_q1']);
  });

  it('a throwing listener does not prevent the local write', () => {
    // jsdom (like real browsers) reports a listener's exception as a global
    // "error" event rather than propagating it to dispatchEvent's caller;
    // swallow that expected report so it doesn't fail the test run.
    const handler = () => { throw new Error('boom'); };
    const suppress = (e) => { e.preventDefault(); };
    window.addEventListener('error', suppress);
    document.addEventListener('pypath:progress', handler);
    expect(() => window.ProgressStore.setItem('exercise_/a.html_q1', 'v')).not.toThrow();
    document.removeEventListener('pypath:progress', handler);
    window.removeEventListener('error', suppress);
    expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe('v');
  });
});

describe('degraded mode (storage-keys.js missing)', () => {
  it('still defines window.ProgressStore', () => {
    const saved = window.PyPathKeys;
    delete window.PyPathKeys;
    try {
      new Function(fs.readFileSync('assets/js/progress-store.js', 'utf8')).call(window);
      expect(window.ProgressStore).toBeTruthy();
      expect(() => window.ProgressStore.setItem('exercise_/a.html_q1', 'v')).not.toThrow();
      expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe('v');
      expect(window.ProgressStore.getCompletedUnits()).toEqual([]);
    } finally {
      window.PyPathKeys = saved;
    }
  });
});
