/* PyPath — which class the signed-in learner belongs to, held in one place.
 *
 * The same shape as class-state.js, which answers the same question for the
 * older flat roster. Both exist because both models are live: class-state.js
 * serves the legacy roster the admin dashboard and the certificate handshake
 * still read, and this file serves the classes/{classId} model the teacher
 * dashboard is built on.
 *
 * The answer is read once per sign-in and cached for the session, because
 * every page load would otherwise pay a document read to find out that
 * nothing has changed.
 */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc } = await import(`${BASE}/firebase-firestore.js`);

const CACHE_PREFIX = 'pypath-class:';

let classId = null;
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

export function currentClassId() {
  return classId;
}

export function setClassId(uid, value) {
  classId = value || null;
  ownerUid = uid || ownerUid;
  if (ownerUid) writeCache(ownerUid, classId);
}

/* The learner's own account document carries the id of the class they joined.
   Storing it there rather than searching for it matters: /classes denies list,
   so there is no query that would find it, and that is the same property that
   stops anyone walking the collection to find other people's classrooms. */
export async function loadMembership(uid, force) {
  ownerUid = uid || null;

  if (force !== true) {
    const cached = readCache(uid);
    if (cached !== null) {
      classId = cached || null;
      return classId;
    }
  }

  try {
    const snap = await getDoc(doc(db, `users/${uid}`));
    classId = (snap.exists() && snap.data().classId) || null;
    writeCache(uid, classId);
  } catch (e) {
    // Offline, or no account document yet. Deliberately not cached: offline is
    // not an answer, and remembering it would leave a learner unattached for
    // the rest of the session.
    classId = null;
  }
  return classId;
}
