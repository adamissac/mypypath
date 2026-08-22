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

  function renderQuestion(question, index) {
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
      list.appendChild(renderQuestion(question, index));
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

  window.PyPathQuiz = { specUrl: specUrl, render: render, renderQuestion: renderQuestion };
})();
