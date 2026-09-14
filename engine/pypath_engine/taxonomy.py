"""The skill taxonomy and the item universe, read from the site's own files.

Item keys match assets/data/skills.json:

    lesson:<path>                 exposure only (opened, code run)
    question:<id>                 lesson quiz question  -> check.answered
    exercise:<path>#exerciseN     graded exercise       -> code.tests_passed
    mcq:<id>, frq:<id>            end-of-unit items; tagged, but the event log
                                  records only the test total, so no attempt row
                                  can ever carry one of these ids
    test:<course>:<unit>          end-of-unit test      -> test.submitted
    quiz:<course>:<unit>          teacher-assigned quiz -> quiz.submitted

The last two are not in skills.json: the log reports a whole test, so the engine
treats a test as one item tagged with every skill its unit teaches.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from . import paths


@dataclass(frozen=True)
class Item:
    key: str
    kind: str                      # question | exercise | test | quiz
    skills: Tuple[str, ...]
    course: str                    # foundations | data
    unit: int
    order: int                     # curriculum position, for cold start and tie-breaks
    lesson_path: str = ""
    cases: int = 0                 # graded cases in an exercise spec


@dataclass
class Taxonomy:
    skills: Dict[str, dict]
    prerequisites: Dict[str, Tuple[str, ...]]
    topo_order: List[str]
    items: Dict[str, Item]
    lesson_skills: Dict[str, Tuple[str, ...]]
    unit_skills: Dict[Tuple[str, int], Tuple[str, ...]]
    unit_mcqs: Dict[Tuple[str, int], List[str]]
    hash: str
    lesson_order: Dict[str, int] = field(default_factory=dict)

    def course_of_path(self, path: str) -> Optional[str]:
        if path.startswith("/units/"):
            return "foundations"
        if path.startswith("/data/"):
            return "data"
        return None

    def practice_items(self) -> List[Item]:
        """What a student can actually be sent to: lesson quiz questions and
        graded exercises. End-of-unit questions cannot be served one at a time."""
        return [i for i in self.items.values() if i.kind in ("question", "exercise")]


def _topo(prereqs: Dict[str, Tuple[str, ...]], order_hint: List[str]) -> List[str]:
    seen, out = set(), []

    def visit(s: str, stack: Tuple[str, ...] = ()) -> None:
        if s in stack:
            raise ValueError("prerequisite cycle: " + " -> ".join(stack + (s,)))
        if s in seen:
            return
        for p in prereqs[s]:
            visit(p, stack + (s,))
        seen.add(s)
        out.append(s)

    for s in order_hint:
        visit(s)
    return out


@lru_cache(maxsize=4)
def load(skills_path: str = str(paths.SKILLS_JSON)) -> Taxonomy:
    repo = Path(skills_path).resolve().parents[2]
    doc = json.loads(Path(skills_path).read_text())
    skills = {s["id"]: s for s in doc["skills"]}
    prereqs = {s["id"]: tuple(s["prerequisites"]) for s in doc["skills"]}
    tags = doc["items"]

    items: Dict[str, Item] = {}
    lesson_skills: Dict[str, Tuple[str, ...]] = {}
    unit_skills: Dict[Tuple[str, int], List[str]] = {}
    unit_mcqs: Dict[Tuple[str, int], List[str]] = {}
    lesson_order: Dict[str, int] = {}
    order = 0
    course_files = [
        ("foundations", "assets/data/curriculum.json", "assets/data/checks", "assets/data/unit-tests"),
        ("data", "assets/data/curriculum-data.json", "assets/data/checks/data", "assets/data/unit-tests/data"),
    ]
    for course, manifest, checks, tests in course_files:
        lessons = json.loads((repo / manifest).read_text())["lessons"]
        units = []
        for lesson in lessons:
            path, unit = lesson["path"], int(lesson["unit"])
            if unit not in units:
                units.append(unit)
            ls = tuple(tags[f"lesson:{path}"])
            lesson_skills[path] = ls
            lesson_order[path] = order
            bucket = unit_skills.setdefault((course, unit), [])
            bucket.extend(s for s in ls if s not in bucket)
            spec = json.loads((repo / checks / f"unit-{unit}" / f"{lesson['slug']}.json").read_text())
            for q in spec.get("questions", []):
                order += 1
                key = f"question:{q['id']}"
                items[key] = Item(key, "question", tuple(tags[key]), course, unit, order, path)
            for ex in sorted(k for k in spec if k.startswith("exercise") and k[8:].isdigit()):
                order += 1
                key = f"exercise:{path}#{ex}"
                cases = len(spec[ex].get("cases", [])) + len(spec[ex].get("hiddenCases", []))
                items[key] = Item(key, "exercise", tuple(tags[key]), course, unit, order, path, max(cases, 1))
        for unit in units:
            order += 1
            us = tuple(unit_skills[(course, unit)])
            for kind in ("test", "quiz"):
                key = f"{kind}:{course}:{unit}"
                items[key] = Item(key, kind, us, course, unit, order)
            mcq_file = repo / tests / f"unit-{unit}-mcq.json"
            if mcq_file.exists():
                unit_mcqs[(course, unit)] = [q["id"] for q in json.loads(mcq_file.read_text())]

    return Taxonomy(
        skills=skills,
        prerequisites=prereqs,
        topo_order=_topo(prereqs, [s["id"] for s in doc["skills"]]),
        items=items,
        lesson_skills=lesson_skills,
        unit_skills={k: tuple(v) for k, v in unit_skills.items()},
        unit_mcqs=unit_mcqs,
        hash=doc["hash"],
        lesson_order=lesson_order,
    )
