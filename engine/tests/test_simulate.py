"""The simulator: deterministic, and speaks exactly the site's event vocabulary."""
import json
import re

from pypath_engine.simulate import SimConfig, simulate

# assets/js/events.js EVENT_TYPES, copied rather than imported so a change there
# makes this fail and gets looked at.
VOCAB = {
    "lesson.opened": {"lessonPath", "unit"},
    "code.run": {"lessonPath", "editorId", "ok"},
    "code.error": {"lessonPath", "editorId", "errorType"},
    "code.tests_passed": {"lessonPath", "editorId", "passed", "total"},
    "answer.submitted": {"lessonPath", "exerciseId", "attempt"},
    "check.answered": {"lessonPath", "questionId", "correct", "attempt"},
    "test.started": {"unit"},
    "test.submitted": {"unit", "score", "total", "attempt", "durationSec"},
    "quiz.submitted": {"assignmentId", "unit", "score", "correct", "total", "attempt"},
    "unit.completed": {"unit", "verified"},
}


def test_same_seed_same_events():
    a = simulate(SimConfig(students=6, seed=3))[0]
    b = simulate(SimConfig(students=6, seed=3))[0]
    assert a == b
    assert simulate(SimConfig(students=6, seed=4))[0] != a


def test_events_use_only_the_site_vocabulary_and_fields():
    events = simulate(SimConfig(students=8, seed=5))[0]
    assert events
    for e in events:
        assert e["type"] in VOCAB
        assert set(e["payload"]) <= VOCAB[e["type"]], (e["type"], e["payload"])
        assert len(json.dumps(e["payload"])) <= 512
        if e["type"] == "code.error":
            assert re.match(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$", e["payload"]["errorType"])


def test_ids_are_pseudonymous_and_data_events_have_unit_zero():
    events = simulate(SimConfig(students=30, seed=6, data_course_share=1.0))[0]
    assert all(re.match(r"^s\d{4}$", e["student"]) and re.match(r"^c\d{2}$", e["class"]) for e in events)
    data_lesson = [e for e in events if e["lessonPath"].startswith("/data/")]
    assert data_lesson and all(e["unit"] == 0 for e in data_lesson)


def test_the_damage_production_does_is_present():
    events, _, _, stats = simulate(SimConfig(students=40, seed=8))
    ats = {}
    for e in events:
        ats.setdefault((e["student"], e["at"]), 0)
        ats[(e["student"], e["at"])] += 1
    assert any(n > 1 for n in ats.values()), "flushes should share a server timestamp"
    assert stats["lost_batches"] > 0
    ids = [e["id"] for e in events]
    assert len(ids) != len(set(ids)), "exports should carry the odd duplicate"


def test_bkt_generator_runs_and_differs():
    a = simulate(SimConfig(students=5, seed=2, generator="bkt"))
    b = simulate(SimConfig(students=5, seed=2))
    assert a[0] != b[0]
    assert all(v in (0.0, 1.0) for s in a[2].values() for v in s["final_mastery"].values())
