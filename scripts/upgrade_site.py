#!/usr/bin/env python3
"""Bulk-update PyPath HTML pages for motion upgrade."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STANDARD_HEAD = """    <link rel="stylesheet" href="/assets/css/motion.css" />
    <script defer src="/assets/js/theme.js"></script>
    <script defer src="/assets/js/icons.js"></script>
    <script defer src="/assets/js/motion.js"></script>
    <script defer src="/assets/js/layout.js"></script>
    <script defer src="/assets/js/dropdowns.js"></script>
    <script defer src="/assets/js/main.js"></script>"""

MOBILE_BANNER_RE = re.compile(
    r'\s*<div class="mobile-warning-banner"[^>]*>.*?</div>\s*',
    re.DOTALL,
)

OLD_SCRIPTS = re.compile(
    r'<script defer src="/assets/js/theme\.js"></script>\s*'
    r'(?:<script defer src="/assets/js/animations\.js"></script>\s*)?'
    r'(?:<script defer src="/assets/js/main\.js"></script>\s*)?',
)

ICON_REPLACEMENTS = [
    (r'<span class="cbadge">Py</span>', '<span class="cert-icon-lockup"><span class="icon-svg" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg></span><strong>PCAP</strong></span>'),
    (r'<span class="cbadge">Py\+</span>', '<span class="cert-icon-lockup"><span class="icon-svg" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg></span><strong>PCPP</strong></span>'),
    (r'<span class="cbadge">IT</span>', '<span class="cert-icon-lockup"><span class="icon-svg" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg></span><strong>ITF+</strong></span>'),
    (r'<span class="cbadge">Jv</span>', '<span class="cert-icon-lockup"><span class="icon-svg" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg></span><strong>Java SE</strong></span>'),
    (r'<div class="icon-circle" aria-hidden="true"><span>Py</span></div>',
     '<div class="feature-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg></div>'),
    (r'<span class="logo small"></span>',
     '<img src="/assets/img/pyPathLogo.png" alt="" class="logo small" width="28" height="28">'),
]

def body_bg(path: Path) -> str:
    rel = path.relative_to(ROOT)
    if path.name == 'index.html':
        return 'aurora,noise'
    if len(rel.parts) >= 3 and rel.parts[0] == 'units' and rel.parts[1].startswith('unit-') and rel.suffix == '.html' and rel.parts[1] != rel.name:
        return 'noise'
    if path.name in ('sandbox.html', 'certifications.html', 'curriculum.html', 'about.html'):
        return 'aurora,noise'
    return 'noise'

def page_class(path: Path) -> str:
    if 'page-' in path.read_text(encoding='utf-8')[:3000]:
        return ''
    return ''

def process(path: Path) -> bool:
    if path.name == 'index.html' and path.parent == ROOT:
        return False  # already hand-updated

    html = path.read_text(encoding='utf-8')
    orig = html

    html = MOBILE_BANNER_RE.sub('\n', html)

    rel = path.relative_to(ROOT)
    is_lesson = (len(rel.parts) >= 3 and rel.parts[0] == 'units'
                 and rel.parts[1].startswith('unit-') and rel.name != rel.parts[1])
    is_sandbox = path.name == 'sandbox.html'

    html = html.replace('<script src="/assets/js/sandbox.js"></script>\n', '')
    html = html.replace('<script defer src="/assets/js/sandbox.js"></script>\n', '')

    if 'motion.css' not in html:
        html = html.replace(
            '<link rel="stylesheet" href="/assets/css/style.css" />',
            '<link rel="stylesheet" href="/assets/css/style.css" />\n' + STANDARD_HEAD.split('\n')[0],
        )

    if 'motion.js' not in html:
        extra = ''
        if is_lesson:
            extra = '\n    <script defer src="/assets/js/lesson-ui.js"></script>\n    <script defer src="/assets/js/exercises.js"></script>'
        elif is_sandbox:
            extra = '\n    <script defer src="/assets/js/sandbox.js"></script>'
        m = OLD_SCRIPTS.search(html)
        if m:
            html = html[:m.start()] + STANDARD_HEAD + extra + '\n' + html[m.end():]
        else:
            html = html.replace(
                '<script defer src="/assets/js/theme.js"></script>',
                STANDARD_HEAD + extra,
                1,
            )

    bg = body_bg(path)
    if 'data-bg=' not in html:
        html = re.sub(r'(<body class="[^"]+")', rf'\1 data-bg="{bg}"', html, count=1)

    for pat, repl in ICON_REPLACEMENTS:
        html = re.sub(pat, repl, html)

    # Normalize footer links
    html = re.sub(
        r'<ul class="footer-links">\s*'
        r'<li><a href="/settings\.html"[^>]*>Settings</a></li>\s*'
        r'(?:<li><a href="/certifications\.html"[^>]*>Certifications</a></li>\s*)?'
        r'(?:<li><a href="/"[^>]*>Home</a></li>\s*)?'
        r'</ul>',
        '<ul class="footer-links">\n'
        '            <li><a href="/curriculum.html" class="route">Curriculum</a></li>\n'
        '            <li><a href="/certifications.html" class="route">Certifications</a></li>\n'
        '            <li><a href="/about.html" class="route">About</a></li>\n'
        '            <li><a href="/settings.html" class="route">Settings</a></li>\n'
        '          </ul>',
        html,
        count=1,
    )

    if html != orig:
        path.write_text(html, encoding='utf-8')
        return True
    return False

def main():
    n = sum(1 for p in ROOT.rglob('*.html') if process(p))
    print(f'Updated {n} files.')

if __name__ == '__main__':
    main()
