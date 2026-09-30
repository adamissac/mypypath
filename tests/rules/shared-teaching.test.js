import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDocs, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import fs from 'node:fs';

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'mypypath-shared-teaching-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'classes/room'), {
      name: 'Room', teacherUids: ['teacher'], createdAt: new Date(), archived: false,
      joinCode: 'ABC234', timezone: 'America/New_York',
    });
    await setDoc(doc(ctx.firestore(), 'users/colleague'), { role: 'teacher', private: 'private' });
  });
});

async function invite() {
  const db = as('teacher');
  const batch = writeBatch(db);
  batch.update(doc(db, 'classes/room'), { teacherUids: arrayUnion('colleague') });
  batch.set(doc(db, 'users/colleague/teaching/room'), { classId: 'room' });
  return batch.commit();
}

describe('a discoverable co-teacher invitation preserves private account boundaries', () => {
  it('allows an atomic invitation and discovery by its recipient', async () => {
    await assertSucceeds(invite());
    await assertSucceeds(getDocs(collection(as('colleague'), 'users/colleague/teaching')));
    await assertSucceeds(updateDoc(doc(as('colleague'), 'classes/room'), { name: 'Shared room' }));
  });
  it('does not let the inviting teacher read or edit the recipient profile', async () => {
    await assertSucceeds(invite());
    await assertFails(getDoc(doc(as('teacher'), 'users/colleague')));
    await assertFails(updateDoc(doc(as('teacher'), 'users/colleague'), { role: 'teacher' }));
    await assertFails(getDocs(collection(as('teacher'), 'users/colleague/teaching')));
  });
  it.each(['student', 'stranger', 'colleague'])('refuses an invitation forged by %s', async uid => {
    await assertFails(setDoc(doc(as(uid), 'users/colleague/teaching/room'), { classId: 'room' }));
  });
  it('requires the invited account to be in the class teacher list', async () => {
    await assertFails(setDoc(doc(as('teacher'), 'users/colleague/teaching/room'), { classId: 'room' }));
  });
  it('refuses unrelated data or a mismatched class id', async () => {
    await invite();
    await assertFails(setDoc(doc(as('teacher'), 'users/colleague/teaching/room'), { classId: 'other' }));
    await assertFails(setDoc(doc(as('teacher'), 'users/colleague/teaching/room'), { classId: 'room', extra: true }));
  });
  it('removal revokes both the invitation and access', async () => {
    await invite();
    const db = as('teacher');
    const batch = writeBatch(db);
    batch.update(doc(db, 'classes/room'), { teacherUids: arrayRemove('colleague') });
    batch.delete(doc(db, 'users/colleague/teaching/room'));
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(as('colleague'), 'classes/room'), { name: 'Stolen' }));
    await assertFails(deleteDoc(doc(as('stranger'), 'users/colleague/teaching/room')));
  });
});
