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

describe('snapshot', () => {
  it('includes syncable keys and excludes device-local ones', () => {
    window.ProgressStore.setItem('pypath-lesson-/a.html-editor-1', 'code');
    window.ProgressStore.setCompletedUnits([1]);
    localStorage.setItem('pypath-theme', 'dark');
    localStorage.setItem('pypath-sandbox-projects', '[]');

    const snap = window.ProgressStore.snapshot();
    expect(snap['pypath-lesson-/a.html-editor-1']).toBe('code');
    expect(snap['pypath-completed-units']).toBe('[1]');
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
});
