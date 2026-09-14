#!/usr/bin/env python3
"""Press Run on every editor of every Python for Data lesson matching a filter.

Signs in as a seeded emulator student (units 3+ are gated when signed out),
clicks the real Run button on each practice and exercise, waits for the
output panel to settle, and exits non-zero if any editor printed an error.

    npm run serve & npm run emulators & npm run seed
    python3 .claude/skills/pypath-lesson-authoring/scripts/sweep_run_buttons.py [path-filter]

The filter is a substring of the lesson path, e.g. "unit-11" or
"reading-a-csv". With no filter every lesson in the manifest is swept.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8080'
ROOT = Path(__file__).resolve().parents[4]
MANIFEST = ROOT / 'assets/data/curriculum-data.json'
EMAIL, PASSWORD = 'student01@pypath.test', 'pypath123'

DONE = """(id) => { const o = document.getElementById('output-' + id); if (!o) return true;
  if (o.querySelector('.output-loading')) return false;
  return !!o.querySelector('pre, .output-error, .output-placeholder') && !o.querySelector('.pp-line'); }"""


def settle(page):
    # Signed in, Firestore keeps a connection open, so wait for load, not idle.
    page.wait_for_load_state('load')
    page.wait_for_function("""() => { const h = document.querySelector('.site-header');
        return !h || getComputedStyle(h).opacity === '1'; }""", timeout=15000)


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    lessons = [l for l in json.loads(MANIFEST.read_text())['lessons'] if only in l['path']]
    if not lessons:
        sys.exit(f'no lessons match {only!r}')
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={'width': 1280, 'height': 900},
                                   reduced_motion='reduce').new_page()
        page.set_default_timeout(60000)
        page.goto(BASE + '/login.html'); settle(page)
        page.fill('#login-email', EMAIL)
        page.fill('#login-password', PASSWORD)
        page.click('#login-form button[type=submit]')
        page.wait_for_url(lambda u: 'login.html' not in u, timeout=30000)

        for lesson in lessons:
            page.goto(BASE + lesson['path']); settle(page)
            page.wait_for_function("() => window.editors && Object.keys(window.editors).length > 0")
            for editor in lesson['editors']:
                started = time.time()
                page.click(f'[data-editor-id="{editor}"] .btn-run')
                page.wait_for_function(DONE, arg=editor, timeout=180000)
                out = page.evaluate("""(id) => { const o = document.getElementById('output-' + id);
                    return { error: !!o.querySelector('.output-error'), text: o.innerText.trim() }; }""", editor)
                mark = 'ERR' if out['error'] else 'ok '
                print(f"{mark} {lesson['path']} {editor} {time.time() - started:.1f}s | "
                      f"{out['text'][:80].replace(chr(10), ' / ')}", flush=True)
                if out['error']:
                    failures.append((lesson['path'], editor, out['text'][-300:]))
        browser.close()

    print(f'\n{len(failures)} editor(s) failed')
    for path, editor, text in failures:
        print(f'\n{path} {editor}\n{text}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
