/* PyPath — sitting a quiz a teacher set.
 *
 * The third thing on this site that asks a student questions, and the one
 * that has to be clearest about which it is:
 *
 *   lesson-quiz.js      foot of a lesson, ungraded, unlimited, counts for
 *                       nothing. Says so in its own comment.
 *   this file           set by a teacher, has a due date, is recorded, counts
 *                       toward that assignment.
 *   unit-test-page.js   the end-of-unit exam. Recorded, capped by
 *                       maxTestAttempts, and the only thing that unlocks the
 *                       next unit.
 *
 * A student who cannot tell these apart will sit the ungraded one carefully
 * and skip the one that was set, so this page states its own row of that table
 * before the first question rather than leaving it to be inferred.
 *
 * Nothing here marks anything. question-types.js scores every kind and
 * question-render.js draws every kind; this file fetches, sequences, and
 * reports. That split is why a marking rule can be argued with in a test.
 *
 * WHAT IS AND IS NOT ENFORCED. The marking happens in this browser and the
 * answer key travels in the bank file this page fetches, so a determined
 * student can read it. That is the same tier as the end-of-unit test and every
 * other client-side gate here. The rules do refuse a submission for a unit the
 * class has not opened -- quiz.submitted counts for credit -- and they pin the
 * timestamp, so lateness cannot be forged by a wrong clock. They cannot check
 * the score or the attempt count. A quiz mark is a record of what the site saw,
 * never a proctored result, and no copy on this page says otherwise.
 */
import { currentUser } from '/assets/js/auth.js';
import { loadMembership, currentClassId } from '/assets/js/membership.js';
import { readAssignments, readEvents, readClass } from '/assets/js/classroom-store.js';

const CORE = window.PyPathClassroom;
const POLICY = window.PyPathPolicy;
const BANK = window.PyPathQuizBank;
const Q = window.PyPathQuestions;
const RENDER = window.PyPathQuestionRender;

const $ = (sel) => document.querySelector(sel);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function show(node, visible) {
  if (node) node.hidden = !visible;
}

function say(message, kind) {
  const box = $('#quiz-notice');
  if (!box) return;
  box.textContent = message || '';
  box.className = 'ut-notice' + (kind ? ' ut-notice--' + kind : '');
  show(box, !!message);
}

function assignmentId() {
  return new URLSearchParams(location.search).get('a') || '';
}

/* Session state. Held in memory only: unlike the end-of-unit test there is no
   paper to restore, because a quiz is short and reloading mid-quiz is not the
   accident a lost exam paper is. */
let state = {
  assignment: null,
  questions: [],
  readers: [],
  attemptsUsed: 0,
  classId: null,
};

function dueWords(dueAt) {
  if (!dueAt) return '';
  const day = new Date(dueAt).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return dueAt < Date.now() ? 'Was due ' + day : 'Due ' + day;
}

/* Why this student cannot sit it, or null.
 *
 * Same shape and same order as unit-test-page.js's blockedReason(): the lock
 * before the cap, because telling somebody how many attempts they have left at
 * a quiz they cannot reach is the wrong sentence.
 */
function blockedReason(quiz, klass, completedUnits, attemptsUsed) {
  if (POLICY && !POLICY.resolveUnlocked(quiz.unit, klass, completedUnits, false)) {
    const byHand = klass && POLICY.normalizeMode(klass.mode) === 'manual';
    return byHand
      ? 'Unit ' + quiz.unit + ' is not open for your class yet, so this quiz '
        + 'cannot be taken. Your teacher chooses which units are open.'
      : 'Unit ' + quiz.unit + ' is not unlocked yet. Finish Unit '
        + (quiz.unit - 1) + ' and pass its test first.';
  }

  const cap = Number(quiz.attempts) || 0;
  if (cap > 0 && attemptsUsed >= cap) {
    return 'Your teacher allows ' + cap + (cap === 1 ? ' attempt' : ' attempts')
      + ' at this quiz, and you have used ' + (cap === 1 ? 'it' : 'them all')
      + '. Your best score still stands.';
  }
  return null;
}

