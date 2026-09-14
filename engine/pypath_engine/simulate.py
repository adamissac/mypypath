"""A generative student model, for developing and validating before real data exists.

EVERYTHING THIS PRODUCES IS SYNTHETIC. It is how the pipeline is built and
checked, and how we test that the estimator recovers mastery it was never told.
It is not evidence about real students, and any number computed from it must be
labelled as simulated.

The model, per student s and skill k:

  mastery        m[s,k] in logits. Starts at ability[s] + a per-skill offset,
                 plus a background bonus for Python skills when the student is
                 on the Data course (that course assumes some Python).
  answering      P(correct) = guess + (1 - slip - guess) * sigmoid(mean_k m - difficulty + retry_bonus)
                 with per-item difficulty and per-kind guess/slip.
  learning       each graded attempt adds rate[s] * gain * prereq_factor to the
                 item's skills, bigger after a failure with feedback; exposure
                 (opening a lesson, running code) adds a little. prereq_factor is
                 the mean sigmoid mastery of the skill's prerequisites, so a skill
                 learned without its foundations is learned slowly.
  forgetting     between sessions mastery decays towards the start value by
                 forget * log1p(gap in days).
  dropout        after each lesson a hazard that rises with recent failures.

It then emits events exactly as the site would -- the same types and payload
fields as assets/js/events.js -- and damages them the way production does:
10-second flushes that share one server timestamp, the 500-event page-session
cap, whole batches lost to a failed write, batches that land late, and the odd
duplicated document in an export.
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from . import paths
from .model_core import CONFIG, duration_bucket
from .taxonomy import Taxonomy, load

ERRORS_LOW = ["SyntaxError", "IndentationError", "NameError", "NameError", "TypeError"]
ERRORS_HIGH = ["TypeError", "ValueError", "KeyError", "IndexError", "AttributeError", "ZeroDivisionError"]
KIND_DIFFICULTY = {"question": -0.9, "exercise": 0.2, "mcq": -0.3, "frq": 0.6}
KIND_GUESS = {"question": 0.22, "exercise": 0.02, "mcq": 0.25, "frq": 0.01}


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


@dataclass
class SimConfig:
    students: int = 400
    class_size: int = 25
    data_course_share: float = 0.4
    seed: int = 20260914
    start_ms: int = 1_788_000_000_000          # a fixed epoch, so runs are identical
    batch_loss: float = 0.01
    batch_late: float = 0.02
    duplicate_rate: float = 0.005
    looping_student_share: float = 0.02         # someone holding Ctrl+Enter
    max_lessons: Optional[int] = None
    generator: str = "logistic"                 # logistic | bkt (the robustness check)


class Emitter:
    """Buffers one page session's events and flushes them like event-sink.js."""

    def __init__(self, rng: random.Random, cfg: SimConfig, sink: List[dict], student: str, klass: str):
        self.rng, self.cfg, self.sink = rng, cfg, sink
        self.student, self.klass = student, klass
        self.buffer: List[dict] = []
        self.session_count = 0
        self.seq = 0
        self.dropped_by_cap = 0
        self.lost_batches = 0

    def new_page(self) -> None:
        self.flush()
        self.session_count = 0

    def record(self, t_ms: int, etype: str, lesson_path: str, unit: int, payload: dict) -> Optional[str]:
        if self.session_count >= 500:            # SESSION_CAP: dropped, never queued
            self.dropped_by_cap += 1
            return None
        self.session_count += 1
        self.seq += 1
        eid = f"{self.student}-e{self.seq:05d}"
        # makeEvent derives the stored unit from /units/ paths only, so a Data
        # lesson's events are stored with unit 0 -- reproduced here on purpose.
        stored_unit = unit if (etype in ("test.started", "test.submitted", "quiz.submitted", "unit.completed")
                               or lesson_path.startswith("/units/")) else 0
        self.buffer.append({"id": eid, "t": t_ms, "type": etype, "lessonPath": lesson_path,
                            "unit": stored_unit, "payload": payload})
        if len(self.buffer) >= 50:
            self.flush()
        return eid

    def flush_window(self, t_ms: int) -> None:
        # The 10 s timer: everything buffered before this window goes out together.
        ready = [e for e in self.buffer if e["t"] <= t_ms - 10_000]
        if ready:
            self.flush(upto=ready[-1]["t"])

    def flush(self, upto: Optional[int] = None) -> None:
        if not self.buffer:
            return
        batch = self.buffer if upto is None else [e for e in self.buffer if e["t"] <= upto]
        self.buffer = [] if upto is None else [e for e in self.buffer if e["t"] > upto]
        if not batch:
            return
        if self.rng.random() < self.cfg.batch_loss:   # a failed write is not re-queued
            self.lost_batches += 1
            return
        server = batch[-1]["t"] + self.rng.randint(150, 1500)
        if self.rng.random() < self.cfg.batch_late:  # a hidden tab flushes late
            server += self.rng.randint(20_000, 90_000)
        for e in batch:
            row = {"id": e["id"], "class": self.klass, "student": self.student, "type": e["type"],
                   "lessonPath": e["lessonPath"], "unit": e["unit"], "at": server, "payload": e["payload"]}
            self.sink.append(row)
            if self.rng.random() < self.cfg.duplicate_rate:
                self.sink.append(dict(row))


