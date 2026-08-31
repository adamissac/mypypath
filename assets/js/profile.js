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
 * Failing is still allowed, and still means what it meant. When nothing
 * server-confirmed arrives and there is no clean cached copy to fall back on,
 * this rejects -- callers already render "we could not reach the database",
 * which is honest, where "you are not a teacher" is not.
 */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, onSnapshot } = await import(`${BASE}/firebase-firestore.js`);

/* How long to wait for the server before falling back to a clean cached copy.
   Only ever paid by a genuinely offline page: online, the confirmed snapshot
   arrives in a round trip. Long enough that a slow connection is not called
   offline, short enough that a teacher on a plane still sees their own
   cached record rather than a spinner. */
const SERVER_WAIT_MS = 4000;

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

/* One read that waits for the server to confirm the document.
 *
 * A one-shot listener rather than getDoc, because getDoc gives no way to ask
 * "is this the server's answer or my own pending write?" -- onSnapshot with
 * includeMetadataChanges does, and that distinction is the entire bug.
 */
function readAuthoritative(uid) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsub = null;
    let timer = null;

    // The best cache-only view seen so far, kept for the offline fallback.
    // Only a snapshot with no pending writes qualifies: one with pending
    // writes is the half-built document described at the top of this file, and
    // falling back to it would reintroduce the bug on a slow connection.
    let clean = null;

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      // Unsubscribing inside the callback is fine and is what getDoc does.
      if (unsub) unsub();
      fn(value);
    }

    unsub = onSnapshot(
      doc(db, `users/${uid}`),
      { includeMetadataChanges: true },
      (snap) => {
        const meta = snap.metadata;
        if (!meta.fromCache && !meta.hasPendingWrites) {
          // The server has spoken. A document that genuinely does not exist
          // yet is a real answer too, and is {} -- a brand new account with no
          // record written is not a teacher, and saying so is correct.
          finish(resolve, snap.exists() ? snap.data() : {});
          return;
        }
        if (snap.exists() && !meta.hasPendingWrites) clean = snap.data();
      },
      (err) => finish(reject, err)
    );

    timer = setTimeout(() => {
      if (clean) {
        finish(resolve, clean);
        return;
      }
      const err = new Error('Could not reach your account record.');
      err.code = 'unavailable';
      finish(reject, err);
    }, SERVER_WAIT_MS);
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
