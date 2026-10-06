import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Decorative expedition names sit inside .journey-card__scene, which already
 * clips overflow. The names themselves used nowrap + clamp(2.6rem) and
 * measured 529px wide at a 375px viewport, so "FOUNDATIONS" ran off the
 * card even though the page reported no overflow. Cap the label to the
 * scene and let the existing clip do the rest. */

const css = fs.readFileSync('assets/css/courses.css', 'utf8');
const block = (css.match(/\.journey-card__world\s*\{[\s\S]*?\}/) || [''])[0];

describe('course expedition labels stay inside their scene', () => {
  it('caps the decorative word to the card width', () => {
    expect(block).toMatch(/max-width:\s*calc\(100%\s*-\s*\d+px\)/);
  });

  it('still clips rather than wrapping the nowrap label', () => {
    expect(block).toContain('white-space: nowrap');
    expect(css).toMatch(/\.journey-card__scene[\s\S]{0,200}overflow:\s*hidden/);
  });
});
