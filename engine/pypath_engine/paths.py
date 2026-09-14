"""Where things live. Everything is resolved from the repository root, so the
CLI works from any directory."""
from __future__ import annotations

from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]
REPO = ENGINE.parent
DATA = ENGINE / "data"              # generated, git-ignored
REPORTS = ENGINE / "reports"        # committed figures
SKILLS_JSON = REPO / "assets" / "data" / "skills.json"
ARTIFACT = REPO / "assets" / "data" / "model" / "mastery-v1.json"
FIXTURES = REPO / "tests" / "fixtures" / "adaptive"
