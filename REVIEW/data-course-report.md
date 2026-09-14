# Python for Data: the report

Branch `fix/data-course-parity`, 23 commits ahead of `main`, not pushed.
Checkpoint 0's audit, with file and line evidence for each bug, is in
[checkpoint-0-audit.md](checkpoint-0-audit.md).

## Verification, final state

| Check | Result |
|---|---|
| `npm test` | 94 files, **2579 passed** |
| `npm run validate:checks` | 159 check files valid |
| `npm run test:a11y` | **0** axe violations, 15 page shapes (3 Data shapes added) |
| `npm run test:mobile` | 0 of 34 page/viewport combinations to fix (Data pages added) |
| `npm run test:keyboard` | 0 of 9 pages to fix (a Data lesson added) |
| `npm run test:motion` | pass (a Data lesson added; also now fails on a page-covering element) |
| `npm run test:perf` | every page inside budget (a Data lesson added) |
| `npm run build:data-course` on the final commit | `git status` clean, so the build reproduces the committed output |
| Run pressed on **all 240 editors** of all 60 lessons, signed in | 240 of 240 run, 0 `ModuleNotFoundError`, 0 `FileNotFoundError` |

## What the original diagnosis got right and wrong

1. **Run cannot import numpy or pandas.** Right. Fixed in pyodide-loader,
   with a visible "Loading pandas… first run only" state.
2. **No graded exercises.** Right about the gap, wrong about the cause.
   Check already worked; progress was blocked by `isLessonPage()` matching
   `/units/` only. There was a second instance of the same bug, found this
   pass: `isLessonHref()` also matched only `/units/`, so Data unit pages
   never ticked a finished lesson.
3. **Thin lessons.** Right. Foundations averaged 31.5KB, not 35KB, and it is
   uneven itself (48 of 99 lessons have no mini practice).
4. **Wrong course's questions.** Latent, not live: the Data course linked no
   unit tests at all. The course dimension was built and Data's own tests
   were written.
5. **Dead quiz markup.** The div was dead, but the quiz already rendered;
   the div was removed from the generator.

## What changed

- **Content.** All 60 lessons now have objectives, why-this-matters, 3
  stepwise sections, 2 interleaved mini practices, a "When to Use It" step
  with feature cards and a "When Not to Use It" card, 2 graded exercises
  and 4 questions. Every exercise ships a correct and a plausible wrong
  solution, and the suite proves the correct one passes and the wrong one
  fails. Lessons now average 938 words in `<main>` (Foundations median:
  1108, range 422–2226) and 23.4KB per file (Foundations median: 33.5KB).
- **Layout.** Lesson and unit pages use Foundations' markup: sidebar beside
  the lesson, breadcrumb, Overview card, "Step N" sections, unit lesson list.
- **Run button** writes an exercise's data files before running, so the 14
  file-reading exercises work on Run and not only on Check.
- **Build.** `npm run build:data-course` runs every generator and all three
  post-passes. It used to leave the pages with a Foundations lesson's
  og:url and canonical tags.
- **Tests** that hold the bar. A lesson missing any template part fails,
  on its content and on its rendered page. So does any exercise whose wrong
  answer passes, any editor starter importing what Run cannot load, and a
  Data unit page that cannot tick a lesson.
- **`.claude/skills/pypath-lesson-authoring/`**: see "Skills" below.

## Bugs found along the way that were not on the list

