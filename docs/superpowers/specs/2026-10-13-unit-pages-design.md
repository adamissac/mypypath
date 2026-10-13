# Unit overview pages: the lesson trail

**Status:** Design approved in chat; awaiting written-spec review
**Date:** 2026-10-13
**Order:** Third of three (after the trail cleanup and summit diorama specs)

## Goal

The unit overview pages (`/units/unit-N.html` and `/data/unit-N.html`, 20 in
all) are a heading and a bare numbered list of links. Replace that with a page
that tells a learner what the unit is, how far through it they are, and what to
do next. Chosen in chat: **lesson trail** layout.

Two visible bugs on these pages are fixed along the way:

- Lesson numbers print twice ("1. 1. What Is Python"): the text carries a
  number inside an `<ol>` that numbers it again.
- The footer shows the raw key `footer.settings`: `en.json` has no entry for
  it. (It shows on every page with that footer link, so the fix is site-wide.)

## Layout

### Unit header

- Eyebrow: course and unit ("Python Foundations · Unit 1").
- Title (h1) and the unit's blurb from `assets/data/courses.json`.
- Meta chips: hours and level (from `courses.json`), lesson count.
- A progress ring with the percentage and the existing summary sentence
  (`PyPathUnitProgress.describe`, e.g. "3 of 8 lessons done · test not passed
  yet"). Replaces the current progress box; same numbers, same source.
- Primary button: "Start Unit N" when nothing is started, "Continue: Lesson 4,
  Syntax & Indentation" when some is, "Review the unit" when complete. Ghost
  button back to the course page.

### Lesson trail

- A vertical trail: one connected line with a stop per lesson, a card beside
  each stop. The unit test is the last stop, drawn as the summit (a small peak
  icon), so the page echoes the home trail.
- Each card: lesson number (once), title, a one-line summary, an estimated
  time ("10 min"), and status. The whole card is the link.
- Status, from the learner's own lesson map (`PyPathLessonProgress`), so it
  works signed out:
  - **done**: filled stop, check mark, the trail line is solid up to it;
  - **up next**: the first unfinished lesson, ringed stop, "Up next" tag, card
    slightly raised;
  - **not started**: hollow stop, muted line.
  Lessons a learner has started but not finished say "In progress".
- The test stop shows the pass mark and best score ("Best 64 · 70 to pass"),
  "Not taken yet", or "Passed", with the existing test link.
- Locked units (account required) keep today's gate behaviour; the cards show
  the lock state the gate already applies.

### Phones

Below 560 px the trail line moves to a narrow left rail and cards take the
full width. No horizontal scroll at 320 px (`test:mobile`).

### Motion

On load the trail line draws down to the learner's position and the cards
fade up in sequence (≤ 600 ms total). Nothing animates under reduced motion.

## Content

- **Summary per lesson.** Python for Data lessons already have a real
  `<meta name="description">`. Foundations lessons have a generic one, so the
  generator takes the first item of each lesson's "What You Will Learn in This
  Lesson" list (falling back to the first sentence of its Overview), trimmed
  to one line. The generator prints every summary it derived, and the plan
  includes reading all 99 once.
- **Time estimate.** From each lesson's prose word count (200 words a minute)
  plus 2 minutes per code editor and 3 per exercise (`editors` and
  `exercises` in `curriculum.json` / `curriculum-data.json`), rounded to 5
  minutes, minimum 5. Shown as an estimate, never as a requirement.
- **Lesson titles** come from `curriculum.json` / `curriculum-data.json`
  (the short title, e.g. "Variables & Types", not the long `<title>`).

## Build

- One generator for both courses: `scripts/build-unit-pages.mjs` rewrites the
  region between `<!-- unit-page:begin -->` and `<!-- unit-page:end -->` in
  all 20 unit pages from the JSON data and the lesson files. `--check` exits
  1 if any page is stale, and runs inside `npm test` via a vitest test.
- `scripts/build-data-course.cjs` emits the markers instead of its own list.
- The unit-page block in `scripts/bake_layout.py` is removed. It no longer
  runs (it matches `<main>` and the pages now have `<main id="main-content">`),
  so it is dead code that would fight the generator if it were ever fixed.
- Styles in a new `assets/css/unit-page.css`; behaviour in the existing
  `assets/js/unit-progress-panel.js`, extended to fill statuses, the ring and
  the button. Both versioned in `scripts/bake_layout.py`.
- Page text stays translatable: new strings get `data-i18n` keys in
  `en.json`; `npm run validate:i18n` passes.

## Verification

- Unit tests: summary extraction, time estimate, status derivation (none /
  some / all / test passed), generator `--check`.
- Screenshots of Foundations Unit 1 and Python for Data Unit 3 at 1440, 1024,
  390 and 320, light and dark, with no progress and with seeded progress (two
  lessons done, one started, test failed at 64).
- `npm run test:a11y`, `test:mobile`, `test:keyboard`, `test:motion`,
  `test:perf`, `npm test`, `npm run validate:i18n`.
- Push to `main`, confirm the new `?v=` hashes on mypypath.com, repeat the
  screenshots live.

## Out of scope

Lesson pages themselves (their layout is a settled product decision; see
CLAUDE.md), the course pages (`curriculum.html`, `data.html` cards), and the
unit test page.
