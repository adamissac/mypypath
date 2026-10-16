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

  window.PyPathCockpit = { state: state, readProgress: readProgress, render: render, wire: wireMotion };
})();
