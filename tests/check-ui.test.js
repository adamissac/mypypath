import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

let C;
let UI;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/schema-version.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/progress-store.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/checker.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/check-ui.js', 'utf8')).call(window);
  C = window.PyPathChecker;
  UI = window.PyPathCheckUI;
});

describe('finding the check file for a lesson', () => {
  it('maps a lesson path to its check file', () => {
    // jsdom's location is not a lesson page, so the mapping is checked
    // directly against the rule the module encodes.
    const map = (p) => {
      const m = /^\/units\/(unit-\d+)\/([a-z0-9-]+)\.html$/.exec(p);
      return m ? `/assets/data/checks/${m[1]}/${m[2]}.json` : null;
    };
    expect(map('/units/unit-3/return-statements.html'))
      .toBe('/assets/data/checks/unit-3/return-statements.json');
    expect(map('/units/unit-1.html')).toBe(null);
    expect(map('/sandbox.html')).toBe(null);
  });

  it('exposes the mapping the module actually uses', () => {
    expect(typeof UI.specUrl).toBe('function');
  });
});

describe('rendering results', () => {
  let panel;
  beforeEach(() => {
    panel = document.createElement('div');
    panel.hidden = true;
  });

  const spec = {
    cases: [{ name: 'prints greeting' }, { name: 'handles empty input' }],
    hint: 'Check your indentation.',
  };

  it('shows a pass and a fail with a mark, a word and a name', () => {
    const result = C.summarize(
      [{ name: 'prints greeting', ok: true },
       { name: 'handles empty input', ok: false, expected: "''", actual: 'None' }],
      [], spec, 1
    );
    UI.renderResult(panel, result, spec);

    const rows = panel.querySelectorAll('.check-row');
    expect(rows.length).toBe(2);
    expect(rows[0].className).toContain('is-pass');
    expect(rows[1].className).toContain('is-fail');
    // Status never rides on colour alone.
    expect(rows[0].querySelector('.check-mark').textContent).toBe('✓');
    expect(rows[0].querySelector('.check-state').textContent).toBe('Passed');
    expect(rows[1].querySelector('.check-mark').textContent).toBe('✕');
    expect(rows[1].querySelector('.check-state').textContent).toBe('Failed');
  });

  it('says what was expected and what came back for a failure', () => {
    const result = C.summarize(
      [{ name: 'prints greeting', ok: false, expected: 'Hello', actual: 'hello' }],
      [], spec, 1
    );
    UI.renderResult(panel, result, spec);
    expect(panel.querySelector('.check-detail').textContent)
      .toBe('expected Hello, got hello');
  });

  it('reports hidden checks as a count and never by name', () => {
    const withHidden = { ...spec, hiddenCases: [{ name: 'the tricky edge case' }] };
    const result = C.summarize(
      [{ name: 'prints greeting', ok: true }, { name: 'handles empty input', ok: true }],
      [{ name: 'the tricky edge case', ok: false }], withHidden, 1
    );
    UI.renderResult(panel, result, withHidden);
    expect(panel.textContent).toContain('Hidden checks: 0 of 1 passed');
    expect(panel.textContent).not.toContain('the tricky edge case');
  });

  it('holds the hint back until the second attempt', () => {
    const failing = [{ name: 'prints greeting', ok: false, expected: 'a', actual: 'b' }];
    UI.renderResult(panel, C.summarize(failing, [], spec, 1), spec);
    expect(panel.textContent).not.toContain('Check your indentation');

    const second = document.createElement('div');
    UI.renderResult(second, C.summarize(failing, [], spec, 2), spec);
    expect(second.textContent).toContain('Check your indentation');
  });

  it('explains a timeout in words a beginner can act on', () => {
    const result = C.summarize(
      [{ name: 'prints greeting', ok: false, timeout: true, errorType: 'TimeoutError' }],
      [], spec, 1
    );
    UI.renderResult(panel, result, spec);
    expect(panel.textContent).toContain('took too long');
    expect(panel.textContent).toContain('loop that never ends');
  });

  it('announces itself to a screen reader when results change', () => {
    UI.renderResult(panel, C.summarize([{ name: 'a', ok: true }], [], spec, 1), spec);
    expect(panel.hidden).toBe(false);
  });

  it('replaces previous results rather than stacking them', () => {
    const result = C.summarize([{ name: 'prints greeting', ok: true }], [], spec, 1);
    UI.renderResult(panel, result, spec);
    UI.renderResult(panel, result, spec);
    expect(panel.querySelectorAll('.check-summary').length).toBe(1);
  });
});

describe('the best result is what gets kept', () => {
  it('syncs under a deliberately allowlisted key', () => {
    expect(window.PyPathKeys.isSyncable('pypath-checks-/units/unit-1/x.html')).toBe(true);
    expect(window.PyPathKeys.CHECKS_PREFIX).toBe('pypath-checks-');
  });

  it('maps that key to a Firestore doc id injectively', () => {
    const a = window.PyPathKeys.toDocId('pypath-checks-/units/unit-1/a.html');
    const b = window.PyPathKeys.toDocId('pypath-checks-/units/unit-1/b.html');
    expect(a).not.toBe(b);
    expect(a).not.toContain('/');
  });
});

describe('the pages are wired up', () => {
  const page = fs.readFileSync('units/unit-1/first-program.html', 'utf8');

  it('loads the checker and the UI on a lesson page', () => {
    expect(page).toContain('/assets/js/checker.js');
    expect(page).toContain('/assets/js/check-ui.js');
  });

  it('parses the checker before the UI that calls it', () => {
    expect(page.indexOf('/assets/js/checker.js'))
      .toBeLessThan(page.indexOf('/assets/js/check-ui.js'));
  });

  it('loads the stylesheet inside the head', () => {
    expect(page.indexOf('/assets/css/checks.css')).toBeLessThan(page.indexOf('</head>'));
  });

  it('wires every lesson page, not just the ones with check files', () => {
    // A lesson with no check file simply grows no button, so wiring them all
    // means adding a check file later needs no page edit.
    const pages = [];
    for (let u = 1; u <= 10; u += 1) {
      for (const n of fs.readdirSync(`units/unit-${u}`)) {
        if (n.endsWith('.html')) pages.push(`units/unit-${u}/${n}`);
      }
    }
    const missing = pages.filter(
      (p) => !fs.readFileSync(p, 'utf8').includes('/assets/js/check-ui.js')
    );
    expect(missing).toEqual([]);
  });
});

describe('the stylesheet', () => {
  const raw = fs.readFileSync('assets/css/checks.css', 'utf8');
  // Comments are stripped first: this file's own header describes the rule it
  // is following, and matching that text would be a false positive.
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

  it('adds no !important to a codebase that already has too many', () => {
    expect(css).not.toContain('!important');
  });

  it('reuses the existing theme tokens', () => {
    expect(css).toMatch(/var\(--success/);
    expect(css).toMatch(/var\(--danger/);
    expect(css).toMatch(/var\(--border/);
  });

  it('has a narrow-screen layout and respects reduced motion', () => {
    expect(css).toMatch(/@media \(max-width: 27rem\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('gives the button a visible focus ring', () => {
    expect(css).toMatch(/\.btn-check-work:focus-visible/);
  });
});
