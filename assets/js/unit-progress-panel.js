/* PyPath — "your progress in this unit", on the unit overview page.
 *
 * The unit page is where a learner decides what to do next, so it is where
 * knowing they are two lessons from finishing actually changes something. The
 * progress page has the same figures for all ten units; this is the one in
 * front of them.
 *
 * Works signed out. The numbers come from the same local lesson map the rest
 * of the site reads, so a guest sees their own progress exactly as a
 * signed-in learner does.
 */
(function () {
  'use strict';

  function render() {
    var panel = document.querySelector('[data-unit-progress]');
    if (!panel) return;

    var LP = window.PyPathLessonProgress;
    if (!LP || !LP.unitBreakdown) return;

    var unit = Number(panel.getAttribute('data-unit-progress'));
    if (!Number.isInteger(unit)) return;

    var info = LP.unitBreakdown(unit);
    // A unit with no lessons on it has nothing to report, and an empty bar
    // would read as "you have done none of it" rather than "there is none".
    if (!info || !info.lessonsTotal) return;

    var percent = info.complete ? 100 : info.percent;

    var pct = panel.querySelector('[data-unit-progress-pct]');
    if (pct) pct.textContent = percent + '%';

    var detail = panel.querySelector('[data-unit-progress-detail]');
    if (detail) detail.textContent = info.complete ? 'Complete' : info.summary;

    var meter = panel.querySelector('.unit-progress__meter');
    if (meter) {
      meter.setAttribute('aria-valuenow', String(percent));
      meter.setAttribute('aria-valuetext', percent + '% — '
        + (info.complete ? 'Complete' : info.summary));
      var bar = meter.querySelector('.bar');
      if (bar) bar.style.width = percent + '%';
    }

    panel.classList.toggle('is-complete', info.complete === true);
    panel.hidden = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Finishing a lesson elsewhere in the tab, or a sync landing, should move
  // the bar without a reload.
  document.addEventListener('pypath:progress', render);

  window.PyPathUnitPanel = { render: render };
})();
