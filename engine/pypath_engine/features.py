"""Rows and design matrices.

Every row is built by model_core.replay, the same code the browser mirrors, so
a feature cannot mean one thing in training and another in the shipped scorer.

Per attempt, from the student's own prior history only:

  global (model_core.GLOBAL_FEATURES)
    attempt_log, is_retry       attempt index within this item (log1p(n-1)) and a retry flag
    decay_succ, decay_fail      outcomes on the item's skills, weighted exp(-days/7)
    days_since_log, no_history  log1p(days since the skill was last attempted)
    partial_rate, has_partial   mean hidden-case pass rate (passed/total) on prior exercises
    err_syntax/name/type/other  log1p counts of prior code.error classes, grouped
    exposure_log                log1p(lessons opened + code runs) on the skills
    prereq_min                  weakest prerequisite, as a Laplace success rate
    dur_rushed/long/outlier     bucket of the last end-of-unit test on this unit
    kind_exercise/test/quiz     item kind (question is the reference)
  per skill k of the item (each divided by the number of skills)
    beta_k                      skill intercept (easiness)
    succ_k, fail_k              log1p prior successes / failures on k  (PFA)
    opp_k                       log1p prior opportunities on k         (AFM variant only)
  item_i                        one-hot learned item difficulty, L2-shrunk towards 0
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from scipy import sparse

from .model_core import GLOBAL_FEATURES, replay
from .taxonomy import Taxonomy, load


@dataclass
class Rows:
    student: np.ndarray
    item: np.ndarray
    kind: np.ndarray
    primary_skill: np.ndarray
    G: np.ndarray                  # (n, len(GLOBAL_FEATURES))
    sk_row: np.ndarray             # coordinates of per-skill terms
    sk_col: np.ndarray
    sk_inv_m: np.ndarray
    sk_ls: np.ndarray
    sk_lf: np.ndarray
    y: np.ndarray
    at: np.ndarray
    attempt_index: np.ndarray
    event_id: np.ndarray
    skills: List[tuple]

    def __len__(self) -> int:
        return len(self.y)

    def subset(self, idx: np.ndarray) -> "Rows":
        idx = np.asarray(idx)
        pos = np.full(len(self), -1)
        pos[idx] = np.arange(len(idx))
        keep = pos[self.sk_row] >= 0
        return Rows(self.student[idx], self.item[idx], self.kind[idx], self.primary_skill[idx], self.G[idx],
                    pos[self.sk_row[keep]], self.sk_col[keep], self.sk_inv_m[keep], self.sk_ls[keep],
                    self.sk_lf[keep], self.y[idx], self.at[idx], self.attempt_index[idx], self.event_id[idx],
                    [self.skills[i] for i in idx])


def load_clean_events(path: Path) -> Dict[str, List[dict]]:
    by_student: Dict[str, List[dict]] = {}
    with open(path) as f:
        for line in f:
            e = json.loads(line)
            by_student.setdefault(e["student"], []).append(e)
    return by_student


def build_rows(by_student: Dict[str, List[dict]], tax: Optional[Taxonomy] = None) -> Rows:
    tax = tax or load()
    skill_index = {s: i for i, s in enumerate(tax.topo_order)}
    cols = {k: [] for k in ("student", "item", "kind", "primary", "G", "y", "at", "att", "eid", "skills")}
    sk = {k: [] for k in ("row", "col", "inv", "ls", "lf")}

    for student in sorted(by_student):
        def on_attempt(item, at, attempt_index, g, per_skill, correct, partial, e, student=student):
            r = len(cols["y"])
            cols["student"].append(student)
            cols["item"].append(item.key)
            cols["kind"].append(item.kind)
            cols["primary"].append(skill_index[item.skills[0]])
            cols["G"].append([g[name] for name in GLOBAL_FEATURES])
            cols["y"].append(1 if correct else 0)
            cols["at"].append(at)
            cols["att"].append(attempt_index)
            cols["eid"].append(e.get("id", ""))
            cols["skills"].append(item.skills)
            inv = 1.0 / len(per_skill)
            for s, ls, lf in per_skill:
                sk["row"].append(r)
                sk["col"].append(skill_index[s])
                sk["inv"].append(inv)
                sk["ls"].append(ls)
                sk["lf"].append(lf)

        replay(by_student[student], tax, on_attempt)

    return Rows(np.array(cols["student"], dtype=object), np.array(cols["item"], dtype=object),
                np.array(cols["kind"], dtype=object), np.array(cols["primary"], dtype=np.int32),
                np.array(cols["G"], dtype=np.float64).reshape(-1, len(GLOBAL_FEATURES)),
                np.array(sk["row"], dtype=np.int64), np.array(sk["col"], dtype=np.int64),
                np.array(sk["inv"]), np.array(sk["ls"]), np.array(sk["lf"]),
                np.array(cols["y"], dtype=np.int8), np.array(cols["at"], dtype=np.int64),
                np.array(cols["att"], dtype=np.int32), np.array(cols["eid"], dtype=object), cols["skills"])


N_SKILLS = None


def _skill_block(rows: Rows, n_skills: int, terms: List[str]) -> sparse.csr_matrix:
    blocks = []
    n = len(rows)
    for term in terms:
        if term == "beta":
            data = rows.sk_inv_m
        elif term == "succ":
            data = rows.sk_ls * rows.sk_inv_m
        elif term == "fail":
            data = rows.sk_lf * rows.sk_inv_m
        elif term == "opp":
            data = np.log1p(np.expm1(rows.sk_ls) + np.expm1(rows.sk_lf)) * rows.sk_inv_m
        else:
            raise ValueError(term)
        blocks.append(sparse.csr_matrix((data, (rows.sk_row, rows.sk_col)), shape=(n, n_skills)))
    return sparse.hstack(blocks, format="csr")


def item_block(rows: Rows, vocab: Dict[str, int]) -> sparse.csr_matrix:
    idx = np.array([vocab.get(i, -1) for i in rows.item])
    keep = idx >= 0
    return sparse.csr_matrix((np.ones(keep.sum()), (np.nonzero(keep)[0], idx[keep])), shape=(len(rows), len(vocab)))


def design(rows: Rows, spec: str, vocab: Dict[str, int], n_skills: int) -> sparse.csr_matrix:
    """spec: item | afm | pfa | full."""
    parts = []
    if spec == "full":
        parts.append(sparse.csr_matrix(rows.G))
    if spec == "afm":
        parts.append(_skill_block(rows, n_skills, ["beta", "opp"]))
    elif spec in ("pfa", "full"):
        parts.append(_skill_block(rows, n_skills, ["beta", "succ", "fail"]))
    parts.append(item_block(rows, vocab))
    return sparse.hstack(parts, format="csr")


def dense_for_trees(rows: Rows, item_te: Dict[str, float], prior: float) -> np.ndarray:
    """Dense features for gradient boosting: the globals, per-row means of the
    skill counts, the primary skill (categorical, last column) and a smoothed
    in-fold item success logit in place of 900 one-hot columns."""
    n = len(rows)
    counts = np.bincount(rows.sk_row, minlength=n).astype(float)
    mean_ls = np.bincount(rows.sk_row, weights=rows.sk_ls, minlength=n) / counts
    mean_lf = np.bincount(rows.sk_row, weights=rows.sk_lf, minlength=n) / counts
    te = np.array([item_te.get(i, prior) for i in rows.item])
    return np.column_stack([rows.G, mean_ls, mean_lf, counts, te, rows.primary_skill.astype(float)])


def item_target_encoding(rows: Rows, smoothing: float = 20.0) -> tuple:
    prior = float(rows.y.mean())
    sums: Dict[str, float] = {}
    cnts: Dict[str, int] = {}
    for i, y in zip(rows.item, rows.y):
        sums[i] = sums.get(i, 0.0) + y
        cnts[i] = cnts.get(i, 0) + 1
    logit = lambda p: math.log(p / (1 - p))
    te = {i: logit((sums[i] + smoothing * prior) / (cnts[i] + smoothing)) for i in sums}
    return te, logit(prior)