/* The sentence about attempts, written from the teacher's setting.
   Unlimited is the default and is what a class that never touched the setting
   has, so it is the sentence that reads as normal rather than as a concession. */
function attemptWords(quiz, used) {
  const cap = Number(quiz.attempts) || 0;
  if (!cap) {
    return 'You can retake this quiz as many times as you like. Your best score '
      + 'is the one your teacher sees.';
  }
  const left = Math.max(0, cap - used);
  return 'Your teacher allows ' + cap + (cap === 1 ? ' attempt' : ' attempts')
    + ' at this quiz. You have ' + left + ' left.';
}

function paintIntro(quiz, blocked, used, best) {
  $('#quiz-title').textContent = state.assignment.title;
  const eyebrow = $('#quiz-eyebrow');
  eyebrow.textContent = 'Set by your teacher · Unit ' + quiz.unit;
  show(eyebrow, true);

  $('#quiz-count').textContent = state.questions.length
    + (state.questions.length === 1 ? ' question' : ' questions')
    + ', marked as soon as you submit. '
    + 'This one counts: your teacher sees that you did it and what you scored.';

  const due = $('#quiz-due');
  due.textContent = dueWords(CORE.toMillis(state.assignment.dueAt));
  show(due, !!due.textContent);

  $('#quiz-retakes').textContent = attemptWords(quiz, used);

  const bestLine = $('#quiz-best');
  if (best && best.attempts) {
    bestLine.textContent = 'Your best so far is ' + best.best + ' out of 100, from '
      + best.attempts + (best.attempts === 1 ? ' attempt.' : ' attempts.');
  }
  show(bestLine, !!(best && best.attempts));

  const gate = $('#quiz-gate');
  gate.textContent = blocked || '';
  show(gate, !!blocked);
  show($('#quiz-start-row'), !blocked);
  show($('#quiz-intro'), true);
}

function buildPaper() {
  const host = $('#quiz-questions');
  host.innerHTML = '';
  state.readers = [];

  state.questions.forEach((question, i) => {
    const drawn = RENDER.render(question, i);
    if (!drawn) return;
    host.appendChild(drawn.node);
    state.readers.push({ question, read: drawn.read });
  });

  show($('#quiz-intro'), false);
  show($('#quiz-paper'), true);
  const first = host.querySelector('input, select, button');
  if (first) first.focus();
}

/* Marking, and the one number that leaves this page.
 *
 * Every kind returns { correct, total }, so a quiz mixing a matching question
 * worth four points with an MCQ worth one is summed rather than averaged --
 * which is what partial credit is for and what makes the newer kinds worth
 * having. The percentage is what gets recorded, so it reads the same way
 * test.submitted's score does and needs no second interpretation anywhere.
 */
function mark() {
  let correct = 0;
  let total = 0;
  const perQuestion = state.readers.map(({ question, read }) => {
    const verdict = Q.score(question, read());
    correct += verdict.correct;
    total += verdict.total;
    return { question, verdict };
  });
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score, perQuestion };
}

