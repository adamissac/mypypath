/* PyPath — how far through a unit someone is, as one number.
 *
 * This exists so that the figure a student sees on their progress page and the
 * figure their teacher sees on the dashboard are the same figure. The two are
 * computed from different sources -- the student's own browser reads their
 * lesson map out of local storage, a teacher reads an event log -- and if the
 * weighting lived in both places they would drift, and the first anyone would
 * hear of it is a student saying "it says 80% on my screen".
 *
 * Pure, no I/O, loaded on lesson pages and on the classroom page alike.
 */
(function () {
  'use strict';

  /* A unit is finished when every lesson in it has passed AND its end-of-unit
     test has passed -- that rule is lesson-progress.js's, and this weighting
     is chosen to match it exactly rather than to look generous. The test is
     one part alongside each lesson, so a unit of ten lessons is eleven parts.
     
     The consequence is deliberate: finishing every lesson and skipping the
     test shows as 91%, not 100%. A learner is not done, and a bar that said
     100% next to an unfinished unit would be the dashboard lying to both of
     them about the same thing. */
  function percentFor(counts) {
    var total = Number(counts && counts.lessonsTotal) || 0;
    if (total <= 0) return 0;
    var passed = Math.min(Math.max(Number(counts.lessonsPassed) || 0, 0), total);
    var parts = total + 1;
    var done = passed + (counts.testPassed === true ? 1 : 0);
    return Math.round((done / parts) * 100);
  }

  /* Only ever true when the underlying rule is true. Never inferred from the
     percentage, so a rounding change cannot quietly start completing units. */
  function isComplete(counts) {
    var total = Number(counts && counts.lessonsTotal) || 0;
    return total > 0
      && Number(counts.lessonsPassed) >= total
      && counts.testPassed === true;
  }

  /* The sentence under the bar. Written here rather than at each call site so
     a student and their teacher read the same wording for the same state. */
  function describe(counts) {
    var total = Number(counts && counts.lessonsTotal) || 0;
    if (total <= 0) return 'No lessons in this unit yet';

    var passed = Number(counts.lessonsPassed) || 0;
    var started = Number(counts.lessonsStarted) || 0;

    if (isComplete(counts)) return 'Complete';

    var parts = [passed + ' of ' + total + ' lessons done'];
    if (passed < total && started > passed) {
      parts.push((started - passed) + ' in progress');
    }
    parts.push(counts.testPassed === true ? 'test passed' : 'test not passed yet');
    return parts.join(' · ');
  }

  /* What the number means, for the info control on the dashboard and the
     hint on the progress page. */
  var EXPLANATION = 'Each lesson counts once and the end-of-unit test counts '
    + 'once, so a unit of ten lessons has eleven parts. Finishing every lesson '
    + 'without passing the test shows as 91%, because the unit is not complete '
    + 'until both are done.';

  window.PyPathUnitProgress = {
    percentFor: percentFor,
    isComplete: isComplete,
    describe: describe,
    EXPLANATION: EXPLANATION
  };
})();
