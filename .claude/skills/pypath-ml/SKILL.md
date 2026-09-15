---
name: pypath-ml
description: How PyPath's adaptive practice engine works and how to change it safely — the event data contract, the skill taxonomy, the features, retraining and re-evaluating the mastery model, exporting it to the browser, and keeping the Python engine and assets/js/recommend.js in exact agreement. Use this whenever the task touches engine/, assets/data/skills.json, assets/data/model/, assets/js/recommend.js, practice-next.js, class-skill-gaps.js, the event log's use for modelling, or asks to retrain, re-tag skills, add a feature, change the recommendation policy, ingest a real events export, or report model results — even if the request just says "update the recommendations" or "why is it suggesting X".
---

# PyPath ML: the adaptive practice engine

Two halves, one contract:

- **`engine/`** (Python, offline). Simulate, ingest, train and evaluate with
  scikit-learn, then export a frozen logistic model.
- **`assets/js/recommend.js`** (browser). Scores that frozen model and runs the
  recommendation policy with no scikit-learn and no Pyodide.

They are held together by `tests/fixtures/adaptive/*.json`. If you change one
side alone, `engine/tests/test_parity.py` or `tests/recommend-parity.test.js`
fails. That is intended: a JS reimplementation that quietly drifts is how an
engine like this becomes fiction.

Read `engine/MODEL_CARD.md` first. **Nothing this produces is a grade**, the
input events are self-reported and forgeable, and minors use the site.

## The one command

```bash
cd engine && .venv/bin/python -m pypath_engine all   # ~8 min; rebuilds data, metrics, model, artifact, fixtures, REPORT.md
.venv/bin/python -m pytest -q
cd .. && npm test
```

The venv is `engine/.venv`, built from `engine/requirements-dev.txt`. Never add
scikit-learn or anything else to what the site build touches:
`scripts/requirements.txt` is deliberately dependency-free.

## Before you change anything, know which file is the source

| Thing | Source of truth | Generated from it |
|---|---|---|
| Skills, prerequisites, lesson tags, keyword rules | `scripts/skills-source.mjs` | `assets/data/skills.json` (`node scripts/build-skills.mjs`) |
| Event ordering, attempts, features, score, mastery | `engine/pypath_engine/model_core.py` | mirrored by hand in `assets/js/recommend.js` |
| What to recommend and why | `engine/pypath_engine/policy.py` (`DEFAULTS`) | mirrored in `recommend.js`; constants shipped in the artifact |
| Model coefficients | a `train` run | `engine/data/model/model.json`, then `assets/data/model/mastery-v1.json` |
| Every number in REPORT.md | `engine/reports/metrics-*.json` | `engine/REPORT.md` (`report`) |

Never hand-edit `skills.json`, the artifact, the fixtures or `REPORT.md`.

## Workflows

**Re-tag or add skills.** Edit `scripts/skills-source.mjs`, then run
`node scripts/build-skills.mjs` and `npm run validate:skills`. The validator
fails on an untagged item, a cycle, an unknown skill or a stale file. Changing
tags changes `skills.json`'s hash, and `export` refuses a model trained against
another hash, so you must retrain (`all`). Keep 30–60 skills.

**Add or change a feature.** Read `references/features.md`. Change
`model_core.py` (keep it pure Python floats), add the name to
`GLOBAL_FEATURES`, mirror it in `recommend.js` operation for operation, then run
`all`, pytest and vitest. If it can't be computed from the ten event types or
local storage, it doesn't belong. Never add a feature that needs student code,
and never widen the event schema.

**Change the policy.** Edit `policy.py`, mirror `recommend.js`, then run
`python -m pypath_engine export && python -m pypath_engine fixtures`. The
Hypothesis property tests in `engine/tests/test_policy.py` must still hold:
never empty, caps, no prerequisite violations, deterministic, spacing,
curriculum reach.

**Train on a real export.** Read `references/data-contract.md` and
`references/retraining.md`. It needs a salt, stays in `engine/data/`, and must
never be committed. Replace the simulated-data banner only when the source is
genuinely real.

**Report results.** Only numbers from `engine/reports/metrics-*.json`, always
with the data source stated. Simulated results are labelled simulated,
everywhere, including in anything written for a CV or a README.

## Traps that already cost a run

- **Parity in JS:** Python `dict` order becomes a JS `Map`, `int()` becomes
  `Math.trunc`, and `**2` must be written `x * x` on both sides. Python's
  `round` and JS `Math.round` differ on halves, so reasons use counts, not
  rounded numbers.
- **Mastery** is judged at a skill's *last practice*, not now. Otherwise time
  away re-locks everything built on it and the review schedule can never fire.
- **Raw learning curves mislead.** Quiz questions precede exercises in every
  lesson, so read the difficulty-adjusted curve.
- **The simulator must reproduce the real log's gaps,** such as the Data
  course's missing `lesson.opened`. Otherwise the model learns a signal real
  students can't produce.
- **The teacher view reads summaries.** Never make it replay 500 events per
  student (CLAUDE.md: the dashboard's read budget).
- **Deploy caching:** the site caches JS and CSS for an hour. When the artifact
  changes, `recommend.js` must still accept it, so version any breaking change
  through `model_version`.
