/* PyPath — end-of-unit test rules: selection and scoring, nothing else.

   Ten multiple choice questions at 7 points each and one free response
   question at 30 make a paper out of 100, and 70 moves a learner on. The
   numbers live here rather than in the page so the page cannot quietly
   disagree with the dashboard about what a score means.

   Pure by design: no DOM, no storage, no fetch. `rand` is injected wherever
   randomness appears so selection can be tested without stubbing Math.random,
   the same way roles.js takes its randomness as an argument. */
(function () {
  'use strict';

  var MCQ_COUNT = 10;
  var MCQ_WEIGHT = 7;
  var FRQ_WEIGHT = 30;
  var PASS_MARK = 70;

  function randomFn(rand) {
    return typeof rand === 'function' ? rand : Math.random;
  }

  // A partial Fisher-Yates over a copy, then truncate. Drawing an index and
  // retrying on a collision would also avoid repeats, but it has no bound on
  // how long it runs and it biases nothing usefully; this is uniform and
  // finishes in exactly `count` swaps.
  function pickQuestions(pool, count, rand) {
    var r = randomFn(rand);
    var items = Array.isArray(pool) ? pool.slice() : [];
    var want = Math.floor(Number(count));
    if (!isFinite(want) || want < 0) want = 0;
    var n = Math.min(want, items.length);

    for (var i = 0; i < n; i++) {
      var span = items.length - i;
      var j = i + Math.floor(r() * span);
      // A rand that returns 1, or anything outside [0, 1), must not throw an
      // index off the end and silently drop a question from the paper.
      if (!(j >= i && j < items.length)) j = i;
      var tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items.slice(0, n);
  }

  function pickOne(pool, rand) {
    var picked = pickQuestions(pool, 1, rand);
    return picked.length ? picked[0] : null;
  }

  // `answers` is positional against `picked`: index i is the choice index the
  // learner selected for question i, or null when they skipped it. A skipped
  // question is wrong, never a silent pass.
  function scoreMcq(picked, answers) {
    var questions = Array.isArray(picked) ? picked : [];
    var given = Array.isArray(answers) ? answers : [];
    var correct = 0;

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      if (!q || typeof q !== 'object') continue;
      var a = given[i];
      if (a === null || a === undefined || a === '') continue;
      if (Number(a) === Number(q.answer)) correct++;
    }
    return correct;
  }

  function clampInt(value, min, max) {
    var n = Math.floor(Number(value));
    if (!isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function hasPassed(total) {
    var n = Number(total);
    return isFinite(n) && n >= PASS_MARK;
  }

  // The FRQ is graded by proportion of cases passed rather than all or
  // nothing, so a nearly right answer is worth something. Rounding is to the
  // nearest point: 2 of 3 cases is 20, not 19.99 shown as 20 and stored as
  // something else.
  function scoreAttempt(result) {
    var r = result && typeof result === 'object' ? result : {};
    var mcqCorrect = clampInt(r.mcqCorrect, 0, MCQ_COUNT);
    var casesTotal = clampInt(r.frqCasesTotal, 0, Number.MAX_SAFE_INTEGER);
    var casesPassed = clampInt(r.frqCasesPassed, 0, casesTotal);

    var mcqPoints = mcqCorrect * MCQ_WEIGHT;
    var frqPoints = casesTotal === 0 ? 0 : Math.round(FRQ_WEIGHT * casesPassed / casesTotal);
    var total = Math.min(100, mcqPoints + frqPoints);

    return {
      mcqPoints: mcqPoints,
      frqPoints: frqPoints,
      total: total,
      passed: hasPassed(total)
    };
  }

  window.PyPathUnitTest = {
    MCQ_COUNT: MCQ_COUNT,
    MCQ_WEIGHT: MCQ_WEIGHT,
    FRQ_WEIGHT: FRQ_WEIGHT,
    PASS_MARK: PASS_MARK,
    pickQuestions: pickQuestions,
    pickOne: pickOne,
    scoreMcq: scoreMcq,
    scoreAttempt: scoreAttempt,
    hasPassed: hasPassed
  };
})();
