"""The reference implementation of everything the browser has to reproduce.

Event ordering, events -> attempts, the feature state, the logistic score and the
per-skill mastery estimate all live here, in plain Python floats with no numpy,
so that assets/js/recommend.js can mirror it operation for operation. The
training pipeline builds its rows with these same functions, so what is
evaluated is what ships.

If you change anything in this file, change recommend.js the same way and
regenerate the parity fixtures (`python -m pypath_engine fixtures`); the pytest
and vitest parity suites fail otherwise, which is the point.
"""
from __future__ import annotations

import math
from typing import Dict, Iterable, List, Optional, Tuple

# --------------------------------------------------------------------- config
# Shipped inside the artifact, so the browser reads the same numbers.
CONFIG = {
    "decay_days": 7.0,               # time constant of the recency-weighted outcome sums
    "pass_mark": 70,                 # test.submitted score out of 100 that counts as a pass
    "quiz_pass_fraction": 0.7,
    "duration": {"rushed_below": 120, "long_above": 1800, "outlier_at_or_above": 7200},
    "error_groups": {
        "syntax": ["SyntaxError", "IndentationError", "TabError"],
        "name": ["NameError", "UnboundLocalError", "AttributeError", "ImportError", "ModuleNotFoundError"],
        "type": ["TypeError", "ValueError", "KeyError", "IndexError", "ZeroDivisionError"],
    },
}

# Within one flush every event shares a server timestamp (classroom-store.js
# writes serverTimestamp() for the whole batch), so the order inside a batch is
# rebuilt from what an event is. Exposure before practice before assessment.
TYPE_RANK = {
    "lesson.opened": 0, "code.run": 1, "code.error": 2, "answer.submitted": 3,
    "code.tests_passed": 4, "check.answered": 5, "test.started": 6,
    "test.submitted": 7, "quiz.submitted": 8, "unit.completed": 9,
}

GLOBAL_FEATURES = [
    "attempt_log", "is_retry",
    "decay_succ", "decay_fail", "days_since_log", "no_history",
    "partial_rate", "has_partial",
    "err_syntax", "err_name", "err_type", "err_other",
    "exposure_log", "prereq_min",
    "dur_rushed", "dur_long", "dur_outlier",
    "kind_exercise", "kind_test", "kind_quiz",
]
KINDS = ("question", "exercise", "test", "quiz")
SKILL_TERMS = ("beta", "succ", "fail")      # per-skill intercept, log1p(successes), log1p(failures)


def _num(x, default=0):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return default
    return v if math.isfinite(v) else default


def event_sort_key(e: dict) -> tuple:
    p = e.get("payload") or {}
    return (
        int(_num(e.get("at"))),
        TYPE_RANK.get(e.get("type"), 99),
        int(_num(p.get("attempt"))),
        int(_num(p.get("passed"))),
        str(e.get("lessonPath") or ""),
        str(e.get("id") or ""),
    )


def course_of_path(path: str) -> Optional[str]:
    if path.startswith("/units/"):
        return "foundations"
    if path.startswith("/data/"):
        return "data"
    return None


def duration_bucket(seconds: float) -> str:
    d = CONFIG["duration"]
    s = _num(seconds)
    if s <= 0:
        return "missing"
    if s >= d["outlier_at_or_above"]:
        return "outlier"
    if s < d["rushed_below"]:
        return "rushed"
    if s > d["long_above"]:
        return "long"
    return "normal"


def error_group(name: str) -> str:
    for group, names in CONFIG["error_groups"].items():
        if name in names:
            return group
    return "other"


def resolve_attempt(e: dict, current_course: Optional[str]) -> Optional[Tuple[str, bool, Optional[float]]]:
    """(item key, correct, partial) for an assessment event, else None."""
    t, p = e.get("type"), (e.get("payload") or {})
    if t == "check.answered":
        qid = p.get("questionId")
        return (f"question:{qid}", p.get("correct") is True, None) if qid else None
    if t == "code.tests_passed":
        path, ed = p.get("lessonPath") or e.get("lessonPath"), p.get("editorId")
        total, passed = int(_num(p.get("total"))), int(_num(p.get("passed")))
        if not path or not ed or total <= 0:
            return None
        return (f"exercise:{path}#{ed}", passed >= total, passed / total)
    if t in ("test.submitted", "quiz.submitted"):
        unit = int(_num(p.get("unit")))
        if unit < 1:
            return None
        # The log has no course for a test; take the student's current one. A
        # synthetic event built from local storage knows it and says so.
        course = e.get("course") or current_course or "foundations"
        kind = "test" if t == "test.submitted" else "quiz"
        if kind == "quiz" and int(_num(p.get("total"))) > 0:
            ok = int(_num(p.get("correct"))) / int(_num(p.get("total"))) >= CONFIG["quiz_pass_fraction"]
        else:
            ok = _num(p.get("score")) >= CONFIG["pass_mark"]
        return (f"{kind}:{course}:{unit}", ok, None)
    return None


