import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('assets/js/desktop-settings-ui.js', 'utf8');

const ROW_HTML = `
  <div class="panel-row" data-desktop-save hidden>
    <p data-desktop-save-location>Location: —</p>
    <p data-desktop-save-status></p>
    <button data-desktop-save-open>Open</button>
    <button data-desktop-save-as>Save as</button>
    <button data-desktop-save-now>Save now</button>
  </div>
`;

function installDesktop(overrides) {
  window.PyPathDesktop = Object.assign({
    currentSaveInfo: () => ({ path: '/data/mine.json', savedAt: Date.now() - 5000, error: null }),
    chooseAndOpen: vi.fn(() => Promise.resolve()),
    chooseAndSaveAs: vi.fn(() => Promise.resolve()),
    saveNow: vi.fn(() => Promise.resolve()),
  }, overrides);
}

beforeEach(() => {
  document.body.innerHTML = ROW_HTML;
});

afterEach(() => {
  delete window.__TAURI_INTERNALS__;
  delete window.PyPathDesktop;
  document.body.innerHTML = '';
});

describe('outside Tauri', () => {
  it('leaves the row hidden and touches nothing', () => {
    installDesktop();
    new Function(SRC).call(window);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.querySelector('[data-desktop-save]').hidden).toBe(true);
  });
});

describe('inside Tauri', () => {
  function boot() {
    window.__TAURI_INTERNALS__ = {};
    installDesktop();
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    new Function(SRC).call(window);
  }

  it('reveals the row and renders the current save info', () => {
    boot();
    const row = document.querySelector('[data-desktop-save]');
    expect(row.hidden).toBe(false);
    expect(row.querySelector('[data-desktop-save-location]').textContent).toContain('/data/mine.json');
    expect(row.querySelector('[data-desktop-save-status]').textContent).toMatch(/Last saved/);
  });

  it('shows the error line instead of a saved time when there is an error', () => {
    installDesktop({
      currentSaveInfo: () => ({ path: '/data/mine.json', savedAt: null, error: 'disk full' }),
    });
    window.__TAURI_INTERNALS__ = {};
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    new Function(SRC).call(window);
    expect(document.querySelector('[data-desktop-save-status]').textContent).toContain('disk full');
  });

  it('wires the three buttons to the matching PyPathDesktop calls', async () => {
    boot();
    document.querySelector('[data-desktop-save-open]').click();
    document.querySelector('[data-desktop-save-as]').click();
    document.querySelector('[data-desktop-save-now]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.PyPathDesktop.chooseAndOpen).toHaveBeenCalledTimes(1);
    expect(window.PyPathDesktop.chooseAndSaveAs).toHaveBeenCalledTimes(1);
    expect(window.PyPathDesktop.saveNow).toHaveBeenCalledTimes(1);
  });

  it('re-renders on pypath:desktop-save without a page reload', () => {
    boot();
    // Mutate the same installed object rather than replacing
    // window.PyPathDesktop: the real script reads it once at setup time and
    // keeps that reference, exactly like sync.js and friends capture
    // window.ProgressStore once rather than re-reading the global each call.
    window.PyPathDesktop.currentSaveInfo = () => (
      { path: '/data/new-path.json', savedAt: Date.now(), error: null }
    );
    document.dispatchEvent(new CustomEvent('pypath:desktop-save'));
    expect(document.querySelector('[data-desktop-save-location]').textContent).toContain('/data/new-path.json');
  });

  it('waits for DOMContentLoaded when the document is still interactive', async () => {
    // The bug this guards: a naive `readyState !== "loading"` check would run
    // immediately here, before window.PyPathDesktop exists on a real page
    // load, because THIS script's tag loads earlier in the document than
    // desktop-save-adapter.js. Simulate that ordering directly: no
    // PyPathDesktop yet, readyState 'interactive', and confirm nothing runs
    // until DOMContentLoaded actually fires.
    window.__TAURI_INTERNALS__ = {};
    delete window.PyPathDesktop;
    Object.defineProperty(document, 'readyState', { value: 'interactive', configurable: true });
    new Function(SRC).call(window);

    expect(document.querySelector('[data-desktop-save]').hidden).toBe(true);

    installDesktop();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.querySelector('[data-desktop-save]').hidden).toBe(false);
  });
});
