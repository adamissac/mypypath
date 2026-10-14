/* PyPath — the cockpit at the top of /data.html.
 *
 * Ten unit lights and a Launch control. The state is computed from the same
 * local lesson map and test records the unit pages read, so a guest sees
 * their own progress. Data unit tests are stored as "data-N"; a Foundations
 * record with the same number must never light a data unit.
 */
(function () {
  'use strict';

  // LESSON_PROGRESS_KEY and UNIT_TESTS_KEY in storage-keys.js. Only used when
  // lesson-progress.js failed to load and cannot tell us.
  var LESSONS_KEY = 'pypath-progress-lessons';
  var TESTS_KEY = 'pypath-unit-tests';

  function testPassed(records, n, passMark) {
    if (!records || typeof records !== 'object' || Array.isArray(records)) return false;
    var entry = records['data-' + n];
    if (!entry || typeof entry !== 'object') return false;
    var best = Number(entry.best);
    if (entry.best !== undefined && entry.best !== null && isFinite(best)) return best >= passMark;
    return entry.passed === true;
  }

  function state(units, passedPaths, testRecords, passMark) {
    var passed = {};
    (Array.isArray(passedPaths) ? passedPaths : []).forEach(function (p) { passed[p] = true; });
    var done = units.map(function (u) {
      return u.lessons.length > 0
        && u.lessons.every(function (p) { return passed[p] === true; })
        && testPassed(testRecords, u.n, passMark);
    });
    var current = done.indexOf(false);
    var lights = done.map(function (d, i) { return d ? 'done' : i === current ? 'current' : 'idle'; });
    var target = current === -1 ? units[0] : units[current];
    var label = (current === -1 ? 'Launch again: Unit ' : 'Launch: Unit ') + target.n + ', ' + target.title;
    return { lights: lights, target: target, label: label };
  }

  function readJson(key) {
    try {
      var store = window.ProgressStore || window.localStorage;
      var parsed = JSON.parse(store.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function readProgress() {
    var LP = window.PyPathLessonProgress;
    var map = readJson((LP && LP.STORE_KEY) || LESSONS_KEY);
    var passedPaths = [];
    try {
      passedPaths = LP && LP.passedLessons ? LP.passedLessons(map)
        : Object.keys(map).filter(function (k) { return map[k] && map[k].passed === true; });
    } catch (e) {
      passedPaths = [];
    }
    return { passedPaths: passedPaths, testRecords: readJson((LP && LP.UNIT_TESTS_KEY) || TESTS_KEY) };
  }

  function unitsFrom(root) {
    return Array.prototype.map.call(root.querySelectorAll('.cockpit__light'), function (a) {
      return {
        n: Number(a.getAttribute('data-unit')),
        title: a.getAttribute('data-title') || '',
        href: a.getAttribute('href'),
        lessons: (a.getAttribute('data-lessons') || '').split('|').filter(Boolean),
        el: a
      };
    });
  }

  function render(doc) {
    var root = (doc || document).querySelector('[data-cockpit]');
    if (!root) return;
    var units = unitsFrom(root);
    if (!units.length) return;
    var LP = window.PyPathLessonProgress;
    var progress = readProgress();
    var s = state(units, progress.passedPaths, progress.testRecords, (LP && LP.UNIT_TEST_PASS_MARK) || 70);
    units.forEach(function (u, i) {
      u.el.setAttribute('data-state', s.lights[i]);
      // The colour says finished / up next; say it to a screen reader too.
      u.el.setAttribute('aria-label', 'Unit ' + u.n + ': ' + u.title
        + (s.lights[i] === 'done' ? ', finished' : s.lights[i] === 'current' ? ', up next' : ''));
      if (s.lights[i] === 'current') u.el.setAttribute('aria-current', 'step');
      else u.el.removeAttribute('aria-current');
    });
    var launch = root.querySelector('[data-cockpit-launch]');
    if (launch) {
      launch.setAttribute('href', s.target.href);
      var label = launch.querySelector('.cockpit__launch-label') || launch;
      label.textContent = s.label;
    }
  }

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ── The launch cutscene ─────────────────────────────────────────────────
     Seen from inside the cockpit: a countdown on the glass, a rumble, the
     stars stretching into streaks, the moon rushing at you, a flash. About
     3.3 seconds, then the unit page opens (and plays its own short landing,
     arrive.js). It can be skipped with the Skip button or Escape, and it is
     never built under reduced motion: wireMotion returns before it can be. */
  var COUNT_STEP = 600;     // ms per numeral
  var GO_AT = 1800;         // "Go": the stars streak, the moon rushes in
  var NAVIGATE_AT = 3300;   // after the flash
  var ARRIVE_KEY = 'pypath-arrive';

  // A property of the API (not called directly) so a test can observe it.
  function navigate(href) { window.location.assign(href); }

  function playCutscene(label, href, returnFocusTo) {
    var spoken = label.replace(/^Launch(?: again)?:\s*/, 'Launching to ');
    var el = document.createElement('div');
    el.className = 'cockpit-cutscene is-counting';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', spoken);
    el.innerHTML = '<div class="cockpit-cutscene__stage" aria-hidden="true">'
      + '<div class="cockpit-cutscene__stars cockpit-cutscene__stars--far"></div>'
      + '<div class="cockpit-cutscene__stars cockpit-cutscene__stars--mid"></div>'
      + '<div class="cockpit-cutscene__stars cockpit-cutscene__stars--near"></div>'
      + '<img class="cockpit-cutscene__moon" src="/assets/img/data-moon.svg" alt="" width="640" height="640" />'
      + '</div>'
      + '<div class="cockpit-cutscene__frame" aria-hidden="true"></div>'
      + '<div class="cockpit-cutscene__hud" aria-hidden="true"><p class="cockpit-cutscene__caption"></p></div>'
      + '<p class="cockpit-cutscene__count" data-cutscene-count aria-hidden="true">3</p>'
      + '<p class="visually-hidden" aria-live="polite"></p>'
      + '<button type="button" class="btn btn-ghost cockpit-cutscene__skip" data-cutscene-skip>Skip</button>'
      + '<div class="cockpit-cutscene__flash" aria-hidden="true"></div>';
    el.querySelector('.cockpit-cutscene__caption').textContent = spoken;
    el.querySelector('[aria-live]').textContent = spoken;
    var count = el.querySelector('[data-cutscene-count]');
    var skip = el.querySelector('[data-cutscene-skip]');
    document.body.appendChild(el);
    skip.focus();

    var timers = [];
    var done = false;
    function at(ms, fn) { timers.push(window.setTimeout(fn, ms)); }
    function stop() {
      timers.forEach(window.clearTimeout);
      timers = [];
      document.removeEventListener('keydown', onKey, true);
    }
    function finish() {
      if (done) return;
      done = true;
      stop();
      try { window.sessionStorage.setItem(ARRIVE_KEY, '1'); } catch (e) { /* no landing animation */ }
      window.PyPathCockpit.navigate(href);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'Tab') { e.preventDefault(); skip.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    skip.addEventListener('click', finish);

    // Each numeral pops in: the class is dropped and re-added to restart it.
    function show(text) {
      count.textContent = text;
      count.classList.remove('is-tick');
      void count.offsetWidth;
      count.classList.add('is-tick');
    }
    show('3');
    at(COUNT_STEP, function () { show('2'); });
    at(COUNT_STEP * 2, function () { show('1'); });
    at(GO_AT, function () {
      count.textContent = 'Go';
      el.classList.remove('is-counting');
      el.classList.add('is-go');
    });
    at(NAVIGATE_AT, finish);

    return {
      dispose: function () {
        done = true;
        stop();
        el.remove();
        if (returnFocusTo && returnFocusTo.focus) returnFocusTo.focus();
      }
    };
  }

  function wireMotion(root) {
    if (prefersReduced()) return;
    var space = root.querySelector('.cockpit__window');
    var queued = false, tx = 0, ty = 0;
    if (space) {
      root.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = root.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(function () {
          queued = false;
          space.style.setProperty('--look-x', tx.toFixed(3));
          space.style.setProperty('--look-y', ty.toFixed(3));
        });
      });
      root.addEventListener('pointerleave', function () {
        space.style.setProperty('--look-x', '0');
        space.style.setProperty('--look-y', '0');
      });
    }
    var launch = root.querySelector('[data-cockpit-launch]');
    if (!launch) return;
    var going = false;
    var scene = null;
    launch.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (going) return;
      going = true;
      root.classList.add('is-launching');
      var label = launch.querySelector('.cockpit__launch-label') || launch;
      scene = playCutscene(label.textContent.trim(), launch.getAttribute('href'), launch);
    });
    // Coming back with the back button must not leave the cabin mid-launch.
    window.addEventListener('pageshow', function () {
      going = false;
      root.classList.remove('is-launching');
      if (scene) { scene.dispose(); scene = null; }
    });
  }

  function boot() {
    var root = document.querySelector('[data-cockpit]');
    if (!root) return;
    render(document);
    wireMotion(root);
    document.addEventListener('pypath:progress', function () { render(document); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.PyPathCockpit = { state: state, readProgress: readProgress, render: render, wire: wireMotion, navigate: navigate };
})();
