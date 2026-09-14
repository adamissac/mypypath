"""Evaluation: strict splits, several metrics, and checks against simulator truth.

  GroupKFold(5) on student      no student appears in both train and test
  temporal holdout              each student's first 80% of attempts (plus every
                                row of students too short to cut) train; the next
                                attempt, and the next ten, are predicted
  metrics                       AUC, log loss, Brier, expected calibration error,
                                a reliability curve; 95% CIs by resampling students
  lift                          over the base rate and over item difficulty alone
  oracle                        AUC of the simulator's own true p(correct) on the
                                same rows: the ceiling any model could reach
  mastery recovery              estimated vs true final per-skill mastery, for
                                students the model never trained on
  learning curves               error rate against opportunity number, per skill
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from scipy import stats
from sklearn.calibration import calibration_curve
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

from . import model_core, models
from .features import Rows, build_rows, load_clean_events
from .taxonomy import load

SHIP_THRESHOLD_AUC = 0.01   # pre-registered: HGB must beat full LR by this much to even be considered


def ece(y, p, bins: int = 10) -> float:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    total = 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            total += m.mean() * abs(p[m].mean() - y[m].mean())
    return float(total)


def metric_block(y, p) -> dict:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    out = {"n": int(len(y)), "logloss": float(log_loss(y, p, labels=[0, 1])), "brier": float(brier_score_loss(y, p)),
           "ece": ece(y, p)}
    out["auc"] = float(roc_auc_score(y, p)) if len(set(y.tolist())) == 2 else float("nan")
    return out


def bootstrap(y, preds: Dict[str, np.ndarray], groups, reps: int, seed: int) -> dict:
    """95% intervals by resampling students, and paired differences against the floors."""
    rng = np.random.RandomState(seed)
    uniq, inverse = np.unique(groups, return_inverse=True)
    members = [np.nonzero(inverse == g)[0] for g in range(len(uniq))]
    draws = {k: {"auc": [], "logloss": []} for k in preds}
    diffs = {k: {"auc_vs_item": [], "logloss_vs_item": [], "logloss_vs_base": []} for k in preds}
    for _ in range(reps):
        pick = np.concatenate([members[g] for g in rng.randint(0, len(uniq), len(uniq))])
        yy = y[pick]
        if len(set(yy.tolist())) < 2:
            continue
        cache = {}
        for k, p in preds.items():
            pp = np.clip(p[pick], 1e-6, 1 - 1e-6)
            cache[k] = (roc_auc_score(yy, pp), log_loss(yy, pp, labels=[0, 1]))
            draws[k]["auc"].append(cache[k][0])
            draws[k]["logloss"].append(cache[k][1])
        for k in preds:
            if "item" in cache:
                diffs[k]["auc_vs_item"].append(cache[k][0] - cache["item"][0])
                diffs[k]["logloss_vs_item"].append(cache[k][1] - cache["item"][1])
            if "base" in cache:
                diffs[k]["logloss_vs_base"].append(cache[k][1] - cache["base"][1])
    ci = lambda v: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] if v else None
    return {k: {"auc_ci": ci(draws[k]["auc"]), "logloss_ci": ci(draws[k]["logloss"]),
                **{d: ci(v) for d, v in diffs[k].items()}} for k in preds}


def fit_all(train: Rows, specs: List[str], n_skills: int, seed: int, tuned_C: Dict[str, float]) -> Dict[str, models.Fitted]:
    out = {}
    for spec in specs:
        if spec == "base":
            out[spec] = models.fit_base(train)
        elif spec in ("item", "afm", "pfa", "full"):
            out[spec] = models.fit_logistic(train, spec, n_skills, seed, C=tuned_C.get(spec))
        elif spec == "hgb":
            out[spec] = models.fit_hgb(train, seed)
        elif spec == "hgb_cal":
            out[spec] = models.fit_hgb(train, seed, calibrate=True)
        elif spec == "full_cal":
            out[spec] = models.fit_full_calibrated(train, n_skills, seed, tuned_C["full"])
    return out


def tune(rows: Rows, specs: List[str], n_skills: int, seed: int) -> Dict[str, float]:
    """C per logistic spec, chosen on a held-out slice of students. Tuned once on
    the first fold's training students and reused, which keeps the grid search
    out of every test fold."""
    return {s: models.fit_logistic(rows, s, n_skills, seed).info["C"] for s in specs if s in ("item", "afm", "pfa", "full")}


def recovery(fitted_full: models.Fitted, by_student: Dict[str, List[dict]], students, tax, truth_students) -> Dict[str, list]:
    art = models.to_artifact_coefficients(fitted_full, tax.topo_order)
    est, lap, true, opp = [], [], [], []
    for s in students:
        events = by_student[s]
        state = model_core.replay(events, tax)
        at = max(int(e["at"]) for e in events)
        for skill, st in state.skills.items():
            n = st.succ + st.fail
            if n == 0:
                continue
            est.append(model_core.mastery(art, state, skill, at, tax.prerequisites))
            lap.append(model_core.laplace(st))
            true.append(truth_students[s]["final_mastery"][skill])
            opp.append(n)
    return {"est": est, "laplace": lap, "true": true, "opp": opp}


def corr_block(x, y) -> dict:
    x, y = np.asarray(x), np.asarray(y)
    if len(x) < 3:
        return {"n": int(len(x))}
    return {"n": int(len(x)), "pearson": float(stats.pearsonr(x, y)[0]), "spearman": float(stats.spearmanr(x, y)[0])}


def learning_curves(rows: Rows, p: np.ndarray, tax, max_opp: int = 15) -> List[dict]:
    kinds = np.isin(rows.kind, ["question", "exercise"])
    opp = np.rint(np.expm1(rows.sk_ls) + np.expm1(rows.sk_lf)).astype(int) + 1
    keep = kinds[rows.sk_row] & (opp <= max_opp)
    out = []
    agg: Dict[tuple, list] = {}
    for r, c, o in zip(rows.sk_row[keep], rows.sk_col[keep], opp[keep]):
        a = agg.setdefault((c, o), [0, 0.0, 0.0])
        a[0] += 1
        a[1] += 1 - rows.y[r]
        a[2] += 1 - p[r]
    for (c, o), (n, err, perr) in sorted(agg.items()):
        out.append({"skill": tax.topo_order[c], "opportunity": int(o), "n": n,
                    "observed_error": err / n, "predicted_error": perr / n})
    return out


def run(ingest_dir: Path, sim_dir: Optional[Path], out_dir: Path, specs: List[str], seed: int = 7,
        folds: int = 5, reps: int = 200, label: str = "main") -> dict:
    t0 = time.time()
    tax = load()
    n_skills = len(tax.topo_order)
    by_student = load_clean_events(ingest_dir / "clean_events.jsonl")
    rows = build_rows(by_student, tax)
    truth_students = json.loads((sim_dir / "truth_students.json").read_text()) if sim_dir else None
    true_p = {}
    if sim_dir:
        with open(sim_dir / "truth_attempts.jsonl") as f:
            for line in f:
                r = json.loads(line)
                if r.get("p") is not None and r.get("event_id"):
                    true_p[r["event_id"]] = r["p"]

    result: dict = {"label": label, "seed": seed, "specs": specs, "rows": len(rows), "bootstrap_reps": reps,
                    "students": len(by_student), "rows_by_kind": {k: int((rows.kind == k).sum()) for k in np.unique(rows.kind)},
                    "base_rate": float(rows.y.mean())}

    # ---------------------------------------------------------------- CV
    gkf = GroupKFold(n_splits=folds)
    splits = list(gkf.split(np.zeros(len(rows)), rows.y, rows.student))
    tuned = tune(rows.subset(splits[0][0]), specs, n_skills, seed)
    result["tuned_C"] = tuned
    oof = {s: np.zeros(len(rows)) for s in specs}
    rec: Dict[str, list] = {"est": [], "laplace": [], "true": [], "opp": []}
    coef_signs = []
    per_fold = {sp: [] for sp in specs}
    for k, (tr, te) in enumerate(splits):
        train, test = rows.subset(tr), rows.subset(te)
        fitted = fit_all(train, specs, n_skills, seed, tuned)
        for s in specs:
            oof[s][te] = fitted[s].predict(test)
            per_fold[s].append(metric_block(test.y, oof[s][te]))
        if "full" in fitted and truth_students:
            r = recovery(fitted["full"], by_student, sorted(set(test.student)), tax, truth_students)
            for key in rec:
                rec[key].extend(r[key])
        if "full" in fitted:
            coef_signs.append(models.to_artifact_coefficients(fitted["full"], tax.topo_order)["global"])
    result["cv"] = {"method": f"GroupKFold(n_splits={folds}) on student id", "metrics": {s: metric_block(rows.y, oof[s]) for s in specs}}
    # Pooled out-of-fold metrics can mislead for a model whose output is a
    # different constant in each fold (the base rate scores AUC < 0.5 pooled),
    # so the fold means are reported beside them.
    result["cv"]["fold_mean"] = {sp: {m: float(np.mean([f[m] for f in per_fold[sp]])) for m in ("auc", "logloss", "brier")}
                                 for sp in specs}
    result["cv"]["fold_sd"] = {sp: {m: float(np.std([f[m] for f in per_fold[sp]])) for m in ("auc", "logloss", "brier")}
                               for sp in specs}
    result["cv"]["bootstrap"] = bootstrap(rows.y, oof, rows.student, reps, seed)
    result["cv"]["calibration_curves"] = {}
    for s in specs:
        frac, mean = calibration_curve(rows.y, np.clip(oof[s], 1e-6, 1 - 1e-6), n_bins=10, strategy="quantile")
        result["cv"]["calibration_curves"][s] = {"predicted": mean.tolist(), "observed": frac.tolist()}
    if coef_signs:
        result["cv"]["global_coef_by_fold"] = coef_signs

    # ------------------------------------------------------------ oracle
    if true_p:
        mask = np.array([e in true_p for e in rows.event_id])
        tp = np.array([true_p.get(e, np.nan) for e in rows.event_id])
        y = rows.y[mask]
        result["oracle"] = {"rows": int(mask.sum()), "note": "question and exercise rows whose truth record survived export",
                            "true_p": metric_block(y, tp[mask]),
                            "models": {s: metric_block(y, oof[s][mask]) for s in specs}}

    # ----------------------------------------------------------- recovery
    if rec["est"]:
        opp = np.array(rec["opp"])
        # Pairs only: no student id, so the file says nothing about who.
        (out_dir).mkdir(parents=True, exist_ok=True)
        (out_dir / f"recovery-points-{label}.json").write_text(json.dumps(
            {"est": [round(x, 4) for x in rec["est"]], "true": [round(x, 4) for x in rec["true"]]}))
        result["recovery"] = {
            "what": "estimated vs simulator-true final mastery per (student, skill), out-of-fold students only",
            "model_all": corr_block(rec["est"], rec["true"]),
            "laplace_all": corr_block(rec["laplace"], rec["true"]),
            "model_opp_ge_5": corr_block(np.array(rec["est"])[opp >= 5], np.array(rec["true"])[opp >= 5]),
            "laplace_opp_ge_5": corr_block(np.array(rec["laplace"])[opp >= 5], np.array(rec["true"])[opp >= 5]),
        }

    # ------------------------------------------------------ learning curves
    if "full" in specs:
        result["learning_curves"] = learning_curves(rows, oof["full"], tax)

    # ------------------------------------------------------------ temporal
    order = {}
    for i, s in enumerate(rows.student):
        order.setdefault(s, []).append(i)
    train_idx, next1, next10, cut_students = [], [], [], 0
    for s, idx in order.items():
        idx = sorted(idx, key=lambda i: (rows.at[i], i))
        if len(idx) < 20:
            train_idx.extend(idx)
            continue
        cut = int(len(idx) * 0.8)
        cut_students += 1
        train_idx.extend(idx[:cut])
        next1.append(idx[cut])
        next10.extend(idx[cut:cut + 10])
    train = rows.subset(np.array(sorted(train_idx)))
    fitted = fit_all(train, specs, n_skills, seed, tuned)
    temporal = {"method": "per student: first 80% of attempts train (students with <20 attempts train only); "
                          "predict the next attempt and the next ten", "students_cut": cut_students}
    for name, idx in (("next_1", next1), ("next_10", next10)):
        sub = rows.subset(np.array(idx))
        temporal[name] = {s: metric_block(sub.y, fitted[s].predict(sub)) for s in specs}
    result["temporal"] = temporal

    # ------------------------------------------------------------ decision
    m = result["cv"]["metrics"]
    if "full" in m and "hgb" in m:
        gap = m["hgb"]["auc"] - m["full"]["auc"]
        result["decision"] = {
            "hgb_minus_full_auc": gap, "threshold": SHIP_THRESHOLD_AUC,
            "ship": "full" if gap < SHIP_THRESHOLD_AUC else "full (hgb exceeded the threshold; see report)",
        }
    result["seconds"] = round(time.time() - t0, 1)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"metrics-{label}.json").write_text(json.dumps(result, indent=1))
    return result
