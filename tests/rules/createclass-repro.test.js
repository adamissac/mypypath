import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, collection, serverTimestamp, arrayUnion } from 'firebase/firestore';
import fs from 'node:fs';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'create-class-repro',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/* Replays createClass() from classroom-store.js exactly, step by step, so the
   step that is actually denied names itself. */
describe('createClass, step by step', () => {
  const uid = 'teacherX';
  const db = () => env.authenticatedContext(uid).firestore();

  it('step 1: claim a join code', async () => {
    await assertSucceeds(setDoc(doc(db(), 'joinCodes/ABC234'), {
      teacherUid: uid, classId: 'c1', active: true, createdAt: Date.now(),
    }));
  });

  it('step 2: write the class document', async () => {
    await assertSucceeds(setDoc(doc(db(), 'classes/c1'), {
      name: 'My class', joinCode: 'ABC234', teacherUids: [uid],
      createdAt: serverTimestamp(), archived: false, schemaVersion: 1,
    }));
  });

  it('step 3: index the class on the user document', async () => {
    await assertSucceeds(setDoc(doc(db(), `users/${uid}`), {
      role: 'teacher', classIds: arrayUnion('c1'), updatedAt: Date.now(),
    }, { merge: true }));
  });

  it('all three in sequence, as the client does them', async () => {
    const d = db();
    await assertSucceeds(setDoc(doc(d, 'joinCodes/XYZ789'), {
      teacherUid: uid, classId: 'c2', active: true, createdAt: Date.now(),
    }));
    await assertSucceeds(setDoc(doc(d, 'classes/c2'), {
      name: 'My class', joinCode: 'XYZ789', teacherUids: [uid],
      createdAt: serverTimestamp(), archived: false, schemaVersion: 1,
    }));
    await assertSucceeds(setDoc(doc(d, `users/${uid}`), {
      role: 'teacher', classIds: arrayUnion('c2'), updatedAt: Date.now(),
    }, { merge: true }));
  });
});
