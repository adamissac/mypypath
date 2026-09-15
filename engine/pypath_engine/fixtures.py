"""Shared parity fixtures: one set of inputs, the Python engine's outputs, and a
test on each side that the other language agrees.

tests/fixtures/adaptive/<name>.json holds
  input     { events | storage, now, courses }
  expected  { mastery: {skill: p}, scores: {item: p}, recommendations: [...] }

engine/tests/test_parity.py recomputes every expected value from the artifact
and fails on any drift; tests/recommend-parity.test.js runs assets/js/recommend.js
on the same inputs and requires agreement within 1e-6 and an identical ranked
list, reasons included.
"""
from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Dict, List

from . import model_core, policy
from .features import load_clean_events

DAY = 86400000
SCORE_ITEMS = 40


def expected_for(art: dict, events: List[dict], now: int, courses) -> dict:
    tax = policy.ArtifactTaxonomy(art)
    state = model_core.replay(events, tax)
    mastery = {s: model_core.mastery(art["model"], state, s, now, tax.prerequisites) for s in tax.skill_order}
    keys = sorted(k for k, it in tax.items.items() if it.kind in ("question", "exercise"))
    rng = random.Random(len(events) * 7919 + now % 100003)
    sample = sorted(rng.sample(keys, SCORE_ITEMS))
    scores = {}
    for k in sample:
        it = tax.items[k]
        g, per = model_core.features(state, k, it.kind, it.skills, (it.course, it.unit), now,
                                     state.item_attempts.get(k, 0) + 1, tax.prerequisites)
        scores[k] = model_core.score(art["model"], g, per, k)
    recs = policy.recommend(art, events, now, courses, tax=tax)
    return {"mastery": mastery, "scores": scores, "recommendations": recs}


def _strip(e: dict) -> dict:
    return {k: e[k] for k in ("id", "type", "lessonPath", "unit", "at", "payload") if k in e} | (
        {"course": e["course"]} if "course" in e else {})


def run(artifact: Path, ingest_dir: Path, out: Path) -> List[str]:
    art = json.loads(artifact.read_text())
    by_student = load_clean_events(ingest_dir / "clean_events.jsonl")
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()
    rng = random.Random(4242)
    cases: Dict[str, dict] = {}

    # Real-shaped histories from the simulated cohort, cut at different points.
    students = sorted(by_student, key=lambda s: len(by_student[s]))
    picks = [students[len(students) // 10], students[len(students) // 2], students[-1]]
    data_students = [s for s in students if any(e["lessonPath"].startswith("/data/") for e in by_student[s])]
    if data_students:
        picks.append(data_students[len(data_students) // 2])
    for n, s in enumerate(picks):
        evs = sorted(by_student[s], key=model_core.event_sort_key)
        cut = evs[: min(1200, max(5, int(len(evs) * (0.3 + 0.2 * n))))]
        now = cut[-1]["at"] + rng.randint(1, 5) * DAY
        cases[f"student-{n + 1}"] = {"events": [_strip(e) for e in cut], "now": now, "courses": None}

    # A new learner with no history at all: cold start must still return items.
    cases["cold-start"] = {"events": [], "now": 1_790_000_000_000, "courses": ["foundations"]}
    cases["cold-start-data"] = {"events": [], "now": 1_790_000_000_000, "courses": ["data"]}

    # A guest: only what localStorage keeps.
    storage = {
        "pypath-checks-/units/unit-1/first-program.html": json.dumps({"exercise1": {"passed": 3, "total": 3, "at": 1_789_000_000_000}}),
        "pypath-checks-/units/unit-2/for-loop.html": json.dumps({"exercise1": {"passed": 1, "total": 4, "at": 1_789_100_000_000},
                                                                  "exercise2": {"passed": 4, "total": 4, "at": 1_789_100_300_000}}),
        "pypath-unit-tests": json.dumps({"1": {"best": 82, "passed": True, "attempts": 2, "lastAt": 1_789_050_000_000,
                                               "last": {"score": 82, "at": 1_789_050_000_000, "durationSec": 1400}},
                                         "data-1": {"best": 40, "passed": False, "attempts": 1, "lastAt": 1_789_060_000_000,
                                                    "last": {"score": 40, "at": 1_789_060_000_000, "durationSec": 95}}}),
        "pypath-progress-lessons": json.dumps({"/units/unit-1/what-is-python.html": {"done": ["practice1"], "passed": False}}),
    }
    cases["guest-local-storage"] = {"storage": storage, "now": 1_789_200_000_000, "courses": None}

    # Someone strong at the fundamentals and stuck on a later skill: the policy
    # must send them to the prerequisite, and bring mastered skills back for review.
    strong = []
    t = 1_780_000_000_000
    items = sorted((k, d) for k, d in art["items"].items() if d["kind"] == "question" and d["course"] == "foundations")
    early = [k for k, d in items if d["unit"] <= 2]
    opened = set()
    for k in early:
        lesson = art["items"][k]["lesson"]
        if lesson not in opened:
            opened.add(lesson)
            t += 30_000
            strong.append({"type": "lesson.opened", "at": t, "lessonPath": lesson, "unit": art["items"][k]["unit"],
                           "payload": {"lessonPath": lesson, "unit": art["items"][k]["unit"]}})
        for _ in range(2):
            t += 90_000
            strong.append({"type": "check.answered", "at": t, "lessonPath": art["items"][k]["lesson"], "unit": art["items"][k]["unit"],
                           "payload": {"lessonPath": art["items"][k]["lesson"], "questionId": k.split(":", 1)[1], "correct": True, "attempt": 1}})
    late = [k for k, d in items if d["unit"] == 3][:12]
    for k in late:
        t += 90_000
        strong.append({"type": "check.answered", "at": t, "lessonPath": art["items"][k]["lesson"], "unit": 3,
                       "payload": {"lessonPath": art["items"][k]["lesson"], "questionId": k.split(":", 1)[1], "correct": False, "attempt": 1}})
    cases["strong-then-stuck"] = {"events": strong, "now": t + 20 * DAY, "courses": ["foundations"]}

    written = []
    for name, case in cases.items():
        events = policy.local_to_events(case["storage"]) if "storage" in case else case["events"]
        expected = expected_for(art, events, case["now"], case["courses"])
        doc = {"name": name, "model_version": art["model_version"], "skills_hash": art["skills_hash"],
               "input": {k: v for k, v in case.items()}, "expected": expected}
        if "storage" in case:
            doc["expected"]["events_from_storage"] = events
        (out / f"{name}.json").write_text(json.dumps(doc, indent=1) + "\n")
        written.append(name)
    return written