def simulate(cfg: SimConfig, tax: Optional[Taxonomy] = None):
    tax = tax or load()
    rng = random.Random(cfg.seed)
    skills = tax.topo_order
    difficulty: Dict[str, float] = {}
    guess: Dict[str, float] = {}
    for key, item in sorted(tax.items.items()):
        kind = item.kind if item.kind in KIND_DIFFICULTY else "mcq"
        difficulty[key] = KIND_DIFFICULTY.get(item.kind, 0.0) + rng.gauss(0, 0.7)
        guess[key] = KIND_GUESS.get(item.kind, 0.1)
    mcq_difficulty = {}
    for unit_key, ids in sorted(tax.unit_mcqs.items()):
        for q in ids:
            mcq_difficulty[q] = KIND_DIFFICULTY["mcq"] + rng.gauss(0, 0.7)
    skill_slip = {s: rng.uniform(0.03, 0.12) for s in skills}
    skill_offset = {s: rng.gauss(0, 0.6) for s in skills}

    lessons_by_course: Dict[str, List[str]] = {"foundations": [], "data": []}
    for path, order in sorted(tax.lesson_order.items(), key=lambda kv: kv[1]):
        lessons_by_course["foundations" if path.startswith("/units/") else "data"].append(path)
    items_by_lesson: Dict[str, List[str]] = {}
    for key, item in sorted(tax.items.items(), key=lambda kv: kv[1].order):
        if item.lesson_path:
            items_by_lesson.setdefault(item.lesson_path, []).append(key)

    events: List[dict] = []
    truth_attempts: List[dict] = []
    truth_students: Dict[str, dict] = {}
    stats = {"dropped_by_cap": 0, "lost_batches": 0, "dropouts": 0, "students": cfg.students}

    for i in range(cfg.students):
        sid = f"s{i + 1:04d}"
        klass = f"c{i // cfg.class_size + 1:02d}"
        course = "data" if rng.random() < cfg.data_course_share else "foundations"
        ability = rng.gauss(0, 1)
        rate = math.exp(rng.gauss(math.log(0.35), 0.35))
        persistence = rng.uniform(0.45, 0.9)
        forget = rng.uniform(0.02, 0.08)
        loops = rng.random() < cfg.looping_student_share
        m0 = {}
        for s in skills:
            bonus = 1.2 if (course == "data" and s.startswith("py.")) else 0.0
            m0[s] = ability + skill_offset[s] + bonus - 0.3 + rng.gauss(0, 0.5)
        m = dict(m0)
        em = Emitter(rng, cfg, events, sid, klass)
        t = cfg.start_ms + rng.randint(0, 5) * 86_400_000
        recent: List[bool] = []

        bkt = cfg.generator == "bkt"
        # BKT: a skill is either learned or not. Starting state from the same
        # ability draw; each practice flips it with a per-student probability,
        # slowed by unlearned prerequisites. m mirrors the state (+/-2.5) so the
        # rest of the event stream (runs, errors) reads it the same way.
        learned = {s: rng.random() < sigmoid(m0[s] - 1.0) for s in skills} if bkt else None
        if bkt:
            for s in skills:
                m[s] = 2.5 if learned[s] else -2.5
        transit = min(0.6, rate * 0.35) if bkt else 0.0

        def learn(item_skills, amount):
            for s in item_skills:
                pre = tax.prerequisites[s]
                if bkt:
                    if learned[s]:
                        continue
                    factor = sum(1.0 if learned[p] else 0.2 for p in pre) / len(pre) if pre else 1.0
                    if rng.random() < transit * factor * min(1.0, amount / 0.2):
                        learned[s] = True
                        m[s] = 2.5
                    continue
                factor = sum(sigmoid(m[p]) for p in pre) / len(pre) if pre else 1.0
                m[s] += rate * amount * max(0.2, factor)

        def p_correct(item_skills, diff, g, attempt):
            slip = sum(skill_slip[s] for s in item_skills) / len(item_skills)
            if bkt:
                if all(learned[s] for s in item_skills):
                    return max(0.0, 1 - min(0.5, slip + 0.08 * diff))
                return min(0.95, g + 0.05 * math.log1p(attempt - 1))
            mean_m = sum(m[s] for s in item_skills) / len(item_skills)
            return g + (1 - slip - g) * sigmoid(mean_m - diff + 0.4 * math.log1p(attempt - 1))

        def truth_mastery(s):
            return (1.0 if learned[s] else 0.0) if bkt else sigmoid(m[s])

        path_list = lessons_by_course[course]
        if cfg.max_lessons:
            path_list = path_list[: cfg.max_lessons]
        lessons_in_session = 0
        session_len = rng.randint(2, 6)
        dropped = False
        prev_unit = None
        for li, path in enumerate(path_list):
            unit = int(path.split("/unit-")[1].split("/")[0])
            lesson_skills = tax.lesson_skills[path]
            # A new unit starts: the previous unit's end-of-unit test first.
            if prev_unit is not None and unit != prev_unit:
                t = run_test(rng, em, tax, course, prev_unit, p_correct, truth_mastery, mcq_difficulty, learn, t,
                             persistence, truth_attempts, sid)
            prev_unit = unit
            if lessons_in_session >= session_len:
                gap_days = rng.expovariate(1 / 2.0)
                if not bkt:
                    for s in skills:
                        m[s] -= forget * math.log1p(gap_days) * (m[s] - m0[s]) * 0.5
                t += int(gap_days * 86_400_000) + rng.randint(3_600_000, 10 * 3_600_000)
                lessons_in_session, session_len = 0, rng.randint(2, 6)
            lessons_in_session += 1

            em.new_page()
            t += rng.randint(5_000, 40_000)
            em.record(t, "lesson.opened", path, unit, {"lessonPath": path, "unit": unit})
            learn(lesson_skills, 0.12)
            runs = rng.randint(1, 4) + (520 if loops and rng.random() < 0.08 else 0)
            for _ in range(runs):
                t += rng.randint(8_000, 60_000) if runs < 50 else 300
                ok = rng.random() < sigmoid(sum(m[s] for s in lesson_skills) / len(lesson_skills))
                em.record(t, "code.run", path, unit, {"lessonPath": path, "editorId": "practice1", "ok": ok})
                if not ok:
                    pool = ERRORS_LOW if sigmoid(m[lesson_skills[0]]) < 0.5 else ERRORS_HIGH
                    em.record(t, "code.error", path, unit, {"lessonPath": path, "editorId": "practice1",
                                                           "errorType": rng.choice(pool)})
                em.flush_window(t)
            if runs < 50:
                learn(lesson_skills, 0.03 * runs)

            for key in items_by_lesson.get(path, []):
                item = tax.items[key]
                if item.kind == "question" and rng.random() < 0.15:
                    continue                                   # skipped the question
                attempt, reload_offset = 0, 0
                while True:
                    attempt += 1
                    if item.kind == "question" and attempt > 1 and rng.random() < 0.1:
                        reload_offset = attempt - 1            # page reloaded: the counter restarts
                    t += rng.randint(15_000, 90_000)
                    p = p_correct(item.skills, difficulty[key], guess[key], attempt)
                    correct = rng.random() < p
                    truth = {"student": sid, "item": key, "attempt": attempt, "at_client": t, "p": p,
                             "mastery": {s: truth_mastery(s) for s in item.skills}}
                    if item.kind == "question":
                        eid = em.record(t, "check.answered", path, unit,
                                        {"lessonPath": path, "questionId": key.split(":", 1)[1],
                                         "correct": correct, "attempt": attempt - reload_offset})
                    else:
                        ed = key.split("#", 1)[1]
                        total = item.cases
                        if correct:
                            passed = total
                        else:
                            base = sigmoid(sum(m[s] for s in item.skills) / len(item.skills) - difficulty[key] + 0.5)
                            passed = min(total - 1, sum(1 for _ in range(total) if rng.random() < base)) if total > 1 else 0
                        eid = em.record(t, "code.tests_passed", path, unit,
                                        {"lessonPath": path, "editorId": ed, "passed": passed, "total": total})
                        if not correct and rng.random() < 0.6:
                            pool = ERRORS_LOW if sigmoid(m[item.skills[0]]) < 0.5 else ERRORS_HIGH
                            em.record(t, "code.error", path, unit, {"lessonPath": path, "editorId": ed,
                                                                   "errorType": rng.choice(pool)})
                    if eid:
                        truth["event_id"] = eid
                        truth_attempts.append(truth)
                    learn(item.skills, 0.10 if correct else 0.22)
                    recent.append(correct)
                    em.flush_window(t)
                    limit = 3 if item.kind == "question" else 5
                    if correct or attempt >= limit or rng.random() > persistence:
                        break

            fails = recent[-12:].count(False) / max(1, len(recent[-12:]))
            hazard = 0.002 + 0.012 * fails + (0.004 if ability < -1 else 0.0)
            if rng.random() < hazard:
                dropped = True
                stats["dropouts"] += 1
                break
        if not dropped and prev_unit is not None:
            t = run_test(rng, em, tax, course, prev_unit, p_correct, truth_mastery, mcq_difficulty, learn, t,
                         persistence, truth_attempts, sid)
        em.flush()
        stats["dropped_by_cap"] += em.dropped_by_cap
        stats["lost_batches"] += em.lost_batches
        truth_students[sid] = {
            "class": klass, "course": course, "ability": ability, "rate": rate, "persistence": persistence,
            "dropped_out": dropped, "final_mastery": {s: truth_mastery(s) for s in skills},
            "last_at_client": t,
        }
    return events, truth_attempts, truth_students, stats


