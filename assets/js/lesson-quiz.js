/* PyPath — the checks for understanding at the foot of a lesson.
 *
 * Three to five multiple-choice questions, answered as many times as the
 * learner likes, with the reason shown as soon as they pick. They are not a
 * test and are not scored: the attempt count is recorded so a teacher can see
 * which idea took several goes, and nothing else is.
 *
 * Questions live under a `questions` key in the same check file the auto-grader
 * reads, so one file per lesson holds everything authored about it.
 */
(function () {
  'use strict';

  var attempts = {};

  function note(type, payload) {
    if (!window.PyPathEvents) return;
    try { window.PyPathEvents.record(type, payload); } catch (e) {}
  }

  function lessonPath() {
    try { return location.pathname; } catch (e) { return ''; }
  }

  function specUrl() {
    var m = /^\/units\/(unit-\d+)\/([a-z0-9-]+)\.html$/.exec(lessonPath());
    return m ? '/assets/data/checks/' + m[1] + '/' + m[2] + '.json' : null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* The four types that are not single-answer multiple choice.
   *
   * They are checked rather than answered live: an MCQ can show the reason the
   * instant a radio is picked, because picking is the whole answer, but a
   * matching question is not answered until every row is paired. Marking one
   * as it is built would tell a learner they were wrong before they had
   * finished being right. */
  function renderRich(question, index) {
    var RENDER = window.PyPathQuestionRender;
    var Q = window.PyPathQuestions;
    var built = RENDER && RENDER.render(question, index);
    if (!built) return null;

    var block = el('li', 'quiz-q');
    block.appendChild(built.node);

    var feedback = el('p', 'quiz-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.hidden = true;

    var check = el('button', 'btn btn-ghost btn-small quiz-q__check', 'Check');
    check.type = 'button';
    check.addEventListener('click', function () {
      attempts[question.id] = (attempts[question.id] || 0) + 1;
      var result = Q.score(question, built.read());

      // The count as well as the verdict: "3 of 4" is a different thing to
      // learn from than "not quite", and both of them beat a red cross.
      feedback.textContent = (result.right ? '\u2713 Correct. ' : '\u2715 ')
        + result.correct + ' of ' + result.total + ' right. '
        + (question.explain || '');
      feedback.className = 'quiz-feedback is-' + (result.right ? 'right' : 'wrong');
      feedback.hidden = false;

      note('check.answered', {
        lessonPath: lessonPath(),
        questionId: question.id,
        correct: result.right,
        attempt: attempts[question.id]
      });
    });

    block.appendChild(check);
    block.appendChild(feedback);
    return block;
  }

  function renderQuestion(question, index) {
    var Q = window.PyPathQuestions;
    if (Q && Q.kindOfQuestion(question) !== 'mcq') {
      var rich = renderRich(question, index);
      // A question whose renderer did not load is skipped rather than drawn as
      // an MCQ it is not, which would show the wrong controls and mark them
      // against the wrong answer key.
      if (rich) return rich;
      return null;
    }

    var block = el('li', 'quiz-q');
    // A fieldset so the choices are announced as one group with the question
    // as their name, rather than as four unrelated radio buttons.
    var fieldset = document.createElement('fieldset');
    fieldset.className = 'quiz-q__set';

    var legend = document.createElement('legend');
    legend.className = 'quiz-q__prompt';
    legend.textContent = (index + 1) + '. ' + question.prompt;
    fieldset.appendChild(legend);

    var feedback = el('p', 'quiz-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.hidden = true;

    var name = 'quiz-' + question.id;
    (question.choices || []).forEach(function (choice, choiceIndex) {
      var id = name + '-' + choiceIndex;
      var row = el('div', 'quiz-choice');

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.id = id;
      input.value = String(choiceIndex);

      var label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = choice;

      input.addEventListener('change', function () {
        attempts[question.id] = (attempts[question.id] || 0) + 1;
        var correct = choiceIndex === question.answer;

        // The mark and the word carry the verdict; colour is the third signal.
        feedback.textContent = (correct ? '✓ Correct. ' : '✕ Not quite. ')
          + (question.explain || '');
        feedback.className = 'quiz-feedback is-' + (correct ? 'right' : 'wrong');
        feedback.hidden = false;

        row.parentNode.querySelectorAll('.quiz-choice').forEach(function (r) {
          r.classList.remove('is-chosen');
        });
        row.classList.add('is-chosen');

        note('check.answered', {
          lessonPath: lessonPath(),
          questionId: question.id,
          correct: correct,
          attempt: attempts[question.id]
        });
      });

      row.appendChild(input);
      row.appendChild(label);
      fieldset.appendChild(row);
    });

    block.appendChild(fieldset);
    block.appendChild(feedback);
    return block;
  }

  function render(questions) {
    var host = document.querySelector('.lesson-content')
      || document.querySelector('main')
      || document.body;
    if (!host || document.querySelector('.quiz')) return;

    var section = el('section', 'quiz');
    section.setAttribute('aria-labelledby', 'quiz-heading');

    // h2, matching the other section headings in a lesson, so the outline
    // stays in order.
    var heading = el('h2', 'quiz__heading', 'Check your understanding');
    heading.id = 'quiz-heading';
    section.appendChild(heading);

    section.appendChild(el(
      'p', 'quiz__note',
      'Answer as many times as you like. These are not marked -- they are here '
      + 'so you can catch anything that has not landed yet.'
    ));

    var list = el('ol', 'quiz__list');
    questions.forEach(function (question, index) {
      var block = renderQuestion(question, index);
      if (block) list.appendChild(block);
    });
    section.appendChild(list);

    // Before the footer if there is one, so it reads as part of the lesson.
    var exercises = host.querySelector('.exercise-section');
    if (exercises && exercises.parentNode) {
      exercises.parentNode.insertBefore(section, exercises.nextSibling);
    } else {
      host.appendChild(section);
    }
  }

  function init() {
    var url = specUrl();
    if (!url) return;
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (spec) {
        var questions = spec && spec.questions;
        if (Array.isArray(questions) && questions.length) render(questions);
      })
      .catch(function () {
        // A lesson with no check file simply has no quiz.
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PyPathQuiz = { specUrl: specUrl, render: render, renderQuestion: renderQuestion,
    renderRich: renderRich };
})();
