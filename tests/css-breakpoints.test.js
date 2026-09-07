import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* One breakpoint scale for page-level layout.
 *
 * The audit reported ~10 distinct max-width breakpoints "with no evident
 * system". The real count is 30 -- it missed the small ones. But 30 values is
 * not 30 problems, and this test encodes the difference. See
 * docs/css-breakpoints.md.
 */

const SCALE = [480, 640, 768, 900, 980];

/* Below this, a query is about a COMPONENT rather than the page -- one card,
   one badge, one control describing its own reflow. A component that changes
   at 260px is not making a claim about phones, and forcing it onto a page
   scale would make it wrong. */
const COMPONENT_MAX = 460;

/* Not typos for 768 and 1024. They are the deliberate upper bound of a range
   whose lower bound is the round number:
   
       @media (max-width: 767px) { phone }
       @media (min-width: 768px) { tablet }
   
   Rounding them makes BOTH queries match at exactly 768px, which is a
   regression rather than a tidy-up. */
const ONE_LESS_THAN = new Set([767, 1023]);

/* Single-use page breakpoints that drifted before the scale existed.
   Grandfathered by value so they cannot multiply: a NEW one fails this test.
   Every entry here is a small future cleanup, not a licence. */
const LEGACY = new Set([520, 560, 700, 720, 820, 960, 1024]);

/* Only widths inside an @media prelude.
 *
 * The first version of this scanned for `max-width: <n>px` anywhere in the
 * file and reported 30 distinct "breakpoints" -- most of which were ordinary
 * max-width PROPERTIES on elements, like the 360px cap on a card. Counting a
 * card's width as a page breakpoint is how you end up believing the site has
 * three times the layout complexity it has. The real figure is 14. */
function breakpoints() {
  const found = [];
  for (const f of fs.readdirSync('assets/css').filter((n) => n.endsWith('.css'))) {
    const src = fs.readFileSync(`assets/css/${f}`, 'utf8');
    for (const q of src.matchAll(/@media([^{]+)\{/g)) {
      for (const w of q[1].matchAll(/(max|min)-width:\s*(\d+)px/g)) {
        found.push({ file: f, kind: w[1], px: Number(w[2]) });
      }
    }
  }
  return found;
}

describe('page-level breakpoints come from the scale', () => {
  const all = breakpoints();

  it('finds the breakpoints at all', () => {
    expect(all.length).toBeGreaterThan(60);
  });

  it('every page-level max-width is on the scale, or explicitly grandfathered', () => {
    const offenders = all
      .filter((b) => b.kind === 'max')
      .filter((b) => b.px > COMPONENT_MAX)
      .filter((b) => !SCALE.includes(b.px))
      .filter((b) => !ONE_LESS_THAN.has(b.px))
      .filter((b) => !LEGACY.has(b.px))
      .map((b) => `${b.file}: max-width ${b.px}px`);

    expect(
      [...new Set(offenders)],
      'A new page-level breakpoint that is not on the scale.\n'
      + `Use one of ${SCALE.join(', ')} -- see docs/css-breakpoints.md.\n`
    ).toEqual([]);
  });

  it('the grandfathered list only shrinks', () => {
    /* If a legacy value is no longer used anywhere, it should come off this
       list rather than sit here implying the site still has it. */
    const used = new Set(all.map((b) => b.px));
    const stale = [...LEGACY].filter((px) => !used.has(px));
    expect(stale, 'remove these from LEGACY; nothing uses them any more').toEqual([]);
  });

  it('the scale itself is all genuinely in use', () => {
    // A scale containing a value nobody uses is aspiration, not documentation.
    const used = new Set(all.map((b) => b.px));
    expect(SCALE.filter((px) => !used.has(px))).toEqual([]);
  });
});

describe('the one-less-than pattern is preserved, not rounded away', () => {
  it('767 pairs with a 768 min-width somewhere', () => {
    const all = breakpoints();
    const has = (kind, px) => all.some((b) => b.kind === kind && b.px === px);
    if (has('max', 767)) expect(has('min', 768)).toBe(true);
  });

  it('and the doc explains why', () => {
    const doc = fs.readFileSync('docs/css-breakpoints.md', 'utf8');
    expect(doc).toContain('one-less-than');
    expect(doc).toContain('both');
  });
});

describe('the component exemption', () => {
  it('is currently unused, and that is the finding', () => {
    /* Once only real media queries are counted, there are NO page stylesheets
       reflowing below 460px -- the small numbers the first version of this
       test found were element max-width properties, not breakpoints. The
       threshold stays because a component query is still legitimate; it just
       turns out none exists today. */
    const small = breakpoints().filter((b) => b.kind === 'max' && b.px <= COMPONENT_MAX);
    expect(small).toEqual([]);
  });
});
