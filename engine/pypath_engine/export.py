"""Freeze the trained model into assets/data/model/mastery-v1.json for the browser.

The artifact holds everything recommend.js needs and nothing about any student:
coefficients, the scoring and policy constants, the practice item catalogue
(ids, skills, kind, curriculum order), skill names and prerequisites, the
skills.json hash it was trained against, and a summary of the evaluation.
"""
from __future__ import annotations

import json
from pathlib import Path

from . import MODEL_VERSION, model_core, paths, policy
from .taxonomy import load


def _lesson_titles() -> dict:
    out = {}
    for manifest in ("curriculum.json", "curriculum-data.json"):
        for lesson in json.loads((paths.REPO / "assets" / "data" / manifest).read_text())["lessons"]:
            out[lesson["path"]] = lesson["title"]
    return dict(sorted(out.items()))


def run(model_path: Path, reports: Path, out: Path) -> dict:
    tax = load()
    info = json.loads(model_path.read_text())
    if info["skills_hash"] != tax.hash:
        raise ValueError("the model was trained against a different skills.json; retrain before exporting")
    metrics = json.loads((reports / "metrics-main.json").read_text()) if (reports / "metrics-main.json").exists() else None
    sim_meta = json.loads((reports / "sim-meta-main.json").read_text()) if (reports / "sim-meta-main.json").exists() else {}

    coef = info["coefficients"]
    r = lambda x: round(x, 10)
    # Items the model never saw keep a difficulty of 0 (the skill mean), so only
    # non-zero effects are shipped.
    catalogue = {k: {"kind": it.kind, "skills": list(it.skills), "course": it.course, "unit": it.unit,
                     "order": it.order, "lesson": it.lesson_path}
                 for k, it in sorted(tax.items.items())}
    art = {
        "model_version": MODEL_VERSION,
        "trained_at": info["trained_at"],
        "training_data": "SIMULATED" if sim_meta.get("synthetic") else "real export",
        "skills_hash": tax.hash,
        "not_a_grade": "Predictions from self-reported practice events. Evidence for a conversation; never a grade or a ranking.",
        "config": model_core.CONFIG,
        "policy": policy.DEFAULTS,
        "global_features": model_core.GLOBAL_FEATURES,
        "model": {
            "intercept": r(coef["intercept"]),
            "global": {k: r(v) for k, v in coef["global"].items()},
            "skills": {k: [r(x) for x in v] for k, v in coef["skills"].items()},
            "items": {k: r(v) for k, v in coef["items"].items() if abs(v) > 1e-12},
        },
        "skills": {s: {"name": tax.skills[s]["name"], "course": tax.skills[s]["course"],
                       "prerequisites": list(tax.prerequisites[s])} for s in tax.topo_order},
        "skill_order": tax.topo_order,
        "lesson_skills": {p: list(v) for p, v in sorted(tax.lesson_skills.items())},
        "lesson_titles": _lesson_titles(),
        "items": catalogue,
        "metrics": None if metrics is None else {
            "rows": metrics["rows"], "students": metrics["students"], "split": metrics["cv"]["method"],
            "auc": metrics["cv"]["metrics"]["full"]["auc"], "logloss": metrics["cv"]["metrics"]["full"]["logloss"],
            "brier": metrics["cv"]["metrics"]["full"]["brier"], "ece": metrics["cv"]["metrics"]["full"]["ece"],
            "auc_item_only": metrics["cv"]["metrics"]["item"]["auc"],
            "mastery_recovery_pearson": (metrics.get("recovery") or {}).get("model_all", {}).get("pearson"),
        },
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(art, separators=(",", ":")) + "\n")
    return art
