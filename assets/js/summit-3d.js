/* Summit 3D — boots the Blender-built diorama in the home hero.
 *
 * Progressive enhancement. The <img> (summit-diorama.webp, a still of the same
 * island) is the picture for no-JS, reduced motion, Save-Data, slow
 * connections, no WebGL, and anything that fails. Everyone else gets the live
 * scene from assets/js/summit-scene.js (built by scripts/build-summit.mjs).
 *
 * The entrance. An inline check in <head> marks the hero `summit-pending`
 * before first paint for visitors likely to qualify, so the art area shows a
 * cloud bank instead of the still. If the scene is ready within 2.5 s it rises
 * up through the clouds; otherwise the still fades in at 2.5 s and the scene
 * takes over at rest when it arrives. Once per browser session. */
(function () {
  'use strict';

  var SCENE_SRC = '/assets/js/summit-scene.js?v=c6a51e157d';
  var STILL_AFTER = 2500; // ms after DOMContentLoaded
  var SESSION_KEY = 'pypath-summit-entrance';
  var TOTAL_UNITS = 10;

  var root = document.documentElement;
  var host = document.querySelector('.home-summit');
  var mountain = host && host.querySelector('.home-summit__mountain');
  var moon = host && host.querySelector('.home-summit__moon');
  var started = false;
  var api = null;
  var t0 = 0;
  var stillTimer = 0;

  /* Mirrors assets/summit/qualify.js (tests/summit-bootstrap.test.js holds
     the two together). */
  function qualifies(env) {
    if (!env.isHome || env.reduced || !env.webgl || env.course === 'data') return false;
    if (env.saveData) return false;
    return ['slow-2g', '2g', '3g'].indexOf(env.effectiveType) === -1;
  }

  function webglAvailable() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) {
      return false;
    }
  }

  function prefersReduced() {
    if (window.PyMotion && typeof window.PyMotion.prefersReduced === 'function') {
      return window.PyMotion.prefersReduced();
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function environment() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    return {
      reduced: prefersReduced(),
      saveData: c.saveData === true,
      effectiveType: c.effectiveType,
      webgl: webglAvailable(),
      isHome: !!(document.body && document.body.classList.contains('page-home')),
      course: root.dataset.course || null
    };
  }

  function seenThisSession() {
    try { return window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  function markSeen() {
    try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* plays again next visit */ }
  }

  /* Unit names and hours for the stop labels come from the trail's cards,
     which are already on the page. */
  function unitsFromCards(doc) {
    var out = [];
    for (var n = 1; n <= TOTAL_UNITS; n++) {
      var card = doc.querySelector('[data-stop-card][data-stop-index="' + (n - 1) + '"]');
      var h = card && card.querySelector('h3');
      var meta = card && card.querySelector('.path-stop-card__meta span');
      out.push({
        n: n,
        title: h ? h.textContent.trim() : 'Unit ' + n,
        hours: meta ? meta.textContent.trim() : '',
        href: '/units/unit-' + n + '.html'
      });
    }
    return out;
  }

  function completedUnits() {
    try {
      var s = window.ProgressStore;
      return s && typeof s.getCompletedUnits === 'function' ? s.getCompletedUnits() : [];
    } catch (e) {
      return [];
    }
  }

  function theme() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function heroVisible() {
    if (!host) return false;
    var r = host.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || 0);
  }

  function showStill() {
    root.classList.remove('summit-pending');
  }

  function fail() {
    window.clearTimeout(stillTimer);
    showStill();
    if (host) {
      host.classList.remove('is-3d');
      var c = host.querySelector('.home-summit__canvas');
      if (c) c.remove();
      var l = host.querySelector('.home-summit__label');
      if (l) l.remove();
    }
    if (api) { try { api.dispose(); } catch (e) { /* already gone */ } }
    api = null;
  }

  function load() {
    import(SCENE_SRC).then(function (m) {
      var small = window.innerWidth < 560;
      return m.mountSummit(mountain, {
        units: unitsFromCards(document),
        completedUnits: completedUnits(),
        theme: theme(),
        small: small,
        shadows: !small && (navigator.hardwareConcurrency || 8) > 4,
        label: (mountain.querySelector('.home-summit__art') || {}).alt,
        plan: function () {
          return m.entrancePlan({ readyAt: performance.now() - t0, heroVisible: heroVisible(), seen: seenThisSession() });
        },
        onReady: function (ready) {
          window.clearTimeout(stillTimer);
          var full = ready.plan === 'full';
          ready.canvas.classList.add(full ? 'is-entering' : 'is-crossfading');
          mountain.appendChild(ready.canvas);
          mountain.appendChild(ready.label);
          host.classList.add('is-3d');
          if (ready.plan !== 'none') markSeen();
          // The CSS cloud bank hands over to the scene's own clouds.
          window.requestAnimationFrame(function () {
            showStill();
            ready.canvas.classList.add('is-in');
          });
        },
        onFail: fail
      });
    }).then(function (mounted) {
      if (!mounted) return;
      api = mounted;
      window.PyPathSummit.api = api;
      api.setTheme(theme());
      if (root.dataset.course === 'data') api.pause();
    }).catch(fail);
  }

  function boot() {
    if (started || !host || !mountain || !mountain.querySelector('.home-summit__art')) return;
    if (!qualifies(environment())) { showStill(); return; }
    started = true;
    t0 = performance.now();
    stillTimer = window.setTimeout(showStill, STILL_AFTER);
    var go = function () {
      if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: 1000 });
      else window.setTimeout(load, 200);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }

  // Mount exactly one hero artwork; the inactive one stays detached so it
  // cannot flash, take space, or sit in the accessibility tree.
  function syncCourseArtwork() {
    if (!host || !mountain || !moon) return;
    var data = root.dataset.course === 'data';
    var next = data ? moon : mountain;
    if (host.firstElementChild !== next || host.children.length !== 1) host.replaceChildren(next);
    if (api) { if (data) api.pause(); else api.resume(); }
    if (!data) boot();
    else showStill();
  }

  window.PyPathSummit = {
    qualifies: qualifies,
    unitsFromCards: unitsFromCards,
    seenThisSession: seenThisSession,
    markSeen: markSeen
  };

  if (!host) return;

  new MutationObserver(function () {
    if (api) api.setTheme(theme());
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', function () { if (api) api.setTheme(theme()); });
  }

  // Deferred scripts run while readyState is interactive, before other
  // modules have finished; wait for DOMContentLoaded even then.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncCourseArtwork, { once: true });
  } else {
    syncCourseArtwork();
  }
  new MutationObserver(syncCourseArtwork).observe(root, { attributes: true, attributeFilter: ['data-course'] });
})();
