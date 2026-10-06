# Lesson schema, annotated

A complete lesson, every field in use. Real lessons to compare against:
`scripts/data-course-unit-1.cjs` (standard library, stdout and value
exercises, a file fixture) and `scripts/data-course-unit-3.cjs` (numpy, and
the file whose header comment documents the schema).

```js
const CALLS = (calls, describe) => ({
  name: 'the summary is computed, not typed', kind: 'ast', requires: { calls }, describe,
});
// Builds a DataFrame inside a check expression without an import in the call.
const pdf = (literal) => `__import__("pandas").DataFrame(${literal})`;

module.exports = {
  unit11: {
    title: 'Unit title',                       // also the sidebar label
    blurb: 'One line for the course page.',    // no "--"; use "—" or a comma
    packages: ['pandas'],                      // omit for standard-library units
    lessons: [
      {
        slug: 'kebab-case-slug',               // becomes /data/unit-11/<slug>.html
        title: 'Title Case Lesson Name',
        summary: 'One sentence, shown in the Overview card.',

        objectives: [                          // 3–5; "you will be able to…"
          'Do a specific, checkable thing with <code>inline code</code>.',
        ],

        why: 'Why this matters before how it works: what goes wrong without it, and where it comes back later.',

        sections: [                            // rendered "Step 1: …", "Step 2: …"
          {
            heading: 'Short section heading',
            intro: 'One or two sentences framing the section.',
            steps: [                           // numbered sub-steps
              {
                heading: 'Sub-step heading',
                prose: 'The idea, with <code>markup</code> allowed.',
                code: 'import pandas as pd\n\nprint(...)',   // must run as-is
                note: 'Optional small print under the example.',
              },
            ],
            note: 'Optional section-level key idea, rendered as a callout.',
          },
        ],

        practices: [                           // ungraded; at least 2
          {
            after: 0,                          // index of the section it follows
            title: 'Short title',
            prompt: 'What to try, and what to notice.',
            starter: '# must run without an uncaught error when Run is pressed\n',
          },
        ],

        use: {                                 // the "When to Use It" step
          cards: [
            { title: 'A situation', text: 'Why the technique fits it.', code: 'one_short_line()' },
            { title: 'Another situation', text: 'Why it fits.' },
          ],
          avoid: 'Do not … — name the specific mistake and its consequence.',
        },

        exercises: [                           // graded; at least 2
          {
            title: 'Short title',
            prompt: 'Write <code>fn(df)</code> that returns …, as plain Python types.',
            starter: 'import pandas as pd\n\ndef fn(df):\n    return None\n\nprint(fn(...))\n',
            call: `fn(${pdf('{"a": [1, 2]}')})`,   // value style…
            expectValue: '3',                    // …compared against repr()
            // expect_stdout: 'line one\nline two',   // …or stdout style instead
            files: { 'scores.csv': 'name,score\nAda,92\n' },  // optional fixtures
            hidden: [
              { name: 'the edge case the lesson warns about', call: 'fn(...)', expect: '0' },
              { name: 'different data gives a different answer', files: { 'scores.csv': '...' }, call: 'fn("scores.csv")', expect: '...' },
              CALLS(['groupby'], 'one group-by, not a typed answer'),
              { name: 'no loop', kind: 'ast', forbids: { loops: true }, describe: 'vectorised' },
            ],
            hint: 'Concrete enough to unblock, without being the answer.',
            correct: 'def fn(df):\n    ...\n',   // must pass every case
            wrong: 'def fn(df):\n    ...\n',     // the plausible mistake; must fail at least one
          },
        ],

        questions: [
          { id: 'd11-abc-1', prompt: '…?', choices: ['…', '…', '…', '…'], answer: 1, explain: 'Why.' },
          { id: 'd11-abc-2', kind: 'multi', prompt: '…?', choices: ['…', '…', '…'], answers: [0, 2], explain: '…' },
          { id: 'd11-abc-3', kind: 'order', prompt: 'Put … in order.', items: ['b', 'a', 'c'], answer: [1, 0, 2], explain: '…' },
          { id: 'd11-abc-4', kind: 'blank', prompt: 'A ___ does …', blanks: [{ accept: ['word', 'synonym'] }], explain: '…' },
        ],
      },
    ],
  },
};
```

## AST check keys

`kind: 'ast'` cases take `requires` and/or `forbids` with these keys
(`scripts/validate-checks.js` rejects anything else): `loops`,
`conditionals`, `functions`, `calls`, `binop`, `names`, `returns`,
`imports`, `classes`, `raises`, `handlers`, `withs`, `decorators`,
`boolops`, `compares`.

- `calls` matches plain calls and method/attribute calls by name
  (`'groupby'`, `'DictReader'`, `'get'`).
- `loops: true` means any loop, comprehensions included. A list such as
  `loops: ['for', 'comprehension']` means **all** of them.
- `compares: ['GtE']` requires a `>=`; `handlers: ['ValueError']` requires
  that except clause; `forbids: { handlers: ['bare'] }` bans `except:`.
- `generated` cases (`entry`, `reference`, `args`, `runs`) compare against a
  reference implementation on random inputs. See unit 1 `summarising-numbers`.

## What the page template does with it

`scripts/build-data-course.cjs` renders, in order: sidebar, breadcrumb,
eyebrow, title, Overview card (summary, level, estimated minutes, prev and
next), "What You Will Learn" with the Why This Matters card, each section as
a step with the practices whose `after` matches, the When to Use It step,
End-of-Lesson Exercises, then the prev and next links. `lesson-quiz.js`
appends the questions after the exercises at runtime. The markup is the
same as a Foundations lesson's on purpose: the two courses share one
stylesheet, and `core.js`, `check-ui.js` and `lesson-progress.js` find
elements by those classes.

## Optional prediction checkpoint

A lesson may include `checkpoint: { title, prompt, code, output, explain, tryIt }`. The generator renders a prediction prompt, runnable code, an output/explanation disclosure, and a follow-up variation before the usage section. These fields are plain text; examples in Data Unit 1 are executed against their stated output in `tests/lesson-flow.test.js`. Keep the checkpoint focused on one misconception.
