# Lesson layout and teaching flow

## The layout

- The lesson is near full width. Gutters are about 51px at 1280, 58px at 1440
  and 68px at 1920, and the lesson uses everything between them. There is no
  reading-width cap and no enlarged body type: paragraphs are 16px, the lesson
  title 28px, section headings 19.5px.
- The unit's lesson list is a real column of the lesson grid — 248px, sticky
  under the header, the current lesson marked. It is not an overlay on a
  desktop.
- Closing that column hands its space to the lesson, which moves left and
  reflows wider (1074px to 1339px at 1440). **That reflow is the intended
  behaviour.** A floating "Lessons" chip brings the column back and the lesson
  returns to its original box. The choice is kept in `pypath-sidebar-closed`
  and applies to the next lesson.
- Settings › Lesson sidebar is Always / Auto / Hidden, as it was.
- Below 981px there is no room for a column, so the same element becomes a
  modal drawer over the page: labelled dialog, backdrop, Escape, a focus trap,
  and focus returned to the trigger. Its row carries "Back to path". That row
  exists only below 981px — a desktop has the column's own control and the
  breadcrumb, and does not need a second strip of chrome above the lesson.
- The lesson's own sections are a separate, smaller thing: a collapsed
  "In this lesson" disclosure above the lesson text, at every width. One left
  column, not two.
- A locked unit or an account prompt blurs the lesson column only. The lesson
  list stays sharp and clickable, so the page can still be left.

## Why there is no width cap

A capped, centred reading column has been introduced here more than once on
line-length grounds, and removed again each time. On a wide window it leaves a
narrow strip of text with hundreds of pixels of empty page down each side. Long
lines on a wide window are the accepted trade-off. The cap is not a bug to be
re-fixed: see CLAUDE.md, "The lesson layout is a product decision".

The single place that decides the lesson's width is the canvas block at the end
of `assets/css/pypath-theme.css` (`html body.page-unit` + `!important`). That
sheet loads after `style.css` and `pypath-fast.css`, so a correct-looking rule
in either of those is inert against it. Change that block rather than stacking
another override behind it.

## The teaching flow

- All 159 lessons distribute their existing questions between teaching
  sections, keeping two for a final review. Introductory questions have
  authored placement next to the relevant concept.
- Question panels have type labels, selectable answer cards, two-column choices
  on desktop, and links back to the relevant explanation.
- Section ids are slugs of the heading text (`#step-2-creating-your-first-variable`),
  deduplicated with a numeric suffix. In-page anchors are the browser's own, so
  a section can be linked to and Back steps through jumps.

## Authoring and rebuilding

`question.afterSection` selects the zero-based teaching section after which to
show a check. `question.hint` adds a learner-controlled hint disclosure.
Introductory placements and hints live in `scripts/intro-lesson-enrichment.json`.
Run `node scripts/build-intro-lessons.cjs`, `npm run build:data-course`, and
`npm run build:curriculum` after editing that source.

**Run `python3 scripts/bake_layout.py` after any CSS or JS change**, or browsers
keep serving the previous file from cache against the new page.

## Verification

- `tests/browser/lesson_layout_pacing.mjs` checks the first lesson of all 20
  units at 390, 1280, 1440 and 1920: the sidebar is a column listing that
  unit's lessons with one marked current, gutters stay within 16–72px, closing
  moves the lesson left and widens it, reopening restores its box, the choice
  persists to the next lesson, paragraphs are 16px, the Lessons chip clears the
  breadcrumb, and nothing overflows horizontally. Below 981px it checks the
  drawer instead: dialog, backdrop, Escape, focus return.
- `tests/lesson-pacing.test.js` exercises all 159 pages for check placement.
- `REVIEW/screenshots/lesson-layout-restore/` holds reference (ce22a81) against
  current at four widths, open and closed, for both courses.
- Full Vitest suite and the five browser audits.
