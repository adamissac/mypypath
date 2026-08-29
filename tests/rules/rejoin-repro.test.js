import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

/* What happens when someone submits a join code they have already used.
 *
 * Two populations can do it. Anyone enrolled before join-flow.js shipped is
 * legacy-only: they have roster/{uid} and no classes/{id}/roster/{uid}, so
 * re-submitting the code is how they repair themselves. Anyone enrolled since
 * has both, and re-submitting must not punish them for it. */

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'rejoin-repro',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });

const TEACHER = 'teacherA';
const STUDENT = 'studentA';
const CODE = 'ABC234';
const CLASS = 'class1';

beforeEach(async () => {
  await env.clearFirestore();
  // The teacher's side, written with the rules off so the test is about the
  // student's write and nothing else.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `joinCodes/${CODE}`), {
      teacherUid: TEACHER, classId: CLASS, active: true, createdAt: Date.now(),
    });
    await setDoc(doc(db, `classes/${CLASS}`), {
      name: 'Period 1', joinCode: CODE, teacherUids: [TEACHER],
      createdAt: new Date(), archived: false, schemaVersion: 1,
    });
  });
});

const asStudent = () => env.authenticatedContext(STUDENT).firestore();

/* Exactly the document classroom-store.js's joinClass writes. */
function rosterWrite(db) {
  return setDoc(doc(db, `classes/${CLASS}/roster/${STUDENT}`), {
    displayName: 'Sam',
    joinedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
    joinCode: CODE,
    schemaVersion: 1,
  });
}

describe('submitting a join code twice', () => {
  it('the first join is allowed', async () => {
    await assertSucceeds(rosterWrite(asStudent()));
  });

  it('the second is REFUSED, because joinedAt would move', async () => {
    // The update rule pins joinCode and joinedAt as the record of consent, and
    // serverTimestamp() is a new value every time. So the identical write that
    // was a create a moment ago is a denied update now.
    const db = asStudent();
    await assertSucceeds(rosterWrite(db));
    await assertFails(rosterWrite(db));
  });

  it('a legacy-only student can still repair themselves with the code', async () => {
    // No class roster document yet: this is a create, and creates are fine.
    // This is the self-service path out of legacy-only enrollment.
    const db = asStudent();
    const before = await getDoc(doc(db, `classes/${CLASS}/roster/${STUDENT}`));
    expect(before.exists()).toBe(false);
    await assertSucceeds(rosterWrite(db));
  });

  it('skipping the write when already enrolled is what keeps a rejoin quiet', async () => {
    // The fix join-flow.js relies on: read first, write only if absent. The
    // read is permitted to the owner, so the check itself costs nothing.
    const db = asStudent();
    await assertSucceeds(rosterWrite(db));
    const snap = await getDoc(doc(db, `classes/${CLASS}/roster/${STUDENT}`));
    expect(snap.exists()).toBe(true);
    // ...and the account pointer, which is the half a legacy student is
    // missing, stays writable either way.
    await assertSucceeds(setDoc(doc(db, `users/${STUDENT}`),
      { role: 'student', classId: CLASS, updatedAt: Date.now() }, { merge: true }));
  });
});
