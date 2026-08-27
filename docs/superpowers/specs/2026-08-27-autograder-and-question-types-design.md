# Question kinds, four new deterministic types, and the reflection floor

Date: 2026-08-27
Status: awaiting sign-off
Related: `2026-08-27-assignments-and-unit-locking-design.md` (spec 1, shipped),
`2026-08-20-unit-tests-design.md` (the pool format this extends),
`docs/prompts/2026-08-27-classroom-assignments-and-grading-kickoff.md` (the brief)

Second of three. Adds no new deployed component and no dollar cost: a new field in
existing JSON, four new renderers, four new pure scoring functions, and one new pure
check on reflection text.

## Goal

Two things a lesson cannot express today, and one thing it currently accepts that it
should not.

1. **Four question types that are deterministically gradable and are not written yet:**
   matching, ordering (a Parsons problem, which is a particularly good fit for Python
   where indentation is the syntax), fill-in-the-blank, and multi-select. All four have a
   right answer and no ambiguity, so none of them needs a model. They need a JSON shape,
   a renderer, and a pure scoring function shaped like `scoreMcq` in `unit-test.js`.
2. **An explicit `kind` on every authored question**, because today the type is inferred
   from which keys happen to be present, and four new types make that guessing game
   worse rather than better.
3. **A substance floor on reflection prompts**, which today are marked done the instant
   `input.value.trim()` is non-empty. One character passes. Keyboard mash passes.

## What this is, and what it is not

The FRQ and code-check pipeline is not being touched. `unit-test-page.js` already runs
student code in an isolated Pyodide namespace against hidden cases the client never
displays, and enforces a shared line budget across the paper. That is a real autograder
and it is not what is weak.

The reflection floor is likewise not a grader. It cannot tell a thoughtful answer from a
fluent wrong one and does not try. It is a floor: a check that something was actually
written, in the same spirit as `nonempty` in `checker.js`. Judging whether an answer is
any good is spec 3's problem and needs a model.

Nothing here changes what a teacher can see. No new field on any student document, no
addition to `TEACHER_CAN_SEE`.

## Decision: `kind` is taken over, and the old values go

`assets/data/unit-tests/unit-*-mcq.json` already carries a `kind` field, valued `vocab`
or `code`. Nothing in `assets/js/` reads it. The decision taken at sign-off is that
`kind` becomes the question-type discriminator and those values are stripped, rather than
introducing a second near-synonym next to it.

This is worth being explicit about because it is a data migration, small as it is: after
this change `kind: 'code'` in a pool file would silently mean "a question type that does
not exist" rather than "a question about code". The migration script rewrites every pool
file, and a test asserts no pool carries a `kind` outside the known set, so a stale value
cannot survive quietly.

## The `kind` discriminator

### On a check case (`assets/data/checks/**.json`)

`checker.js` today asks three structural questions in order: does the case have a
property key (`nonempty`, `min_lines`, `max_lines`, `stdout_matches`, `source_matches`),
then does it have `call`, then fall through to `expect_stdout`. That inference stays,
exactly as it is, as the fallback for every case that does not set `kind`. Nothing
existing breaks and no existing file has to be rewritten.

Where `kind` is present it wins:

```
kind: 'stdout' | 'value' | 'property'
```

`kindOf(testCase)` is the one function that answers the question, and `isExpressionCase`
and `isPropertyCase` keep their signatures and start delegating to it, so their existing
callers and their existing tests are untouched.

Why bother, given the inference works today: a case that sets both `call` and
`expect_stdout` is currently graded as a value case and the author is never told their
`expect_stdout` was ignored. With `kind`, `scripts/validate-checks.js` can say so.

### On an authored question (`checks/**.json` `questions`, and the unit-test pools)

```
kind: 'mcq' | 'multi' | 'match' | 'order' | 'blank'
```

Absent means `mcq`, which is what every question in the repo is today. That default is
what makes this a pure addition rather than a rewrite of 20 pool files and 15 check
files.

## The four new types

All four are pure functions on `window.PyPathQuestions`, in a new
`assets/js/question-types.js`. Scoring is separated from rendering the way
`classroom-core.js` is separated from `classroom-dashboard.js`, and for the same reason:
a scoring rule you cannot argue with in a test is a scoring rule nobody can argue with.

Each scorer takes the question and the learner's answer and returns
`{ correct, total, right }` rather than a bare boolean, because partial credit is
already how the FRQ is scored (`scoreAttempt` marks by proportion of cases passed) and a
matching question with four pairs and one slip should not read the same as one with
nothing right.

### Multi-select

```json
{ "kind": "multi", "id": "u2-ms1", "prompt": "...",
  "choices": ["...", "...", "...", "..."], "answers": [0, 2] }
```

`scoreMulti(question, chosen)`. Every choice is a judgement: a correct box ticked and a
wrong box left alone both count, so `total` is the number of choices, not the number of
correct ones. Ticking everything therefore scores badly rather than perfectly, which is
the whole reason multi-select is not just four MCQs.

`answers`, plural, deliberately not `answer`: an author who writes `answer: 2` on a
multi-select gets a validation error rather than a question that silently accepts one box.

### Matching

```json
{ "kind": "match", "id": "u4-mt1", "prompt": "...",
  "left": ["list", "tuple", "dict"],
  "right": ["ordered, changeable", "ordered, fixed", "keyed"],
  "answer": [0, 1, 2] }
```

`answer[i]` is the index in `right` that pairs with `left[i]`. `scoreMatch` marks one
point per left item. Rendered as one `<select>` per left item rather than as drag and
drop: a select works with a keyboard, works on a phone, works with a screen reader, and
needs no pointer events. Drag and drop looks better in a screenshot and excludes people.

