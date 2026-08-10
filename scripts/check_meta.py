#!/usr/bin/env python3
"""Ensure public HTML pages expose a meta description for SEO."""
from __future__ import annotations
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
META_RE = re.compile(r'<meta\s+name=["\']description["\']\s+content=["\'][^"\']+["\']', re.I)
# Redirect stubs carry a canonical to their real target and are never indexed
# on their own, so a description on them would be pointless.
REDIRECT_RE = re.compile(r'<meta\s+http-equiv=["\']refresh["\']', re.I)
SKIP = {".git", "lesson-format-kit"}

def main() -> int:
    missing = []
    for html in sorted(ROOT.rglob("*.html")):
        if any(p in SKIP for p in html.parts):
            continue
        text = html.read_text(encoding="utf-8", errors="ignore")
        if REDIRECT_RE.search(text):
            continue
        if not META_RE.search(text):
            missing.append(str(html.relative_to(ROOT)))
    if missing:
        print("Pages missing meta description:\n" + "\n".join(missing), file=sys.stderr)
        return 1
    print("OK - meta descriptions present")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())