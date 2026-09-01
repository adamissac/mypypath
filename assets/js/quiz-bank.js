/* PyPath — the pool a teacher builds a quiz from.
 *
 * Two sources, one list:
 *
 *   assets/data/unit-tests/unit-N-mcq.json   fifty authored MCQs per unit, for
 *                                            all ten units. Already written,
 *                                            already reviewed, and also the
 *                                            source for the end-of-unit test --
 *                                            which is why nothing here writes
 *                                            to it or changes its shape.
 *   assets/data/quiz-bank/unit-N.json        the newer kinds: match, order,
 *                                            blank, multi. All ten units.
 *
 * The second file exists because every question in the first is an mcq, so a
 * quiz drawn from the pool alone would never show a matching question and the
 * five kinds question-types.js can mark would stay invisible. It shipped
 * seeded for units 1-3 with the rest called out as outstanding content work;
 * all ten are authored now. The loader never cared how many units had one, so
 * a unit whose file is missing still degrades to "fewer questions to choose
 * from" rather than an error.
 *
 * Pure where it can be. The fetch is here; every judgement about a question is
 * question-types.js's, and every judgement about a quiz is quiz-page.js's.
 */
(function () {
  'use strict';

  var Q = window.PyPathQuestions;

  // A quiz is drawn from one unit. Ten is the course.
  var MAX_UNIT = 10;

  // Enough to build a real quiz from, small enough that the picker is
  // scannable and a quiz document stays a sensible size.
  var MAX_QUESTIONS = 25;

  var cache = {};

  function isUnit(n) {
    var unit = Number(n);
    return Number.isInteger(unit) && unit >= 1 && unit <= MAX_UNIT;
  }

  /* A question is usable if question-types.js can mark it and it has something
     to show. Deliberately shallow: this is a guard against a truncated or
     half-authored file, not a schema validator. The authoring-time validator
     is scripts/validate-checks.js's job. */
  function usable(question) {
    if (!question || typeof question !== 'object') return false;
    if (typeof question.id !== 'string' || !question.id) return false;
    if (typeof question.prompt !== 'string' || !question.prompt) return false;
    var kind = Q ? Q.kindOfQuestion(question) : 'mcq';
    if (kind === 'mcq') return Array.isArray(question.choices) && question.choices.length > 1;
    if (kind === 'multi') return Array.isArray(question.choices) && Array.isArray(question.answers);
    if (kind === 'match') return Array.isArray(question.left) && Array.isArray(question.right)
      && Array.isArray(question.answer) && question.left.length > 0;
    if (kind === 'order') return Array.isArray(question.items) && Array.isArray(question.answer)
      && question.items.length > 1;
    if (kind === 'blank') return Array.isArray(question.blanks) && question.blanks.length > 0;
    return false;
  }

  /* Newer kinds first.
   *
   * Not alphabetical and not file order: a teacher opening the picker for
   * Unit 2 should meet the six questions they have never seen before the fifty
   * they recognise from the test pool. Putting the novel content behind fifty
   * MCQs is how it stays unused. */
  var KIND_ORDER = ['match', 'order', 'blank', 'multi', 'mcq'];

  function sortForPicker(questions) {
    return questions.slice().sort(function (a, b) {
      var ka = KIND_ORDER.indexOf(Q ? Q.kindOfQuestion(a) : 'mcq');
      var kb = KIND_ORDER.indexOf(Q ? Q.kindOfQuestion(b) : 'mcq');
      if (ka !== kb) return ka - kb;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  /* Two files, either of which may be missing.
   *
   * A missing quiz-bank file is the normal case for units 4-10 and is not an
   * error; a missing pool file would be a broken deploy but still must not
   * throw, because the teacher's dashboard is not the place to find out. Both
   * degrade to "fewer questions to choose from", which is visible and honest.
   */
  function fetchJson(url) {
    if (typeof fetch !== 'function') return Promise.resolve([]);
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { return Array.isArray(data) ? data : []; })
      .catch(function () { return []; });
  }

  function merge(pool, extra) {
    var seen = {};
    var out = [];
    // quiz-bank first so that if an id ever collides, the deliberately
    // authored newer question wins over a pool entry that happened to match.
    (extra || []).concat(pool || []).forEach(function (question) {
      if (!usable(question)) return;
      if (seen[question.id]) return;
      seen[question.id] = true;
      out.push(question);
    });
    return sortForPicker(out);
  }

  function load(unit) {
    if (!isUnit(unit)) return Promise.resolve([]);
    var n = Number(unit);
    if (cache[n]) return Promise.resolve(cache[n]);

    return Promise.all([
      fetchJson('/assets/data/unit-tests/unit-' + n + '-mcq.json'),
      fetchJson('/assets/data/quiz-bank/unit-' + n + '.json')
    ]).then(function (both) {
      var merged = merge(both[0], both[1]);
      cache[n] = merged;
      return merged;
    });
  }

  /* The questions a quiz actually contains, in the order the teacher chose.
     An id that no longer resolves -- a bank file edited after a quiz was set --
     is dropped rather than rendered as a blank question, and the caller is
     left to notice the count changed. */
  function pick(bank, ids) {
    var byId = {};
    (bank || []).forEach(function (q) { byId[q.id] = q; });
    return (ids || []).map(function (id) { return byId[id]; }).filter(Boolean);
  }

  /* Which kinds a unit can offer, for the picker to say so up front rather
     than leaving a teacher to scroll and discover it. */
  function kindsIn(bank) {
    var seen = {};
    (bank || []).forEach(function (q) {
      seen[Q ? Q.kindOfQuestion(q) : 'mcq'] = true;
    });
    return KIND_ORDER.filter(function (k) { return seen[k]; });
  }

  var KIND_LABEL = {
    mcq: 'Multiple choice',
    multi: 'Choose several',
    match: 'Matching',
    order: 'Put in order',
    blank: 'Fill the blank'
  };

  window.PyPathQuizBank = {
    MAX_UNIT: MAX_UNIT,
    MAX_QUESTIONS: MAX_QUESTIONS,
    KIND_LABEL: KIND_LABEL,
    KIND_ORDER: KIND_ORDER,
    isUnit: isUnit,
    usable: usable,
    merge: merge,
    sortForPicker: sortForPicker,
    pick: pick,
    kindsIn: kindsIn,
    load: load
  };
})();
