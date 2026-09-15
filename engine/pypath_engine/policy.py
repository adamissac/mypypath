"""What to practise next. Separate from the model on purpose: the model says how
likely a student is to get something right; this decides what to do about it.

  1. Estimate mastery for every skill in scope: the model's p(correct) on a
     typical first-attempt question on that skill, now.
  2. A skill is mastered when, at the last time it was practised, p >= 0.85 and
     it had at least two successes. Time away lowers today's estimate (which
     drives review) without re-locking the skills built on it.
  3. The frontier is every unmastered skill whose in-scope prerequisites are all
     mastered, and which is taught no more than one unit beyond the furthest unit
     the student has attempted in that course (so a prerequisite graph that
     happens to allow unit 9 does not send a unit 2 student there). Nothing past the frontier is ever recommended: a student stuck
     below it is sent to the prerequisite, which is on the frontier.
  4. Mastered skills come back for review on a doubling schedule (3, 6, 12 ...
     up to 60 days, doubling with each success past mastery).
  5. Candidate items are lesson quiz questions and graded exercises on frontier
     or due skills, whose skills all have their prerequisites in place, and
     which were not attempted in the last 24 hours nor answered correctly in the
     last 7 days.
  6. Each is scored by expected learning gain: (1 - mastery) for a frontier
     skill, a fixed review weight for a due one, times how close the item's own
     predicted p(correct) is to the productive band 0.6-0.8.
  7. Highest gain first, at most 2 items per skill and 5 overall; ties broken
     by curriculum order, so the same input always gives the same list. If
     fewer than 3 qualify, the list is topped up past the per-skill cap from
     the same eligible items (a new learner has one skill open, not five).
  8. It never returns nothing. A student with no attempts yet gets curriculum
     order. If the ranking is empty -- everything excluded, say -- it falls back to the earliest frontier skills in
     curriculum order, easiest items first; and if exclusions leave nothing at
     all, it relaxes them rather than return an empty panel.

Every recommendation carries a sentence a student or a teacher can read, built
only from counts and names: never a percentage that could be read as a grade.

Mirrored line for line in assets/js/recommend.js.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional

from . import model_core

DEFAULTS = {
    "max_items": 5,
    "min_items": 3,
    "per_skill_cap": 2,
    "band": [0.6, 0.8],
    "band_width": 0.1,
    "mastered_at": 0.85,
    "mastered_min_successes": 2,
    "recent_exclude_hours": 24,
    "correct_exclude_days": 7,
    "review_base_days": 3,
    "review_max_days": 60,
    "review_weight": 0.6,
}

COURSE_TITLES = {"foundations": "Python Foundations", "data": "Python for Data"}
DAY = 86400000


class _Item:
    __slots__ = ("key", "kind", "skills", "course", "unit", "order", "lesson_path")

    def __init__(self, key, d):
        self.key, self.kind, self.skills = key, d["kind"], tuple(d["skills"])
        self.course, self.unit, self.order, self.lesson_path = d["course"], d["unit"], d["order"], d.get("lesson", "")


class ArtifactTaxonomy:
    """The slice of the taxonomy model_core.replay needs, read from the artifact
    alone -- which is all the browser has."""

    def __init__(self, art: dict):
        self.items = {k: _Item(k, d) for k, d in art["items"].items()}
        self.lesson_skills = {p: tuple(v) for p, v in art["lesson_skills"].items()}
        self.prerequisites = {s: tuple(d["prerequisites"]) for s, d in art["skills"].items()}
        self.skill_order = list(art["skill_order"])
        # Where each skill is first taught: the earliest practice item carrying it.
        self.skill_first: Dict[str, int] = {}
        self.skill_unit: Dict[str, int] = {}
        for it in self.items.values():
            if it.kind not in ("question", "exercise"):
                continue
            for s in it.skills:
                if s not in self.skill_first or it.order < self.skill_first[s]:
                    self.skill_first[s] = it.order
                    self.skill_unit[s] = it.unit


def local_to_events(storage: Dict[str, str]) -> List[dict]:
    """A guest's localStorage, as the events the site would have logged.

    Lossy, and deliberately so: local storage keeps the best check result per
    exercise and the last result per unit test, not the attempts in between.
    """
    import json

    out: List[dict] = []
    for key in sorted(storage):
        raw = storage[key]
        try:
            value = json.loads(raw) if isinstance(raw, str) else raw
        except ValueError:
            continue
        if not isinstance(value, dict):
            continue
        if key.startswith("pypath-checks-"):
            path = key[len("pypath-checks-"):]
            for ed in sorted(value):
                r = value[ed]
                if not isinstance(r, dict):
                    continue
                out.append({"type": "code.tests_passed", "at": int(model_core._num(r.get("at"))), "lessonPath": path,
                            "payload": {"lessonPath": path, "editorId": ed,
                                        "passed": int(model_core._num(r.get("passed"))),
                                        "total": int(model_core._num(r.get("total")))}})
        elif key == "pypath-unit-tests":
            for rk in sorted(value):
                r = value[rk]
                if not isinstance(r, dict):
                    continue
                course, _, unit = ("data", "-", rk[5:]) if rk.startswith("data-") else ("foundations", "", rk)
                if not unit.isdigit():
                    continue
                last = r.get("last") or {}
                out.append({"type": "test.submitted", "course": course,
                            "at": int(model_core._num(last.get("at") or r.get("lastAt"))), "lessonPath": "",
                            "payload": {"unit": int(unit), "score": int(model_core._num(last.get("score"))), "total": 100,
                                        "attempt": int(model_core._num(r.get("attempts"))) or 1,
                                        "durationSec": int(model_core._num(last.get("durationSec")))}})
        elif key == "pypath-progress-lessons":
            for path in sorted(value):
                out.append({"type": "lesson.opened", "at": 0, "lessonPath": path, "payload": {"lessonPath": path}})
    return out


def _band_weight(p: float, o: dict) -> float:
    lo, hi = o["band"]
    if lo <= p <= hi:
        return 1.0
    d = (lo - p) if p < lo else (p - hi)
    x = d / o["band_width"]
    return math.exp(-(x * x))   # x * x, not ** 2: JS must round it identically


def skill_status(art: dict, events: List[dict], now: int, courses: Optional[List[str]] = None,
                 options: Optional[dict] = None, tax: Optional[ArtifactTaxonomy] = None) -> dict:
    """Per-skill mastery, the mastered flag, the frontier and the skills due for
    review -- the facts the ranking is built on, exposed so they can be tested
    and shown on their own."""
    o = dict(art.get("policy") or DEFAULTS)
    if options:
        o.update(options)
    tax = tax or ArtifactTaxonomy(art)
    state = model_core.replay(events, tax)
    if not courses:
        seen = []
        for e in sorted(events, key=model_core.event_sort_key):
            c = e.get("course") or model_core.course_of_path((e.get("payload") or {}).get("lessonPath") or e.get("lessonPath") or "")
            if c and c not in seen:
                seen.append(c)
        courses = seen or ["foundations"]
    scope = set(courses)
    skills_meta = art["skills"]
    in_scope = [s for s in tax.skill_order if skills_meta[s]["course"] in scope]
    mastery: Dict[str, float] = {}
    mastered: Dict[str, bool] = {}
    for s in in_scope:
        mastery[s] = model_core.mastery(art["model"], state, s, now, tax.prerequisites)
        st = state.skills.get(s)
        # Mastered is judged at the moment it was last shown, not now: time away
        # makes the model less sure (that is what brings a skill back for
        # review) but must not re-lock everything built on it.
        if st is not None and st.last_at and st.succ >= o["mastered_min_successes"]:
            mastered[s] = model_core.mastery(art["model"], state, s, st.last_at, tax.prerequisites) >= o["mastered_at"]
        else:
            mastered[s] = False

    def prereq_ok(s: str) -> bool:
        return all(mastered.get(p, False) for p in tax.prerequisites[s] if skills_meta[p]["course"] in scope)

    reach: Dict[str, int] = {}
    for key in state.item_attempts:
        it = tax.items.get(key)
        if it is not None and it.unit > reach.get(it.course, 0):
            reach[it.course] = it.unit

    def within_reach(s: str) -> bool:
        return tax.skill_unit.get(s, 1) <= reach.get(skills_meta[s]["course"], 1) + 1

    frontier = [s for s in in_scope if not mastered[s] and prereq_ok(s) and within_reach(s)]
    due: Dict[str, int] = {}
    for s in in_scope:
        st = state.skills.get(s)
        if mastered[s] and st is not None and st.last_at:
            extra = max(0, st.succ - o["mastered_min_successes"])
            interval = min(o["review_max_days"], o["review_base_days"] * (2 ** min(extra, 10)))
            days = (now - st.last_at) // DAY
            if days >= interval:
                due[s] = int(days)
    return {"o": o, "tax": tax, "state": state, "courses": courses, "scope": scope, "in_scope": in_scope,
            "mastery": mastery, "mastered": mastered, "prereq_ok": prereq_ok, "frontier": frontier, "due": due,
            "reach": reach}


def recommend(art: dict, events: List[dict], now: int, courses: Optional[List[str]] = None,
              options: Optional[dict] = None, tax: Optional[ArtifactTaxonomy] = None) -> List[dict]:
    st_ = skill_status(art, events, now, courses, options, tax)
    o, tax, state, courses, scope = st_["o"], st_["tax"], st_["state"], st_["courses"], st_["scope"]
    in_scope, mastery, prereq_ok, frontier, due = st_["in_scope"], st_["mastery"], st_["prereq_ok"], st_["frontier"], st_["due"]
    skills_meta = art["skills"]
    model = art["model"]
    frontier_set = set(frontier)

    def excluded(key: str) -> bool:
        last = state.item_last.get(key)
        if last is None:
            return False
        at, correct = last
        if now - at < o["recent_exclude_hours"] * 3600000:
            return True
        return correct and now - at < o["correct_exclude_days"] * DAY

    practice = sorted((it for it in tax.items.values()
                       if it.kind in ("question", "exercise") and it.course in scope
                       and all(skills_meta[s]["course"] in scope for s in it.skills)),
                      key=lambda it: (it.order, it.key))

    def p_item(it) -> float:
        attempt_index = state.item_attempts.get(it.key, 0) + 1
        g, per = model_core.features(state, it.key, it.kind, it.skills, (it.course, it.unit), now, attempt_index,
                                     tax.prerequisites)
        return model_core.score(model, g, per, it.key)

    scored = []
    for it in practice:
        if not all(prereq_ok(s) for s in it.skills) or excluded(it.key):
            continue
        target = next((s for s in it.skills if s in frontier_set), None)
        code = "frontier"
        if target is None:
            target = next((s for s in it.skills if s in due), None)
            code = "review"
        if target is None:
            continue
        p = p_item(it)
        gain = (1.0 - mastery[target]) * _band_weight(p, o) if code == "frontier" else o["review_weight"] * _band_weight(p, o)
        scored.append((-gain, it.order, it.key, it, target, p, gain, code))
    scored.sort(key=lambda r: (r[0], r[1], r[2]))

    picked: List[dict] = []
    per_skill: Dict[str, int] = {}

    def take(it, target, p, gain, code) -> None:
        per_skill[target] = per_skill.get(target, 0) + 1
        picked.append({"item": it.key, "kind": it.kind, "lesson": it.lesson_path, "skill": target,
                       "skill_name": skills_meta[target]["name"], "p": p, "gain": gain, "reason_code": code,
                       "reason": _reason(code, target, it, state, skills_meta, tax, now, due, courses)})

    # No attempts at all: nothing to rank on, so curriculum order decides.
    if not state.item_attempts:
        scored = []
    for _, _, _, it, target, p, gain, code in scored:
        if len(picked) >= o["max_items"]:
            break
        if per_skill.get(target, 0) >= o["per_skill_cap"]:
            continue
        take(it, target, p, gain, code)

    if picked and len(picked) < o["min_items"]:
        taken = {r["item"] for r in picked}
        for _, _, _, it, target, p, gain, code in scored:
            if len(picked) >= o["min_items"]:
                break
            if it.key not in taken:
                take(it, target, p, gain, code)
                taken.add(it.key)

    if not picked:
        # Cold start, or nothing ranked: curriculum order over the frontier (or,
        # if everything is mastered, over everything in scope), easiest first.
        pool_skills = sorted(frontier or in_scope, key=lambda s: (tax.skill_first.get(s, 10 ** 9), tax.skill_order.index(s)))
        for relax in (False, True):
            for s in pool_skills:
                items = [it for it in practice if it.skills[0] == s and all(prereq_ok(x) for x in it.skills)
                         and (relax or not excluded(it.key))]
                items.sort(key=lambda it: (-model["items"].get(it.key, 0.0), it.order, it.key))
                for it in items[: o["per_skill_cap"]]:
                    if len(picked) >= o["max_items"]:
                        break
                    take(it, s, p_item(it), 0.0, "relaxed" if relax else "start")
                if len(picked) >= o["max_items"]:
                    break
            if picked:
                break
    if picked and len(picked) < o["min_items"] and all(r["reason_code"] in ("start", "relaxed") for r in picked):
        taken = {r["item"] for r in picked}
        relaxed = picked[0]["reason_code"] == "relaxed"
        pool_skills = sorted(frontier or in_scope, key=lambda s: (tax.skill_first.get(s, 10 ** 9), tax.skill_order.index(s)))
        for s in pool_skills:
            items = [it for it in practice if it.skills[0] == s and all(prereq_ok(x) for x in it.skills)
                     and it.key not in taken and (relaxed or not excluded(it.key))]
            items.sort(key=lambda it: (-model["items"].get(it.key, 0.0), it.order, it.key))
            for it in items:
                if len(picked) >= o["min_items"]:
                    break
                take(it, s, p_item(it), 0.0, "relaxed" if relaxed else "start")
                taken.add(it.key)
            if len(picked) >= o["min_items"]:
                break
    if not picked and practice:
        it = practice[0]
        take(it, it.skills[0], p_item(it), 0.0, "relaxed")
    return picked


def _reason(code, skill, it, state, skills_meta, tax, now, due, courses) -> str:
    name = skills_meta[skill]["name"]
    kind = "exercise" if it.kind == "exercise" else "question"
    st = state.skills.get(skill)
    if code == "review":
        days = due.get(skill, 0)
        return f"Review {name}: you last practised it {days} day{'s' if days != 1 else ''} ago, and a quick {kind} keeps it from fading."
    if code in ("start", "relaxed"):
        course = COURSE_TITLES.get(it.course, it.course)
        if st is None or (st.succ + st.fail) == 0:
            return f"Start here: {name} is an early step in {course}, and this is one of its gentler {kind}s."
        return f"Keep going with {name}: it is the next step in {course} you have not yet got secure."
    # frontier
    blocked = None
    latest = -1
    for other, ost in state.skills.items():
        if skill in tax.prerequisites.get(other, ()) and (ost.succ + ost.fail) > 0 and ost.last_at > latest:
            blocked, latest = other, ost.last_at
    if blocked is not None:
        return (f"{name} comes first: {skills_meta[blocked]['name']}, which you have been working on, builds on it, "
                f"and your {name} work so far is {st.succ if st else 0} right, {st.fail if st else 0} not yet.")
    if st is None or (st.succ + st.fail) == 0:
        return f"{name} is next: everything it builds on is in place, and you have not practised it yet."
    return (f"{name}: {st.succ} right and {st.fail} not yet so far, and what it builds on is in place, "
            f"so this {kind} is a good next stretch.")
