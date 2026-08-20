/* PyPath — who the signed-in learner's teacher is, held in one place.

   sync.js and activity.js both need to know whether to mirror anything into
   the roster, and neither should pay a document read to find out on every
   save. The answer is loaded once per sign-in and updated in place when the
   learner joins or leaves a class. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc } = await import(`${BASE}/firebase-firestore.js`);

let teacherUid = null;

export function currentTeacher() {
  return teacherUid;
}

export function setTeacher(value) {
  teacherUid = value || null;
}

export async function loadFor(uid) {
  try {
    const snap = await getDoc(doc(db, `roster/${uid}`));
    teacherUid = snap.exists() ? (snap.data().teacherUid || null) : null;
  } catch (e) {
    // Offline, or no roster document because this learner is not in a class.
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
