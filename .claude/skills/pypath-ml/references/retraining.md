# Retraining

## Routine (simulated data, after a code or taxonomy change)

```bash
cd engine
.venv/bin/python -m pypath_engine all
.venv/bin/python -m pytest -q
cd .. && npm test && npm run validate:skills
git add assets/data/model tests/fixtures/adaptive engine/REPORT.md engine/reports
```

Read `engine/REPORT.md` before committing. Check:

- The ship decision (`SHIP_THRESHOLD_AUC`, pre-registered at 0.01) and what the
  BKT robustness run says. Don't move the threshold after seeing a result.
- The mastery-threshold table against `policy.DEFAULTS["mastered_at"]`.
- Fold sign stability of the history coefficients.
- That the banner still says simulated.

## With a real export (emulator or production)

Production data operations need the site owner's explicit approval every time.
The emulator (`npm run emulators && npm run seed`) is always fine.

1. Export events to JSON lines outside the repo, or in `engine/data/`
   (git-ignored).
2. `python -m pypath_engine ingest --events <file> --salt "$PYPATH_INGEST_SALT" --out data/ingest/real`
3. Read `data/ingest/real/ingest_report.json`: duplicates, reordered late
   flushes, capped sessions, suspected gaps, students who left mid-unit, and
   tests with an inferred course.
4. `python -m pypath_engine evaluate --ingest data/ingest/real --sim "" --label real`.
   With no simulator, the oracle, mastery recovery and threshold table are
   skipped, because no truth exists.
5. Train on real rows only when there are enough students for GroupKFold
   (hundreds, not dozens), and compare against the simulated-data model in the
   report.
6. Report every real-data number as coming from a real export, of this size,
   over this period, with self-reported events. Never commit the export or the
   ingested files.

## Versioning

- A change that alters the artifact's shape, or the meaning of a feature,
  bumps `MODEL_VERSION` in `pypath_engine/__init__.py` and the artifact
  filename.
- `recommend.js` must keep reading the currently deployed artifact, since
  static assets cache for an hour.
- The fixtures record `model_version` and `skills_hash`, and both parity suites
  check them.
