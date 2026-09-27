/* PyPath — populates download.html's buttons from the latest GitHub Release.
   A no-op on every other page: [data-download-status] only exists here.

   Reads api.github.com directly from the browser (public GET endpoints send
   Access-Control-Allow-Origin: *, and the unauthenticated 60-req/hour rate
   limit is per visitor IP, not shared, so this doesn't need a server). If no
   release has been published yet, or the request fails for any reason, the
   page degrades to linking everything at the GitHub releases page rather
   than showing a broken or empty button. */
(function () {
  'use strict';

  var status = document.querySelector('[data-download-status]');
  if (!status) return;

  var REPO = 'adamissac/mypypath';
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases';

  var PLATFORMS = [
    { key: 'dmg', label: 'macOS (Apple Silicon)', match: /\.dmg$/i },
    { key: 'msi', label: 'Windows', match: /\.msi$/i },
    { key: 'AppImage', label: 'Linux (AppImage)', match: /\.AppImage$/i },
    { key: 'deb', label: 'Linux (.deb)', match: /\.deb$/i },
  ];

  function detectPlatformKey() {
    var plat = navigator.platform || '';
    var ua = navigator.userAgent || '';
    if (/Mac/i.test(plat)) return 'dmg';
    if (/Win/i.test(plat)) return 'msi';
    if (/Linux/i.test(plat) && !/Android/i.test(ua)) return 'AppImage';
    return null;
  }

  function formatSize(bytes) {
    return Math.round(bytes / (1024 * 1024)) + ' MB';
  }

  function fallback() {
    status.textContent = 'No downloadable build has been published yet — check the project’s GitHub releases page.';
    var primary = document.querySelector('[data-download-primary]');
    if (primary) {
      primary.textContent = 'View on GitHub';
      primary.href = RELEASES_URL;
    }
  }

  fetch('https://api.github.com/repos/' + REPO + '/releases/latest')
    .then(function (res) {
      if (!res.ok) throw new Error('no published release');
      return res.json();
    })
    .then(function (release) {
      var assets = release.assets || [];
      var byKey = {};
      PLATFORMS.forEach(function (p) {
        var asset = assets.filter(function (a) { return p.match.test(a.name); })[0];
        if (asset) byKey[p.key] = asset;
      });

      if (!Object.keys(byKey).length) {
        fallback();
        return;
      }

      document.querySelectorAll('[data-download]').forEach(function (a) {
        var asset = byKey[a.getAttribute('data-download')];
        if (asset) a.href = asset.browser_download_url;
      });

      var primary = document.querySelector('[data-download-primary]');
      var suggestedKey = detectPlatformKey();
      var suggestedAsset = suggestedKey && byKey[suggestedKey];
      if (primary && suggestedAsset) {
        var platform = PLATFORMS.filter(function (p) { return p.key === suggestedKey; })[0];
        primary.href = suggestedAsset.browser_download_url;
        primary.textContent = 'Download for ' + platform.label + ' (' + formatSize(suggestedAsset.size) + ')';
      } else if (primary) {
        primary.href = RELEASES_URL;
        primary.textContent = 'See all downloads';
      }

      status.textContent = 'Latest version: ' + (release.tag_name || release.name || '');
    })
    .catch(fallback);
})();
