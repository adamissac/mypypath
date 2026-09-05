import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import fs from 'node:fs';

/* The roster summary: a cache of what the teacher's grid renders, written by
 * the student it describes.
 *
 * WHAT IS AND IS NOT UNDER TEST HERE, because the honest scope is narrow and
 * pretending otherwise would be the worst outcome of this file existing.
 *
 * These rules CANNOT stop a student inflating their own summary. There are no
 * Cloud Functions in this project, so the summary is written by the student's
 * own browser, and no rule can tell a real firstPassAt from an invented one --
 * the only evidence for either is the document being written. A student with a
 * console can claim every lesson passed. That is stated in the rules file
 * itself, in the same register as maxTestAttempts and sequential unlocking.
 *
 * What these rules CAN do, and what this file tests:
 *
 *   - one student cannot write into another student's summary;
 *   - a teacher cannot write into a student's record at all;
 *   - a teacher of a DIFFERENT class cannot read it;
 *   - the document id is pinned, so a student cannot use the collection as
 *     free storage attached to a teacher's class;
 *   - the key set is pinned, so it cannot grow into one either;
 *   - updatedAt is server-stamped, so a completion cannot be BACKDATED past a
 *     due date. This is the only forgery the rules genuinely prevent, and it
 *     is the one worth preventing: inflated progress shows up in the
 *     drill-down, while a completion quietly moved to before Friday does not.
 */

let env;

const CLASS_A = 'classA';
const CLASS_B = 'classB';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-summary-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `classes/${CLASS_A}`), {
      name: 'Period 1', joinCode: 'ABC234', teacherUids: ['teacherA'],
      createdAt: new Date(), archived: false, schemaVersion: 1,
    });
    await setDoc(doc(db, `classes/${CLASS_B}`), {
      name: 'Period 2', joinCode: 'DEF678', teacherUids: ['teacherB'],
      createdAt: new Date(), archived: false, schemaVersion: 1,
    });
    // ann is enrolled in A. cass is enrolled in nothing.
    await setDoc(doc(db, `classes/${CLASS_A}/roster/ann`), {
      displayName: 'ann', joinedAt: new Date(), lastActiveAt: new Date(),
      joinCode: 'ABC234', schemaVersion: 1,
    });
    await setDoc(doc(db, `classes/${CLASS_A}/roster/bo`), {
      displayName: 'bo', joinedAt: new Date(), lastActiveAt: new Date(),
      joinCode: 'ABC234', schemaVersion: 1,
    });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const guest = () => env.unauthenticatedContext().firestore();

const path = (uid, docId) => `classes/${CLASS_A}/roster/${uid}/summary/${docId || 'current'}`;

/* A summary shaped the way roster-summary.js writes them. updatedAt must equal
   request.time, which the emulator resolves from the serverTimestamp sentinel. */
function summaryDoc(extra) {
  return {
    schemaVersion: 3,
    updatedAt: serverTimestamp(),
    lessons: { 'units__unit-1__what-is-python': { state: 'passed', bestRatio: 1 } },
    units: { 1: { testBest: { score: 18, total: 20 } } },
    quizzes: {},
    lastEventAt: 1756000000000,
    ...extra,
  };
}

describe('a student owns their own summary', () => {
  it('lets an enrolled student write theirs', async () => {
    await assertSucceeds(setDoc(doc(as('ann'), path('ann')), summaryDoc()));
  });

  it('lets them update it', async () => {
    await assertSucceeds(setDoc(doc(as('ann'), path('ann')), summaryDoc()));
    await assertSucceeds(setDoc(doc(as('ann'), path('ann')), summaryDoc({
      lastEventAt: 1756000009999,
    })));
  });

  it('lets them delete it', async () => {
    await assertSucceeds(setDoc(doc(as('ann'), path('ann')), summaryDoc()));
    await assertSucceeds(deleteDoc(doc(as('ann'), path('ann'))));
  });

  it('refuses a student who is not enrolled in the class', async () => {
    // cass has no roster row in class A. Writing a summary there would be a
    // way to attach a record to a class you were never given the code for.
    await assertFails(setDoc(doc(as('cass'), path('cass')), summaryDoc()));
  });

  it('refuses a guest', async () => {
    await assertFails(setDoc(doc(guest(), path('ann')), summaryDoc()));
  });
});

describe('one student cannot touch another student', () => {
  it('refuses a write into a classmate\'s summary', async () => {
    await assertFails(setDoc(doc(as('bo'), path('ann')), summaryDoc()));
  });

  it('refuses a read of a classmate\'s summary', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path('ann')), { schemaVersion: 3 });
    });
    await assertFails(getDoc(doc(as('bo'), path('ann'))));
  });

  it('refuses a delete of a classmate\'s summary', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path('ann')), { schemaVersion: 3 });
    });
    await assertFails(deleteDoc(doc(as('bo'), path('ann'))));
  });
});

