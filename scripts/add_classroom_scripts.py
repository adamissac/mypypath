#!/usr/bin/env python3
"""Add the classroom script tags to every page that already syncs progress.

Idempotent: run it again after adding a page and only the new page changes.
There is no build step in this project -- pages ship exactly as they are on
disk -- so script tags are maintained by scripts like this one rather than by
a bundler. Matches the approach in bake_layout.py.

Ordering matters and is why this is a script rather than a search and replace:

  schema-version.js and events.js are plain globals and must be parsed before
  lesson-runner.js and exercises.js call into them. They go with the other
  defer'd globals, right after storage-keys.js.

  event-sink.js is an ES module that imports auth.js, so it goes with the
  other modules, after sync.js.

Usage: python3 scripts/add_classroom_scripts.py [--check]
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ANCHOR_GLOBAL = '<script defer src="/assets/js/storage-keys.js"></script>'
ANCHOR_MODULE = '<script type="module" src="/assets/js/sync.js"></script>'

NEW_GLOBALS = [
    '<script defer src="/assets/js/schema-version.js"></script>',
    '<script defer src="/assets/js/events.js"></script>',
]
NEW_MODULE = '<script type="module" src="/assets/js/event-sink.js"></script>'

SKIP_DIRS = {"node_modules", ".git", "REVIEW", "lesson-format-kit", "docs"}


def pages():
    for path in sorted(ROOT.rglob("*.html")):
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        yield path


def indent_of(html: str, anchor: str) -> str:
    line_start = html.rfind("\n", 0, html.index(anchor)) + 1
    return html[line_start : html.index(anchor)]


def patch(html: str) -> str:
    if ANCHOR_GLOBAL not in html:
        return html

    if NEW_GLOBALS[0] not in html:
        pad = indent_of(html, ANCHOR_GLOBAL)
        block = ANCHOR_GLOBAL + "".join("\n" + pad + tag for tag in NEW_GLOBALS)
        html = html.replace(ANCHOR_GLOBAL, block, 1)

    if NEW_MODULE not in html and ANCHOR_MODULE in html:
        pad = indent_of(html, ANCHOR_MODULE)
        html = html.replace(ANCHOR_MODULE, ANCHOR_MODULE + "\n" + pad + NEW_MODULE, 1)

    return html


def main() -> None:
    check_only = "--check" in sys.argv
    changed = []
    for path in pages():
        original = path.read_text(encoding="utf-8")
        updated = patch(original)
        if updated != original:
            changed.append(path.relative_to(ROOT))
            if not check_only:
                path.write_text(updated, encoding="utf-8")

    if check_only and changed:
        print(f"{len(changed)} page(s) are missing classroom script tags:")
        for p in changed[:10]:
            print(f"  {p}")
        raise SystemExit(1)

    print(f"{'Would update' if check_only else 'Updated'} {len(changed)} page(s)")


if __name__ == "__main__":
    main()
