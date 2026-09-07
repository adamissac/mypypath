import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* One heading face inside a lesson, and one rule for a card grid's last row.
 *
 * Both were measured in a browser -- these are the cheap guards that keep the
 * decisions from being quietly reverted. scripts/ has the real checks.
 */

const theme = fs.readFileSync('assets/css/pypath-theme.css', 'utf8');
const style = fs.readFileSync('assets/css/style.css', 'utf8');

describe('every heading inside a lesson uses the body face', () => {
  /* Measured before: 15 headings in Plus Jakarta Sans and 7 in Syne,
     interleaved on one lesson page. The Syne ones were bare <h4> sub-headings
     falling through to the global h1..h6 display-face rule, because every
     other level was enumerated and h4 was not. */

  it('is scoped to the lesson body, not a list of containers', () => {
    /* The first fix added h4 to the enumeration, and the second course
       immediately showed why that shape is wrong: /data/ lessons use their own
       containers and came back mixed across THREE faces. An enumeration of
       containers is a list that is wrong again the next time somebody adds
       one. */
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(theme, level).toContain(`.page-unit main ${level}`);
    }
  });

  it('overrides the global display-face rule', () => {
    // The global rule sets h1..h6 to var(--pp-display); this has to win.
    expect(theme).toMatch(/\.page-unit main h6[\s\S]{0,200}font-family: var\(--pp-body\) !important/);
  });

  it('the global rule still sets the display face for everything else', () => {
    // Syne is right for the marketing pages. This is not a site-wide swap.
    expect(theme).toMatch(/h1, h2, h3, h4, h5, h6[\s\S]{0,300}--pp-display/);
  });

  it('kills the gradient treatment inside a lesson', () => {
    // A marketing flourish that makes a heading unreadable against lesson prose.
    expect(theme).toMatch(/-webkit-text-fill-color: unset !important/);
  });
});

describe('a card grid has one rule for its last row', () => {
  /* Measured before, on a lesson page at 1100px: the uses grid ran 3, 3, 2 and
     the feature grid ran 2, 1 -- each trailing row left-aligned with a
     column-sized hole beside it, which reads as a missing card rather than as
     the end of a list. Now 0px of trailing gap at every width from 390 to
     1400. */

  it('uses flex, because grid cannot address a row', () => {
    // There is no selector for "whatever turns out to be the final row".
    expect(style).toMatch(/\.uses-grid,\s*\n\.feature-grid \{[\s\S]{0,120}display: flex/);
  });

  it('trailing items grow to fill', () => {
    expect(style).toContain('flex: 1 1 180px');
    expect(style).toContain('flex: 1 1 260px');
  });

  it('caps the small chips so one cannot become a banner', () => {
    // A lone stretched chip would look like a different kind of thing.
    expect(style).toMatch(/\.uses-grid > \* \{[\s\S]{0,120}max-width: 360px/);
  });

  it('does NOT cap the feature cards, deliberately', () => {
    /* A feature card is a heading and a paragraph; a lone one filling the row
       reads as the last item in a set. A 285px hole beside it -- which is what
       a cap produced at 1200px -- reads as a card that failed to render. */
    const block = style.slice(style.indexOf('.feature-grid > * {'));
    expect(block.slice(0, 400)).not.toMatch(/max-width:\s*\d/);
  });
});

describe('the reduced-motion backstop', () => {
  it('turns motion off by default under the preference', () => {
    /* The dozen existing prefers-reduced-motion blocks are each correct and
       the arrangement is opt-IN, so new animation is honoured by default and
       has to remember to exclude itself. Three had drifted, including an
       18-second infinite one. */
    expect(style).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,400}animation-duration: 0\.01ms !important/);
  });

  it('uses 0.01ms rather than none', () => {
    /* `animation: none` can leave an element stuck in its STARTING state -- a
       fade-in that never fades sits at opacity 0, which is worse than the
       animation. 0.01ms runs it instantly to its end state. */
    const block = style.slice(style.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block.slice(0, 600)).not.toMatch(/animation:\s*none/);
  });

  it('leaves an explicit opt-out', () => {
    expect(style).toContain('data-motion-keep');
  });

  it('stops smooth scrolling too', () => {
    // A long smooth-scrolled jump is the most disorienting motion of all.
    expect(style).toMatch(/scroll-behavior: auto !important/);
  });
});
