/* PyPath — renders the teacher dashboard from the classroom event log.
 *
 * All of the judgement lives in classroom-core.js; this file reads Firestore
 * and paints the result. Keeping the split means the rules can be argued with
 * in a test rather than through the DOM.
 */
import { currentUser } from '/assets/js/auth.js';
import {
  classesFor, createClass, readRoster, readEvents, readMirror, addCoTeacher,
  setArchived, purgeArchivedClass,
} from '/assets/js/classroom-store.js';

const CORE = window.PyPathClassroom;
const CURRICULUM = window.PyPathCurriculum;

let manifest = null;
let classes = [];
let activeClassId = null;
let students = [];
let scope = 'units';
let scopeUnit = 1;
let sortBy = 'name';

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
    }))
  );
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

function columns() {
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
  if (scope === 'lessons') {
    const verified = CORE.verifiedUnits(student.events)[scopeUnit];
    return CORE.lessonState(student.events, column.key, !!verified);
  }
  return CORE.unitState(student.events, lessonsByUnit()[column.key] || [], column.key);
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

  body.innerHTML = '';
  const byUnit = lessonsByUnit();

  for (const student of list) {
    const tr = el('tr');
    const name = el('th', 'cr-grid__who', student.displayName);
    name.scope = 'row';
    tr.appendChild(name);

    for (const col of cols) {
      // At unit granularity the cell carries how far through the unit they
      // are, not only which of the five states it is in. "Attempted" covers
      // one lesson and nine, which is most of what a teacher wants to know.
      const progress = scope === 'units'
        ? CORE.unitProgress(student.events, byUnit[col.key] || [], col.key)
        : null;
      const state = progress ? progress.state : stateFor(student, col);

      const td = el('td', 'cr-cell cr-state--' + state);
      // Focusable and activatable from the keyboard, and it announces the
      // whole fact rather than leaving a screen reader to infer it from a
      // colour it cannot see.
      const button = el('button', 'cr-cell__btn');
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        student.displayName + ', ' + col.full + ': ' + CORE.MASTERY_LABEL[state]
          + (progress ? ', ' + progress.percent + '% — ' + progress.summary : '')
      );
      button.appendChild(el('span', 'cr-cell__mark', CORE.MASTERY_MARK[state]));
      if (progress) {
        button.appendChild(el('span', 'cr-cell__pct', progress.percent + '%'));
      }
      button.appendChild(el('span', 'visually-hidden', CORE.MASTERY_LABEL[state]));
      button.addEventListener('click', () => openStudent(student, col));
      td.appendChild(button);
      tr.appendChild(td);
    }

    tr.appendChild(el('td', 'cr-grid__pct', CORE.percentComplete(student.events, byUnit) + '%'));
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
  paintAttention();
  paintGrid();
  paintSummary();
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
      activeClassId = switcher.value;
      students = await loadClassData(activeClassId);
      paintAll();
    });
  }

  $$('input[name="cr-scope"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      scope = radio.value;
      const pick = $('[data-cr-unit-pick]');
      if (pick) pick.disabled = scope !== 'lessons';
      paintGrid();
    });
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

  show(root, true);
  root.setAttribute('aria-busy', 'true');
  await loadManifest();

  try {
    classes = await classesFor(user.uid);
  } catch (e) {
    classes = [];
  }

  if (!classes.length) {
    show($('[data-cr-view="empty"]'), true);
    show($('[data-cr-view="class"]'), false);
    root.setAttribute('aria-busy', 'false');
    return;
  }

  activeClassId = classes[0].id;
  students = await loadClassData(activeClassId).catch(() => []);
  show($('[data-cr-view="empty"]'), false);
  show($('[data-cr-view="class"]'), true);
  paintAll();
  root.setAttribute('aria-busy', 'false');
}

wire();

document.addEventListener('pypath:auth', (e) => {
  boot(e.detail && e.detail.user).catch(() => {});
});

export { boot, paintAll };
