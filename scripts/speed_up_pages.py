#!/usr/bin/env python3
"""Speed up page loads: lazy Pyodide, trim scripts, fix duplicates."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PYODIDE_SYNC = '<script src="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"></script>'
PYODIDE_LOADER = '    <script defer src="/assets/js/pyodide-loader.js"></script>'

FONT_OLD = 'family=Inter:wght@300;400;500;600;700;800;900&display=swap'
FONT_NEW = 'family=Inter:wght@400;500;600;700&display=swap'

INIT_PYODIDE_BLOCK = re.compile(
    r'async function initPyodide\(\) \{\s*'
    r'pyodide = await loadPyodide\(\);\s*'
    r'window\.pyodide = pyodide;\s*'
    r'pyodide\.runPython\(`[\s\S]*?`\);\s*'
    r'pyodideReady = true;\s*'
    r'window\.pyodideReady = true;\s*'
    r'\}',
    re.MULTILINE,
)

INIT_REPLACEMENT = """async function initPyodide() {
          pyodide = await window.Pyodide.ensureReady();
          pyodideReady = true;
        }"""

INIT_CALL_OLD = '        initPyodide();'
INIT_CALL_NEW = """        if (window.Pyodide) {
          window.Pyodide.scheduleWarmup().then(function (p) {
            pyodide = p;
            pyodideReady = true;
          });
        }"""

POLL_BLOCK = re.compile(
    r'if \(!pyodideReady\) \{\s*'
    r'const output = document\.getElementById\(`output-\$\{editorId\}`\);\s*'
    r'output\.innerHTML = \'<div class="output-loading">Loading Python interpreter\.\.\.</div>\';\s*'
    r'await new Promise\(resolve => \{\s*'
    r'const checkReady = setInterval\(\(\) => \{\s*'
    r'if \(pyodideReady\) \{\s*'
    r'clearInterval\(checkReady\);\s*'
    r'resolve\(\);\s*'
    r'\}\s*'
    r'\}, 100\);\s*'
    r'\}\);\s*'
    r'\}',
    re.MULTILINE,
)

POLL_REPLACEMENT = """if (!pyodideReady) {
            const output = document.getElementById(`output-${editorId}`);
            if (output) output.innerHTML = '<div class="output-loading">Loading Python interpreter...</div>';
            pyodide = await window.Pyodide.ensureReady();
            pyodideReady = true;
          }"""

CHECK_EX_POLL = re.compile(
    r'if \(!pyodideReady \|\| !pyodide\) \{\s*'
    r'const output = document\.getElementById\(`output-\$\{editorId\}`\);\s*'
    r'if \(output\) output\.innerHTML = \'<div class="output-loading">Loading Python interpreter\.\.\.</div>\';\s*'
    r'await new Promise\(resolve => \{\s*'
    r'const checkReady = setInterval\(\(\) => \{\s*'
    r'if \(window\.pyodideReady\) \{\s*'
    r'clearInterval\(checkReady\);\s*'
    r'resolve\(\);\s*'
    r'\}\s*'
    r'\}, 100\);\s*'
    r'\}\);\s*'
    r'\}',
    re.MULTILINE,
)

CHECK_EX_REPLACEMENT = """if (!window.pyodideReady || !window.pyodide) {
            const output = document.getElementById(`output-${editorId}`);
            if (output) output.innerHTML = '<div class="output-loading">Loading Python interpreter...</div>';
            await window.Pyodide.ensureReady();
            pyodide = window.pyodide;
            pyodideReady = window.pyodideReady;
          }"""

BACKGROUNDS_TAG = '    <script defer src="/assets/js/backgrounds.js"></script>\n'


def is_lesson(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    return (
        len(rel.parts) >= 3
        and rel.parts[0] == 'units'
        and rel.parts[1].startswith('unit-')
        and rel.name != rel.parts[1]
    )


def process(path: Path) -> list[str]:
    changes = []
    try:
        html = path.read_text(encoding='utf-8')
    except OSError:
        return changes
    orig = html

    html = html.replace(FONT_OLD, FONT_NEW)

    if PYODIDE_SYNC in html:
        html = html.replace(PYODIDE_SYNC + '\n', PYODIDE_LOADER + '\n')
        changes.append('pyodide-loader')

    if INIT_PYODIDE_BLOCK.search(html):
        html = INIT_PYODIDE_BLOCK.sub(INIT_REPLACEMENT, html, count=1)
        changes.append('initPyodide')

    if INIT_CALL_OLD in html:
        html = html.replace(INIT_CALL_OLD, INIT_CALL_NEW, 1)
        changes.append('lazy-warmup')

    if POLL_BLOCK.search(html):
        html = html.replace(POLL_BLOCK.search(html).group(0), POLL_REPLACEMENT, 1)
        changes.append('run-poll')

    if CHECK_EX_POLL.search(html):
        html = html.replace(CHECK_EX_POLL.search(html).group(0), CHECK_EX_REPLACEMENT, 1)
        changes.append('check-poll')

    # Remove duplicate exercises.js
    while html.count('exercises.js') > 1:
        html = html.replace(
            '    <script defer src="/assets/js/exercises.js"></script>\n',
            '',
            1,
        )
        changes.append('dup-exercises')

    # Lesson pages: drop backgrounds.js (noise is CSS-only on body)
    if is_lesson(path) and BACKGROUNDS_TAG in html:
        html = html.replace(BACKGROUNDS_TAG, '')
        changes.append('no-bg-js')

    if html != orig:
        path.write_text(html, encoding='utf-8')
    return changes


def main():
    total = 0
    for p in ROOT.rglob('*.html'):
        c = process(p)
        if c:
            total += 1
            print(p.relative_to(ROOT), c)
    print(f'Updated {total} files')


if __name__ == '__main__':
    main()
