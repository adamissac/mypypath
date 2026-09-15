# Adaptive engine: report

Branch `feat/adaptive-engine`, 16 commits on `main` at `aae1a91`. Not merged to
`main`. Checkpoint 0's audit is in [adaptive-audit.md](adaptive-audit.md).

> Every model number below comes from **simulated students**. No real PyPath
> learner's data was used. Quote none of it as a result about real students.

## What was built

| Phase | What | Where |
|---|---|---|
| 0 | Audit of the event log, storage paths and item IDs: ten corrections to the brief | `REVIEW/adaptive-audit.md` |
| 1 | 51 skills with a prerequisite DAG, tagging all 1,745 items. The validator fails on untagged items, cycles, unknown skills or a stale file, and runs in `npm test` | `scripts/skills-source.mjs`, `build-skills.mjs`, `validate-skills.mjs`, `assets/data/skills.json` |
| 2 | Standalone Python package: seeded simulator, ingest, features, baselines, CLI | `engine/` |
| 3 | AFM, PFA, full logistic, gradient boosting and calibrated variants; GroupKFold and temporal evaluation; recovery; learning curves; BKT robustness run; recommendation policy with Hypothesis property tests | `engine/pypath_engine/{models,evaluate,policy}.py`, `engine/REPORT.md` |
| 4 | Frozen browser artifact, a JS port of the scorer and policy, and parity tests in both languages | `assets/data/model/mastery-v1.json`, `assets/js/recommend.js`, `tests/fixtures/adaptive/` |
| 5 | "Practice next" on `/progress.html`; "Where the class is stuck" on `/classroom.html`; a device-only local event mirror; seed fixes | `practice-next.js`, `class-skill-gaps.js`, `events.js`, `scripts/seed-classroom.mjs` |
| Docs | Model card; `pypath-ml` skill; CLAUDE.md section | `engine/MODEL_CARD.md`, `.claude/skills/pypath-ml/` |

