import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/gate.js', 'utf8')).call(window);
});

describe('unitFromPath', () => {
  const cases = [
    ['/units/unit-3.html', 3],
    ['/units/unit-10.html', 10],
    ['/units/unit-3/loops.html', 3],
    ['/units/unit-1/what-is-python.html', 1],
    ['/curriculum.html', null],
    ['/', null],
    ['/index.html', null],
    ['/sandbox.html', null],
    ['/units/', null],
    ['/units/notes.html', null],
  ];
  cases.forEach(([path, expected]) => {
    it(`maps ${path} to ${expected}`, () => {
      expect(window.PyPathGate.unitFromPath(path)).toBe(expected);
    });
  });
});

describe('isLocked', () => {
  it('leaves free units open for guests', () => {
    expect(window.PyPathGate.isLocked(1, false)).toBe(false);
    expect(window.PyPathGate.isLocked(2, false)).toBe(false);
  });

  it('locks units past the free boundary for guests', () => {
    expect(window.PyPathGate.isLocked(3, false)).toBe(true);
    expect(window.PyPathGate.isLocked(9, false)).toBe(true);
  });

  it('unlocks everything for a signed-in user', () => {
    expect(window.PyPathGate.isLocked(3, true)).toBe(false);
    expect(window.PyPathGate.isLocked(9, true)).toBe(false);
  });

  it('never locks a non-unit page', () => {
    expect(window.PyPathGate.isLocked(null, false)).toBe(false);
  });

  it('reads the boundary from FREE_UNITS rather than a literal', () => {
    const free = window.PyPathGate.FREE_UNITS;
    expect(window.PyPathGate.isLocked(free, false)).toBe(false);
    expect(window.PyPathGate.isLocked(free + 1, false)).toBe(true);
  });
});

describe('safeNext', () => {
  it('accepts a same-origin path', () => {
    expect(window.PyPathGate.safeNext('/units/unit-5.html')).toBe('/units/unit-5.html');
  });

  it('rejects a protocol-relative URL', () => {
    expect(window.PyPathGate.safeNext('//evil.example/phish')).toBe('/progress.html');
  });

  it('rejects an absolute URL', () => {
    expect(window.PyPathGate.safeNext('https://evil.example/phish')).toBe('/progress.html');
  });

  it('rejects a backslash-prefixed URL', () => {
    expect(window.PyPathGate.safeNext('\\\\evil.example')).toBe('/progress.html');
  });

  it('falls back when absent', () => {
    expect(window.PyPathGate.safeNext(null)).toBe('/progress.html');
    expect(window.PyPathGate.safeNext('')).toBe('/progress.html');
  });
});

describe('page behavior on a gated unit page', () => {
  const SRC = fs.readFileSync('assets/js/gate.js', 'utf8');

  function bootOnUnit(pathname) {
    history.pushState({}, '', pathname);
    document.documentElement.removeAttribute('data-gate');
    document.body.innerHTML = '<main><p id="lesson">lesson text</p></main>';
    new Function(SRC).call(window);
  }

  afterEach(() => {
    vi.useRealTimers();
    history.pushState({}, '', '/');
  });

  it('starts pending so no lesson text flashes', () => {
    vi.useFakeTimers();
    bootOnUnit('/units/unit-5.html');
    expect(document.documentElement.dataset.gate).toBe('pending');
  });

  it('locks and inserts the paywall when the visitor is a guest', () => {
    vi.useFakeTimers();
    bootOnUnit('/units/unit-5.html');
    document.dispatchEvent(new CustomEvent('pypath:auth', { detail: { user: null } }));
    expect(document.documentElement.dataset.gate).toBe('locked');
    const paywall = document.querySelector('[data-gate-paywall]');
    expect(paywall).not.toBeNull();
    expect(paywall.textContent).toContain('Unit 5');
    expect(paywall.querySelector('a').getAttribute('href'))
      .toBe('/signup.html?next=%2Funits%2Funit-5.html');
  });

  it('opens and removes the paywall once a user signs in', () => {
    vi.useFakeTimers();
    bootOnUnit('/units/unit-5.html');
    document.dispatchEvent(new CustomEvent('pypath:auth', { detail: { user: null } }));
    document.dispatchEvent(new CustomEvent('pypath:auth', { detail: { user: { uid: 'u1' } } }));
    expect(document.documentElement.dataset.gate).toBe('open');
    expect(document.querySelector('[data-gate-paywall]')).toBeNull();
  });

  it('leaves a free unit open for a guest', () => {
    vi.useFakeTimers();
    bootOnUnit('/units/unit-2/understanding-control-flow.html');
    document.dispatchEvent(new CustomEvent('pypath:auth', { detail: { user: null } }));
    expect(document.documentElement.dataset.gate).toBe('open');
    expect(document.querySelector('[data-gate-paywall]')).toBeNull();
  });

  it('fails open when pypath:auth never arrives', () => {
    vi.useFakeTimers();
    bootOnUnit('/units/unit-5.html');
    expect(document.documentElement.dataset.gate).toBe('pending');
    // auth.js imports the SDK from gstatic.com; an ad blocker or a dead network
    // means the event never fires. A permanent paywall would be the worse bug.
    vi.advanceTimersByTime(3000);
    expect(document.documentElement.dataset.gate).toBe('open');
    expect(document.querySelector('[data-gate-paywall]')).toBeNull();
  });

  it('does not touch a page that is not a unit surface', () => {
    vi.useFakeTimers();
    history.pushState({}, '', '/curriculum.html');
    document.documentElement.removeAttribute('data-gate');
    document.body.innerHTML = '<main><p>curriculum</p></main>';
    new Function(SRC).call(window);
    expect(document.documentElement.dataset.gate).toBeUndefined();
  });
});
