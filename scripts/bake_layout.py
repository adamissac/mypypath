#!/usr/bin/env python3
"""Bake canonical header/footer into all HTML pages (no runtime DOM surgery)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

UNIT_NAMES = [
    'Foundations', 'Control Flow', 'Functions', 'Data Structures',
    'Modules & Packages', 'OOP', 'Files & Errors', 'Testing', 'APIs', 'Certification Prep',
]

FIRST_LESSON = {
    1: '/units/unit-1/what-is-python.html',
    2: '/units/unit-2/understanding-control-flow.html',
    3: '/units/unit-3/what-are-functions.html',
    4: '/units/unit-4/introduction-data-structures.html',
    5: '/units/unit-5/what-are-modules.html',
    6: '/units/unit-6/introduction-oop-concepts.html',
    7: '/units/unit-7/introduction-file-handling.html',
    8: '/units/unit-8/what-is-debugging.html',
    9: '/units/unit-9/recursion-problem-decomposition.html',
    10: '/units/unit-10/project-planning-brainstorming.html',
}

CHEVRON = (
    '<svg class="dd-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2.5" aria-hidden="true">'
    '<path d="m6 9 6 6 6-6"/></svg>'
)

THEME_INIT = (
    '    <script src="/assets/js/theme-init.js"></script>\n'
)

PAGE_TRANSITION = '    <div id="page-transition" aria-hidden="true"></div>\n'

FOOTER = """    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a class="brand small route" href="/">
              <img src="/assets/img/pyPathLogo.png" alt="" class="logo small" width="28" height="28">
              <span class="brand-text">PyPath</span>
            </a>
            <p class="footer-tagline">Learn Python with clarity — free, structured lessons from foundations to certification.</p>
            <p class="footer-copy muted">&copy; <span id="year"></span> PyPath</p>
          </div>
          <div class="footer-col">
            <h4 class="footer-heading">Learn</h4>
            <ul class="footer-links">
              <li><a href="/units/unit-1/what-is-python.html" class="route">Curriculum</a></li>
              <li><a href="/sandbox.html" class="route">Sandbox</a></li>
              <li><a href="/certifications.html" class="route">Certifications</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4 class="footer-heading">About</h4>
            <ul class="footer-links">
              <li><a href="/about.html" class="route">Team</a></li>
              <li><a href="/settings.html" class="route">Settings</a></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>"""


def current_unit_from_path(path: Path) -> int | None:
    m = re.search(r'units/unit-(\d+)', str(path))
    return int(m.group(1)) if m else None


def nav_active(path: Path, pattern: str) -> bool:
    rel = '/' + path.relative_to(ROOT).as_posix()
    if pattern == 'home':
        return path.name == 'index.html' and path.parent == ROOT
    if pattern == 'sandbox':
        return path.name == 'sandbox.html'
    if pattern == 'certs':
        return path.name == 'certifications.html'
    if pattern == 'about':
        return path.name == 'about.html'
    if pattern == 'settings':
        return path.name == 'settings.html'
    if pattern == 'units':
        return '/units/' in rel
    return False


def unit_menu_items(current_unit: int | None) -> str:
    items = []
    for i in range(10):
        num = i + 1
        href = FIRST_LESSON[num]
        active = ' is-current' if current_unit == num else ''
        items.append(
            f'<li role="none"><a role="menuitem" href="{href}" class="dd-item route{active}">'
            f'<span class="dd-item__num">{num}</span>'
            f'<span class="dd-item__body">'
            f'<span class="dd-item__title">{UNIT_NAMES[i]}</span>'
            f'<span class="dd-item__meta">Unit {num}</span>'
            f'</span></a></li>'
        )
    return '\n            '.join(items)


def header_html(path: Path, show_progress: bool) -> str:
    cu = current_unit_from_path(path)
    home_a = ' active' if nav_active(path, 'home') else ''
    sandbox_a = ' active' if nav_active(path, 'sandbox') else ''
    certs_a = ' active' if nav_active(path, 'certs') else ''
    about_a = ' active' if nav_active(path, 'about') else ''
    settings_a = ' active' if nav_active(path, 'settings') else ''
    units_btn = ' aria-current="page"' if nav_active(path, 'units') else ''

    progress = ''
    if show_progress:
        progress = (
            '      <div class="header-progress"><div class="container">'
            '<div class="progress-global" aria-label="Course progress" role="progressbar" '
            'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">'
            '<div class="bar"></div></div></div></div>\n'
        )

    return f"""    <header class="site-header">
      <div class="header-accent" aria-hidden="true"></div>
      <div class="container header-inner">
        <a class="brand route" href="/">
          <img src="/assets/img/pyPathLogo.png" alt="PyPath Logo" class="logo" width="36" height="36">
          <span class="brand-text">PyPath</span>
        </a>
        <div class="header-actions">
          <nav class="primary-nav" aria-label="Primary" aria-expanded="false">
            <button type="button" class="mobile-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="primary-menu">
              <span class="mobile-toggle-bar" aria-hidden="true"></span>
              <span class="mobile-toggle-bar" aria-hidden="true"></span>
              <span class="mobile-toggle-bar" aria-hidden="true"></span>
            </button>
            <div class="nav-pill">
              <ul class="menu" id="primary-menu">
              <li><a href="/" class="route{home_a}">Home</a></li>
              <li class="dd dd--nav" data-dd>
                <button type="button" class="dd-trigger" id="nav-units-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="nav-units-panel"{units_btn}>
                  <span>Units</span> {CHEVRON}
                </button>
                <div class="dd-panel" id="nav-units-panel" role="menu" aria-labelledby="nav-units-btn" hidden>
                  <div class="dd-panel__head">
                    <span class="dd-panel__label">Curriculum</span>
                    <span class="dd-panel__hint">10 units</span>
                  </div>
                  <ul class="dd-panel__list dd-panel__list--grid">
            {unit_menu_items(cu)}
                  </ul>
                </div>
              </li>
              <li><a href="/sandbox.html" class="route{sandbox_a}">Sandbox</a></li>
              <li><a href="/certifications.html" class="route{certs_a}">Certifications</a></li>
              <li><a href="/about.html" class="route{about_a}">About</a></li>
              <li><a href="/settings.html" class="route{settings_a}">Settings</a></li>
              </ul>
            </div>
          </nav>
          <a href="/units/unit-1/what-is-python.html" class="btn btn-primary header-cta route">Start learning</a>
        </div>
      </div>
{progress}    </header>"""


def page_kind(path: Path) -> str:
    if path.name == 'index.html' and path.parent == ROOT:
        return 'home'
    rel = path.relative_to(ROOT)
    if rel.parts[0] == 'units':
        if len(rel.parts) == 2 and re.match(r'unit-\d+\.html$', rel.parts[1]):
            return 'unit_redirect'
        if len(rel.parts) >= 3 and rel.parts[1].startswith('unit-'):
            return 'lesson'
    return 'page'


def inject_page_transition(html: str) -> str:
    if 'id="page-transition"' in html:
        return html
    return re.sub(
        r'(<body[^>]*>)',
        r'\1\n' + PAGE_TRANSITION,
        html,
        count=1,
    )


def inject_theme_init(html: str) -> str:
    if 'theme-init.js' in html:
        return html
    return re.sub(
        r'(<meta charset="utf-8"\s*/>)',
        r'\1\n' + THEME_INIT,
        html,
        count=1,
    )


def replace_header(html: str, path: Path) -> str:
    kind = page_kind(path)
    show_progress = kind == 'home'
    new_header = header_html(path, show_progress)
    return re.sub(
        r'<header class="site-header">.*?</header>',
        new_header,
        html,
        count=1,
        flags=re.DOTALL,
    )


def replace_footer(html: str) -> str:
    return re.sub(
        r'<footer class="site-footer">.*?</footer>',
        FOOTER,
        html,
        count=1,
        flags=re.DOTALL,
    )


def fix_unit_redirect(html: str, path: Path) -> str:
    if page_kind(path) != 'unit_redirect':
        return html
    m = re.search(r'unit-(\d+)', path.name)
    if not m:
        return html
    num = int(m.group(1))
    target = FIRST_LESSON[num]
    name = UNIT_NAMES[num - 1]
    html = re.sub(
        r'<meta name="description" content="[^"]*"',
        f'<meta name="description" content="Unit {num}: {name} — PyPath curriculum"',
        html,
        count=1,
    )
    redirect_block = f"""    <main>
      <section class="section">
        <div class="container narrow">
          <p class="muted">Redirecting to Unit {num}…</p>
          <noscript>
            <p><a class="btn btn-primary route" href="{target}">Start Unit {num}</a></p>
          </noscript>
        </div>
      </section>
      <meta http-equiv="refresh" content="0; url={target}" />
      <link rel="canonical" href="{target}" />
    </main>"""
    html = re.sub(r'<main>.*?</main>', redirect_block, html, count=1, flags=re.DOTALL)
    return html


def misc_fixes(html: str, path: Path) -> str:
    html = re.sub(
        r'<nav class="primary-nav" aria-label="Primary"(?: aria-expanded="[^"]*")?>',
        '<nav class="primary-nav" aria-label="Primary" aria-expanded="false">',
        html,
    )

    html = html.replace('csawesome/index.html#"', 'csawesome/index.html"')
    html = html.replace('href="/index.html#curriculum"', 'href="/#curriculum"')

    if path.name == 'index.html':
        html = re.sub(
            r'(<section class="section features")',
            r'<section class="section features" id="curriculum"',
            html,
            count=1,
        )
        if 'class="stars"' not in html and 'testimonial' in html:
            html = html.replace(
                '<p class="quote">',
                '<div class="stars" aria-hidden="true">★★★★★</div>\n              <p class="quote">',
                2,
            )

    if path.name == 'sandbox.html':
        html = html.replace(
            '<select id="project-select"',
            '<label for="project-select" class="visually-hidden">Project</label>\n                  <select id="project-select"',
            1,
        )

    if path.name == 'about.html':
        html = re.sub(r'(?<!/)assets/img/', '/assets/img/', html)
        html = re.sub(r'href="(?!/)assets/', 'href="/assets/', html)

    # Smooth nav: route class on lesson next/prev and in-content CTAs
    html = re.sub(
        r'<a class="btn (btn-primary|btn-ghost)(?! route)" href="(/[^"]+)"',
        r'<a class="btn \1 route" href="\2"',
        html,
    )

    return html


def normalize_scripts(html: str, path: Path) -> str:
    if path.name == 'index.html' and path.parent == ROOT:
        return html

    for name in ('icons.js', 'layout.js', 'dropdowns.js', 'main.js', 'backgrounds.js', 'home.js'):
        html = re.sub(rf'\s*<script defer src="/assets/js/{re.escape(name)}"></script>\s*', '\n', html)

    html = re.sub(r'\s*<link rel="stylesheet" href="/assets/css/motion\.css"\s*/>\s*', '\n', html)
    html = re.sub(r'\s*<link rel="preconnect" href="https://fonts\.googleapis\.com"\s*/>\s*', '', html)
    html = re.sub(r'\s*<link rel="preconnect" href="https://fonts\.gstatic\.com" crossorigin\s*/>\s*', '', html)
    html = re.sub(r'\s*<link href="https://fonts\.googleapis\.com/css2\?[^"]+" rel="stylesheet"\s*/>\s*', '\n', html)
    html = re.sub(r'<div id="page-transition"[^>]*></div>\s*', '', html)
    html = html.replace(' data-bg="aurora,noise"', '').replace(' data-bg="noise"', '')

    if 'core.js' not in html and 'motion.js' in html:
        html = html.replace(
            '<script defer src="/assets/js/motion.js"></script>',
            '<script defer src="/assets/js/motion.js"></script>\n    <script defer src="/assets/js/core.js"></script>',
            1,
        )

    kind = page_kind(path)
    if kind == 'lesson' and 'lesson-runner.js' not in html and 'exercises.js' in html:
        html = html.replace(
            '<script defer src="/assets/js/exercises.js"></script>',
            '<script defer src="/assets/js/exercises.js"></script>\n    <script defer src="/assets/js/lesson-runner.js"></script>',
            1,
        )

    return html


def normalize_head(html: str) -> str:
    html = re.sub(r'<link rel="stylesheet" href="/assets/css/style\.css"\s*/>', '<link rel="stylesheet" href="/assets/css/style.css" />', html)
    if 'pypath-fast.css' not in html:
        html = html.replace(
            '<link rel="stylesheet" href="/assets/css/style.css" />',
            '<link rel="stylesheet" href="/assets/css/style.css" />\n    <link rel="stylesheet" href="/assets/css/pypath-fast.css" />',
            1,
        )
    return html


def process(path: Path) -> bool:
    html = path.read_text(encoding='utf-8')
    orig = html
    html = normalize_head(html)
    html = inject_theme_init(html)
    html = inject_page_transition(html)
    html = normalize_scripts(html, path)
    html = replace_header(html, path)
    html = replace_footer(html)
    html = fix_unit_redirect(html, path)
    html = misc_fixes(html, path)
    if html != orig:
        path.write_text(html, encoding='utf-8')
        return True
    return False


def main():
    count = sum(1 for p in ROOT.rglob('*.html') if process(p))
    print(f'Baked layout into {count} HTML files.')


if __name__ == '__main__':
    main()
