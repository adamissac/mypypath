#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://mypypath.com"
OUT = ROOT / "sitemap.xml"
# Directories that are not part of the deployed site. node_modules is the
# important one: it is gitignored, never deploys, and rglob happily walked it
# into the sitemap once dev dependencies were installed.
SKIP_DIRS = {".git", "node_modules", "lesson-format-kit", "REVIEW", "docs", "tests",
             "src-tauri", "desktop-dist", ".claude", ".agents", "scripts",
             ".audit", "engine", "html"}
# Only canonical, public content belongs in a sitemap. Personal dashboards,
# certificates, and redirect stubs are useful to visitors but not search pages.
SKIP_FILES = {"404.html", "admin.html", "classroom.html", "learn.html",
              "account.html", "certificate.html", "progress.html", "settings.html"}

def page_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return f"{BASE_URL}/" if rel == "index.html" else f"{BASE_URL}/{rel}"

def main() -> None:
    pages = []
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z", "--", "*.html"], cwd=ROOT
    ).decode("utf-8").split("\0")
    for rel in sorted(filter(None, tracked)):
        html = ROOT / rel
        if any(part in SKIP_DIRS for part in html.parts):
            continue
        if html.name in SKIP_FILES:
            continue
        source = html.read_text(encoding="utf-8")
        if re.search(r'<meta\s+name="robots"\s+content="[^"]*noindex', source, re.I):
            continue
        canonical = re.search(r'<link\s+rel="canonical"\s+href="([^"]+)"', source, re.I)
        if canonical and canonical.group(1) != page_url(html):
            continue
        pages.append(page_url(html))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    # Filesystem modification times change on checkout and deploy. Omit the
    # optional lastmod field rather than claim that every page changed today.
    for url in pages:
        lines += ["  <url>", f"    <loc>{url}</loc>", "  </url>"]
    lines.append("</urlset>")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(pages)} URLs")

if __name__ == "__main__":
    main()
