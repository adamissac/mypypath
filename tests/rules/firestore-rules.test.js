import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => { await env.cleanup(); });

describe('users subtree', () => {
  it('lets a user write their own progress', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [1] })
    );
  });

  it('lets a user read their own progress', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/state/progress')));
  });

  it("denies reading another user's progress", async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/state/progress')));
  });

  it("denies writing another user's progress", async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(
      setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [99] })
    );
  });

  it("denies reading another user's saved code", async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/code/lesson__a')));
  });

  it('denies all access to unauthenticated clients', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/alice/state/progress')));
    await assertFails(setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [1] }));
  });

  it('denies access to collections outside the users tree', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'anything/else'), { x: 1 }));
  });
});

describe('code document limits', () => {
  it('accepts a normal-sized code document', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/code/lesson__a'), {
        localKey: 'pypath-lesson-/a.html-editor-1',
        content: 'print("hi")',
        updatedAt: Date.now(),
      })
    );
  });

  it('rejects a code document over the 100 KB cap', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, 'users/alice/code/lesson__big'), {
        localKey: 'pypath-lesson-/big.html-editor-1',
        content: 'x'.repeat(100 * 1024 + 1),
        updatedAt: Date.now(),
      })
    );
  });
});
