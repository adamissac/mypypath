/* PyPath — who the signed-in learner's teacher is, held in one place.

   sync.js and activity.js both need to know whether to mirror anything into
   the roster, and neither should pay a document read to find out on every
   save. The answer is loaded once per sign-in and updated in place when the
   learner joins or leaves a class. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc } = await import(`${BASE}/firebase-firestore.js`);

const CACHE_PREFIX = 'pypath-teacher:';

let teacherUid = null;
// Which learner the value above belongs to, so a cache write cannot be filed
// under the wrong account after a sign-out and sign-in in the same tab.
let ownerUid = null;

// Empty string is a real answer -- "read, and this learner is in no class" --
// and has to survive the round trip as something other than null, which means
// "never read".
function readCache(uid) {
  try { return sessionStorage.getItem(CACHE_PREFIX + uid); }
  catch (e) { return null; }
}

function writeCache(uid, value) {
  try { sessionStorage.setItem(CACHE_PREFIX + uid, value || ''); }
  catch (e) {}
}

export function currentTeacher() {
  return teacherUid;
}

export function setTeacher(value) {
  teacherUid = value || null;
  if (ownerUid) writeCache(ownerUid, teacherUid);
}

// Module memory is gone on every page load, but the answer only changes when
// the learner joins or leaves a class, and both of those go through
// setTeacher(). Reading the session cache back is what keeps navigating from
// costing a roster read per page.
//
// `force` skips the cache. sync.js passes it on the runs that reconcile with
// the server anyway, which is also how a change made from the teacher's side --
// removing a student from their class -- reaches the learner: their next full
// sync, rather than never.
export async function loadFor(uid, force) {
  ownerUid = uid || null;

  if (force !== true) {
    const cached = readCache(uid);
    if (cached !== null) {
      teacherUid = cached || null;
      return teacherUid;
    }
  }

  try {
    const snap = await getDoc(doc(db, `roster/${uid}`));
    teacherUid = snap.exists() ? (snap.data().teacherUid || null) : null;
    writeCache(uid, teacherUid);
  } catch (e) {
    // Offline, or no roster document because this learner is not in a class.
    // Deliberately not cached: offline is not an answer, and remembering it
    // would leave a learner unmirrored for the rest of the session.
    teacherUid = null;
  }
  return teacherUid;
}

// The roster carries progress, never contact details: a teacher can see how
// their student is doing without being handed their email address. Everything
// written here is derived from what the learner has already done.
export function rosterSummary(extra) {
  return Object.assign({ updatedAt: Date.now() }, extra || {});
}
