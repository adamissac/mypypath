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

    it(`survives lesson-progress.js, which used to delete ${page}'s note`, () => {
      /* The bug these two pages had from the day they shipped: the note was in
         the file, sent to the browser, and removed before it could paint.

         paintTeacherBanner() cleans up the banner IT injects whenever the page
         is not a lesson or a unit -- and it looked that banner up by class
         alone. On curriculum.html and progress.html, which are neither and
         which author a note of their own, the first match was theirs. Nothing
         caught it because the tests above assert the markup is in the file,
         and it always was.

         The fix is an ownership mark, so this asserts on the mark rather than
         on the sentence around it. */
      const src = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');
      expect(src).toMatch(/querySelector\('\.teacher-view-note\[data-injected-note\]'\)/);
      expect(src).toMatch(/setAttribute\('data-injected-note'/);
      // The authored notes carry no such mark, which is what keeps them.
      expect(fs.readFileSync(page, 'utf8')).not.toContain('data-injected-note');
    });
  });

  describe('the note is one component wherever it appears', () => {
    /* Injected onto a lesson, or authored into these two pages -- a teacher
       should meet one thing, not three that nearly match. */
    ['progress.html', 'curriculum.html'].forEach((page) => {
      it(`${page} uses the badge/text/action structure`, () => {
        const html = fs.readFileSync(page, 'utf8');
        expect(html).toContain('teacher-view-note__badge');
        expect(html).toContain('teacher-view-note__text');
        expect(html).toContain('teacher-view-note__title');
        expect(html).toContain('teacher-view-note__body');
        expect(html).toContain('teacher-view-note__actions');
        // The action is the only thing to do here, so it is a button at the
        // end of the bar rather than a link buried mid-sentence.
        expect(html).toMatch(/teacher-view-note__actions[\s\S]{0,200}href="\/classroom\.html"/);
      });
    });

    it('the injected one uses it too', () => {
      const src = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');
      ['__badge', '__text', '__title', '__body', '__actions'].forEach((part) => {
        expect(src).toContain('teacher-view-note' + part);
      });
    });

    it('the bar spans the page instead of stopping at a 68ch measure', () => {
      // What made it read as smushed into the left corner: a 796px box above
      // content that ran to 1390px. The text keeps a measure; the bar does not.
      const css = fs.readFileSync('assets/css/lesson-progress.css', 'utf8');
      const rule = css.slice(css.indexOf('.teacher-view-note {'),
        css.indexOf('.teacher-view-note__badge {'));
      expect(rule).not.toMatch(/max-width:\s*68ch/);
      expect(rule).toMatch(/grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
      expect(css).toMatch(/\.teacher-view-note__text \{ max-width: 62ch; \}/);
    });

    it('the wrapper borrows the lesson grid\'s own gutters', () => {
      // A 14px disagreement was invisible while the note was a narrow box and
      // reads as a misaligned bar now that it spans.
      const css = fs.readFileSync('assets/css/lesson-progress.css', 'utf8');
      const theme = fs.readFileSync('assets/css/pypath-theme.css', 'utf8');
      const gutter = 'clamp(1.5rem, 3.5vw, 4rem)';
      expect(theme).toContain('padding-inline: ' + gutter);
      expect(css).toContain('padding-inline: ' + gutter);
    });
  });
});
