import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildTrail } from '../scripts/build-trail.mjs';

describe('expedition decoration preserves curriculum navigation', () => {
  const document = new JSDOM(buildTrail()).window.document;

  it('keeps all 20 unit cards and their links outside the decorative layer', () => {
    expect(document.querySelectorAll('[data-stop-card] a[href]')).toHaveLength(20);
    expect(document.querySelector('.expedition').getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('.expedition a, .expedition button')).toHaveLength(0);
    expect(document.querySelectorAll('.expedition svg')).toHaveLength(1);
    expect(document.querySelector('.expedition svg').getAttribute('focusable')).toBe('false');
  });

  it('keeps the transition an explicit accessible choice', () => {
    const dialog = document.querySelector('dialog.trail-transition');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent)
      .toBe('Ready to explore Python for Data?');
    expect(dialog.querySelector('[data-trail-continue]').getAttribute('type')).toBe('button');
    expect(dialog.querySelector('[data-trail-stay]').getAttribute('type')).toBe('button');
  });

  it('keeps the automatic launch accessible and outside the decorative map', () => {
    const launch = document.querySelector('.trail-launch');
    expect(launch.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.getElementById(launch.getAttribute('aria-labelledby')).textContent)
      .toBe('Ready for liftoff');
    expect(launch.querySelector('[data-launch-skip]').getAttribute('type')).toBe('button');
    expect(launch.querySelector('.trail-launch__status').getAttribute('aria-live')).toBe('polite');
    expect(launch.querySelector('svg').closest('[aria-hidden="true"]')).not.toBeNull();
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
