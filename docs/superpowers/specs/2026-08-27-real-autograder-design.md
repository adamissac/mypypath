# A real autograder, with no model and no bill

Date: 2026-08-27
Status: awaiting sign-off
Supersedes: `2026-08-27-ai-grading-backend-design.md`, removed
Related: `2026-08-27-autograder-and-question-types-design.md` (spec 2, shipped)

## Why this replaces the model

The AI design was written to answer "did this student actually do the work, or
did they game the check". A model is one way to answer that. It is not the best
way, and for the code half it is clearly the worse one.

Three things are already on the page and were not being used:

- **Pyodide is loaded.** A real Python interpreter, which means the grader can
  `import ast` and read the structure of what a student wrote, and can run their
  function hundreds of times instead of three.
- **The author already knows the answer.** Every exercise has a correct
  solution. Written down once, it becomes an oracle that can mark an unbounded
  number of generated inputs, which no fixed list of hidden cases can.
- **Determinism is worth more than judgement here.** These are beginner Python
  exercises with right answers. A model guessing at intent is a downgrade from a
  reference implementation that knows.

So this is not a cheaper substitute for the AI grader. For code it is a stronger
grader, and it runs offline, for a signed-out guest, at no cost, in a repo with
no server and an empty dependency list.

Where a model genuinely would have been better is judging an open-ended
reflection, and this design does not pretend otherwise. See the last section.

## What is actually broken today

From the brief, confirmed by reading the files:

1. **Hidden test cases are a fixed, small set.** `checker.js` runs three to six
   cases per exercise. A student who hardcodes `if length == 4 and width == 3:
   return 12` for each one passes completely. The hidden cases raise the bar; a
   determined student clears it.
2. **`source_matches` is a regex over raw source.** The comment
   `# length * width` satisfies `length\s*\*\s*width`. So does a string literal.
   The check is defeated by typing the answer in a place Python never reads.
3. **Property cases check shape, never method.** `min_lines: 3` is satisfied by
   three `print` statements with the answers typed in.

Note what these have in common: none of them needs judgement to catch. Each is a
structural fact about the code, and structural facts are what a parser is for.

## The three upgrades

### 1. Generated cases against a reference: `kind: "generated"`

The one that matters most. The author writes the correct solution once; the
grader draws random inputs and compares.

```json
{
  "kind": "generated",
  "name": "works for any two sides",
  "entry": "rectangle_area",
  "reference": "def _ref(length, width):\n    return length * width\n",
  "args": [
    { "type": "int", "min": 0, "max": 200 },
    { "type": "int", "min": 0, "max": 200 }
  ],
  "runs": 40,
  "hidden": true
}
```

Both the reference and the student's function run on the same drawn inputs, in
separate namespaces, and the results are compared with the comparison rules
`checker.js` already uses.

**Why this ends hardcoding.** Forty cases drawn from a space of 40,401 cannot be
enumerated in a lesson exercise. The student has to write the rule.

**The seed varies per attempt.** Drawn from the attempt number, so a student
who runs the check twice gets two different sets. A fixed seed would be a fixed
hidden set again, discovered once and shared.

**The reference is never sent to the client.** It is in the checks JSON, which
the client already fetches, and hiding it there would be theatre. What is
withheld is the same thing `checker.js` already withholds: which drawn input
caught them out. The counts are reported, the inputs are not.

**Failure is reported as a count, and this is deliberate.** "Passed 31 of 40" on
a hidden generated case tells a student their rule is nearly right without
handing them the counterexample to special-case.

Argument types: `int`, `float`, `str`, `bool`, `list`, and `choice` from a
literal list. Enough for the whole course, and small enough that the generator is
sixty lines and fully testable.

### 2. Structural checks: `kind: "ast"`

`source_matches` replaced by something that reads code rather than text.

```json
{
  "kind": "ast",
  "name": "calculates the area rather than typing it",
  "requires": { "binop": ["Mult"], "names": ["length", "width"] },
  "forbids": { "calls": ["eval", "exec"] },
  "describe": "length multiplied by width"
}
```

Evaluated by Python's own `ast` module inside the existing harness, so:

