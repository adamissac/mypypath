import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* The dashboard's markup and stylesheet, checked for the things that are easy
   to lose in a later edit: table semantics, keyboard reach, an explanation
   next to every number, and a layout that survives 375px and a printer. */

const html = fs.readFileSync('classroom.html', 'utf8');
const rawCss = fs.readFileSync('assets/css/classroom.css', 'utf8');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');

describe('the page loads what it needs', () => {
  it('loads the analytics before the renderer that calls it', () => {
    expect(html.indexOf('/assets/js/classroom-core.js'))
      .toBeLessThan(html.indexOf('/assets/js/classroom-dashboard.js'));
  });

  it('keeps the teacher gate loaded', () => {
    // classroom-page.js is now only the gate. Its roster table and certificate
    // queue moved onto the classes/{classId} model; the flat collection they
    // read is still written on every join and still read by admin.html.
    expect(html).toContain('/assets/js/classroom-page.js');
    expect(html).toContain('data-class-state="not-teacher"');
  });

  it('no longer shows a separate legacy roster', () => {
    // Students landed in it because the join flow only wrote the old schema.
    // That is fixed, so the section was a second place to look for people who
    // are now all in the first one.
    expect(html).not.toContain('Students who joined before classes existed');
    expect(html).not.toContain('data-class-rows');
  });

  it('has somewhere to decide a certificate', () => {
    expect(html).toContain('data-cr-certs-list');
    expect(html).toContain('Certificates');
  });

  it('loads the stylesheet in the head', () => {
    expect(html.indexOf('/assets/css/classroom.css')).toBeLessThan(html.indexOf('</head>'));
  });
});

describe('heading order', () => {
  /* Scoped to <main>. The site footer's h2 -> h4 jump predates this work and
     is shared by all 124 pages; fixing it belongs to the layout backlog, not
     to a change that only adds a section to one page. */
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

  it('runs h1 then h2 with no level skipped', () => {
    const levels = [...main.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1], `jump at heading ${i}`).toBeLessThanOrEqual(1);
    }
  });

  it('has exactly one h1', () => {
    expect((main.match(/<h1[\s>]/g) || []).length).toBe(1);
  });

  it('nests the explanation panel heading under its section', () => {
    expect(main).toMatch(/<h3 id="cr-explain-h">/);
  });
});

