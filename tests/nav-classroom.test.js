import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

// Two generators paint the header: scripts/bake_layout.py bakes it into every
// page, and assets/js/layout.js re-injects it when a page's baked header is
// stale. If only one of them learns about the Classroom tab, teachers lose the
// tab on whichever set of pages the other one wrote.
let py;

function renderHeader(pathname) {
  window.history.pushState({}, '', pathname);
  document.body.innerHTML = '<header class="site-header"></header>';
  window.PyLayout.inject();
  return document.querySelector('header.site-header');
}

beforeAll(() => {
  py = fs.readFileSync('scripts/bake_layout.py', 'utf8');
  new Function(fs.readFileSync('assets/js/layout.js', 'utf8')).call(window);
});

describe('bake_layout.py nav', () => {
  it('emits the Classroom item hidden and tagged for role-nav.js', () => {
    expect(py).toContain(
      '<li data-account-classroom hidden><a href="/classroom.html" class="route{classroom_a}">Classroom</a></li>'
    );
  });

  it('knows classroom.html is a nav destination', () => {
    expect(py).toContain("if pattern == 'classroom':");
    expect(py).toContain("return path.name == 'classroom.html'");
    expect(py).toContain("classroom_a = ' active' if nav_active(path, 'classroom') else ''");
  });

  it('orders Classroom between Sandbox and Settings', () => {
    const sandbox = py.indexOf('class="route{sandbox_a}">Sandbox');
    const classroom = py.indexOf('class="route{classroom_a}">Classroom');
    const settings = py.indexOf('class="route{settings_a}">Settings');
    expect(sandbox).toBeGreaterThan(-1);
    expect(classroom).toBeGreaterThan(sandbox);
    expect(settings).toBeGreaterThan(classroom);
  });

  // The baked pages carry this link but the generator had lost it, so a bake
  // would have stripped "My classroom" from the account dropdown site-wide.
  it('keeps the account dropdown classroom link', () => {
    expect(py).toContain(
      '<a href="/classroom.html" class="route" role="menuitem" data-account-classroom hidden>My classroom</a>'
    );
  });
});

describe('layout.js nav', () => {
  it('renders the Classroom item hidden and tagged for role-nav.js', () => {
    const li = renderHeader('/settings.html').querySelector('#primary-menu > li[data-account-classroom]');
    expect(li).not.toBeNull();
    expect(li.hidden).toBe(true);
    const a = li.querySelector('a');
    expect(a.getAttribute('href')).toBe('/classroom.html');
    expect(a.textContent).toBe('Classroom');
  });

  it('orders Classroom between Sandbox and Settings', () => {
    const labels = Array.from(
      renderHeader('/settings.html').querySelectorAll('#primary-menu > li > a')
    ).map((a) => a.textContent);
    expect(labels).toEqual(['Home', 'Sandbox', 'Classroom', 'Settings']);
  });

  it('marks the tab active only on classroom.html', () => {
    const on = renderHeader('/classroom.html').querySelector('[data-account-classroom] a');
    expect(on.classList.contains('active')).toBe(true);
    const off = renderHeader('/sandbox.html').querySelector('[data-account-classroom] a');
    expect(off.classList.contains('active')).toBe(false);
  });
});

describe('menu CSS', () => {
  // .nav-pill .menu > li sets an author `display`, which outranks the browser's
  // [hidden] rule and would show the tab to everyone.
  it('collapses a hidden menu item', () => {
    const css = fs.readFileSync('assets/css/pypath-fast.css', 'utf8');
    expect(css).toMatch(/\.primary-nav \.menu > li\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  });
});
