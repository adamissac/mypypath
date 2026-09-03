/* PyPath — progress dashboard. Renders from ProgressStore, which works for
   guests and signed-in users alike. */
(function () {
  'use strict';

  var TOTAL_UNITS = 10;

  function render() {
    if (!window.ProgressStore) return;
    var completed = window.ProgressStore.getCompletedUnits();
    var percent = Math.round((completed.length / TOTAL_UNITS) * 100);

    var count = document.getElementById('progress-count');
    if (count) count.textContent = String(completed.length);

    var meter = document.querySelector('.progress-page .progress-global');
    var bar = meter && meter.querySelector('.bar');
    if (bar && meter) {
      bar.style.width = percent + '%';
      meter.setAttribute('aria-valuenow', String(percent));
    }

    var list = document.getElementById('progress-units');
    if (!list) return;
    list.innerHTML = '';

    /* Per-unit detail, not a done/not-started flag. A learner eight lessons
       into a ten-lesson unit was previously told "Not started", which is both
       wrong and the most discouraging thing the page could have said to
       exactly the person who had done the most work without finishing. */
    var LP = window.PyPathLessonProgress;
    var breakdowns = LP && LP.allUnitBreakdowns ? LP.allUnitBreakdowns() : null;

    var firstIncomplete = null;
    for (var n = 1; n <= TOTAL_UNITS; n++) {
      var unitInfo = breakdowns ? breakdowns[n - 1] : null;
      var done = completed.indexOf(n) !== -1 || (unitInfo && unitInfo.complete);
      if (!done && firstIncomplete === null) firstIncomplete = n;

      var li = document.createElement('li');
      li.className = 'progress-unit' + (done ? ' completed' : '');

      var link = document.createElement('a');
      link.className = 'route progress-unit__link';
      link.href = '/units/unit-' + n + '.html';
      link.textContent = 'Unit ' + n;
      li.appendChild(link);

      var status = document.createElement('span');
      status.className = 'progress-unit__status';

      if (!unitInfo) {
        // lesson-progress.js missing; fall back to what the page said before.
        status.textContent = done ? 'Complete' : 'Not started';
        li.appendChild(status);
        list.appendChild(li);
        continue;
      }

      var percent = done ? 100 : unitInfo.percent;
      status.textContent = percent + '%';
      li.appendChild(status);

      // A real progressbar, so the figure is announced rather than left as a
      // decorative div a screen reader skips.
      var meter = document.createElement('div');
      meter.className = 'progress-unit__meter';
      meter.setAttribute('role', 'progressbar');
      meter.setAttribute('aria-label', 'Unit ' + n + ' progress');
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', '100');
      meter.setAttribute('aria-valuenow', String(percent));
      meter.setAttribute('aria-valuetext', percent + '% — ' + unitInfo.summary);
      var fill = document.createElement('div');
      fill.className = 'bar';
      fill.style.width = percent + '%';
      meter.appendChild(fill);
      li.appendChild(meter);

      var detail = document.createElement('span');
      detail.className = 'progress-unit__detail';
      detail.textContent = done ? 'Complete' : unitInfo.summary;
      li.appendChild(detail);

      list.appendChild(li);
    }

    var cert = document.getElementById('progress-certificate');
    if (cert) cert.hidden = completed.length !== TOTAL_UNITS;

    var resume = document.getElementById('progress-resume');
    if (resume) {
      var target = firstIncomplete === null ? TOTAL_UNITS : firstIncomplete;
      resume.href = '/units/unit-' + target + '.html';
      resume.textContent = firstIncomplete === null
        ? 'Review Unit ' + TOTAL_UNITS
        : 'Resume Unit ' + target;
    }
  }

  if (document.readyState === 'loading') {
    /* The second course.
   *
   * Foundations progress is a list of completed unit numbers, because a unit
   * is finished by passing its test. Python for Data has no tests yet, so
   * there is nothing to complete a unit with -- what exists is lesson
   * progress, which is keyed by lesson path and therefore already recorded
   * for both courses.
   *
   * So this reports what is true rather than borrowing a shape that is not:
   * lessons done per unit, and nothing about units being "complete". A
   * student who has been working through Data used to see no trace of it
   * here at all.
   */
  function renderDataCourse() {
    var host = document.getElementById('progress-data-course');
    if (!host || typeof fetch !== 'function') return;

    fetch('/assets/data/curriculum-data.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (manifest) {
        if (!manifest || !manifest.lessons || !manifest.lessons.length) return;

        var done = {};
        try {
          var raw = window.ProgressStore.getItem('pypath-progress-lessons');
          var parsed = raw ? JSON.parse(raw) : {};
          if (parsed && typeof parsed === 'object') done = parsed;
        } catch (e) {
          done = {};
        }

        var byUnit = {};
        manifest.lessons.forEach(function (lesson) {
          var row = byUnit[lesson.unit] || (byUnit[lesson.unit] = { total: 0, done: 0,
            title: lesson.unitTitle });
          row.total += 1;
          if (done[lesson.path]) row.done += 1;
        });

        var units = Object.keys(byUnit).map(Number).sort(function (a, b) { return a - b; });
        if (!units.length) return;

        var list = document.createElement('ul');
        list.className = 'progress-units';
        var totalDone = 0;
        var totalLessons = 0;

        units.forEach(function (n) {
          var row = byUnit[n];
          totalDone += row.done;
          totalLessons += row.total;
          var item = document.createElement('li');
          item.className = 'progress-unit';
          var link = document.createElement('a');
          link.className = 'route';
          link.href = '/data/unit-' + n + '.html';
          link.textContent = 'Unit ' + n + ' · ' + row.title;
          var meta = document.createElement('span');
          meta.className = 'progress-unit__meta muted';
          meta.textContent = row.done + ' of ' + row.total + ' lessons done';
          item.appendChild(link);
          item.appendChild(meta);
          list.appendChild(item);
        });

        var heading = document.createElement('h2');
        heading.textContent = 'Python for Data';
        var lead = document.createElement('p');
        lead.className = 'muted';
        lead.textContent = totalDone + ' of ' + totalLessons
          + ' lessons done. Units 3 onward are not written yet.';

        host.innerHTML = '';
        host.appendChild(heading);
        host.appendChild(lead);
        host.appendChild(list);
        host.hidden = false;
      })
      .catch(function () {
        // No second course on this deploy is a normal state, not an error.
      });
  }

  document.addEventListener('DOMContentLoaded', renderDataCourse);
  if (document.readyState !== 'loading') renderDataCourse();

  document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  document.addEventListener('pypath:auth', function (e) {
    var guest = document.getElementById('progress-guest');
    if (guest) guest.hidden = !!(e.detail && e.detail.user);
  });

  // Re-render when the store actually changes. Do NOT guess with a timer: the
  // sign-in merge awaits two network round trips before it writes, so any fixed
  // delay loses the race and this page — whose whole purpose is showing
  // post-merge progress — would render pre-merge state.
  document.addEventListener('pypath:progress', render);
})();
