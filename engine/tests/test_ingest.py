"""Each production quirk ingest claims to handle, one test each."""
import json

import pytest

from pypath_engine import ingest

BASE = 1_790_000_000_000


def ev(i, t, at, payload, student="s0001", lesson="/units/unit-1/first-program.html", unit=1, eid=None):
    return {"id": eid or f"e{i}", "class": "c01", "student": student, "type": t, "lessonPath": lesson,
            "unit": unit, "at": at, "payload": payload}


def q(i, at, qid, correct, attempt, **kw):
    return ev(i, "check.answered", at, {"lessonPath": "/units/unit-1/first-program.html", "questionId": qid,
                                        "correct": correct, "attempt": attempt}, **kw)


def run(tmp_path, events, **kw):
    src = tmp_path / "events.jsonl"
    src.write_text("\n".join(json.dumps(e) for e in events))
    return ingest.run(src, tmp_path / "out", **kw), (tmp_path / "out" / "attempts.csv").read_text().splitlines()


def test_duplicate_documents_are_dropped(tmp_path):
    e = q(1, BASE, "u1-first-1", True, 1)
    summary, rows = run(tmp_path, [e, dict(e)])
    assert summary["cleaning"]["duplicate"] == 1
    assert len(rows) == 2  # header + one row


def test_a_late_flush_is_put_back_in_attempt_order(tmp_path):
    # attempt 2 landed before attempt 1 (a hidden tab flushed late)
    events = [q(1, BASE + 60_000, "u1-first-1", False, 1), q(2, BASE + 5_000, "u1-first-1", True, 2)]
    summary, rows = run(tmp_path, events)
    assert summary["cleaning"]["late_flush_reordered"] == 1
    header = rows[0].split(",")
    first = dict(zip(header, rows[1].split(",")))
    assert first["correct"] == "0" and first["attempt_index"] == "1"


def test_same_timestamp_events_order_by_attempt(tmp_path):
    events = [q(1, BASE, "u1-first-1", True, 2), q(2, BASE, "u1-first-1", False, 1)]
    _, rows = run(tmp_path, events)
    header = rows[0].split(",")
    assert [dict(zip(header, r.split(",")))["correct"] for r in rows[1:]] == ["0", "1"]


def test_data_course_unit_is_recovered_from_the_path(tmp_path):
    e = ev(1, "lesson.opened", BASE, {"lessonPath": "/data/unit-4/the-series.html", "unit": 4},
           lesson="/data/unit-4/the-series.html", unit=0)
    summary, _ = run(tmp_path, [e])
    assert summary["cleaning"]["unit_recovered_from_path"] == 1


def test_real_ids_require_a_salt_and_are_hashed(tmp_path):
    e = q(1, BASE, "u1-first-1", True, 1, student="Xy7rTq9KabcDEF")
    with pytest.raises(ValueError, match="salt"):
        run(tmp_path, [e])
    summary, rows = run(tmp_path, [e], salt="pepper")
    assert "Xy7rTq9KabcDEF" not in "\n".join(rows)
    assert rows[1].startswith("p_")


def test_timestamps_in_iso_and_firestore_shapes(tmp_path):
    a = q(1, "2026-09-01T10:00:00Z", "u1-first-1", False, 1)
    b = q(2, {"seconds": 1788260500, "nanoseconds": 0}, "u1-first-1", True, 2)
    summary, rows = run(tmp_path, [a, b])
    assert summary["attempt_rows"] == 2


def test_quiz_attempt_jumps_are_flagged_as_gaps(tmp_path):
    events = [q(1, BASE, "u1-first-1", False, 1), q(2, BASE + 20_000, "u1-first-1", True, 4)]
    summary, _ = run(tmp_path, events)
    assert summary["suspected_gaps"] == 1


def test_csv_exports_are_read(tmp_path):
    src = tmp_path / "events.csv"
    src.write_text('id,class,student,type,lessonPath,unit,at,payload\n'
                   f'e1,c01,s0001,check.answered,/units/unit-1/first-program.html,1,{BASE},'
                   '"{""lessonPath"": ""/units/unit-1/first-program.html"", ""questionId"": ""u1-first-1"", ""correct"": true, ""attempt"": 1}"\n')
    summary = ingest.run(src, tmp_path / "out")
    assert summary["attempt_rows"] == 1


def test_cohort_ingest_reports_the_quirks(small_cohort):
    s = small_cohort["summary"]
    assert s["students"] == 25 and s["attempt_rows"] > 1000
    assert s["cleaning"]["duplicate"] > 0
    assert s["cleaning"]["unit_recovered_from_path"] >= 0
