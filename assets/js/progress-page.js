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
    var firstIncomplete = null;
    for (var n = 1; n <= TOTAL_UNITS; n++) {
      var done = completed.indexOf(n) !== -1;
      if (!done && firstIncomplete === null) firstIncomplete = n;

      var li = document.createElement('li');
      li.className = 'progress-unit' + (done ? ' completed' : '');

      var link = document.createElement('a');
      link.className = 'route';
      link.href = '/units/unit-' + n + '.html';
      link.textContent = 'Unit ' + n;
      li.appendChild(link);

      var status = document.createElement('span');
      status.className = 'progress-unit__status';
      status.textContent = done ? 'Complete' : 'Not started';
      li.appendChild(status);

      list.appendChild(li);
    }

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
