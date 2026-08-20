/* PyPath — a teacher's own classroom: their join code and their roster.

   Deliberately shows no uids. A teacher needs to know who their students are
   and how they are doing; the internal account identifier is not part of that,
   and once it is on screen it ends up in screenshots and spreadsheets. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { currentUser } from '/assets/js/auth.js';
import {
  readProfile, ensureJoinCode, regenerateJoinCode, removeStudent,
} from '/assets/js/class-join.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { collection, query, where, getDocs } =
  await import(`${BASE}/firebase-firestore.js`);

const ROLES = window.PyPathRoles;
const ACT = window.PyPathActivity;
const TOTAL_UNITS = 10;

const state = { uid: null, code: '', rows: [], sort: 'name', dir: 1 };

function qs(sel) { return document.querySelector(sel); }

function show(name) {
  ['loading', 'guest', 'not-teacher', 'error', 'ready'].forEach((s) => {
    const el = qs(`[data-class-state="${s}"]`);
    if (el) el.hidden = s !== name;
  });
}

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const d = new Date(n);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function toRow(id, data) {
  const units = Array.isArray(data.completedUnits) ? data.completedUnits : [];
  const count = Number.isFinite(Number(data.unitsCompleted))
    ? Number(data.unitsCompleted)
    : units.length;
  return {
    uid: id, // kept for the remove call only; never rendered or exported
    name: data.displayName || '',
    email: data.email || '',
    joined: Number(data.joinedClassAt) || Number(data.createdAt) || 0,
    lastSeenAt: Number(data.lastSeenAt) || 0,
    seconds: Number(data.totalSeconds) || 0,
    units: Math.max(0, Math.min(TOTAL_UNITS, count)),
    certificate: !!data.hasCertificate,
  };
}

function sorted(rows) {
  const key = state.sort;
  return rows.slice().sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (typeof x === 'string' || typeof y === 'string') {
      return String(x).localeCompare(String(y)) * state.dir;
    }
    return ((Number(x) || 0) - (Number(y) || 0)) * state.dir;
  });
}

function rowHtml(row) {
  const pct = Math.round((row.units / TOTAL_UNITS) * 100);
  return `<tr>
    <td class="admin-cell-user">
      <span class="admin-name">${esc(row.name || 'Unnamed learner')}</span>
      <span class="admin-email">${esc(row.email)}</span>
    </td>
    <td>${esc(fmtDate(row.joined))}</td>
    <td>${esc(fmtDate(row.lastSeenAt))}</td>
    <td class="admin-num">${esc(ACT.formatDuration(row.seconds))}</td>
    <td class="admin-cell-progress">
      <div class="admin-bar" role="img" aria-label="${pct} percent complete">
        <span style="width:${pct}%"></span>
      </div>
      <span class="admin-bar-label">${row.units}/${TOTAL_UNITS}</span>
    </td>
    <td>${
      row.certificate
        ? '<span class="admin-pill admin-pill--yes">Earned</span>'
        : '<span class="admin-pill admin-pill--no">No</span>'
    }</td>
    <td><button type="button" class="btn btn-ghost btn-small" data-class-remove="${esc(row.uid)}"
        >Remove</button></td>
  </tr>`;
}

function render() {
  const codeEl = qs('[data-class-code]');
  if (codeEl) codeEl.textContent = state.code || '——————';

  const body = qs('[data-class-rows]');
  if (body) {
    body.innerHTML = state.rows.length
      ? sorted(state.rows).map(rowHtml).join('')
      : `<tr><td colspan="7" class="admin-empty">No students yet. Share the join
         code above and they will appear here once they enter it.</td></tr>`;
  }

  const totalSeconds = state.rows.reduce((sum, r) => sum + r.seconds, 0);
  const stats = {
    students: String(state.rows.length),
    hours: String(ACT.toHours(totalSeconds)),
    certificates: String(state.rows.filter((r) => r.certificate).length),
    started: String(state.rows.filter((r) => r.units > 0).length),
  };
  Object.keys(stats).forEach((key) => {
    const el = qs(`[data-class-stat="${key}"]`);
    if (el) el.textContent = stats[key];
  });

  document.querySelectorAll('[data-class-sort]').forEach((btn) => {
    const active = btn.dataset.classSort === state.sort;
    btn.setAttribute('aria-sort', active ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    btn.classList.toggle('is-active', active);
  });
}

// Same columns the teacher sees, minus nothing and plus nothing. No uid.
function toCsv(rows) {
  const head = ['name', 'email', 'joined_class', 'last_active', 'hours', 'units_completed', 'certificate'];
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = rows.map((r) => [
    r.name, r.email,
    r.joined ? new Date(r.joined).toISOString() : '',
    r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : '',
    ACT.toHours(r.seconds), r.units, r.certificate ? 'yes' : 'no',
  ].map(cell).join(','));
  return [head.join(','), ...lines].join('\n');
}

async function loadRoster() {
  const snap = await getDocs(
    query(collection(db, 'users'), where('teacherUid', '==', state.uid))
  );
  state.rows = [];
  snap.forEach((d) => state.rows.push(toRow(d.id, d.data() || {})));
}

function wire() {
  document.querySelectorAll('[data-class-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.classSort;
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'email' ? 1 : -1; }
      render();
    });
  });

  const copy = qs('[data-class-copy]');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.code);
        toast('Join code copied');
      } catch (e) {
        toast('Copy failed — the code is ' + state.code);
      }
    });
  }

  const regen = qs('[data-class-regenerate]');
  if (regen) {
    regen.addEventListener('click', async () => {
      const confirmEl = qs('[data-class-regen-confirm]');
      if (confirmEl && confirmEl.hidden) {
        // Two steps on purpose: the old code stops working the moment this
        // runs, and a class mid-lesson should not lose it to a stray click.
        confirmEl.hidden = false;
        return;
      }
      try {
        state.code = await regenerateJoinCode(state.uid, state.code);
        if (confirmEl) confirmEl.hidden = true;
        render();
        toast('New join code issued. The old one no longer works.');
      } catch (e) {
        toast('Could not issue a new code. Please try again.');
      }
    });
  }

  const cancel = qs('[data-class-regen-cancel]');
  if (cancel) {
    cancel.addEventListener('click', () => {
      const confirmEl = qs('[data-class-regen-confirm]');
      if (confirmEl) confirmEl.hidden = true;
    });
  }

  const csv = qs('[data-class-csv]');
  if (csv) {
    csv.addEventListener('click', () => {
      const blob = new Blob([toCsv(sorted(state.rows))], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pypath-class-' + ACT.dayKey(Date.now()) + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const body = qs('[data-class-rows]');
  if (body) {
    body.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-class-remove]');
      if (!btn) return;
      const uid = btn.dataset.classRemove;
      const row = state.rows.find((r) => r.uid === uid);
      if (!row) return;
      if (btn.dataset.confirming !== 'yes') {
        btn.dataset.confirming = 'yes';
        btn.textContent = 'Confirm removal';
        return;
      }
      btn.disabled = true;
      try {
        await removeStudent(uid);
        state.rows = state.rows.filter((r) => r.uid !== uid);
        render();
        toast((row.name || 'That learner') + ' was removed from your class.');
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Remove';
        delete btn.dataset.confirming;
        toast('Could not remove that student. Please try again.');
      }
    });
  }
}

let started = false;

async function start(user) {
  if (started) return;
  started = true;
  try {
    state.uid = user.uid;
    const profile = await readProfile(user.uid);
    if (ROLES.normalizeRole(profile.role) !== 'teacher') {
      show('not-teacher');
      started = false;
      return;
    }
    state.code = await ensureJoinCode(user.uid, profile);
    await loadRoster();
    wire();
    render();
    show('ready');
  } catch (e) {
    const msg = qs('[data-class-error-message]');
    if (msg) msg.textContent = String((e && e.message) || e);
    show('error');
    started = false;
  }
}

function apply(user) {
  if (!user) {
    show('guest');
    started = false;
    return;
  }
  start(user);
}

document.addEventListener('pypath:auth', (e) => apply(e.detail.user));
if (currentUser()) apply(currentUser());
