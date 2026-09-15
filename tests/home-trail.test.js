import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildTrail, coursesBySlug, renderIndex, SEGMENTS } from '../scripts/build-trail.mjs';

/* The home page trail is generated from assets/data/courses.json by
   scripts/build-trail.mjs. These pin the generated region to its source, so a
   renamed unit or a moved first lesson cannot leave the home page pointing at
   the old one. */

const html = fs.readFileSync('index.html', 'utf8');
const courses = JSON.parse(fs.readFileSync('assets/data/courses.json', 'utf8')).courses;
const doc = new JSDOM(html).window.document;
const section = doc.querySelector('[data-path-journey]');

describe('the generated trail in index.html', () => {
  it('is up to date with scripts/build-trail.mjs and courses.json', () => {
    expect(renderIndex(html)).toBe(html);
  });

  it('has one svg per segment, in order', () => {
    const svgs = [...section.querySelectorAll('.path-map[data-segment]')];
    expect(svgs.map((s) => s.getAttribute('data-course'))).toEqual(SEGMENTS.map((s) => s.course));
  });

  it('numbers stops and cards across courses, and links each to its own course\'s unit', () => {
    const expected = SEGMENTS.flatMap((seg) => courses.find((c) => c.slug === seg.course).units);
    const stops = [...section.querySelectorAll('[data-stop]')];
    const cards = [...section.querySelectorAll('[data-stop-card]')];
    expect(stops).toHaveLength(expected.length);
    expect(cards).toHaveLength(expected.length);
    expected.forEach((unit, i) => {
      expect(stops[i].querySelector('.path-stop-num').textContent).toBe(String(i + 1));
      expect(cards[i].querySelector('.path-stop-card__num').textContent).toBe(String(i + 1));
      expect(cards[i].querySelector('h3').textContent).toBe(unit.title);
      expect(cards[i].querySelector('a').getAttribute('href')).toBe(unit.first);
    });
  });

  it('never builds a link from a stop number', () => {
    for (const a of section.querySelectorAll('[data-stop-card] a')) {
      const href = a.getAttribute('href');
      const m = /^\/(units|data)\/unit-(\d+)\//.exec(href);
      expect(m, href).toBeTruthy();
      expect(Number(m[2])).toBeLessThanOrEqual(10);
    }
  });

  it('writes card copy without em dashes', () => {
    for (const card of section.querySelectorAll('[data-stop-card]')) {
      expect(card.textContent, card.querySelector('h3').textContent).not.toContain('—');
    }
  });

  it('refuses a unit with missing card data', () => {
    const broken = JSON.parse(JSON.stringify(courses));
    delete broken[0].units[0].hours;
    expect(() => buildTrail(SEGMENTS, coursesBySlug({ courses: broken }))).toThrow(/has no hours/);
  });
});
