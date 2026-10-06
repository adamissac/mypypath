---
name: pypath-lesson-authoring
description: How to write or change a PyPath lesson so it meets the Foundations quality bar — objectives, why-this-matters, stepwise sections, interleaved mini practices, a when-to-use step, and two or more graded exercises whose checks provably reject a wrong answer. Use this whenever you add a unit or lesson to Python for Data (unit 11 onward included), rewrite or fix any lesson under data/, touch scripts/build-data-course.cjs or a scripts/data-course-unit-*.cjs file, add exercises or quiz questions, or build another generated course in the same style — even if the request only says "add a lesson about X" or "fix this lesson".
---

# PyPath lesson authoring

Python for Data was first shipped as sixty 14KB stubs: a title, two
paragraphs, one ungraded editor, and a Run button that could not import
pandas. Every rule below exists because that happened, or because a later
pass on the same course broke something in a way the tests did not see.

## Rule zero: the HTML is output

`data/unit-*/**.html`, `data/unit-*.html`, `data.html`,
`assets/data/checks/data/**`, `assets/data/curriculum-data.json` and
`assets/data/unit-tests/data/**` are all generated. Edit the sources:

| What | Source |
|---|---|
| Lesson content | `scripts/data-course-unit-N.cjs` (one file per unit) |
| Unit registry | `scripts/data-course-content.cjs` (spreads the unit files) |
| Page template | `scripts/build-data-course.cjs` |
| Unit test MCQs / FRQ | `scripts/data-unit-tests-content.cjs`, `scripts/data-unit-tests-frq.cjs` |
| Which units exist | `assets/data/courses.json` (`stub: true` hides a unit) |

Rebuild everything with one command, which also runs the layout, meta and
noscript passes a generated page needs:

```bash
npm run build:data-course
git status   # after a rebuild from clean sources this must be empty
```

A fix that only lives in generated output is erased by the next rebuild.
This has happened in this repo more than once, including to an MCQ
explanation corrected in the JSON and not in its `.cjs` source.

## The lesson shape

Read `references/lesson-schema.md` for the full annotated example before
writing a lesson. In short, every lesson object has:

- `slug`, `title`, `summary` — the summary is the Overview card text.
- `objectives` — 3–5 "be able to" statements, each testable.
- `why` — a paragraph on why this matters **before** the how. Name what
  goes wrong without it, and where it comes back later in the course.
- `sections` — 3 is typical. Each has `heading`, `intro`, and `steps` of
  `{ heading, prose, code, note? }`, plus an optional section `note`
  (rendered as a "Key idea" callout). Rendered as "Step N: heading" with
  numbered sub-steps.
- `practices` — at least 2 ungraded editors, each with `after: <section
  index>` so they sit **between** sections, not piled at the end.
- `use` — `{ cards: [2 × { title, text, code? }], avoid }`: the "When to Use
  It" feature cards and the "When Not to Use It" card. `avoid` names the
  specific mistake, not "use judgement".
- `exercises` — at least 2 graded exercises (see below).
- `questions` — at least 3, ids unique across the course (`d<unit>-<abbr>-<n>`).
  Kinds: plain MCQ (`choices`, `answer`), `multi` (`answers`), `order`
  (`items`, `answer`), `blank` (`blanks: [{ accept: [...] }]`).

`tests/checks-data-course.test.js` fails any lesson missing one of these,
on the content object and on the rendered page. Do not weaken that test to
make a thin lesson pass.

## Exercises: a check that cannot fail verifies nothing

Every exercise carries its own `correct` and `wrong` solution next to it.
The test suite runs both against real Python (numpy and pandas must be
installed locally): the correct one must pass every case, and the wrong one
must fail at least one. Choose `wrong` as the **plausible mistake the
lesson is about**: `>` for `>=`, the group count instead of the row count,
sorting the caller's list in place, `if not score` treating 0 as missing.
Then write a hidden case that catches exactly that mistake. When the suite
says a wrong answer passed, the fix is a sharper hidden case, never a
sillier wrong answer.

Two exercise styles:

- **stdout**: `expect_stdout: '...'`. Good for the first exercise of a
  lesson. Pair with `kind: 'ast'` cases so a typed-out answer fails
  (`requires: { calls: ['len'] }`, `loops: true`, `imports: ['csv']`).
- **value**: `call: 'fn(args)'`, `expectValue: "repr"`, and `hidden` cases
  of `{ name, call, expect }`. `expect` is compared against `repr()`.

Traps that have each cost a failed run here:

- **numpy/pandas scalars have a different repr.** `np.int64(7)` is not `7`,
  and `np.str_('a')` is not `'a'`. Have the exercise return plain Python
  (`int(...)`, `float(...)`, `str(...)`, `.tolist()`), and say so in the prompt.
- **Check the library, not your memory.** "Merging an int key with a text
  key matches nothing" was taught across three units. It raises
  `ValueError`. Passing `names=` to `read_csv` already implies
  `header=None`. Run every claim in Python before it goes into prose.
- **Round only the result**, and pick inputs where rounding early gives a
  different answer (`[0.6, 0.6, 0.0]` at 0 places), or the rounding case
  proves nothing.
- **Files**: put fixtures in `files: { 'scores.csv': '...' }`. Check and Run
  both write them, so the starter can open the file on Run. Hidden cases
  can supply different files so a recited answer fails.
- **Packages**: set `packages: ['pandas']` on the unit. Units 1 and 2 stay
  standard library, so a signed-out visitor never downloads the wheels.
- Use unicode `—` in prose, not `--`: it renders literally.

## Workflow for a new unit

1. Create `scripts/data-course-unit-N.cjs` modelled on an existing unit
   file (unit 3 is the documented reference). Add its `require` to
   `scripts/data-course-content.cjs`, and the unit to `assets/data/courses.json`.
2. Add unit test questions to `scripts/data-unit-tests-content.cjs`
   (at least 10 MCQs) and one FRQ in `scripts/data-unit-tests-frq.cjs`.
3. `npm run build:data-course`, then
   `npx vitest run tests/checks-data-course.test.js tests/data-unit-tests.test.js tests/run-button-packages.test.js`.
4. Verify in a browser. Read `references/verification.md`: a passing test
   suite has repeatedly coexisted with a page that was visibly broken.
5. `npm test`, `npm run validate:checks`, and the five browser scripts
   (`test:a11y`, `test:mobile`, `test:keyboard`, `test:motion`, `test:perf`).
6. Commit sources and generated output together, so every commit rebuilds
   to itself.

## Writing the prose

Teach the idea, not the API. Each step answers "what does this do, and
what goes wrong if you get it wrong", with a runnable example. Connect
backwards and forwards: the unit 1 dictionary group-by *is* unit 7's
`groupby`, and saying so turns new material into a faster version of
something already understood. Prefer a small real mistake shown running
over a warning in words. Keep examples short enough to read without scrolling.
