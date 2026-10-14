import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { renderUnitRegion } from '../scripts/unit-pages-content.mjs';

const panelSrc = fs.readFileSync('assets/js/unit-progress-panel.js', 'utf8');

function page(course, n, count) {
  const root = course === 'units' ? '/units' : '/data';
  return renderUnitRegion({
    course, courseTitle: 'Course', courseHref: '/c.html', n, title: 'Things', blurb: 'b', hours: '1 hr', level: 'Beginner',
    testText: 't', testHref: `/unit-test.html?unit=${n}${course === 'data' ? '&course=data' : ''}`,
    lessons: Array.from({ length: count }, (_, i) => ({ path: `${root}/unit-${n}/l${i + 1}.html`, title: `Lesson ${i + 1}`, summary: 's', time: '10 min' })),
  });
}
const store = (lessons, tests) => {
  localStorage.setItem('pypath-progress-lessons', JSON.stringify(lessons));
  if (tests) localStorage.setItem('pypath-unit-tests', JSON.stringify(tests));
};
const statuses = () => [...document.querySelectorAll('[data-lesson-status]')].map((s) => s.textContent);
const cont = () => document.querySelector('[data-unit-continue]');

beforeAll(() => {
  for (const f of ['assets/js/unit-progress.js', 'assets/js/storage-keys.js', 'assets/js/progress-store.js', 'assets/js/roles.js']) {
    new Function(fs.readFileSync(f, 'utf8')).call(window);
  }
});

describe('the lesson trail on a Python for Data unit page', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `<main>${page('data', 3, 4)}</main>`;
    new Function(panelSrc).call(window);
  });

  it('starts a new learner at lesson 1', () => {
    window.PyPathUnitPanel.render();
    expect(statuses()).toEqual(['Up next', '', '', '']);
    expect(cont().textContent).toBe('Start Unit 3');
    expect(cont().getAttribute('href')).toBe('/data/unit-3/l1.html');
    expect(document.querySelector('[data-unit-progress-pct]').textContent).toBe('0%');
  });

  it('continues at the first unfinished lesson, even out of order', () => {
    store({ '/data/unit-3/l1.html': { done: ['a'], passed: true }, '/data/unit-3/l3.html': { done: ['a'], passed: true }, '/data/unit-3/l2.html': { done: ['a'], passed: false } });
    window.PyPathUnitPanel.render();
    expect(statuses()).toEqual(['Done', 'Up next', 'Done', '']);
    expect(document.querySelector('[data-lesson-path="/data/unit-3/l2.html"]').classList.contains('is-up-next')).toBe(true);
    expect(cont().textContent).toBe('Continue: Lesson 2, Lesson 2');
    expect(cont().getAttribute('href')).toBe('/data/unit-3/l2.html');
    expect(document.querySelector('[data-unit-progress-pct]').textContent).toBe('40%');
  });

  it('sends a learner with every lesson done to the test, read from the data-N record', () => {
    const all = Object.fromEntries([1, 2, 3, 4].map((i) => [`/data/unit-3/l${i}.html`, { done: ['a'], passed: true }]));
    store(all, { 3: { best: 100 } });
    window.PyPathUnitPanel.render();
    expect(cont().textContent).toBe('Take the Unit 3 test');
    expect(cont().getAttribute('href')).toBe('/unit-test.html?unit=3&course=data');
    store(all, { 'data-3': { best: 88 } });
    window.PyPathUnitPanel.render();
    expect(cont().textContent).toBe('Review the unit');
    expect(document.querySelector('[data-unit-progress-pct]').textContent).toBe('100%');
  });

  it('survives junk in storage', () => {
    localStorage.setItem('pypath-progress-lessons', '{nope');
    localStorage.setItem('pypath-unit-tests', '[1');
    expect(() => window.PyPathUnitPanel.render()).not.toThrow();
    expect(statuses()[0]).toBe('Up next');
  });

  it('shows a teacher the unit, not personal progress', () => {
    store({ '/data/unit-3/l1.html': { done: ['a'], passed: true } });
    const was = window.PyPathRoles.teachingNow;
    window.PyPathRoles.teachingNow = () => true;
    window.PyPathUnitPanel.render();
    window.PyPathRoles.teachingNow = was;
    expect(statuses()).toEqual(['', '', '', '']);
    expect(cont().textContent).toBe('Start Unit 3');
    expect(document.querySelector('[data-unit-progress]').hidden).toBe(true);
  });
});
