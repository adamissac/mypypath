/* PyPath — what a student's class has asked of them, on their own page.
 *
 * The data was already theirs to read. firestore.rules lets an enrolled
 * student read classes/{classId}/assignments -- its own comment says this is
 * so "their own page shows what is due" -- and lets them read their own event
 * log under isOwner. Both halves existed; nothing rendered them, so a teacher
 * could set work and the students it was set for had no way to find out.
 *
 * Every judgement here is classroom-core.js's. assignmentStatus() takes one
 * student's events and returns the state and the day count, and it already
 * resolves each part to a unit name or a lesson title rather than a path, so
 * the teacher's view of an assignment and the student's cannot drift into
 * describing the same row two different ways. Nothing is recomputed locally.
 */
import { currentUser } from '/assets/js/auth.js';
import { loadMembership, currentClassId } from '/assets/js/membership.js';
import { readAssignments, readEvents, readClass } from '/assets/js/classroom-store.js';

const CORE = window.PyPathClassroom;

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

let manifest = null;
async function loadManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch('/assets/data/curriculum.json');
    manifest = res.ok ? await res.json() : { lessons: [] };
  } catch (e) {
    manifest = { lessons: [] };
  }
  return manifest;
}

function lessonsByUnit() {
  const out = {};
  for (const lesson of (manifest && manifest.lessons) || []) {
    (out[lesson.unit] = out[lesson.unit] || []).push(lesson.path);
  }
  return out;
}

function lessonTitles() {
  const out = {};
  for (const lesson of (manifest && manifest.lessons) || []) out[lesson.path] = lesson.title;
  return out;
}

/* The same five states the teacher's dashboard uses, said to the person who
   has to act on them rather than about them. "Overdue" is a fact about the
   work; "Due today" is the one that changes what someone does next. */
const STATE_LABEL = {
  'done-on-time': 'Done',
  'done-late': 'Done, handed in late',
  'not-due': 'Not due yet',
  overdue: 'Overdue',
  expired: 'Too old to check',
};

const STATE_MARK = {
  'done-on-time': '+',
  'done-late': '~',
  'not-due': '·',
  overdue: '!',
  expired: '?',
};

function dueWords(dueAt, state, now) {
  if (!dueAt) return 'No due date';
  const day = 24 * 60 * 60 * 1000;
  const midnight = (t) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(dueAt) - midnight(now)) / day);
  const date = new Date(dueAt).toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric' });
  if (state === 'done-on-time' || state === 'done-late' || state === 'expired') {
    return 'Was due ' + date;
  }
  if (days === 0) return 'Due today, ' + date;
  if (days === 1) return 'Due tomorrow, ' + date;
  if (days > 1) return 'Due in ' + days + ' days, ' + date;
  if (days === -1) return 'Was due yesterday, ' + date;
  return 'Was due ' + Math.abs(days) + ' days ago, ' + date;
}

/* One row. The parts are listed by name because "Unit 3" and "Loops and
   conditionals" are what a student was told to do, and a path is not. */
function row(assignment, status, now) {
  const item = el('li', 'sw-item sw-item--' + status.state);

  const head = el('div', 'sw-item__head');
  head.appendChild(el('h3', 'sw-item__title', assignment.title));

  const state = el('p', 'sw-item__state');
  // Mark and word together, for the same reason the mastery grid does it: this
  // has to survive greyscale and a printout, and colour is never the only
  // thing carrying a meaning.
  state.appendChild(el('span', 'sw-item__mark', STATE_MARK[status.state]));
  state.appendChild(el('span', null, ' ' + STATE_LABEL[status.state]
    + (status.state === 'done-late' && status.daysLate
      ? ' by ' + status.daysLate + (status.daysLate === 1 ? ' day' : ' days') : '')));
  head.appendChild(state);
  item.appendChild(head);

  item.appendChild(el('p', 'sw-item__due', dueWords(CORE.toMillis(assignment.dueAt),
    status.state, now)));

  const parts = el('ul', 'sw-parts');
  for (const part of status.parts || []) {
    const li = el('li', 'sw-part' + (part.done ? ' is-done' : ''));
    li.appendChild(el('span', 'sw-part__mark', part.done ? '+' : '·'));
    const link = el('a', 'sw-part__link route',
      part.title + (part.done ? '' : ''));
    /* Where each part actually is. A quiz part is the one that needs the
       assignment's own id in the URL, because unlike a unit or a lesson it has
       no page of its own to link to -- and an assignment a student cannot
       reach is the failure dcc32f6 already fixed once. */
    link.href = part.kind === 'quiz'
      ? '/quiz.html?a=' + encodeURIComponent(part.assignmentId)
      : part.kind === 'unit' ? '/units/unit-' + part.unit + '.html' : part.path;
    li.appendChild(link);
    li.appendChild(el('span', 'visually-hidden', part.done ? ' — done' : ' — not done yet'));
    parts.appendChild(li);
  }
  item.appendChild(parts);

  if (status.state === 'expired') {
    item.appendChild(el('p', 'sw-item__note',
      'This was due long enough ago that the activity records it would be '
      + 'checked against have been deleted. That is not the same as nobody '
      + 'having done it, so nothing is shown either way.'));
  }

  return item;
}

