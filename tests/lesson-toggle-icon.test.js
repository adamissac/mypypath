import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* The phone lesson-list control is labelled "Toggle lesson menu". Its
 * ::before mask was a chevron-right plus a vertical bar — the desktop
 * "reopen the column" glyph — so a control that opens a drawer read as
 * "go forward / skip". Three horizontal bars match the label and the
 * site-header menu button. */

const fast = fs.readFileSync('assets/css/pypath-fast.css', 'utf8');
const block = (fast.match(/\.sidebar-toggle-btn::before\s*\{[\s\S]*?\}/) || [''])[0];

describe('the phone lesson-list toggle is a menu icon', () => {
  it('draws three horizontal bars', () => {
    expect(block).toContain('M4 6h16M4 12h16M4 18h16');
  });

  it('does not reuse the desktop reopen glyph', () => {
    expect(block).not.toContain('M20 6v12');
    expect(block).not.toContain('M9 18l6-6-6-6');
  });
});
