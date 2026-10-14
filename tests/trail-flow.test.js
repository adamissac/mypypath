import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildTrail } from '../scripts/build-trail.mjs';

describe('the trail from Foundations into Python for Data', () => {
  const document = new JSDOM(buildTrail()).window.document;

  it('keeps all 20 unit cards and their links', () => {
    expect(document.querySelectorAll('[data-stop-card] a[href]')).toHaveLength(20);
  });

  it('asks once before Python for Data, as a plain choice with no launch', () => {
    const dialogs = document.querySelectorAll('dialog');
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0];
    expect(dialog.classList.contains('trail-transition')).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe('Continue to Python for Data?');
    expect(dialog.querySelector('[data-trail-continue]').getAttribute('type')).toBe('button');
    expect(dialog.querySelector('[data-trail-stay]').getAttribute('type')).toBe('button');
    expect(document.querySelector('.trail-launch, [data-launch-skip]')).toBeNull();
    expect(dialog.textContent).not.toMatch(/space|liftoff|rocket/i);
  });

  it('has no altitude layer that could darken the Foundations map', () => {
    expect(document.querySelector('.expedition')).toBeNull();
    expect(document.querySelector('.expedition__sunset, .expedition__night, .expedition__stars')).toBeNull();
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
