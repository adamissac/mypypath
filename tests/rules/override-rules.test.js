import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

/* Teacher overrides: the ONE place a teacher may write about a student.
 *
 * Everywhere else the rule is that a teacher never writes into a student's
 * record. That rule is right and stays right for events, progress and the
 * summary -- the grid is a view of what the student did, and a teacher who
 * could edit it is a teacher who could be blamed for it.
 *
 * It also made two things impossible that a school requires: extended time for
 * a student with an IEP or 504 plan, which they are legally entitled to, and
 * correcting a mark, whose absence does not keep the record pure but simply
 * moves the real marks into a spreadsheet.
 *
 * So overrides live OUTSIDE the record rather than editing it. Nothing here
 * mutates an event or a summary. What this file pins is the attribution: an
 * adjustment cannot be pinned on a colleague, cannot be backdated, and cannot
 * be written by the student it is about.
 */

let env;
const CLASS_A = 'classA';
const CLASS_B = 'classB';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-override-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `classes/${CLASS_A}`), {
      name: 'Period 1', joinCode: 'ABC234', teacherUids: ['teacherA', 'coteachA'],
      createdAt: new Date(), archived: false, schemaVersion: 1,
    });
    await setDoc(doc(db, `classes/${CLASS_B}`), {
      name: 'Period 2', joinCode: 'DEF678', teacherUids: ['teacherB'],
      createdAt: new Date(), archived: false, schemaVersion: 1,
    });
    for (const uid of ['ann', 'bo']) {
      await setDoc(doc(db, `classes/${CLASS_A}/roster/${uid}`), {
        displayName: uid, joinedAt: new Date(), lastActiveAt: new Date(),
        joinCode: 'ABC234', schemaVersion: 1,
      });
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const guest = () => env.unauthenticatedContext().firestore();
const path = (uid, id) => `classes/${CLASS_A}/roster/${uid}/overrides/${id}`;

function dueDoc(by, extra) {
  return {
    kind: 'due',
    assignmentId: 'a1',
    dueAt: Date.now() + 7 * 86400000,
    reason: 'IEP: extended time',
    byUid: by,
    byName: 'Ms Teacher',
    at: serverTimestamp(),
    ...extra,
  };
}

function gradeDoc(by, extra) {
  return {
    kind: 'grade',
    unit: 3,
    score: 62,
    outOf: 100,
    reason: 'Question 4 was marked wrong by the autograder',
    byUid: by,
    byName: 'Ms Teacher',
    at: serverTimestamp(),
    ...extra,
  };
}

describe('a teacher of the class may adjust', () => {
  it('grants an extension', async () => {
    await assertSucceeds(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA')));
  });

  it('corrects a score', async () => {
    await assertSucceeds(setDoc(doc(as('teacherA'), path('ann', 'grade__u3')),
      gradeDoc('teacherA')));
  });

  it('a co-teacher may too', async () => {
    await assertSucceeds(setDoc(doc(as('coteachA'), path('ann', 'due__a1')),
      dueDoc('coteachA')));
  });

  it('replaces their own adjustment rather than stacking a second one', async () => {
    await assertSucceeds(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA')));
    await assertSucceeds(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA', { dueAt: Date.now() + 14 * 86400000 })));
  });

  it('may withdraw it', async () => {
    await assertSucceeds(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA')));
    await assertSucceeds(deleteDoc(doc(as('teacherA'), path('ann', 'due__a1'))));
  });
});

describe('nobody else may', () => {
  it('refuses a teacher of a different class', async () => {
    await assertFails(setDoc(doc(as('teacherB'), path('ann', 'due__a1')),
      dueDoc('teacherB')));
  });

  it('refuses the student the override is about', async () => {
    // The whole point. A student who could write their own extension has no
    // deadline at all.
    await assertFails(setDoc(doc(as('ann'), path('ann', 'due__a1')), dueDoc('ann')));
  });

  it('refuses a classmate', async () => {
    await assertFails(setDoc(doc(as('bo'), path('ann', 'due__a1')), dueDoc('bo')));
  });

  it('refuses a guest', async () => {
    await assertFails(setDoc(doc(guest(), path('ann', 'due__a1')), dueDoc('x')));
  });

  it('refuses the student deleting one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path('ann', 'grade__u3')), { kind: 'grade' });
    });
    await assertFails(deleteDoc(doc(as('ann'), path('ann', 'grade__u3'))));
  });
});

describe('the student may read what was decided about them', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path('ann', 'due__a1')), {
        kind: 'due', assignmentId: 'a1', dueAt: Date.now(), reason: 'IEP',
        byUid: 'teacherA', byName: 'Ms Teacher', at: new Date(),
      });
    });
  });

  it('reads their own', async () => {
    // Being told you have until Friday is the entire point of an extension.
    await assertSucceeds(getDoc(doc(as('ann'), path('ann', 'due__a1'))));
  });

  it('cannot read a classmate\'s', async () => {
    // Whether another student has an accommodation is that student's business.
    await assertFails(getDoc(doc(as('bo'), path('ann', 'due__a1'))));
  });

  it('the class teacher reads it', async () => {
    await assertSucceeds(getDoc(doc(as('teacherA'), path('ann', 'due__a1'))));
  });

  it('a teacher of another class cannot', async () => {
    await assertFails(getDoc(doc(as('teacherB'), path('ann', 'due__a1'))));
  });
});

