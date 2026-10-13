import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let C;
const units = Array.from({ length: 10 }, (_, i) => ({
  n: i + 1,
  title: `Unit title ${i + 1}`,
  href: `/data/unit-${i + 1}.html`,
  lessons: [`/data/unit-${i + 1}/a.html`, `/data/unit-${i + 1}/b.html`],
}));
const all = (n) => units[n - 1].lessons;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/cockpit.js', 'utf8')).call(window);
  C = window.PyPathCockpit;
});

describe('cockpit state', () => {
  it('points a new learner at Unit 1', () => {
    const s = C.state(units, [], {}, 70);
    expect(s.lights).toEqual(['current', ...Array(9).fill('idle')]);
    expect(s.target.n).toBe(1);
    expect(s.label).toBe('Launch: Unit 1, Unit title 1');
  });

  it('needs both every lesson and the test for a unit to be done', () => {
    const lessonsOnly = C.state(units, all(1), {}, 70);
    expect(lessonsOnly.lights[0]).toBe('current');
    const both = C.state(units, all(1), { 'data-1': { best: 82 } }, 70);
    expect(both.lights.slice(0, 2)).toEqual(['done', 'current']);
    expect(both.target.n).toBe(2);
  });

  it('ignores Foundations test records with the same number', () => {
    const s = C.state(units, all(1), { 1: { best: 100 } }, 70);
    expect(s.lights[0]).toBe('current');
  });

  it('treats a failing best score as not passed and passed:true without a score as passed', () => {
    expect(C.state(units, all(1), { 'data-1': { best: 64 } }, 70).lights[0]).toBe('current');
    expect(C.state(units, all(1), { 'data-1': { passed: true } }, 70).lights[0]).toBe('done');
  });

  it('sends a learner who skipped ahead to the first unfinished unit', () => {
    const s = C.state(units, [...all(2)], { 'data-2': { best: 90 } }, 70);
    expect(s.lights.slice(0, 3)).toEqual(['current', 'done', 'idle']);
    expect(s.target.n).toBe(1);
  });

  it('offers a relaunch when everything is done', () => {
    const passed = units.flatMap((u) => u.lessons);
    const records = Object.fromEntries(units.map((u) => [`data-${u.n}`, { best: 100 }]));
    const s = C.state(units, passed, records, 70);
    expect(s.lights).toEqual(Array(10).fill('done'));
    expect(s.target.n).toBe(1);
    expect(s.label).toBe('Launch again: Unit 1, Unit title 1');
  });

  it('survives garbage records', () => {
    const s = C.state(units, null, 'nope', 70);
    expect(s.target.n).toBe(1);
  });
});

describe('reading stored progress', () => {
  it('returns empty progress when storage holds junk', () => {
    window.ProgressStore = { getItem: () => '{not json' };
    expect(C.readProgress()).toEqual({ passedPaths: [], testRecords: {} });
    delete window.ProgressStore;
  });
});
