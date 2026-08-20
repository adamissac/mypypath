import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';
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

// Kept in step with isAdmin() in firestore.rules.
const ADMIN_UID = 'qwf4tTlGi3W1Vse6Za0RT8sVDz02';

describe('admin dashboard access', () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/alice'), { email: 'alice@example.com', totalSeconds: 120 });
      await setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [1, 2] });
      await setDoc(doc(db, 'users/alice/state/activity'), { totalSeconds: 120 });
      await setDoc(doc(db, 'users/alice/code/lesson__a'), { localKey: 'k', content: 'x' });
    });
  });

  it("lets an admin read another learner's user document", async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
  });

  it('lets an admin list the whole roster', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDocs(collection(db, 'users')));
  });

  it("lets an admin read another learner's progress and activity", async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/state/progress')));
    await assertSucceeds(getDoc(doc(db, 'users/alice/state/activity')));
  });

  // The dashboard reports progress, not the Python a learner wrote.
  it("denies an admin another learner's saved code", async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/code/lesson__a')));
  });

  // Read-only by design: nothing on the dashboard should be able to edit a
  // learner's record, and a bug there must not be able to either.
  it("denies an admin writing another learner's documents", async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(setDoc(doc(db, 'users/alice'), { email: 'hacked' }));
    await assertFails(setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [1] }));
  });

  it('still denies a non-admin the roster', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(getDoc(doc(db, 'users/alice')));
  });

  it('denies a signed-out visitor the roster', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'users')));
  });

  it('lets an admin still read their own documents', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(db, `users/${ADMIN_UID}/state/progress`), { completedUnits: [3] }));
    await assertSucceeds(getDoc(doc(db, `users/${ADMIN_UID}/state/progress`)));
  });
});
