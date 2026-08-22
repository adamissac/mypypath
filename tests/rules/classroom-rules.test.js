import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection,
} from 'firebase/firestore';
import fs from 'node:fs';

/* The classroom half of the rules. The property under test throughout is that
   a teacher sees a student's work only because that student presented a join
   code and enrolled themselves, and sees nothing outside their own class. */

let env;

const CLASS_A = 'classA';
const CLASS_B = 'classB';
const CODE_A = 'ABC234';
const CODE_B = 'DEF678';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-classroom-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => { await env.cleanup(); });

/* Seeded with rules off, so the fixtures themselves are not what is under
   test -- only the requests made against them below. */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `classes/${CLASS_A}`), {
      name: 'Period 1', joinCode: CODE_A, teacherUids: ['teacherA'],
      createdAt: new Date(), archived: false, schemaVersion: 1,
    });
    await setDoc(doc(db, `classes/${CLASS_B}`), {
      name: 'Period 2', joinCode: CODE_B, teacherUids: ['teacherB'],
      createdAt: new Date(), archived: false, schemaVersion: 1,
    });
    await setDoc(doc(db, `joinCodes/${CODE_A}`), {
      teacherUid: 'teacherA', classId: CLASS_A, active: true, createdAt: new Date(),
    });
    await setDoc(doc(db, `joinCodes/${CODE_B}`), {
      teacherUid: 'teacherB', classId: CLASS_B, active: true, createdAt: new Date(),
    });
    // Two students already enrolled in class A.
    for (const uid of ['ann', 'bo']) {
      await setDoc(doc(db, `classes/${CLASS_A}/roster/${uid}`), {
        displayName: uid, joinedAt: new Date(), lastActiveAt: new Date(),
        joinCode: CODE_A, schemaVersion: 1,
      });
      await setDoc(doc(db, `classes/${CLASS_A}/roster/${uid}/events/e1`), {
        type: 'lesson.opened', lessonPath: '/units/unit-1/what-is-python.html',
        unit: 1, at: new Date(), payload: { lessonPath: '/x', unit: 1 }, schemaVersion: 1,
      });
      await setDoc(doc(db, `classes/${CLASS_A}/roster/${uid}/progress/pypath-completed-units`), {
        content: '[1]', updatedAt: Date.now(), schemaVersion: 1,
      });
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const guest = () => env.unauthenticatedContext().firestore();

/* An event shaped the way the client writes them. `at` must equal request.time,
   which the emulator resolves from a serverTimestamp() sentinel. */
function eventDoc(extra) {
  return {
    type: 'code.run',
    lessonPath: '/units/unit-1/first-program.html',
    unit: 1,
    at: new Date(),
    payload: { lessonPath: '/units/unit-1/first-program.html', editorId: 'practice1', ok: true },
    schemaVersion: 1,
    ...extra,
  };
}

describe('join codes cannot be harvested', () => {
  it('lets a signed-in learner resolve a single code', async () => {
    await assertSucceeds(getDoc(doc(as('ann'), `joinCodes/${CODE_A}`)));
  });

  it('denies listing the collection, so codes cannot be enumerated', async () => {
    await assertFails(getDocs(collection(as('mallory'), 'joinCodes')));
  });

  it('denies a guest resolving a code', async () => {
    await assertFails(getDoc(doc(guest(), `joinCodes/${CODE_A}`)));
  });

  it('denies repointing an issued code at another teacher', async () => {
    await assertFails(
      updateDoc(doc(as('mallory'), `joinCodes/${CODE_A}`), { teacherUid: 'mallory' })
    );
  });
});

describe('class documents', () => {
  it('lets a teacher create a class they own', async () => {
    await assertSucceeds(
      setDoc(doc(as('teacherC'), 'classes/classC'), {
        name: 'Period 3', joinCode: 'GHJ789', teacherUids: ['teacherC'],
        createdAt: new Date(), archived: false, schemaVersion: 1,
      })
    );
  });

  it('denies creating a class owned by somebody else', async () => {
    await assertFails(
      setDoc(doc(as('mallory'), 'classes/classD'), {
        name: 'Not mine', joinCode: 'GHJ789', teacherUids: ['teacherA'],
        createdAt: new Date(), archived: false, schemaVersion: 1,
      })
    );
  });

  it('denies creating a class that is archived from birth or unnamed', async () => {
    await assertFails(
      setDoc(doc(as('teacherC'), 'classes/classE'), {
        name: '', joinCode: 'GHJ789', teacherUids: ['teacherC'],
        createdAt: new Date(), archived: false, schemaVersion: 1,
      })
    );
  });

  it('lets a teacher add a co-teacher', async () => {
    await assertSucceeds(
      updateDoc(doc(as('teacherA'), `classes/${CLASS_A}`), {
        teacherUids: ['teacherA', 'teacherC'],
      })
    );
  });

  it('denies a teacher writing themselves out of their own class', async () => {
    await assertFails(
      updateDoc(doc(as('teacherA'), `classes/${CLASS_A}`), { teacherUids: ['teacherC'] })
    );
  });

  it('denies a non-teacher taking over a class', async () => {
    await assertFails(
      updateDoc(doc(as('mallory'), `classes/${CLASS_A}`), { teacherUids: ['mallory'] })
    );
  });

  it('denies deleting a class, because the subtree would be stranded', async () => {
    await assertFails(deleteDoc(doc(as('teacherA'), `classes/${CLASS_A}`)));
  });

  it('denies listing all classes', async () => {
    await assertFails(getDocs(collection(as('mallory'), 'classes')));
  });
});

describe('a teacher sees their own class and nothing else', () => {
  it('lets a teacher read their own roster', async () => {
    await assertSucceeds(getDocs(collection(as('teacherA'), `classes/${CLASS_A}/roster`)));
  });

  it('lets a teacher read a student event in their own class', async () => {
    await assertSucceeds(
      getDoc(doc(as('teacherA'), `classes/${CLASS_A}/roster/ann/events/e1`))
    );
  });

  it("denies the teacher of class A reading class B's roster", async () => {
    await assertFails(getDocs(collection(as('teacherA'), `classes/${CLASS_B}/roster`)));
  });

  it("denies the teacher of class A reading a class B student's events", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `classes/${CLASS_B}/roster/cy`), {
        displayName: 'cy', joinedAt: new Date(), joinCode: CODE_B, schemaVersion: 1,
      });
      await setDoc(doc(ctx.firestore(), `classes/${CLASS_B}/roster/cy/events/e1`), {
        type: 'lesson.opened', at: new Date(), payload: {}, schemaVersion: 1,
      });
    });
    await assertFails(getDoc(doc(as('teacherA'), `classes/${CLASS_B}/roster/cy/events/e1`)));
  });

  it("denies a teacher writing into a student's progress mirror", async () => {
    await assertFails(
      setDoc(
        doc(as('teacherA'), `classes/${CLASS_A}/roster/ann/progress/pypath-completed-units`),
        { content: '[1,2,3,4,5]', updatedAt: Date.now() }
      )
    );
  });

  it("denies a teacher forging an event in a student's log", async () => {
    await assertFails(
      setDoc(doc(as('teacherA'), `classes/${CLASS_A}/roster/ann/events/forged`), eventDoc())
    );
  });

  it('lets a teacher remove a student from their own class', async () => {
    await assertSucceeds(deleteDoc(doc(as('teacherA'), `classes/${CLASS_A}/roster/bo`)));
  });
});