/* Where a completion time comes from, said once. The teacher's side already
   explains this in EXPLANATIONS.assignmentLate; a student reading that a piece
   of work is late deserves the same account of how that was decided, not a
   shorter one that implies more certainty. */
const HOW_LATE_IS_DECIDED =
  'Done means this site saw the work pass, stamped with server time when it '
  + 'arrived, so the date holds even if your own clock is wrong. If something '
  + 'here looks wrong, tell your teacher: they can see the same dates you can.';

async function paint(uid, classId) {
  const section = $('[data-sw]');
  const list = $('[data-sw-list]');
  const empty = $('[data-sw-empty]');
  const none = $('[data-sw-none]');
  if (!section || !list) return;

  const [assignments, events] = await Promise.all([
    readAssignments(classId).catch(() => []),
    readEvents(classId, uid, 500).catch(() => []),
  ]);

  const klass = await readClass(classId).catch(() => null);
  const who = $('[data-sw-class]');
  if (who) who.textContent = klass && klass.name ? klass.name : 'your class';

  const now = Date.now();
  const opts = { now, lessonsByUnit: lessonsByUnit(), lessonTitles: lessonTitles() };

  const rows = assignments
    .map((a) => ({ a, status: CORE.assignmentStatus(a, events, opts) }))
    // What is still owed first, then what is finished. Within each, soonest
    // due first: a list ordered by when it was set is ordered by something the
    // reader does not care about.
    .sort((x, y) => {
      const openX = x.status.state === 'overdue' || x.status.state === 'not-due';
      const openY = y.status.state === 'overdue' || y.status.state === 'not-due';
      if (openX !== openY) return openX ? -1 : 1;
      return CORE.toMillis(x.a.dueAt) - CORE.toMillis(y.a.dueAt);
    });

  list.innerHTML = '';
  for (const { a, status } of rows) list.appendChild(row(a, status, now));

  const outstanding = rows.filter(
    (r) => r.status.state === 'overdue' || r.status.state === 'not-due').length;

  // Nothing due is good news and gets said as good news. An empty box would
  // read as something failing to load.
  show(none, rows.length === 0);
  show(empty, rows.length > 0 && outstanding === 0);
  show(list, rows.length > 0);
  show(section, true);

  const note = $('[data-sw-how]');
  if (note) {
    note.textContent = HOW_LATE_IS_DECIDED;
    show(note, rows.length > 0);
  }
}

async function boot(user) {
  const section = $('[data-sw]');
  if (!section || !CORE) return;
  if (!user) {
    show(section, false);
    return;
  }
  let classId = currentClassId();
  if (!classId) classId = await loadMembership(user.uid).catch(() => null);
  if (!classId) {
    // Not in a class is not a failure and gets no empty state. A learner
    // working alone has nothing owed to anyone.
    show(section, false);
    return;
  }
  await loadManifest();
  try {
    await paint(user.uid, classId);
  } catch (e) {
    show(section, false);
  }
}

document.addEventListener('pypath:auth', (e) => {
  boot(e.detail && e.detail.user).catch(() => {});
});
if (currentUser()) boot(currentUser()).catch(() => {});

export { boot };
