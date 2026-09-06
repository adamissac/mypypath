import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* Heading levels only ever increase by one.
 *
 * A screen-reader user navigates a page by its headings, and a skipped level
 * is heard as a gap in the content that is not really there -- "here is a
 * section, and inside it a sub-sub-section, with the sub-section missing".
 * axe classes this as best-practice and leaves it OFF in the default ruleset,
 * which is why 21 of them survived on this site for as long as they did.
 *
 * scripts/audit-a11y.mjs checks the rendered page in a browser, which is the
 * real check. This is the cheap one that runs in `npm test` on every page at
 * once, so a new lesson cannot reintroduce the pattern between audit runs.
 */

function headings(html) {
  // Only the document body's own outline: the footer is shared and settled,
  // and script templates are not rendered content.
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<template[\s\S]*?<\/template>/g, '');
  return [...body.matchAll(/<h([1-6])(\s[^>]*)?>/g)].map((m) => ({
    level: Number(m[1]),
    attrs: m[2] || '',
  }));
}

function skips(html) {
  const out = [];
  let last = 0;
  for (const h of headings(html)) {
    if (last && h.level > last + 1) out.push(`h${last} -> h${h.level}`);
    last = h.level;
  }
  return out;
}

function allPages() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) found.push(full);
    }
  };
  walk('.');
  return found;
}

describe('no page skips a heading level', () => {
  const pages = allPages();

  it('finds the pages at all', () => {
    expect(pages.length).toBeGreaterThan(100);
  });

  it('every page has a clean outline', () => {
    const bad = [];
    for (const page of pages) {
      const found = skips(fs.readFileSync(page, 'utf8'));
      if (found.length) bad.push(`${page}: ${found.join(', ')}`);
    }
    expect(bad, 'heading levels must only increase by one').toEqual([]);
  });

  it('every page starts at h1', () => {
    const bad = [];
    for (const page of pages) {
      const hs = headings(fs.readFileSync(page, 'utf8'));
      if (hs.length && hs[0].level !== 1) bad.push(`${page}: starts at h${hs[0].level}`);
    }
    expect(bad).toEqual([]);
  });

  it('the checker actually catches a skip', () => {
    // A guard nobody has seen fail is a guard nobody knows is wired up.
    expect(skips('<h1>a</h1><h3>b</h3>')).toEqual(['h1 -> h3']);
    expect(skips('<h2>a</h2><h4>b</h4>')).toEqual(['h2 -> h4']);
  });

  it('and does not fire on a legal descent or a jump back up', () => {
    expect(skips('<h1>a</h1><h2>b</h2><h3>c</h3>')).toEqual([]);
    // Going back UP any number of levels is always fine.
    expect(skips('<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>')).toEqual([]);
  });
});

describe('the promoted headings kept their size', () => {
  /* The fix was to the LEVEL, never to the look. An h4 following an h2 skipped
     a level, so it became a real h3 -- and kept a class carrying the size it
     already had. The opposite fix, restyling an h3 to look like an h4, would
     have left the outline broken and merely hidden it, and the audit brief
     called that out specifically. */
  const style = fs.readFileSync('assets/css/style.css', 'utf8');
  const theme = fs.readFileSync('assets/css/pypath-theme.css', 'utf8');

  it('card titles are h3 with the h4 size class', () => {
    const lesson = fs.readFileSync('units/unit-1/what-is-python.html', 'utf8');
    expect(lesson).toContain('<h3 class="h4">');
    /* A bare <h4> is still allowed and still present -- one that follows an h3
       is a legal fourth level and was correctly left alone. Only the ones that
       SKIPPED were promoted. Asserting no h4 exists anywhere would be
       asserting the fix was blunter than it was. */
    const levels = [...lesson.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    let last = 0;
    for (const level of levels) {
      expect(level, `h${last} -> h${level} in the lesson page`).toBeLessThanOrEqual(last + 1 || 1);
      last = level;
    }
  });

  it('unit cards are h2 with the h3 size class', () => {
    expect(fs.readFileSync('curriculum.html', 'utf8')).toContain('<h2 class="h3">');
  });

  it('every container rule that sized an h4 also sizes the promoted h3', () => {
    for (const sel of ['.info-card', '.feature-card', '.practice-header', '.lesson-content']) {
      expect(style, sel).toContain(`${sel} h3.h4`);
    }
  });

  it('the lesson SECTION heading rule excludes the promoted card titles', () => {
    /* Without :not(.h4) this rule wins on cascade order and shrinks every card
       title on the site from 20px/700 to 16.8px/650. Found by measuring before
       and after in a browser, which is the only way a four-pixel regression
       across 98 pages gets noticed. */
    expect(theme).toContain('.page-unit .lesson-content h3:not(.h4)');
    expect(theme).toContain('.page-unit .content-section h3:not(.h4)');
  });

  it('the footer heading is an h2 with its size pinned', () => {
    expect(fs.readFileSync('index.html', 'utf8'))
      .toContain('<h2 class="footer-heading">Learn</h2>');
    // An h2 with no explicit size would render at an h2's default.
    expect(theme).toMatch(/\.footer-heading \{[^}]*font-size: 20px/);
  });

  it('the layout baker emits the fixed footer, so regeneration keeps it', () => {
    expect(fs.readFileSync('scripts/bake_layout.py', 'utf8'))
      .toContain('<h2 class="footer-heading">Learn</h2>');
  });
});