### Ordering (Parsons)

```json
{ "kind": "order", "id": "u3-or1", "prompt": "...",
  "items": ["def greet(name):", "    return 'Hi ' + name", "print(greet('Ada'))"],
  "answer": [0, 1, 2] }
```

`answer` is the correct order as indices into `items`. Presented shuffled, with the
shuffle seeded from the injected `rand` the same way `pickQuestions` takes one, so a test
can pin the order.

`scoreOrder` marks by **adjacent pairs in the right relative order**, not by absolute
position. Absolute position is brutally unfair: one item dropped in at the top shifts
every other index and scores zero for a learner who had the whole structure right. Pairs
measure what a Parsons problem is actually asking, which is whether they know what
follows what.

Leading whitespace in `items` is significant and is preserved, because in Python the
indentation is the answer.

### Fill-in-the-blank

```json
{ "kind": "blank", "id": "u1-fb1",
  "prompt": "for i in ___(5):\n    print(i)",
  "blanks": [{ "accept": ["range"] }] }
```

`scoreBlank` marks one point per blank. Comparison is trimmed and, by default, case
insensitive, with `"caseSensitive": true` available per blank for the cases where Python
actually cares (`True` is not `true`). `accept` is a list, because `len(x)` and `len( x )`
are the same answer and marking one of them wrong teaches nothing about Python.

Deliberately not a regex. An author who needs a regex is authoring a property case in a
code exercise, which already exists and already runs real Python.

## The reflection floor

`watchReflections()` in `lesson-progress.js` currently marks an item done on
`input.value.trim()` being non-empty. That is the sharpest version of "type anything and
pass" in the codebase, sharper than anything in the FRQ path.

New pure module `assets/js/reflection-check.js`, `window.PyPathReflection`:

```
assess(text, options) -> { ok: boolean, reason: string }
```

Rules, in order, all of them structural and none of them a judgement of quality:

1. **Fewer than `MIN_WORDS` words** (8, and named). "It runs faster" is a real answer to
   some prompts and is three words, so this number is a floor on effort, not on insight,
   and it is set low on purpose.
2. **The prompt typed back**, normalized and compared. Copying the question is the most
   common way to defeat a length check.
3. **Degenerate text**: one character repeated, a single word repeated, or no vowel in
   any word longer than three letters. This is what catches `asdfasdfasdf` and
   `aaaaaaaaaa` without catching anybody writing English.

`reason` is always a sentence the learner can act on, never a verdict on them: "This
needs a bit more, try a sentence or two saying why." A floor that refuses without saying
what it wants is a wall.

**It gates the tick, never the page.** A reflection that does not clear the floor leaves
the item unmarked, with the reason shown beside the box. The learner edits and saves
again, as many times as they like. Nothing is locked, nothing is recorded as a failure,
and no event is emitted about it, because "wrote something short" is not a fact a teacher
needs pushed at them.

**It fails toward accepting.** Any error inside `assess` resolves to `ok: true`. The
existing behaviour is "accept everything", so a bug in this file must degrade to that
rather than to a learner unable to complete a lesson.

## Files

| File | Change |
|---|---|
| `assets/js/question-types.js` | new, `window.PyPathQuestions`, four scorers plus `kindOf` |
| `assets/js/question-render.js` | new, the four renderers, DOM only |
| `assets/js/reflection-check.js` | new, `window.PyPathReflection`, the substance floor |
| `assets/js/lesson-quiz.js` | dispatch on `kind`; mcq unchanged |
| `assets/js/lesson-progress.js` | `watchReflections` consults the floor |
| `assets/js/checker.js` | `kindOf` for cases, inference kept as the fallback |
| `assets/js/unit-test-page.js` | render and score the new kinds in a paper |
| `assets/js/unit-test.js` | `scoreAttempt` takes the new kinds' points |
| `assets/css/checks.css` | styles for the four new types |
| `assets/data/unit-tests/*-mcq.json` | `kind: 'mcq'`; the old `vocab`/`code` values dropped |
| `scripts/validate-checks.js` | validate `kind` and each type's required keys |
| `scripts/bake_layout.py` | inject the three new globals |
| `tests/question-types.test.js` | new |
| `tests/reflection-check.test.js` | new |
| `tests/checker.test.js`, `tests/lesson-quiz.test.js`, `tests/unit-test.test.js` | extended |

## Testing

**Unit.** Every scorer against: fully right, fully wrong, partly right, nothing answered,
and malformed input. Specifically: multi-select scoring a full tick-everything as bad;
ordering scoring an off-by-one insertion as nearly right rather than as zero; blanks
accepting each alternative and respecting `caseSensitive`; matching marking per row.
`kindOf` returning the explicit kind where set and the inferred one where not, with the
existing `isExpressionCase` and `isPropertyCase` tests unchanged as the regression guard.
The reflection floor against a one-character answer, keyboard mash, the prompt typed
back, a short genuine answer, and a normal paragraph.

**Data.** A test walks every pool and check file and asserts each question's `kind` is
known and carries the keys that kind requires. This is what stops a stale `kind: 'code'`
surviving the migration.

**Browser.** Each new type rendered, answered with the keyboard alone, and scored;
a reflection refused with the reason visible, then edited and accepted.

## Out of scope

Any grading that needs a model: the quality of a reflection, whether a property case's
output means anything, and the second opinion on FRQ code. All three are spec 3. Drag and
drop. Question types with no single right answer. Any change to the FRQ or code-check
execution path.
