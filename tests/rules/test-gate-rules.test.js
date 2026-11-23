import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

/* Teacher control over tests and quizzes, on the side that enforces it.
 *
 * Two switches, both real barriers because both live on documents only a
 * teacher can write:
 *
 *   testGate/openTests on the class   -- a test.submitted for a test the
 *                                        teacher has not opened is refused.
 *   closed on an assignment           -- a quiz.submitted for a closed quiz is
 *                                        refused.
 *
 * And the defaults have to be invisible: a class that never touches either
 * setting must behave exactly as it did before they existed.
 */

let env;

const GATED = 'gated';      // testGate manual, only the Unit 2 test open
const DEFAULT = 'plain';    // no testGate at all
const CODE = 'ABC234';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-test-gate-rules',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => { await env.cleanup(); });

function klass(extra) {
  return {
    name: 'Period 1',
    joinCode: CODE,
    teacherUids: ['teacher'],
    createdAt: new Date(),
    archived: false,
    schemaVersion: 1,
    ...extra,
  };
}

function assignment(extra) {
  return {
    title: 'Loops check',
    units: [],
    lessonPaths: [],
    quiz: { unit: 1, questionIds: ['u1-m01'], passMark: 70, attempts: 0 },
    dueAt: Date.now() + 86400000,
    createdAt: new Date(),
    archived: false,
    schemaVersion: 1,
    ...extra,
  };
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `classes/${GATED}`), klass({
      lockMode: 'free', testGate: 'manual', openTests: [2], assignmentUnlocks: [],
    }));
    await setDoc(doc(db, `classes/${DEFAULT}`), klass({ lockMode: 'free' }));
    for (const classId of [GATED, DEFAULT]) {
      await setDoc(doc(db, `classes/${classId}/roster/ann`), {
        displayName: 'ann', joinedAt: new Date(), lastActiveAt: new Date(),
        joinCode: CODE, schemaVersion: 1,
      });
    }
    await setDoc(doc(db, `classes/${GATED}/assignments/open`), assignment());
    await setDoc(doc(db, `classes/${GATED}/assignments/shut`), assignment({ closed: true }));
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

function event(classId, type, unit, payload, uid = 'ann') {
  return setDoc(
    doc(as(uid), `classes/${classId}/roster/ann/events/${type}-${unit}-${Math.random()}`),
    {
      type, lessonPath: '', unit, at: serverTimestamp(), payload, schemaVersion: 1,
    }
  );
}

const testPayload = (unit) => ({ unit, score: 80, total: 100, attempt: 1, durationSec: 600 });
const quizPayload = (assignmentId) => ({
  assignmentId, unit: 1, score: 80, correct: 4, total: 5, attempt: 1,
});

describe('a test the teacher has not opened cannot be handed in', () => {
  it('accepts a test the teacher opened', async () => {
    await assertSucceeds(event(GATED, 'test.submitted', 2, testPayload(2)));
  });

  it('refuses a test the teacher has not opened, unit 1 included', async () => {
    // Unit 1 is the case the teacher asked about: its lessons are always open,
    // and the test must still be holdable shut.
    await assertFails(event(GATED, 'test.submitted', 1, testPayload(1)));
    await assertFails(event(GATED, 'test.submitted', 3, testPayload(3)));
  });

  it('still records that a student opened a shut test', async () => {
    // test.started is a record of what happened, not credit.
    await assertSucceeds(event(GATED, 'test.started', 3, { unit: 3 }));
  });

  it('changes nothing for a class that never set it', async () => {
    await assertSucceeds(event(DEFAULT, 'test.submitted', 1, testPayload(1)));
    await assertSucceeds(event(DEFAULT, 'test.submitted', 7, testPayload(7)));
  });
});

describe('only a teacher sets the test gate, and only to something sane', () => {
  it('lets the teacher hold tests shut and open them one by one', async () => {
    await assertSucceeds(updateDoc(doc(as('teacher'), `classes/${DEFAULT}`),
      { testGate: 'manual', openTests: [1, 4] }));
    await assertSucceeds(updateDoc(doc(as('teacher'), `classes/${GATED}`),
      { testGate: 'unit' }));
  });

  it('refuses a mode it does not know', async () => {
    await assertFails(updateDoc(doc(as('teacher'), `classes/${DEFAULT}`),
      { testGate: 'open-everything' }));
  });

  it('refuses an open list that is not a list', async () => {
    await assertFails(updateDoc(doc(as('teacher'), `classes/${DEFAULT}`),
      { openTests: 'all' }));
  });

  it('does not let a student open a test for themselves', async () => {
    await assertFails(updateDoc(doc(as('ann'), `classes/${GATED}`),
      { openTests: [1, 2, 3] }));
  });
});

describe('a closed quiz cannot be handed in', () => {
  it('accepts a quiz that is open', async () => {
    await assertSucceeds(event(GATED, 'quiz.submitted', 1, quizPayload('open')));
  });

  it('refuses a quiz the teacher closed', async () => {
    await assertFails(event(GATED, 'quiz.submitted', 1, quizPayload('shut')));
  });

  it('still accepts a quiz whose assignment has been removed', async () => {
    await assertSucceeds(event(GATED, 'quiz.submitted', 1, quizPayload('gone')));
  });

  it('lets the teacher close and reopen a quiz', async () => {
    const ref = doc(as('teacher'), `classes/${GATED}/assignments/open`);
    await assertSucceeds(updateDoc(ref, { closed: true }));
    await assertSucceeds(updateDoc(ref, { closed: false }));
  });

  it('refuses a closed flag that is not a boolean', async () => {
    await assertFails(updateDoc(doc(as('teacher'), `classes/${GATED}/assignments/open`),
      { closed: 'yes' }));
  });

  it('does not let a student reopen a quiz', async () => {
    await assertFails(updateDoc(doc(as('ann'), `classes/${GATED}/assignments/shut`),
      { closed: false }));
  });
});
