import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildTrail } from '../scripts/build-trail.mjs';

describe('the trail flows from Foundations into Python for Data', () => {
  const document = new JSDOM(buildTrail()).window.document;

  it('keeps all 20 unit cards and their links', () => {
    expect(document.querySelectorAll('[data-stop-card] a[href]')).toHaveLength(20);
  });

  it('never interrupts the scroll with a dialog', () => {
    expect(document.querySelectorAll('dialog')).toHaveLength(0);
    expect(document.querySelector('.trail-transition')).toBeNull();
    expect(document.querySelector('.trail-launch')).toBeNull();
    expect(document.querySelector('[data-trail-continue], [data-launch-skip]')).toBeNull();
  });

  it('has unique SVG definitions so scenery does not steal the route masks', () => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of document.querySelectorAll('.path-map')) {
      expect(svg.querySelector('.path-map__draw')).not.toBeNull();
      expect(svg.querySelectorAll('[data-stop]')).toHaveLength(10);
    }
  });
});