# ---------------------------------------------------------------------- state
class SkillState:
    __slots__ = ("succ", "fail", "dsucc", "dfail", "dat", "last_at", "psum", "pn",
                 "err_syntax", "err_name", "err_type", "err_other", "exposure")

    def __init__(self) -> None:
        self.succ = 0
        self.fail = 0
        self.dsucc = 0.0
        self.dfail = 0.0
        self.dat = 0
        self.last_at = 0
        self.psum = 0.0
        self.pn = 0
        self.err_syntax = 0
        self.err_name = 0
        self.err_type = 0
        self.err_other = 0
        self.exposure = 0

    def decayed(self, at: int) -> Tuple[float, float]:
        if self.dat == 0:
            return 0.0, 0.0
        f = math.exp(-((at - self.dat) / 86400000.0) / CONFIG["decay_days"])
        return self.dsucc * f, self.dfail * f


class StudentState:
    """Everything known about one student after some prefix of their events."""

    def __init__(self) -> None:
        self.skills: Dict[str, SkillState] = {}
        self.item_attempts: Dict[str, int] = {}
        self.item_last: Dict[str, Tuple[int, bool]] = {}
        self.unit_duration: Dict[Tuple[str, int], str] = {}
        self.course: Optional[str] = None

    def skill(self, s: str) -> SkillState:
        st = self.skills.get(s)
        if st is None:
            st = self.skills[s] = SkillState()
        return st


def laplace(st: Optional[SkillState]) -> float:
    if st is None:
        return 0.5
    return (st.succ + 1.0) / (st.succ + st.fail + 2.0)


def features(state: StudentState, item_key: str, kind: str, skills: Tuple[str, ...], unit_key: Optional[Tuple[str, int]],
             at: int, attempt_index: int, prereqs: Dict[str, Tuple[str, ...]]) -> Tuple[Dict[str, float], List[Tuple[str, float, float]]]:
    """Features for predicting an attempt at `at`, from what happened before it.

    Returns (global features, per-skill terms). Per-skill terms are
    (skill, log1p(successes), log1p(failures)); the caller divides by the number
    of skills so a two-skill item is not counted twice.
    """
    m = float(len(skills))
    g = {name: 0.0 for name in GLOBAL_FEATURES}
    g["attempt_log"] = math.log1p(attempt_index - 1)
    g["is_retry"] = 1.0 if attempt_index > 1 else 0.0
    any_history = False
    per_skill = []
    partial_sum, partial_n = 0.0, 0
    for s in skills:
        st = state.skills.get(s)
        if st is None:
            per_skill.append((s, 0.0, 0.0))
        else:
            ds, df = st.decayed(at)
            g["decay_succ"] += ds / m
            g["decay_fail"] += df / m
            if st.last_at:
                any_history = True
                g["days_since_log"] += math.log1p(max(0.0, (at - st.last_at) / 86400000.0)) / m
            if st.pn:
                partial_sum += st.psum / st.pn
                partial_n += 1
            g["err_syntax"] += math.log1p(st.err_syntax) / m
            g["err_name"] += math.log1p(st.err_name) / m
            g["err_type"] += math.log1p(st.err_type) / m
            g["err_other"] += math.log1p(st.err_other) / m
            g["exposure_log"] += math.log1p(st.exposure) / m
            per_skill.append((s, math.log1p(st.succ), math.log1p(st.fail)))
        pre = prereqs.get(s, ())
        if pre:
            g["prereq_min"] += min(laplace(state.skills.get(p)) for p in pre) / m
        else:
            g["prereq_min"] += 1.0 / m
    g["no_history"] = 0.0 if any_history else 1.0
    if partial_n:
        g["partial_rate"] = partial_sum / partial_n
        g["has_partial"] = 1.0
    bucket = state.unit_duration.get(unit_key) if unit_key else None
    if bucket == "rushed":
        g["dur_rushed"] = 1.0
    elif bucket == "long":
        g["dur_long"] = 1.0
    elif bucket == "outlier":
        g["dur_outlier"] = 1.0
    if kind in ("exercise", "test", "quiz"):
        g["kind_" + kind] = 1.0
    return g, per_skill


