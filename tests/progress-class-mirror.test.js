import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

/* The class mirror is a second, optional adapter alongside the remote one.
   What these tests pin down is that adding it changed nothing about the
   local-first contract: local writes still land synchronously, a failing
   mirror cannot fail a write, and a learner in no class pays nothing. */

function load() {
  new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/progress-store.js', 'utf8')).call(window);
  return window.ProgressStore;
}

function recorder() {
  const pushed = [];
  const removed = [];
  return {
    pushed,
    removed,
    push: (k, v) => pushed.push([k, v]),
    remove: (k) => removed.push(k),
  };
}

let STORE;

beforeEach(() => {
  localStorage.clear();
  STORE = load();
  STORE._setRemoteAdapter(null);
  STORE._setClassAdapter(null);
});

describe('with no class adapter installed', () => {
  it('writes locally and tells nobody', () => {
    STORE.setItem('pypath-completed-units', '[1]');
    expect(localStorage.getItem('pypath-completed-units')).toBe('[1]');
  });

  it('leaves the remote adapter as the only listener', () => {
    const remote = recorder();
    STORE._setRemoteAdapter(remote);
    STORE.setCompletedUnits([1, 2]);
    expect(remote.pushed).toEqual([['pypath-completed-units', '[1,2]']]);
  });
});

describe('with a class adapter installed', () => {
  let remote, mirror;

  beforeEach(() => {
    remote = recorder();
    mirror = recorder();
    STORE._setRemoteAdapter(remote);
    STORE._setClassAdapter(mirror);
  });

  it('sends a completed unit to both adapters', () => {
    STORE.setCompletedUnits([1, 2]);
    expect(mirror.pushed).toEqual([['pypath-completed-units', '[1,2]']]);
    expect(remote.pushed).toEqual([['pypath-completed-units', '[1,2]']]);
  });

  it('sends an ordinary syncable item to both adapters', () => {
    STORE.setItem('pypath-lesson-/units/unit-1/x.html-practice-1', 'print(1)');
    expect(mirror.pushed.length).toBe(1);
    expect(remote.pushed.length).toBe(1);
  });

  it('respects the sync allowlist, so an unlisted key is mirrored nowhere', () => {
    STORE.setItem('pypath-theme', 'dark');
    expect(mirror.pushed).toEqual([]);
    expect(remote.pushed).toEqual([]);
    expect(localStorage.getItem('pypath-theme')).toBe('dark');
  });

  it('mirrors a removal', () => {
    STORE.setItem('pypath-completed-units', '[1]');
    STORE.removeItem('pypath-completed-units');
    expect(mirror.removed).toEqual(['pypath-completed-units']);
  });

  it('does not echo a value that came from the remote back out again', () => {
    // Re-mirroring a pulled document would clobber its real updatedAt with
    // "now" and pay for a write to say nothing.
    STORE.applyRemote('pypath-completed-units', '[1,2,3]', 12345);
    expect(mirror.pushed).toEqual([]);
    expect(remote.pushed).toEqual([]);
    expect(localStorage.getItem('pypath-completed-units')).toBe('[1,2,3]');
  });

  it('still writes locally when the mirror throws', () => {
    STORE._setClassAdapter({ push() { throw new Error('permission-denied'); } });
    expect(() => STORE.setItem('pypath-completed-units', '[4]')).not.toThrow();
    expect(localStorage.getItem('pypath-completed-units')).toBe('[4]');
  });

  it('still reaches the remote adapter when the mirror throws', () => {
    STORE._setClassAdapter({ push() { throw new Error('offline'); } });
    STORE.setCompletedUnits([5]);
    expect(remote.pushed).toEqual([['pypath-completed-units', '[5]']]);
  });

  it('tolerates a mirror with no remove method', () => {
    STORE._setClassAdapter({ push() {} });
    expect(() => STORE.removeItem('pypath-completed-units')).not.toThrow();
  });

  it('still dispatches pypath:progress once per write', () => {
    let seen = 0;
    document.addEventListener('pypath:progress', () => { seen += 1; });
    STORE.setItem('pypath-completed-units', '[6]');
    expect(seen).toBe(1);
  });

  it('detaches cleanly when the learner leaves the class', () => {
    STORE._setClassAdapter(null);
    STORE.setCompletedUnits([7]);
    expect(mirror.pushed).toEqual([]);
    // The remote adapter is untouched by the class adapter's lifetime.
    expect(remote.pushed).toEqual([['pypath-completed-units', '[7]']]);
  });
});