| Bug | Scope | Status |
|---|---|---|
| Reduced motion made **every page blank**: `#page-transition` forced to opacity 1 | Site-wide, live on mypypath.com since 2026-06-16 | Fixed (9806cac); `test:motion` now catches it |
| Line numbers printed over the first characters of code in every lesson editor | Site-wide, live | Fixed in CSS (196f35e) |
| Lesson editors with long starters failed axe (`scrollable-region-focusable`), and line numbers failed contrast (4.31:1) | Site-wide | Fixed: editors grow to fit their code; line numbers now 6.86:1 |
| Lessons taught that merging a text id with an int id "matches nothing". It raises `ValueError` (checked in Pyodide's pandas 1.5.3 and in 2.3.3) | Units 5, 8, 10, 3 quiz questions, 2 unit test explanations | Fixed (b459f50, 7c3eda6) |
| Three exercises whose wrong answer passed every check | Units 8, 9, 10 | Fixed with sharper hidden cases |
| `tests/run-button-packages.test.js` threw on 48 lessons after the unit 3–10 rewrite | Test | Fixed |
| Data unit pages ran number, title and summary together, with no styling | Data | Fixed (0080a22) |

## Screenshots (`REVIEW/screenshots/`)

- Side by side, top of page and full page:
  `final-side-data-u1-reading-a-csv-file-*`,
  `final-side-data-u4-selecting-columns-and-rows-*`,
  `final-side-data-u9-resampling-*` against
  `final-side-foundations-u1-what-is-python-*`,
  `final-side-foundations-u2-for-loop-*` and
  `final-side-foundations-u3-lambda-functions-*`.
- Run, Check wrong, Check correct and the quiz, for a standard-library, a
  pandas and a two-file lesson: `final-unit-1-reading-a-csv-file-ex1-*`,
  `final-unit-4-reading-a-csv-into-pandas-ex1-*`,
  `final-unit-10-the-whole-analysis-ex1-*`, and `final-*-quiz-answered.png`.
- Cold pandas load: `final-run-pandas-cold-loading-state.png`.
- Progress: `final-progress-lesson-complete-chip.png`,
  `final-progress-unit-2-page-after-completion.png`.
- Unit tests: `final-unit-test-data-u3.png` (10 Data prompts, 0 Foundations
  prompts), `final-unit-test-units-u3.png`, and `final-unit-test-data-u8.png`
  (locked until unit 7 is finished, as designed).
- Mobile, 390px: `final-data-u5-csv-options-mobile.png`,
  `final-data-unit-6-page-mobile.png`.
- Reduced motion: `reduced-motion-blank-page-production-before.png`,
  `reduced-motion-fixed-foundations-u3.png`.
- Earlier checkpoints: `baseline-*`, `cp1-*`, `cp2-*`, `cp3-*`, `cp4-*`.

## Not verified, or not fixed

- **Progress sync debounce (pre-existing, not changed).** `sync.js` writes
  to Firestore 5s after the last change and nothing flushes on page exit. A
  lesson completed and left within 5s is saved on that device only, until a
  later sync. That device still shows it; a teacher's dashboard or a second
  device lags. Reproduced for both courses. A `pagehide` flush is the likely
  fix, but sync is shared with the teacher dashboard, so this needs your
  decision.
- **Class unit locks may cover Foundations only.** The seeded student is
  hard-locked out of Foundations unit 7 but can open Data unit 9. The
  policy code was not traced.
- **The unit progress panel** ("Your progress in this unit") is not on Data
  unit pages. Its `unitBreakdown` reads Foundations units only.
- **Teacher quiz picker for Data.** The quiz bank has a course dimension
  (4495a2b) with Data questions, but assigning a Data quiz from
  `classroom.html` was not walked in a browser.
- **`npm run seed` stops after the first student.** Only `teacher@` and
  `student01@` exist afterwards. Browser verification used `student01`. Not
  investigated.
- **Word count.** Data lessons are within the Foundations range but about
  15% shorter at the median. The difference is prose, not structure; every
  lesson has every template part.
- **Skill benchmark.** skill-creator's with-skill and without-skill eval
  runs were not executed (`evals/evals.json` holds the three prompts). The
  skill passes `quick_validate.py`, and its sweep script was run.
- **Known Pyodide race** in Foundations entry lessons: not hit, not touched.
- **Firestore rules:** unchanged, so there is no rules deploy to do.

## Skills

Installed at the start of this work (5faa5de): `webapp-testing` (every
browser check), `frontend-design` (read for the layout work; its advice
defers to a brief that fixes the look, and this one said "match
Foundations", so its markup was reused rather than redesigned), and
`skill-creator` (structure and validator for the new skill). Nothing else
was installed.
