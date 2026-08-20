/* PyPath — installs a Firestore remote adapter into ProgressStore whenever a
   user is signed in, and merges local state into remote on sign-in. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc, setDoc, collection, getDocs, deleteDoc } =
  await import(`${BASE}/firebase-firestore.js`);

const KEYS = window.PyPathKeys;
const MERGE = window.PyPathMerge;
const STORE = window.ProgressStore;
const DEBOUNCE_MS = 1500;
// Ceiling so a burst of typing in one editor cannot postpone another editor's
// pending write forever. lesson-runner.js saves on every keystroke.
const MAX_WAIT_MS = 8000;
const TOTAL_UNITS = 10;

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
}

// A flat mirror of progress on the user document itself. The source of truth
// stays in state/progress; this copy exists so the admin roster is one query
// over `users` instead of a per-learner round trip.
function summary(units, now) {
  const list = Array.isArray(units) ? units : [];
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
    progressUpdatedAt: now,
  };
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
            await setDoc(doc(db, `users/${uid}`), summary(units, now), { merge: true });
          } else {
            await setDoc(doc(db, `users/${uid}/code/${KEYS.toDocId(key)}`), {
              localKey: key,
              content: entry.value,
              updatedAt: now,
            });
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

async function mergeOnSignIn(uid) {
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
  const remoteByKey = new Map();
  try {
    const codeSnap = await getDocs(collection(db, `users/${uid}/code`));
    codeSnap.forEach((d) => {
      const data = d.data();
      if (data.localKey) remoteByKey.set(data.localKey, data);
    });
  } catch (e) { /* offline */ }

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

function repush() {
  if (adapter) adapter.repushAll();
}

window.addEventListener('online', repush);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') repush();
});

document.addEventListener('pypath:auth', async (e) => {
  const user = e.detail.user;

  if (!user) {
    // Signed out: stop syncing, keep the local cache so the guest session works.
    adapter = null;
    STORE._setRemoteAdapter(null);
    return;
  }

  adapter = makeAdapter(user.uid);
  STORE._setRemoteAdapter(adapter);

  try {
    await setDoc(doc(db, `users/${user.uid}`), identity(user), { merge: true });
    await mergeOnSignIn(user.uid);
    // mergeOnSignIn may have unioned in units this device did not know about.
    await setDoc(
      doc(db, `users/${user.uid}`),
      summary(STORE.getCompletedUnits(), Date.now()),
      { merge: true }
    );
  } catch (err) {
    toast('Working offline; progress is saved on this device');
  }
});
