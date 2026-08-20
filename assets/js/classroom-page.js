/* PyPath — a teacher's own classroom: their join code and their roster.

   Deliberately shows no uids. A teacher needs to know who their students are
   and how they are doing; the internal account identifier is not part of that,
   and once it is on screen it ends up in screenshots and spreadsheets. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { currentUser } from '/assets/js/auth.js';
import {
  readProfile, ensureJoinCode, regenerateJoinCode, removeStudent,
} from '/assets/js/class-join.js';
import {
  normalizeScores, passedUnits, scoreRows, PASS_MARK,
} from '/assets/js/unit-test-summary.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { collection, query, where, getDocs, doc, updateDoc } =
  await import(`${BASE}/firebase-firestore.js`);

const ROLES = window.PyPathRoles;
const ACT = window.PyPathActivity;
const TOTAL_UNITS = 10;

// openTests holds the uid whose per unit scores are expanded, at most one at a
// time: ten units times a whole class is a wall of numbers nobody reads.
const state = { uid: null, code: '', rows: [], sort: 'name', dir: 1, openTests: null };

// Decisions in flight, so a double click cannot fire two writes at one row and
// leave the loser's revert undoing the winner's decision.
const deciding = new Set();

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
  // testsPassed is recomputed from the scores rather than read off the
  // document: the two are written together, but only one of them says what the
  // detail view shows, and a stale array would disagree with it on screen.
  const testScores = normalizeScores(data.testScores);
  const passed = passedUnits(testScores);
  return {
    uid: id, // kept for the remove and decision calls only; never rendered or exported
    name: data.displayName || '',
    joined: Number(data.joinedClassAt) || 0,
    lastSeenAt: Number(data.lastSeenAt) || 0,
    seconds: Number(data.totalSeconds) || 0,
    units: Math.max(0, Math.min(TOTAL_UNITS, count)),
    testScores: testScores,
    testsAttempted: Object.keys(testScores).length,
    testsPassed: passed.length,
    certificate: !!data.hasCertificate,
    requestedAt: Number(data.certificateRequestedAt) || 0,
    // Tri-state on purpose: null means "not looked at yet", and that is the
    // only value that puts a student in the teacher's queue. Collapsing it to
    // false would make every unfinished student look declined.
    approved: typeof data.certificateApproved === 'boolean' ? data.certificateApproved : null,
    decidedAt: Number(data.certificateDecidedAt) || 0,
  };
}

/* A decision always outranks the request that prompted it, so a student who
   touches a unit again after a decline cannot quietly reopen a settled case.
   The request stands in for "finished all ten units": it is only written once
   they are, and trusting it means a roster row whose unit count has not caught
   up yet cannot drop someone out of the queue. */
function certState(row) {
  if (row.approved === true) return 'approved';
  if (row.approved === false) return 'declined';
  if (row.requestedAt > 0) return 'pending';
  if (row.certificate) return 'earned';
  return 'none';
}

function isPending(row) { return certState(row) === 'pending'; }

const CERT_RANK = { none: 0, earned: 1, approved: 2, declined: 3, pending: 4 };

const CERT_VIEW = {
  none: { pill: 'admin-pill--no', label: 'Not finished' },
  earned: { pill: 'admin-pill--yes', label: 'Earned' },
  approved: { pill: 'admin-pill--yes', label: 'Approved' },
  declined: { pill: 'admin-pill--declined', label: 'Declined' },
  pending: { pill: 'admin-pill--wait', label: 'Awaiting you' },
};

const CERT_CSV = {
  none: 'not finished',
  earned: 'earned',
  approved: 'approved',
  declined: 'declined',
  pending: 'awaiting approval',
};

// The certificate column sorts on the state rather than the stored field, so
// the default descending click puts everything waiting on the teacher on top.
function sortValue(row, key) {
  if (key === 'certificate') return CERT_RANK[certState(row)];
  // Sorting on tests means "who has passed the most", not "who has sat the
  // most": a student with nine attempts and one pass is the one to look at.
  if (key === 'tests') return row.testsPassed;
  return row[key];
}

function sorted(rows) {
  const key = state.sort;
  return rows.slice().sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (typeof x === 'string' || typeof y === 'string') {
      return String(x).localeCompare(String(y)) * state.dir;
    }
    return ((Number(x) || 0) - (Number(y) || 0)) * state.dir;
  });
}