- **Comments are invisible.** They are not in the tree. `# length * width` is
  gone before the check runs, which is the whole point.
- **String literals are distinguishable** from code, so the answer typed inside
  a string does not satisfy a requirement about a multiplication.
- **Syntax that only looks right does not pass.** A regex matching `for` matches
  the word `for` in `# for example`; an AST check for a `For` node does not.

Author-facing vocabulary, kept small on purpose: `loops` (`for`, `while`),
`conditionals`, `functions` (with optional `name` and `params`), `calls`,
`binop`, `names`, `returns`, `imports`, and `max_nesting`. Each maps to a node
type or a simple walk. Anything more exotic is a sign the exercise wants a
generated case instead.

### 3. Hardcode detection: `hardcoded` in the AST report

A structural heuristic, reported as a flag rather than a failure:

- A required function whose body never reads any of its own parameters.
- A body that is a chain of equality comparisons against literals, each
  returning a literal, and nothing else.

Both are what hardcoding looks like as a tree, and neither is a thing a correct
beginner solution does. It is reported to the teacher and phrased as what it is,
following the same rule as the rest of the dashboard: "does not use its own
parameters" is a fact about the code. It is not called cheating, because a
student who has genuinely misunderstood parameters writes exactly this.

### 4. Concept coverage for written answers

The one place a model was genuinely better, replaced by the thing the author
already knows. Spec 2's floor checks that something was written; this checks
that it is about the lesson.

```json
"reflection2": {
  "expect_any": [
    ["read", "readable", "reads like", "english", "plain"],
    ["simple", "simpler", "easy", "short", "less code", "fewer"],
    ["library", "libraries", "module", "package"]
  ],
  "min_concepts": 1,
  "hint": "Think about what you noticed writing your first program."
}
```

Groups are synonym sets, matched case-insensitively on word boundaries.
`min_concepts` is how many groups must appear, and it defaults to 1.

**What this is honestly not.** It cannot tell an insightful answer from a
keyword-stuffed one, and a thoughtful answer in unexpected words fails it. So it
does exactly two things, both weak on purpose:

- The learner sees the author's `hint`, never a refusal. The item still counts.
  Spec 2's floor is what decides whether an answer counts; this only nudges.
- Three misses in a class surface one row on the teacher's dashboard, worded as
  the word check it is.

A check this coarse must not gate anything, and it does not.

## Compatibility

Every existing case keeps working untouched. `kind` is absent from all fifteen
authored check files and all twenty pools, and absent still means the structural
inference shipped in spec 2. `source_matches` is not removed and not deprecated
in code: it is fine for what it is, and there are working exercises using it.
The new kinds are additions, and `scripts/validate-checks.js` is where an author
is told they wrote one wrong.

## Files

| File | Change |
|---|---|
| `assets/js/checker-ast.js` | new, the Python AST report and its author-facing vocabulary |
| `assets/js/checker-gen.js` | new, seeded input generation, pure and testable with no Pyodide |
| `assets/js/checker.js` | run the two new kinds; existing paths untouched |
| `assets/js/concept-check.js` | new, `window.PyPathConcepts`, coverage over synonym groups |
| `assets/js/lesson-progress.js` | show the author's hint on a miss; record `missedConcepts` |
| `assets/data/checks/**` | generated and AST cases where they replace a weak one |
| `scripts/validate-checks.js` | validate the new kinds |
| `tests/checker-gen.test.js`, `tests/checker-ast.test.js`, `tests/concept-check.test.js` | new |
| `tests/browser/autograder.py` | the cheats, attempted against the real grader |

## Testing

The unit tests are the usual shape. The one that matters is the browser suite,
which is written as an attack rather than a demonstration: for a real exercise,
submit the hardcoded solution, the comment-with-the-answer-in-it, the answer in
a string literal, and the correct solution, and assert that only the last one
passes. A grader is only as good as the cheats it stops, so the cheats are the
test.

## Out of scope

Anything needing a model or a server. Plagiarism detection between students,
which is a different problem with different ethics. Timing or complexity
analysis. Grading style.
