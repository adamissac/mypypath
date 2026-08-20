/* PyPath — installs a Firestore remote adapter into ProgressStore whenever a
   user is signed in, and merges local state into remote on sign-in. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { currentTeacher, loadFor } from '/assets/js/class-state.js';
import { summarizeUnitTests, UNIT_TESTS_KEY } from '/assets/js/unit-test-summary.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where } =
  await import(`${BASE}/firebase-firestore.js`);

const KEYS = window.PyPathKeys;
const MERGE = window.PyPathMerge;
const STORE = window.ProgressStore;
// lesson-runner.js saves the editor contents on every CodeMirror change, so
// this debounce is what stands between a learner typing and one Firestore
// write per keystroke. At 1.5s with an 8s ceiling, continuous typing still
// forced a write every eight seconds; five and thirty cost a quarter of that.
//
// The local copy is written synchronously either way. This only decides how
// far behind the cloud copy may fall, which matters solely if the device dies
// mid-lesson.
const DEBOUNCE_MS = 5000;
// Ceiling so a burst of typing in one editor cannot postpone another editor's
// pending write forever.
const MAX_WAIT_MS = 30000;
const TOTAL_UNITS = 10;

// How far back the incremental code query reaches past its own floor, to cover
// a writing device whose clock runs behind ours.
const CLOCK_SKEW_MS = 5 * 60000;

// Device-level, not session-level like the reconciliation stamp: what has
// already been pulled onto this machine stays pulled after the tab closes, and
// re-reading it in a new tab would be the very cost this avoids.
const CODE_SEEN_PREFIX = 'pypath-code-seen:';
const CODE_SCAN_PREFIX = 'pypath-code-scanned:';

function readStamp(prefix, uid) {
  try { return Number(localStorage.getItem(prefix + uid)) || 0; }
  catch (e) { return 0; }
}

function writeStamp(prefix, uid, value) {
  try { localStorage.setItem(prefix + uid, String(value)); }
  catch (e) {}
}

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
}

// A flat mirror of progress on the user document itself. The source of truth
// stays in state/progress; this copy exists so the admin roster is one query
// over `users` instead of a per-learner round trip.
// `tests` is passed in rather than read here so summary() stays a function of
// its arguments: every caller below already knows which test results it means,
// and the one that does not yet have them says so by calling readTests().
function summary(units, now, tests) {
  const list = Array.isArray(units) ? units : [];
  const results = tests || { testScores: {}, testsPassed: [] };
  // certificate.js owns this rule, but it is only loaded on certificate.html,
  // and sync.js runs everywhere. Prefer the real implementation when it is
  // present and fall back to the same 1..TOTAL_UNITS check otherwise.
  const CERT = window.PyPathCertificate;
  const complete = CERT
    ? CERT.isCourseComplete(list)
    : list.length >= TOTAL_UNITS &&
      Array.from({ length: TOTAL_UNITS }, (_, i) => i + 1)
        .every((u) => list.map(Number).includes(u));
  return {
    completedUnits: list,
    unitsCompleted: list.length,
    hasCertificate: complete,
    testScores: results.testScores,
    testsPassed: results.testsPassed,
    progressUpdatedAt: now,
  };
}

// The end-of-unit test results as they stand on this device right now.
function readTests() {
  try {
    return summarizeUnitTests(STORE.getItem(UNIT_TESTS_KEY));
  } catch (e) {
    return { testScores: {}, testsPassed: [] };
  }
}

// A learner in a class has the same progress mirrored into the roster, which
// is the only thing their teacher can read. Nothing is written for a learner
// who is not in a class -- no class, no document, no extra write.
async function mirrorToRoster(uid, fields) {
  if (!currentTeacher()) return;
  try {
    await setDoc(doc(db, `roster/${uid}`), fields, { merge: true });
  } catch (e) { /* the learner's own copy already saved; retried on next write */ }
}

