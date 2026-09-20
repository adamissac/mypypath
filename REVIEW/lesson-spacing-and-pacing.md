# Lesson spacing and teaching flow

## Behavior

- Both courses use 16–32px page gutters. Unit overview pages use the same spacing.
  Opening the lesson menu does not change the lesson's left edge or width.
- The menu is a labelled dialog outside the lesson layout. Close, Escape, and
  clicking outside dismiss it; focus returns to its trigger. Tab remains within
  the open menu. Navigation stays usable when an account prompt blocks a lesson.
- A Back to path link appears next to the lesson menu on every lesson page.
- All 159 lessons distribute their existing questions between teaching sections,
  keeping two for a final review. Introductory questions have authored placement
  next to the relevant concept. Other lessons distribute checks through the
  teaching sections in their existing question order.
- Question panels have clearer type labels, selectable answer cards, two-column
  choices on desktop, and links back to the relevant explanation. Matching and
  blank questions ask learners to finish before exposing feedback.
- All 14 introductory transfer challenges now contain runnable editors and
  resettable starters, plus optional hints in their new questions. The lesson
  outline includes async-loaded checks in actual reading order.

## Authoring and rebuilding

`question.afterSection` optionally selects the zero-based teaching section after
which to show a check. Learning objectives, prediction disclosures, and “When to
Use It” sections are excluded. The last two questions remain the final review.
`question.hint` adds a learner-controlled hint disclosure.

Introductory placements and hints live in `scripts/intro-lesson-enrichment.json`.
Run `node scripts/build-intro-lessons.cjs`, `npm run build:data-course`, and
`npm run build:curriculum` after editing that source. Generated manifests include
the transfer editors. Existing question IDs and grading rules are retained.

## Verification

- `tests/lesson-pacing.test.js` exercises all 159 pages: inline checks, final
  review, authored placement, no missing/duplicate questions, and unfinished
  answer feedback.
- `tests/browser/lesson_layout_pacing.mjs` checks the first lesson of all 20 units
  at 390, 1440, and 1920px: gutter sizes, stable geometry across menu toggles,
  Escape, focus, and overflow. It also verifies lesson outlines, review links,
  transfer-editor execution/reset, and accessibility.
- `tests/browser/intro_activities.mjs` checks mouse, touch and keyboard activities
  in both courses and both colour modes.
- Full Vitest suite and the five required browser audits.
