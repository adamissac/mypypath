#!/usr/bin/env python3
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://www.mypypath.com"
OUT = ROOT / "sitemap.xml"
# Directories that are not part of the deployed site. node_modules is the
# important one: it is gitignored, never deploys, and rglob happily walked it
# into the sitemap once dev dependencies were installed.
SKIP_DIRS = {".git", "node_modules", "lesson-format-kit", "REVIEW", "docs", "tests"}
# A 404 page must never be advertised for indexing, and the staff dashboard
# is not public content.
SKIP_FILES = {"404.html", "admin.html", "classroom.html"}

def page_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return f"{BASE_URL}/" if rel == "index.html" else f"{BASE_URL}/{rel}"

def main() -> None:
    pages = []
    for html in sorted(ROOT.rglob("*.html")):
        if any(part in SKIP_DIRS for part in html.parts):
            continue
        if html.name in SKIP_FILES:
            continue
        pages.append((page_url(html), date.fromtimestamp(html.stat().st_mtime).isoformat()))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, mod in pages:
        lines += ["  <url>", f"    <loc>{url}</loc>", f"    <lastmod>{mod}</lastmod>", "  </url>"]
    lines.append("</urlset>")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(pages)} URLs")

if __name__ == "__main__":
    main()