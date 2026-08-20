/* PyPath — flushes accrued active time to Firestore.

   Timing rules live in activity-core.js; this file only decides when to write
   and how. Time is written with increment(), never as an absolute total, so
   two devices open at once add up instead of overwriting each other.

   Only signed-in time is counted. A guest has no uid to attribute it to, and
   inventing one would mean guessing who was at the keyboard. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { currentUser } from '/assets/js/auth.js';
import { currentTeacher } from '/assets/js/class-state.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, setDoc, increment } = await import(`${BASE}/firebase-firestore.js`);

const CORE = window.PyPathActivity;
if (!CORE) {
  console.warn('[pypath] activity-core.js missing; time tracking is off');
}

const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'];

let uid = null;
let lastInputAt = Date.now();
let lastTickAt = Date.now();
let carryMs = 0;          // sub-second remainder, kept out of Firestore
let pendingSeconds = 0;   // accrued but not yet written
let tickTimer = null;
let flushTimer = null;
let flushing = false;

// A failed write must not lose the time. Park it under the uid it belongs to so
// signing in as someone else on a shared machine cannot inherit it.
function pendingKey(id) {
  return CORE.PENDING_KEY + ':' + id;
}

function loadPending(id) {
  try {
    const raw = localStorage.getItem(pendingKey(id));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch (e) {
    return 0;
  }
}

function savePending(id, seconds) {
  try {
    if (seconds > 0) localStorage.setItem(pendingKey(id), String(seconds));
    else localStorage.removeItem(pendingKey(id));
  } catch (e) {}
}

function markInput() {
  lastInputAt = Date.now();
}

function tick() {
  if (!uid) return;
  const now = Date.now();
  const ms = CORE.activeMs({
    now,
    lastTickAt,
    lastInputAt,
    visible: document.visibilityState === 'visible',
  });
  lastTickAt = now;
  if (ms <= 0) return;

  const split = CORE.splitSeconds(ms + carryMs);
  carryMs = split.remainderMs;
  if (split.seconds > 0) {
    pendingSeconds += split.seconds;
    savePending(uid, pendingSeconds);
  }
}

async function flush() {
  if (!uid || flushing) return;
  const id = uid;
  const amount = pendingSeconds;
  if (amount <= 0) return;

  flushing = true;
  // Optimistic: clear before the await so time accrued during the write is not
  // counted twice. Restored below if the write fails.
  pendingSeconds = 0;

  const now = Date.now();
  const day = CORE.dayKey(now);

  try {
    await setDoc(
      doc(db, `users/${id}/state/activity`),
      {
        totalSeconds: increment(amount),
        lastSeenAt: now,
        days: { [day]: increment(amount) },
      },
      { merge: true }
    );
    // Mirrored onto the user document so the dashboard reads the whole roster
    // with one query instead of one round trip per learner.
    await setDoc(
      doc(db, `users/${id}`),
      { totalSeconds: increment(amount), lastSeenAt: now },
      { merge: true }
    );
    // A learner in a class mirrors the same totals into the roster, the only
    // place their teacher can read them. No class means no third write.
    if (currentTeacher()) {
      await setDoc(
        doc(db, `roster/${id}`),
        { totalSeconds: increment(amount), lastSeenAt: now },
        { merge: true }
      );
    }
    savePending(id, 0);
  } catch (e) {
    pendingSeconds += amount;
    savePending(id, pendingSeconds);
  } finally {
    flushing = false;
  }
}

function start(nextUid) {
  stop();
  uid = nextUid;
  pendingSeconds = loadPending(uid);
  lastTickAt = Date.now();
  lastInputAt = Date.now();
  carryMs = 0;
  tickTimer = setInterval(tick, CORE.TICK_MS);
  flushTimer = setInterval(flush, CORE.FLUSH_MS);
}

function stop() {
  if (tickTimer) clearInterval(tickTimer);
  if (flushTimer) clearInterval(flushTimer);
  tickTimer = null;
  flushTimer = null;
  uid = null;
}

if (CORE) {
  INPUT_EVENTS.forEach((name) => {
    document.addEventListener(name, markInput, { passive: true, capture: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Time spent on another tab is not study time, and the gap since the last
      // tick would otherwise be banked on return.
      lastTickAt = Date.now();
      lastInputAt = Date.now();
    } else {
      tick();
      flush();
    }
  });

  // pagehide, not unload: unload is unreliable on mobile Safari and blocks the
  // back/forward cache everywhere else.
  window.addEventListener('pagehide', () => {
    tick();
    flush();
  });

  document.addEventListener('pypath:auth', (e) => apply(e.detail.user));

  // auth.js may have announced the user before this module finished loading,
  // in which case the event above never arrives and nothing would be counted.
  if (currentUser()) apply(currentUser());
}

function apply(user) {
  if (!user) {
    tick();
    flush().finally(stop);
    return;
  }
  if (user.uid !== uid) start(user.uid);
}
