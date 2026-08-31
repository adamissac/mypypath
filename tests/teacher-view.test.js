import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

// role-nav.js is an ES module that imports the Firebase SDK from gstatic.com,
// so it cannot be executed in jsdom the way the classic scripts are. Its
// contract is checked against the source instead -- the same approach
// nav-classroom.test.js takes with bake_layout.py.
let roleNav;

beforeAll(() => {
  roleNav = fs.readFileSync('assets/js/role-nav.js', 'utf8');
});

describe('role-nav.js', () => {
  it('reveals teacher-only markup and hides student-only markup', () => {
    expect(roleNav).toContain('[data-account-classroom], [data-teacher-only]');
    expect(roleNav).toContain('[data-student-only]');
  });

  // gate.js and lesson-progress.js cannot read Firestore. They read the session
  // role, which only this file ever writes.
  it('caches the resolved role for the classic gating scripts', () => {
    expect(roleNav).toContain('ROLES.rememberRole(role)');
  });

  it('does not trust role entries cached before the authoritative reader fix', () => {
    // The previous cache could hold a false student result for a real teacher
    // for the rest of the tab. A new namespace forces one clean read after
    // this deploy, then keeps the same session-caching behavior.
    expect(roleNav).toContain("const CACHE_PREFIX = 'pypath-role:v2:'");
    expect(roleNav).not.toContain("const CACHE_PREFIX = 'pypath-role:'");

    const roles = fs.readFileSync('assets/js/roles.js', 'utf8');
    expect(roles).toContain("var SESSION_KEY = 'pypath-role:v2'");
    expect(roles).not.toMatch(/var SESSION_KEY = 'pypath-role';/);
  });

  it('announces the resolved role so the gates can re-settle', () => {
    expect(roleNav).toContain("new CustomEvent('pypath:role'");
    // Every resolution path has to announce, including the offline fallback --
    // a teacher whose role read fails should land as a student, not in limbo.
    expect((roleNav.match(/announce\(/g) || []).length).toBe(5);
  });

  // paint() also runs from the pypath:role listener. If it announced, every
  // event would re-enter itself.
  it('announces only from the resolver, never from the listener', () => {
    const listener = roleNav.slice(roleNav.indexOf("document.addEventListener('pypath:role'"));
    expect(listener).not.toContain('announce(');
  });
});

describe('role-gated markup', () => {
  // The browser's own [hidden] rule loses to any author `display`, which is
  // exactly how the Classroom nav item once leaked to every account.
  it('is collapsed site-wide, not just where [hidden] happens to win', () => {
    const css = fs.readFileSync('assets/css/pypath-fast.css', 'utf8');
    expect(css).toMatch(
      /\[data-teacher-only\]\[hidden\],\s*\[data-student-only\]\[hidden\]\s*\{\s*display:\s*none\s*!important;/
    );
  });

  ['progress.html', 'curriculum.html'].forEach((page) => {
    it(`ships ${page}'s teacher note hidden by default`, () => {
      const html = fs.readFileSync(page, 'utf8');
      const el = html.match(/<div class="teacher-view-note"[^>]*>/);
      expect(el).not.toBeNull();
      expect(el[0]).toContain('data-teacher-only');
      // Without this a student sees the note for as long as role-nav.js takes
      // to load, which on a cold cache is not a flash.
      expect(el[0]).toContain('hidden');
    });

    it(`styles ${page}'s teacher note`, () => {
      expect(fs.readFileSync(page, 'utf8')).toContain('/assets/css/lesson-progress.css');
    });
  });
});
