/* PyPath — admin dashboard: the whole roster, one row per learner.

   Reads `users` in a single query. Every field it shows is mirrored onto the
   user document by sync.js and activity.js precisely so this page does not
   need one round trip per learner.

   The uid check below only picks which panel to render. A non-admin who edits
   it in devtools still gets nothing: firestore.rules refuses the query. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { currentUser } from '/assets/js/auth.js';
import { normalizeScores, passedUnits } from '/assets/js/unit-test-summary.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { collection, getDocs } = await import(`${BASE}/firebase-firestore.js`);

const ADMIN = window.PyPathAdmin;
const ACT = window.PyPathActivity;
const TOTAL_UNITS = 10;

const state = { rows: [], sort: 'lastSeenAt', dir: -1, query: '' };

function qs(sel) { return document.querySelector(sel); }

function show(name) {
  ['loading', 'denied', 'error', 'ready'].forEach((s) => {
    const el = qs(`[data-admin-state="${s}"]`);
    if (el) el.hidden = s !== name;
  });
}

function fmtDate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const d = new Date(n);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function toRow(id, data) {
  const units = Array.isArray(data.completedUnits) ? data.completedUnits : [];
  const count = Number.isFinite(Number(data.unitsCompleted))
    ? Number(data.unitsCompleted)
    : units.length;
  const testScores = normalizeScores(data.testScores);
  return {
    uid: id,
    email: data.email || '',
    name: data.displayName || '',
    emailVerified: !!data.emailVerified,
    createdAt: Number(data.createdAt) || 0,
    lastSeenAt: Number(data.lastSeenAt) || Number(data.lastLoginAt) || 0,
    seconds: Number(data.totalSeconds) || 0,
    units: Math.max(0, Math.min(TOTAL_UNITS, count)),
    testScores: testScores,
    testsAttempted: Object.keys(testScores).length,
    // Recomputed from the scores rather than read off testsPassed, so the
    // count on screen can never disagree with the marks it came from.
    testsPassed: passedUnits(testScores).length,
    certificate: !!data.hasCertificate,
  };
}

function matches(row, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return row.email.toLowerCase().includes(q)
    || row.name.toLowerCase().includes(q)
    || row.uid.toLowerCase().includes(q);
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

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Staff scan this table for who is stuck, so the pill carries the count and the
// individual marks ride along in the tooltip. The teacher's roster is where a
// per unit breakdown belongs; this page is one row per learner in the world.
function testsCell(row) {
  if (!row.testsAttempted) return '<span class="admin-pill admin-pill--no">None yet</span>';
  const all = row.testsPassed === row.testsAttempted;
  const detail = Object.keys(row.testScores)
    .map(Number)
    .sort((a, b) => a - b)
    .map((unit) => 'Unit ' + unit + ': ' + row.testScores[String(unit)])
    .join(', ');
  return `<span class="admin-pill ${all ? 'admin-pill--yes' : 'admin-pill--wait'}"
    title="${esc(detail)}">${row.testsPassed}/${row.testsAttempted} passed</span>`;
}

function rowHtml(row) {
  const pct = Math.round((row.units / TOTAL_UNITS) * 100);
  return `<tr>
    <td class="admin-cell-user">
      <span class="admin-name">${esc(row.name || '—')}</span>
      <span class="admin-email">${esc(row.email || row.uid)}${
        row.email && !row.emailVerified
          ? ' <span class="admin-tag" title="Email not verified">unverified</span>'
          : ''
      }</span>
    </td>
    <td>${esc(fmtDate(row.createdAt))}</td>
    <td>${esc(fmtDate(row.lastSeenAt))}</td>
    <td class="admin-num" title="${row.seconds} seconds">${esc(ACT.formatDuration(row.seconds))}</td>
    <td class="admin-cell-progress">
      <div class="admin-bar" role="img" aria-label="${pct} percent complete">
        <span style="width:${pct}%"></span>
      </div>
      <span class="admin-bar-label">${row.units}/${TOTAL_UNITS}</span>
    </td>
    <td class="admin-cell-tests">${testsCell(row)}</td>
    <td>${
      row.certificate
        ? '<span class="admin-pill admin-pill--yes">Earned</span>'
        : '<span class="admin-pill admin-pill--no">No</span>'
    }</td>
  </tr>`;
}

function render() {
  const visible = sorted(state.rows.filter((r) => matches(r, state.query)));

  const body = qs('[data-admin-rows]');
  if (body) {
    body.innerHTML = visible.length
      ? visible.map(rowHtml).join('')
      : '<tr><td colspan="7" class="admin-empty">No learners match that search.</td></tr>';
  }

  const totalSeconds = state.rows.reduce((sum, r) => sum + r.seconds, 0);
  const stats = {
    'learners': String(state.rows.length),
    'hours': String(ACT.toHours(totalSeconds)),
    'certificates': String(state.rows.filter((r) => r.certificate).length),
    'active': String(state.rows.filter((r) => r.seconds > 0).length),
  };
  Object.keys(stats).forEach((key) => {
    const el = qs(`[data-admin-stat="${key}"]`);
    if (el) el.textContent = stats[key];
  });

  document.querySelectorAll('[data-admin-sort]').forEach((btn) => {
    const active = btn.dataset.adminSort === state.sort;
    btn.setAttribute('aria-sort', active ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    btn.classList.toggle('is-active', active);
  });
}

// One row per learner, same columns as the table, so the roster can go into a
// spreadsheet without retyping it.
function toCsv(rows) {
  const unitHeads = Array.from({ length: TOTAL_UNITS }, (_, i) => 'test_unit_' + (i + 1));
  const head = [
    'uid', 'email', 'name', 'created', 'last_seen', 'seconds', 'hours',
    'units_completed', 'tests_passed', 'tests_attempted', ...unitHeads, 'certificate',
  ];
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = rows.map((r) => [
    r.uid, r.email, r.name,
    r.createdAt ? new Date(r.createdAt).toISOString() : '',
    r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : '',
    r.seconds, ACT.toHours(r.seconds), r.units,
    r.testsPassed, r.testsAttempted,
    // Empty, not zero, for a unit the learner has never sat.
    ...Array.from({ length: TOTAL_UNITS }, (_, i) => {
      const score = r.testScores[String(i + 1)];
      return Number.isFinite(score) ? score : '';
    }),
    r.certificate ? 'yes' : 'no',
  ].map(cell).join(','));
  return [head.join(','), ...lines].join('\n');
}

async function load() {
  show('loading');
  try {
    const snap = await getDocs(collection(db, 'users'));
    state.rows = [];
    snap.forEach((d) => state.rows.push(toRow(d.id, d.data() || {})));
    render();
    show('ready');
  } catch (e) {
    const msg = qs('[data-admin-error-message]');
    if (msg) msg.textContent = String((e && e.message) || e);
    show('error');
  }
}

function wire() {
  document.querySelectorAll('[data-admin-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.adminSort;
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'email' || key === 'name' ? 1 : -1; }
      render();
    });
  });

  const search = qs('[data-admin-search]');
  if (search) {
    search.addEventListener('input', () => {
      state.query = search.value.trim();
      render();
    });
  }

  const refresh = qs('[data-admin-refresh]');
  if (refresh) refresh.addEventListener('click', load);

  const csv = qs('[data-admin-csv]');
  if (csv) {
    csv.addEventListener('click', () => {
      const blob = new Blob([toCsv(sorted(state.rows))], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pypath-learners-' + ACT.dayKey(Date.now()) + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}

let started = false;

function apply(user) {
  if (!ADMIN.isAdmin(user)) {
    show('denied');
    started = false;
    return;
  }
  if (started) return;
  started = true;
  wire();
  load();
}

document.addEventListener('pypath:auth', (e) => apply(e.detail.user));

// This module can finish loading after auth.js has already announced the user,
// in which case the event above never arrives. Ask once directly.
if (currentUser()) apply(currentUser());
