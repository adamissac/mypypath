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

  window.PyPathCockpit = { state: state, readProgress: readProgress };
})();