describe('data tables are real tables', () => {
  it('uses table markup for both data tables', () => {
    expect(html).toMatch(/<table class="cr-table" data-cr-attention-table/);
    expect(html).toMatch(/<table class="cr-table cr-grid" data-cr-grid/);
  });

  it('scopes every static header cell', () => {
    const headers = [...html.matchAll(/<th\b([^>]*)>/g)]
      .map((m) => m[1])
      .filter((attrs) => !attrs.includes('visually-hidden'));
    for (const attrs of headers) {
      expect(attrs, `<th${attrs}> has no scope`).toMatch(/scope="(row|col)"/);
    }
  });

  it('scopes the header cells the renderer builds', () => {
    // Row headers carry the student's name, so a cell read out of context
    // still says who it is about.
    expect(dash).toMatch(/th\.scope = 'row'/);
    expect(dash).toMatch(/th\.scope = 'col'|corner\.scope = 'col'/);
  });

  it('captions each table for a screen reader', () => {
    expect((html.match(/<caption class="visually-hidden">/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the grid is reachable and readable without colour', () => {
  it('makes every cell a real button rather than a clickable div', () => {
    expect(dash).toMatch(/el\('button', 'cr-cell__btn'\)/);
    expect(dash).toMatch(/button\.type = 'button'/);
  });

  it('gives each cell a label naming the student, the column and the state', () => {
    expect(dash).toMatch(/student\.displayName \+ ', ' \+ col\.full \+ ': ' \+ CORE\.MASTERY_LABEL\[state\]/);
  });

  it('paints a mark in every cell, not colour alone', () => {
    expect(dash).toMatch(/CORE\.MASTERY_MARK\[state\]/);
  });

  it('renders a key explaining every mark', () => {
    expect(html).toContain('data-cr-key');
    expect(dash).toMatch(/function paintKey/);
  });

  it('gives the cells a visible focus ring', () => {
    expect(css).toMatch(/\.cr-cell__btn:focus-visible/);
  });

  it('sticks the header row and the first column', () => {
    expect(css).toMatch(/\.cr-grid thead th \{[^}]*position: sticky/);
    expect(css).toMatch(/\.cr-grid__who,\s*\n\.cr-grid__corner \{[^}]*position: sticky/);
  });
});

describe('the controls the brief asked for', () => {
  it('toggles between unit and lesson granularity', () => {
    expect(html).toMatch(/name="cr-scope" value="units"/);
    expect(html).toMatch(/name="cr-scope" value="lessons"/);
    expect(html).toContain('data-cr-unit-pick');
  });

  it('sorts by name, percent complete and last active', () => {
    for (const value of ['name', 'percent', 'active']) {
      expect(html).toContain(`<option value="${value}"`);
    }
  });

  it('labels every control', () => {
    // Each select either has a <label for> or a visually-hidden one.
    for (const id of ['cr-sort', 'cr-unit-pick', 'cr-class-switcher', 'cr-class-name']) {
      expect(html, id).toMatch(new RegExp(`for="${id}"`));
    }
  });

  it('offers a class switcher for teachers with more than one class', () => {
    expect(html).toContain('data-cr-switcher');
    // One class is not a choice, so the control hides itself.
    expect(dash).toMatch(/select\.hidden = classes\.length < 2/);
  });
});

describe('needs attention is pinned above the grid', () => {
  it('comes before the progress grid in the document', () => {
    expect(html.indexOf('cr-attention-h')).toBeLessThan(html.indexOf('cr-grid-h'));
  });

  it('has a column for the next step and a link to the lesson', () => {
    expect(html).toContain('<th scope="col">Next step</th>');
    expect(html).toContain('<th scope="col">Go to</th>');
  });
});

describe('every number can be interrogated', () => {
  it('puts an info control on the summary stats', () => {
    expect(dash).toMatch(/stat\(dl, 'Median unit reached'[\s\S]*?'medianUnit'\)/);
    expect(dash).toMatch(/'activeThisWeek'\)/);
    expect(dash).toMatch(/'hardestLesson'\)/);
    expect(dash).toMatch(/'commonError'\)/);
  });

  it('states up front that the events are self-reported', () => {
    expect(html).toMatch(/data-cr-info="trust"/);
  });

  it('labels each info button for a screen reader', () => {
    expect(html).toMatch(/class="cr-info" data-cr-info="trust"\s*\n\s*aria-label=/);
    expect(dash).toMatch(/info\.setAttribute\('aria-label', 'How ' \+ label/);
  });
});

describe('what the page does not offer', () => {
  it('has no leaderboard or ranking anywhere in the markup', () => {
    const text = html.toLowerCase();
    for (const banned of ['leaderboard', 'ranking', 'top student', 'class rank']) {
      expect(text).not.toContain(banned);
    }
  });

  it('shows no engagement vanity metrics', () => {
    expect(dash).not.toMatch(/Time on site|Session count|Total clicks|streak/i);
  });
});

describe('the stylesheet', () => {
  it('adds no !important', () => {
    expect(css).not.toContain('!important');
  });

  it('introduces no new z-index values', () => {
    // The header's stacking is already a mess; this must not add to it.
    expect(css).not.toMatch(/z-index/);
  });

  it('reuses the theme tokens', () => {
    for (const token of ['--border', '--panel', '--muted', '--primary', '--success', '--danger']) {
      expect(css, token).toContain(`var(${token}`);
    }
  });

  it('has a narrow-screen layout', () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)/);
  });

  it('turns the attention table into blocks on a phone, keeping the labels', () => {
    expect(css).toMatch(/\.cr-attention \.cr-row__why::before \{ content: 'What happened: '/);
    expect(css).toMatch(/\.cr-attention \.cr-row__do::before \{ content: 'Next step: '/);
  });

  it('lets wide content scroll inside its own container', () => {
    expect(css).toMatch(/\.cr-tablewrap \{ overflow-x: auto; \}/);
  });

  it('respects reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('prints without the nav and without sticky cells', () => {
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/\.site-header/);
    expect(print).toMatch(/position: static/);
    expect(print).toMatch(/\.cr-code__value \{ font-size: 48pt/);
  });

  it('prints landscape, because the grid is wider than it is tall', () => {
    expect(css).toMatch(/@page \{[^}]*size: landscape/);
  });

  it('drops the screen-only sections so the grid gets the page', () => {
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/\.cr-explain,\s*\n\s*\.cr-key \{ display: none; \}/);
    expect(print).toMatch(/break-inside: avoid/);
  });

  it('pairs student code with the expectations only when there is room', () => {
    expect(css).toMatch(/@media \(min-width: 60rem\)[\s\S]*?\.sd-pair \{ grid-template-columns/);
    expect(css).toMatch(/\.sd-pair \{\s*\n\s*display: grid;\s*\n\s*grid-template-columns: 1fr;/);
  });
});
