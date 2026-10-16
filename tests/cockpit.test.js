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

describe('Foundations summit progress', () => {
  const foundationUnits = units.map((unit) => ({ ...unit,
    href: unit.href.replace('/data/', '/units/'),
    lessons: unit.lessons.map((path) => path.replace('/data/', '/units/')),
  }));

  it('uses Foundations records and advances only after lessons and the test', () => {
    const paths = foundationUnits[0].lessons;
    expect(C.state(foundationUnits, paths, { 'data-1': { best: 100 } }, 70, 'foundations').target.n).toBe(1);
    const s = C.state(foundationUnits, paths, { 1: { best: 80 } }, 70, 'foundations');
    expect(s.target.href).toBe('/units/unit-2.html');
    expect(s.label).toBe('Continue climbing: Unit 2, Unit title 2');
    expect(s.lights.slice(0, 2)).toEqual(['done', 'current']);
  });

  it('offers a return to the start when all ten units are finished', () => {
    const records = Object.fromEntries(foundationUnits.map((u) => [u.n, { best: 100 }]));
    const s = C.state(foundationUnits, foundationUnits.flatMap((u) => u.lessons), records, 70, 'foundations');
    expect(s.target.href).toBe('/units/unit-1.html');
    expect(s.label).toBe('Climb again: Unit 1, Unit title 1');
  });
});

describe('cockpit wiring', () => {
  it('lights units and points Launch at the current unit', () => {
    const lights = units.map((u) => `<a class="cockpit__light" href="${u.href}" data-unit="${u.n}" data-title="${u.title}" data-lessons="${u.lessons.join('|')}"><span>${u.n}</span></a>`).join('');
    document.body.innerHTML = `<section data-cockpit><ol>${lights}</ol>
      <a class="cockpit__launch" data-cockpit-launch href="/data/unit-1.html"><span class="cockpit__launch-label">Launch</span></a></section>`;
    window.ProgressStore = {
      getItem: (k) => k === 'pypath-unit-tests' ? JSON.stringify({ 'data-1': { best: 90 } })
        : JSON.stringify({ '/data/unit-1/a.html': { passed: true }, '/data/unit-1/b.html': { passed: true } }),
    };
    window.PyPathLessonProgress = {
      STORE_KEY: 'lessons', UNIT_TESTS_KEY: 'pypath-unit-tests', UNIT_TEST_PASS_MARK: 70,
      passedLessons: (m) => Object.keys(m).filter((k) => m[k].passed),
    };
    C.render(document);
    const states = [...document.querySelectorAll('.cockpit__light')].map((a) => a.dataset.state);
    expect(states.slice(0, 3)).toEqual(['done', 'current', 'idle']);
    const launch = document.querySelector('[data-cockpit-launch]');
    expect(launch.getAttribute('href')).toBe('/data/unit-2.html');
    expect(launch.textContent.trim()).toBe('Launch: Unit 2, Unit title 2');
    expect(document.querySelector('.cockpit__light[data-unit="2"]').getAttribute('aria-current')).toBe('step');
    // A screen reader hears the state the colour shows.
    expect(document.querySelector('.cockpit__light[data-unit="1"]').getAttribute('aria-label')).toBe('Unit 1: Unit title 1, finished');
    expect(document.querySelector('.cockpit__light[data-unit="2"]').getAttribute('aria-label')).toBe('Unit 2: Unit title 2, up next');
    expect(document.querySelector('.cockpit__light[data-unit="3"]').getAttribute('aria-label')).toBe('Unit 3: Unit title 3');
    delete window.ProgressStore;
    delete window.PyPathLessonProgress;
  });
});
