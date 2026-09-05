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
import { loadProfile } from '/assets/js/profile.js';

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

  /* Through profile.js rather than a getDoc of its own.
   *
   * This file used to read users/{uid} directly, which looked harmless -- it
   * wants one field, classId, and has nothing to do with roles. It was the
   * sixth independent reader of that document, and it inherited the same
   * hazard as the other five: sync.js merges identity onto users/{uid} on the
   * same pypath:auth event this runs on, and against a cold cache that merge
   * synthesizes a local document holding only the merged fields. getDoc()
   * resolves happily from that view. There is no classId on it.
   *
   * The failure that produces is quieter than the role one and worse to
   * diagnose: not an error, just a learner who is in a class being told they
   * are in none, with their work syncing nowhere their teacher can see it,
   * until they reload. Exactly the shape of the role bug -- broken cold,
   * correct on reload -- which is why it survived this long unnoticed.
   *
   * loadProfile() refuses to answer from a view carrying unacknowledged local
   * writes, and shares one read with every other caller on the page, so this
   * is now the same read classroom-page.js and role-nav.js were already
   * making rather than a seventh round trip. */
  try {
    const profile = await loadProfile(uid);
    classId = profile.classId || null;
    writeCache(uid, classId);
  } catch (e) {
    // Offline, or no account document yet. Deliberately not cached: offline is
    // not an answer, and remembering it would leave a learner unattached for
    // the rest of the session.
    classId = null;
  }
  return classId;
}
