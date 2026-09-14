"""A cycle finder shared by the engine's tests (the site has its own in
scripts/validate-skills.mjs; both must agree that the prerequisite graph is a DAG)."""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional


def find_cycle(edges: Dict[str, Iterable[str]]) -> Optional[List[str]]:
    state: Dict[str, int] = {}
    stack: List[str] = []

    def visit(n: str) -> Optional[List[str]]:
        state[n] = 1
        stack.append(n)
        for m in edges.get(n, ()):
            if state.get(m) == 1:
                return stack[stack.index(m):] + [m]
            if not state.get(m):
                c = visit(m)
                if c:
                    return c
        state[n] = 2
        stack.pop()
        return None

    for n in edges:
        if not state.get(n):
            c = visit(n)
            if c:
                return c
    return None
