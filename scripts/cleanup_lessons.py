#!/usr/bin/env python3
"""Strip duplicate inline Pyodide/CodeMirror runners from lesson pages."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def extract_braced_object(html: str, marker: str) -> str | None:
    start = html.find(marker)
    if start == -1:
        return None
    brace_start = html.find('{', start + len(marker))
    if brace_start == -1:
        return None
    depth = 0
    for i in range(brace_start, len(html)):
        ch = html[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return html[brace_start : i + 1]
    return None


def find_inline_runner_script(html: str) -> tuple[int, int] | None:
    markers = (
        'window.runEditorCode = async function',
        'async function runEditorCode',
    )
    pos = -1
    for marker in markers:
        pos = html.find(marker)
        if pos != -1:
            break
    if pos == -1:
        return None
    start = html.rfind('<script>', 0, pos)
    end = html.find('</script>', pos)
    if start == -1 or end == -1:
        return None
    return start, end + len('</script>')


def cleanup_inline_runner(html: str) -> str:
    span = find_inline_runner_script(html)
    if not span:
        return html

    start, end = span
    block = html[start:end]
    solutions = extract_braced_object(block, 'const exerciseSolutions = ')
    if solutions:
        replacement = (
            '    <script>\n'
            '      window.exerciseSolutions = '
            + solutions
            + ';\n'
            '    </script>'
        )
    else:
        replacement = ''

    return html[:start] + replacement + html[end:]


def standardize_runner_labels(html: str) -> str:
    html = html.replace('>Run Code<', '>Run<')
    html = html.replace('Click "Run Code" to see your output here', 'Press Run to see output')
    html = html.replace('Click &quot;Run Code&quot; to see your output here', 'Press Run to see output')
    return html


def process(path: Path) -> bool:
    html = path.read_text(encoding='utf-8')
    orig = html
    html = cleanup_inline_runner(html)
    html = standardize_runner_labels(html)
    if html != orig:
        path.write_text(html, encoding='utf-8')
        return True
    return False


def main():
    changed = 0
    for path in sorted((ROOT / 'units').rglob('*.html')):
        if process(path):
            changed += 1
            print('cleaned', path.relative_to(ROOT))
    print(f'Cleaned {changed} lesson files.')


if __name__ == '__main__':
    main()