function paintResult(result, quiz) {
  const host = $('#quiz-result');
  host.innerHTML = '';

  const passed = result.score >= (Number(quiz.passMark) || 0);
  host.appendChild(el('h2', null, result.score + ' out of 100'));
  host.appendChild(el('p', 'quiz-result__sub',
    result.correct + ' of ' + result.total + ' points. '
    + (passed
      ? 'That is at or above the ' + quiz.passMark + ' your teacher set.'
      : 'Your teacher set ' + quiz.passMark + ' as the mark to reach.')));

  // Recorded either way, and said out loud: a student should not have to guess
  // whether a bad score was seen.
  host.appendChild(el('p', 'quiz-result__note',
    'This attempt has been recorded for your teacher.'));

  const list = el('ol', 'quiz-review');
  result.perQuestion.forEach(({ question, verdict }) => {
    const item = el('li', 'quiz-review__item' + (verdict.right ? ' is-right' : ' is-wrong'));
    item.appendChild(el('p', 'quiz-review__prompt', question.prompt));
    item.appendChild(el('p', 'quiz-review__mark',
      verdict.correct + ' of ' + verdict.total
      + (verdict.right ? ' — right' : verdict.correct ? ' — partly right' : ' — not right')));
    if (question.explain) {
      item.appendChild(el('p', 'quiz-review__explain', question.explain));
    }
    list.appendChild(item);
  });
  host.appendChild(list);

  const back = el('p', 'quiz-result__actions');
  const link = el('a', 'btn btn-primary route', 'Back to your work');
  link.href = '/account.html';
  back.appendChild(link);
  host.appendChild(back);

  show($('#quiz-paper'), false);
  show(host, true);
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submit(event) {
  event.preventDefault();
  const button = $('#quiz-submit');
  if (button) button.disabled = true;

  const quiz = state.assignment.quiz;
  const result = mark();

  /* One event, through the same buffered, validated path everything else
     uses. Not awaited before the result is shown: the student has finished and
     should see their mark, and event-sink.js flushes on its own schedule. A
     write that fails costs the teacher one row, which is the trade the whole
     event log already makes. */
  if (window.PyPathEvents) {
    try {
      window.PyPathEvents.record('quiz.submitted', {
        assignmentId: state.assignment.id,
        unit: Number(quiz.unit),
        score: result.score,
        correct: result.correct,
        total: result.total,
        attempt: state.attemptsUsed + 1,
      });
    } catch (e) { /* telemetry must never take the page down */ }
  }

  state.attemptsUsed += 1;
  paintResult(result, quiz);
}

async function boot() {
  const id = assignmentId();
  if (!id) {
    say('This link is missing which quiz to open. Open it from your work list.', 'error');
    return;
  }

  const user = await currentUser();
  if (!user) {
    say('Sign in to sit a quiz your teacher set.', 'error');
    return;
  }

  await loadMembership(user.uid);
  const classId = currentClassId();
  if (!classId) {
    // Not an error state: a self-study learner has no teacher to set them work,
    // and saying so is kinder than a permission failure.
    say('You are not in a class, so there is no set work to open.', 'error');
    return;
  }
  state.classId = classId;

  const [assignments, events, klass] = await Promise.all([
    readAssignments(classId).catch(() => []),
    readEvents(classId, user.uid).catch(() => []),
    readClass(classId).catch(() => null),
  ]);

  const assignment = assignments.filter((a) => a.id === id)[0];
  if (!assignment || !assignment.quiz) {
    say('That quiz is not set for your class any more.', 'error');
    return;
  }
  state.assignment = assignment;

  const bank = await BANK.load(assignment.quiz.unit);
  state.questions = BANK.pick(bank, assignment.quiz.questionIds);
  if (!state.questions.length) {
    say('This quiz has no questions that can be shown. Tell your teacher.', 'error');
    return;
  }

  const best = CORE.quizScore(events, id);
  state.attemptsUsed = best ? best.attempts : 0;

  const completed = window.ProgressStore ? window.ProgressStore.getCompletedUnits() : [];
  const blocked = blockedReason(assignment.quiz, klass, completed, state.attemptsUsed);

  paintIntro(assignment.quiz, blocked, state.attemptsUsed, best);
}

document.addEventListener('DOMContentLoaded', () => {
  const start = $('#quiz-start');
  if (start) start.addEventListener('click', buildPaper);
  const paper = $('#quiz-paper');
  if (paper) paper.addEventListener('submit', submit);

  boot().catch(() => {
    say('That quiz could not be opened. Check your connection and try again.', 'error');
  });
});
