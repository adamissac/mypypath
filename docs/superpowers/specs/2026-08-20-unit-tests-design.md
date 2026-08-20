# End-of-unit tests: data contract and design

Every unit ends with a test: 10 multiple choice questions drawn at random from a
pool of 50, plus one free response question drawn at random from a pool of 5.
Each MCQ is worth 7 points and the FRQ is worth 30, so a perfect paper is 100.
A learner needs 70 to move on to the next unit.

This file is the contract. Content, engine, and dashboard are built against it
independently, so nothing here changes without updating everything that reads it.

## Files

| Path | Owner | Purpose |
|------|-------|---------|
| `assets/data/unit-tests/unit-N-mcq.json` | content | 50 multiple choice questions |
| `assets/data/unit-tests/unit-N-frq.json` | content | 5 free response questions |
| `assets/js/unit-test.js` | engine | pure scoring and selection rules |
| `assets/js/unit-test-page.js` | engine | the page: render, run, grade, store |
| `unit-test.html` | engine | one page for all ten units, `?unit=N` |
| `assets/css/unit-test.css` | engine | styles |

`N` is 1 through 10.

## MCQ shape

```json
{
  "id": "u1-m07",
  "kind": "code",
  "prompt": "What does this program print?",
  "code": "x = 5\nprint(x + 2)",
  "choices": ["5", "7", "52", "It raises an error"],
  "answer": 1,
  "explain": "print evaluates x + 2 first, so it prints 7."
}
```

- `id` is `u<unit>-m<two digits>`, unique within the file.
- `kind` is `"code"` or `"vocab"`. Every question is one or the other: it either
  shows a snippet, or it asks what a term means.
- `code` is omitted entirely on vocab questions. Never an empty string.
- Exactly four `choices`. `answer` is the 0 based index of the right one.
- The three wrong answers are plausible. A learner who half understands the
  topic should be tempted; no filler like "none of the above".
- `explain` is one or two sentences, shown after the paper is graded.
- **No em dashes anywhere in any field.** Use a comma, a colon, or a full stop.
- Plain ASCII quotes in prose. Code fields carry real Python, newline separated.

## FRQ shape

```json
{
  "id": "u1-f2",
  "title": "Greet by name",
  "prompt": "Write a function named greet that takes one argument, a name, and returns the string \"Hello, \" followed by the name and an exclamation mark.",
  "starter": "def greet(name):\n    # your code here\n    pass\n",
  "entry": "greet",
  "cases": [
    { "args": ["Ada"], "expect": "Hello, Ada!" },
    { "args": ["Bo"], "expect": "Hello, Bo!" },
    { "args": [""], "expect": "Hello, !", "hidden": true }
  ]
}
```

- `id` is `u<unit>-f<digit>`, unique within the file.
- `entry` is the exact function name the learner must define. Grading calls that
  function; it never inspects stdout, so a stray `print` cannot break a passing
  answer and cannot fake one either.
- `args` is a JSON array of arguments, applied positionally.
- `expect` is the exact expected return value, compared with `==` in Python so
  `1` and `1.0` compare equal and a list compares by value.
- At least 5 cases, at least 2 of them `"hidden": true`. Visible cases are shown
  in the question as worked examples; hidden ones are only revealed in the
  result breakdown, so the answer cannot be special cased against the samples.
- `starter` must compile. A `def` whose body is only a comment is a syntax
  error, so the stub ends in `pass`: a learner who submits it untouched gets
  failed cases rather than a crash they cannot read.
- The task must be solvable with only what that unit and the units before it
  have taught. Unit 1 gets no loops; unit 4 may use lists.
- **No em dashes.** Same prose rules as the MCQs.

## Scoring, in `window.PyPathUnitTest`

Pure functions, no DOM and no storage, so they are unit testable the way
`roles.js` and `storage-keys.js` are.

```
MCQ_COUNT   = 10
MCQ_WEIGHT  = 7      // points per correct MCQ, 10 x 7 = 70
FRQ_WEIGHT  = 30     // points for a fully passing FRQ
PASS_MARK   = 70

pickQuestions(pool, count, rand) -> array   // no repeats, rand injected for tests
pickOne(pool, rand) -> item
scoreMcq(picked, answers) -> correctCount   // answers is an array of chosen indexes, null when skipped
scoreAttempt({ mcqCorrect, frqCasesPassed, frqCasesTotal }) -> {
  mcqPoints,          // mcqCorrect * 7
  frqPoints,          // round(30 * casesPassed / casesTotal), 0 when total is 0
  total,              // mcqPoints + frqPoints, capped at 100
  passed              // total >= 70
}
hasPassed(total) -> boolean
```

`rand` is injected everywhere randomness appears, defaulting to `Math.random`,
so selection is testable without stubbing globals.

## Storage

One localStorage key, `pypath-unit-tests`, added to the `SYNC_PATTERNS`
allowlist in `storage-keys.js` so it syncs like every other progress key.

```json
{
  "1": {
    "best": 85,
    "passed": true,
    "attempts": 2,
    "lastAt": 1755648000000,
    "last": {
      "score": 85,
      "mcqCorrect": 8,
      "frqId": "u1-f2",
      "frqCasesPassed": 3,
      "frqCasesTotal": 3,
      "at": 1755648000000
    }
  }
}
```

Keys are unit numbers as strings. `best` never decreases: a retake that scores
lower leaves `best` and `passed` alone and only updates `last` and `attempts`.

## Teacher visibility

`summary()` in `sync.js` gains two fields, which flow to both `users/{uid}` and,
for a learner in a class, `roster/{uid}`:

```
testScores: { "1": 85, "2": 70 }   // best score per unit, units with an attempt only
testsPassed: [1, 2]                 // sorted unit numbers at or above the pass mark
```

No rules change is needed. The owner update path on `roster` has no key
whitelist, and `noContactDetails()` only refuses `email` and `photoURL`. Confirm
this by reading `firestore.rules` before assuming it; do not widen the rules.

## Moving on

`rollUpUnit()` in `lesson-progress.js` marks a unit complete once every lesson in
it is passed. It gains a second condition: the unit's test must also be passed.
`isUnitUnlocked()` already gates unit N on N-1 being complete, so making the test
part of completion is what stops a learner moving on below 70.

Learners who finished units before this shipped keep those units: the rule
applies to `rollUpUnit`, which only ever adds to `pypath-completed-units`, and
nothing removes a unit already earned.

## House style

Vanilla ES5 style IIFEs, `'use strict'`, no build step, no new dependencies.
Comments explain why, not what, in plain prose. Match the surrounding file.
