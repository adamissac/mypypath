"""Fit the model that ships: the full logistic model, on every ingested row.

C is chosen the same way evaluation chose it (a held-out 20% of students), then
the model is refitted on all students. The output is the plain coefficient dict
model_core.score reads, plus a check that model_core reproduces scikit-learn's
own predict_proba on every training row -- the first link in the chain that
ends at the JS parity test.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import model_core, models
from .features import build_rows, load_clean_events
from .taxonomy import load


def run(ingest_dir: Path, out_dir: Path, seed: int = 20260914) -> dict:
    tax = load()
    by_student = load_clean_events(ingest_dir / "clean_events.jsonl")
    rows = build_rows(by_student, tax)
    fitted = models.fit_logistic(rows, "full", len(tax.topo_order), seed)
    coefficients = models.to_artifact_coefficients(fitted, tax.topo_order)

    sk = fitted.predict(rows)
    mine = []
    for s in sorted(by_student):
        model_core.replay(by_student[s], tax,
                          lambda item, at, ai, g, per, c, pa, e: mine.append(model_core.score(coefficients, g, per, item.key)))
    gap = float(np.max(np.abs(np.array(mine) - sk)))
    if gap > 1e-9:
        raise AssertionError(f"model_core disagrees with scikit-learn by {gap}")

    info = {
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rows": len(rows), "students": len(by_student), "C": fitted.info["C"], "C_scores": fitted.info["C_scores"],
        "skills_hash": tax.hash, "max_abs_gap_model_core_vs_sklearn": gap,
        "source": str(ingest_dir), "coefficients": coefficients,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "model.json").write_text(json.dumps(info))
    return info
