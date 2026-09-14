"""The four model families, fitted the same way so they can be compared.

  base      global base rate                                   floor
  item      logistic on item one-hots only                     floor: item difficulty
  afm       logistic: skill intercept + log opportunities + item  (Additive Factors Model)
  pfa       logistic: skill intercept + log successes + log failures + item  (Performance Factors)
  full      pfa + the global attempt-history features           the model that ships
  hgb       HistGradientBoostingClassifier on dense features   accuracy ceiling check
  *_cal     CalibratedClassifierCV(isotonic) around full / hgb

The logistic models use L2 with C chosen on a held-out slice of *training
students* (never test students), from a small grid.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Callable, Dict, List

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

from .features import Rows, dense_for_trees, design, item_target_encoding
from .model_core import GLOBAL_FEATURES

C_GRID = (0.1, 0.3, 1.0, 3.0)


@dataclass
class Fitted:
    name: str
    predict: Callable[[Rows], np.ndarray]
    info: dict


def _vocab(rows: Rows) -> Dict[str, int]:
    return {k: i for i, k in enumerate(sorted(set(rows.item)))}


def _lr(C: float, seed: int) -> LogisticRegression:
    return LogisticRegression(C=C, solver="lbfgs", max_iter=3000, tol=1e-6, random_state=seed)


def _split_students(rows: Rows, seed: int, share: float = 0.2):
    students = np.array(sorted(set(rows.student)))
    rng = np.random.RandomState(seed)
    val = set(rng.choice(students, max(1, int(len(students) * share)), replace=False))
    mask = np.array([s in val for s in rows.student])
    return np.nonzero(~mask)[0], np.nonzero(mask)[0]


def fit_logistic(rows: Rows, spec: str, n_skills: int, seed: int, C: float = None) -> Fitted:
    chosen, scores = C, {}
    if chosen is None:
        tr, va = _split_students(rows, seed)
        a, b = rows.subset(tr), rows.subset(va)
        voc = _vocab(a)
        Xa, Xb = design(a, spec, voc, n_skills), design(b, spec, voc, n_skills)
        for c in C_GRID:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                m = _lr(c, seed).fit(Xa, a.y)
            scores[c] = log_loss(b.y, m.predict_proba(Xb)[:, 1], labels=[0, 1])
        chosen = min(scores, key=scores.get)
    voc = _vocab(rows)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = _lr(chosen, seed).fit(design(rows, spec, voc, n_skills), rows.y)
    predict = lambda r: model.predict_proba(design(r, spec, voc, n_skills))[:, 1]
    return Fitted(spec, predict, {"C": chosen, "C_scores": scores, "model": model, "vocab": voc, "spec": spec})


def fit_base(rows: Rows, **_) -> Fitted:
    p = float(rows.y.mean())
    return Fitted("base", lambda r: np.full(len(r), p), {"rate": p})


def fit_hgb(rows: Rows, seed: int, calibrate: bool = False, **_) -> Fitted:
    te, prior = item_target_encoding(rows)
    X = dense_for_trees(rows, te, prior)
    cat = np.zeros(X.shape[1], dtype=bool)
    cat[-1] = True
    base = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, max_leaf_nodes=31,
                                          l2_regularization=1.0, categorical_features=cat,
                                          early_stopping=True, validation_fraction=0.15, random_state=seed)
    model = CalibratedClassifierCV(base, method="isotonic", cv=3) if calibrate else base
    model.fit(X, rows.y)
    predict = lambda r: model.predict_proba(dense_for_trees(r, te, prior))[:, 1]
    return Fitted("hgb_cal" if calibrate else "hgb", predict, {"model": model})


def fit_full_calibrated(rows: Rows, n_skills: int, seed: int, C: float) -> Fitted:
    voc = _vocab(rows)
    model = CalibratedClassifierCV(_lr(C, seed), method="isotonic", cv=3)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(design(rows, "full", voc, n_skills), rows.y)
    return Fitted("full_cal", lambda r: model.predict_proba(design(r, "full", voc, n_skills))[:, 1], {"C": C})


def to_artifact_coefficients(fitted: Fitted, skill_ids: List[str]) -> dict:
    """The fitted 'full' logistic model as the plain dict model_core.score reads."""
    assert fitted.info["spec"] == "full"
    coef = fitted.info["model"].coef_[0]
    n_g, n_s = len(GLOBAL_FEATURES), len(skill_ids)
    g = {name: float(coef[i]) for i, name in enumerate(GLOBAL_FEATURES)}
    beta, succ, fail = coef[n_g:n_g + n_s], coef[n_g + n_s:n_g + 2 * n_s], coef[n_g + 2 * n_s:n_g + 3 * n_s]
    skills = {s: [float(beta[i]), float(succ[i]), float(fail[i])] for i, s in enumerate(skill_ids)}
    items_coef = coef[n_g + 3 * n_s:]
    items = {k: float(items_coef[i]) for k, i in fitted.info["vocab"].items()}
    return {"intercept": float(fitted.info["model"].intercept_[0]), "global": g, "skills": skills, "items": items,
            "C": fitted.info["C"]}
