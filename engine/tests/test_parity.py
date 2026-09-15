"""The committed parity fixtures still describe what this engine does.

tests/recommend-parity.test.js holds the JS port to these same files; this holds
the Python engine to them. If either side changes alone, one of the two fails.
"""
import json
import math
from pathlib import Path

import pytest

from pypath_engine import fixtures, paths, policy

CASES = sorted(paths.FIXTURES.glob("*.json"))


@pytest.fixture(scope="module")
def art():
    return json.loads(paths.ARTIFACT.read_text())


def test_fixtures_exist_for_the_shipped_artifact(art):
    assert len(CASES) >= 6
    skills = json.loads(paths.SKILLS_JSON.read_text())
    assert art["skills_hash"] == skills["hash"]
    for case in CASES:
        doc = json.loads(case.read_text())
        assert doc["model_version"] == art["model_version"]
        assert doc["skills_hash"] == art["skills_hash"]


@pytest.mark.parametrize("case", CASES, ids=lambda p: p.stem)
def test_python_reproduces_the_fixture(art, case):
    doc = json.loads(case.read_text())
    inp = doc["input"]
    events = policy.local_to_events(inp["storage"]) if "storage" in inp else inp["events"]
    if "storage" in inp:
        assert events == doc["expected"]["events_from_storage"]
    got = fixtures.expected_for(art, events, inp["now"], inp["courses"])
    want = doc["expected"]
    for skill, p in want["mastery"].items():
        assert math.isclose(got["mastery"][skill], p, abs_tol=1e-12), skill
    assert set(got["scores"]) == set(want["scores"])
    for item, p in want["scores"].items():
        assert math.isclose(got["scores"][item], p, abs_tol=1e-12), item
    assert [r["item"] for r in got["recommendations"]] == [r["item"] for r in want["recommendations"]]
    assert [r["reason"] for r in got["recommendations"]] == [r["reason"] for r in want["recommendations"]]


def test_artifact_scores_match_sklearn_through_training(art):
    """train.run refuses to write a model whose model_core scores differ from
    scikit-learn's by more than 1e-9; the gap it measured is recorded."""
    info = json.loads((paths.DATA / "model" / "model.json").read_text()) if (paths.DATA / "model" / "model.json").exists() else None
    if info is None:
        pytest.skip("no trained model in engine/data; run python -m pypath_engine all")
    assert info["max_abs_gap_model_core_vs_sklearn"] < 1e-9