describe('enrollment is the consent boundary', () => {
  it('lets a student join with a code that points at that class', async () => {
    await assertSucceeds(
      setDoc(doc(as('cy'), `classes/${CLASS_A}/roster/cy`), {
        displayName: 'cy', joinedAt: new Date(), lastActiveAt: new Date(),
        joinCode: CODE_A, schemaVersion: 1,
      })
    );
  });

  it("denies joining a class with another class's code", async () => {
    await assertFails(
      setDoc(doc(as('cy'), `classes/${CLASS_A}/roster/cy`), {
        displayName: 'cy', joinedAt: new Date(), joinCode: CODE_B, schemaVersion: 1,
      })
    );
  });

  it('denies joining with no code at all, even knowing the class id', async () => {
    await assertFails(
      setDoc(doc(as('cy'), `classes/${CLASS_A}/roster/cy`), {
        displayName: 'cy', joinedAt: new Date(), schemaVersion: 1,
      })
    );
  });

  it('denies joining an archived class', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `classes/${CLASS_A}`), { archived: true });
    });
    await assertFails(
      setDoc(doc(as('cy'), `classes/${CLASS_A}/roster/cy`), {
        displayName: 'cy', joinedAt: new Date(), joinCode: CODE_A, schemaVersion: 1,
      })
    );
  });

  it('denies enrolling somebody else', async () => {
    await assertFails(
      setDoc(doc(as('mallory'), `classes/${CLASS_A}/roster/ann`), {
        displayName: 'ann', joinedAt: new Date(), joinCode: CODE_A, schemaVersion: 1,
      })
    );
  });

  it('denies storing a real name or an email on the roster', async () => {
    await assertFails(
      setDoc(doc(as('cy'), `classes/${CLASS_A}/roster/cy`), {
        displayName: 'cy', joinedAt: new Date(), joinCode: CODE_A,
        email: 'cy@school.edu', schemaVersion: 1,
      })
    );
  });

  it('denies rewriting the join code or joined date after enrolling', async () => {
    await assertFails(
      updateDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann`), { joinCode: CODE_B })
    );
    await assertFails(
      updateDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann`), { joinedAt: new Date(0) })
    );
  });

  it('lets a student update their own heartbeat', async () => {
    await assertSucceeds(
      updateDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann`), { lastActiveAt: new Date() })
    );
  });

  it('lets a student leave the class themselves', async () => {
    await assertSucceeds(deleteDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann`)));
  });

  it('denies an unenrolled user writing to a roster path', async () => {
    await assertFails(
      setDoc(doc(as('mallory'), `classes/${CLASS_A}/roster/mallory/progress/pypath-completed-units`),
        { content: '[1]', updatedAt: Date.now() })
    );
    await assertFails(
      setDoc(doc(as('mallory'), `classes/${CLASS_A}/roster/mallory/events/e9`), eventDoc())
    );
  });

  it('denies a guest doing anything in a class', async () => {
    await assertFails(getDoc(doc(guest(), `classes/${CLASS_A}`)));
    await assertFails(getDoc(doc(guest(), `classes/${CLASS_A}/roster/ann`)));
    await assertFails(
      setDoc(doc(guest(), `classes/${CLASS_A}/roster/ann/events/e9`), eventDoc())
    );
  });
});

