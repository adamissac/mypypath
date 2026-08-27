/* PyPath — what kind of question this is, and how to mark it.
 *
 * Pure throughout: no DOM, no fetch, no storage. question-render.js draws what
 * these describe, the same split classroom-core.js and classroom-dashboard.js
 * use, and for the same reason. A marking rule you cannot argue with in a test
 * is a marking rule nobody can argue with.
 *
 * Every scorer returns { correct, total, right } rather than a bare boolean.
 * Partial credit is already how the free response question is marked in
 * unit-test.js, and a matching question with four pairs and one slip should
 * not read the same as one with nothing right.
 */
(function () {
  'use strict';

  /* Single-answer multiple choice is what every question authored in this repo
     so far is, so it is also what a question with no kind means. That default
     is what makes this a pure addition rather than a rewrite of twenty pool
     files and fifteen check files. */
  var QUESTION_KINDS = ['mcq', 'multi', 'match', 'order', 'blank'];

  /* The three ways checker.js has always been able to mark a case. Named here
     so the inference below and the validator are reading one list. */
  var CASE_KINDS = ['stdout', 'value', 'property'];

  var PROPERTY_KEYS = ['nonempty', 'min_lines', 'max_lines', 'stdout_matches', 'source_matches'];

  function kindOfQuestion(question) {
    var kind = question && question.kind;
    return QUESTION_KINDS.indexOf(kind) === -1 ? 'mcq' : kind;
  }

  /* An explicit kind wins; otherwise the structural inference checker.js has
     always used, unchanged, so no authored file has to be rewritten.

     The reason to have the explicit form at all: a case carrying both `call`
     and `expect_stdout` is marked as a value case today and the author is never
     told their expected output was ignored. With a kind on it, the validator
     can say so. */
  function kindOfCase(testCase) {
    var c = testCase || {};
    if (CASE_KINDS.indexOf(c.kind) !== -1) return c.kind;

    var isProperty = PROPERTY_KEYS.some(function (k) {
      return Object.prototype.hasOwnProperty.call(c, k);
    });
    if (isProperty) return 'property';
    if (typeof c.call === 'string' && c.call.length > 0) return 'value';
    return 'stdout';
  }

  function asIndexSet(list) {
    var out = {};
    (Array.isArray(list) ? list : []).forEach(function (v) {
      var n = Number(v);
      if (Number.isInteger(n) && n >= 0) out[n] = true;
    });
    return out;
  }

  function verdict(correct, total) {
    return { correct: correct, total: total, right: total > 0 && correct === total };
  }

  /* Single-answer multiple choice, marked the way scoreMcq in unit-test.js has
     always marked it. A skipped question is wrong, never a silent pass. */
  function scoreMcq(question, answer) {
    var q = question || {};
    if (answer === null || answer === undefined || answer === '') return verdict(0, 1);
    return verdict(Number(answer) === Number(q.answer) ? 1 : 0, 1);
  }

  /* Choose all that apply.
   *
   * Every choice is a judgement, so the total is the number of choices rather
   * than the number of correct ones: a box correctly left alone is a mark, and
   * ticking everything therefore scores badly rather than perfectly. Without
   * that, multi-select is four MCQs with a free pass on top. */
  function scoreMulti(question, chosen) {
    var q = question || {};
    var choices = Array.isArray(q.choices) ? q.choices : [];
    var wanted = asIndexSet(q.answers);
    var got = asIndexSet(chosen);

    var correct = 0;
    for (var i = 0; i < choices.length; i++) {
      if (!!wanted[i] === !!got[i]) correct += 1;
    }
    return verdict(correct, choices.length);
  }

  /* Pair each item on the left with one on the right. answer[i] is the index
     in `right` that goes with left[i], and one point is one row. */
  function scoreMatch(question, chosen) {
    var q = question || {};
    var left = Array.isArray(q.left) ? q.left : [];
    var answer = Array.isArray(q.answer) ? q.answer : [];
    var given = Array.isArray(chosen) ? chosen : [];

    var correct = 0;
    for (var i = 0; i < left.length; i++) {
      var a = given[i];
      // Unanswered is wrong, not skipped. A row nobody paired is a row nobody
      // got right.
      if (a === null || a === undefined || a === '') continue;
      if (Number(a) === Number(answer[i])) correct += 1;
    }
    return verdict(correct, left.length);
  }

  /* A Parsons problem: put the lines in order.
   *
   * Marked by adjacent pairs in the right relative order, never by absolute
   * position. Position is brutally unfair here: one line dropped in at the top
   * shifts every index below it and would score zero for a learner who had the
   * entire structure right. Pairs measure what the question actually asks,
   * which is whether they know what follows what.
   *
   * Total is items - 1, because that is how many "this comes before that"
   * judgements a sequence of n items contains. */
  function scoreOrder(question, chosen) {
    var q = question || {};
    var answer = Array.isArray(q.answer) ? q.answer.map(Number) : [];
    var given = Array.isArray(chosen) ? chosen.map(Number) : [];
    var total = Math.max(answer.length - 1, 0);
    if (!total) return verdict(0, 0);

    // Where each item belongs, so a pair can be checked in one lookup.
    var rank = {};
    answer.forEach(function (item, i) { rank[item] = i; });

    var correct = 0;
    for (var i = 0; i + 1 < given.length; i++) {
      var a = rank[given[i]];
      var b = rank[given[i + 1]];
      if (a === undefined || b === undefined) continue;
      if (b === a + 1) correct += 1;
    }
    return verdict(correct, total);
  }

  /* Fill in the blank. One point per blank.
   *
   * `accept` is a list because len(x) and len( x ) are the same answer, and
   * marking one of them wrong teaches nothing about Python. Deliberately not a
   * regex: an author who needs one is authoring a property case in a code
   * exercise, which already exists and already runs real Python. */
  function scoreBlank(question, given) {
    var q = question || {};
    var blanks = Array.isArray(q.blanks) ? q.blanks : [];
    var typed = Array.isArray(given) ? given : [];

    var correct = 0;
    for (var i = 0; i < blanks.length; i++) {
      var blank = blanks[i] || {};
      var accept = Array.isArray(blank.accept) ? blank.accept : [];
      var answer = String(typed[i] == null ? '' : typed[i]).trim();
      if (!answer) continue;

      var strict = blank.caseSensitive === true;
      var needle = strict ? answer : answer.toLowerCase();
      var hit = accept.some(function (option) {
        var want = String(option == null ? '' : option).trim();
        return (strict ? want : want.toLowerCase()) === needle;
      });
      if (hit) correct += 1;
    }
    return verdict(correct, blanks.length);
  }

  var SCORERS = {
    mcq: scoreMcq,
    multi: scoreMulti,
    match: scoreMatch,
    order: scoreOrder,
    blank: scoreBlank
  };

  function score(question, answer) {
    return SCORERS[kindOfQuestion(question)](question, answer);
  }

  window.PyPathQuestions = {
    QUESTION_KINDS: QUESTION_KINDS,
    CASE_KINDS: CASE_KINDS,
    PROPERTY_KEYS: PROPERTY_KEYS,
    kindOfQuestion: kindOfQuestion,
    kindOfCase: kindOfCase,
    scoreMcq: scoreMcq,
    scoreMulti: scoreMulti,
    scoreMatch: scoreMatch,
    scoreOrder: scoreOrder,
    scoreBlank: scoreBlank,
    score: score
  };
})();
