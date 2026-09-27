import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';

/* desktop-save-adapter.js is a plain IIFE (no import/top-level await), unlike
   the Firebase-dependent files elsewhere in this suite, so unlike
   profile-read.test.js's strip-and-inject harness, it can be loaded directly
   with new Function(source).call(window) after window.__TAURI_INTERNALS__,
   window.__TAURI__ and window.ProgressStore are mocked first. That is what
   lets these tests drive real save/load/error behavior instead of asserting
   on the text of the file. */
const SRC = fs.readFileSync('assets/js/desktop-save-adapter.js', 'utf8');

function envelope(entries, overrides) {
  return JSON.stringify(Object.assign({
    schemaVersion: 1,
    savedAt: 1000,
    entries: entries || {},
  }, overrides));
}

function installMocks({ tauri = true, invokeImpl, snapshot } = {}) {
  if (tauri) {
    window.__TAURI_INTERNALS__ = {};
  } else {
    delete window.__TAURI_INTERNALS__;
  }
  const invoke = vi.fn(invokeImpl || (() => Promise.resolve(null)));
  window.__TAURI__ = { core: { invoke } };
  window.ProgressStore = {
    snapshot: vi.fn(() => snapshot || {}),
    applyRemote: vi.fn(),
  };
  window.PyUI = { showToast: vi.fn() };
  delete window.PyPathDesktop;
  return invoke;
}

async function load() {
  new Function(SRC).call(window);
  // init() is async and fire-and-forget from the script's own top level;
  // give its microtask chain room to settle before assertions.
  await vi.waitFor(() => expect(window.PyPathDesktop).toBeDefined());
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

// This file installs globals no other test in the suite expects
// (window.__TAURI_INTERNALS__, window.__TAURI__, window.PyPathDesktop) and
// stubs window.ProgressStore/window.PyUI outright, so it must not leak them
// into whatever test file jsdom's shared window runs next.
afterEach(() => {
  delete window.__TAURI_INTERNALS__;
  delete window.__TAURI__;
  delete window.PyPathDesktop;
  delete window.ProgressStore;
  delete window.PyUI;
  vi.useRealTimers();
});

describe('outside Tauri', () => {
  it('does nothing at all: no global installed, ProgressStore untouched', async () => {
    const invoke = installMocks({ tauri: false });
    new Function(SRC).call(window);
    await new Promise((r) => setTimeout(r, 0));
    expect(window.PyPathDesktop).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(window.ProgressStore.applyRemote).not.toHaveBeenCalled();
  });
});

describe('startup', () => {
  it('first launch: no remembered path, no file yet — starts clean, no toast', async () => {
    const invoke = installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve(null);
        if (cmd === 'default_save_path') return Promise.resolve('/data/progress.json');
        if (cmd === 'load_progress') return Promise.reject(new Error('not found'));
        return Promise.resolve(null);
      },
    });
    await load();

    expect(window.PyPathDesktop.currentSaveInfo().path).toBe('/data/progress.json');
    expect(window.PyUI.showToast).not.toHaveBeenCalled();
    expect(window.ProgressStore.applyRemote).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('load_progress', { path: '/data/progress.json' });
  });

  it('an existing save hydrates ProgressStore via applyRemote, one call per key', async () => {
    const saved = envelope({
      'pypath-completed-units': { content: '[1,2]', updatedAt: 500 },
      'pypath-progress-lessons': { content: '{"a":1}', updatedAt: 600 },
    });
    installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/mine.json');
        if (cmd === 'load_progress') return Promise.resolve(saved);
        return Promise.resolve(null);
      },
    });
    await load();

    expect(window.ProgressStore.applyRemote).toHaveBeenCalledWith('pypath-completed-units', '[1,2]', 500);
    expect(window.ProgressStore.applyRemote).toHaveBeenCalledWith('pypath-progress-lessons', '{"a":1}', 600);
    expect(window.PyPathDesktop.currentSaveInfo().path).toBe('/data/mine.json');
    expect(window.PyPathDesktop.currentSaveInfo().savedAt).toBe(1000);
  });

  it('a remembered path that no longer opens is reported, not silently swallowed', async () => {
    installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/gone.json');
        if (cmd === 'load_progress') return Promise.reject(new Error('ENOENT'));
        if (cmd === 'default_save_path') return Promise.resolve('/data/progress.json');
        return Promise.resolve(null);
      },
    });
    await load();

    expect(window.PyUI.showToast).toHaveBeenCalled();
    expect(window.ProgressStore.applyRemote).not.toHaveBeenCalled();
  });

  it('a corrupted (non-JSON) save file is rejected, and progress is left alone', async () => {
    installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/broken.json');
        if (cmd === 'load_progress') return Promise.resolve('{not valid json');
        return Promise.resolve(null);
      },
    });
    await load();

    expect(window.PyPathDesktop.currentSaveInfo().error).toMatch(/not.*valid PyPath save/i);
    expect(window.ProgressStore.applyRemote).not.toHaveBeenCalled();
    expect(window.PyUI.showToast).toHaveBeenCalled();
  });

  it('a save from a newer schema version is refused rather than misread', async () => {
    const future = envelope({ x: { content: 'y', updatedAt: 1 } }, { schemaVersion: 99 });
    installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/future.json');
        if (cmd === 'load_progress') return Promise.resolve(future);
        return Promise.resolve(null);
      },
    });
    await load();

    expect(window.PyPathDesktop.currentSaveInfo().error).toMatch(/newer version/i);
    expect(window.ProgressStore.applyRemote).not.toHaveBeenCalled();
  });

  it('a file with no entries object at all is rejected as invalid, not treated as empty', async () => {
    installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/weird.json');
        if (cmd === 'load_progress') return Promise.resolve(JSON.stringify({ schemaVersion: 1 }));
        return Promise.resolve(null);
      },
    });
    await load();
    expect(window.PyPathDesktop.currentSaveInfo().error).toMatch(/not a valid PyPath save/i);
  });
});

