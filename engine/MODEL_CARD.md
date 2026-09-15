# Model card: PyPath `mastery-v1`

## At a glance

| | |
|---|---|
| What it is | A logistic regression that predicts whether a learner will answer a practice item correctly, from their own earlier practice, and a policy that turns those predictions into "practice next" suggestions |
| Where it runs | Trained offline in Python (`engine/`). Scored in the learner's own browser by `assets/js/recommend.js` from `assets/data/model/mastery-v1.json` |
| Trained | 2026-09-15, on **simulated data only** |
| Output | A ranked list of 3 to 5 practice items, each with a one-sentence reason built from counts and skill names |
| Never | A grade, a score shown to anyone, or a ranking of students |

## The honesty note (from `assets/js/events.js`, and it governs everything here)

> These events are written by the student's own browser under their own
> credentials. A student who opens devtools can fabricate any of them. There are
> no Cloud Functions in this project, so there is nowhere else the write could
> come from. This is fine for a free practice site, and it is why nothing built on
> this data may be called a grade or presented to a teacher as tamper-proof. It is
> evidence for starting a conversation, not for ending one.

The model inherits all of this. Its inputs are self-reported, so its outputs are
only as trustworthy as a learner's own browser, and a learner can make it say
anything about themselves.

## Intended use

- Suggesting to **a learner, about themselves**, which lesson quiz questions and
  graded exercises to try next, and why.
- Doing so on a free practice site, where a bad suggestion costs a few minutes.

The teacher view on `/classroom.html` ("Where the class is stuck") does **not**
use this model. It counts logged attempts and passes per skill, because the
dashboard deliberately reads one summary per student rather than each student's
full event history.

## Must never be used for

- Grades, marks, report cards, or anything recorded as an assessment result.
- Ranking, sorting, comparing or labelling students ("weak", "at risk", "behind").
- Placement, streaming, admission, discipline, or any decision about a student
  made without talking to them.
- Judging teachers, classes or schools.
- Anything described to a student, parent or teacher as a measurement of what a
  student knows. It is a prediction about their next practice item, made from
  data they control.

## Model

- **Form.** For an attempt on item *i* tagged with skills *K*:
  `logit p = b0 + Σ w_g·f_g + (1/|K|) Σ_k (β_k + γ_k·log1p(successes_k) + ρ_k·log1p(failures_k)) + d_i`.
  That is a Performance Factors Analysis model with log counts, plus 20 history
  features: attempt index, retry flag, time-decayed outcomes, days since last
  practice, hidden-case pass rate, exception-class counts, exposure, prerequisite
  estimates, unit-test duration buckets and item kind. `d_i` is a learned item
  difficulty, L2-shrunk towards zero.
- **Why this form.** It can be read, it can be explained to a teacher, and it
  runs in a browser as a weighted sum. Gradient boosting was evaluated as a
  ceiling and did not clear the pre-registered margin on the main simulator; it
  did on the second one (see Limitations).
- **Mastery,** as the policy uses the word, means the model's p(correct) on a
  typical first-attempt question on a skill. A skill counts as "mastered" when
  that estimate was at least 0.85 at its last practice, with two or more
  successes.
- **Features never include student code.** `code.error` contributes an
  exception class name only, as the event log already restricts it to. No
  feature needs anything outside the ten event types the site already logs.

## Training data

**Simulated.** 400 generated students (`python -m pypath_engine all`, seed
20260914). They have per-skill ground-truth mastery, learning rates, slip and
guess, forgetting, prerequisites and dropout. They work through the real
PyPath curriculum and item pools, emitting the site's exact events with
production's damage: shared flush timestamps, the 500-event cap, lost batches,
late flushes, duplicates, and Python for Data's missing `lesson.opened`.
169,680 attempt rows.

No real student data was used, because production event volume is too thin to
train on. **Every number below describes simulated students.**

## Evaluation (simulated; full detail in [REPORT.md](REPORT.md))

| | Value |
|---|---|
| Split | GroupKFold(5) on student, plus a per-student temporal holdout |
| AUC, cross-validated | 0.766 (95% CI 0.762 to 0.770); item difficulty alone 0.709; simulator's own true probabilities 0.778 |
| Log loss / Brier / ECE | 0.553 / 0.186 / 0.015 |
| Next ten attempts, temporal holdout | AUC 0.758 (item difficulty alone 0.653) |
| Mastery recovery, held-out students | Pearson 0.858 against true mastery (a plain success rate: 0.818) |
| Robustness: BKT simulator | AUC 0.880, where gradient boosting reached 0.897 and the oracle 0.943 |

Python and the browser agree on shared fixtures within 1e-6, with identical
ranked lists and reasons.

## Limitations

- **Unvalidated on real learners.** The simulator encodes the same assumptions
  the features do, so the results show the pipeline works and can recover a
  signal of that shape, not that real learning has that shape.
- **Underfits step-like learning.** Under a knowledge-tracing simulator, gradient
  boosting beats this model by more than the shipping threshold.
- **Close to counting.** On the main simulator a Laplace success rate recovers
  mastery almost as well.
- **The mastery threshold (0.85) was tuned on simulated data.**
- **The log is thin in known ways.** End-of-unit tests arrive only as totals,
  with no course. Order within a 10-second flush is reconstructed. The quiz
  attempt counter resets on reload.
- **Features the simulator never produces have zero weight:** teacher-assigned
  quizzes, and uncategorised error classes.
- **The browser only knows its own device:** the local event mirror and synced
  check results. A learner on a new device starts nearly cold.
- **Skill tags are partly automatic.** 687 end-of-unit items are keyword-tagged
  (spot-checked at 20 of 24).

## Privacy

- The artifact contains coefficients, the item catalogue and skill metadata.
  No per-student data.
- The local event mirror (`pypath-local-events`) stays on the device. It is not
  in the sync allowlist, and it holds the same sanitised payloads as the log.
- `ingest` refuses a real export without a salt, and hashes student and class
  IDs before writing. Ingested data lives in the git-ignored `engine/data/`.
- The parity fixtures and the committed report derive only from simulated
  students.

## Maintenance

Retraining, re-tagging and replacing the simulated data with a real export are
documented in `.claude/skills/pypath-ml/`. Any change to `model_core.py` or
`policy.py` must be mirrored in `recommend.js`, or the parity suites fail.