def update_attempt(state: StudentState, item_key: str, skills: Tuple[str, ...], at: int, correct: bool,
                   partial: Optional[float]) -> None:
    state.item_attempts[item_key] = state.item_attempts.get(item_key, 0) + 1
    state.item_last[item_key] = (at, correct)
    for s in skills:
        st = state.skill(s)
        ds, df = st.decayed(at)
        st.dsucc = ds + (1.0 if correct else 0.0)
        st.dfail = df + (0.0 if correct else 1.0)
        st.dat = at
        st.last_at = at
        if correct:
            st.succ += 1
        else:
            st.fail += 1
        if partial is not None:
            st.psum += partial
            st.pn += 1


def score(model: dict, g: Dict[str, float], per_skill: List[Tuple[str, float, float]], item_key: Optional[str]) -> float:
    """p(correct) under the frozen logistic model."""
    z = model["intercept"]
    w = model["global"]
    for name in GLOBAL_FEATURES:
        z += w[name] * g[name]
    m = float(len(per_skill))
    sk = model["skills"]
    for s, ls, lf in per_skill:
        c = sk.get(s)
        if c is not None:
            z += (c[0] + c[1] * ls + c[2] * lf) / m
    if item_key is not None:
        z += model["items"].get(item_key, 0.0)
    return 1.0 / (1.0 + math.exp(-z))


def replay(events: Iterable[dict], tax, on_attempt=None, state: Optional[StudentState] = None) -> StudentState:
    """Runs one student's events through the state machine in canonical order.

    `tax` needs .items (key -> Item), .lesson_skills (path -> skills) and
    .prerequisites. `on_attempt(item, at, attempt_index, g, per_skill, correct,
    partial, event)` is called for every assessment event before the state
    absorbs it -- which is exactly the row a model is trained to predict.
    Pass `state` to continue from, or inspect, a state the caller holds.
    """
    state = state if state is not None else StudentState()
    for e in sorted(events, key=event_sort_key):
        t = e.get("type")
        at = int(_num(e.get("at")))
        p = e.get("payload") or {}
        path = p.get("lessonPath") or e.get("lessonPath") or ""
        c = course_of_path(path) if path else None
        if c:
            state.course = c
        if t in ("lesson.opened", "code.run", "answer.submitted"):
            for s in tax.lesson_skills.get(path, ()):
                state.skill(s).exposure += 1
            continue
        if t == "code.error":
            group = error_group(str(p.get("errorType") or ""))
            for s in tax.lesson_skills.get(path, ()):
                st = state.skill(s)
                setattr(st, "err_" + group, getattr(st, "err_" + group) + 1)
            continue
        resolved = resolve_attempt(e, state.course)
        if resolved is None:
            continue
        key, correct, partial = resolved
        item = tax.items.get(key)
        if item is None:
            continue
        attempt_index = state.item_attempts.get(key, 0) + 1
        unit_key = (item.course, item.unit)
        if on_attempt is not None:
            g, per_skill = features(state, key, item.kind, item.skills, unit_key, at, attempt_index, tax.prerequisites)
            on_attempt(item, at, attempt_index, g, per_skill, correct, partial, e)
        update_attempt(state, key, item.skills, at, correct, partial)
        if t == "test.submitted":
            state.unit_duration[unit_key] = duration_bucket(p.get("durationSec"))
    return state


def mastery(model: dict, state: StudentState, skill: str, at: int, prereqs) -> float:
    """p(correct) on a typical, first-attempt lesson question on one skill, now.

    The per-skill number the recommender works from. It is a prediction about
    the next question, not a measurement of the student."""
    g, per_skill = features(state, "", "question", (skill,), None, at, 1, prereqs)
    return score(model, g, per_skill, None)
