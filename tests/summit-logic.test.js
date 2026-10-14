import { describe, it, expect } from 'vitest';
import { stopStates } from '../assets/summit/progress.js';
import { createSpin } from '../assets/summit/spin.js';
import { entrancePlan, entranceAt } from '../assets/summit/timeline.js';
import { qualifies } from '../assets/summit/qualify.js';

describe('stopStates', () => {
  it('lights nothing and waits at Unit 1 for a new learner', () => {
    const s = stopStates([]);
    expect(s.lit).toEqual(Array(10).fill(false));
    expect(s.hiker).toBe(0);
  });

  it('lights finished units and stands at the first unfinished one', () => {
    const s = stopStates([1, 2, 3]);
    expect(s.lit.slice(0, 4)).toEqual([true, true, true, false]);
    expect(s.hiker).toBe(3);
  });

  it('stands at the first gap even when later units are finished', () => {
    expect(stopStates([1, 3, 4]).hiker).toBe(1);
  });

  it('sends the hiker to the summit when every unit is finished', () => {
    const s = stopStates([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(s.lit).toEqual(Array(10).fill(true));
    expect(s.hiker).toBe(9);
  });

  it('ignores duplicates, strings and junk', () => {
    expect(stopStates(['2', 2, 1, 'x', null, 99, -1]).lit.slice(0, 3)).toEqual([true, true, false]);
    expect(stopStates(null).hiker).toBe(0);
    expect(stopStates('nope').hiker).toBe(0);
  });
});

describe('createSpin', () => {
  const run = (spin, seconds, dt = 1 / 60) => {
    let out;
    for (let t = 0; t < seconds; t += dt) out = spin.step(dt);
    return out;
  };

  it('coasts after a release and slows to a stop', () => {
    const spin = createSpin({ idleSpeed: 0 });
    spin.grab(0, 0);
    spin.drag(60, 0, 1 / 60); // fast flick
    spin.release();
    const a = spin.step(1 / 60).yaw;
    const b = run(spin, 0.5).yaw;
    expect(b).toBeGreaterThan(a);
    run(spin, 3);
    const c = spin.step(1 / 60).yaw;
    const d = spin.step(1 / 60).yaw;
    expect(Math.abs(d - c) * 60).toBeLessThan(0.001);
  });

  it('clamps the tilt so the island cannot flip', () => {
    const spin = createSpin({ maxTilt: 0.14, idleSpeed: 0 });
    spin.grab(0, 0);
    spin.drag(0, 5000, 1 / 60);
    expect(spin.step(1 / 60).tilt).toBeLessThanOrEqual(0.14);
    spin.drag(0, -20000, 1 / 60);
    expect(spin.step(1 / 60).tilt).toBeGreaterThanOrEqual(-0.14);
  });

  it('resumes idle rotation only after 3 seconds without input', () => {
    const spin = createSpin({ friction: 50, resumeAfter: 3 });
    spin.grab(0, 0);
    spin.release();
    const a = run(spin, 2).yaw;
    const b = run(spin, 0.5).yaw;
    expect(Math.abs(b - a)).toBeLessThan(1e-6);
    const c = run(spin, 1.5).yaw;
    expect(c).toBeGreaterThan(b);
  });

  it('rotates on its own when idle from the start', () => {
    const spin = createSpin();
    const a = spin.step(1).yaw;
    expect(a).toBeCloseTo((Math.PI * 2) / 52, 5);
  });
});

describe('entrance', () => {
  it('plans a full entrance only when ready in time, visible and unseen', () => {
    expect(entrancePlan({ readyAt: 1200, heroVisible: true, seen: false })).toBe('full');
    expect(entrancePlan({ readyAt: 2500, heroVisible: true, seen: false })).toBe('full');
    expect(entrancePlan({ readyAt: 2600, heroVisible: true, seen: false })).toBe('late');
    expect(entrancePlan({ readyAt: 900, heroVisible: false, seen: false })).toBe('late');
    expect(entrancePlan({ readyAt: 900, heroVisible: true, seen: true })).toBe('none');
  });

  it('runs the full timeline in order and finishes at 3.5 s', () => {
    let prev = entranceAt(0, 'full');
    expect(prev.rise).toBe(0);
    for (let t = 0.1; t <= 3.5; t += 0.1) {
      const now = entranceAt(t, 'full');
      for (const k of ['rise', 'clouds', 'trail', 'hiker']) expect(now[k]).toBeGreaterThanOrEqual(prev[k]);
      prev = now;
    }
    expect(entranceAt(3.49, 'full').done).toBe(false);
    expect(entranceAt(3.5, 'full')).toEqual({ rise: 1, clouds: 1, trail: 1, hiker: 1, done: true });
  });

  it('skips the rise when late and finishes at 2.3 s', () => {
    expect(entranceAt(0, 'late').rise).toBe(1);
    expect(entranceAt(0, 'late').clouds).toBe(1);
    expect(entranceAt(2.3, 'late').done).toBe(true);
    expect(entranceAt(0.75, 'late').trail).toBeCloseTo(0.5, 5);
  });

  it('is at rest immediately with no entrance', () => {
    expect(entranceAt(0, 'none')).toEqual({ rise: 1, clouds: 1, trail: 1, hiker: 1, done: true });
  });
});

describe('qualifies', () => {
  const ok = { reduced: false, saveData: false, effectiveType: '4g', webgl: true, isHome: true, course: null };
  it('accepts an ordinary desktop visitor', () => {
    expect(qualifies(ok)).toBe(true);
    expect(qualifies({ ...ok, effectiveType: undefined })).toBe(true);
  });
  it.each([
    ['reduced motion', { reduced: true }],
    ['save-data', { saveData: true }],
    ['slow-2g', { effectiveType: 'slow-2g' }],
    ['2g', { effectiveType: '2g' }],
    ['3g', { effectiveType: '3g' }],
    ['no webgl', { webgl: false }],
    ['not the home page', { isHome: false }],
    ['the data course', { course: 'data' }],
  ])('refuses %s', (_, patch) => {
    expect(qualifies({ ...ok, ...patch })).toBe(false);
  });
});
