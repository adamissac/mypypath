/* PyPath — one student's record, opened from a cell in the mastery grid.
 *
 * Read-only throughout, and not by omission: there is no code path in this
 * file that writes to a student's work, and the rules refuse it from the
 * teacher's side as well. A teacher who could edit a student's answer could
 * also produce a record of them having answered.
 */
import {
  readEvents, readMirror,
} from '/assets/js/classroom-store.js';

const CORE = window.PyPathClassroom;
const SNAPS = window.PyPathSnapshots;
const KEYS = window.PyPathKeys;

let manifest = { lessons: [] };
let current = null;

const $ = (sel, root) => (root || document).querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function show(node, visible) {
  if (node) node.hidden = !visible;
}

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function fmtTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function lessonsByUnit() {
  const out = {};
  for (const lesson of manifest.lessons) (out[lesson.unit] = out[lesson.unit] || []).push(lesson.path);
  return out;
}

/* Plain-language sentences, one per event type. The raw type name means
   nothing to a teacher and the payload means less. */
function describe(event) {
  const p = event.payload || {};
  const title = titleOf(event.lessonPath || p.lessonPath);
  switch (event.type) {
    case 'lesson.opened': return 'Opened ' + title;
    case 'code.run': return (p.ok ? 'Ran code in ' : 'Ran code with an error in ') + title;
    case 'code.error': return p.errorType + ' in ' + title;
    case 'code.tests_passed':
      return 'Checked ' + (p.editorId || 'an exercise') + ' in ' + title
        + ': ' + p.passed + ' of ' + p.total + ' passed';
    case 'answer.submitted':
      return 'Saved an answer for ' + (p.exerciseId || 'an exercise') + ' in ' + title
        + ' (attempt ' + p.attempt + ')';
    case 'check.answered':
      return (p.correct ? 'Answered correctly' : 'Answered incorrectly')
        + ' in ' + title + ' (attempt ' + p.attempt + ')';
    case 'test.started': return 'Started the Unit ' + p.unit + ' test';
    case 'test.submitted':
      return 'Finished the Unit ' + p.unit + ' test: ' + p.score + ' of ' + p.total;
    case 'unit.completed':
      return 'Completed Unit ' + p.unit + (p.verified ? ' (test passed)' : ' (marked complete)');
    default: return event.type;
  }
}

function titleOf(path) {
  const found = manifest.lessons.filter((l) => l.path === path)[0];
  return found ? found.title : (path || 'a lesson');
}

/* ------------------------------------------------------------------ views */

function paintHeader(root, student) {
  const header = CORE.studentHeader(student, lessonsByUnit());
  const dl = $('[data-sd-header]', root);
  dl.innerHTML = '';
  const add = (label, value) => {
    const wrap = el('div', 'sd-stat');
    wrap.appendChild(el('dt', null, label));
    wrap.appendChild(el('dd', null, value));
    dl.appendChild(wrap);
  };
  add('Joined', fmtDate(header.joinedAt));
  add('Last active', fmtDate(header.lastActiveAt));
  add('Units verified', String(header.unitsVerified));
  add('Lessons passed', header.percentComplete + '%');
  $('[data-sd-name]', root).textContent = header.displayName;
}

function paintTimeline(root, student) {
  const wrap = $('[data-sd-timeline]', root);
  wrap.innerHTML = '';
  const days = CORE.groupByDay(student.events);

  if (!days.length) {
    wrap.appendChild(el('p', 'sd-empty', 'No activity recorded yet.'));
    return;
  }

  for (const day of days) {
    // <details> so collapsed-by-default is the browser's job: it is keyboard
    // operable and announced correctly without any script of ours.
    const details = document.createElement('details');
    details.className = 'sd-day';
    details.open = day.open;
    const summary = document.createElement('summary');
    summary.appendChild(el('span', 'sd-day__date', fmtDate(Date.parse(day.day))));
    summary.appendChild(el('span', 'sd-day__count',
      day.count + (day.count === 1 ? ' action' : ' actions')));
    details.appendChild(summary);

    const list = el('ul', 'sd-events');
    for (const event of day.events) {
      const item = el('li', 'sd-event');
      item.appendChild(el('time', 'sd-event__at', fmtTime(CORE.toMillis(event.at))));
      item.appendChild(el('span', 'sd-event__what', describe(event)));
      list.appendChild(item);
    }
    details.appendChild(list);
    wrap.appendChild(details);
  }
}

function paintLessons(root, student) {
  const body = $('[data-sd-lessons-body]', root);
  const table = $('[data-sd-lessons]', root);
  const empty = $('[data-sd-lessons-empty]', root);
  body.innerHTML = '';

  const rows = CORE.perLessonRows(student.events, manifest.lessons);
  show(table, rows.length > 0);
  show(empty, rows.length === 0);

  for (const row of rows) {
    const tr = el('tr');
    const th = el('th', null, row.title);
    th.scope = 'row';
    tr.appendChild(th);

    const state = el('td', 'sd-state');
    state.appendChild(el('span', 'cr-cell__mark cr-state--' + row.state,
      CORE.MASTERY_MARK[row.state]));
    state.appendChild(el('span', 'sd-state__label', ' ' + CORE.MASTERY_LABEL[row.state]));
    tr.appendChild(state);

    tr.appendChild(el('td', 'sd-num', String(row.attempts)));
    // Blank, not 0%: "nothing attempted" and "failed everything" are
    // different facts and must not render the same.
    tr.appendChild(el('td', 'sd-num',
      row.firstTryRate === null ? '—' : Math.round(row.firstTryRate * 100) + '%'));
    tr.appendChild(el('td', null, fmtDate(row.lastActivity)));
    body.appendChild(tr);
  }
}

