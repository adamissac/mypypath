import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

const panelSrc = fs.readFileSync('assets/js/unit-progress-panel.js', 'utf8');
const pageSrc = fs.readFileSync('assets/js/progress-page.js', 'utf8');
const dashSrc = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');
const detailSrc = fs.readFileSync('assets/js/student-detail.js', 'utf8');
const progressCss = fs.readFileSync('assets/css/progress.css', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const lessonCss = fs.readFileSync('assets/css/lesson-progress.css', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('the unit overview page shows the learner their progress', () => {
  beforeAll(() => {
    for (const f of ['assets/js/unit-progress.js', 'assets/js/curriculum.js',
      'assets/js/storage-keys.js', 'assets/js/progress-store.js',
      'assets/js/lesson-progress.js']) {
      new Function(fs.readFileSync(f, 'utf8')).call(window);
    }
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div class="unit-progress" data-unit-progress="1" hidden>
        <span data-unit-progress-pct>0%</span>
        <div class="unit-progress__meter" role="progressbar" aria-valuenow="0">
          <div class="bar"></div>
        </div>
        <p data-unit-progress-detail></p>
      </div>`;
    new Function(panelSrc).call(window);
  });

  it('fills in the percentage and the detail line', () => {
    const paths = window.PyPathCurriculum.lessonsIn(1);
    const map = {};
    for (const p of paths.slice(0, 4)) map[p] = { done: ['a'], passed: true };
    localStorage.setItem('pypath-progress-lessons', JSON.stringify(map));

    window.PyPathUnitPanel.render();
    const panel = document.querySelector('[data-unit-progress]');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('[data-unit-progress-pct]').textContent).toBe('44%');
    expect(panel.querySelector('[data-unit-progress-detail]').textContent)
      .toContain('4 of 8 lessons done');
  });

  it('shows a real progressbar, not a decorative div', () => {
    window.PyPathUnitPanel.render();
    const meter = document.querySelector('.unit-progress__meter');
    expect(meter.getAttribute('role')).toBe('progressbar');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    // The text alternative carries the detail, so a screen reader gets the
    // whole fact rather than a bare number.
    expect(meter.getAttribute('aria-valuetext')).toContain('lessons done');
  });

  it('works signed out, from local storage alone', () => {
    expect(panelSrc).not.toMatch(/firebase|currentUser|auth/i);
  });

  it('moves without a reload when progress changes', () => {
    const paths = window.PyPathCurriculum.lessonsIn(1);
    localStorage.setItem('pypath-progress-lessons', JSON.stringify({
      [paths[0]]: { done: ['a'], passed: true },
    }));
    document.dispatchEvent(new window.CustomEvent('pypath:progress', { detail: {} }));
    expect(document.querySelector('[data-unit-progress-pct]').textContent).toBe('11%');
  });

  it('stays hidden for a unit with no lessons rather than showing an empty bar', () => {
    document.body.innerHTML = '<div class="unit-progress" data-unit-progress="99" hidden>'
      + '<span data-unit-progress-pct></span></div>';
    window.PyPathUnitPanel.render();
    expect(document.querySelector('[data-unit-progress]').hidden).toBe(true);
  });

  it('is on all ten unit pages, after lesson-progress.js', () => {
    for (let u = 1; u <= 10; u += 1) {
      const html = fs.readFileSync(`units/unit-${u}.html`, 'utf8');
      expect(html, `unit ${u}`).toContain(`data-unit-progress="${u}"`);
      expect(html.indexOf('/assets/js/lesson-progress.js'))
        .toBeLessThan(html.indexOf('/assets/js/unit-progress-panel.js'));
      expect(html.indexOf('/assets/js/unit-progress.js'))
        .toBeLessThan(html.indexOf('/assets/js/lesson-progress.js'));
    }
  });
});

describe('the progress page no longer says Not started to someone mid-unit', () => {
  it('renders a percentage instead of a binary flag', () => {
    expect(pageSrc).toMatch(/status\.textContent = percent \+ '%'/);
    expect(pageSrc).toMatch(/allUnitBreakdowns/);
  });

  it('shows the detail line under each unit', () => {
    expect(pageSrc).toMatch(/progress-unit__detail/);
    expect(pageSrc).toMatch(/unitInfo\.summary/);
  });

  it('gives each unit row a labelled progressbar', () => {
    expect(pageSrc).toMatch(/meter\.setAttribute\('role', 'progressbar'\)/);
    expect(pageSrc).toMatch(/aria-valuetext/);
    expect(pageSrc).toMatch(/'Unit ' \+ n \+ ' progress'/);
  });

  it('still works if lesson-progress.js is missing', () => {
    // A CDN blip must degrade to the old behaviour, not an empty page.
    expect(pageSrc).toMatch(/if \(!unitInfo\)/);
    expect(pageSrc).toMatch(/done \? 'Complete' : 'Not started'/);
  });

  it('loads what it needs, in order', () => {
    const html = fs.readFileSync('progress.html', 'utf8');
    expect(html.indexOf('/assets/js/unit-progress.js'))
      .toBeLessThan(html.indexOf('/assets/js/lesson-progress.js'));
    expect(html.indexOf('/assets/js/lesson-progress.js'))
      .toBeLessThan(html.indexOf('/assets/js/progress-page.js'));
  });

  it('lays the row out as a grid so the bar can span it', () => {
    expect(progressCss).toMatch(/\.progress-unit \{[^}]*display: grid/);
    expect(progressCss).toMatch(/\.progress-unit__meter \{[^}]*grid-column: 1 \/ -1/);
    expect(progressCss).toMatch(/\.progress-unit__detail \{[^}]*grid-column: 1 \/ -1/);
  });

  it('respects reduced motion on both bars', () => {
    expect(progressCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(lessonCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('the teacher sees the same per-unit figure', () => {
  it('puts the percentage in each unit cell of the grid', () => {
    expect(dashSrc).toMatch(/CORE\.unitProgress\(student\.events/);
    expect(dashSrc).toMatch(/el\('span', 'cr-cell__pct', progress\.percent \+ '%'\)/);
  });

  it('announces the percentage and the detail to a screen reader', () => {
    expect(dashSrc).toMatch(/progress\.percent \+ '% — ' \+ progress\.summary/);
  });

  it('shows it only at unit granularity, where a unit percentage means something', () => {
    expect(dashSrc).toMatch(/scope === 'units'\s*\n?\s*\? CORE\.unitProgress/);
  });

  it('gives the drill-down a row per unit', () => {
    expect(detailSrc).toMatch(/function paintUnits/);
    expect(detailSrc).toMatch(/CORE\.unitProgress\(student\.events, byUnit\[unit\] \|\| \[\], unit\)/);
    const html = fs.readFileSync('classroom.html', 'utf8');
    expect(html).toContain('data-sd-units-body');
    expect(html).toContain('<th scope="col">Progress</th>');
  });

  it('says the test state in a word rather than a bare tick', () => {
    expect(detailSrc).toMatch(/progress\.testPassed \? 'Passed' : 'Not yet'/);
  });

  it('explains how the percentage is computed', () => {
    new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
    const explain = window.PyPathClassroom.EXPLANATIONS.unitPercent;
    expect(explain).toContain('eleven parts');
    expect(explain).toContain('91%');
    // And says out loud that it matches what the student sees.
    expect(explain).toContain('same figure the student sees');
    const html = fs.readFileSync('classroom.html', 'utf8');
    expect(html).toContain('data-cr-info="unitPercent"');
  });

  it('loads the shared formula on the classroom page', () => {
    const html = fs.readFileSync('classroom.html', 'utf8');
    expect(html).toContain('/assets/js/unit-progress.js');
    expect(html.indexOf('/assets/js/unit-progress.js'))
      .toBeLessThan(html.indexOf('/assets/js/classroom-core.js'));
  });
});
