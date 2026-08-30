import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* The dashboard had nine top-level sections in one scroll, in the order they
   were built. A teacher with thirty seconds between lessons scrolled past a
   join code, an assignment builder and ten lock-mode checkboxes to reach the
   list that says who needs help. */

const html = fs.readFileSync('classroom.html', 'utf8');
const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');
const css = fs.readFileSync('assets/css/classroom.css', 'utf8');

const at = (needle) => html.indexOf(needle);

describe('the page opens with what needs a teacher', () => {
  it('puts needs-attention above the grid, the work, and the settings', () => {
    // The thesis: a named child stuck on the same exercise is the only thing
    // here that can be acted on. A percentage is not.
    expect(at('cr-attention')).toBeGreaterThan(-1);
    expect(at('cr-attention')).toBeLessThan(at('cr-grid-section'));
    expect(at('cr-attention')).toBeLessThan(at('cr-zone--work'));
    expect(at('cr-attention')).toBeLessThan(at('cr-zone--admin'));
  });

  it('demotes the summary figures to a line above it, not tiles', () => {
    // The template answer is a row of stat tiles at the top. Nobody has needed
    // the median unit reached in the thirty seconds before a lesson.
    expect(at('data-cr-summary')).toBeLessThan(at('cr-attention'));
    expect(css).not.toMatch(/\.cr-stat \{\s*\n\s*padding:[^}]*border:/);
  });

  it('shrinks the join code to a line on the class bar', () => {
    // Six characters, read aloud at the start of term and almost never after.
    expect(html).toContain('cr-joincode__value');
    expect(at('cr-joincode')).toBeLessThan(at('cr-attention'));
    expect(html).not.toContain('class="cr-code"');
  });
});

describe('nothing was lost in the move', () => {
  it('keeps every control the nine old sections had', () => {
    for (const hook of [
      'data-cr-assign-form', 'data-cr-assign-units', 'data-cr-assign-lesson-unit',
      'cr-lock-mode', 'data-cr-access-units',
      'data-cr-grid', 'data-cr-unit-pick', 'data-cr-sort', 'cr-scope',
      'data-cr-certs-list', 'data-cr-share', 'cr-coteacher', 'data-cr-teachers',
      'data-cr-archive', 'data-cr-purge',
      'data-cr-export', 'data-cr-digest', 'data-cr-digest-text',
      'data-cr-summary', 'data-cr-code', 'data-cr-copy', 'data-cr-print',
      'data-cr-new-class', 'data-cr-switcher',
    ]) {
      expect(html, hook).toContain(hook);
    }
  });

  it('keeps an explanation button on every number that had one', () => {
    // A teacher who cannot interrogate a number does not trust it, and an
    // untrusted number is worse than none.
    expect((html.match(/data-cr-info=/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('keeps the framing attached to what it qualifies', () => {
    expect(html).toContain('None of these cancel an assignment');
    expect(html).toContain('deliberately not a secret link');
  });
});

describe('folding never hides someone waiting', () => {
  it('shows a count on the shut header', () => {
    expect(html).toContain('data-cr-certs-count');
    expect(dash).toMatch(/const waiting = rows\.filter\(\(r\) => r\.state === 'pending'\)\.length/);
    expect(dash).toMatch(/show\(badge, waiting > 0\)/);
  });

  it('uses details, so the folds work without script', () => {
    expect(html).toMatch(/<details class="cr-fold"/);
  });

  it('opens the folds for print, and puts them back', () => {
    // A shut fold prints as its heading and nothing else, so the paper copy
    // would be whichever sections happened to be open.
    expect(dash).toMatch(/addEventListener\('beforeprint'/);
    expect(dash).toMatch(/addEventListener\('afterprint'/);
    expect(dash).toMatch(/reopened = \$\$\('\.cr-fold:not\(\[open\]\)'\)/);
  });

  it('does it from script, because the stylesheet may not use !important', () => {
    // Comments stripped, as tests/classroom-page-markup.test.js does: the note
    // explaining why the print handler lives in JS names the token on purpose.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('!important');
  });
});

describe('the go-to column tells the truth', () => {
  it('does not call the certificate page a lesson', () => {
    expect(dash).toMatch(/isCert \? 'See certificates' : 'Open lesson'/);
  });

  it('opens the fold it points into', () => {
    expect(dash).toMatch(/const fold = \$\('\[data-cr-fold="certs"\]'\)/);
  });
});