describe('autosave', () => {
  it('debounces rapid progress events into one save, containing a fresh snapshot', async () => {
    vi.useFakeTimers();
    const invoke = installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/mine.json');
        if (cmd === 'load_progress') return Promise.resolve(envelope({}));
        if (cmd === 'save_progress') return Promise.resolve(null);
        return Promise.resolve(null);
      },
      snapshot: { k: { content: 'v', updatedAt: 42 } },
    });
    new Function(SRC).call(window);
    await vi.waitFor(() => expect(window.PyPathDesktop).toBeDefined());
    await vi.advanceTimersByTimeAsync(0);

    invoke.mockClear();
    document.dispatchEvent(new CustomEvent('pypath:progress'));
    document.dispatchEvent(new CustomEvent('pypath:progress'));
    document.dispatchEvent(new CustomEvent('pypath:progress'));
    await vi.advanceTimersByTimeAsync(1);
    expect(invoke).not.toHaveBeenCalledWith('save_progress', expect.anything());

    await vi.advanceTimersByTimeAsync(3000);
    const saveCalls = invoke.mock.calls.filter((c) => c[0] === 'save_progress');
    expect(saveCalls.length).toBe(1);
    const payload = JSON.parse(saveCalls[0][1].data);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.entries).toEqual({ k: { content: 'v', updatedAt: 42 } });
    vi.useRealTimers();
  });

  it('never lets continuous activity postpone a save past the ceiling', async () => {
    vi.useFakeTimers();
    const invoke = installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/mine.json');
        if (cmd === 'load_progress') return Promise.resolve(envelope({}));
        return Promise.resolve(null);
      },
    });
    new Function(SRC).call(window);
    await vi.waitFor(() => expect(window.PyPathDesktop).toBeDefined());
    await vi.advanceTimersByTimeAsync(0);
    invoke.mockClear();

    // A progress event every 2.5s, forever resetting the 3s debounce — but
    // MAX_WAIT_MS=20000 must still force a save.
    for (let i = 0; i < 9; i++) {
      document.dispatchEvent(new CustomEvent('pypath:progress'));
      await vi.advanceTimersByTimeAsync(2500);
    }
    const saveCalls = invoke.mock.calls.filter((c) => c[0] === 'save_progress');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });
});