def run_test(rng, em, tax, course, unit, p_correct, truth_mastery, mcq_difficulty, learn, t, persistence,
             truth_attempts, sid):
    """An end-of-unit test: ten MCQs from the unit's pool and a free response.
    Each MCQ is answered by the same answering model as a lesson question, on the
    unit's skills; only the total reaches the log, as on the real site."""
    pool = tax.unit_mcqs.get((course, unit), [])
    unit_skills = tax.unit_skills[(course, unit)]
    attempt = 0
    while True:
        attempt += 1
        t += rng.randint(60_000, 600_000)
        em.new_page()
        em.record(t, "test.started", "", unit, {"unit": unit})
        picked = rng.sample(pool, min(10, len(pool))) if pool else []
        mcq = sum(1 for q in picked
                  if rng.random() < p_correct(unit_skills, mcq_difficulty[q], KIND_GUESS["mcq"], 1))
        frq = p_correct(unit_skills, KIND_DIFFICULTY["frq"], KIND_GUESS["frq"], 1)
        score = min(100, 7 * mcq + round(30 * frq))
        r = rng.random()
        duration = (rng.randint(15, 110) if r < 0.08 else
                    min(86400, rng.randint(7200, 200_000)) if r < 0.11 else
                    int(rng.lognormvariate(math.log(900), 0.4)))
        t += duration * 1000 if duration < 7200 else rng.randint(600_000, 1_800_000)
        eid = em.record(t, "test.submitted", "", unit, {"unit": unit, "score": score, "total": 100,
                                                        "attempt": attempt, "durationSec": duration})
        if eid:
            truth_attempts.append({"student": sid, "item": f"test:{course}:{unit}", "attempt": attempt,
                                   "at_client": t, "event_id": eid,
                                   "p": None, "mastery": {s: truth_mastery(s) for s in unit_skills}})
        learn(unit_skills, 0.05)
        if score >= CONFIG["pass_mark"] or attempt >= 3 or rng.random() > persistence:
            break
    em.flush()
    return t


def write(out_dir: Path, cfg: SimConfig) -> dict:
    events, truth_attempts, truth_students, stats = simulate(cfg)
    out_dir.mkdir(parents=True, exist_ok=True)
    # An export is not ordered the way things happened; shuffle within a
    # student deterministically, like a query ordered by a random doc id.
    rng = random.Random(cfg.seed + 1)
    rng.shuffle(events)
    with open(out_dir / "events.jsonl", "w") as f:
        for e in events:
            f.write(json.dumps(e, separators=(",", ":")) + "\n")
    with open(out_dir / "truth_attempts.jsonl", "w") as f:
        for r in truth_attempts:
            f.write(json.dumps(r, separators=(",", ":")) + "\n")
    (out_dir / "truth_students.json").write_text(json.dumps(truth_students, separators=(",", ":")))
    meta = {"synthetic": True, "generator": cfg.generator, "config": cfg.__dict__, "stats": stats, "events": len(events),
            "graded_attempts_in_truth": len(truth_attempts)}
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta
