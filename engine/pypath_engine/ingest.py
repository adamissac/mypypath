"""Events export -> cleaned events + a tidy, attempt-level table.

Input: one JSON object per event, as JSON lines, a JSON array, or CSV with a
`payload` column holding JSON. Fields: id, class, student, type, lessonPath,
unit, at, payload. `at` may be epoch milliseconds, an ISO-8601 string, or a
Firestore timestamp object ({"seconds": .., "nanoseconds": ..}).

What production does to the log, and what ingest does about it:

  duplicate documents      dropped by (student, id), or by content when id is absent
  one timestamp per flush  events in a 10 s flush share serverTimestamp(); order within
                           it is rebuilt by type, attempt counter and passed count
                           (model_core.event_sort_key) and is approximate
  late flushes             a hidden tab can flush after a later batch. For quiz answers
                           the attempt counter proves the true order, so those are
                           reordered within their own slots; other types cannot be
                           proven and are left, and counted
  the 500-event cap        events past the cap were never written and cannot be
                           recovered; a lesson page with 450+ stored events is flagged
  lost batches             failed writes are not retried; a quiz attempt counter that
                           jumps is flagged as a suspected gap
  left the class           a student whose last event is inside a unit they never
                           tested on, and who is idle for the last 14 days of the
                           export, is flagged
  Data course unit = 0     makeEvent derives unit from /units/ paths only; recovered
                           from the lesson path
  course of a test         test.submitted has no course; taken from the student's most
                           recent lesson path (a heuristic, and flagged as one)
  check.answered attempt   resets on page reload; the table's attempt_index is
                           recomputed from order and the payload value is kept as-is

Real exports carry real uids. Pass a salt (--salt or PYPATH_INGEST_SALT) and
every student and class id is replaced by a salted hash before anything is
written. Never commit an ingested real export.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from .model_core import TYPE_RANK, StudentState, course_of_path, event_sort_key, replay
from .taxonomy import load

PSEUDONYMOUS = re.compile(r"^[a-z]\d{2,6}$|^p_[0-9a-f]{12}$")


def _to_ms(at) -> Optional[int]:
    if isinstance(at, (int, float)):
        return int(at)
    if isinstance(at, dict) and "seconds" in at:
        return int(at["seconds"]) * 1000 + int(at.get("nanoseconds", 0)) // 1_000_000
    if isinstance(at, str):
        if at.isdigit():
            return int(at)
        try:
            return int(datetime.fromisoformat(at.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            return None
    return None


def read_events(path: Path) -> List[dict]:
    text = path.read_text()
    if path.suffix == ".csv":
        rows = list(csv.DictReader(text.splitlines()))
        for r in rows:
            r["payload"] = json.loads(r.get("payload") or "{}")
            r["unit"] = int(r["unit"]) if str(r.get("unit", "")).strip() not in ("", "None") else 0
        return rows
    stripped = text.lstrip()
    if stripped.startswith("["):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def pseudonym(value: str, salt: Optional[str]) -> str:
    value = str(value)
    if PSEUDONYMOUS.match(value):
        return value
    if not salt:
        raise ValueError(
            "this export contains ids that are not pseudonymous; pass --salt (or PYPATH_INGEST_SALT) "
            "so they are hashed before anything is written")
    return "p_" + hashlib.sha256((salt + "|" + value).encode()).hexdigest()[:12]


def clean(raw: List[dict], salt: Optional[str] = None) -> tuple:
    report = Counter()
    seen_ids = set()
    by_student: Dict[str, List[dict]] = defaultdict(list)
    for r in raw:
        report["raw"] += 1
        t = r.get("type")
        if t not in TYPE_RANK:
            report["unknown_type"] += 1
            continue
        at = _to_ms(r.get("at"))
        if at is None:
            report["bad_timestamp"] += 1
            continue
        student = pseudonym(r.get("student") or r.get("uid") or "", salt)
        klass = pseudonym(r.get("class") or r.get("classId") or "c00", salt)
        payload = r.get("payload") or {}
        eid = r.get("id")
        dedupe = (student, eid) if eid else (student, t, at, json.dumps(payload, sort_keys=True))
        if dedupe in seen_ids:
            report["duplicate"] += 1
            continue
        seen_ids.add(dedupe)
        path = payload.get("lessonPath") or r.get("lessonPath") or ""
        unit = int(r.get("unit") or 0)
        if unit == 0 and path:
            m = re.match(r"^/(?:units|data)/unit-(\d+)/", path)
            if m:
                unit = int(m.group(1))
                report["unit_recovered_from_path"] += 1
        by_student[student].append({"id": eid or "", "class": klass, "student": student, "type": t,
                                    "lessonPath": path, "unit": unit, "at": at, "payload": payload})
    for student, events in by_student.items():
        events.sort(key=event_sort_key)
        report["late_flush_reordered"] += _repair_quiz_order(events)
    return by_student, report


def _repair_quiz_order(events: List[dict]) -> int:
    """Where one question's answers are out of attempt order inside a sitting,
    put them back in order within the positions they already occupy."""
    groups: Dict[tuple, List[int]] = defaultdict(list)
    sitting, last_at = 0, None
    for i, e in enumerate(events):
        if last_at is not None and e["at"] - last_at > 2 * 3600 * 1000:
            sitting += 1
        last_at = e["at"]
        if e["type"] == "check.answered":
            groups[(sitting, e["payload"].get("questionId"))].append(i)
    moved = 0
    for idx in groups.values():
        if len(idx) < 2:
            continue
        group = [events[i] for i in idx]
        ordered = sorted(group, key=lambda e: int(e["payload"].get("attempt") or 0))
        attempts = [int(e["payload"].get("attempt") or 0) for e in group]
        if ordered != group and len(set(attempts)) == len(attempts):
            # Each answer takes the timestamp of the slot it moves into, so the
            # repaired order survives every later sort by time. The original
            # server timestamp is kept alongside for audit.
            slots = [events[i]["at"] for i in idx]
            for i, e, at in zip(idx, ordered, slots):
                fixed = dict(e)
                if fixed["at"] != at:
                    fixed["at_server"] = fixed["at"]
                    fixed["at"] = at
                events[i] = fixed
            moved += 1
    return moved


def flag_students(by_student: Dict[str, List[dict]]) -> Dict[str, dict]:
    end = max((e["at"] for evs in by_student.values() for e in evs), default=0)
    flags = {}
    for student, events in by_student.items():
        f = {"capped_sessions": 0, "suspected_gaps": 0, "left_mid_unit": False, "test_course_inferred": 0}
        per_page = Counter()
        last_attempt: Dict[str, int] = {}
        course = None
        for e in events:
            if e["lessonPath"]:
                per_page[(e["lessonPath"], e["at"] // (3 * 3600 * 1000))] += 1
                course = course_of_path(e["lessonPath"]) or course
            if e["type"] == "check.answered":
                q, a = e["payload"].get("questionId"), int(e["payload"].get("attempt") or 1)
                if a > last_attempt.get(q, 0) + 1:
                    f["suspected_gaps"] += 1
                last_attempt[q] = a
            if e["type"] in ("test.submitted", "quiz.submitted"):
                f["test_course_inferred"] += 1
        # 450, not 500: the cap counts events recorded, and a capped page that
        # also lost a batch stores fewer than it recorded.
        f["capped_sessions"] = sum(1 for n in per_page.values() if n >= 450)
        last = events[-1]
        tested = {(course_of_path(e["lessonPath"]) or "", e["unit"]) for e in events if e["type"] == "test.submitted"}
        last_unit = next((e["unit"] for e in reversed(events) if e["lessonPath"]), None)
        f["left_mid_unit"] = bool(last_unit and end - last["at"] > 14 * 86400000
                                  and not any(u == last_unit for _, u in tested))
        flags[student] = f
    return flags


def attempts_table(by_student: Dict[str, List[dict]], flags: Dict[str, dict], tax=None) -> List[dict]:
    tax = tax or load()
    rows: List[dict] = []
    for student in sorted(by_student):
        events = by_student[student]
        klass = events[0]["class"]

        state = StudentState()

        def on_attempt(item, at, attempt_index, g, per_skill, correct, partial, e):
            exposure = sum(state.skills[s].exposure if s in state.skills else 0 for s in item.skills)
            opp = sum(state.skills[s].succ + state.skills[s].fail if s in state.skills else 0 for s in item.skills)
            rows.append({
                "student": student, "class": klass, "item": item.key, "kind": item.kind,
                "course": item.course, "unit": item.unit, "skills": "|".join(item.skills),
                "attempt_index": attempt_index, "is_retry": int(attempt_index > 1),
                "correct": int(correct), "partial": "" if partial is None else round(partial, 6),
                "at": at, "event_id": e.get("id", ""), "event_type": e["type"],
                "payload_attempt": (e["payload"] or {}).get("attempt", ""),
                "prior_exposure": exposure, "prior_opportunities": opp,
                "left_mid_unit": int(flags[student]["left_mid_unit"]),
                "student_capped_sessions": flags[student]["capped_sessions"],
            })

        replay(events, tax, on_attempt, state)
    return rows


def run(src: Path, out_dir: Path, salt: Optional[str] = None) -> dict:
    salt = salt or os.environ.get("PYPATH_INGEST_SALT")
    raw = read_events(src)
    by_student, report = clean(raw, salt)
    flags = flag_students(by_student)
    rows = attempts_table(by_student, flags)
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "clean_events.jsonl", "w") as f:
        for student in sorted(by_student):
            for e in by_student[student]:
                f.write(json.dumps(e, separators=(",", ":")) + "\n")
    with open(out_dir / "attempts.csv", "w", newline="") as f:
        if rows:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    summary = {
        "source": str(src), "students": len(by_student), "attempt_rows": len(rows),
        "events_kept": sum(len(v) for v in by_student.values()),
        "cleaning": dict(report),
        "students_left_mid_unit": sum(1 for f in flags.values() if f["left_mid_unit"]),
        "students_with_capped_sessions": sum(1 for f in flags.values() if f["capped_sessions"]),
        "suspected_gaps": sum(f["suspected_gaps"] for f in flags.values()),
        "tests_with_inferred_course": sum(f["test_course_inferred"] for f in flags.values()),
    }
    (out_dir / "ingest_report.json").write_text(json.dumps(summary, indent=1))
    return summary