**Skills installed:** `xlsx` (from `anthropics/skills`, to match the teacher
export's workbook shape; three of its XSD files had a byte-order mark stripped
to satisfy the repo's encoding test). `webapp-testing`, `frontend-design` and
`skill-creator` were already present and identical to upstream. No other skills
or plugins were installed.

## What was measured (simulated; `engine/REPORT.md` has every number)

400 students, 321,281 events written, 169,680 attempt rows.
GroupKFold(5) on student, with 95% intervals from 200 student-bootstrap
resamples.

| Model | AUC | Log loss | Brier |
|---|---|---|---|
| Base rate | 0.500 (fold mean) | 0.665 | 0.236 |
| Item difficulty only | 0.709 | 0.597 | 0.205 |
| AFM | 0.718 | 0.591 | 0.202 |
| PFA | 0.740 | 0.574 | 0.195 |
| **Full logistic (ships)** | **0.766** [0.762, 0.770] | 0.553 | 0.186 |
| Gradient boosting | 0.770 | 0.547 | 0.184 |

- **Ship decision:** boosting beat logistic by +0.004 AUC, under the 0.01
  threshold fixed in code before any run, so logistic ships.
- **Ceiling:** the simulator's own true probabilities score AUC 0.778 on the
  question and exercise rows; the model scores 0.760 on the same rows.
- **Temporal holdout, next ten attempts:** 0.758, against 0.653 for item
  difficulty alone.
- **Calibration:** ECE 0.015 uncalibrated, 0.002 isotonic. Shipped
  uncalibrated.
- **Mastery recovery, held-out students:** Pearson 0.858, against 0.818 for a
  plain Laplace success rate.
- **Robustness (BKT simulator):** logistic 0.880, boosting 0.897 (+0.017,
  which exceeds the threshold), oracle 0.943, recovery 0.72.
- **Parity:** Python and JS agree within 1e-6 on 8 fixtures, with identical
  ranked lists and reasons. On the real page with a frozen clock, the panel
  showed exactly what Python ranked.
- **Reproducibility:** `python -m pypath_engine all` in a fresh clone produced
  byte-identical metrics for both simulators and identical fixtures; the
  artifact differs only in `trained_at`. This check found a seed bug, now fixed.
- **Tests:** `npm test` 2,634 passed; engine pytest 38 passed;
  `validate:checks` and `validate:skills` pass; `test:a11y` (0 violations),
  `mobile`, `keyboard`, `motion` and `perf` pass; axe on both populated
  panels, light and dark, 0 violations.

## Screenshots (`REVIEW/screenshots/`)

| File | Shows |
|---|---|
| `adaptive-practice-next-guest-cold-start.png` | New learner, three curriculum-order items |
| `adaptive-practice-next-with-history.png` | Parity fixture history injected, clock frozen; matches Python |
| `adaptive-practice-next-after-answering.png` | After answering a real quiz question wrong, then right |
| `adaptive-practice-next-mobile.png`, `adaptive-practice-next-dark.png` | 390px width, and dark theme |
| `adaptive-classroom-skill-gaps.png`, `-mobile.png`, `adaptive-classroom-gaps-in-context.png` | Teacher view on the seeded class, next to Needs attention |

## What I got wrong along the way, and fixed

- **The simulator emitted `lesson.opened` on Data pages.** The real site never
  does, so the model could lean on a signal real Data students can't produce.
- **Cold start ignored curriculum order.** A cross-course prerequisite made
  numpy a root skill, so a new Data student was offered unit 3.
- **Review could never fire.** Mastery was judged "now", so time away both
  lowered the estimate and blocked review. Fixed by judging mastery at last
  practice.
- **Cold start showed only two items**, below the brief's three.
- **The seed added three "on track" students to the attention list** through
  my own extra attempts.
- **Committed metrics came from a mismatched seed.** Caught by the clean-clone
  check.
- **Several tests were weaker than they looked,** including one that asserted
  nothing when a fixture was missing and one that silently skipped. All were
  rewritten to fail properly.

## What I could not verify

- **Anything about real learners.** There is no real event export, and
  production data was not touched.
- **Signed-in students' synced history in the panel.** It was verified for
  guests and with an injected local mirror. A signed-in student on a new device
  gets synced check results but not the mirror, and that path wasn't separately
  screenshotted.
- **The skill-creator benchmark runs** (with and without the skill) for
  `pypath-ml`. The eval prompts exist; the runs were not executed.
- **The keyword-tagged unit test items:** a spot-check of 24, 20 judged right.
  The other 663 keyword tags were not reviewed.
- **The Firebase SDK once failed to load from gstatic** in one Playwright
  context, a network flake. A rerun was clean.

## Where the modelling is weakest

1. **The simulator is doing much of the work.** It generates data from the
   same ideas the features encode: mastery that rises with practice,
   prerequisites that slow learning, errors that depend on mastery. The heaviest
   history weight (`prereq_min`, +1.72) partly measures the simulator's own
   assumption. The results prove the pipeline works and can recover a signal
   of this shape, not that real learning has this shape.
2. **Under a different generative story the linear model underfits.** On BKT,
   boosting beats it by more than the shipping threshold, and it sits 0.065
   AUC below the oracle.
3. **It is close to counting.** On the main simulator a Laplace success rate
   gets 0.818 recovery against the model's 0.858.
4. **The data can't support much more.** Unit tests are logged only as totals,
   with no course, so the 640 unit test MCQs never become training rows. Order
   within a flush is reconstructed. Quiz attempt counters reset on reload.
   Events are self-reported and forgeable.
5. **Several key parameters are simulator-tuned:** the 0.85 mastery threshold,
   the 0.6–0.8 band, and the spacing schedule.
6. **Raw learning curves don't show learning** (16 of 51 skills) because of
   curriculum order. The difficulty-adjusted curve rises for 32 of 51, and it
   hasn't been checked on real data.

## Also found, not changed

- `lesson-progress.js:1155` records `answer.submitted` with fields the schema
  lacks, so that event is silently never written.
- `test.submitted` carries no course, and Python for Data never records
  `lesson.opened`. Both are handled in ingest and documented, not fixed,
  because fixing them means changing the event schema or the site's unit
  detection, which the brief ruled out.
