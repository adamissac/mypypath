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

  it('runs Foundations then Python for Data, ten stops each, 20 in all', () => {
    const svgs = [...section.querySelectorAll('.path-map[data-segment]')];
    expect(svgs.map((s) => [s.getAttribute('data-course'), s.querySelectorAll('[data-stop]').length]))
      .toEqual([['foundations', 10], ['data', 10]]);
    const nums = svgs.map((s) => [...s.querySelectorAll('.path-stop-num')].map((t) => Number(t.textContent)));
    expect(nums[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(nums[1]).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const dataCards = [...section.querySelectorAll('[data-stop-card][data-segment="2"] a')];
    expect(dataCards.map((a) => a.getAttribute('href')))
      .toEqual(courses.find((c) => c.slug === 'data').units.map((u) => u.first));
  });

  it('gives each segment its scroll budget, the second a little quicker per stop', () => {
    const [one, two] = [...section.querySelectorAll('.path-map[data-segment]')];
    const perStop = (svg) => Number(svg.getAttribute('data-span')) / svg.querySelectorAll('[data-stop]').length;
    expect(perStop(one)).toBe(40);
    expect(perStop(two)).toBeLessThan(perStop(one));
    const total = Number(one.getAttribute('data-span')) + Number(one.getAttribute('data-seam')) + Number(two.getAttribute('data-span'));
    const track = section.querySelector('.path-journey__track');
    expect(track.getAttribute('style')).toContain(`--trail-length: ${100 + total}vh`);
  });

  it('offers a jump to Python for Data that lands on its first stop', () => {
    const jump = section.querySelector('[data-trail-jump="2"]');
    expect(jump.textContent).toBe('Jump to Python for Data');
    expect(jump.getAttribute('href')).toBe('#trail-data');
    expect(jump.getAttribute('data-stop-index')).toBe('10');
    const one = section.querySelector('.path-map[data-segment="1"]');
    const at = Number(one.getAttribute('data-span')) + Number(one.getAttribute('data-seam'));
    expect(section.querySelector('#trail-data').getAttribute('style')).toContain(`--at: ${at}vh`);
  });

  it('keeps the map out of the accessibility tree and the units in it', () => {
    expect(section.querySelector('.path-journey__map').getAttribute('aria-hidden')).toBe('true');
    expect(section.querySelector('.path-panel').closest('[aria-hidden]')).toBeNull();
  });

  it('refuses a unit with missing card data', () => {
    const broken = JSON.parse(JSON.stringify(courses));
    delete broken[0].units[0].hours;
    expect(() => buildTrail(SEGMENTS, coursesBySlug({ courses: broken }))).toThrow(/has no hours/);
  });
});

describe('the trail assets are versioned with the markup', () => {
  /* Unversioned, a returning visitor paired the new markup with a day-old
     cached stylesheet and script, and the trail rendered broken. */
  it('points index.html at the current content of home-path.css and path-trail.js', async () => {
    const { VERSIONED, assetVersion } = await import('../scripts/build-trail.mjs');
    for (const rel of VERSIONED) {
      expect(html).toContain(`/${rel}?v=${assetVersion(rel)}`);
    }
  });

  it('changes the URL when a file changes', async () => {
    const { renderIndex } = await import('../scripts/build-trail.mjs');
    const bumped = renderIndex(html, undefined, { 'assets/css/home-path.css': 'abc123', 'assets/js/path-trail.js': 'def456' });
    expect(bumped).toContain('/assets/css/home-path.css?v=abc123"');
    expect(bumped).toContain('/assets/js/path-trail.js?v=def456"');
    expect(bumped).not.toMatch(/home-path\.css\?v=[0-9a-f]+\?v=/);
  });
});
