import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';

/* The one line in pyodide-loader.js the desktop build depends on: PYODIDE_URL
 * is computed once, at module-load time, from window.__TAURI_INTERNALS__ — so
 * unlike packagesFor() and friends in run-button-packages.test.js, this can't
 * share one beforeAll load for the whole file. Each test here evaluates the
 * source fresh with a different window.__TAURI_INTERNALS__ already in place,
 * confirming the <script> tag Pyodide.ensureReady() creates actually points
 * at the vendored local copy inside Tauri and the CDN everywhere else — the
 * mechanism a live `tauri dev` run can only show by accident of timing
 * (Pyodide warms up lazily, on approaching a code editor), not on demand. */
const SRC = fs.readFileSync('assets/js/pyodide-loader.js', 'utf8');

function evalFresh() {
  delete window.Pyodide;
  delete window.pyodideReady;
  delete window.pyodide;
  new Function(SRC).call(window);
  return window.Pyodide;
}

function capturedScriptSrc(run) {
  const created = [];
  const realCreate = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = realCreate(tag);
    if (tag === 'script') created.push(el);
    return el;
  };
  try {
    run();
  } finally {
    document.createElement = realCreate;
  }
  // getAttribute, not .src: jsdom's .src getter resolves a relative value to
  // an absolute URL against the document's own base, which would make a
  // correct relative vendor path indistinguishable from a bug here.
  return created[0] && created[0].getAttribute('src');
}

afterEach(() => {
  delete window.__TAURI_INTERNALS__;
  delete window.Pyodide;
  delete window.pyodideReady;
  delete window.pyodide;
});

describe('Pyodide source selection', () => {
  it('loads from the vendored local copy inside Tauri', () => {
    window.__TAURI_INTERNALS__ = {};
    const P = evalFresh();
    const src = capturedScriptSrc(() => { P.ensureReady().catch(() => {}); });
    expect(src).toBe('/assets/vendor/pyodide/pyodide.js');
  });

  it('loads from the CDN on the website (no Tauri global present)', () => {
    const P = evalFresh();
    const src = capturedScriptSrc(() => { P.ensureReady().catch(() => {}); });
    expect(src).toBe('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
  });
});
