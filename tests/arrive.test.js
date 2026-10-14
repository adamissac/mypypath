import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';

/* The landing after the cockpit's launch cutscene. cockpit.js sets a flag in
   sessionStorage just before it navigates; the unit page it opens reads and
   clears it, and plays a short landing (a white flash settling away). */
const SRC = fs.readFileSync('assets/js/arrive.js', 'utf8');
const run = () => new Function(SRC).call(window);
const arriving = () => document.documentElement.classList.contains('is-arriving');

describe('arrive.js', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.documentElement.className = '';
    delete window.matchMedia;
  });
  afterEach(() => { vi.useRealTimers(); delete window.matchMedia; });

  it('plays the landing once after a launch, then stops', () => {
    sessionStorage.setItem('pypath-arrive', '1');
    run();
    expect(arriving()).toBe(true);
    expect(sessionStorage.getItem('pypath-arrive')).toBeNull();
    vi.advanceTimersByTime(1200);
    expect(arriving()).toBe(false);
  });

  it('does nothing for an ordinary visit', () => {
    run();
    expect(arriving()).toBe(false);
  });

  it('uses up the flag but plays nothing under reduced motion', () => {
    window.matchMedia = () => ({ matches: true });
    sessionStorage.setItem('pypath-arrive', '1');
    run();
    expect(arriving()).toBe(false);
    expect(sessionStorage.getItem('pypath-arrive')).toBeNull();
  });

  it('survives storage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(run).not.toThrow();
    spy.mockRestore();
    expect(arriving()).toBe(false);
  });
});
