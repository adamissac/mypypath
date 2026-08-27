/* PyPath — carries buffered classroom events to Firestore.
 *
 * events.js owns the vocabulary and the buffer and does no I/O. This file
 * decides when a batch goes out and where to. Same split as
 * activity-core/activity and progress-store/sync.
 *
 * The whole module is inert unless the signed-in learner is enrolled in a
 * class. A guest has no account to attribute an event to, and a signed-in
 * learner in no class has no teacher to show one to; in both cases nothing is
 * buffered, nothing is written, and no listener does any work.
 */
import { currentUser } from '/assets/js/auth.js';
import {
  writeEvents, makeClassAdapter, mirrorAll, touchLastActive, purgeExpired,
} from '/assets/js/classroom-store.js';
import { loadMembership, setClassId } from '/assets/js/membership.js';
// Rides along here rather than as its own script tag on 124 pages, the way
// join-menu.js rides on role-nav.js. This module already resolves the class id
// and is already inert for anyone not in a class, which is exactly the set of
// people who have a lock policy to read.
import { loadPolicy } from '/assets/js/class-policy.js';

const EVENTS = window.PyPathEvents;
const STORE = window.ProgressStore;

if (!EVENTS) console.warn('[pypath] events.js missing; classroom events are off');

let classId = null;
let uid = null;
let timer = null;
let flushing = false;

/* One flush at a time. Two overlapping flushes would each drain part of the
   buffer and race to commit, which is harmless for the data but pays for two
   round trips to do one batch's work. */
async function flush() {
  if (!EVENTS || !classId || !uid || flushing) return;
  if (!EVENTS.pending()) return;
  flushing = true;
  const batch = EVENTS.drain();
  try {
    await writeEvents(classId, uid, batch);
  } catch (e) {
    // Deliberately not re-queued. These are telemetry: losing a batch costs a
    // teacher a slightly thinner picture, while retrying forever is how a
    // flaky connection turns into a loop that outlives the lesson. It must
    // also never surface to the learner, who did nothing wrong.
  } finally {
    flushing = false;
  }
}

/* A flush that has to survive the page going away. sendBeacon is not an option
   here -- Firestore writes are authenticated SDK calls, not a plain POST -- so
   this is best-effort and the visibilitychange handler below is what actually
   catches most departures. Browsers freeze pagehide work aggressively;
   visibilitychange fires earlier and reliably. */
function flushSoon() {
  flush();
}

function start() {
  if (timer) return;
  timer = setInterval(flush, EVENTS.FLUSH_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', flushSoon);
  window.addEventListener('pagehide', flushSoon);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('beforeunload', flushSoon);
  window.removeEventListener('pagehide', flushSoon);
}

function onVisibility() {
  if (document.visibilityState === 'hidden') flush();
}

/* Attaches the learner to their class: events start being recorded, the
   progress mirror starts being written, and the roster heartbeat is stamped so
   "no events in 7 days" can be told apart from "never here". */
async function attach(user) {
  uid = user.uid;
  classId = await loadMembership(user.uid, true);

  if (!classId) {
    detach();
    // Announced as null on purpose: a learner who has just left a class must
    // stop being told their old class's lock mode, and null is the sequential
    // chain everyone else already reads.
    loadPolicy(null).catch(() => {});
    return;
  }

  // Not awaited. Nothing below depends on it, and a lesson must never wait on
  // the lock policy to start recording what a learner is doing.
  loadPolicy(classId, true).catch(() => {});

  EVENTS.setEnabled(true);
  if (STORE) STORE._setClassAdapter(makeClassAdapter(classId, uid));
  start();

  // The mirror catches up here rather than by echoing every pulled document
  // as it arrives during the sign-in merge.
  mirrorAll(classId, uid).catch(() => {});
  touchLastActive(classId, uid);

  // The retention policy, enforced on the only machine that is allowed to.
  // Deliberately not awaited: expiring old records must never delay a lesson.
  const RETENTION = window.PyPathClassroom && window.PyPathClassroom.RETENTION;
  purgeExpired(classId, uid, RETENTION ? RETENTION.EVENT_DAYS : 180).catch(() => {});
}

function detach() {
  stop();
  if (EVENTS) EVENTS.setEnabled(false);
  if (STORE) STORE._setClassAdapter(null);
  classId = null;
  uid = null;
}

document.addEventListener('pypath:auth', (e) => {
  const user = e.detail && e.detail.user;
  if (!user) {
    detach();
    return;
  }
  attach(user).catch(() => detach());
});

// Signing in is not the only way to become enrolled: joining a class mid
// session has to attach the sink without a page reload.
document.addEventListener('pypath:class-joined', () => {
  const user = currentUser();
  if (user) attach(user).catch(() => detach());
});

document.addEventListener('pypath:class-left', () => {
  if (uid) setClassId(uid, null);
  detach();
});

export { flush };
