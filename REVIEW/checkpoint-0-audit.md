# Checkpoint 0 — audit of Python for Data

Branch `fix/data-course-parity`. No source changed; the tree was restored to
`main`'s content after every experiment. Baseline before any work:
`npm test` 92 files / 2281 tests pass, `npm run validate:checks` 159 files valid,
`npm run test:a11y` TOTAL 0 violations.

Everything below was reproduced in Chromium against `localhost:8080`, waiting
out the `pp-boot` overlay and the `.site-header` fade before reading the DOM.

---

## Bug 1 — Run cannot import numpy or pandas — CONFIRMED, exactly as diagnosed

`runEditorCode` (`assets/js/lesson-runner.js:283`, call at `:292`) goes straight
to `window.Pyodide.runCode(code)`. `loadPackage` appears in exactly one place in
the app, `assets/js/checker.js:687-688`, reading `spec.packages`.

Browser, pressing **Run** on the shipped starter:

| lesson | starter line 1 | output panel |
|---|---|---|
| `/data/unit-3/creating-arrays-and-dtypes` | `import numpy as np` | `ModuleNotFoundError: The module 'numpy' is included in the Pyodide distribution, but it is not installed.` |
| `/data/unit-5/reading-json-data` | `import pandas as pd` | `ModuleNotFoundError: ... 'pandas' ...` |
| `/data/unit-1/what-is-data-analysis` | `rows = [` | `Code executed successfully` |

Screenshots: `baseline-run-numpy-lesson-output.png`,
`baseline-run-pandas-lesson-output.png`, `baseline-run-stdlib-lesson-output.png`.

**Check**, on the same numpy lesson with a correct solution pasted in, returns
**"All 5 checks passed."** — so the checker's package path genuinely works and
only the free-run path is missing it (`baseline-check-numpy-correct.png`).

Counts: 48 of 60 lesson starters import numpy or pandas. By spec, 42 declare
`pandas`, 6 declare `numpy`, 12 declare nothing (all of units 1–2).

---

## Bug 2 — graded exercises — CONFIRMED, but the cause is not the one diagnosed

Two corrections, one of which changes the fix.

**Data lessons *do* get a Check button.** `check-ui.js:222` mounts on
`.interactive-editor[data-editor-id]`, not on `data-exercise-id`. Every Data
lesson has one, it grades, and it loads numpy. The `data-exercise-id` count
(57 Foundations / 0 Data) is right, but it is not what gates grading.

**Completion is broken for a different reason, and adding `data-exercise-id`
alone would not fix it.** `lesson-progress.js:283-284`:

```js
function isLessonPage() {
  return /^\/units\/unit-\d+\/[^/]+\.html$/.test(path);   // Foundations only
}
```

Line 1322 gates the entire wiring — `required = requiredItems()`, `insertChip()`,
`wrapGlobals()`, `loadConceptSpec()` — behind that regex. On a `/data/` path it
is false, so `required` stays `[]` and `markItem` returns at its first line
(`:426`, `required.indexOf(id) === -1`). Measured in the browser after pressing
Run on each course:

```
/units/unit-1/what-is-python.html  -> {"done":["practice1"],"passed":false}
/data/unit-1/summarising-numbers.html -> no entry written at all
```

So **no Data lesson can ever record progress or complete**, and no Data unit can
complete. `lesson-progress.js:1156` already handles `(units|data)`, so the file
was half course-enabled and this regex was missed.

**Scope you should know about:** all 60 Data specs contain `exercise1` only.
Foundations specs carry `exercise1` + `exercise2`. "At least 2 graded exercises"
therefore means authoring 60 new `exercise2` specs, not just re-wiring markup.

---

## Bug 3 — thin lessons — CONFIRMED, with one caveat about the bar

Measured: Data **14.0 KB** average over 60 files, Foundations **31.5 KB** over 99
(you said ~35; 31.5 is the number). `Mini Practice` 51 Foundations / 0 Data.
`Why This Matters` 51 Foundations / 0 Data. Rendered DOM: 4 `<h2>` on a Data
lesson vs 6–11 on Foundations.

Side-by-side full-page render:
`baseline-side-by-side-data-vs-foundations.png`. The gap is obvious at a glance.

**Caveat:** Foundations is not uniformly the bar. 57 of 99 have graded
exercises, 51 of 99 have Mini Practice. `units/unit-1/what-is-python.html` has
0 graded exercises and no Mini Practice, and so does
`units/unit-7/with-statement-file-operations.html` — *the generator's own donor
page*. The bar is the good ~51, e.g. `unit-3/lambda-functions.html` (57 KB
rendered, 2 graded exercises, 4 quiz questions). Worth saying out loud so
"match Foundations" does not get measured against its weakest files.

---

## Bug 4 — wrong course's questions — HALF CONFIRMED (latent, not live)

