"""The shipped scorer is exactly the model that was evaluated, and features only
look backwards."""
import copy

import numpy as np

from pypath_engine import model_core, models
from pypath_engine.features import build_rows, load_clean_events
from pypath_engine.taxonomy import load


def test_model_core_reproduces_sklearn_predict_proba(small_cohort):
    tax = load()
    by_student = load_clean_events(small_cohort["ingest"] / "clean_events.jsonl")
    rows = build_rows(by_student, tax)
    fitted = models.fit_logistic(rows, "full", len(tax.topo_order), seed=1, C=1.0)
    coef = models.to_artifact_coefficients(fitted, tax.topo_order)
    mine = []
    for s in sorted(by_student):
        model_core.replay(by_student[s], tax,
                          lambda item, at, ai, g, per, c, pa, e: mine.append(model_core.score(coef, g, per, item.key)))
    assert np.max(np.abs(np.array(mine) - fitted.predict(rows))) < 1e-9


def test_a_rows_features_do_not_depend_on_its_own_outcome(small_cohort):
    tax = load()
    events = next(iter(load_clean_events(small_cohort["ingest"] / "clean_events.jsonl").values()))
    events = sorted(events, key=model_core.event_sort_key)
    graded = [i for i, e in enumerate(events) if e["type"] == "check.answered"]
    target = graded[len(graded) // 2]
    flipped = copy.deepcopy(events)
    flipped[target]["payload"]["correct"] = not flipped[target]["payload"]["correct"]

    def features_at(evs):
        seen = []
        model_core.replay(evs, tax, lambda item, at, ai, g, per, c, pa, e: seen.append((e.get("id"), g, per)))
        return seen

    a, b = features_at(events), features_at(flipped)
    idx = next(i for i, (eid, _, _) in enumerate(a) if eid == events[target]["id"])
    assert a[idx][1] == b[idx][1] and a[idx][2] == b[idx][2]       # same features for the flipped row itself
    assert a[idx + 1:] != b[idx + 1:]                               # later rows do see it


def test_decay_halves_on_schedule():
    st = model_core.SkillState()
    model_core.update_attempt(model_core.StudentState(), "x", (), 0, True, None)
    st.dsucc, st.dat = 1.0, 1_000
    ds, _ = st.decayed(1_000 + int(7 * 86400000 * np.log(2)))
    assert abs(ds - 0.5) < 1e-9


def test_duration_buckets_and_error_groups():
    assert model_core.duration_bucket(0) == "missing"
    assert model_core.duration_bucket(60) == "rushed"
    assert model_core.duration_bucket(900) == "normal"
    assert model_core.duration_bucket(3600) == "long"
    assert model_core.duration_bucket(86400) == "outlier"
    assert model_core.error_group("IndentationError") == "syntax"
    assert model_core.error_group("KeyError") == "type"
    assert model_core.error_group("RecursionError") == "other"
