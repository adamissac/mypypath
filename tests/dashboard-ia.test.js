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

describe('roster segments answer the question a teacher is actually asking', () => {
  const html = fs.readFileSync('classroom.html', 'utf8');
  const js = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');

  /* At fifty students the grid is 500 cells with nothing prioritised. The
     roster view fixed the density; these fix the question. A teacher standing
     in a room almost never wants "show me everything" -- they want who is
     stuck, who is behind on what was set, who never started, who has gone
     quiet. */

  it('offers the four questions plus everyone', () => {
    for (const key of ['all', 'attention', 'overdue', 'notstarted', 'idle']) {
      expect(html, key).toContain(`data-cr-seg="${key}"`);
    }
  });

  it('each segment carries its own count', () => {
    // The count is on the control so "is anyone overdue" is answered without
    // clicking it.
    expect(html.match(/data-cr-seg-n/g).length).toBeGreaterThanOrEqual(5);
  });

  it('the buttons report their state to assistive tech', () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(js).toContain("setAttribute('aria-pressed'");
  });

  it('the group is labelled', () => {
    expect(html).toMatch(/data-cr-segments[^>]*role="group"/);
    expect(html).toMatch(/aria-label="Show only students who"/);
  });

  it('says what it is hiding, in a live region', () => {
    // A roster showing four of thirty with no explanation is the most
    // confusing state this page can be in, and the one you land in after
    // switching tabs and coming back.
    expect(html).toMatch(/data-cr-segnote[^>]*aria-live="polite"/);
    expect(js).toContain('hidden)');
  });

  it('a segment matching nobody gets its own words, not "nobody has joined"', () => {
    expect(html).toContain('data-cr-roster-none');
    expect(js).toContain('Nobody is flagged');
    expect(js).toContain('Nobody is overdue');
  });

  it('Overdue does not count work that was handed in late', () => {
    // A segment that keeps showing a student after they finished is one a
    // teacher stops trusting.
    expect(js).toMatch(/state === 'overdue'\) overdue \+= 1/);
    expect(js).not.toMatch(/state === 'done-late'\) overdue/);
  });

  it('Needs attention reuses the flag the attention table is built from', () => {
    // Not something similar. The two must never disagree.
    expect(js).toMatch(/attention:[\s\S]{0,200}test: \(row\) => !!row\.flag/);
  });

  it('the segment is not persisted across sessions', () => {
    // Coming back tomorrow to a roster still hiding two thirds of the class,
    // with the reason three scrolls up, is worse than re-clicking a button.
    expect(js).not.toMatch(/rosterSegment[\s\S]{0,120}(localStorage|sessionStorage)/);
  });

  it('clicking the active segment clears it', () => {
    expect(js).toContain("rosterSegment = rosterSegment === key ? 'all' : key");
  });
});

describe('an assignment card states a count, not four titles in a row', () => {
  const js = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');

  /* Observed live on the deployed site: an assignment targeting four lessons
     rendered every title inline as one run-on line --

       Writing and Running Your First Program, Set Up Your Python Environment
       (Python + VS Code/IDLE), Python Syntax and Indentation, Introduction to
       Python — What It Is and How It Runs

     -- which answers neither "what did I set" nor "how is it going" while
     wrapping over three lines and burying the counts underneath. */

  it('no longer joins titles with commas', () => {
    expect(js).not.toMatch(/parts\.join\(', '\)/);
  });

  it('counts units, lessons and quizzes separately', () => {
    // A teacher sets units and lessons as different kinds of thing and counts
    // them separately in their head; "5 items" is not what they asked.
    expect(js).toContain("say(n('unit'), 'unit', 'units')");
    expect(js).toContain("say(n('lesson'), 'lesson', 'lessons')");
    expect(js).toContain("say(n('quiz'), 'quiz', 'quizzes')");
  });

  it('uses a native details element for the disclosure', () => {
    // Keyboard-operable, announced correctly, and works with no JavaScript --
    // none of which a div with a click handler gets for free.
    expect(js).toContain("document.createElement('details')");
    expect(js).toContain("document.createElement('summary')");
  });

  it('does not hide a single target behind a disclosure', () => {
    // A click that buys nothing.
    expect(js).toMatch(/parts\.length <= 1/);
  });

  it('an assignment with nothing set says so', () => {
    expect(js).toContain("'Nothing set'");
  });
});

describe('requiredSummary phrasing', () => {
  /* Compiled rather than imported: classroom-dashboard.js is an ES module that
     imports the Firebase SDK. Only the pure phrasing helper is exercised. */
  function summarise(assignment, titles) {
    const parts = (assignment.units || []).map((u) => ({ kind: 'unit', label: 'Unit ' + u }))
      .concat((assignment.lessonPaths || []).map((p) => ({
        kind: 'lesson', label: (titles || {})[p] || p,
      })))
      .concat(assignment.quiz ? [{ kind: 'quiz', label: 'q' }] : []);
    if (!parts.length) return 'Nothing set';
    const n = (kind) => parts.filter((x) => x.kind === kind).length;
    const say = (c, one, many) => c + ' ' + (c === 1 ? one : many);
    const bits = [];
    if (n('unit')) bits.push(say(n('unit'), 'unit', 'units'));
    if (n('lesson')) bits.push(say(n('lesson'), 'lesson', 'lessons'));
    if (n('quiz')) bits.push(say(n('quiz'), 'quiz', 'quizzes'));
    if (bits.length === 1) return bits[0];
    return bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1];
  }

  it('singular and plural', () => {
    expect(summarise({ units: [1] })).toBe('1 unit');
    expect(summarise({ units: [1, 2] })).toBe('2 units');
    expect(summarise({ lessonPaths: ['/a'] })).toBe('1 lesson');
  });

  it('joins two kinds with "and", not a comma', () => {
    expect(summarise({ units: [1, 2], lessonPaths: ['/a', '/b', '/c'] }))
      .toBe('2 units and 3 lessons');
  });

  it('joins three kinds with commas and a final "and"', () => {
    expect(summarise({ units: [1], lessonPaths: ['/a'], quiz: { unit: 2 } }))
      .toBe('1 unit, 1 lesson and 1 quiz');
  });

  it('the four-lesson case from the live site', () => {
    expect(summarise({ lessonPaths: ['/a', '/b', '/c', '/d'] })).toBe('4 lessons');
  });

  it('nothing set', () => {
    expect(summarise({})).toBe('Nothing set');
  });
});
