/* PyPath — asking api/grade.js for a second opinion, and coping when it cannot.
 *
 * The pure half is the interesting half. Everything about how this behaves
 * when the network, the endpoint, the cap or the API lets it down is a pure
 * function of a response, so it can be tested without a server.
 *
 * One rule governs the whole file: nothing that goes wrong here is the
 * learner's fault, so nothing that goes wrong here is shown to them as though
 * it were. Every failure resolves to "review", which means the answer is saved
 * and a person will look. Never a pass, which would be a grade nobody gave,
 * and never a fail, which would record a network hiccup as a wrong answer.
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/grade';

  /* Long enough for a real call, short enough that a lesson does not sit
     waiting. Past this the deterministic result stands on its own, which it
     always could. */
  var TIMEOUT_MS = 12000;

  var VERDICTS = ['pass', 'partial', 'fail', 'review'];
  var FLAGS = ['none', 'off-topic', 'incoherent', 'placeholder', 'output-without-method'];

  /* What a teacher reads. Written to the same rule as needsAttention in
     classroom-core.js: describe what happened, never what the student is. */
  var FLAG_LABEL = {
    'off-topic': 'Answered a different question',
    incoherent: 'Did not form an answer',
    placeholder: 'Filled the box rather than answered it',
    'output-without-method': 'Output is right, the method does not solve the problem'
  };

  function review(reason) {
    return {
      verdict: 'review',
      confidence: 'low',
      flag: 'none',
      feedback: 'Your answer is saved. Your teacher will take a look at this one.',
      reason: reason || 'unavailable'
    };
  }

  /* Anything that is not a verdict this file recognizes is a review.
     Deliberately strict: a response shape that drifted is a response nobody
     should be graded against. */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return review('malformed');
    if (VERDICTS.indexOf(raw.verdict) === -1) return review('malformed');
    return {
      verdict: raw.verdict,
      confidence: raw.confidence === 'high' ? 'high' : 'low',
      flag: FLAGS.indexOf(raw.flag) === -1 ? 'none' : raw.flag,
      feedback: String(raw.feedback || '').slice(0, 400),
      reason: raw.reason || ''
    };
  }

  /* Whether to invite the learner to have another go.
   *
   * Named for what it does, because it is worth being clear about what it does
   * not do: nothing here ever un-ticks a reflection. Everything in this
   * codebase is a ratchet, never a downgrade -- mergeAttempt, recordBest and
   * rollUpUnitNumber all improve and never regress -- and a second opinion
   * arriving over the network a second later must not be the one exception
   * that takes something back.
   *
   * So the deterministic floor in reflection-check.js decides whether the item
   * counts, synchronously and offline, and this only decides whether to
   * suggest a rewrite. Only an outright fail does. A partial is a genuine
   * attempt at the question, and a review means nobody has judged it yet. */
  function needsAnotherGo(verdict) {
    return !!verdict && verdict.verdict === 'fail';
  }

  /* Whether a teacher should be shown this at all. A wrong but genuine attempt
     is between the learner and the lesson; a box filled to get past it is the
     thing a teacher asked to know about. */
  function worthFlagging(verdict) {
    return !!verdict && verdict.flag !== 'none' && verdict.verdict !== 'review';
  }

  function labelFor(verdict) {
    return (verdict && FLAG_LABEL[verdict.flag]) || '';
  }

  /* The impure half. `token` is a Firebase ID token; without one there is
     nothing to call, because the endpoint refuses an unauthenticated caller
     and a guest has no account to attribute an answer to. */
  function grade(request, token) {
    if (!token || typeof fetch !== 'function') {
      return Promise.resolve(review('signed-out'));
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, TIMEOUT_MS);

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify(request),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) return review('http-' + res.status);
        return res.json().then(normalize);
      })
      .catch(function () {
        // Offline, aborted, blocked, DNS, CORS. All the same answer.
        return review('unreachable');
      })
      .then(function (verdict) {
        clearTimeout(timer);
        return verdict;
      });
  }

  window.PyPathAiGrade = {
    ENDPOINT: ENDPOINT,
    TIMEOUT_MS: TIMEOUT_MS,
    VERDICTS: VERDICTS,
    FLAGS: FLAGS,
    FLAG_LABEL: FLAG_LABEL,
    review: review,
    normalize: normalize,
    needsAnotherGo: needsAnotherGo,
    worthFlagging: worthFlagging,
    labelFor: labelFor,
    grade: grade
  };
})();
