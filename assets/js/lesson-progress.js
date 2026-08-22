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

  // The end-of-unit test results, written by unit-test-page.js. Read here
  // because a unit is not finished until its test is passed.
  var UNIT_TESTS_KEY = 'pypath-unit-tests';

  // Mirrors PASS_MARK in unit-test.js. That file is not loaded on a lesson
  // page, and a lesson page must still be able to tell whether a unit is
  // finished, so the number is repeated rather than depended on.
  var UNIT_TEST_PASS_MARK = 70;

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

  // `records` is the pypath-unit-tests blob: unit number as a string, keyed to
  // a record carrying `best` and `passed`. Trust `best` over `passed` as well
  // as it, so a record written before the flag existed, or one where the flag
  // was lost in a merge, still counts a score that cleared the bar.
  function unitTestPassed(records, unit) {
    if (!records || typeof records !== 'object' || Array.isArray(records)) return false;
    var n = Number(unit);
    if (!Number.isInteger(n) || n < 1) return false;
    var entry = records[String(n)];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    if (entry.passed === true) return true;
    var best = Number(entry.best);
    return isFinite(best) && best >= UNIT_TEST_PASS_MARK;
  }

  // A unit is finished when every lesson in it has passed AND its end of unit
  // test has passed. Splitting the two conditions keeps each one testable, and
  // keeps `unitComplete` meaning what it always meant to its other callers.
  function unitFinished(lessonPaths, passedList, testRecords, unit) {
    return unitComplete(lessonPaths, passedList) && unitTestPassed(testRecords, unit);
  }

  // Unit 1 is always open. Every later unit needs the one before it finished.
  // completedUnits is the existing pypath-completed-units list, so units a
  // learner earned under the old visit-based rule stay unlocked.
  //
  // A teacher has the whole course open. The lock exists to keep a learner
  // moving in order; a teacher previewing unit 7 for tomorrow's class is not a
  // learner, and making them grind unit 1 first would be absurd.
  function isUnitUnlocked(unit, completedUnits, teaching) {
    var n = Number(unit);
    if (!Number.isInteger(n) || n < 1) return false;
    if (teaching === true) return true;
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

  /* How far through one unit this learner is, from their own stored map.
   *
   * The counterpart to classroom-core's unitProgress, which computes the same
   * figure for a teacher out of the event log. Both hand the counts to
   * PyPathUnitProgress so the two can never report different numbers for the
   * same state. */
  function unitBreakdown(unit) {
    var n = Number(unit);
    var paths = curriculum ? curriculum.lessonsIn(n) : [];
    var map = readMap();
    var passed = {};
    passedLessons(map).forEach(function (p) { passed[p] = true; });

    var lessonsPassed = 0;
    var lessonsStarted = 0;
    paths.forEach(function (path) {
      if (passed[path]) lessonsPassed += 1;
      // Started means some item on the page is ticked off, which is a
      // different fact from having finished it and is worth showing.
      var entry = map[path];
      if (entry && entry.done && entry.done.length) lessonsStarted += 1;
    });

    var records = testRecords();
    var record = records[String(n)] || null;
    var counts = {
      unit: n,
      lessonsTotal: paths.length,
      lessonsPassed: lessonsPassed,
      lessonsStarted: lessonsStarted,
      testPassed: unitTestPassed(records, n),
      testBest: record && isFinite(Number(record.best)) ? Number(record.best) : null
    };

    var UP = window.PyPathUnitProgress;
    counts.percent = UP ? UP.percentFor(counts) : 0;
    // Deliberately the roll-up rule rather than the percentage: a rounding
    // change must never be able to complete a unit.
    counts.complete = completedUnits().indexOf(n) !== -1
      || (UP ? UP.isComplete(counts) : false);
    counts.summary = UP ? UP.describe(counts) : '';
    return counts;
  }

  function allUnitBreakdowns() {
    var total = curriculum ? (curriculum.TOTAL_UNITS || 10) : 10;
    var out = [];
    for (var n = 1; n <= total; n++) out.push(unitBreakdown(n));
    return out;
  }

  window.PyPathLessonProgress = {
    STORE_KEY: STORE_KEY,
    UNIT_TESTS_KEY: UNIT_TESTS_KEY,
    UNIT_TEST_PASS_MARK: UNIT_TEST_PASS_MARK,
    normalizeMap: normalizeMap,
    lessonPassed: lessonPassed,
    passedLessons: passedLessons,
    unitComplete: unitComplete,
    unitTestPassed: unitTestPassed,
    unitFinished: unitFinished,
    isUnitUnlocked: isUnitUnlocked,
    nextUnfinished: nextUnfinished,
    unitBreakdown: unitBreakdown,
    allUnitBreakdowns: allUnitBreakdowns,
    // The test page finishes a unit from a URL that is not a lesson page, so
    // it needs a way to ask for the roll-up by number rather than by location.
    rollUpUnitNumber: function (n) { return rollUpUnitNumber(n); }
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

  // Through ProgressStore rather than localStorage, so a value that arrived
  // from sync is read the same way the test page wrote it. A blob that will
  // not parse reads as no attempts, never a throw: failing to read a test
  // result must not take down the lesson page around it.
  function testRecords() {
    var s = store();
    if (!s) return {};
    try {
      var parsed = JSON.parse(s.getItem(UNIT_TESTS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  // ---------- page wiring ----------

  var curriculum = window.PyPathCurriculum || null;
  var path = location.pathname;
  var unit = curriculum ? curriculum.unitOf(path) : null;

  function isLessonPage() {
    return /^\/units\/unit-\d+\/[^/]+\.html$/.test(path);
  }

  function isUnitPage() {
    return /^\/units\/unit-\d+\.html$/.test(path);
  }

  // Read afresh on every call rather than captured once: role-nav.js resolves
  // the role from Firestore after this file has already run.
  function teaching() {
    var R = window.PyPathRoles;
    return !!(R && R.teachingNow());
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

  // Only ever adds. A unit already in pypath-completed-units stays there even
  // if the new test condition would not grant it today, so learners who
  // finished a unit before end-of-unit tests existed keep what they earned.
  function rollUpUnitNumber(n) {
    var target = Number(n);
    if (!curriculum || !Number.isInteger(target) || target < 1) return false;
    var passed = passedLessons(readMap());
    if (!unitFinished(curriculum.lessonsIn(target), passed, testRecords(), target)) return false;
    var units = completedUnits();
    if (units.indexOf(target) !== -1) return false;
    var s = store();
    if (!s) return false;
    s.setCompletedUnits(units.concat([target]));

    /* The phase brief expected this to be self-reported and always
       verified:false. It is not: unitFinished() above already requires
       unitTestPassed(), so reaching this line means the end-of-unit test was
       passed and the honest value is true. It is recomputed rather than
       assumed, so that if the roll-up rule is ever loosened again the flag
       follows it instead of quietly lying to a teacher. */
    if (window.PyPathEvents) {
      try {
        window.PyPathEvents.record('unit.completed', {
          unit: target,
          verified: unitTestPassed(testRecords(), target)
        });
      } catch (e) {}
    }

    var total = curriculum.TOTAL_UNITS || 10;
    if (window.PyUI && window.PyUI.showToast) {
      window.PyUI.showToast(target >= total
        ? 'Unit ' + target + ' complete. That is the last unit.'
        : 'Unit ' + target + ' complete. Unit ' + (target + 1) + ' is unlocked.');
    }
    return true;
  }

  function rollUpUnit() {
    if (!unit) return false;
    return rollUpUnitNumber(unit);
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
    // A teacher has no learner progress worth counting, and "0 of 6 done" on
    // every lesson they open reads as homework they owe.
    chip.hidden = teaching();
    var done = doneIds().filter(function (id) { return required.indexOf(id) !== -1; });
    var passed = lessonPassed(required, done);
    chip.textContent = passed
      ? 'Lesson complete'
      : done.length + ' of ' + required.length + ' done';
    chip.classList.toggle('is-complete', passed);
  }

  // ---------- lesson check-off ----------

  // Every lesson link on a unit page carries the learner's own state: a tick
  // once the lesson has passed, a dot once it has been started. Painted from
  // the same map the lesson pages write, so finishing a sublesson checks it off
  // the moment the learner comes back to the unit -- and, because
  // ProgressStore emits pypath:progress on every write, the instant a sync from
  // another device lands too.
  function isLessonHref(href) {
    return /^\/units\/unit-\d+\/[^/]+\.html$/.test(String(href || ''));
  }

  function lessonState(entry) {
    if (!entry) return '';
    if (entry.passed) return 'done';
    return entry.done.length ? 'started' : '';
  }

  function markLessonLink(a, state) {
    var li = a.closest('li') || a;
    li.classList.toggle('is-lesson-done', state === 'done');
    li.classList.toggle('is-lesson-started', state === 'started');

    var mark = a.querySelector('[data-lesson-check]');
    if (!state) {
      if (mark) mark.remove();
      return;
    }
    if (!mark) {
      mark = document.createElement('span');
      mark.setAttribute('data-lesson-check', '');
      mark.setAttribute('role', 'img');
      a.appendChild(mark);
    }
    mark.className = 'lesson-check lesson-check--' + state;
    mark.setAttribute('aria-label', state === 'done' ? 'Complete' : 'Started');
    mark.textContent = state === 'done' ? '✓' : '•';
  }

  function paintLessonSummary(list, total, done) {
    var chip = document.querySelector('[data-unit-lesson-summary]');
    // Nothing to count, or a teacher looking at a class's curriculum rather
    // than their own progress.
    if (!total || teaching()) {
      if (chip) chip.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement('p');
      chip.className = 'unit-lesson-summary';
      chip.setAttribute('data-unit-lesson-summary', '');
      list.insertAdjacentElement('beforebegin', chip);
    }
    chip.textContent = done === total
      ? 'All ' + total + ' lessons complete.'
      : done + ' of ' + total + ' lessons complete.';
    chip.classList.toggle('is-complete', done === total);
  }

  function paintLessonList() {
    var lists = document.querySelectorAll('.unit-lesson-list');
    if (!lists.length) return;

    var map = readMap();
    var teacher = teaching();
    var total = 0;
    var done = 0;

    Array.prototype.forEach.call(lists, function (list) {
      Array.prototype.forEach.call(list.querySelectorAll('a[href]'), function (a) {
        var href = a.getAttribute('href');
        if (!isLessonHref(href)) return;
        total++;
        var state = lessonState(map[href]);
        if (state === 'done') done++;
        markLessonLink(a, teacher ? '' : state);
      });
    });

    paintLessonSummary(lists[0], total, done);
  }

  function insertChip() {
    var host = document.querySelector('.lesson-title');
    if (!host || document.querySelector('[data-lesson-progress]')) return;
    var chip = document.createElement('span');
    chip.className = 'lesson-progress-chip';
    chip.setAttribute('data-lesson-progress', '');
    host.insertAdjacentElement('afterend', chip);
  }

  // <main> has no gutters of its own — the page's .container is what carries
  // them — so anything dropped straight into it sits flush against the window
  // edge. Every banner painted here goes through this wrapper instead.
  function prependNotice(box) {
    var main = document.querySelector('main');
    if (!main) return;
    var wrap = document.createElement('div');
    wrap.className = 'main-notice-wrap';
    wrap.appendChild(box);
    main.insertBefore(wrap, main.firstChild);
  }

  function removeNotice(box) {
    if (!box) return;
    var wrap = box.closest('.main-notice-wrap');
    (wrap || box).remove();
  }

  // Soft lock: the content stays readable, but the learner is told plainly that
  // this unit is not open yet and where to go instead.
  function insertLockNotice() {
    if (!curriculum || !unit) return;
    if (isUnitUnlocked(unit, completedUnits(), teaching())) {
      // The role can resolve after the notice has already been painted, so
      // this clears one that a teacher should never have seen.
      removeNotice(document.querySelector('.unit-locked-notice'));
      return;
    }
    if (document.querySelector('.unit-locked-notice')) return;

    var prev = unit - 1;
    var passed = passedLessons(readMap());
    var next = nextUnfinished(curriculum.lessonsIn(prev), passed);
    // Once the lessons are all done the only thing left is the test, so point
    // at the test rather than back at lessons the learner has already finished.
    var lessonsDone = unitComplete(curriculum.lessonsIn(prev), passed);
    var testDone = unitTestPassed(testRecords(), prev);

    var box = document.createElement('div');
    box.className = 'unit-locked-notice';
    box.setAttribute('role', 'note');
    box.innerHTML =
      '<p class="unit-locked-notice__title">Unit ' + unit + ' is not unlocked yet</p>' +
      '<p>Finish every lesson in Unit ' + prev + ' and pass the Unit ' + prev + ' test to ' +
      'unlock it. You can keep reading ahead, but your progress counts from Unit ' + prev + '.</p>' +
      (lessonsDone && !testDone
        ? '<p><a class="btn btn-primary route" href="/unit-test.html?unit=' + prev + '">Take the Unit ' + prev + ' test</a></p>'
        : next
          ? '<p><a class="btn btn-primary route" href="' + next + '">Go to the next Unit ' + prev + ' lesson</a></p>'
          : '<p><a class="btn btn-primary route" href="/units/unit-' + prev + '.html">Back to Unit ' + prev + '</a></p>');

    prependNotice(box);
  }

  // The end of unit test links on the unit pages and the curriculum are real
  // markup, so they work with JavaScript off. Only the score line needs the
  // stored record, so only that is painted here.
  function testStatusLine(records, n) {
    var entry = records[String(n)];
    var passed = unitTestPassed(records, n);
    // Anything that is not a usable record reads as no attempt. A blob a stale
    // client or a bad merge left behind must not show a learner a score of 0
    // they never sat for.
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { text: 'Not attempted yet.', passed: false, attempted: false };
    }

    var best = Number(entry.best);
    if (passed) {
      return {
        text: isFinite(best) ? 'Passed, with a best score of ' + best + ' out of 100.' : 'Passed.',
        passed: true,
        attempted: true
      };
    }
    return {
      text: 'Best score ' + (isFinite(best) ? best : 0) + ' out of 100. You need ' +
        UNIT_TEST_PASS_MARK + ' to pass.',
      passed: false,
      attempted: true
    };
  }

  function paintTestEntries() {
    var nodes = document.querySelectorAll('[data-unit-test-status]');
    if (!nodes.length) return;
    var records = testRecords();

    Array.prototype.forEach.call(nodes, function (node) {
      var n = Number(node.getAttribute('data-unit-test-status'));
      if (!Number.isInteger(n) || n < 1) return;

      var state = testStatusLine(records, n);
      node.textContent = state.text;
      node.classList.toggle('is-pass', state.passed);
      node.classList.toggle('is-attempted', state.attempted);
      node.hidden = false;

      // A learner who has already passed is retaking, not taking. Saying so
      // stops the button reading like unfinished work they still owe. All of
      // them, because the last lesson in a unit carries two: one in the header
      // actions and one in the end of unit card at the foot of the page. Only
      // a plain text link is rewritten: the curriculum list wraps its label in
      // spans, and replacing its text would flatten the whole card.
      var links = document.querySelectorAll('[data-unit-test-link="' + n + '"]');
      if (!state.passed) return;
      Array.prototype.forEach.call(links, function (link) {
        if (link.children.length === 0) link.textContent = 'Retake the Unit ' + n + ' test';
      });
    });
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

  // Says out loud what the missing lock notice already implies: this account is
  // reading the course as a teacher, not working through it.
  function paintTeacherBanner() {
    var existing = document.querySelector('.teacher-view-note');
    if (!teaching() || !(isLessonPage() || isUnitPage())) {
      removeNotice(existing);
      return;
    }
    if (existing) return;

    var box = document.createElement('div');
    box.className = 'teacher-view-note';
    box.setAttribute('role', 'note');
    box.innerHTML =
      '<p class="teacher-view-note__title">Teacher view</p>' +
      '<p>Every unit and lesson is open to you, and nothing you do here is ' +
      'graded or counted as progress. ' +
      '<a class="route" href="/classroom.html">Open your classroom</a> to see how ' +
      'your students are doing.</p>';

    prependNotice(box);
  }

  function repaint() {
    if (isLessonPage()) paintProgress();
    insertLockNotice();
    paintTeacherBanner();
    paintLessonList();
    paintTestEntries();
  }

  // pypath:progress fires on every ProgressStore write, and lesson-runner.js
  // writes the editor contents on every CodeMirror change -- so on a lesson
  // page this arrives once per keystroke. Repainting synchronously would put a
  // full re-read and re-parse of the progress map in the typing path. One
  // repaint per frame is as often as any of this can be seen.
  var queued = false;

  function repaintSoon() {
    if (queued) return;
    queued = true;
    var run = function () {
      queued = false;
      repaint();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (isLessonPage()) {
      required = requiredItems();
      insertChip();
      wrapGlobals();
      watchReflections();
    }
    repaint();
  });

  // A write from this page, a value arriving from another device through
  // sync.js, or the role finally resolving -- all three change what the ticks
  // and the lock notice should say. The role lands once and is worth showing
  // immediately; progress writes arrive in floods.
  document.addEventListener('pypath:progress', repaintSoon);
  document.addEventListener('pypath:role', repaint);
})();
