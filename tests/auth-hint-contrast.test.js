import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Signup age hint failed WCAG AA at 4.04:1 because .auth-hint mixed
 * --muted with opacity: .75. The muted token is already the quiet
 * colour; fading it again is what dropped it under 4.5:1. */

const css = fs.readFileSync('assets/css/auth.css', 'utf8');
const a11y = fs.readFileSync('scripts/audit-a11y.mjs', 'utf8');
const block = (css.match(/\.auth-hint\s*\{[\s\S]*?\}/) || [''])[0];

describe('auth hints stay readable', () => {
  it('does not fade muted text with opacity', () => {
    expect(block).not.toMatch(/opacity\s*:/);
  });

  it('uses the muted token at full strength', () => {
    expect(block).toMatch(/color:\s*var\(--muted/);
  });

  it('includes signup in the rendered axe pages so this cannot skip again', () => {
    expect(a11y).toMatch(/['"]\/signup\.html['"]/);
  });
});