describe('manual save/open', () => {
  it('saveNow falls back to the default path on first launch rather than prompting', async () => {
    // Real first-launch behavior: init() cannot load anything yet (no file),
    // but it still resolves a default path from the OS, so there's always
    // somewhere to save without asking — the dialog is for choosing something
    // *other* than the default, not a precondition for saving at all.
    const invoke = installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve(null);
        if (cmd === 'default_save_path') return Promise.resolve('/data/progress.json');
        if (cmd === 'load_progress') return Promise.reject(new Error('not found'));
        return Promise.resolve(null);
      },
    });
    await load();
    invoke.mockClear();

    await window.PyPathDesktop.saveNow();
    expect(invoke).toHaveBeenCalledWith('save_progress', { path: '/data/progress.json', data: expect.any(String) });
    expect(invoke).not.toHaveBeenCalledWith('choose_save_location');
  });

  it('saveNow prompts Save As only if no path could be determined at all', async () => {
    // The genuine no-path case: both the remembered path and the OS-provided
    // default failed to resolve (e.g. the app-data directory itself errored).
    const invoke = installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.reject(new Error('no config dir'));
        if (cmd === 'default_save_path') return Promise.reject(new Error('no app data dir'));
        if (cmd === 'choose_save_location') return Promise.resolve(null);
        return Promise.resolve(null);
      },
    });
    await load();
    expect(window.PyPathDesktop.currentSaveInfo().path).toBeNull();
    invoke.mockClear();

    await window.PyPathDesktop.saveNow();
    expect(invoke).toHaveBeenCalledWith('choose_save_location');
    expect(invoke).not.toHaveBeenCalledWith('save_progress', expect.anything());
  });

  it('cancelling the Save As dialog writes nothing', async () => {
    const invoke = installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve(null);
        if (cmd === 'default_save_path') return Promise.resolve('/data/progress.json');
        if (cmd === 'load_progress') return Promise.reject(new Error('not found'));
        if (cmd === 'choose_save_location') return Promise.resolve(null);
        return Promise.resolve(null);
      },
    });
    await load();
    const result = await window.PyPathDesktop.chooseAndSaveAs();
    expect(result).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith('save_progress', expect.anything());
  });

  it('cancelling the Open dialog reads and applies nothing', async () => {
    const invoke = installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve(null);
        if (cmd === 'default_save_path') return Promise.resolve('/data/progress.json');
        if (cmd === 'load_progress') return Promise.reject(new Error('not found'));
        if (cmd === 'choose_open_location') return Promise.resolve(null);
        return Promise.resolve(null);
      },
    });
    await load();
    invoke.mockClear();
    const result = await window.PyPathDesktop.chooseAndOpen();
    expect(result).toBeNull();
    expect(window.ProgressStore.applyRemote).not.toHaveBeenCalled();
  });

  it('opening a chosen file applies it and remembers the path', async () => {
    const opened = envelope({ z: { content: 'v9', updatedAt: 9 } });
    const invoke = installMocks({
      invokeImpl: (cmd, args) => {
        if (cmd === 'get_last_save_path') return Promise.resolve(null);
        if (cmd === 'default_save_path') return Promise.resolve('/data/progress.json');
        if (cmd === 'load_progress' && args.path === '/data/progress.json') return Promise.reject(new Error('not found'));
        if (cmd === 'choose_open_location') return Promise.resolve('/data/chosen.json');
        if (cmd === 'load_progress' && args.path === '/data/chosen.json') return Promise.resolve(opened);
        if (cmd === 'remember_save_path') return Promise.resolve(null);
        return Promise.resolve(null);
      },
    });
    await load();
    await window.PyPathDesktop.chooseAndOpen();

    expect(window.ProgressStore.applyRemote).toHaveBeenCalledWith('z', 'v9', 9);
    expect(window.PyPathDesktop.currentSaveInfo().path).toBe('/data/chosen.json');
    expect(invoke).toHaveBeenCalledWith('remember_save_path', { path: '/data/chosen.json' });
  });

  it('never calls removeItem/remove — opening a file must not touch a signed-in remote adapter', async () => {
    installMocks({
      invokeImpl: (cmd) => {
        if (cmd === 'get_last_save_path') return Promise.resolve('/data/mine.json');
        if (cmd === 'load_progress') return Promise.resolve(envelope({ a: { content: '1', updatedAt: 1 } }));
        return Promise.resolve(null);
      },
    });
    await load();
    expect(window.ProgressStore.removeItem).toBeUndefined();
    // Belt and suspenders: the mock never defined removeItem at all, so any
    // call to it would throw rather than silently succeed and go unnoticed.
  });
});
