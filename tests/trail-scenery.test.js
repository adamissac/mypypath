import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildTrail } from '../scripts/build-trail.mjs';

const document = new JSDOM(buildTrail()).window.document;
const maps = [...document.querySelectorAll('svg.path-map')];
const stopsOf = (svg) => [...svg.querySelectorAll('[data-stop]')].map((g) => {
  const m = g.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  return { x: Number(m[1]), y: Number(m[2]) };
});

describe('geometric scenery behind the trail', () => {
  it('gives every map one decorative scenery layer, behind the route, in two depths', () => {
    for (const svg of maps) {
      const layers = svg.querySelectorAll('.trail-scenery');
      expect(layers).toHaveLength(1);
      expect(layers[0].getAttribute('aria-hidden')).toBe('true');
      expect(layers[0].querySelector('.trail-scenery__far')).not.toBeNull();
      expect(layers[0].querySelector('.trail-scenery__near')).not.toBeNull();
      const route = svg.querySelector('.path-map__draw');
      // Earlier in the document = drawn underneath.
      expect(layers[0].compareDocumentPosition(route) & 4).toBeTruthy();
    }
  });

  it('draws ridgelines and pines for Foundations, a moon, planets and constellations for Python for Data', () => {
    const [foundations, data] = maps;
    expect(foundations.querySelectorAll('.trail-scenery__ridge').length).toBeGreaterThanOrEqual(2);
    expect(foundations.querySelectorAll('.trail-scenery__pines').length).toBeGreaterThanOrEqual(2);
    expect(data.querySelectorAll('.trail-scenery__moon')).toHaveLength(1);
    expect(data.querySelectorAll('.trail-scenery__planet').length).toBeGreaterThanOrEqual(2);
    expect(data.querySelectorAll('.trail-scenery__constellation').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps every placed piece clear of the stops', () => {
    for (const svg of maps) {
      const stops = stopsOf(svg);
      for (const piece of svg.querySelectorAll('.trail-scenery [data-x]')) {
        const x = Number(piece.getAttribute('data-x'));
        const y = Number(piece.getAttribute('data-y'));
        for (const s of stops) expect(Math.hypot(s.x - x, s.y - y)).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

describe('the glowing trail head', () => {
  it('rides each map with a halo, a core and a short tail', () => {
    for (const svg of maps) {
      const head = svg.querySelectorAll('.path-head');
      expect(head).toHaveLength(1);
      expect(head[0].querySelector('.path-head__core')).not.toBeNull();
      expect(head[0].querySelector('.path-head__halo')).not.toBeNull();
      expect(svg.querySelectorAll('.path-tail circle')).toHaveLength(4);
    }
  });
});
