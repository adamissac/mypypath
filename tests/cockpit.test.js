import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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

describe('the launch cutscene', () => {
  const MARKUP = `<section class="cockpit" data-cockpit><div class="cockpit__window"></div>
    <a class="cockpit__launch" data-cockpit-launch href="/data/unit-2.html"><span class="cockpit__launch-label">Launch: Unit 2, Cleaning and Shaping</span></a></section>`;
  let nav;
  const setup = () => {
    document.body.innerHTML = MARKUP;
    nav = vi.fn();
    C.navigate = nav;
    sessionStorage.clear();
    C.wire(document.querySelector('[data-cockpit]'));
    return document.querySelector('[data-cockpit-launch]');
  };
  const overlay = () => document.querySelector('.cockpit-cutscene');
  const count = () => overlay().querySelector('[data-cutscene-count]').textContent;

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    // What the browser does when a page is restored: every cutscene still
    // running (one per wired cockpit in these tests) is torn down.
    window.dispatchEvent(new Event('pageshow'));
    vi.useRealTimers();
    delete window.matchMedia;
  });

  it('covers the page with a labelled dialog and focuses Skip', () => {
    setup().click();
    expect(overlay().getAttribute('role')).toBe('dialog');
    expect(overlay().getAttribute('aria-modal')).toBe('true');
    expect(overlay().getAttribute('aria-label')).toBe('Launching to Unit 2, Cleaning and Shaping');
    expect(document.activeElement).toBe(overlay().querySelector('[data-cutscene-skip]'));
    // The countdown numerals are decoration; one polite announcement says it all.
    expect(overlay().querySelector('[data-cutscene-count]').getAttribute('aria-hidden')).toBe('true');
    expect(overlay().querySelector('[aria-live="polite"]').textContent).toContain('Launching to Unit 2');
  });

  it('counts 3, 2, 1, goes, then navigates exactly once at 3.3 s', () => {
    setup().click();
    expect(count()).toBe('3');
    vi.advanceTimersByTime(600);
    expect(count()).toBe('2');
    vi.advanceTimersByTime(600);
    expect(count()).toBe('1');
    expect(overlay().classList.contains('is-go')).toBe(false);
    vi.advanceTimersByTime(600);
    expect(count()).toBe('Go');
    expect(overlay().classList.contains('is-go')).toBe(true);
    vi.advanceTimersByTime(1499);
    expect(nav).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith('/data/unit-2.html');
    vi.advanceTimersByTime(5000);
    expect(nav).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('pypath-arrive')).toBe('1');
  });

  it('skips straight to the unit from the Skip button', () => {
    setup().click();
    vi.advanceTimersByTime(300);
    overlay().querySelector('[data-cutscene-skip]').click();
    expect(nav).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(nav).toHaveBeenCalledTimes(1);
  });

  it('skips on Escape too', () => {
    setup().click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(nav).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the cutscene', () => {
    setup().click();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('ignores a second click while it plays', () => {
    const link = setup();
    link.click();
    link.click();
    expect(document.querySelectorAll('.cockpit-cutscene')).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(nav).toHaveBeenCalledTimes(1);
  });

  it('leaves a modified click to the browser, with no cutscene', () => {
    const link = setup();
    let prevented = null;
    document.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }));
    expect(prevented).toBe(false);
    expect(overlay()).toBeNull();
  });

  it('is gone, and works again, after the back button restores the page', () => {
    const link = setup();
    link.click();
    window.dispatchEvent(new Event('pageshow'));
    expect(overlay()).toBeNull();
    link.click();
    expect(overlay()).not.toBeNull();
    vi.advanceTimersByTime(4000);
    expect(nav).toHaveBeenCalledTimes(1);
  });

  it('does nothing under reduced motion: the link just navigates', () => {
    window.matchMedia = () => ({ matches: true });
    const link = setup();
    let prevented = null;
    document.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(prevented).toBe(false);
    expect(overlay()).toBeNull();
  });
});
