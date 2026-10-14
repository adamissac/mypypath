import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const pages = [
  ...Array.from({ length: 10 }, (_, i) => ['units', i + 1]),
  ...Array.from({ length: 10 }, (_, i) => ['data', i + 1]),
];
const manifest = {
  units: JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8')),
  data: JSON.parse(fs.readFileSync('assets/data/curriculum-data.json', 'utf8')),
};

describe('the unit overview pages', () => {
  it('are up to date with the course data and lessons', () => {
    expect(() => execFileSync('node', ['scripts/build-unit-pages.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it.each(pages)('%s unit %i is a lesson trail', (course, n) => {
    const html = fs.readFileSync(`${course}/unit-${n}.html`, 'utf8');
    const doc = new JSDOM(html).window.document;
    expect(html.match(/<!-- unit-page:begin/g)).toHaveLength(1);
    expect(html).toMatch(/\/assets\/css\/unit-page\.css/);
    expect(html).toMatch(/\/assets\/js\/unit-progress-panel\.js/);
    expect(doc.body.textContent).not.toMatch(/\b(\d+)\. \1\./);
    const want = manifest[course].lessons.filter((l) => l.unit === n).sort((a, b) => a.order - b.order).map((l) => l.path);
    const got = [...doc.querySelectorAll('ol.unit-trail > li[data-lesson-path]')].map((li) => li.getAttribute('data-lesson-path'));
    expect(got).toEqual(want);
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector(`[data-unit-test-link="${n}"]`)).not.toBeNull();
  });
});
