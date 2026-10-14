import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { lessonSummary, lessonMinutes, lessonTitle, renderUnitRegion } from '../scripts/unit-pages-content.mjs';

const unitsLesson = (learn, overview = '<p>Python is a language. It runs anywhere.</p>') => `<html><head><title>Unit 1 • Variables &amp; Types • PyPath</title>
  <meta name="description" content="Unit 1 • Variables & Types - Learn Python programming with interactive examples and exercises." /></head>
  <body><main><div class="lesson-content"><h2 class="gradient-text">Overview</h2>${overview}
  ${learn ? `<h2>What You Will Learn in This Lesson</h2><p>By the end of this lesson, you will know:</p><ul>${learn}</ul>` : ''}
  <p>${'word '.repeat(600)}</p><pre><code>${'code '.repeat(2000)}</code></pre></div></main></body></html>`;

describe('lessonSummary', () => {
  it('uses a Python for Data lesson\'s own description', () => {
    const html = '<html><head><meta name="description" content="The csv module turns a file of text into rows you can work with." /></head><body></body></html>';
    expect(lessonSummary(html, 'data')).toBe('The csv module turns a file of text into rows you can work with.');
  });

  it('joins the first "What You Will Learn" topics for a Foundations lesson', () => {
    const html = unitsLesson('<li><strong>What sets are:</strong> Understand how.</li><li><strong>Creating sets:</strong> Learn.</li><li><strong>Set operations:</strong> Discover.</li><li><strong>When to use sets:</strong> x.</li>');
    expect(lessonSummary(html, 'units')).toBe('What sets are, creating sets, set operations, when to use sets');
  });

  it('stops before 90 characters and keeps Python capitalised', () => {
    const html = unitsLesson('<li><strong>What variables are and why we use them:</strong> a</li><li><strong>How to create and assign variables:</strong> b</li><li><strong>Python\'s basic data types:</strong> c</li>');
    const s = lessonSummary(html, 'units');
    expect(s).toBe('What variables are and why we use them, how to create and assign variables');
    expect(s.length).toBeLessThanOrEqual(90);
    const py = unitsLesson('<li><strong>Loops:</strong> a</li><li><strong>Python\'s range:</strong> b</li>');
    expect(lessonSummary(py, 'units')).toBe("Loops, Python's range");
  });

  it('falls back to the first sentence of the Overview', () => {
    expect(lessonSummary(unitsLesson(''), 'units')).toBe('Python is a language.');
  });
});

describe('lessonTitle', () => {
  it('strips the unit and site from a Foundations <title>', () => {
    expect(lessonTitle(unitsLesson(''), 'units', 'fallback')).toBe('Variables & Types');
  });
  it('uses the course manifest title for Python for Data', () => {
    expect(lessonTitle('<title>Python for Data • Reading a CSV File</title>', 'data', 'Reading a CSV File')).toBe('Reading a CSV File');
  });
});

describe('lessonMinutes', () => {
  it('counts prose, not code, plus editors and exercises, in steps of 5', () => {
    // 600 prose words + a few title words = 3 min; 2 editors = 4; 1 exercise = 3 -> 10.
    expect(lessonMinutes(unitsLesson(''), { editors: 2, exercises: 1 })).toBe(10);
  });
  it('never says less than 5 minutes', () => {
    expect(lessonMinutes('<main><p>tiny</p></main>', { editors: 0, exercises: 0 })).toBe(5);
  });
});

describe('renderUnitRegion', () => {
  const unit = {
    course: 'units', courseTitle: 'Python Foundations', courseHref: '/curriculum.html', n: 1, title: 'Foundations',
    blurb: 'Write your first programs.', hours: '1–2 hrs', level: 'Beginner',
    testText: 'Score 70 or more.', testHref: '/unit-test.html?unit=1',
    lessons: [
      { path: '/units/unit-1/a.html', title: 'What Is Python', summary: 'How Python runs', minutes: 10 },
      { path: '/units/unit-1/b.html', title: 'First <Program>', summary: 'print()', minutes: 15 },
    ],
  };
  const doc = new JSDOM(`<main>${renderUnitRegion(unit)}</main>`).window.document;

  it('is wrapped in the generator markers', () => {
    const html = renderUnitRegion(unit);
    expect(html.startsWith('<!-- unit-page:begin')).toBe(true);
    expect(html.trim().endsWith('<!-- unit-page:end -->')).toBe(true);
  });

  it('names the unit and keeps the progress panel hooks', () => {
    expect(doc.querySelector('h1').textContent).toBe('Unit 1: Foundations');
    expect(doc.querySelector('[data-unit-progress="1"]')).not.toBeNull();
    expect(doc.querySelector('[data-unit-progress-pct]')).not.toBeNull();
    expect(doc.querySelector('.unit-progress__meter[role="progressbar"]')).not.toBeNull();
    expect(doc.querySelector('[data-unit-continue]').getAttribute('href')).toBe('/units/unit-1/a.html');
  });

  it('lists each lesson once, numbered once, escaped', () => {
    const stops = doc.querySelectorAll('ol.unit-lesson-list.unit-trail > li.unit-trail__stop[data-lesson-path]');
    expect(stops).toHaveLength(2);
    expect(stops[1].querySelector('.unit-trail__title').textContent).toBe('First <Program>');
    expect(doc.body.textContent).not.toMatch(/\b1\. 1\./);
    expect(stops[0].querySelector('a').getAttribute('href')).toBe('/units/unit-1/a.html');
    expect(stops[0].querySelector('.unit-trail__time').textContent).toBe('About 10 min');
  });

  it('ends at the unit test, with the hooks lesson-progress.js fills', () => {
    const summit = doc.querySelector('.unit-trail__stop--summit');
    expect(summit.querySelector('[data-unit-test-status="1"]')).not.toBeNull();
    expect(summit.querySelector('[data-unit-test-link="1"]').getAttribute('href')).toBe('/unit-test.html?unit=1');
  });
});
