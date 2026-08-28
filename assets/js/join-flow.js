/* PyPath — joining a class, across both schemas that are live.
 *
 * Two models exist at once. classes/{classId} is what the teacher dashboard is
 * built on: the roster it counts, the assignments it sets, and the lock mode it
 * enforces all hang off a class document. The flat roster/{uid} that predates
 * it is still what the certificate approval queue and the admin dashboard read,
 * with `query(collection(db,'roster'), where('teacherUid','==',uid))`.
 *
 * The join flow only ever wrote the second one. A student who joined therefore
 * landed in the legacy section of the teacher's page and never in the class
 * they were actually given the code for, and -- because class-policy.js finds
 * the class through users/{uid}.classId, which only classroom-store's join
 * writes -- every one of them silently fell back to sequential unlocking no
 * matter what mode the teacher had chosen.
 *
 * So both get written, here, in one place, rather than at each of the two call
 * sites that need it.
 *
 * Order matters and is not arbitrary. The legacy write goes first because it is
 * the idempotent one: `setDoc(..., {merge: true})` over the same document is
 * harmless twice. The class write cannot be repeated -- its update rule refuses
 * to let joinedAt move once written -- so it goes second, where a retry after a
 * half-finished join still finds it unwritten. Reversing these two makes the
 * retry path deny itself.
 */
import { currentUser } from '/assets/js/auth.js';
import {
  joinClass as legacyJoin,
  leaveClass as legacyLeave,
} from '/assets/js/class-join.js';
import {
  joinClass as classJoin,
  leaveClass as classLeave,
} from '/assets/js/classroom-store.js';
import {
  currentClassId, setClassId, loadMembership,
} from '/assets/js/membership.js';
import { loadPolicy } from '/assets/js/class-policy.js';

/* A code issued before classes existed. resolveJoinCode throws this when the
   joinCodes document carries no classId: the code is real and the legacy path
   still honours it, there is simply no class document to enroll into. */
function isPreClassCode(err) {
  return !!err && err.code === 'legacy';
}

/* Joins with whatever the code turns out to be.
 *
 * Returns the classId when the code belongs to a real class, and null when it
 * is an older code that only the flat roster understands. Either way the
 * legacy record is written, so the certificate queue keeps seeing the student.
 */
export async function joinAnyClass(uid, rawCode) {
  // Written first, and never skipped: classroom-page.js's approval queue reads
  // the flat roster directly, so a join that misses it drops the student out of
  // certificate approval entirely with nothing to show that it happened.
  await legacyJoin(uid, rawCode);

  const user = currentUser();
  let classId = null;
  try {
    const joined = await classJoin(uid, rawCode, (user && user.displayName) || '');
    classId = joined.classId;
  } catch (e) {
    // An old code is the one failure that is not a failure. Anything else --
    // a retired code, an archived class, your own class code -- is real and
    // belongs to the caller.
    if (!isPreClassCode(e)) throw e;
  }

  // The lock mode has to apply to the page the student is already looking at.
  // Both caches are keyed to answers that just changed, so both are forced.
  setClassId(uid, classId || '');
  await loadMembership(uid, true);
  // Only reachable now: the assignments read is gated on isEnrolled(), which
  // the roster document written above is what satisfies.
  await loadPolicy(classId, true);

  return classId;
}

/* Leaves both records. The class half needs an id, which is normally already
   in memory from this session and is read back when it is not. */
export async function leaveAnyClass(uid) {
  await legacyLeave(uid);

  let classId = currentClassId();
  if (!classId) classId = await loadMembership(uid, true);
  if (classId) await classLeave(uid, classId);

  setClassId(uid, '');
  // Null is a real policy, and the right one: no class means the sequential
  // chain, applied without waiting for a reload.
  await loadPolicy(null, true);
}
