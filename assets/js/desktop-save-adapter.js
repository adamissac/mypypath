/* PyPath — the desktop save/load bridge.
 *
 * A no-op everywhere except inside the Tauri shell: window.__TAURI_INTERNALS__
 * only exists there, so this file has zero effect on the website. It is
 * included on every page (see scripts/build-desktop-dist.mjs) the same way
 * sync.js is, and for the same reason — progress can change on any page, not
 * just a settings screen.
 *
 * The seam this relies on already existed for cloud sync: ProgressStore.
 * snapshot() dumps every syncable key with its own updatedAt, and
 * applyRemote(key, value, updatedAt) writes a value back into localStorage
 * without re-triggering a push to whatever remote/class adapter happens to be
 * installed. sync.js uses that pair to pull from Firestore; this file uses
 * the identical pair to pull from a local file instead. Website storage and
 * desktop storage are separate adapters behind the one interface
 * ProgressStore already defines — this file is the only new adapter, and it
 * never touches the remote or class adapters sync.js installs.
 *
 * Deliberately never calls ProgressStore.removeItem(): a signed-in desktop
 * user could have a Firestore remote adapter installed at the same time
 * (Firebase stays optional, not disabled, per the desktop plan), and
 * removeItem() forwards to that adapter's own remove(). Opening a local save
 * file must never have a side effect of deleting someone's cloud data, so
 * this only ever calls applyRemote — a pure local overwrite of the keys the
 * opened file actually contains.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;

  var invoke = window.__TAURI__.core.invoke;
  var STORE = window.ProgressStore;
  if (!STORE) return;

  var SCHEMA_VERSION = 1;

  // Same shape as sync.js's DEBOUNCE_MS/MAX_WAIT_MS: batch rapid edits into
  // one disk write, but never let a burst of activity postpone a save
  // indefinitely.
  var DEBOUNCE_MS = 3000;
  var MAX_WAIT_MS = 20000;

  var currentPath = null;
  var saveTimer = null;
  var firstQueuedAt = 0;
  var lastSavedAt = null;
  var lastError = null;

  function toast(message) {
    if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
  }

  function announce() {
    document.dispatchEvent(new CustomEvent('pypath:desktop-save', {
      detail: { path: currentPath, savedAt: lastSavedAt, error: lastError },
    }));
  }

  function buildEnvelope() {
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      entries: STORE.snapshot(),
    });
  }

  function doSave(path) {
    return invoke('save_progress', { path: path, data: buildEnvelope() })
      .then(function () {
        lastSavedAt = Date.now();
        lastError = null;
        announce();
      })
      .catch(function (err) {
        lastError = String((err && err.message) || err);
        announce();
        toast('Could not save progress to disk');
      });
  }

  function scheduleSave() {
    if (!currentPath) return;
    if (!firstQueuedAt) firstQueuedAt = Date.now();
    var waited = Date.now() - firstQueuedAt;
    var delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited));
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      firstQueuedAt = 0;
      doSave(currentPath);
    }, delay);
  }

  // Each entry upgrades a parsed envelope from its key's version to key+1,
  // returning the upgraded envelope with schemaVersion bumped to match.
  // Empty today: schemaVersion 1 is the only shape this save format has ever
  // had, so there is nothing yet to upgrade from. This is the seam a future
  // format change hangs a migration off of — not present-day dead code, but
  // also not exercised by anything currently on disk. Applied in a loop
  // rather than a single step, so a save several versions behind (once that
  // is possible) runs every intermediate step in order instead of needing a
  // combinatorial function per (from, to) pair.
  var MIGRATIONS = {};

  function migrateEnvelope(data) {
    var version = data.schemaVersion;
    while (version < SCHEMA_VERSION) {
      var step = MIGRATIONS[version];
      if (!step) {
        throw new Error(
          'This save (version ' + version + ') is too old for this version of ' +
          'PyPath to open — there is no upgrade path to version ' + SCHEMA_VERSION + '.'
        );
      }
      data = step(data);
      version = data.schemaVersion;
    }
    return data;
  }

  function parseEnvelope(raw) {
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error('That file is not a valid PyPath save (not JSON).');
    }
    if (!data || typeof data !== 'object' || typeof data.entries !== 'object' || !data.entries) {
      throw new Error('That file is not a valid PyPath save.');
    }
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
      throw new Error('That save was made by a newer version of PyPath. Update the app to open it.');
    }
    return migrateEnvelope(data);
  }

  // Unconditional per key, not merged against what's already local: opening a
  // save is "switch to this file", the same as any desktop app's Open. Nothing
  // is lost by that, because whatever was local before this call is already
  // sitting safely at its own currentPath from the last debounced autosave.
  function applyEnvelope(envelope) {
    var entries = envelope.entries || {};
    Object.keys(entries).forEach(function (key) {
      var e = entries[key];
      if (e && typeof e.content === 'string') {
        STORE.applyRemote(key, e.content, e.updatedAt || 0);
      }
    });
  }

  async function loadFrom(path) {
    var raw = await invoke('load_progress', { path: path });
    var envelope = parseEnvelope(raw);
    applyEnvelope(envelope);
    currentPath = path;
    lastSavedAt = envelope.savedAt || null;
    lastError = null;
    await invoke('remember_save_path', { path: path });
    announce();
    return envelope;
  }

  async function chooseAndSaveAs() {
    var path = await invoke('choose_save_location');
    if (!path) return null;
    currentPath = path;
    await doSave(path);
    return path;
  }

  async function chooseAndOpen() {
    var path = await invoke('choose_open_location');
    if (!path) return null;
    try {
      return await loadFrom(path);
    } catch (err) {
      toast('Could not open that file: ' + err.message);
      throw err;
    }
  }

  function saveNow() {
    if (!currentPath) return chooseAndSaveAs();
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; firstQueuedAt = 0; }
    return doSave(currentPath);
  }

  function currentSaveInfo() {
    return { path: currentPath, savedAt: lastSavedAt, error: lastError };
  }

  async function init() {
    var lastPath = null;
    try {
      lastPath = await invoke('get_last_save_path');
      var path = lastPath || await invoke('default_save_path');
      await loadFrom(path);
    } catch (err) {
      // No file at that path yet (first launch), or it's unreadable/corrupt.
      // Either way, this must not touch whatever is already in localStorage —
      // an unreadable file is not the same thing as "start over". A path that
      // was remembered from a previous launch and no longer opens is worth
      // telling the learner about; a first launch with nothing to load yet is
      // not.
      currentPath = currentPath || lastPath || null;
      if (!currentPath) {
        try { currentPath = await invoke('default_save_path'); } catch (e2) { /* stays null */ }
      }
      if (lastPath) {
        toast('Could not open your last save. Progress on this device is unaffected.');
      }
      lastError = String((err && err.message) || err);
      announce();
    }
  }

  document.addEventListener('pypath:progress', scheduleSave);

  // Best-effort flush on close. invoke() is always async in Tauri so this
  // cannot truly block window close, but the debounce above means there is
  // rarely anything pending here — routine saves have already landed.
  window.addEventListener('pagehide', function () {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (currentPath) doSave(currentPath);
    }
  });

  window.PyPathDesktop = {
    saveNow: saveNow,
    chooseAndSaveAs: chooseAndSaveAs,
    chooseAndOpen: chooseAndOpen,
    currentSaveInfo: currentSaveInfo,
    listRecentSaves: function () { return invoke('list_recent_saves'); },
  };

  init();
})();