describe('students cannot read each other', () => {
  it("denies reading another student's events", async () => {
    await assertFails(getDoc(doc(as('bo'), `classes/${CLASS_A}/roster/ann/events/e1`)));
  });

  it("denies reading another student's progress mirror", async () => {
    await assertFails(
      getDoc(doc(as('bo'), `classes/${CLASS_A}/roster/ann/progress/pypath-completed-units`))
    );
  });

  it("denies listing a classmate's event log", async () => {
    await assertFails(getDocs(collection(as('bo'), `classes/${CLASS_A}/roster/ann/events`)));
  });

  it('lets a student read their own roster row and events', async () => {
    await assertSucceeds(getDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann`)));
    await assertSucceeds(getDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/e1`)));
  });
});

describe('the event log is append-only', () => {
  it('lets an enrolled student append an event', async () => {
    await assertSucceeds(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/new1`), eventDoc())
    );
  });

  it('denies an event type outside the vocabulary', async () => {
    await assertFails(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/new2`),
        eventDoc({ type: 'keystroke.logged' }))
    );
  });

  it('denies an event carrying fields outside the schema', async () => {
    await assertFails(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/new3`),
        eventDoc({ ipAddress: '10.0.0.1' }))
    );
  });

  it('denies a backdated event, because the timestamp is pinned to request.time', async () => {
    await assertFails(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/new4`),
        eventDoc({ at: new Date('2020-01-01') }))
    );
  });

  it('denies an oversized payload', async () => {
    const payload = {};
    for (let i = 0; i < 20; i += 1) payload['k' + i] = 'x';
    await assertFails(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/new5`), eventDoc({ payload }))
    );
  });

  it('denies an oversized lesson path', async () => {
    await assertFails(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/new6`),
        eventDoc({ lessonPath: '/units/' + 'x'.repeat(300) }))
    );
  });

  it('denies updating an event after it was created', async () => {
    await assertFails(
      updateDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/e1`), { unit: 9 })
    );
  });

  it('denies deleting an event while still enrolled', async () => {
    await assertFails(deleteDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/e1`)));
  });

  it('lets a student clear their events once they have left the class', async () => {
    // Erasure, not an edit: the roster document is gone first, so this cannot
    // be used to rewrite history one delete-and-recreate at a time.
    await assertSucceeds(deleteDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann`)));
    await assertSucceeds(deleteDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/e1`)));
  });

  it('lets a student clear their progress mirror once they have left', async () => {
    await assertSucceeds(deleteDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann`)));
    await assertSucceeds(
      deleteDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/progress/pypath-completed-units`))
    );
  });
});

describe('the progress mirror', () => {
  it('lets an enrolled student write their own mirror', async () => {
    await assertSucceeds(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/progress/pypath-completed-units`),
        { content: '[1,2]', updatedAt: Date.now(), schemaVersion: 1 })
    );
  });

  it('caps mirrored content at 100KB, as the private code collection does', async () => {
    await assertFails(
      setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/progress/big`),
        { content: 'x'.repeat(102401), updatedAt: Date.now(), schemaVersion: 1 })
    );
  });

  it("denies writing into another student's mirror", async () => {
    await assertFails(
      setDoc(doc(as('bo'), `classes/${CLASS_A}/roster/ann/progress/pypath-completed-units`),
        { content: '[]', updatedAt: Date.now() })
    );
  });
});

describe('the private user subtree is not loosened by any of this', () => {
  it('still denies a teacher reading a student account record', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ann'), { email: 'ann@school.edu' });
    });
    await assertFails(getDoc(doc(as('teacherA'), 'users/ann')));
  });

  it('still denies a teacher reading a student\'s private saved code', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ann/code/lesson__x'), { content: 'print(1)' });
    });
    await assertFails(getDoc(doc(as('teacherA'), 'users/ann/code/lesson__x')));
  });
});
