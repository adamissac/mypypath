import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildTrail, coursesBySlug, geometryFor, MAP, renderIndex, rowsFor, SEGMENTS, serpentine } from '../scripts/build-trail.mjs';

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
      expect(stops[i].querySelector('.trail-stop__num').textContent).toBe(String(i + 1));
      expect(cards[i].getAttribute('data-stop-index')).toBe(String(i));
      // One numbering scheme per place: the card says the course's own unit.
      expect(cards[i].querySelector('.path-stop-card__unit').textContent).toBe(`Unit ${unit.n}`);
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
    const nums = svgs.map((s) => [...s.querySelectorAll('.trail-stop__num')].map((t) => Number(t.textContent)));
    expect(nums[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(nums[1]).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const dataCards = [...section.querySelectorAll('[data-stop-card][data-segment="2"] a')];
    expect(dataCards.map((a) => a.getAttribute('href')))
      .toEqual(courses.find((c) => c.slug === 'data').units.map((u) => u.first));
  });

  it('puts the seam in the middle of the track', () => {
    const [one, two] = [...section.querySelectorAll('.path-map[data-segment]')];
    const span1 = Number(one.getAttribute('data-span'));
    const seam = Number(one.getAttribute('data-seam'));
    const span2 = Number(two.getAttribute('data-span'));
    const total = span1 + seam + span2;
    expect(span1 / total).toBeLessThan(0.5);
    expect((span1 + seam) / total).toBeGreaterThan(0.5);
    const track = section.querySelector('.path-journey__track');
    expect(track.getAttribute('style')).toContain(`--trail-length: ${100 + total}vh`);
  });

  it('has a course switcher that lands on each course\'s first stop', () => {
    const links = [...section.querySelectorAll('.path-courses [data-trail-jump]')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('data-stop-index')]))
      .toEqual([['Python Foundations', '#trail-foundations', '0'], ['Python for Data', '#trail-data', '10']]);
    const one = section.querySelector('.path-map[data-segment="1"]');
    const at = Number(one.getAttribute('data-span')) + Number(one.getAttribute('data-seam'));
    expect(section.querySelector('#trail-data').getAttribute('style')).toContain(`--at: ${at}vh`);
    // The progress row is its own element, never inside the switcher.
    expect(section.querySelector('.path-courses .path-panel__bar')).toBeNull();
    expect(section.querySelector('.path-panel__count').textContent).toBe('Stop 1 of 20');
  });

  it('marks the finish and the gateway', () => {
    const [one, two] = [...section.querySelectorAll('.path-map[data-segment]')];
    expect(one.querySelector('.trail-stop:last-of-type.trail-stop--end, .trail-stop--end').getAttribute('data-stop-index')).toBe('9');
    expect(two.querySelector('.trail-stop--start').getAttribute('data-stop-index')).toBe('10');
    expect(two.querySelector('.trail-stop--end').getAttribute('data-stop-index')).toBe('19');
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

describe('the serpentine geometry', () => {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  it('lays out rows of 3 and 4 for 10, 20 and 30 stops', () => {
    expect(rowsFor(10)).toEqual([3, 4, 3]);
    expect(rowsFor(20)).toEqual([3, 4, 3, 4, 3, 3]);
    expect(rowsFor(30).reduce((a, b) => a + b, 0)).toBe(30);
  });

  for (const count of [10, 20, 30]) {
    it(`spaces ${count} stops evenly on screen and keeps them inside the map`, () => {
      const geo = serpentine({ rows: rowsFor(count), seed: 7 });
      expect(geo.stops).toHaveLength(count);
      const gaps = geo.stops.slice(1).map((s, i) => dist(s, geo.stops[i]));
      expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.3);
      for (const p of geo.points) {
        expect(p.x).toBeGreaterThanOrEqual(20);
        expect(p.x).toBeLessThanOrEqual(geo.width - 20);
        expect(p.y).toBeGreaterThan(MAP.top - geo.spacing * MAP.wave - MAP.jitter - 1);
        expect(p.y).toBeLessThan(geo.height - MAP.bottom + geo.spacing * MAP.wave + MAP.jitter + 1);
      }
      // No two stops, adjacent or not, closer than 80% of the column spacing.
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) expect(dist(geo.stops[i], geo.stops[j])).toBeGreaterThan(geo.spacing * 0.8);
      }
    });
  }

  it('routes the line through the dots it places', () => {
    const [geo] = geometryFor();
    expect(geo.d.startsWith(`M ${geo.stops[0].x} ${geo.stops[0].y}`)).toBe(true);
    const ends = [...geo.d.matchAll(/C [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ ([\d.-]+) ([\d.-]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    for (const stop of geo.stops.slice(1)) expect(ends.some((e) => e.x === stop.x && e.y === stop.y)).toBe(true);
    expect(geo.at[0]).toBe(0);
    expect(geo.at[geo.at.length - 1]).toBe(1);
    geo.at.slice(1).forEach((a, i) => expect(a).toBeGreaterThan(geo.at[i]));
  });

  it('starts Python for Data where Foundations finishes, in a different shape', () => {
    const [one, two] = geometryFor();
    expect(two.stops[0]).toEqual(one.stops[one.stops.length - 1]);
    expect(two.d).not.toBe(one.d);
    expect(two.height).toBe(one.height);
  });

  it('is the same on every build', () => {
    expect(geometryFor()).toEqual(geometryFor());
  });
});
