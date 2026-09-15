# pypath-engine

The offline half of PyPath's adaptive practice: a skill-mastery model trained in
Python with scikit-learn, and the recommendation policy that turns its
predictions into "practice next". The browser half is `assets/js/recommend.js`,
which scores a frozen export of the model without scikit-learn and is held to
this package by shared parity fixtures.

Nothing here produces a grade. Read [MODEL_CARD.md](MODEL_CARD.md) before using
any output.

## Reproduce everything, from a clean checkout

```bash
cd engine
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pypath_engine all        # about 8 minutes on a laptop
.venv/bin/python -m pytest -q
cd .. && npx vitest run tests/recommend-parity.test.js tests/skills-taxonomy.test.js
```

`all` runs, in order, from nothing:

| Step | Writes |
|---|---|
| `simulate` (400 students, logistic generator) | `engine/data/sim/main/` (git-ignored) |
| `ingest` | `engine/data/ingest/main/`: clean events and `attempts.csv` |
| `simulate` and `ingest` again (BKT generator, the robustness check) | `engine/data/sim/bkt/`, `engine/data/ingest/bkt/` |
| `evaluate` (both cohorts) | `engine/reports/metrics-main.json`, `metrics-bkt.json` |
| `train` | `engine/data/model/model.json` (checks model_core against scikit-learn to 1e-9) |
| `export` | `assets/data/model/mastery-v1.json`: the artifact the site loads |
| `fixtures` | `tests/fixtures/adaptive/*.json`: shared Python/JS parity cases |
| `report` | `engine/REPORT.md` and its figures in `engine/reports/` |

Everything is seeded, so two runs give the same data, the same model and the same
report, apart from the generation timestamp.

## Commands

```
python -m pypath_engine simulate  [--students N] [--seed S] [--generator logistic|bkt] [--out DIR]
python -m pypath_engine ingest    --events EXPORT.jsonl|.json|.csv [--salt SALT] [--out DIR]
python -m pypath_engine train     [--ingest DIR]
python -m pypath_engine evaluate  [--ingest DIR] [--sim DIR] [--specs base,item,...] [--label L]
python -m pypath_engine recommend --history ONE_STUDENTS_EVENTS.json [--now MS] [--course foundations,data]
python -m pypath_engine export
python -m pypath_engine fixtures
python -m pypath_engine report
```

A real export has real uids in it. `ingest` refuses to write anything from one
without `--salt`, and hashes every student and class id first. Do not commit
ingested real data; `engine/data/` is git-ignored for that reason.

## Layout

| Module | Job |
|---|---|
| `taxonomy.py` | Reads `assets/data/skills.json` and the curriculum into items and skills |
| `model_core.py` | **The reference implementation the browser mirrors**: event order, events to attempts, features, score, mastery |
| `simulate.py` | Generative students with ground truth, emitting the site's exact events with production's damage |
| `ingest.py` | Export to clean events and a tidy attempt table, handling the log's quirks |
| `features.py`, `models.py` | Design matrices; base, item, AFM, PFA, full logistic, gradient boosting, calibrated |
| `evaluate.py`, `report.py` | Splits, metrics, recovery, curves; `REPORT.md` |
| `policy.py` | What to practise next, and why |
| `export.py`, `fixtures.py` | The browser artifact and the parity fixtures |

If you change `model_core.py` or `policy.py`, change `assets/js/recommend.js` the
same way and run `fixtures`. The pytest and vitest parity suites exist to fail
when you don't.
