/* PyPath — the settings-page controls for the desktop save file.
 *
 * A no-op on the website: window.__TAURI_INTERNALS__ never exists there, so
 * the panel-row this reveals (data-desktop-save in settings.html) stays
 * hidden and this file does nothing else.
 *
 * Waits for DOMContentLoaded rather than relying on script order: this tag
 * loads earlier in the document than desktop-save-adapter.js (appended at the
 * very end of <body> by scripts/build-desktop-dist.mjs so it can be common to
 * every page), and window.PyPathDesktop isn't assigned until that file
 * evaluates. DOMContentLoaded only fires after every deferred and module
 * script has finished running, in either order, so it's the one signal that
 * doesn't depend on which of the two happens to load first.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;

  function formatWhen(ms) {
    if (!ms) return 'not yet saved';
    var diff = Date.now() - ms;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    return new Date(ms).toLocaleString();
  }

  // Deliberately not the common "readyState !== 'loading'" check: by the time
  // THIS script (a deferred/module script itself) runs, readyState is already
  // 'interactive', not 'loading', for every page load -- that check would
  // call fn() immediately, before desktop-save-adapter.js (later in the
  // document, so it hasn't executed yet) has assigned window.PyPathDesktop.
  // 'complete' is the only state that means DOMContentLoaded has already
  // fired and is never coming.
  function ready(fn) {
    if (document.readyState === 'complete') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function () {
    var DESKTOP = window.PyPathDesktop;
    var row = document.querySelector('[data-desktop-save]');
    if (!DESKTOP || !row) return;

    row.hidden = false;

    var locationEl = row.querySelector('[data-desktop-save-location]');
    var statusEl = row.querySelector('[data-desktop-save-status]');
    var openBtn = row.querySelector('[data-desktop-save-open]');
    var saveAsBtn = row.querySelector('[data-desktop-save-as]');
    var saveNowBtn = row.querySelector('[data-desktop-save-now]');

    function render() {
      var info = DESKTOP.currentSaveInfo();
      locationEl.textContent = 'Location: ' + (info.path || '—');
      if (info.error) {
        statusEl.textContent = 'Last error: ' + info.error;
      } else {
        statusEl.textContent = 'Last saved: ' + formatWhen(info.savedAt);
      }
    }

    document.addEventListener('pypath:desktop-save', render);
    render();

    openBtn.addEventListener('click', function () {
      openBtn.disabled = true;
      DESKTOP.chooseAndOpen()
        .catch(function () { /* desktop-save-adapter.js already toasted */ })
        .finally(function () { openBtn.disabled = false; render(); });
    });

    saveAsBtn.addEventListener('click', function () {
      saveAsBtn.disabled = true;
      DESKTOP.chooseAndSaveAs()
        .finally(function () { saveAsBtn.disabled = false; render(); });
    });

    saveNowBtn.addEventListener('click', function () {
      saveNowBtn.disabled = true;
      DESKTOP.saveNow()
        .finally(function () { saveNowBtn.disabled = false; render(); });
    });
  });
})();
