/* PyPath — lesson-level progress and the unit lock.

   A lesson passes once every interactive item on it has been dealt with:
   practice snippets must be run, graded exercises must actually be correct,
   and reflection prompts must have a saved answer. A unit completes when all
   of its lessons pass, and completing a unit unlocks the next one.

   Pure rules live on window.PyPathLessonProgress so they can be tested without
   a DOM; everything below the rules section only runs on a real lesson page. */
(function () {
  'use strict';

  var KEYS = window.PyPathKeys;

  // Deliberately not under the pypath-lesson- prefix: that namespace is saved
  // editor contents, and sharing it would make this look like lesson code.
  // The literals are the degraded-mode fallback for a page where
  // storage-keys.js did not load, as in progress-store.js.
  var STORE_KEY = (KEYS && KEYS.LESSON_PROGRESS_KEY) || 'pypath-progress-lessons';

  // The end-of-unit test results, written by unit-test-page.js. Read here
  // because a unit is not finished until its test is passed.
  var UNIT_TESTS_KEY = (KEYS && KEYS.UNIT_TESTS_KEY) || 'pypath-unit-tests';

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

  /* Whether this unit's end-of-unit test has actually been cleared.
   *
   * `records` is the pypath-unit-tests blob: unit number as a string, keyed to
   * a record carrying `best` and `passed`. The score decides whenever there is
   * one, and the stored flag cannot override it.
   *
   * That is a narrowing, and a careful one. This used to return true for any
   * record carrying `passed: true` whatever its score, so a stored flag beside
   * a best of 30 unlocked the next unit -- the one way "score 70 or higher" was
   * not literally true. `passed` is derived from `best` by mergeAttempt and
   * `best` only ever ratchets upward, so that combination cannot come from
   * sitting the test; it comes from a hand-edited store or a bad merge.
   *
   * The flag still stands when there is no score at all beside it. A record
   * that carries nothing but `passed: true` predates `best` or was truncated
   * mid-write, and the flag is then the only evidence there is -- refusing it
   * would take a unit away from somebody who really did pass. What changed is
   * only that a score present and below the mark now wins the argument.
   *
   * Nothing already earned is lost either way. completedUnits is a ratchet that
   * only ever adds -- see rollUpUnitNumber -- so a learner who has finished a
   * unit keeps it and keeps everything it unlocked. This decides future
   * roll-ups only.
   */
  function unitTestPassed(records, unit) {
    if (!records || typeof records !== 'object' || Array.isArray(records)) return false;
    var n = Number(unit);
    if (!Number.isInteger(n) || n < 1) return false;
    var entry = records[String(n)];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    var best = Number(entry.best);
    if (isFinite(best)) return best >= UNIT_TEST_PASS_MARK;
    return entry.passed === true;
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
  // WHERE THE SEQUENTIAL CHAIN IS ENFORCED, and it is only here. "In order"
  // asks whether this learner finished the unit before, and the only record of
  // that is one their own browser wrote, so firestore.rules cannot check it and
  // deliberately does not try -- see the note above validEvent() there. This is
  // a browser-side rule, the same honest limit maxTestAttempts documents about
  // itself: it raises the bar for a learner clicking around, and a learner who
  // opens devtools is not what it is for. "By hand" is the mode with a real
  // server-side lock behind it.
  //
  // A teacher has the whole course open. The lock exists to keep a learner
  // moving in order; a teacher previewing unit 7 for tomorrow's class is not a
  // learner, and making them grind unit 1 first would be absurd.
  //
  // `policy` is optional and is the class's lock settings, or null when there
  // are none to be had. Every caller that predates class lock modes passes
  // three arguments, gets null, and gets exactly the answer it always got.
  //
  // It arrives as an argument rather than as a Firestore read inside this
  // function on purpose. The function stays pure, stays synchronous, stays
  // testable with no DOM, and keeps answering for a guest with no network. The
  // read lives in class-policy.js, which announces pypath:policy when it lands.
  function isUnitUnlocked(unit, completedUnits, teaching, policy) {
    var POLICY = window.PyPathPolicy;
    if (POLICY) return POLICY.resolveUnlocked(unit, policy || null, completedUnits, teaching);

    // Degraded mode for a page where classroom-policy.js did not load, in the
    // same spirit as the storage-key literals at the top of this file.
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

  /* Whether this page's unit is shut to this learner right now.
   *
   * The one question the hard lock asks. Kept beside teaching() rather than in
   * the pure-rules section above because it reads the page's own unit and the
   * policy this file is holding, and because every caller below wants the same
   * four arguments filled in the same way.
   *
   * A page that is not part of a unit is never locked: the answer for the
   * sandbox, the curriculum page and everything else is "no". */
  function unitLocked() {
    if (!unit) return false;
    return !isUnitUnlocked(unit, completedUnits(), teaching(), classPolicy);
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

  // The class's lock settings, once class-policy.js has read them. Null until
  // then, and null forever for a guest or a learner in no class, which is the
  // fail-open case isUnitUnlocked is built around.
  var classPolicy = null;

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
    // A locked unit does not complete. This is the half of the hard lock that
    // decides credit rather than access: the record stays honest, and nothing
    // is added to completedUnits or announced to a teacher for work the class
    // was not open for. It is checked for the unit being rolled up rather than
    // for the page's own unit, because the test page calls this from a URL
    // that belongs to no unit at all -- and because the lock screen takes the
    // lesson off the page but is not the thing that decides credit.
    if (!isUnitUnlocked(target, completedUnits(), teaching(), classPolicy)) return false;
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
    // Nothing on a locked unit is ticked off. The lock screen means a student
    // is not normally holding an exercise to tick in the first place, but this
    // is the guard that does not depend on the DOM: it still covers the moment
    // between the page parsing and the screen painting, a control left over
    // from an earlier paint, and anything driven from the console.
    if (unitLocked()) return;
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

  /* ---------- the lock screen ----------

     What a locked unit shows instead of its lesson.

     This used to be a banner sitting on top of a fully working lesson: the
     notice said the exercises were off and would not count, and the lesson
     itself stayed on the page to be read. That is no longer what a lock means
     here. A locked unit shows the lock screen and nothing of the lesson --
     not the overview, not the explanations, not the exercises.

     The lesson body is taken out of the document rather than hidden. A rule
     that only sets display:none is undone by a stylesheet the student
     controls, and "you can read it if you turn CSS off" is not a lock, it is a
     suggestion.

     What tier of protection this actually is, said here as plainly as the
     teacher-facing copy for Exercise solutions and Test retakes says it about
     themselves: every lesson is a static file that ships with the site, and
     this code runs in the student's own browser. It stops a student clicking
     into a locked unit and reading it, which is what it is for. It does not
     put the file out of reach of somebody who goes looking for it directly --
     by URL, in the network tab, or in the site's source -- and nothing in this
     file or on screen should be read as claiming that it does. It is the same
     tier as every other gate in this codebase.

     It is also client-side in time as well as in place: the lesson is in the
     document from the moment the page is parsed until this runs on
     DOMContentLoaded, so a locked lesson can flash on screen before it is
     removed. Hiding the whole lesson column in CSS until this had decided
     would trade that flash for a site that shows a learner with JavaScript off
     nothing at all, on every lesson, which is the worse of the two.

     The rest of the lock is unchanged and is where the enforcement lives:
     markItem() refuses to tick, rollUpUnitNumber() refuses to complete the
     unit, unit-test-page.js refuses to open or restore a paper, and the events
     rule in firestore.rules refuses the writes that would count. */

  // The parts of a lesson page that say which lesson this is rather than what
  // it teaches. These stay: a student is allowed to know the name of the thing
  // they cannot open yet, which is the same call the unit lists make.
  var LESSON_FURNITURE = [
    '.sidebar-toggle',
    'nav[aria-label="Breadcrumb"]',
    '.breadcrumb',
    '.eyebrow',
    '.lesson-title',
    '.main-notice-wrap',
    '.unit-lock-screen'
  ].join(',');

  // The lesson column. On a unit page there is none, and there is nothing to
  // stow there anyway: a unit page is a list of lesson titles, not a lesson.
  function lessonHost() {
    return document.querySelector('.course-main') || document.querySelector('main');
  }

  function isFurniture(node) {
    // Text and comments are whitespace between blocks; nothing is read from
    // them and moving them about would only churn the document.
    if (node.nodeType !== 1) return true;
    return typeof node.matches === 'function' && node.matches(LESSON_FURNITURE);
  }

  /* The lesson body while its unit is shut.
   *
   * Held aside rather than destroyed, because a unit can open in the middle of
   * a session -- a teacher ticks it, or a test result lands -- and rebuilding
   * the lesson would mean reloading the page. A comment node stays where each
   * removed node was, so what comes back comes back in its own place and in
   * its own order rather than in a heap at the bottom.
   *
   * Detached nodes are not in the document: querySelector cannot find them,
   * getElementById cannot find them, and an event fired inside one never
   * reaches the listeners on document. That is the point. */
  var stowed = null;

  function stowLessonBody() {
    if (stowed) return;
    var host = lessonHost();
    if (!host) return;
    var items = [];
    Array.prototype.slice.call(host.childNodes).forEach(function (node) {
      if (isFurniture(node)) return;
      var mark = document.createComment(' unit locked ');
      host.replaceChild(mark, node);
      items.push({ mark: mark, node: node });
    });
    stowed = { host: host, items: items };
  }

  function restoreLessonBody() {
    if (!stowed) return;
    stowed.items.forEach(function (item) {
      if (item.mark.parentNode) item.mark.parentNode.replaceChild(item.node, item.mark);
    });
    stowed = null;
  }

  // Where the lock screen goes: in place of the lesson, if there was one to
  // take away, and otherwise at the top of <main> the way every other notice
  // on this page is placed.
  function placeLockScreen(box) {
    if (stowed && stowed.items.length && stowed.items[0].mark.parentNode) {
      var first = stowed.items[0].mark;
      first.parentNode.insertBefore(box, first);
      return;
    }
    prependNotice(box);
  }

  function removeLockScreen(box) {
    if (!box) return;
    removeNotice(box);
  }

  /* What the student can do instead, as links.
   *
   * The same three the old notice offered, kept because they are the honest
   * answer to "then what": their own progress, the previous unit's test when
   * that is the only thing left, and the next lesson they have not finished. */
  function wayOut(teacherSet) {
    var progress = '<a class="btn btn-ghost route" href="/progress.html">See your progress</a>';

    if (teacherSet) {
      // Under a teacher's list there is no "previous unit" to point at: the
      // student may well have finished it already. What is open to them is
      // whatever their teacher ticked, so send them to the course itself.
      return '<a class="btn btn-primary route" href="/curriculum.html">See what is open to you</a>' + progress;
    }

    var prev = unit - 1;
    var passed = passedLessons(readMap());
    var next = nextUnfinished(curriculum.lessonsIn(prev), passed);
    // Once the lessons are all done the only thing left is the test, so point
    // at the test rather than back at lessons the learner has already finished.
    var lessonsDone = unitComplete(curriculum.lessonsIn(prev), passed);
    var testDone = unitTestPassed(testRecords(), prev);

    var first = lessonsDone && !testDone
      ? '<a class="btn btn-primary route" href="/unit-test.html?unit=' + prev + '">Take the Unit ' + prev + ' test</a>'
      : next
        ? '<a class="btn btn-primary route" href="' + next + '">Go to the next Unit ' + prev + ' lesson</a>'
        : '<a class="btn btn-primary route" href="/units/unit-' + prev + '.html">Back to Unit ' + prev + '</a>';

    return first + progress;
  }

  /* The decorative backdrop: a page-shaped blur behind the card.
   *
   * Worth being exact about what this is, because it looks like the thing the
   * last rework deliberately stopped doing. It is not the lesson blurred. It is
   * a handful of empty rounded bars, aria-hidden, carrying no text at all --
   * the shape of a page rather than a page. Turning CSS off reveals nothing,
   * because there is nothing under there to reveal.
   *
   * The auth gate in gate.css does blur real lesson text, which is a weaker
   * position on a different question and not one to copy here. */
  function ghostHTML() {
    var bars = ['92%', '78%', '85%', '64%', '88%', '71%', '81%', '58%'];
    var out = '<div class="unit-lock-screen__ghost" aria-hidden="true">' +
      '<span class="unit-lock-screen__ghost-orb"></span>' +
      '<span class="unit-lock-screen__ghost-orb"></span>' +
      '<div class="unit-lock-screen__ghost-page">' +
      '<span class="unit-lock-screen__ghost-head"></span>';
    for (var i = 0; i < bars.length; i++) {
      out += '<span class="unit-lock-screen__ghost-line" style="width:' + bars[i] + '"></span>';
    }
    return out + '<span class="unit-lock-screen__ghost-block"></span></div></div>';
  }

  // Lucide's eye, for the teacher banner. The badge carries the meaning of the
  // whole bar -- you are looking at this as somebody else -- so it is an eye
  // rather than a decorative dot.
  var EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>' +
    '<circle cx="12" cy="12" r="3"/></svg>';

  // Lucide's lock, inlined. icons.js is not loaded on every page this can
  // appear on, and one shape is not worth a dependency.
  var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  function lockScreenHTML(teacherSet, hidLesson) {
    // Which sentence is true depends on why this unit is shut, and getting it
    // wrong is not a cosmetic slip.
    //
    // Under the sequential chain the reason is "you have not finished the unit
    // before this one", and the screen says so. Under a teacher's manual list
    // that sentence can be flatly false: a student who finished Unit 3, passed
    // its test, and then had Unit 4 closed by their teacher would be told to go
    // and do work they have already done. Their progress record still shows
    // every bit of it -- this lock only decides what is reachable, and never
    // touches completedUnits, the mastery grid or the certificate -- so a
    // screen implying otherwise would be the one thing on the page that lies
    // about them.
    //
    // `hidLesson` is the difference between a lesson page, where the lesson has
    // just been taken away, and a unit page, which is a list of titles and has
    // nothing to take away.
    var gone = hidLesson
      ? 'The lesson is not shown while the unit is shut.'
      : 'The lessons in it are not open yet.';

    var title, body;
    if (teacherSet) {
      title = 'Unit ' + unit + ' is not open yet';
      body = 'Your teacher chooses which units are open for your class, and ' +
        'this one is not open at the moment. ' + gone + ' Nothing you have ' +
        'already finished is affected, and nothing here has been taken off ' +
        'your record. Ask your teacher if you think it should be open.';
    } else {
      var prev = unit - 1;
      title = 'Unit ' + unit + ' is not unlocked yet';
      body = 'Finish every lesson in Unit ' + prev + ' and score ' +
        UNIT_TEST_PASS_MARK + ' or higher on the Unit ' + prev + ' test to ' +
        'unlock it. ' + gone + ' Your progress counts from Unit ' + prev + '.';
    }

    // The ghost only earns its place where a lesson was actually taken away. On
    // a unit page the card sits above a real list of lessons, and a decorative
    // blur above real content would read as that content being obscured.
    return (hidLesson ? ghostHTML() : '') +
      '<div class="unit-lock-screen__card">' +
      '<span class="unit-lock-screen__badge">' + LOCK_SVG + '</span>' +
      '<p class="unit-lock-screen__eyebrow">Locked &middot; Unit ' + unit + '</p>' +
      '<h2 class="unit-lock-screen__title">' + title + '</h2>' +
      '<p class="unit-lock-screen__body">' + body + '</p>' +
      '<p class="unit-lock-screen__actions">' + wayOut(teacherSet) + '</p>' +
      '</div>';
  }

  function paintLockScreen() {
    if (!curriculum || !unit) return;
    if (isUnitUnlocked(unit, completedUnits(), teaching(), classPolicy)) {
      // Both of these undo a lock that should not have been applied. The role
      // and the class policy both resolve after this file has already painted
      // once, so a teacher opening their own curriculum, and a student whose
      // teacher has this unit ticked, both start on the locked branch and
      // arrive here a moment later. The lesson has to come back for them.
      removeLockScreen(document.querySelector('.unit-lock-screen'));
      restoreLessonBody();
      return;
    }

    var teacherSet = classPolicy && window.PyPathPolicy
      && window.PyPathPolicy.normalizeMode(classPolicy.mode) === 'manual';
    var variant = teacherSet ? 'teacher' : 'sequential';

    // Take the lesson away first, so that on the frame this paints there is no
    // window in which both the lesson and the screen explaining its absence
    // are on the page together.
    if (isLessonPage()) stowLessonBody();
    var hidLesson = !!(stowed && stowed.items.length);

    // The class policy is fetched after this first runs, so the screen is
    // painted from the sequential fallback and then reconsidered once the real
    // answer lands. Returning early on "a screen exists" left whichever
    // sentence won the race on screen for good, which meant a student locked
    // out by their teacher was reliably told to go and redo Unit 3. Re-render
    // when the reason changes; leave it alone when it has not.
    var showing = document.querySelector('.unit-lock-screen');
    if (showing) {
      if (showing.getAttribute('data-lock-variant') === variant) return;
      removeLockScreen(showing);
    }

    var box = document.createElement('div');
    // The full-height treatment only where the lesson is actually gone. On a
    // unit page this is a card above a list, and a screenful of empty space
    // above a list the student can use would be a worse page, not a nicer one.
    box.className = 'unit-lock-screen' + (hidLesson ? ' is-stage' : ' is-inline');
    box.setAttribute('role', 'note');
    // What this screen is claiming, so a later pass can tell whether the
    // reason has changed under it.
    box.setAttribute('data-lock-variant', variant);
    // Whether a lesson was actually taken off this page, so a test can tell
    // the lesson-page case from the unit-page one without reading the copy.
    box.setAttribute('data-lesson-hidden', hidLesson ? 'true' : 'false');
    box.innerHTML = lockScreenHTML(teacherSet, hidLesson);

    placeLockScreen(box);
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
  // The prompt this box is answering, so the floor can tell a real answer from
  // the question pasted back. Best effort: a lesson that does not label its
  // reflection simply gets the checks that need no prompt.
  function promptFor(input) {
    var item = input.closest ? input.closest('.exercise-item') : null;
    var label = item && (item.querySelector('.exercise-prompt')
      || item.querySelector('h3')
      || item.querySelector('p'));
    return label ? label.textContent : '';
  }

  // Beside the box, never in place of it, and cleared as soon as it passes.
  function sayWhy(input, reason) {
    var host = input.parentNode;
    if (!host) return;
    var note = host.querySelector('.reflection-note');
    if (!reason) {
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement('p');
      note.className = 'reflection-note';
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      input.insertAdjacentElement('afterend', note);
    }
    note.textContent = reason;
  }

  /* A reflection counts once there is actually an answer in the box.
   *
   * Until now it counted the instant the box was not empty, so one character
   * finished it. The floor in reflection-check.js is structural only: it says
   * whether something was written, never whether it was any good.
   *
   * It gates the tick and nothing else. The learner is told what is missing,
   * edits, and saves again as often as they like. Nothing is locked, nothing
   * is recorded as a failure, and no event is emitted, because "wrote
   * something short" is not a fact worth pushing at a teacher.
   */
  function acceptReflection(input) {
    if (!input || !input.id || !input.value.trim()) return;
    var CHECK = window.PyPathReflection;
    // No floor loaded is the behaviour that shipped before there was one.
    if (!CHECK) {
      markItem(input.id);
      return;
    }
    var verdict = CHECK.assess(input.value, { prompt: promptFor(input) });
    if (!verdict.ok) {
      sayWhy(input, verdict.reason);
      return;
    }

    // The floor decided, and it decided synchronously and offline. Everything
    // below only nudges: nothing here ever un-ticks a reflection, because
    // everything in this codebase is a ratchet.
    markItem(input.id);
    nudgeOnConcepts(input);
  }

  /* Whether the answer mentions what the lesson was about.
   *
   * A word check, and a weak one: a thoughtful answer in words the author did
   * not think of lands here too. That is exactly why it gates nothing. The
   * learner sees the author's own hint beside a box that has already counted,
   * and can take it or leave it.
   *
   * The teacher's side is the same fact recorded once, and it takes three of
   * them across a class before anything appears on a dashboard. */
  function nudgeOnConcepts(input) {
    var CONCEPTS = window.PyPathConcepts;
    var spec = conceptSpec[input.id];
    if (!CONCEPTS || !spec) {
      sayWhy(input, '');
      return;
    }

    var out = CONCEPTS.assess(input.value, spec);
    sayWhy(input, out.ok ? '' : out.hint);
    if (!out.checked || out.ok) return;

    if (window.PyPathEvents) {
      try {
        window.PyPathEvents.record('answer.submitted', {
          lessonPath: path,
          itemId: input.id,
          // A fact about a string, and named as one. classroom-core words the
          // dashboard row the same way.
          missedConcepts: true
        });
      } catch (e) {}
    }
  }

  /* What the lesson's author said a good answer touches, keyed by reflection
     id, out of the same check file the auto-grader already reads. Fetched once
     and quietly: a lesson with no expectations authored is the normal case and
     is not a problem to report. */
  var conceptSpec = {};

  function loadConceptSpec() {
    var m = /^\/units\/(unit-\d+)\/([a-z0-9-]+)\.html$/.exec(path);
    if (!m || typeof fetch !== 'function') return;
    fetch('/assets/data/checks/' + m[1] + '/' + m[2] + '.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (spec) {
        var reflections = spec && spec.reflections;
        if (reflections && typeof reflections === 'object') conceptSpec = reflections;
      })
      .catch(function () {});
  }

  function watchReflections() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.submit-btn');
      if (!btn) return;
      var item = btn.closest('.exercise-item');
      acceptReflection(item && item.querySelector('.reflection-input'));
    }, true);

    // Not every reflection prompt sits inside an .exercise-item -- an inline one
    // never gets a Save button from exercises.js and would otherwise be
    // impossible to complete, which would strand a learner on lesson one.
    // Committing an answer counts on its own.
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.classList || !el.classList.contains('reflection-input')) return;
      acceptReflection(el);
    }, true);
  }

  // Says out loud what the missing lock screen already implies: this account is
  // reading the course as a teacher, not working through it. Every unit is
  // open to a teacher, so nothing is ever taken off a page they are looking at.
  /* Only ever the banner this file put there.
   *
   * It used to be `querySelector('.teacher-view-note')`, which on any page
   * that is not a lesson or a unit meant "delete the first one you find" --
   * and curriculum.html and progress.html each ship an authored one of their
   * own, for role-nav.js to show or hide. So this ran on those pages, matched
   * markup it had not written, and removed it. Neither banner had ever
   * appeared: the note was in the file, shipped to the browser, and deleted
   * before paint. tests/teacher-view.test.js asserts the markup is in the
   * file, which it was, so nothing caught it. */
  function paintTeacherBanner() {
    var existing = document.querySelector('.teacher-view-note[data-injected-note]');
    if (!teaching() || !(isLessonPage() || isUnitPage())) {
      removeNotice(existing);
      return;
    }
    if (existing) return;

    var box = document.createElement('div');
    box.className = 'teacher-view-note';
    box.setAttribute('role', 'note');
    // Whose banner this is, so the cleanup above can tell it from the ones
    // curriculum.html and progress.html author for themselves.
    box.setAttribute('data-injected-note', '');
    /* Badge, text, action -- the same three columns the authored copies in
       progress.html and curriculum.html use, so a teacher meets one component
       rather than three that nearly match. The link becomes a button at the
       end of the bar rather than sitting inside the sentence: it is the only
       thing here to do, and a bar this wide should put it where the eye
       finishes rather than hide it mid-paragraph. */
    box.innerHTML =
      '<span class="teacher-view-note__badge">' + EYE_SVG + '</span>' +
      '<div class="teacher-view-note__text">' +
      '<p class="teacher-view-note__title">Teacher view</p>' +
      '<p class="teacher-view-note__body">Every unit and lesson is open to you, ' +
      'and nothing you do here is graded or counted as progress.</p>' +
      '</div>' +
      '<p class="teacher-view-note__actions">' +
      '<a class="btn btn-ghost btn-small route" href="/classroom.html">Open your classroom</a>' +
      '</p>';

    prependNotice(box);
  }

  /* Turns off the controls on a locked unit.
   *
   * Mostly a backstop now. On a locked lesson the whole lesson body has been
   * taken out of the document, so there is normally no Run button left to
   * disable. What this still covers is everything outside that: a control on a
   * page with no lesson column to stow, and the window between the page being
   * parsed and paintLockScreen() running, during which the buttons are on
   * screen and a fast click would otherwise reach them.
   *
   * Disabled rather than removed, for the controls it does reach: they are
   * coming back the moment the unit opens, and the screen beside them says why
   * they are off.
   */
  function paintLockedControls() {
    if (!isLessonPage()) return;
    var locked = unitLocked();
    var nodes = document.querySelectorAll('.btn-run, .btn-check, .submit-btn');
    for (var i = 0; i < nodes.length; i++) {
      var btn = nodes[i];
      // Never fight a button something else has disabled for its own reasons,
      // such as a run already in flight. Only ever undo our own.
      if (locked) {
        btn.disabled = true;
        btn.setAttribute('data-unit-locked', '');
        btn.setAttribute('title', 'Unit ' + unit + ' is not open for your class yet.');
      } else if (btn.hasAttribute('data-unit-locked')) {
        btn.disabled = false;
        btn.removeAttribute('data-unit-locked');
        btn.removeAttribute('title');
      }
    }
  }

  /* The Show Solution buttons, for a class whose teacher turned them off.
   *
   * Removed rather than disabled: a greyed-out button is a promise that
   * something is coming, and nothing is. The exercise, the editor, the checker
   * and the hints are all untouched -- this takes away the answer key, not the
   * work.
   *
   * What it does not do, said plainly because the teacher's own copy says it
   * too: the solutions travel inside the lesson's HTML, so this removes the
   * button and not the answer. window.showSolution refuses as well, so a stale
   * button left over from an earlier paint cannot act, but neither of those is
   * a lock and this file should not pretend otherwise.
   */
  function paintSolutionButtons() {
    var POLICY = window.PyPathPolicy;
    var allowed = POLICY
      ? POLICY.solutionsAllowed(classPolicy, teaching())
      : true;
    window.pyPathSolutionsAllowed = allowed;
    var buttons = document.querySelectorAll('.btn-solution');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].hidden = !allowed;
    }
  }

  function repaint() {
    if (isLessonPage()) paintProgress();
    paintLockScreen();
    paintTeacherBanner();
    paintLessonList();
    paintTestEntries();
    paintSolutionButtons();
    paintLockedControls();
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
      loadConceptSpec();
    }
    repaint();
  });

  // A write from this page, a value arriving from another device through
  // sync.js, or the role finally resolving -- all three change what the ticks
  // and the lock notice should say. The role lands once and is worth showing
  // immediately; progress writes arrive in floods.
  document.addEventListener('pypath:progress', repaintSoon);
  document.addEventListener('pypath:role', repaint);

  // The class's lock mode, arriving from class-policy.js one read after sign
  // in. No timeout guards this the way gate.js guards auth: a policy that never
  // arrives leaves classPolicy null, and null is already the sequential answer
  // the page rendered with.
  //
  // Both directions are handled once it lands, which is why the lesson body is
  // stowed rather than deleted: a unit the sequential fallback called open and
  // the teacher's list calls shut loses its lesson here, and a unit the
  // fallback called shut and the teacher has ticked gets it back.
  document.addEventListener('pypath:policy', function (e) {
    classPolicy = (e && e.detail && e.detail.policy) || null;
    repaint();
  });
})();
