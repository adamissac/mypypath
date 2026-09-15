"""The recommendation policy's promises, checked as properties over random histories."""
import json
import random

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from pypath_engine import export, policy, train
from pypath_engine.taxonomy import load
from pypath_engine.validate_graph import find_cycle

DAY = 86400000
BASE = 1_790_000_000_000


@pytest.fixture(scope="session")
def artifact(small_cohort, tmp_path_factory):
    out = tmp_path_factory.mktemp("model")
    train.run(small_cohort["ingest"], out, seed=3)
    reports = tmp_path_factory.mktemp("reports")
    art = export.run(out / "model.json", reports, out / "mastery-v1.json")
    return art


@pytest.fixture(scope="session")
def practice_keys(artifact):
    return sorted(k for k, d in artifact["items"].items() if d["kind"] in ("question", "exercise"))


def _event(art, key, correct, at):
    d = art["items"][key]
    if d["kind"] == "question":
        return {"type": "check.answered", "at": at, "lessonPath": d["lesson"], "unit": d["unit"],
                "payload": {"lessonPath": d["lesson"], "questionId": key.split(":", 1)[1], "correct": correct, "attempt": 1}}
    return {"type": "code.tests_passed", "at": at, "lessonPath": d["lesson"], "unit": d["unit"],
            "payload": {"lessonPath": d["lesson"], "editorId": key.split("#", 1)[1], "passed": 3 if correct else 1, "total": 3}}


history = st.lists(st.tuples(st.integers(0, 10_000), st.booleans(), st.integers(1, 3000)), max_size=120)
scopes = st.sampled_from([None, ["foundations"], ["data"], ["foundations", "data"]])


def build(art, keys, raw, now_days):
    t, events = BASE, []
    for idx, correct, minutes in raw:
        t += minutes * 60_000
        events.append(_event(art, keys[idx % len(keys)], correct, t))
    return events, t + now_days * DAY


SETTINGS = settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])


@SETTINGS
@given(raw=history, now_days=st.integers(0, 90), courses=scopes)
def test_never_empty_and_within_caps(artifact, practice_keys, raw, now_days, courses):
    events, now = build(artifact, practice_keys, raw, now_days)
    recs = policy.recommend(artifact, events, now, courses)
    o = artifact["policy"]
    assert 1 <= len(recs) <= o["max_items"]
    per = {}
    for r in recs:
        per[r["skill"]] = per.get(r["skill"], 0) + 1
    assert max(per.values()) <= o["per_skill_cap"]
    assert len({r["item"] for r in recs}) == len(recs)


@SETTINGS
@given(raw=history, now_days=st.integers(0, 90), courses=scopes)
def test_no_prerequisite_violations(artifact, practice_keys, raw, now_days, courses):
    events, now = build(artifact, practice_keys, raw, now_days)
    status = policy.skill_status(artifact, events, now, courses)
    for r in policy.recommend(artifact, events, now, courses):
        for s in artifact["items"][r["item"]]["skills"]:
            for p in artifact["skills"][s]["prerequisites"]:
                if artifact["skills"][p]["course"] in status["scope"]:
                    assert status["mastered"][p], f"{r['item']} needs {p}, which is not mastered"


@SETTINGS
@given(raw=history, now_days=st.integers(0, 90), courses=scopes, seed=st.integers(0, 1000))
def test_deterministic_and_order_independent(artifact, practice_keys, raw, now_days, courses, seed):
    events, now = build(artifact, practice_keys, raw, now_days)
    a = policy.recommend(artifact, events, now, courses)
    shuffled = list(events)
    random.Random(seed).shuffle(shuffled)
    b = policy.recommend(artifact, shuffled, now, courses)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


@SETTINGS
@given(raw=history, now_days=st.integers(0, 2), courses=scopes)
def test_spacing_and_readable_reasons(artifact, practice_keys, raw, now_days, courses):
    events, now = build(artifact, practice_keys, raw, now_days)
    recent = {}
    for e in events:
        d = e["payload"]
        key = f"question:{d['questionId']}" if e["type"] == "check.answered" else f"exercise:{d['lessonPath']}#{d['editorId']}"
        recent[key] = e["at"]
    for r in policy.recommend(artifact, events, now, courses):
        if r["reason_code"] != "relaxed" and r["item"] in recent:
            assert now - recent[r["item"]] >= artifact["policy"]["recent_exclude_hours"] * 3600000
        assert r["reason"] and "%" not in r["reason"] and len(r["reason"]) < 240


def test_cold_start_follows_curriculum_order(artifact):
    recs = policy.recommend(artifact, [], BASE, ["foundations"])
    assert recs and all(r["reason_code"] == "start" for r in recs)
    assert recs[0]["skill"] == "py.running-code"


def test_a_stuck_student_is_sent_to_the_prerequisite(artifact):
    keys = sorted(k for k, d in artifact["items"].items() if d["kind"] == "question" and "py.lambdas" in d["skills"])
    events = [_event(artifact, keys[i % len(keys)], False, BASE + i * 60_000) for i in range(10)]
    status = policy.skill_status(artifact, events, BASE + 3 * DAY, ["foundations"])
    recs = policy.recommend(artifact, events, BASE + 3 * DAY, ["foundations"])
    assert "py.lambdas" not in status["frontier"]
    assert all(r["skill"] != "py.lambdas" for r in recs)


def test_mastered_skills_come_back_for_review(artifact):
    # About the policy's spacing, not the model's calibration: the threshold is
    # set where this small test model's estimate for a strong history lands.
    opts = {"mastered_at": 0.5}
    keys = sorted(k for k, d in artifact["items"].items() if d["kind"] == "question" and d["skills"] == ["py.running-code"])
    events = [_event(artifact, keys[i % len(keys)], True, BASE + i * 60_000) for i in range(40)]
    now = BASE + 200 * DAY
    status = policy.skill_status(artifact, events, now, ["foundations"], opts)
    assert status["mastered"]["py.running-code"]
    assert "py.running-code" in status["due"]
    recs = policy.recommend(artifact, events, now, ["foundations"], opts)
    assert any(r["reason_code"] == "review" and r["skill"] == "py.running-code" for r in recs)
    assert "py.running-code" not in policy.skill_status(artifact, events, events[-1]["at"] + DAY, ["foundations"], opts)["due"]


def test_the_taxonomy_the_policy_walks_has_no_cycles():
    tax = load()
    assert find_cycle({s: tax.prerequisites[s] for s in tax.prerequisites}) is None


@SETTINGS
@given(raw=history, now_days=st.integers(0, 90), courses=scopes)
def test_frontier_recommendations_stay_within_curriculum_reach(artifact, practice_keys, raw, now_days, courses):
    events, now = build(artifact, practice_keys, raw, now_days)
    status = policy.skill_status(artifact, events, now, courses)
    tax = policy.ArtifactTaxonomy(artifact)
    for r in policy.recommend(artifact, events, now, courses):
        if r["reason_code"] == "frontier":
            course = artifact["skills"][r["skill"]]["course"]
            assert tax.skill_unit[r["skill"]] <= status["reach"].get(course, 1) + 1


def test_a_new_data_student_starts_at_unit_one(artifact):
    recs = policy.recommend(artifact, [], BASE, ["data"])
    assert recs[0]["skill"] == "data.records"
    assert all(artifact["items"][r["item"]]["unit"] <= 2 for r in recs)
