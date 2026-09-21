# Lesson spacing and teaching flow

## Behavior

- The reading column is capped at 45rem (~75 characters a line) and centred,
  rather than filling the window. It was uncapped: 140 characters a line at
  1280px, 158 at 1440, 215 at 1920. Gutters grow with the window instead.
- Every lesson carries a table of contents built from its own `<h2>` section
  headings. Above 1024px it is a sticky column beside the lesson with the
  current section marked; below that it is a closed disclosure above the lesson.
  It is one element that moves between the two, not two copies.
- Section ids are slugs of the heading text (`#step-2-creating-your-first-variable`),
  deduplicated with a numeric suffix. They used to be positional
  (`lesson-section-4`), which meant a shared link moved when a check was added,
  and the same section could come out `#teaching-section-0` or `#lesson-section-2`
  on different loads depending on which script reached it first.
- Opening the lesson menu does not change the lesson's left edge or width.
- The menu is a labelled dialog outside the lesson layout. Close, Escape, and
  clicking outside dismiss it; focus returns to its trigger. Tab remains within
  the open menu. Navigation stays usable when an account prompt blocks a lesson.
  It is the unit's lesson list; the contents column is the current lesson's
  sections. Both exist and neither replaces the other.
- In-page anchors are the browser's own. `motion.js` used to intercept every
  `a[href^="#"]`, which stopped the URL updating (no shareable section link, no
  Back through sections) and offset by a header height that excluded the
  attribution banner. `scroll-padding-top` on the scrollport does it correctly,
  and is the single source the active-section tracker reads too.
- A clicked topic stays the current one until the reader scrolls away from it,
  because a page keeps settling after a jump and can push the target below the
  reading line. At the end of the document the last section is current.
- A shut unit takes the contents column with it. It is docked outside
  `.course-main`, so `stowLessonBody()` had to be told about it.
- A Back to path link appears next to the lesson menu on every lesson page.
- Card titles are `<h3 class="h4">` everywhere. 837 across 99 files were still
  bare `<h4>`, and `.step-content` and `.exercise-item` had no `h3.h4` rule, so
  549 already-converted titles rendered a size and weight below their
  unconverted siblings in the same list.
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
  at 390, 1440, and 1920px: line length, gutter floors, the contents column's
  position, stable geometry across menu toggles, Escape, focus, and overflow. It
  also verifies contents links resolve and are in reading order, that a deep link
  to `#some-topic` lands clear of the fixed header, review links,
  transfer-editor execution/reset, and accessibility.
- All 159 lessons were swept at 1440, 1280, 768 and 390px for page overflow,
  dead contents links, missing sections, duplicate ids, heading-level skips,
  overflowing code, tables and images, and empty sections.
- `npm run test:rules` (251) against the emulator, and a seeded signed-in pass:
  a student on an open lesson, a student on a shut one, and the teacher
  dashboard, with no console errors.
- `tests/browser/intro_activities.mjs` checks mouse, touch and keyboard activities
  in both courses and both colour modes.
- Full Vitest suite and the five required browser audits.
