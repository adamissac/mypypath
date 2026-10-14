/* PyPath — "your progress in this unit", on the unit overview page.
 *
 * The unit page is where a learner decides what to do next, so it is where
 * knowing they are two lessons from finishing actually changes something. The
 * progress page has the same figures for all ten units; this is the one in
 * front of them.
 *
 * Three things on the page, all from the learner's own local lesson map, so a
 * guest sees their own progress exactly as a signed-in learner does:
 *   - the progress ring ([data-unit-progress]),
 *   - each lesson's status on the trail, and which one is up next,
 *   - the Continue button ([data-unit-continue]): where to go next.
 *
 * lesson-progress.js ticks lessons off on the same list (.unit-trail)
 * and fills the test line; this reads the same facts and never disagrees.
 *
 * Foundations figures come from PyPathLessonProgress.unitBreakdown, the
 * progress page's own source. Python for Data's come from the page's lesson
 * list and the course's own test record ("data-N"), because curriculum.js
 * only knows Foundations.
 */
(function () {
  'use strict';

  var LESSONS_KEY = 'pypath-progress-lessons';
  var TESTS_KEY = 'pypath-unit-tests';
  var PASS_MARK = 70;

  function readJson(key) {
    try {
      var s = window.ProgressStore || window.localStorage;
      var parsed = JSON.parse(s.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function teaching() {
    var R = window.PyPathRoles;
    try { return !!(R && R.teachingNow && R.teachingNow()); } catch (e) { return false; }
  }

  function lessonState(entry) {
    if (!entry || typeof entry !== 'object') return '';
    if (entry.passed === true) return 'done';
    return Array.isArray(entry.done) && entry.done.length ? 'started' : '';
  }

  function testPassed(records, course, n) {
    var entry = records[(course === 'data' ? 'data-' : '') + n];
    if (!entry || typeof entry !== 'object') return false;
    var best = Number(entry.best);
    if (entry.best !== undefined && entry.best !== null && isFinite(best)) return best >= PASS_MARK;
    return entry.passed === true;
  }

  function trailFacts(course, unit) {
    var LP = window.PyPathLessonProgress;
    var map = readJson((LP && LP.STORE_KEY) || LESSONS_KEY);
    var stops = Array.prototype.slice.call(document.querySelectorAll('.unit-trail [data-lesson-path]'));
    var lessons = stops.map(function (li, i) {
      var link = li.querySelector('a');
      var title = li.querySelector('.unit-trail__title');
      var path = li.getAttribute('data-lesson-path');
      return { li: li, index: i, path: path, href: link ? link.getAttribute('href') : path,
        title: title ? title.textContent.trim() : '', state: lessonState(map[path]) };
    });
    var records = readJson((LP && LP.UNIT_TESTS_KEY) || TESTS_KEY);
    return { lessons: lessons, testPassed: testPassed(records, course, unit) };
  }

  function counts(course, unit, facts) {
    var LP = window.PyPathLessonProgress;
    if (course !== 'data' && LP && LP.unitBreakdown) {
      var info = LP.unitBreakdown(unit);
      if (info && info.lessonsTotal) return info;
    }
    var UP = window.PyPathUnitProgress;
    var c = {
      unit: unit,
      lessonsTotal: facts.lessons.length,
      lessonsPassed: facts.lessons.filter(function (l) { return l.state === 'done'; }).length,
      lessonsStarted: facts.lessons.filter(function (l) { return l.state !== ''; }).length,
      testPassed: facts.testPassed
    };
    c.percent = UP ? UP.percentFor(c) : 0;
    c.complete = UP ? UP.isComplete(c) : false;
    c.summary = UP ? UP.describe(c) : '';
    return c;
  }

  function paintPanel(panel, info) {
    var percent = info.complete ? 100 : info.percent;
    var pct = panel.querySelector('[data-unit-progress-pct]');
    if (pct) pct.textContent = percent + '%';
    var detail = panel.querySelector('[data-unit-progress-detail]');
    if (detail) detail.textContent = info.complete ? 'Complete' : info.summary;
    var meter = panel.querySelector('.unit-progress__meter');
    if (meter) {
      meter.setAttribute('aria-valuenow', String(percent));
      meter.setAttribute('aria-valuetext', percent + '% — ' + (info.complete ? 'Complete' : info.summary));
      meter.style.setProperty('--pct', String(percent));
      var bar = meter.querySelector('.bar');
      if (bar) bar.style.width = percent + '%';
      var arc = meter.querySelector('.unit-ring__value');
      if (arc) arc.setAttribute('stroke-dasharray', percent + ' 100');
    }
    panel.classList.toggle('is-complete', info.complete === true);
    panel.hidden = false;
  }

  function paintTrail(facts, info, unit, mine) {
    var next = null;
    facts.lessons.forEach(function (l) {
      if (!next && l.state !== 'done') next = l;
    });
    facts.lessons.forEach(function (l) {
      var upNext = mine && l === next;
      l.li.classList.toggle('is-up-next', upNext);
      l.li.classList.toggle('is-done', mine && l.state === 'done');
      l.li.classList.toggle('is-started', mine && l.state === 'started');
      var status = l.li.querySelector('[data-lesson-status]');
      if (status) {
        status.textContent = !mine ? '' : l.state === 'done' ? 'Done' : upNext ? 'Up next' : l.state === 'started' ? 'In progress' : '';
      }
    });

    var cont = document.querySelector('[data-unit-continue]');
    if (!cont) return;
    var first = cont.getAttribute('data-unit-first') || (facts.lessons[0] && facts.lessons[0].href);
    var started = facts.lessons.some(function (l) { return l.state !== ''; });
    var testLink = document.querySelector('[data-unit-test-link="' + unit + '"]');
    if (!mine || !started) {
      cont.textContent = 'Start Unit ' + unit;
      cont.setAttribute('href', first);
    } else if (info.complete) {
      cont.textContent = 'Review the unit';
      cont.setAttribute('href', first);
    } else if (!next && testLink) {
      cont.textContent = 'Take the Unit ' + unit + ' test';
      cont.setAttribute('href', testLink.getAttribute('href'));
    } else if (next) {
      cont.textContent = 'Continue: Lesson ' + (next.index + 1) + ', ' + next.title;
      cont.setAttribute('href', next.href);
    }
  }

  function render() {
    var panel = document.querySelector('[data-unit-progress]');
    var hasTrail = !!document.querySelector('.unit-trail');
    if (!panel && !hasTrail) return;

    var host = panel || document.querySelector('[data-unit-page]');
    var unit = Number(panel ? panel.getAttribute('data-unit-progress') : host && host.getAttribute('data-unit'));
    if (!Number.isInteger(unit)) return;
    var course = (panel && panel.getAttribute('data-unit-course'))
      || (host && host.getAttribute('data-unit-page')) || 'units';

    var facts = trailFacts(course, unit);
    var info = counts(course, unit, facts);
    var mine = !teaching();

    // A unit with no lessons on it has nothing to report, and an empty bar
    // would read as "you have done none of it" rather than "there is none".
    // A teacher is reading the unit, not their own progress through it.
    if (panel) {
      if (mine && info && info.lessonsTotal) paintPanel(panel, info);
      else panel.hidden = true;
    }
    if (hasTrail) paintTrail(facts, info || {}, unit, mine);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Finishing a lesson elsewhere in the tab, or a sync landing, should move
  // the ring and the trail without a reload.
  document.addEventListener('pypath:progress', render);

  window.PyPathUnitPanel = { render: render };
})();