describe('a teacher reads, and only reads', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path('ann')), {
        schemaVersion: 3, updatedAt: new Date(), lessons: {}, units: {},
        quizzes: {}, lastEventAt: 0,
      });
    });
  });

  it('lets the class teacher read it', async () => {
    await assertSucceeds(getDoc(doc(as('teacherA'), path('ann'))));
  });

  it('refuses a teacher of a different class', async () => {
    await assertFails(getDoc(doc(as('teacherB'), path('ann'))));
  });

  it('refuses the class teacher writing into it', async () => {
    // A teacher never writes into a student's record. The grid is a view of
    // what the student did, and a teacher who could edit it is a teacher who
    // could be blamed for it.
    await assertFails(setDoc(doc(as('teacherA'), path('ann')), summaryDoc()));
  });

  it('refuses the class teacher deleting it while the class is open', async () => {
    await assertFails(deleteDoc(doc(as('teacherA'), path('ann'))));
  });

  it('lets the teacher delete it once the class is archived', async () => {
    // The same exception the mirror and the event log carry: a student who
    // never returns cannot run their own expiry.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `classes/${CLASS_A}`), { archived: true });
    });
    await assertSucceeds(deleteDoc(doc(as('teacherA'), path('ann'))));
  });
});

describe('the shape is pinned, so the collection cannot become a storage bucket', () => {
  it('refuses any document id but current', async () => {
    await assertFails(setDoc(doc(as('ann'), path('ann', 'sneaky')), summaryDoc()));
  });

  it('refuses an unknown key', async () => {
    await assertFails(setDoc(doc(as('ann'), path('ann')), summaryDoc({
      payload: 'a'.repeat(1000),
    })));
  });

  it('refuses a missing required key', async () => {
    const d = summaryDoc();
    delete d.lessons;
    await assertFails(setDoc(doc(as('ann'), path('ann')), d));
  });

  it('refuses lessons that is not a map', async () => {
    await assertFails(setDoc(doc(as('ann'), path('ann')), summaryDoc({ lessons: 'all done' })));
  });

  it('refuses lastEventAt that is not a number', async () => {
    await assertFails(setDoc(doc(as('ann'), path('ann')), summaryDoc({ lastEventAt: 'now' })));
  });
});

describe('updatedAt cannot be backdated, which is the one forgery this stops', () => {
  /* Inflating your own progress is visible to a teacher in the drill-down,
     which reads the event log. Moving a completion to before the due date is
     not visible anywhere, and is the difference between a late grade and an
     on-time one. So this is the check worth having. */

  it('refuses a client-chosen timestamp in the past', async () => {
    await assertFails(setDoc(doc(as('ann'), path('ann')), summaryDoc({
      updatedAt: new Date('2020-01-01T00:00:00Z'),
    })));
  });

  it('refuses a client-chosen timestamp in the future', async () => {
    await assertFails(setDoc(doc(as('ann'), path('ann')), summaryDoc({
      updatedAt: new Date(Date.now() + 86400000),
    })));
  });

  it('refuses a number where the server timestamp belongs', async () => {
    await assertFails(setDoc(doc(as('ann'), path('ann')), summaryDoc({
      updatedAt: Date.now(),
    })));
  });

  it('accepts the server sentinel', async () => {
    await assertSucceeds(setDoc(doc(as('ann'), path('ann')), summaryDoc()));
  });
});

describe('what these rules deliberately do NOT prevent', () => {
  /* Written as passing tests rather than left unsaid, because the gap is a
     design decision and an unwritten gap reads as an oversight to the next
     person. Each of these SUCCEEDS, and each is a thing a student could do. */

  it('a student may claim a lesson they never passed', async () => {
    await assertSucceeds(setDoc(doc(as('ann'), path('ann')), summaryDoc({
      lessons: { 'units__unit-9__anything': { state: 'passed', bestRatio: 1 } },
    })));
  });

  it('a student may claim full marks on a test they never sat', async () => {
    await assertSucceeds(setDoc(doc(as('ann'), path('ann')), summaryDoc({
      units: { 9: { testBest: { score: 100, total: 100 }, verifiedAt: 1 } },
    })));
  });

  it('but the event log they are contradicting is append-only and server-stamped', async () => {
    // The reason the above is tolerable. A teacher who doubts a row opens the
    // drill-down, which reads events, and a student cannot retro-fit those:
    // `at` is pinned to request.time by the events rule.
    await assertFails(setDoc(doc(as('ann'), `classes/${CLASS_A}/roster/ann/events/forged`), {
      type: 'code.tests_passed',
      lessonPath: '/units/unit-9/anything.html',
      unit: 9,
      at: new Date('2026-01-01T00:00:00Z'),
      payload: { lessonPath: '/units/unit-9/anything.html', passed: 5, total: 5 },
      schemaVersion: 1,
    }));
  });
});