function certCell(row) {
  const st = certState(row);
  const view = CERT_VIEW[st];
  const who = esc(row.name || 'this learner');
  const buttons = [];
  if (st === 'pending' || st === 'declined') {
    buttons.push(`<button type="button" class="btn ${st === 'pending' ? 'btn-primary' : 'btn-ghost'} btn-small"
        data-class-approve="${esc(row.uid)}"
        aria-label="Approve the certificate for ${who}">Approve</button>`);
  }
  if (st === 'pending' || st === 'approved') {
    buttons.push(`<button type="button" class="btn btn-ghost btn-small"
        data-class-decline="${esc(row.uid)}"
        aria-label="Decline the certificate for ${who}">Decline</button>`);
  }
  return `<td class="admin-cell-cert">
      <span class="admin-cert">
        <span class="admin-pill ${view.pill}">${view.label}</span>
        ${buttons.join('')}
      </span>
    </td>`;
}

/* Tests get one column and a drawer, the same shape the certificate cell uses:
   a pill for the state, a button in the cell that acts on that one student,
   and everything re-rendered from state afterwards. Ten score columns would
   not survive a phone, and the count is what a teacher scans for anyway. */
function testsCell(row) {
  if (!row.testsAttempted) {
    return `<td class="admin-cell-tests">
      <span class="admin-pill admin-pill--no">None yet</span>
    </td>`;
  }
  const all = row.testsPassed === row.testsAttempted;
  const open = state.openTests === row.uid;
  const who = esc(row.name || 'this learner');
  return `<td class="admin-cell-tests">
    <span class="admin-cert">
      <span class="admin-pill ${all ? 'admin-pill--yes' : 'admin-pill--wait'}"
        >${row.testsPassed}/${row.testsAttempted} passed</span>
      <button type="button" class="btn btn-ghost btn-small"
        data-class-tests="${esc(row.uid)}" aria-expanded="${open ? 'true' : 'false'}"
        aria-label="${open ? 'Hide' : 'Show'} unit test scores for ${who}"
        >${open ? 'Hide scores' : 'Scores'}</button>
    </span>
  </td>`;
}

function testsDetailHtml(row) {
  const scores = scoreRows(row.testScores).map((s) => `<li class="admin-score">
      <span class="admin-score__unit">Unit ${s.unit}</span>
      <span class="admin-pill ${s.passed ? 'admin-pill--yes' : 'admin-pill--declined'}"
        >${s.score}</span>
    </li>`).join('');
  return `<tr class="admin-row--detail">
    <td colspan="9">
      <p class="admin-detail-title">Unit test scores for ${esc(row.name || 'this learner')}</p>
      <ul class="admin-scores">${scores}</ul>
      <p class="admin-detail-hint">Each test is marked out of 100 and ${PASS_MARK}
        is a pass. Units that are not listed have not been attempted yet.</p>
    </td>
  </tr>`;
}

function rowHtml(row) {
  const pct = Math.round((row.units / TOTAL_UNITS) * 100);
  const main = `<tr class="${isPending(row) ? 'admin-row--pending' : ''}">
    <td class="admin-cell-user">
      <span class="admin-name">${esc(row.name || 'Unnamed learner')}</span>
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
    ${testsCell(row)}
    <td>${esc(fmtDate(row.requestedAt))}</td>
    ${certCell(row)}
    <td><button type="button" class="btn btn-ghost btn-small" data-class-remove="${esc(row.uid)}"
        >Remove</button></td>
  </tr>`;
  return state.openTests === row.uid && row.testsAttempted
    ? main + testsDetailHtml(row)
    : main;
}

