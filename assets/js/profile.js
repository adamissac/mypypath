/* PyPath — the signed-in account's own record, read once and answered from.
 *
 * Same shape as membership.js and class-state.js, which hold "which class" and
 * "which teacher" in one place for the same reason: three modules asking the
 * same question on the same page load should not make three reads, and must
 * not be able to get three different answers.
 *
 * That second half is why this file exists rather than a bare getDoc.
 * classroom-page.js, classroom-dashboard.js, account-class.js and
 * classroom-store.js's classesFor all read users/{uid} to decide whether the
 * person in front of them is a teacher, and every one of them ran its own read
 * off the same pypath:auth event.
 *
 * WHAT WENT WRONG, because it is not obvious from the SDK's surface:
 *
 * The Firestore client is configured with persistentLocalCache(). On a fresh
 * load that cache can be cold -- a first visit, a cleared browser, or the
 * "Failed to obtain exclusive access to the persistence layer" fallback to an
 * in-memory cache when another tab holds the lock. In the same tick as those
 * role reads, sync.js's fullSync() issues
 *
 *     setDoc(users/{uid}, identity(user), { merge: true })
 *
 * which lands in the local cache immediately, long before the server answers.
 * A merge write against a document the cache has never seen synthesizes a
 * local document containing only the merged fields -- email, displayName,
 * providers -- and no `role`. getDoc() resolves happily from that view,
 * because it only refuses a cache-only answer when the document does not
 * exist at all. So readProfile() returned a real-looking record whose role was
 * undefined, normalizeRole() read that as 'student', and a genuine teacher was
 * shown "This page is for teacher accounts" on /classroom.html and "Student
 * account" on /account.html. A reload fixed it because by then the server copy
 * was in the cache. That is the whole reproducible signature: broken cold,
 * correct on reload.
 *
 * So the rule here is: a role decision is never answered from a document view
 * the server has not confirmed. A snapshot carrying unacknowledged local
 * writes is not an answer, it is our own write reflected back at us.
 *
 * THE SECOND ATTEMPT, and why the first one was not enough. 47533a6 tried to
 * establish "the server has confirmed this" from a snapshot listener's
 * metadata: resolve on the first snapshot with fromCache false and
 * hasPendingWrites false, wait four seconds, then fall back. Instrumenting a
 * four-tab contended load showed both halves of that were wrong.
 *
 * The metadata does not mean what it was being read to mean. A contended load
 * really does produce
 *
 *     fromCache=false  hasPendingWrites=true  role=undefined
 *
 * -- the backend has acknowledged our own merge write, so the client counts
 * itself in sync and has no unacknowledged writes pending, while the document
 * view is still nothing but the fields we just merged. hasPendingWrites going
 * false means "no local write is still in the air", not "this view came from
 * the server". Order those two events the other way round and the flags both
 * read clear over a document with no role on it, which is the original bug
 * wearing the fix's own approval.
 *
 * And the four second deadline turned slow into offline. Under four tabs
 * contending for the persistence lock the server snapshot regularly took
 * longer than that, and the timeout rejected a read that was still making
 * progress -- 0 of 32 cold tabs rendered the dashboard, every one of them
 * reporting "Could not reach your account record" on a working connection.
 *
 * getDocFromServer() looks like the answer to that and is not. It returns the
 * local view with outstanding mutations applied, so during exactly this race it
 * hands back our own merge write over an empty cache -- measured, with
 * hasPendingWrites true and no role on the document, which is the original bug
 * arriving through the primitive named after the fix for it. There is no read
 * that dodges an outstanding local write. The only way out is to wait for the
 * write to stop being outstanding, which is what hasPendingWrites going false
 * means, so the listener stays and the condition it resolves on stays.
 *
 * What changes is the deadline. Four seconds was not a fallback, it was a
 * failure: under contention the confirmed snapshot arrives later than that, and
 * rejecting a read still making progress reported an unreachable database on a
 * working connection. Twenty seconds is the ceiling now, and a page that really
 * is offline no longer waits it out -- navigator.onLine settles that case as
 * soon as a cache-only snapshot arrives.
 *
 * Failing is still allowed, and still means what it meant. Offline falls back
 * to the cache, and only to a cached view the server confirmed at some point;
 * with nothing to fall back on this rejects, and callers render "we could not
 * reach the database", which is honest, where "you are not a teacher" is not.
 */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, onSnapshot } = await import(`${BASE}/firebase-firestore.js`);

