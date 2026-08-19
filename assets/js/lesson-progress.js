/* PyPath — lesson-level progress and the unit lock.

   A lesson passes once every interactive item on it has been dealt with:
   practice snippets must be run, graded exercises must actually be correct,
   and reflection prompts must have a saved answer. A unit completes when all
   of its lessons pass, and completing a unit unlocks the next one.

   Pure rules live on window.PyPathLessonProgress so they can be tested without
   a DOM; everything below the rules section only runs on a real lesson page. */
(function () {
  'use strict';

  // Deliberately not under the pypath-lesson- prefix: that namespace is saved
  // editor contents, and sharing it would make this look like lesson code.
  var STORE_KEY = 'pypath-progress-lessons';

  // ---------- pure rules ----------

  // Entry shape: { done: [itemId], passed: bool }. Partial progress and a pass
  // must be distinguishable -- keying on presence alone would let a learner
  // complete a unit by touching one item in every lesson.
  function normalizeMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    var out = {};
    Object.keys(raw).forEach(function (path) {
      var v = raw[path];
      if (!v) return;
      var done = null;
      var passed = false;
      if (Array.isArray(v)) {
        // Legacy shape written before passed was tracked: treat as partial.
        done = v;
      } else if (typeof v === 'object' && Array.isArray(v.done)) {
        done = v.done;
        passed = v.passed === true;
      }
      if (!done) return;
      out[path] = {
        done: Array.from(new Set(done.filter(function (x) { return typeof x === 'string' && x; }))),
        passed: passed
      };
    });
    return out;
  }

  function lessonPassed(required, done) {
    if (!Array.isArray(required) || !Array.isArray(done)) return false;
    // A lesson with no interactive items cannot be "passed" by opening it.
    if (required.length === 0) return false;
    var have = {};
    done.forEach(function (id) { have[id] = true; });
    return required.every(function (id) { return have[id] === true; });
  }

  function passedLessons(map) {
    var norm = normalizeMap(map);
    return Object.keys(norm).filter(function (path) { return norm[path].passed === true; });
  }

  function unitComplete(lessonPaths, passedList) {
    if (!Array.isArray(lessonPaths) || lessonPaths.length === 0) return false;
    var passed = {};
    (passedList || []).forEach(function (p) { passed[p] = true; });
    return lessonPaths.every(function (p) { return passed[p] === true; });
  }

  // Unit 1 is always open. Every later unit needs the one before it finished.
  // completedUnits is the existing pypath-completed-units list, so units a
  // learner earned under the old visit-based rule stay unlocked.
  function isUnitUnlocked(unit, completedUnits) {
    var n = Number(unit);
    if (!Number.isInteger(n) || n < 1) return false;
    if (n === 1) return true;
    return (completedUnits || []).map(Number).indexOf(n - 1) !== -1;
  }

  function nextUnfinished(lessonPaths, passedList) {
    var passed = {};
    (passedList || []).forEach(function (p) { passed[p] = true; });
    var list = Array.isArray(lessonPaths) ? lessonPaths : [];
    for (var i = 0; i < list.length; i++) {
      if (!passed[list[i]]) return list[i];
    }
    return null;
  }

  window.PyPathLessonProgress = {
    STORE_KEY: STORE_KEY,
    normalizeMap: normalizeMap,
    lessonPassed: lessonPassed,
    passedLessons: passedLessons,
    unitComplete: unitComplete,
    isUnitUnlocked: isUnitUnlocked,
    nextUnfinished: nextUnfinished
  };

  // ---------- storage ----------

  function store() { return window.ProgressStore || null; }

  function readMap() {
    var s = store();
    if (!s) return {};
    try { return normalizeMap(JSON.parse(s.getItem(STORE_KEY) || '{}')); }
    catch (e) { return {}; }
  }

  function writeMap(map) {
    var s = store();
    if (!s) return;
    s.setItem(STORE_KEY, JSON.stringify(map));
  }

  function completedUnits() {
    var s = store();
    return s ? s.getCompletedUnits() : [];
  }

  // ---------- page wiring ----------

  var curriculum = window.PyPathCurriculum || null;
  var path = location.pathname;
  var unit = curriculum ? curriculum.unitOf(path) : null;

  function isLessonPage() {
    return /^\/units\/unit-\d+\/[^/]+\.html$/.test(path);
  }

  // Required item ids, read from the page itself so no manifest can drift.
  function requiredItems() {
    var exercises = Array.prototype.map.call(
      document.querySelectorAll('[data-exercise-id]'),
      function (el) { return el.getAttribute('data-exercise-id'); }
    ).filter(Boolean);

    var exSet = {};
    exercises.forEach(function (id) { exSet[id] = true; });

    // An exercise block carries both attributes; only the standalone editors
    // are practice snippets.
    var practice = Array.prototype.map.call(
      document.querySelectorAll('[data-editor-id]'),
      function (el) { return el.getAttribute('data-editor-id'); }
    ).filter(function (id) { return id && !exSet[id]; });

    var reflections = Array.prototype.map.call(
      document.querySelectorAll('.reflection-input'),
      function (el) { return el.id; }
    ).filter(Boolean);

    return practice.concat(exercises, reflections);
  }

  var required = [];

  function doneIds() {
    var entry = readMap()[path];
    return entry ? entry.done : [];
  }

  function rollUpUnit() {
    if (!curriculum || !unit) return;
    var passed = passedLessons(readMap());
    if (!unitComplete(curriculum.lessonsIn(unit), passed)) return;
    var units = completedUnits();
    if (units.indexOf(unit) !== -1) return;
    var s = store();
    if (!s) return;
    s.setCompletedUnits(units.concat([unit]));
    if (window.PyUI && window.PyUI.showToast) {
      window.PyUI.showToast('Unit ' + unit + ' complete — Unit ' + (unit + 1) + ' unlocked');
    }
  }

  function markItem(id) {
    if (!id || required.indexOf(id) === -1) return;
    var map = readMap();
    var entry = map[path];
    var done = entry ? entry.done.slice() : [];
    if (done.indexOf(id) !== -1) return;
    done.push(id);

    var wasPassed = !!(entry && entry.passed);
    var nowPassed = lessonPassed(required, done);
    map[path] = { done: done, passed: nowPassed };
    writeMap(map);
    paintProgress();

    if (nowPassed && !wasPassed) {
      if (window.PyUI && window.PyUI.showToast) {
        window.PyUI.showToast('Lesson complete');
      }
      rollUpUnit();
    }
  }

  function paintProgress() {
    var chip = document.querySelector('[data-lesson-progress]');
    if (!chip) return;
    var done = doneIds().filter(function (id) { return required.indexOf(id) !== -1; });
    var passed = lessonPassed(required, done);
    chip.textContent = passed
      ? 'Lesson complete'
      : done.length + ' of ' + required.length + ' done';
    chip.classList.toggle('is-complete', passed);
  }

  function insertChip() {
    var host = document.querySelector('.lesson-title');
    if (!host || document.querySelector('[data-lesson-progress]')) return;
    var chip = document.createElement('span');
    chip.className = 'lesson-progress-chip';
    chip.setAttribute('data-lesson-progress', '');
    host.insertAdjacentElement('afterend', chip);
  }

  // Soft lock: the content stays readable, but the learner is told plainly that
  // this unit is not open yet and where to go instead.
  function insertLockNotice() {
    if (!curriculum || !unit) return;
    if (isUnitUnlocked(unit, completedUnits())) return;
    if (document.querySelector('.unit-locked-notice')) return;

    var prev = unit - 1;
    var passed = passedLessons(readMap());
    var next = nextUnfinished(curriculum.lessonsIn(prev), passed);

    var box = document.createElement('div');
    box.className = 'unit-locked-notice';
    box.setAttribute('role', 'note');
    box.innerHTML =
      '<p class="unit-locked-notice__title">Unit ' + unit + ' is not unlocked yet</p>' +
      '<p>Finish every lesson in Unit ' + prev + ' to unlock it. You can keep reading ' +
      'ahead, but your progress counts from Unit ' + prev + '.</p>' +
      (next
        ? '<p><a class="btn btn-primary route" href="' + next + '">Go to the next Unit ' + prev + ' lesson</a></p>'
        : '<p><a class="btn btn-primary route" href="/units/unit-' + prev + '.html">Back to Unit ' + prev + '</a></p>');

    var main = document.querySelector('main');
    if (main) main.insertBefore(box, main.firstChild);
  }

  function wrapGlobals() {
    if (typeof window.runEditorCode === 'function' && !window.runEditorCode.__pp) {
      var origRun = window.runEditorCode;
      var run = function (id) {
        var r = origRun.apply(this, arguments);
        Promise.resolve(r).then(function () { markItem(id); }, function () {});
        return r;
      };
      run.__pp = true;
      window.runEditorCode = run;
    }

    if (typeof window.checkExercise === 'function' && !window.checkExercise.__pp) {
      var origCheck = window.checkExercise;
      var check = function (id) {
        var r = origCheck.apply(this, arguments);
        Promise.resolve(r).then(function () {
          // checkExercise does not return its verdict; the feedback element
          // carries it. Only a correct answer counts.
          var fb = document.getElementById('feedback-' + id);
          if (fb && fb.classList.contains('correct')) markItem(id);
        }, function () {});
        return r;
      };
      check.__pp = true;
      window.checkExercise = check;
    }
  }

  // exercises.js builds its Save button at runtime, so this is delegated.
  // It must be captured, not bubbled: the Save handler calls stopPropagation(),
  // so a listener on document would never see the click at all.
  function watchReflections() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.submit-btn');
      if (!btn) return;
      var item = btn.closest('.exercise-item');
      var input = item && item.querySelector('.reflection-input');
      if (input && input.id && input.value.trim()) markItem(input.id);
    }, true);

    // Not every reflection prompt sits inside an .exercise-item -- an inline one
    // never gets a Save button from exercises.js and would otherwise be
    // impossible to complete, which would strand a learner on lesson one.
    // Committing an answer counts on its own.
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.classList || !el.classList.contains('reflection-input')) return;
      if (el.id && el.value.trim()) markItem(el.id);
    }, true);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (isLessonPage()) {
      required = requiredItems();
      insertChip();
      paintProgress();
      wrapGlobals();
      watchReflections();
    }
    insertLockNotice();
  });
})();