describe('the attribution cannot be forged, which is what makes this auditable', () => {
  it('refuses an override attributed to a colleague', async () => {
    /* Without this a teacher could grant an extension in a co-teacher's name.
       The record exists to answer "who decided this"; an answer that can be
       written by someone else is not an answer. */
    await assertFails(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('coteachA')));
  });

  it('refuses a backdated timestamp', async () => {
    /* An extension backdated to before the deadline it excuses would look like
       it had always been there. That is the difference between "granted an
       accommodation" and "quietly rewrote a late mark". */
    await assertFails(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA', { at: new Date('2020-01-01T00:00:00Z') })));
  });

  it('refuses a future timestamp', async () => {
    await assertFails(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA', { at: new Date(Date.now() + 86400000) })));
  });

  it('refuses a plain number where the server stamp belongs', async () => {
    await assertFails(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA', { at: Date.now() })));
  });
});

describe('the shape is pinned', () => {
  it('refuses an unknown kind', async () => {
    await assertFails(setDoc(doc(as('teacherA'), path('ann', 'x')),
      dueDoc('teacherA', { kind: 'expel' })));
  });

  it('refuses an unknown key', async () => {
    await assertFails(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA', { blob: 'x'.repeat(500) })));
  });

  it('refuses a reason over the length cap', async () => {
    await assertFails(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA', { reason: 'x'.repeat(501) })));
  });

  it('accepts an empty reason on an extension', async () => {
    // The store requires a reason for a GRADE change, where it is the thing a
    // teacher will be asked about at a parents' evening. An extension is
    // routine and often has nothing to add; the rules do not invent a
    // requirement the product does not have.
    await assertSucceeds(setDoc(doc(as('teacherA'), path('ann', 'due__a1')),
      dueDoc('teacherA', { reason: '' })));
  });
});

describe('what an override deliberately does NOT let a teacher do', () => {
  /* Written as passing tests, like the summary rules, so the boundary is
     recorded as a decision rather than read as an oversight. */

  it('cannot edit the student\'s event log', async () => {
    await assertFails(setDoc(doc(as('teacherA'), `classes/${CLASS_A}/roster/ann/events/e9`), {
      type: 'code.tests_passed', lessonPath: '/x', unit: 1,
      at: serverTimestamp(), payload: {}, schemaVersion: 1,
    }));
  });

  it('cannot edit the student\'s summary', async () => {
    await assertFails(setDoc(doc(as('teacherA'), `classes/${CLASS_A}/roster/ann/summary/current`), {
      schemaVersion: 3, updatedAt: serverTimestamp(), lessons: {}, units: {},
      quizzes: {}, exercises: {}, flagged: [], lastLessonPath: '', lastEventAt: 0,
    }));
  });

  it('cannot edit the student\'s progress mirror', async () => {
    await assertFails(setDoc(doc(as('teacherA'), `classes/${CLASS_A}/roster/ann/progress/k`), {
      key: 'k', content: 'forged', updatedAt: Date.now(), schemaVersion: 1,
    }));
  });
});
