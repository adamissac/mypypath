# Introductory lesson depth and interactive practice

Unit 1 now has an additional authored explanation and transfer challenge in all
8 Foundations lessons and all 6 Python for Data lessons. Each extension contains
an executable example, hidden output with a line-by-line explanation, a specific
common mistake, and a worked solution learners can reveal after attempting it.

Each lesson also adds three checked activities: matching, ordering, and output
prediction (42 new questions total). Existing coding exercises remain available.
The lesson question limit is now eight to accommodate the additional practice.

Matching supports desktop dragging, tap-to-select then place, and labelled native
selects. Ordering supports dragging and the existing keyboard-accessible move
buttons. Changes announce their result, retain ordering focus, and clear stale
lesson feedback. The controls inherit both course palettes and colour modes.

## Authoring

Edit `scripts/intro-lesson-enrichment.json` for the shared introductory extensions.
Run `node scripts/build-intro-lessons.cjs` to update the marked Foundations blocks
and questions. Python for Data consumes the same source through its normal
`npm run build:data-course` pipeline. Run `npm run build:skills` after adding quiz
items to refresh the learning-skill inventory. The shipped recommender is pinned
to that inventory: refresh it with the engine's `train`, `export`, and `fixtures`
commands after changing skill tags or adding questions. Use the existing ingested
training dataset; the new items receive the model's default difficulty until
there is training evidence for them. Page generators are idempotent.

## Verification

- `tests/intro-activities.test.js`: all 14 examples execute in real Python with
  exact expected output; worked solutions execute; all generated answer keys
  score correctly; matching and ordering interaction state is covered.
- `tests/browser/intro_activities.mjs`: real mouse dragging, mobile taps, keyboard
  ordering, stale-feedback reset, overflow and axe checks in both courses and
  both colour modes (eight combinations).
- Existing full Vitest suite and five browser audits remain required.
