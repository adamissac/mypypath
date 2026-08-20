/* PyPath — classroom membership: issuing join codes and attaching students.

   A code is a document id in `joinCodes`, so resolving one is a single get
   with no query. The rules deny `list` on that collection, so codes cannot be
   harvested by walking it. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { setTeacher } from '/assets/js/class-state.js';
import { currentUser } from '/assets/js/auth.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc, setDoc, deleteDoc, updateDoc, deleteField } =
  await import(`${BASE}/firebase-firestore.js`);

const ROLES = window.PyPathRoles;

// Codes are short, so two teachers can collide. create() fails when the
// document already exists, which makes the collision loud instead of silent.
const MAX_ATTEMPTS = 6;

export class JoinError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function readProfile(uid) {
  const snap = await getDoc(doc(db, `users/${uid}`));
  return snap.exists() ? snap.data() : {};
}

// Class membership and the progress a teacher may see. Separate from the
// account record on purpose: a teacher can read this collection, so an email
// address must never land in it.
export async function readRoster(uid) {
  const snap = await getDoc(doc(db, `roster/${uid}`));
  return snap.exists() ? snap.data() : {};
}

// Returns the teacher's uid, or throws so the caller can tell "no such class"
// apart from "we could not reach the database".
export async function resolveCode(rawCode) {
  const code = ROLES.normalizeCode(rawCode);
  if (!ROLES.isValidCode(code)) {
    throw new JoinError('invalid-format', 'That join code does not look right.');
  }
  const snap = await getDoc(doc(db, `joinCodes/${code}`));
  if (!snap.exists()) {
    throw new JoinError('not-found', 'No class has that join code. Check it with your teacher.');
  }
  const teacherUid = snap.data().teacherUid;
  if (!teacherUid) {
    throw new JoinError('not-found', 'That join code is no longer in use.');
  }
  return { code, teacherUid };
}

export async function joinClass(uid, rawCode) {
  const resolved = await resolveCode(rawCode);
  if (resolved.teacherUid === uid) {
    throw new JoinError('self', 'That is your own class code.');
  }
  // teacherUid and joinCode go in one write: the rules check that the code
  // presented actually maps to the teacher claimed, and a split write would
  // leave a moment where the claim has no proof behind it.
  // Seeded with the name and progress the learner already has, so a teacher
  // sees a real row the moment someone joins rather than a blank one that
  // fills itself in whenever they next finish a unit.
  const user = currentUser();
  const units = window.ProgressStore ? window.ProgressStore.getCompletedUnits() : [];
  await setDoc(
    doc(db, `roster/${uid}`),
    {
      teacherUid: resolved.teacherUid,
      joinCode: resolved.code,
      joinedClassAt: Date.now(),
      displayName: (user && user.displayName) || '',
      completedUnits: units,
      unitsCompleted: units.length,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  // The role itself is part of the account record, not the roster.
  await setDoc(doc(db, `users/${uid}`), { role: 'student', updatedAt: Date.now() },
    { merge: true });
  setTeacher(resolved.teacherUid);
  return resolved;
}

export async function leaveClass(uid) {
  setTeacher(null);
  await updateDoc(doc(db, `roster/${uid}`), {
    teacherUid: deleteField(),
    joinCode: deleteField(),
    updatedAt: Date.now(),
  });
}

// Used by a teacher to drop someone from their roster. The rules allow this
// one cross-account write and nothing else, and only when the fields cleared
// are exactly these.
export async function removeStudent(studentUid) {
  await updateDoc(doc(db, `roster/${studentUid}`), {
    teacherUid: deleteField(),
    joinCode: deleteField(),
    updatedAt: Date.now(),
  });
}

async function claimCode(uid) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = ROLES.generateCode(ROLES.cryptoRandom);
    try {
      // setDoc on a path that exists would overwrite; the rules forbid update
      // on joinCodes precisely so a collision fails here rather than stealing
      // another teacher's code.
      await setDoc(
        doc(db, `joinCodes/${code}`),
        { teacherUid: uid, createdAt: Date.now() }
      );
      return code;
    } catch (e) {
      // Permission-denied here means the document already exists. Try again.
      if (i === MAX_ATTEMPTS - 1) throw e;
    }
  }
  throw new JoinError('exhausted', 'Could not issue a join code. Please try again.');
}

// Idempotent: a teacher who already has a code keeps it.
export async function ensureJoinCode(uid, profile) {
  const existing = profile && profile.joinCode;
  if (existing && ROLES.isValidCode(existing)) return existing;

  const code = await claimCode(uid);
  await setDoc(
    doc(db, `users/${uid}`),
    { role: 'teacher', joinCode: code, updatedAt: Date.now() },
    { merge: true }
  );
  return code;
}

export async function regenerateJoinCode(uid, oldCode) {
  const code = await claimCode(uid);
  await setDoc(
    doc(db, `users/${uid}`),
    { role: 'teacher', joinCode: code, updatedAt: Date.now() },
    { merge: true }
  );
  // Retire the old code last. If this fails the class simply answers to two
  // codes for a while, which is far better than a window where it answers to
  // none and every student is locked out mid-lesson.
  if (oldCode && oldCode !== code) {
    try {
      await deleteDoc(doc(db, `joinCodes/${oldCode}`));
    } catch (e) { /* the new code is already live; leave the old one to rot */ }
  }
  return code;
}

export async function setRole(uid, role) {
  await setDoc(
    doc(db, `users/${uid}`),
    { role: ROLES.normalizeRole(role), updatedAt: Date.now() },
    { merge: true }
  );
}
