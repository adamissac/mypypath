#!/usr/bin/env python3
"""Verify local href/src paths in static HTML resolve to files in the repo."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", "node_modules", "src-tauri", "desktop-dist"}
SKIP_PREFIXES = ("http://", "https://", "//", "mailto:", "tel:", "#", "javascript:")
ATTR_RE = re.compile(r"""(?:href|src)=["']([^"']+)["']""", re.IGNORECASE)


def local_targets(html_path: Path) -> list[str]:
    text = html_path.read_text(encoding="utf-8", errors="ignore")
    return [m.group(1) for m in ATTR_RE.finditer(text)]


def resolve(target: str, html_path: Path) -> Path | None:
    if not target or target.startswith(SKIP_PREFIXES):
        return None
    # A cache-buster or fragment is not part of the path on disk.
    target = target.split("?", 1)[0].split("#", 1)[0]
    if not target:
        return None
    if target.startswith("/"):
        return ROOT / target.lstrip("/")
    return (html_path.parent / target).resolve()


def main() -> int:
    errors: list[str] = []
    for html in sorted(ROOT.rglob("*.html")):
        if any(p in SKIP_DIRS for p in html.parts):
            continue
        if ".git" in html.parts:
            continue
        for target in local_targets(html):
            resolved = resolve(target, html)
            if resolved is None:
                continue
            if not resolved.exists():
                rel = html.relative_to(ROOT)
                errors.append(f"{rel}: missing {target}")
    if errors:
        print("Broken local links:\n" + "\n".join(errors), file=sys.stderr)
        return 1
    print(f"OK — checked HTML under {ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
