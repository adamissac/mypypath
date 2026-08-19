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

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
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
            await setDoc(
              doc(db, `users/${uid}/state/progress`),
              { completedUnits: JSON.parse(entry.value || '[]'), updatedAt: now },
              { merge: true }
            );
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
    await setDoc(
      doc(db, `users/${user.uid}`),
      {
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    await mergeOnSignIn(user.uid);
  } catch (err) {
    toast('Working offline; progress is saved on this device');
  }
});