Confirmed: no course prefix anywhere. `quiz-bank.js:115` builds
`/assets/data/unit-tests/unit-N-mcq.json`; `unit-test-page.js:24` hardcodes
`DATA_DIR = '/assets/data/unit-tests/'`. Both directories hold Foundations only.

Refuted: the collision cannot be reached by navigation today, because
**the Data course links to zero unit tests.** `grep` finds 0 references to
`unit-test` in `data.html` and 0 across all 60 Data lessons;
`curriculum.html` links all ten Foundations tests. In the browser,
`/unit-test.html?unit=3` requests `unit-3-mcq.json` + `unit-3-frq.json` and
renders Foundations content, and **`?course=data` is ignored entirely** —
identical requests (`baseline-unit-test-unit3-is-foundations.png`).

Also note `quiz-bank.js` is consumed by `quiz.html` and `classroom.html`
(teacher-assigned quizzes), *not* by `unit-test.html`. So there are two separate
course-blind paths, and the live one is the teacher quiz picker: a teacher whose
student is on Data can only assign Foundations questions.

Net: the fix you asked for is right, but it is "wire a dimension that was never
built" rather than "repair a cross-wire". Nothing is currently serving a Data
student the wrong questions, because nothing is serving them any.

---

## Bug 5 — dead quiz markup — CONFIRMED dead, REFUTED as broken

`data-lesson-quiz` is in all 60 Data lessons and referenced by no JS in the repo.

But the quiz **renders correctly anyway**. `lesson-quiz.js:34` carries its own
course-aware `COURSE_CHECK_DIR = { units: '', data: 'data/' }` and appends to
`.lesson-content`/`main`. Browser, all three Data lessons sampled: one `.quiz`
section, **3 questions each**. Students do not see an empty box.

So the div is inert decoration, and the fix is to delete it from the generator.
`tests/check-spec-url.test.js:82` passes because every Data spec does have
questions.

---

## Two more, not on your list

### 6. `bake_layout.py` cannot run here — this blocks the documented workflow

```
File "scripts/bake_layout.py", line 76
def current_unit_from_path(path: Path) -> int | None:
TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'
```

`X | None` needs Python 3.10+; this machine has 3.9.6 and no Homebrew. All three
uses (`:76`, `:107`, `:117`) are annotations only, so `from __future__ import
annotations` fixes it without touching behaviour.

Related: `build-meta.py` and `build-noscript.py` are **dry-run unless
`--apply`** — they print "Nothing was written." and exit 0, which reads as
success. The full pipeline is four steps, not two:

```bash
node scripts/build-data-course.cjs
python3 scripts/bake_layout.py
python3 scripts/build-meta.py --apply
python3 scripts/build-noscript.py --apply
```

Run `build:data-course` alone today and all 72 pages regress: og:title,
og:description, og:url and canonical all revert to the **donor page's**
("Unit 7 • Using the with Statement for File Operations",
`https://mypypath.com/units/unit-7/...`), the noscript notice disappears, and
the nav marks Foundations as current on Data pages.

### 7. The generator reintroduces an accessibility violation

Generator emits `<h4>Exercise</h4>` under an `<h2>`; the committed HTML has
`<h3 class="h4">Exercise</h3>`. Someone fixed the output and not the generator —
the exact trap rule zero warns about, already sprung. Measured with the repo's
own axe config (`heading-order` enabled, as `audit-a11y.mjs` does):

```
committed     /data/unit-1/what-is-data-analysis.html -> target-size(4)
              /data/unit-3/creating-arrays-and-dtypes.html -> CLEAN
regenerated   /data/unit-1/what-is-data-analysis.html -> heading-order(1), target-size(4)
              /data/unit-3/creating-arrays-and-dtypes.html -> heading-order(1)
```

Every Data lesson gains `heading-order` on regeneration, against a stated budget
of zero.

### 7b. Nothing measures the Data course

`scripts/audit-a11y.mjs:40` lists 12 pages. Not one is `/data.html` or a
`/data/` lesson — the whole second course sits outside the a11y budget, which is
why the `target-size(4)` above has never been reported. That Data unit-1 result
is axe's own `target-size` rule; the harness also runs its own probe with WCAG
spacing exceptions, so its number may be lower. Either way it is unmeasured.

---

## Summary

| # | Claim | Verdict |
|---|---|---|
| 1 | Run can't import numpy/pandas | **Confirmed** as stated |
| 2 | No graded exercises | **Confirmed**, wrong cause — the blocker is `isLessonPage()`, and Check already works |
| 3 | Lessons are thin | **Confirmed** (31.5 KB not 35; Foundations itself uneven) |
| 4 | Wrong course's questions | **Latent, not live** — Data links to no tests at all |
| 5 | Dead quiz markup | **Dead div confirmed**, but the quiz renders fine |
| 6 | — | `bake_layout.py` crashes on py3.9; two build steps are dry-run by default |
| 7 | — | Generator reintroduces `heading-order`; Data is outside the a11y sweep |
