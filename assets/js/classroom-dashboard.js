/* PyPath — renders the teacher dashboard from the classroom event log.
 *
 * All of the judgement lives in classroom-core.js; this file reads Firestore
 * and paints the result. Keeping the split means the rules can be argued with
 * in a test rather than through the DOM.
 */
import { currentUser } from '/assets/js/auth.js';
import { readProfile } from '/assets/js/class-join.js';
import {
  classesFor, createClass, readRoster, readEvents, readMirror, addCoTeacher,
  setArchived, purgeArchivedClass, createAssignment, readAssignments,
  deleteAssignment, setLockPolicy, watchRoster, readCertificates,
  setCertificateDecision,
} from '/assets/js/classroom-store.js';

const CORE = window.PyPathClassroom;
const ROLES = window.PyPathRoles;
const CURRICULUM = window.PyPathCurriculum;

let manifest = null;
let classes = [];
let activeClassId = null;
let students = [];
let scope = 'units';
let scopeUnit = 1;
let sortBy = 'name';
let assignments = [];
let scopeAssignment = null;
let unwatchRoster = null;
let certificates = {};
const deciding = new Set();

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function show(node, visible) {
  if (node) node.hidden = !visible;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* Lesson titles come from the generated manifest, so a dashboard row says
   "Your First Program" rather than a URL. */
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

function lessonTitles() {
  const out = {};
  for (const lesson of (manifest && manifest.lessons) || []) out[lesson.path] = lesson.title;
  return out;
}

function lessonsByUnit() {
  const out = {};
  for (const lesson of (manifest && manifest.lessons) || []) {
    (out[lesson.unit] = out[lesson.unit] || []).push(lesson.path);
  }
  return out;
}

/* --------------------------------------------------------------- loading */

async function loadClassData(classId) {
  const roster = await readRoster(classId);
  // One query for the whole class. The certificate handshake lives on the flat
  // roster document, which is queryable by teacherUid; the class seat is not
  // where it is stored and does not need to be.
  const user = currentUser();
  certificates = user ? await readCertificates(user.uid).catch(() => ({})) : {};
  // One student at a time rather than one query: the rules scope reads to a
  // single student's subcollection, which is the same property that stops a
  // teacher reading a class they do not own.
  return Promise.all(
    roster.map(async (row) => ({
      uid: row.uid,
      displayName: row.displayName || row.uid,
      joinedAt: CORE.toMillis(row.joinedAt),
      lastActiveAt: CORE.toMillis(row.lastActiveAt),
      events: await readEvents(classId, row.uid, 500).catch(() => []),
      mirror: await readMirror(classId, row.uid).catch(() => ({})),
      certificate: certificates[row.uid] || {},
    }))
  );
}

/* ---------------------------------------------------------- live roster */

/* Who is in the room, kept current while the page sits open.
 *
 * A teacher reads the join code out and watches for names. Before this the
 * names arrived on the next page load, so a join that had worked perfectly
 * looked like one that had failed, and the obvious next move -- read the code
 * out again -- was the wrong one.
 *
 * The snapshot carries roster rows and nothing else. It deliberately does not
 * re-run loadClassData: that is one event-log read plus one mirror read per
 * student, and paying for the whole class every time one person joins would
 * turn a class of thirty arriving at the start of a lesson into nine hundred
 * reads. So a snapshot merges names in and leaves progress alone.
 *
 * A student who appears this way is marked `pending`: their roster row is
 * known and their progress is not loaded yet. That is not the same fact as
 * "has done nothing", and the grid says so rather than showing them a row of
 * zeroes it cannot vouch for. The real numbers arrive on the next full load.
 */
function mergeRoster(rows) {
  const known = new Map(students.map((s) => [s.uid, s]));
  // Rebuilt from the snapshot rather than patched, so a student who left is
  // gone by virtue of not being in it.
  students = rows.map((row) => {
    const existing = known.get(row.uid);
    if (existing) {
      existing.displayName = row.displayName || existing.displayName;
      existing.joinedAt = CORE.toMillis(row.joinedAt);
      existing.lastActiveAt = CORE.toMillis(row.lastActiveAt);
      existing.certificate = certificates[row.uid] || existing.certificate || {};
      return existing;
    }
    return {
      uid: row.uid,
      displayName: row.displayName || row.uid,
      joinedAt: CORE.toMillis(row.joinedAt),
      lastActiveAt: CORE.toMillis(row.lastActiveAt),
      events: [],
      mirror: {},
      certificate: certificates[row.uid] || {},
      pending: true,
    };
  });
}

/* Only the views a roster change can actually alter. Assignments, unit access,
   the switcher and the co-teacher list are all untouched by someone joining,
   and repainting them would rebuild half the page to add one row. */
function paintRosterViews() {
  paintAttention();
  paintGrid();
  paintSummary();
  paintCertificates();
}

function stopWatchingRoster() {
  if (unwatchRoster) unwatchRoster();
  unwatchRoster = null;
}

function watchActiveRoster(classId) {
  stopWatchingRoster();
  if (!classId) return;
  unwatchRoster = watchRoster(classId, (rows) => {
    // A listener torn down mid-flight can still deliver once. Painting that
    // into the class the teacher has just switched to would show them the
    // previous class's roster under the current class's name.
    if (classId !== activeClassId) return;
    mergeRoster(rows);
    paintRosterViews();
  });
}

// A listener outlives the page otherwise, and a bfcache restore would then
// hold two.
window.addEventListener('pagehide', stopWatchingRoster);

/* ------------------------------------------------------------ assignments */

const DAY_MS = 24 * 60 * 60 * 1000;

/* The words a teacher reads, in one place, so the list, the grid and the
   student page cannot describe the same state three different ways. */
const ASSIGN_LABEL = {
  'done-on-time': 'On time',
  'done-late': 'Late',
  'not-due': 'Not due yet',
  overdue: 'Overdue',
  expired: 'Records expired',
};

/* Every mark carries a character as well as a colour, for the same reason the
   mastery grid does: a department printout is always greyscale. */
const ASSIGN_MARK = { 'done-late': '~', overdue: '!' };

function assignOptions() {
  return { now: Date.now(), lessonsByUnit: lessonsByUnit(), lessonTitles: lessonTitles() };
}

function statusFor(assignment, student) {
  return CORE.assignmentStatus(assignment, student.events, assignOptions());
}

function shortDate(millis) {
  if (!millis) return '';
  return new Date(millis).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function requiredSummary(assignment) {
  const titles = lessonTitles();
  const parts = (assignment.units || []).map((u) => 'Unit ' + u)
    .concat((assignment.lessonPaths || []).map((p) => titles[p] || p));
  return parts.join(', ');
}

function paintAssignments() {
  const list = $('[data-cr-assign-list]');
  const empty = $('[data-cr-assign-empty]');
  if (!list) return;

  list.innerHTML = '';
  show(empty, assignments.length === 0);

  for (const assignment of assignments) {
    const statuses = students.map((student) => statusFor(assignment, student));
    const counted = (state) => statuses.filter((s) => s.state === state).length;

    const item = el('li', 'cr-assign__item');
    const head = el('div', 'cr-assign__head');
    head.appendChild(el('h3', 'cr-assign__title', assignment.title));
    head.appendChild(el('p', 'cr-assign__due', 'Due ' + shortDate(CORE.toMillis(assignment.dueAt))));
    item.appendChild(head);

    item.appendChild(el('p', 'cr-assign__what', requiredSummary(assignment)));

    // Not-done past due and not-done not-yet-due are separate facts and are
    // counted separately, never rolled into one "outstanding" number.
    const tally = el('ul', 'cr-assign__tally');
    for (const state of ['done-on-time', 'done-late', 'overdue', 'not-due', 'expired']) {
      const n = counted(state);
      if (!n) continue;
      const cell = el('li', 'cr-assign__count cr-assign--' + state);
      cell.appendChild(el('span', 'cr-assign__n', String(n)));
      cell.appendChild(el('span', 'cr-assign__label', ASSIGN_LABEL[state]));
      tally.appendChild(cell);
    }
    if (!students.length) {
      tally.appendChild(el('li', 'cr-assign__count', 'No students have joined yet'));
    }
    item.appendChild(tally);

    // Named individually as well as counted: a teacher acts on a name.
    const late = students
      .map((student, i) => ({ student, status: statuses[i] }))
      .filter((row) => row.status.state === 'done-late' || row.status.state === 'overdue');
    if (late.length) {
      const who = el('p', 'cr-assign__who');
      who.textContent = late.map((row) => row.student.displayName
        + (row.status.state === 'done-late'
          ? ' (' + row.status.daysLate + ' day' + (row.status.daysLate === 1 ? '' : 's') + ' late)'
          : ' (not done)')).join(', ');
      item.appendChild(who);
    }

    const remove = el('button', 'btn btn-ghost btn-small', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => removeAssignment(assignment));
    item.appendChild(remove);

    list.appendChild(item);
  }

  paintAssignmentPicker();
}

async function removeAssignment(assignment) {
  // Deleting also re-locks whatever the assignment was holding open, which is
  // why this warns rather than just doing it.
  const ok = window.confirm('Remove "' + assignment.title + '"? Students lose the '
    + 'due date, and any unit it was keeping open goes back to the access setting.');
  if (!ok) return;
  await deleteAssignment(activeClassId, assignment.id).catch(() => {});
  assignments = await readAssignments(activeClassId).catch(() => []);
  paintAssignments();
  paintGrid();
}

function paintAssignmentPicker() {
  const pick = $('[data-cr-assign-pick]');
  if (!pick) return;
  const previous = pick.value;
  pick.innerHTML = '';
  for (const assignment of assignments) {
    const option = el('option', null, assignment.title);
    option.value = assignment.id;
    pick.appendChild(option);
  }
  if (assignments.some((a) => a.id === previous)) pick.value = previous;
  else scopeAssignment = assignments.length ? assignments[0].id : null;
  if (scopeAssignment) pick.value = scopeAssignment;

  const radio = $('input[name="cr-scope"][value="assignment"]');
  // An empty lens is not a lens. Offering it would give a teacher a blank grid
  // and no way to tell whether that meant "nothing assigned" or "nobody did it".
  if (radio) radio.disabled = assignments.length === 0;
}

/* The builder's target lists, filled from the generated manifest so a teacher
   picks a lesson by its title rather than by a URL. */
function paintAssignBuilder() {
  const units = $('[data-cr-assign-units]');
  const unitPick = $('[data-cr-assign-lesson-unit]');
  const total = (CURRICULUM && CURRICULUM.TOTAL_UNITS) || 10;

  if (units && !units.children.length) {
    for (let u = 1; u <= total; u += 1) {
      const label = el('label', 'cr-check');
      const box = el('input');
      box.type = 'checkbox';
      box.value = String(u);
      box.setAttribute('data-cr-assign-unit', '');
      label.appendChild(box);
      label.appendChild(el('span', null, 'Unit ' + u));
      units.appendChild(label);
    }
  }

  if (unitPick && !unitPick.options.length) {
    for (let u = 1; u <= total; u += 1) {
      const option = el('option', null, 'Unit ' + u);
      option.value = String(u);
      unitPick.appendChild(option);
    }
    paintAssignLessons(1);
  }
}

function paintAssignLessons(unit) {
  const host = $('[data-cr-assign-lessons]');
  if (!host) return;
  host.innerHTML = '';
  const lessons = ((manifest && manifest.lessons) || []).filter((l) => l.unit === Number(unit));
  for (const lesson of lessons) {
    const label = el('label', 'cr-check');
    const box = el('input');
    box.type = 'checkbox';
    box.value = lesson.path;
    box.setAttribute('data-cr-assign-lesson', '');
    label.appendChild(box);
    label.appendChild(el('span', null, lesson.title));
    host.appendChild(label);
  }
}

/* ------------------------------------------------------------ unit access */

function paintAccess() {
  const klass = classes.filter((c) => c.id === activeClassId)[0];
  if (!klass) return;
  const POLICY = window.PyPathPolicy;
  const mode = POLICY ? POLICY.normalizeMode(klass.lockMode) : 'sequential';
  const open = klass.manualUnlocks || [];

  const radio = $('input[name="cr-lock-mode"][value="' + mode + '"]');
  if (radio) radio.checked = true;

  const host = $('[data-cr-access-units]');
  if (!host) return;
  // The unit list is only meaningful when the teacher's list is the rule.
  show(host, mode === 'manual');
  if (host.children.length) {
    $$('[data-cr-access-unit]', host).forEach((box) => {
      box.checked = open.map(Number).indexOf(Number(box.value)) !== -1;
    });
    return;
  }

  const total = (CURRICULUM && CURRICULUM.TOTAL_UNITS) || 10;
  for (let u = 1; u <= total; u += 1) {
    const label = el('label', 'cr-check');
    const box = el('input');
    box.type = 'checkbox';
    box.value = String(u);
    box.setAttribute('data-cr-access-unit', '');
    box.checked = open.map(Number).indexOf(u) !== -1;
    // Unit 1 is always open, in every mode, so the control does not pretend
    // otherwise by offering a tick that would change nothing.
    if (u === 1) {
      box.checked = true;
      box.disabled = true;
    }
    label.appendChild(box);
    label.appendChild(el('span', null, 'Unit ' + u));
    host.appendChild(label);
  }
}

/* --------------------------------------------------------------- painting */

function paintAttention() {
  const table = $('[data-cr-attention-table]');
  const body = $('[data-cr-attention-body]');
  const empty = $('[data-cr-attention-empty]');
  if (!body) return;

  const rows = CORE.needsAttention(students, {
    now: Date.now(),
    lessonTitles: lessonTitles(),
  });

  body.innerHTML = '';
  show(table, rows.length > 0);
  show(empty, rows.length === 0);

  for (const row of rows) {
    const tr = el('tr', 'cr-row cr-row--' + row.kind);
    // The student's name is the row header, so a screen reader reading a cell
    // out of context still says who it is about.
    const th = el('th', 'cr-row__who', row.displayName);
    th.scope = 'row';
    tr.appendChild(th);
    tr.appendChild(el('td', 'cr-row__why', row.reason));
    tr.appendChild(el('td', 'cr-row__do', row.nextStep));

    const go = el('td', 'cr-row__go');
    const link = el('a', 'cr-link', 'Open lesson');
    link.href = row.lessonPath;
    link.setAttribute('aria-label', 'Open ' + (lessonTitles()[row.lessonPath] || row.lessonPath)
      + ' for ' + row.displayName);
    go.appendChild(link);
    tr.appendChild(go);
    body.appendChild(tr);
  }
}

function sortedStudents() {
  const byUnit = lessonsByUnit();
  const copy = students.slice();
  copy.sort((a, b) => {
    if (sortBy === 'percent') {
      return CORE.percentComplete(b.events, byUnit) - CORE.percentComplete(a.events, byUnit);
    }
    if (sortBy === 'active') {
      return CORE.lastEventAt(b.events) - CORE.lastEventAt(a.events);
    }
    return String(a.displayName).localeCompare(String(b.displayName));
  });
  return copy;
}

function paintKey() {
  const list = $('[data-cr-key]');
  if (!list) return;
  list.innerHTML = '';
  for (const state of CORE.MASTERY) {
    const item = el('li', 'cr-key__item');
    item.appendChild(el('span', 'cr-cell__mark cr-state--' + state, CORE.MASTERY_MARK[state]));
    item.appendChild(el('span', 'cr-key__label', CORE.MASTERY_LABEL[state]));
    list.appendChild(item);
  }
}

function activeAssignment() {
  return assignments.filter((a) => a.id === scopeAssignment)[0] || null;
}

function columns() {
  if (scope === 'assignment') {
    const assignment = activeAssignment();
    if (!assignment) return [];
    const titles = lessonTitles();
    return (assignment.units || []).map((u) => ({
      key: u, label: 'U' + u, full: 'Unit ' + u, part: 'unit',
    })).concat((assignment.lessonPaths || []).map((path) => ({
      key: path, label: 'L', full: titles[path] || path, part: 'lesson',
    })));
  }
  if (scope === 'lessons') {
    const lessons = ((manifest && manifest.lessons) || []).filter((l) => l.unit === scopeUnit);
    return lessons.map((l) => ({ key: l.path, label: String(l.order), full: l.title }));
  }
  return Array.from({ length: (CURRICULUM && CURRICULUM.TOTAL_UNITS) || 10 }, (_, i) => ({
    key: i + 1,
    label: 'U' + (i + 1),
    full: 'Unit ' + (i + 1),
  }));
}

function stateFor(student, column) {
  if (scope === 'assignment') {
    if (column.part === 'unit') {
      return CORE.unitState(student.events, lessonsByUnit()[column.key] || [], column.key);
    }
    const verified = CORE.verifiedUnits(student.events);
    const unit = CURRICULUM ? CURRICULUM.unitOf(column.key) : null;
    return CORE.lessonState(student.events, column.key, !!verified[unit]);
  }
  if (scope === 'lessons') {
    const verified = CORE.verifiedUnits(student.events)[scopeUnit];
    return CORE.lessonState(student.events, column.key, !!verified);
  }
  return CORE.unitState(student.events, lessonsByUnit()[column.key] || [], column.key);
}

/* Whether this cell's target is assigned, and how it stands.
 *
 * Only the two states worth interrupting a grid for are drawn: done late, and
 * past due with nothing done. On time and not-yet-due are the ordinary case and
 * would be noise on every cell of an assigned unit.
 *
 * Null when nothing is assigned here, or in the assignment lens, where every
 * column is assigned by definition and marking them all would say nothing.
 */
function overlayFor(student, col) {
  if (scope === 'assignment' || !assignments.length) return null;
  const key = scope === 'lessons' ? 'lessonPaths' : 'units';
  const value = scope === 'lessons' ? col.key : Number(col.key);

  let worst = null;
  for (const assignment of assignments) {
    const targets = (assignment[key] || []).map((t) => (key === 'units' ? Number(t) : t));
    if (targets.indexOf(value) === -1) continue;
    const state = statusFor(assignment, student).state;
    // Overdue outranks late: one is still outstanding, the other is finished.
    if (state === 'overdue') return 'overdue';
    if (state === 'done-late') worst = 'done-late';
  }
  return worst;
}

function paintGrid() {
  const head = $('[data-cr-grid-head]');
  const body = $('[data-cr-grid-body]');
  const table = $('[data-cr-grid]');
  const empty = $('[data-cr-grid-empty]');
  if (!head || !body) return;

  const list = sortedStudents();
  show(table, list.length > 0);
  show(empty, list.length === 0);

  head.innerHTML = '';
  const corner = el('th', 'cr-grid__corner', 'Student');
  corner.scope = 'col';
  head.appendChild(corner);
  const cols = columns();
  for (const col of cols) {
    const th = el('th', 'cr-grid__col');
    th.scope = 'col';
    th.title = col.full;
    th.appendChild(el('span', null, col.label));
    th.appendChild(el('span', 'visually-hidden', ' ' + col.full));
    head.appendChild(th);
  }
  const pct = el('th', 'cr-grid__col cr-grid__pct', '%');
  pct.scope = 'col';
  head.appendChild(pct);
  const cert = el('th', 'cr-grid__col cr-grid__cert', 'Cert');
  cert.scope = 'col';
  cert.title = 'Certificate';
  head.appendChild(cert);

  body.innerHTML = '';
  const byUnit = lessonsByUnit();

  for (const student of list) {
    const tr = el('tr');
    const name = el('th', 'cr-grid__who', student.displayName);
    name.scope = 'row';
    // Arrived on the live roster, progress not read yet. Said out loud rather
    // than shown as a row of zeroes, which is a different claim and one this
    // row cannot make yet.
    if (student.pending) name.appendChild(el('span', 'cr-grid__pending', 'just joined'));
    tr.appendChild(name);

    for (const col of cols) {
      // At unit granularity the cell carries how far through the unit they
      // are, not only which of the five states it is in. "Attempted" covers
      // one lesson and nine, which is most of what a teacher wants to know.
      const progress = scope === 'units'
        ? CORE.unitProgress(student.events, byUnit[col.key] || [], col.key)
        : null;
      const state = progress ? progress.state : stateFor(student, col);

      // The assignment overlay. Not a separate table: a teacher already reads
      // this grid, and an assigned-and-missed unit has to be visible where they
      // are already looking. Character as well as colour, for the printout.
      const overlay = overlayFor(student, col);

      const td = el('td', 'cr-cell cr-state--' + state
        + (overlay ? ' cr-assigned cr-assigned--' + overlay : ''));
      // Focusable and activatable from the keyboard, and it announces the
      // whole fact rather than leaving a screen reader to infer it from a
      // colour it cannot see.
      const button = el('button', 'cr-cell__btn');
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        student.displayName + ', ' + col.full + ': ' + CORE.MASTERY_LABEL[state]
          + (progress ? ', ' + progress.percent + '% — ' + progress.summary : '')
          + (overlay ? ', assigned: ' + ASSIGN_LABEL[overlay] : '')
      );
      button.appendChild(el('span', 'cr-cell__mark',
        CORE.MASTERY_MARK[state] + (overlay ? ASSIGN_MARK[overlay] : '')));
      if (progress) {
        button.appendChild(el('span', 'cr-cell__pct', progress.percent + '%'));
      }
      button.appendChild(el('span', 'visually-hidden', CORE.MASTERY_LABEL[state]
        + (overlay ? '. Assigned: ' + ASSIGN_LABEL[overlay] : '')));
      button.addEventListener('click', () => openStudent(student, col));
      td.appendChild(button);
      tr.appendChild(td);
    }

    tr.appendChild(el('td', 'cr-grid__pct', CORE.percentComplete(student.events, byUnit) + '%'));

    // State only here. The decision lives in Certificates below, where there
    // is room to say what approving means; this cell is for reading across a
    // row, and carries a mark so it survives greyscale and a printout.
    const cstate = CORE.certificateState(student.certificate);
    const ctd = el('td', 'cr-grid__cert cr-cert--' + cstate);
    ctd.appendChild(el('span', 'cr-cert__mark', CORE.CERT_MARK[cstate]));
    ctd.appendChild(el('span', 'visually-hidden',
      'Certificate: ' + CORE.CERT_LABEL[cstate]));
    ctd.title = 'Certificate: ' + CORE.CERT_LABEL[cstate];
    tr.appendChild(ctd);
    body.appendChild(tr);
  }
}

function stat(dl, label, value, explainKey) {
  const wrap = el('div', 'cr-stat');
  const dt = el('dt');
  dt.appendChild(document.createTextNode(label));
  if (explainKey) {
    const info = el('button', 'cr-info', 'i');
    info.type = 'button';
    info.setAttribute('data-cr-info', explainKey);
    info.setAttribute('aria-label', 'How ' + label + ' is worked out');
    dt.appendChild(info);
  }
  wrap.appendChild(dt);
  wrap.appendChild(el('dd', null, value));
  dl.appendChild(wrap);
}

/* ---------------------------------------------------------- certificates */

/* The queue, and the two buttons that empty it.
 *
 * Only students who have got as far as finishing appear: a list of everyone
 * who has not is the progress grid, which is already on this page. Decided
 * rows stay, because a decision has to be reversible from where it was made --
 * a declined learner is approved from the same row once the work improves.
 */
function paintCertificates() {
  const section = $('[data-cr-certs]');
  const list = $('[data-cr-certs-list]');
  const empty = $('[data-cr-certs-empty]');
  if (!list) return;

  const rows = students
    .map((s) => ({ student: s, state: CORE.certificateState(s.certificate) }))
    .filter((r) => r.state !== 'none')
    .sort((a, b) => CORE.CERT_ORDER[b.state] - CORE.CERT_ORDER[a.state]
      || String(a.student.displayName).localeCompare(String(b.student.displayName)));

  list.innerHTML = '';
  show(empty, rows.length === 0);
  if (section) show(section, true);

  for (const { student, state } of rows) {
    const item = el('li', 'cr-cert-row cr-cert--' + state);

    const who = el('p', 'cr-cert-row__who');
    who.appendChild(el('strong', null, student.displayName));
    const pill = el('span', 'cr-cert-row__state');
    // Mark and word, never colour alone.
    pill.appendChild(el('span', 'cr-cert__mark', CORE.CERT_MARK[state]));
    pill.appendChild(el('span', null, ' ' + CORE.CERT_LABEL[state]));
    who.appendChild(pill);
    item.appendChild(who);

    const when = student.certificate || {};
    const asked = when.requestedAt
      ? 'Asked ' + new Date(when.requestedAt).toLocaleDateString() : '';
    const done = when.decidedAt
      ? ' · decided ' + new Date(when.decidedAt).toLocaleDateString() : '';
    if (asked) item.appendChild(el('p', 'cr-cert-row__when', asked + done));

    // Both buttons on every row, whatever the state: reversing a decision is
    // the same gesture as making it, and hiding the other half would mean a
    // declined learner could never be approved.
    const actions = el('p', 'cr-cert-row__do');
    for (const [approved, label] of [[true, 'Approve'], [false, 'Decline']]) {
      const btn = el('button', 'btn btn-ghost btn-small', label);
      btn.type = 'button';
      btn.setAttribute('aria-label',
        label + ' the certificate for ' + student.displayName);
      btn.disabled = deciding.has(student.uid);
      btn.addEventListener('click', () => decideCertificate(student, approved));
      actions.appendChild(btn);
    }
    item.appendChild(actions);
    list.appendChild(item);
  }
}

/* Painted first and reconciled after, so the row answers immediately. A failed
   write puts the old state back rather than leaving a decision on screen that
   never reached the database. */
async function decideCertificate(student, approved) {
  if (deciding.has(student.uid)) return;
  const before = Object.assign({}, student.certificate || {});
  deciding.add(student.uid);
  student.certificate = Object.assign({}, before,
    { approved, decidedAt: Date.now() });
  certificates[student.uid] = student.certificate;
  paintCertificates();
  paintGrid();
  paintAttention();

  try {
    await setCertificateDecision(student.uid, approved);
    if (window.PyUI) {
      window.PyUI.showToast(approved
        ? student.displayName + ' can now download their certificate.'
        : 'Held back. ' + student.displayName
          + ' can be approved from the same row once the work improves.');
    }
  } catch (e) {
    student.certificate = before;
    certificates[student.uid] = before;
    if (window.PyUI) window.PyUI.showToast('Could not save that decision. Please try again.');
  } finally {
    deciding.delete(student.uid);
    paintCertificates();
    paintGrid();
    paintAttention();
  }
}

function paintSummary() {
  const dl = $('[data-cr-summary]');
  if (!dl) return;
  dl.innerHTML = '';
  const s = CORE.classSummary(students, { now: Date.now(), lessonTitles: lessonTitles() });

  stat(dl, 'Students', String(s.students));
  stat(dl, 'Median unit reached', s.medianUnitReached ? 'Unit ' + s.medianUnitReached : '—',
    'medianUnit');
  stat(dl, 'Active this week', String(s.activeThisWeek), 'activeThisWeek');
  stat(dl, 'Hardest lesson',
    s.hardestLesson ? s.hardestLesson.title + ' (' + s.hardestLesson.averageAttempts + ' tries avg)' : '—',
    'hardestLesson');
  stat(dl, 'Most common error this week',
    s.commonError ? s.commonError.errorType + ' (' + s.commonError.count + ')' : '—',
    'commonError');
}

function paintUnitPicker() {
  const pick = $('[data-cr-unit-pick]');
  if (!pick || pick.options.length) return;
  for (let u = 1; u <= ((CURRICULUM && CURRICULUM.TOTAL_UNITS) || 10); u += 1) {
    const option = el('option', null, 'Unit ' + u);
    option.value = String(u);
    pick.appendChild(option);
  }
}

function paintSwitcher() {
  const select = $('[data-cr-switcher]');
  if (!select) return;
  select.innerHTML = '';
  for (const klass of classes) {
    const option = el('option', null, klass.name + (klass.archived ? ' (archived)' : ''));
    option.value = klass.id;
    select.appendChild(option);
  }
  select.value = activeClassId || '';
  // One class is not a choice, so the control does not pretend to be one.
  select.hidden = classes.length < 2;
}

function paintAll() {
  const klass = classes.filter((c) => c.id === activeClassId)[0];
  const code = $('[data-cr-code]');
  if (code && klass) code.textContent = klass.joinCode || '------';
  paintSwitcher();
  paintUnitPicker();
  paintKey();
  paintAssignBuilder();
  paintAssignments();
  paintAccess();
  paintAttention();
  paintGrid();
  paintSummary();
  paintCertificates();
  paintTeachers();

  const archiveBtn = $('[data-cr-archive]');
  if (archiveBtn && klass) {
    archiveBtn.textContent = klass.archived ? 'Reopen class' : 'Archive class';
  }
}

/* A filename a teacher can find again, from a class name they chose. */
function slug(name) {
  return String(name || 'class')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'class';
}

function paintTeachers() {
  const list = $('[data-cr-teachers]');
  const klass = classes.filter((c) => c.id === activeClassId)[0];
  if (!list || !klass) return;
  list.innerHTML = '';
  const user = currentUser();
  for (const uid of klass.teacherUids || []) {
    const item = el('li', 'cr-teacher');
    item.textContent = uid === (user && user.uid) ? uid + ' (you)' : uid;
    list.appendChild(item);
  }
}

function openStudent(student, column) {
  document.dispatchEvent(new CustomEvent('pypath:classroom-student', {
    detail: {
      classId: activeClassId,
      uid: student.uid,
      // A username, never a legal name -- it is the only name this feature
      // ever holds.
      displayName: student.displayName,
      column,
    },
  }));
}

/* ---------------------------------------------------------------- events */

function explain(key) {
  const panel = $('[data-cr-explain]');
  const body = $('[data-cr-explain-body]');
  if (!panel || !body) return;
  body.textContent = CORE.EXPLANATIONS[key] || CORE.EXPLANATIONS.trust;
  show(panel, true);
  const close = $('[data-cr-explain-close]');
  if (close) close.focus();
}

/* Writes the mode and the tick list together, because they are one setting.
   Saving the mode without the list would briefly leave a class in "by hand"
   with nothing but unit 1 open. */
async function saveAccess() {
  const error = $('[data-cr-access-error]');
  show(error, false);
  const picked = $('input[name="cr-lock-mode"]:checked');
  const mode = picked ? picked.value : 'sequential';
  const units = $$('[data-cr-access-unit]:checked').map((b) => Number(b.value));

  try {
    const saved = await setLockPolicy(activeClassId, mode, units);
    const klass = classes.filter((c) => c.id === activeClassId)[0];
    if (klass) {
      klass.lockMode = saved.mode;
      klass.manualUnlocks = saved.manualUnlocks;
    }
    paintAccess();
  } catch (err) {
    if (error) {
      error.textContent = 'Could not save that. Check your connection and try again.';
      show(error, true);
    }
  }
}

function wire() {
  document.addEventListener('click', (e) => {
    const info = e.target.closest && e.target.closest('[data-cr-info]');
    if (info) {
      explain(info.getAttribute('data-cr-info'));
      return;
    }
    if (e.target.closest && e.target.closest('[data-cr-explain-close]')) {
      show($('[data-cr-explain]'), false);
    }
  });

  // Escape closes the explanation, as it does for every other dialog here.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') show($('[data-cr-explain]'), false);
  });

  const switcher = $('[data-cr-switcher]');
  if (switcher) {
    switcher.addEventListener('change', async () => {
      // Torn down before the await, not after: the old class's listener is
      // live for as long as that load takes, and a fire during it would merge
      // the previous class's roster into the one being switched to.
      stopWatchingRoster();
      activeClassId = switcher.value;
      students = await loadClassData(activeClassId);
      assignments = await readAssignments(activeClassId).catch(() => []);
      scopeAssignment = assignments.length ? assignments[0].id : null;
      paintAll();
      watchActiveRoster(activeClassId);
    });
  }

  $$('input[name="cr-scope"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      scope = radio.value;
      const pick = $('[data-cr-unit-pick]');
      if (pick) pick.disabled = scope !== 'lessons';
      const assignPick = $('[data-cr-assign-pick]');
      if (assignPick) assignPick.disabled = scope !== 'assignment';
      paintGrid();
    });
  });

  const assignPick = $('[data-cr-assign-pick]');
  if (assignPick) {
    assignPick.addEventListener('change', () => {
      scopeAssignment = assignPick.value;
      paintGrid();
    });
  }

  const lessonUnit = $('[data-cr-assign-lesson-unit]');
  if (lessonUnit) {
    lessonUnit.addEventListener('change', () => paintAssignLessons(lessonUnit.value));
  }

  const assignForm = $('[data-cr-assign-form]');
  if (assignForm) {
    assignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = $('[data-cr-assign-error]');
      show(error, false);

      const title = $('#cr-assign-title').value;
      const raw = $('#cr-assign-due').value;
      // A date input gives midnight. Work due "on Friday" is due at the end of
      // Friday, not at the start of it, so the deadline is the end of that day
      // in the teacher's own timezone.
      const due = raw ? new Date(raw + 'T23:59:59').getTime() : 0;

      const units = $$('[data-cr-assign-unit]:checked').map((b) => Number(b.value));
      const lessonPaths = $$('[data-cr-assign-lesson]:checked').map((b) => b.value);

      try {
        await createAssignment(activeClassId, { title, dueAt: due, units, lessonPaths });
        assignments = await readAssignments(activeClassId).catch(() => []);
        assignForm.reset();
        $$('[data-cr-assign-unit], [data-cr-assign-lesson]').forEach((b) => { b.checked = false; });
        const panel = assignForm.closest('details');
        if (panel) panel.open = false;
        paintAssignments();
        paintGrid();
      } catch (err) {
        if (error) {
          error.textContent = err && err.message ? err.message : 'Could not set that work.';
          show(error, true);
        }
      }
    });
  }

  $$('input[name="cr-lock-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => saveAccess());
  });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-cr-access-unit')) {
      saveAccess();
    }
  });

  const pick = $('[data-cr-unit-pick]');
  if (pick) {
    pick.addEventListener('change', () => {
      scopeUnit = Number(pick.value) || 1;
      paintGrid();
    });
  }

  const sort = $('[data-cr-sort]');
  if (sort) {
    sort.addEventListener('change', () => {
      sortBy = sort.value;
      paintGrid();
    });
  }

  const copy = $('[data-cr-copy]');
  if (copy) {
    copy.addEventListener('click', async () => {
      const klass = classes.filter((c) => c.id === activeClassId)[0];
      if (!klass) return;
      try {
        await navigator.clipboard.writeText(klass.joinCode);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy code'; }, 2000);
      } catch (err) {
        // Clipboard access can be refused; the code is on screen either way.
      }
    });
  }

  const print = $('[data-cr-print]');
  if (print) print.addEventListener('click', () => window.print());

  const exportBtn = $('[data-cr-export]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const klass = classes.filter((c) => c.id === activeClassId)[0];
      const csv = window.PyPathExport.masteryCsv(sortedStudents(), {
        lessonsByUnit: lessonsByUnit(),
        totalUnits: (CURRICULUM && CURRICULUM.TOTAL_UNITS) || 10,
        assignments,
        lessonTitles: lessonTitles(),
        now: Date.now(),
      });
      // Built and downloaded in the browser; the export never leaves the
      // teacher's machine.
      window.PyPathExport.download(
        'pypath-' + slug(klass ? klass.name : 'class') + '.csv', csv
      );
    });
  }

  const digestBtn = $('[data-cr-digest]');
  if (digestBtn) {
    digestBtn.addEventListener('click', () => {
      const klass = classes.filter((c) => c.id === activeClassId)[0];
      const text = window.PyPathExport.digest(students, {
        now: Date.now(),
        lessonTitles: lessonTitles(),
        className: klass ? klass.name : 'Class',
      });
      const field = $('[data-cr-digest-text]');
      if (field) field.value = text;
      show($('[data-cr-digest-section]'), true);
      if (field) field.focus();
    });
  }

  const digestCopy = $('[data-cr-digest-copy]');
  if (digestCopy) {
    digestCopy.addEventListener('click', async () => {
      const field = $('[data-cr-digest-text]');
      if (!field) return;
      try {
        await navigator.clipboard.writeText(field.value);
        digestCopy.textContent = 'Copied';
        setTimeout(() => { digestCopy.textContent = 'Copy'; }, 2000);
      } catch (err) {
        // The text is selectable on screen either way.
        field.select();
      }
    });
  }

  const archive = $('[data-cr-archive]');
  if (archive) {
    archive.addEventListener('click', async () => {
      const klass = classes.filter((c) => c.id === activeClassId)[0];
      if (!klass) return;
      await setArchived(activeClassId, !klass.archived).catch(() => {});
      const user = currentUser();
      if (user) classes = await classesFor(user.uid);
      paintAll();
    });
  }

  const purge = $('[data-cr-purge]');
  if (purge) {
    purge.addEventListener('click', async () => {
      const note = $('[data-cr-purge-note]');
      // Two presses, because this deletes a year of a class's records and
      // there is no undo.
      if (purge.dataset.confirming !== 'yes') {
        purge.dataset.confirming = 'yes';
        purge.textContent = 'Confirm: delete all records';
        return;
      }
      purge.textContent = 'Purge archived class';
      delete purge.dataset.confirming;
      try {
        const counts = await purgeArchivedClass(activeClassId);
        if (note) {
          note.textContent = 'Deleted records for ' + counts.students + ' student(s).';
          show(note, true);
        }
        students = await loadClassData(activeClassId).catch(() => []);
        paintAll();
      } catch (err) {
        if (note) {
          note.textContent = err && err.code === 'not-archived'
            ? 'Archive the class first.'
            : 'Could not purge the class. Records older than a year can be purged once it is archived.';
          show(note, true);
        }
      }
    });
  }

  const share = $('[data-cr-share]');
  if (share) {
    share.addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = $('[data-cr-share-error]');
      show(error, false);
      const field = $('#cr-coteacher');
      const uid = field.value.trim();
      if (!uid || !activeClassId) return;
      try {
        await addCoTeacher(activeClassId, uid);
        const user = currentUser();
        if (user) classes = await classesFor(user.uid);
        field.value = '';
        paintTeachers();
      } catch (err) {
        if (error) {
          error.textContent = 'Could not add that account. Check the id and try again.';
          show(error, true);
        }
      }
    });
  }

  const newClass = $('[data-cr-new-class]');
  if (newClass) {
    newClass.addEventListener('click', () => {
      show($('[data-cr-view="empty"]'), true);
      const field = $('#cr-class-name');
      if (field) field.focus();
    });
  }

  const form = $('[data-cr-create]');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = currentUser();
      const error = $('[data-cr-create-error]');
      show(error, false);
      if (!user) return;
      const name = $('#cr-class-name').value.trim();
      try {
        const made = await createClass(user.uid, name);
        classes = await classesFor(user.uid);
        activeClassId = made.classId;
        students = await loadClassData(activeClassId);
        show($('[data-cr-view="empty"]'), false);
        show($('[data-cr-view="class"]'), true);
        paintAll();
      } catch (err) {
        if (error) {
          error.textContent = 'Could not create the class. Please try again.';
          show(error, true);
        }
      }
    });
  }
}