/* How long to wait for an answer before giving up on the network.
 *
 * Twenty seconds, and the number is the whole point of this round. 47533a6
 * used four, and under four tabs contending for the persistence lock the
 * confirmed snapshot regularly arrived later than that -- so the deadline
 * rejected a read that was still making progress and every one of those tabs
 * reported "Could not reach your account record" on a working connection.
 *
 * A page that is genuinely offline does not wait this out: the navigator.onLine
 * check below takes the cached answer as soon as a cache-only snapshot arrives.
 * This is the ceiling for "online, but something is badly wrong", where being
 * slow and right beats being fast and wrong -- the page says "Loading your
 * class" throughout, which is true. */
const SERVER_WAIT_MS = 20000;

/* Cached for the page rather than for the session.

   membership.js puts its answer in sessionStorage because a classId is one
   opaque string. This document is the account record -- email, display name,
   photo URL -- and keeping a copy of it in web storage to save one read per
   navigation is a poor trade. Within a page load this is the fix that
   matters: four callers, one read, one answer. */
let cachedUid = null;
let cached = null;
let inFlight = null;
let inFlightUid = null;

export function currentProfile() {
  return cached;
}

/* Called by everything that writes users/{uid} in a way that changes the
   answer -- the role, the class index, the join code. Without this the page
   would keep serving the record from before the write for the rest of its
   life, and account-class.js's refresh() after "become a teacher" would paint
   the student view over a teacher account. */
export function invalidateProfile(uid) {
  if (!uid || uid === cachedUid) {
    cachedUid = null;
    cached = null;
  }
  if (!uid || uid === inFlightUid) {
    inFlight = null;
    inFlightUid = null;
  }
}

/* One read that waits for a document view nobody local is still writing to.
 *
 * A snapshot listener with includeMetadataChanges, because the two facts that
 * matter are only on the metadata. getDocFromServer() was tried here and is
 * wrong for this: it returns the local view with outstanding mutations applied,
 * so during exactly the race this file exists for it hands back our own merge
 * write over an empty cache -- measured, with hasPendingWrites true and no role
 * on the document. There is no read primitive that dodges this. The only way
 * out is to wait for the write to stop being outstanding.
 *
 * hasPendingWrites false is what proves that. It means no local write is still
 * in the air, so the view is the document as the backend has it rather than as
 * we have just patched it. fromCache false is the second half: the client is in
 * sync with the backend for this document. Both, together, and nothing else is
 * trusted.
 */
function readAuthoritative(uid) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsub = null;
    let timer = null;

    // The best cache-only view seen so far, kept for the offline fallback.
    // Only a snapshot with no pending writes qualifies: one with pending
    // writes is the half-built document described at the top of this file.
    let clean = null;

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (unsub) unsub();
      fn(value);
    }

    function giveUp() {
      if (clean) {
        finish(resolve, clean);
        return;
      }
      const err = new Error('Could not reach your account record.');
      err.code = 'unavailable';
      finish(reject, err);
    }

    unsub = onSnapshot(
      doc(db, `users/${uid}`),
      { includeMetadataChanges: true },
      (snap) => {
        const meta = snap.metadata;
        if (!meta.fromCache && !meta.hasPendingWrites) {
          // A document that genuinely does not exist yet is a real answer too,
          // and is {} -- a brand new account with no record written is not a
          // teacher, and saying so is correct.
          finish(resolve, snap.exists() ? snap.data() : {});
          return;
        }
        if (snap.exists() && !meta.hasPendingWrites) clean = snap.data();
        // Offline is answered now rather than at the deadline. Waiting twenty
        // seconds to tell a learner on a train something we already know is a
        // worse page than answering from the copy we have. navigator.onLine is
        // only ever trusted in this direction: it is famously willing to claim
        // a connection that does not work, but a browser saying it has no
        // network at all is not something to sit out.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) giveUp();
      },
      (err) => finish(reject, err)
    );

    timer = setTimeout(giveUp, SERVER_WAIT_MS);
  });
}

/* The account record for this uid.
 *
 * `force` skips the cache, for a caller that has just written to the document
 * and needs to see the result rather than what it read a moment before.
 *
 * Concurrent callers share one read. This is the part that makes the three
 * modules on /classroom.html agree with each other by construction: they are
 * not three reads that happen to return the same thing, they are one read.
 */
export async function loadProfile(uid, force) {
  if (!uid) return {};

  if (force !== true && cachedUid === uid && cached) return cached;
  if (force !== true && inFlightUid === uid && inFlight) return inFlight;

  inFlightUid = uid;
  inFlight = readAuthoritative(uid)
    .then((data) => {
      cachedUid = uid;
      cached = data;
      if (inFlightUid === uid) {
        inFlight = null;
        inFlightUid = null;
      }
      return data;
    })
    .catch((err) => {
      // Deliberately not cached. An offline read is not an answer, and
      // remembering it would leave the page wrong for as long as it is open.
      if (inFlightUid === uid) {
        inFlight = null;
        inFlightUid = null;
      }
      throw err;
    });

  return inFlight;
}
