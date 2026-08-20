import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField,
  collection, query, where } from 'firebase/firestore';
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

const TEACHER = 'teacherOne';
const OTHER_TEACHER = 'teacherTwo';
const CODE = 'ABC234';
const OTHER_CODE = 'XYZ789';

describe('classroom join codes', () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `joinCodes/${CODE}`), { teacherUid: TEACHER, createdAt: 1 });
      await setDoc(doc(db, `joinCodes/${OTHER_CODE}`), { teacherUid: OTHER_TEACHER, createdAt: 1 });
      await setDoc(doc(db, 'users/pupil'), { teacherUid: TEACHER, joinCode: CODE, email: 'p@x.com' });
      await setDoc(doc(db, 'users/loner'), { email: 'l@x.com' });
    });
  });

  it('lets a signed-in learner resolve a code they were given', async () => {
    const db = env.authenticatedContext('someone').firestore();
    await assertSucceeds(getDoc(doc(db, `joinCodes/${CODE}`)));
  });

  it('denies a signed-out visitor resolving a code', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `joinCodes/${CODE}`)));
  });

  // Codes are the credential for joining a class. Listing the collection would
  // hand over every class in one query.
  it('denies listing the code collection', async () => {
    const db = env.authenticatedContext('someone').firestore();
    await assertFails(getDocs(collection(db, 'joinCodes')));
  });

  it('lets a teacher issue a code for themselves', async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'joinCodes/NEWCOD'), { teacherUid: TEACHER, createdAt: Date.now() })
    );
  });

  it('denies issuing a code that points at someone else', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(
      setDoc(doc(db, 'joinCodes/EVILCD'), { teacherUid: TEACHER, createdAt: Date.now() })
    );
  });

  // create-only: an existing code can never be repointed at a different teacher.
  it('denies repointing an existing code', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(
      setDoc(doc(db, `joinCodes/${CODE}`), { teacherUid: 'mallory', createdAt: Date.now() })
    );
  });

  it('lets a teacher retire their own code but not another teacher\'s', async () => {
    const mine = env.authenticatedContext(TEACHER).firestore();
    const theirs = env.authenticatedContext(TEACHER).firestore();
    await assertFails(deleteDoc(doc(theirs, `joinCodes/${OTHER_CODE}`)));
    await assertSucceeds(deleteDoc(doc(mine, 'joinCodes/NEWCOD')));
  });
});

describe('joining a class', () => {
  it('lets a learner join with a code that matches the teacher claimed', async () => {
    const db = env.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/joiner'),
        { role: 'student', teacherUid: TEACHER, joinCode: CODE }, { merge: true })
    );
  });

  // The whole point of the code: without it, knowing a teacher's uid would be
  // enough to appear in their roster.
  it('denies claiming a teacher without presenting their code', async () => {
    const db = env.authenticatedContext('sneak').firestore();
    await assertFails(
      setDoc(doc(db, 'users/sneak'), { teacherUid: TEACHER }, { merge: true })
    );
  });

  it("denies claiming a teacher with another teacher's code", async () => {
    const db = env.authenticatedContext('sneak').firestore();
    await assertFails(
      setDoc(doc(db, 'users/sneak'),
        { teacherUid: TEACHER, joinCode: OTHER_CODE }, { merge: true })
    );
  });

  it('denies claiming a teacher with a code that does not exist', async () => {
    const db = env.authenticatedContext('sneak').firestore();
    await assertFails(
      setDoc(doc(db, 'users/sneak'),
        { teacherUid: TEACHER, joinCode: 'NOPE99' }, { merge: true })
    );
  });

  // Ordinary progress writes must not have to re-prove class membership, or
  // every save would cost an extra document read.
  it('lets a student keep saving progress without re-presenting the code', async () => {
    const db = env.authenticatedContext('pupil').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/pupil'), { unitsCompleted: 3, totalSeconds: 60 }, { merge: true })
    );
  });

  it('lets a student leave their class', async () => {
    const db = env.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/joiner'),
        { teacherUid: deleteField(), joinCode: deleteField(), updatedAt: Date.now() })
    );
  });
});

describe('teacher roster', () => {
  it('lets a teacher read their own student', async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/pupil')));
  });

  it('lets a teacher query their roster', async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertSucceeds(
      getDocs(query(collection(db, 'users'), where('teacherUid', '==', TEACHER)))
    );
  });

  it('denies a teacher the whole users collection', async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertFails(getDocs(collection(db, 'users')));
  });

  it("denies a teacher another teacher's student", async () => {
    const db = env.authenticatedContext(OTHER_TEACHER).firestore();
    await assertFails(getDoc(doc(db, 'users/pupil')));
  });

  it('denies a teacher a learner who is in no class', async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertFails(getDoc(doc(db, 'users/loner')));
  });

  // The dashboards report progress, not the Python a learner wrote.
  it("denies a teacher their student's saved code", async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertFails(getDoc(doc(db, 'users/pupil/code/lesson__a')));
  });

  it('lets a teacher drop their own student', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/dropme'),
        { teacherUid: TEACHER, joinCode: CODE, email: 'd@x.com' });
    });
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/dropme'),
        { teacherUid: deleteField(), joinCode: deleteField(), updatedAt: Date.now() })
    );
  });

  // Removal is the only cross-account write there is. It must not become a
  // foothold for editing anything else on a student's record.
  it("denies a teacher editing anything else on a student's record", async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertFails(
      updateDoc(doc(db, 'users/pupil'), { email: 'hacked@x.com' })
    );
    await assertFails(
      updateDoc(doc(db, 'users/pupil'), { unitsCompleted: 10, hasCertificate: true })
    );
  });

  it('denies a teacher moving a student to a different class', async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertFails(
      updateDoc(doc(db, 'users/pupil'),
        { teacherUid: OTHER_TEACHER, joinCode: OTHER_CODE, updatedAt: Date.now() })
    );
  });

  it('denies a teacher deleting a student record', async () => {
    const db = env.authenticatedContext(TEACHER).firestore();
    await assertFails(deleteDoc(doc(db, 'users/pupil')));
  });

  it('denies one student reading another', async () => {
    const db = env.authenticatedContext('pupil').firestore();
    await assertFails(getDoc(doc(db, 'users/loner')));
  });
});
