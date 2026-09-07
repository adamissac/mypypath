import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Colour contrast, pinned at the token level.
 *
 * scripts/audit-a11y.mjs measures the rendered page in a browser and is the
 * real check. This is the cheap one that runs in `npm test`: it recomputes the
 * WCAG ratios from the token values themselves, so a palette tweak that pushes
 * a colour back under 4.5:1 fails immediately rather than at the next audit.
 */

const style = fs.readFileSync('assets/css/style.css', 'utf8');
const theme = fs.readFileSync('assets/css/pypath-theme.css', 'utf8');

function token(css, name) {
  const m = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  expect(m, `token ${name} not found`).toBeTruthy();
  return m[1];
}

function luminance(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* The three backgrounds this site actually puts body text on. Measured off the
   rendered pages, not guessed: white panels, the page tint, and the info-card
   fill. */
const BACKGROUNDS = { white: '#ffffff', tint: '#f3f9fc', card: '#dcf2fc' };
const AA = 4.5;

describe('the ink token clears AA on every background the site uses', () => {
  const ink = token(style, '--primary-ink');

  it('is defined', () => {
    expect(ink.toLowerCase()).toBe('#0369a1');
  });

  for (const [name, bg] of Object.entries(BACKGROUNDS)) {
    it(`passes on ${name}`, () => {
      expect(ratio(ink, bg)).toBeGreaterThanOrEqual(AA);
    });
  }

  it('white text on it clears AA, for buttons that use it as a fill', () => {
    // .btn-run, .btn-check-work and .practice-badge all put white on this.
    expect(ratio('#ffffff', ink)).toBeGreaterThanOrEqual(AA);
  });
});

describe('the fill tokens are still the light ones, which is the point', () => {
  /* Darkening --primary itself would have fixed the text and changed every
     button, border, focus ring and gradient on the site. The split exists so
     one problem could be fixed without touching the other. */
  it('--primary is unchanged', () => {
    expect(token(style, '--primary').toLowerCase()).toBe('#0ea5e9');
  });

  it('--primary-strong is unchanged', () => {
    expect(token(style, '--primary-strong').toLowerCase()).toBe('#0284c7');
  });

  it('and both would have FAILED as text, which is why they are not used as text', () => {
    expect(ratio('#0ea5e9', BACKGROUNDS.tint)).toBeLessThan(AA);
    expect(ratio('#0284c7', BACKGROUNDS.white)).toBeLessThan(AA);
  });
});

describe('no stylesheet sets text to a fill token', () => {
  const files = fs.readdirSync('assets/css').filter((f) => f.endsWith('.css'));

  /* The lookbehind is load-bearing. `\bcolor:` also matches `border-color:`
     and `background-color:`, because \b matches after a hyphen -- and those
     two SHOULD keep using the fill tokens. The first version of this test
     failed on eleven perfectly correct border rules. */
  const TEXT_COLOR = /(?<!-)\bcolor\s*:\s*var\(--primary(-strong)?[,)]/g;

  it('color: never resolves to --primary or --primary-strong', () => {
    /* The regression this catches: someone adds `color: var(--primary)` to a
       new component and reintroduces a violation the audit only finds on its
       next run. */
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(`assets/css/${f}`, 'utf8');
      const hits = src.match(TEXT_COLOR) || [];
      if (hits.length) bad.push(`${f}: ${hits.length}`);
    }
    expect(bad).toEqual([]);
  });

  it('and never to the raw hex either, outside syntax highlighting', () => {
    /* .tok-* are the syntax-highlight colours in the homepage's code sample.
       They are excluded deliberately rather than "fixed": they sit on that
       block's own surface, they are a colour SCALE where the relationships
       between tokens carry meaning, and scripts/audit-a11y.mjs measures the
       rendered result on /index.html and reports zero. A token-level rule that
       overrode a measured pass would be the test lying about the page. */
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(`assets/css/${f}`, 'utf8')
        .split('\n').filter((l) => !l.includes('.tok-')).join('\n');
      const hits = src.match(/(?<!-)\bcolor\s*:\s*#0(ea5e9|284c7)\b/gi) || [];
      if (hits.length) bad.push(`${f}: ${hits.length}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('the dark theme runs the ramp the other way', () => {
  it('its ink token is lighter, not darker', () => {
    // The background is dark, so link text has to be lighter. A shared token
    // value across both themes would be unreadable in one of them.
    const dark = style.slice(style.indexOf('[data-theme="dark"]'));
    const ink = dark.match(/--primary-ink\s*:\s*(#[0-9a-fA-F]{6})/)[1];
    expect(luminance(ink)).toBeGreaterThan(luminance(token(style, '--primary-ink')));
  });

  it('and clears AA on the dark background', () => {
    const dark = style.slice(style.indexOf('[data-theme="dark"]'));
    const ink = dark.match(/--primary-ink\s*:\s*(#[0-9a-fA-F]{6})/)[1];
    const bg = dark.match(/--bg\s*:\s*(#[0-9a-fA-F]{6})/)[1];
    expect(ratio(ink, bg)).toBeGreaterThanOrEqual(AA);
  });
});

describe('the theme trail tokens got the same treatment', () => {
  it('pypath-theme.css has its own ink variant', () => {
    expect(theme).toContain('--pp-line-ink');
  });

  it('nothing sets color to the raw line tokens', () => {
    expect(theme).not.toMatch(/\bcolor\s*:\s*var\(--pp-line(-deep)?[,)]/);
  });
});

describe('the two buttons that were the worst offenders', () => {
  it('Run is white on ink, not inherited text on a light fill', () => {
    // The primary action on every code exercise in the course, and at 2.72:1
    // the worst-contrast element on the site.
    const run = style.slice(style.indexOf('.btn-run {'), style.indexOf('.btn-run {') + 500);
    expect(run).toContain('background: var(--primary-ink)');
    expect(run).toContain('color: #fff');
  });

  it('Check my work is white on ink, and its hover goes darker still', () => {
    const checks = fs.readFileSync('assets/css/checks.css', 'utf8');
    expect(checks).toContain('background: var(--primary-ink, #0369a1)');
    // Lifting hover to sky-600 would have made the hover state the failing one.
    expect(checks).toContain('background: #075985');
    expect(ratio('#ffffff', '#075985')).toBeGreaterThanOrEqual(AA);
  });

  it('the copy button is legible at rest, not only on hover', () => {
    const fast = fs.readFileSync('assets/css/pypath-fast.css', 'utf8');
    const start = fast.indexOf('.copy-snippet-btn {');
    const btn = fast.slice(start, fast.indexOf('}', start));
    expect(btn).toContain('opacity: 1;');
    expect(btn).not.toMatch(/opacity:\s*0\.\d/);
  });
});