/* The student's own work, beside what was expected. Read-only: rendered into
   <pre>, never into an editable field. */
function paintWork(root, student) {
  const wrap = $('[data-sd-work]', root);
  wrap.innerHTML = '';

  const codeKeys = Object.keys(student.mirror || {})
    .filter((k) => k.startsWith('pypath-lesson-'))
    .sort();
  const answerKeys = Object.keys(student.mirror || {})
    .filter((k) => k.startsWith('exercise_'))
    .sort();

  if (!codeKeys.length && !answerKeys.length) {
    wrap.appendChild(el('p', 'sd-empty', 'No saved work yet.'));
    return;
  }

  for (const key of codeKeys) {
    const block = el('section', 'sd-work');
    block.appendChild(el('h4', null, key.replace('pypath-lesson-', '')));
    const pre = el('pre', 'sd-code');
    pre.appendChild(el('code', null, student.mirror[key] || ''));
    block.appendChild(pre);
    wrap.appendChild(block);
  }

  for (const key of answerKeys) {
    const block = el('section', 'sd-work');
    block.appendChild(el('h4', null, key.replace('exercise_', '')));
    block.appendChild(el('p', 'sd-answer', student.mirror[key] || ''));
    wrap.appendChild(block);
  }
}

/* The scrubber. One range input per editor, stepping through its snapshots. */
function paintHistory(root, student) {
  const wrap = $('[data-sd-history]', root);
  wrap.innerHTML = '';

  const histories = {};
  for (const key of Object.keys(student.mirror || {})) {
    if (!key.startsWith(KEYS.SNAPSHOTS_PREFIX)) continue;
    let parsed = {};
    try { parsed = JSON.parse(student.mirror[key]) || {}; } catch (e) { parsed = {}; }
    for (const editorId of Object.keys(parsed)) {
      histories[key.replace(KEYS.SNAPSHOTS_PREFIX, '') + ' · ' + editorId] = parsed[editorId];
    }
  }

  const names = Object.keys(histories).sort();
  if (!names.length) {
    wrap.appendChild(el('p', 'sd-empty', 'No code history recorded for this student yet.'));
    return;
  }

  names.forEach((name, index) => {
    const snaps = histories[name] || [];
    if (!snaps.length) return;

    const block = el('section', 'sd-history');
    block.appendChild(el('h4', null, name));

    const pre = el('pre', 'sd-code');
    const code = el('code');
    pre.appendChild(code);

    const meta = el('p', 'sd-history__meta');
    const flag = el('span', 'sd-flag');

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(snaps.length - 1);
    slider.value = String(snaps.length - 1);
    slider.className = 'sd-scrub';
    const sliderId = 'sd-scrub-' + index;
    slider.id = sliderId;

    const label = el('label', 'sd-scrub__label', 'Step through the ' + snaps.length + ' saved states');
    label.setAttribute('for', sliderId);

    function render() {
      const snap = snaps[Number(slider.value)] || snaps[snaps.length - 1];
      code.textContent = snap.code || '';
      meta.textContent = fmtDate(snap.at) + ' ' + fmtTime(snap.at)
        + ' · ' + (snap.reason === 'run' ? 'ran the code' : 'stopped typing')
        + ' · +' + snap.added + ' characters';
      flag.textContent = '';
      if (snap.largeInsertion) {
        flag.textContent = 'Large paste';
        const info = el('button', 'cr-info', 'i');
        info.type = 'button';
        info.setAttribute('data-cr-info', 'largePaste');
        info.setAttribute('aria-label', 'What "large paste" means');
        flag.appendChild(info);
      }
    }

    slider.addEventListener('input', render);
    render();

    block.appendChild(label);
    block.appendChild(slider);
    block.appendChild(meta);
    block.appendChild(flag);
    block.appendChild(pre);
    wrap.appendChild(block);
  });
}

/* ------------------------------------------------------------------- open */

export async function openStudent(classId, uid, displayName) {
  const root = $('[data-sd-root]');
  if (!root || !CORE) return;

  if (!manifest.lessons.length) {
    try {
      const res = await fetch('/assets/data/curriculum.json');
      if (res.ok) manifest = await res.json();
    } catch (e) { /* titles fall back to paths */ }
  }

  show(root, true);
  root.setAttribute('aria-busy', 'true');
  $('[data-sd-name]', root).textContent = displayName || uid;

  const student = {
    uid,
    displayName: displayName || uid,
    events: await readEvents(classId, uid, 500).catch(() => []),
    mirror: await readMirror(classId, uid).catch(() => ({})),
  };
  current = student;

  paintHeader(root, student);
  paintTimeline(root, student);
  paintLessons(root, student);
  paintWork(root, student);
  paintHistory(root, student);
  root.setAttribute('aria-busy', 'false');

  const close = $('[data-sd-close]', root);
  if (close) close.focus();
}

function closeDetail() {
  show($('[data-sd-root]'), false);
  current = null;
}

document.addEventListener('pypath:classroom-student', (e) => {
  const d = e.detail || {};
  openStudent(d.classId, d.uid, d.displayName).catch(() => {});
});

document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('[data-sd-close]')) closeDetail();
});

document.addEventListener('keydown', (e) => {
  const root = $('[data-sd-root]');
  if (e.key === 'Escape' && root && !root.hidden) closeDetail();
});

export { closeDetail };