function render() {
  const codeEl = qs('[data-class-code]');
  if (codeEl) codeEl.textContent = state.code || '——————';

  const body = qs('[data-class-rows]');
  if (body) {
    body.innerHTML = state.rows.length
      ? sorted(state.rows).map(rowHtml).join('')
      : `<tr><td colspan="9" class="admin-empty">No students yet. Share the join
         code above and they will appear here once they enter it.</td></tr>`;
  }

  const totalSeconds = state.rows.reduce((sum, r) => sum + r.seconds, 0);
  const pending = state.rows.filter(isPending).length;
  const issued = state.rows.filter((r) => {
    const st = certState(r);
    return st === 'approved' || st === 'earned';
  });
  const stats = {
    students: String(state.rows.length),
    hours: String(ACT.toHours(totalSeconds)),
    certificates: String(issued.length),
    started: String(state.rows.filter((r) => r.units > 0).length),
    pending: String(pending),
  };
  Object.keys(stats).forEach((key) => {
    const el = qs(`[data-class-stat="${key}"]`);
    if (el) el.textContent = stats[key];
  });

  // The tile only stands out while there is something to do; a permanently
  // highlighted zero is the fastest way to teach a teacher to ignore it.
  const pendingTile = qs('[data-class-stat="pending"]');
  if (pendingTile && pendingTile.parentElement) {
    pendingTile.parentElement.classList.toggle('admin-stat--alert', pending > 0);
  }

  document.querySelectorAll('[data-class-sort]').forEach((btn) => {
    const active = btn.dataset.classSort === state.sort;
    btn.setAttribute('aria-sort', active ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    btn.classList.toggle('is-active', active);
  });
}

// Same columns the teacher sees, plus the two decision timestamps. No uid, and
// still nothing that could be used to contact a student.
function toCsv(rows) {
  const unitHeads = Array.from(
    { length: TOTAL_UNITS }, (_, i) => 'test_unit_' + (i + 1)
  );
  const head = [
    'name', 'joined_class', 'last_active', 'hours', 'units_completed',
    'tests_passed', 'tests_attempted', ...unitHeads,
    'certificate', 'certificate_status', 'certificate_requested', 'certificate_decided',
  ];
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = rows.map((r) => {
    const st = certState(r);
    return [
      r.name,
      r.joined ? new Date(r.joined).toISOString() : '',
      r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : '',
      ACT.toHours(r.seconds), r.units,
      r.testsPassed, r.testsAttempted,
      // An empty cell, not a zero: a unit nobody has sat did not score nothing.
      ...Array.from({ length: TOTAL_UNITS }, (_, i) => {
        const score = r.testScores[String(i + 1)];
        return Number.isFinite(score) ? score : '';
      }),
      st === 'approved' || st === 'earned' ? 'yes' : 'no',
      CERT_CSV[st],
      r.requestedAt ? new Date(r.requestedAt).toISOString() : '',
      r.decidedAt ? new Date(r.decidedAt).toISOString() : '',
    ].map(cell).join(',');
  });
  return [head.join(','), ...lines].join('\n');
}

async function decide(uid, approved) {
  const row = state.rows.find((r) => r.uid === uid);
  if (!row || deciding.has(uid)) return;
  const before = { approved: row.approved, decidedAt: row.decidedAt };
  const now = Date.now();
  deciding.add(uid);
  row.approved = approved;
  row.decidedAt = now;
  render();
  try {
    // Exactly the three keys the rules let a teacher change. Anything else in
    // this object — even a field read straight back off the row unchanged —
    // makes the whole write fail.
    await updateDoc(doc(db, `roster/${uid}`), {
      certificateApproved: approved,
      certificateDecidedAt: now,
      updatedAt: now,
    });
    toast(approved
      ? (row.name || 'That learner') + ' can now download their certificate.'
      : 'Held back. ' + (row.name || 'That learner')
        + ' can be approved from the same row once the work improves.');
  } catch (e) {
    row.approved = before.approved;
    row.decidedAt = before.decidedAt;
    render();
    toast('Could not save that decision. Please try again.');
  } finally {
    deciding.delete(uid);
  }
}

async function loadRoster() {
  const snap = await getDocs(
    query(collection(db, 'roster'), where('teacherUid', '==', state.uid))
  );
  state.rows = [];
  snap.forEach((d) => state.rows.push(toRow(d.id, d.data() || {})));
}

function wire() {
  document.querySelectorAll('[data-class-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.classSort;
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
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
      /* Neither decision asks for confirmation. Both are reversible from the
         same cell in one click — a declined row keeps an Approve button, an
         approved one keeps Decline — so a confirm step would buy nothing here
         and would blunt the one guarding Remove, which is the click that
         cannot be taken back. */
      const approve = e.target.closest('[data-class-approve]');
      if (approve) { decide(approve.dataset.classApprove, true); return; }

      const decline = e.target.closest('[data-class-decline]');
      if (decline) { decide(decline.dataset.classDecline, false); return; }

      const scores = e.target.closest('[data-class-tests]');
      if (scores) {
        const uid = scores.dataset.classTests;
        state.openTests = state.openTests === uid ? null : uid;
        render();
        return;
      }

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