/* ------------------------------------------------------------------ boot */

async function boot(user) {
  const root = $('[data-cr-root]');
  if (!root || !CORE) return;

  if (!user) {
    show(root, false);
    return;
  }

  /* Asked before anything is created. Below, a signed-in visitor with no
     classes gets one made for them, and createClass writes role: 'teacher'
     onto their own account -- so without this check any student who opened
     /classroom.html was quietly turned into a teacher and handed a classroom.
     classroom-page.js asks the same question to choose which state of the page
     to show, but the two run independently and its answer never reached here. */
  let profile = {};
  try {
    profile = await readProfile(user.uid);
  } catch (e) {
    // An unreadable profile is not permission to assume the generous answer.
    show(root, false);
    return;
  }
  if (!ROLES || ROLES.normalizeRole(profile.role) !== 'teacher') {
    show(root, false);
    return;
  }

  show(root, true);
  root.setAttribute('aria-busy', 'true');
  await loadManifest();

  try {
    classes = await classesFor(user.uid);
  } catch (e) {
    classes = [];
  }

  /* A teacher with no class is a dead end, and it does not look like one.
     Assignments and unit access live inside a class, so with none they stay
     hidden, and the page reads as though the features are missing rather than
     as though there is nothing yet to attach them to.

     Becoming a teacher now creates a class, but every teacher who did so
     before that landed here with none, so the gap is closed on arrival too.
     Named "My class" and renameable, which is a better first run than a form
     nobody knew to look for. */
  if (!classes.length) {
    try {
      const made = await createClass(user.uid, 'My class');
      classes = await classesFor(user.uid);
      if (!classes.length && made) classes = [{ id: made.classId, name: made.name,
        joinCode: made.joinCode, teacherUids: [user.uid], archived: false }];
    } catch (e) {
      // Offline, or the write was refused. The create form below is still
      // there and still works, so this is a worse first run rather than a
      // broken one.
    }
  }

  if (!classes.length) {
    show($('[data-cr-view="empty"]'), true);
    show($('[data-cr-view="class"]'), false);
    root.setAttribute('aria-busy', 'false');
    return;
  }

  activeClassId = classes[0].id;
  students = await loadClassData(activeClassId).catch(() => []);
  assignments = await readAssignments(activeClassId).catch(() => []);
  scopeAssignment = assignments.length ? assignments[0].id : null;
  show($('[data-cr-view="empty"]'), false);
  show($('[data-cr-view="class"]'), true);
  paintAll();
  // After the full load, so the first snapshot merges into real progress data
  // rather than replacing it with placeholders.
  watchActiveRoster(activeClassId);
  root.setAttribute('aria-busy', 'false');
}

wire();

document.addEventListener('pypath:auth', (e) => {
  boot(e.detail && e.detail.user).catch(() => {});
});

export { boot, paintAll };