// Everything the roster needs to identify a learner. Written on every sign-in,
// so accounts created before this shipped fill themselves in the next time
// their owner logs in — there is no backfill path from the client, because
// listing Auth users needs the Admin SDK.
function identity(user) {
  const created = Date.parse(user.metadata?.creationTime || '');
  const provider = (user.providerData || [])
    .map((p) => p && p.providerId)
    .filter(Boolean);
  return {
    email: user.email || '',
    emailVerified: !!user.emailVerified,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    providers: provider,
    createdAt: Number.isFinite(created) ? created : null,
    lastLoginAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeAdapter(uid) {
  const pending = new Map();
  let timer = null;
  let firstQueuedAt = 0;
  let flushing = false;
  let flushAgain = false;

  function schedule() {
    if (!firstQueuedAt) firstQueuedAt = Date.now();
    const waited = Date.now() - firstQueuedAt;
    const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited));
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  async function flush() {
    timer = null;
    if (flushing) { flushAgain = true; return; }
    flushing = true;
    firstQueuedAt = 0;

    const batch = Array.from(pending.entries());
    pending.clear();
    // Captured before any await so timestamps cannot invert against write order.
    const now = Date.now();

    try {
      for (const [key, entry] of batch) {
        try {
          if (entry.deleted) {
            await deleteDoc(doc(db, `users/${uid}/code/${KEYS.toDocId(key)}`));
          } else if (key === KEYS.COMPLETED_UNITS_KEY) {
            const units = JSON.parse(entry.value || '[]');
            await setDoc(
              doc(db, `users/${uid}/state/progress`),
              { completedUnits: units, updatedAt: now },
              { merge: true }
            );
            const fields = summary(units, now, readTests());
            await setDoc(doc(db, `users/${uid}`), fields, { merge: true });
            await mirrorToRoster(uid, fields);
          } else {
            await setDoc(doc(db, `users/${uid}/code/${KEYS.toDocId(key)}`), {
              localKey: key,
              content: entry.value,
              updatedAt: now,
            });
            // A test result only reaches the teacher through the summary, and
            // a unit can be sat many times before it is finished. Refresh the
            // summary from the value being written, so a teacher does not wait
            // for the next completed unit to see a mark.
            if (key === UNIT_TESTS_KEY) {
              const fields = summary(
                STORE.getCompletedUnits(), now, summarizeUnitTests(entry.value)
              );
              await setDoc(doc(db, `users/${uid}`), fields, { merge: true });
              await mirrorToRoster(uid, fields);
            }
          }
        } catch (e) {
          // Local write already succeeded. Retry happens on the next write,
          // or on the online/visibilitychange re-push below.
          toast('Progress saved on this device; sync will retry');
        }
      }
    } finally {
      flushing = false;
      if (flushAgain) { flushAgain = false; schedule(); }
    }
  }

  function queue(key, entry) {
    pending.set(key, entry);
    schedule();
  }

  return {
    push(key, value) { queue(key, { value: value, deleted: false }); },
    remove(key) { queue(key, { value: null, deleted: true }); },
    // pypath-completed-units is written once per unit, ever — there is no next
    // keystroke to re-queue a failed push, so re-push everything on reconnect.
    repushAll() {
      const snap = STORE.snapshot();
      Object.keys(snap).forEach(function (key) {
        queue(key, { value: snap[key].content, deleted: false });
      });
    },
  };
}

async function reconcileWithRemote(uid) {
  const localSnapshot = STORE.snapshot();

  // 1. Completed units — set union, never destructive.
  let remoteUnits = [];
  try {
    const snap = await getDoc(doc(db, `users/${uid}/state/progress`));
    if (snap.exists()) remoteUnits = snap.data().completedUnits || [];
  } catch (e) { /* offline: keep local, sync later */ }

  const localUnits = STORE.getCompletedUnits();
  const mergedUnits = MERGE.mergeCompletedUnits(localUnits, remoteUnits);
  STORE.setCompletedUnits(mergedUnits);

  // 2. Code documents — newest updatedAt wins, per key.
  //
  // This collection holds one document per saved editor and reflection, so it
  // is the largest read on the site: a learner near the end of the course has
  // a few hundred of them, and reading all of them back to find the handful
  // that changed is most of what this function costs. Ask for the changed ones
  // instead, and fall back to the whole collection on a schedule.
  const now = Date.now();
  const lastSeen = readStamp(CODE_SEEN_PREFIX, uid);
  const lastFull = readStamp(CODE_SCAN_PREFIX, uid);
  // An incremental query only returns documents that were written, so one that
  // was deleted on another device would linger in this browser's copy forever.
  // A periodic full scan is what collects them. A device that has never synced
  // has no floor to ask from, so its first read is full too.
  const full = !lastSeen || MERGE.needsFullSync(lastFull, now, MERGE.FULL_SCAN_AFTER_MS);

  const remoteByKey = new Map();
  let read = false;
  try {
    const codeRef = collection(db, `users/${uid}/code`);
    // updatedAt is stamped with the writing device's own clock, so a device
    // running slow could write a document that is already older than our floor
    // by the time we ask. The margin is what stops that work being skipped.
    const since = Math.max(0, lastSeen - CLOCK_SKEW_MS);
    const codeSnap = await getDocs(
      full ? codeRef : query(codeRef, where('updatedAt', '>', since))
    );
    codeSnap.forEach((d) => {
      const data = d.data();
      if (data.localKey) remoteByKey.set(data.localKey, data);
    });
    read = true;
  } catch (e) { /* offline */ }

  // Only a read that landed moves the floor. Otherwise an offline attempt would
  // mark work as seen that was never looked at.
  if (read) {
    writeStamp(CODE_SEEN_PREFIX, uid, now);
    if (full) writeStamp(CODE_SCAN_PREFIX, uid, now);
  }

  const allKeys = new Set([
    ...Object.keys(localSnapshot),
    ...remoteByKey.keys(),
  ]);
  allKeys.delete(KEYS.COMPLETED_UNITS_KEY);

  for (const key of allKeys) {
    const localEntry = localSnapshot[key] || null;
    const remoteEntry = remoteByKey.get(key) || null;
    const winner = MERGE.pickNewer(localEntry, remoteEntry);
    if (winner && winner !== localEntry) {
      // applyRemote, NOT setItem: setItem would push this value straight back
      // to Firestore, overwriting the server's real updatedAt with "now" and
      // doubling write billing on every sign-in.
      STORE.applyRemote(key, winner.content, winner.updatedAt);
    }
  }
}

let adapter = null;
let signedIn = null;
let syncing = false;

// When this device last got all the way through a reconciliation, per account.
// Session-scoped on purpose: a new tab is cheap to reconcile once, and a
// device-wide stamp would let a tab opened days later trust a merge nobody
// alive remembers.
const STAMP_PREFIX = 'pypath-synced:';

function lastSyncedAt(uid) {
  try { return Number(sessionStorage.getItem(STAMP_PREFIX + uid)); }
  catch (e) { return 0; }
}

function markSynced(uid) {
  try { sessionStorage.setItem(STAMP_PREFIX + uid, String(Date.now())); }
  catch (e) {}
}

function dueForSync(uid) {
  return MERGE.needsFullSync(lastSyncedAt(uid), Date.now(), MERGE.RESYNC_AFTER_MS);
}

// Everything that has to talk to the server to be right. pypath:auth fires on
// every page load, so this is what the stamp above keeps from running on every
// page load with it.
async function fullSync(user) {
  if (syncing) return;
  syncing = true;
  try {
    await setDoc(doc(db, `users/${user.uid}`), identity(user), { merge: true });
    // Who their teacher is, if anyone, before anything is mirrored. Forced past
    // the session cache: this is the run that is allowed to cost a read, and a
    // learner their teacher has since removed should find out here.
    await loadFor(user.uid, true);
    await reconcileWithRemote(user.uid);
    // reconcileWithRemote may have unioned in units this device did not know about.
    // reconcileWithRemote may also have pulled down test results from another device.
    const merged = summary(STORE.getCompletedUnits(), Date.now(), readTests());
    await setDoc(doc(db, `users/${user.uid}`), merged, { merge: true });
    // displayName is on the account record, which a teacher cannot read, so
    // the roster carries its own copy of the name to show.
    await mirrorToRoster(user.uid, Object.assign(
      { displayName: user.displayName || '' }, merged
    ));
    // Only a run that finished counts. A failed one leaves the stamp alone, so
    // the next page load retries rather than waiting out the whole window.
    markSynced(user.uid);
  } catch (err) {
    toast('Working offline; progress is saved on this device');
  } finally {
    syncing = false;
  }
}

function repush() {
  if (adapter) adapter.repushAll();
}

// A tab that has been in the background for an hour never had a page load to
// re-reconcile on, so waking it up is the other half of the trade: navigation
// stops paying for the merge, and a long-lived tab starts.
function wake() {
  repush();
  if (signedIn && dueForSync(signedIn.uid)) fullSync(signedIn);
}

window.addEventListener('online', wake);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') wake();
});

document.addEventListener('pypath:auth', async (e) => {
  const user = e.detail.user;

  if (!user) {
    // Signed out: stop syncing, keep the local cache so the guest session works.
    signedIn = null;
    adapter = null;
    STORE._setRemoteAdapter(null);
    return;
  }

  signedIn = user;
  adapter = makeAdapter(user.uid);
  STORE._setRemoteAdapter(adapter);

  if (dueForSync(user.uid)) {
    await fullSync(user);
    return;
  }

  // The reconciliation from earlier in this session still stands. All that is
  // actually gone is this page's module memory, and the teacher lookup restores
  // itself from the session cache without a read.
  await loadFor(user.uid);
});
