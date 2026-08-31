import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

/* The unit lock, on the side that actually enforces it.
 *
 * Before this the events rule checked an event's shape and never its unit, so
 * a student could write a passing test.submitted or unit.completed for any
 * unit at all, locked or not, and the class's lock mode was a suggestion the
 * client made and nothing more.
 *
 * What is under test, precisely: a class whose teacher chose "by hand" refuses
 * credit for a unit the teacher did not tick. That is the mode where the
 * inputs are teacher-written -- lockMode, manualUnlocks and assignmentUnlocks
 * all live on the class document, which a student cannot write -- and it is
 * therefore the only one where a rule can be a real barrier. Sequential asks
 * whether the student finished the previous unit, and only the student's own
 * browser can answer that, so it is deliberately not enforced here and there
 * is a test below pinning that as a decision rather than an oversight.
 */

let env;

const LOCKED_CLASS = 'byHand';        // manual mode, unit 3 shut
const OPEN_CLASS = 'openClass';       // free mode
const CHAIN_CLASS = 'chainClass';     // sequential mode
const LEGACY_CLASS = 'legacyClass';   // manual mode, never migrated
const CODE = 'ABC234';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-unit-lock-rules-test',
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

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Units 1 and 4 open by the teacher's hand, unit 5 open because work was
    // set on it. Unit 3 is shut, and is what most of these ask about.
    await setDoc(doc(db, `classes/${LOCKED_CLASS}`), klass({
      lockMode: 'manual', manualUnlocks: [4], assignmentUnlocks: [5],
    }));
    await setDoc(doc(db, `classes/${OPEN_CLASS}`), klass({
      lockMode: 'free', manualUnlocks: [], assignmentUnlocks: [],
    }));
    await setDoc(doc(db, `classes/${CHAIN_CLASS}`), klass({
      lockMode: 'sequential', manualUnlocks: [], assignmentUnlocks: [],
    }));
    // No assignmentUnlocks field at all: a class whose teacher has not opened
    // their dashboard since this shipped.
    await setDoc(doc(db, `classes/${LEGACY_CLASS}`), klass({
      lockMode: 'manual', manualUnlocks: [4],
    }));

    for (const classId of [LOCKED_CLASS, OPEN_CLASS, CHAIN_CLASS, LEGACY_CLASS]) {
      await setDoc(doc(db, `classes/${classId}/roster/ann`), {
        displayName: 'ann', joinedAt: new Date(), lastActiveAt: new Date(),
        joinCode: CODE, schemaVersion: 1,
      });
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

/* An event shaped the way classroom-store.js writes them. */
function event(type, unit, payload) {
  return {
    type,
    lessonPath: unit ? `/units/unit-${unit}/lesson.html` : '',
    unit,
    at: serverTimestamp(),
    payload: payload || { unit },
    schemaVersion: 1,
  };
}

function write(classId, type, unit, payload) {
  return setDoc(
    doc(as('ann'), `classes/${classId}/roster/ann/events/${type}-${unit}`),
    event(type, unit, payload)
  );
}

describe('a student in a by-hand class, on a unit the teacher shut', () => {
  it('cannot record a passing test for it', async () => {
    await assertFails(write(LOCKED_CLASS, 'test.submitted', 3,
      { unit: 3, score: 100, total: 100, attempt: 1, durationSec: 60 }));
  });

  it('cannot record the unit as completed', async () => {
    await assertFails(write(LOCKED_CLASS, 'unit.completed', 3, { unit: 3, verified: true }));
  });

  it('cannot record its exercise checks as passing', async () => {
    await assertFails(write(LOCKED_CLASS, 'code.tests_passed', 3,
      { lessonPath: '/units/unit-3/lesson.html', editorId: 'ex1', passed: 3, total: 3 }));
  });

  it('may still record that they opened and read it', async () => {
    // Refusing this would make the log lie about a thing the student did, and
    // the lock was never about stopping anyone reading ahead.
    await assertSucceeds(write(LOCKED_CLASS, 'lesson.opened', 3,
      { lessonPath: '/units/unit-3/lesson.html', unit: 3 }));
  });

  it('may still record running code in it', async () => {
    await assertSucceeds(write(LOCKED_CLASS, 'code.run', 3,
      { lessonPath: '/units/unit-3/lesson.html', editorId: 'ex1', ok: true }));
  });
});

describe('a student in a by-hand class, on a unit that is open to them', () => {
  it('may complete unit 1, which is open in every mode', async () => {
    await assertSucceeds(write(LOCKED_CLASS, 'unit.completed', 1, { unit: 1, verified: true }));
  });

  it('may complete a unit the teacher ticked', async () => {
    await assertSucceeds(write(LOCKED_CLASS, 'unit.completed', 4, { unit: 4, verified: true }));
  });

  it('may complete a unit held open because work was set on it', async () => {
    // Nobody may be marked late for work they could not do.
    await assertSucceeds(write(LOCKED_CLASS, 'test.submitted', 5,
      { unit: 5, score: 90, total: 100, attempt: 1, durationSec: 60 }));
  });

  it('is let through the moment the teacher ticks the unit', async () => {
    await assertFails(write(LOCKED_CLASS, 'unit.completed', 3, { unit: 3, verified: true }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `classes/${LOCKED_CLASS}`), { manualUnlocks: [3, 4] });
    });
    await assertSucceeds(setDoc(
      doc(as('ann'), `classes/${LOCKED_CLASS}/roster/ann/events/second`),
      event('unit.completed', 3, { unit: 3, verified: true })
    ));
  });
});

describe('the modes that have nothing for a rule to enforce', () => {
  it('an open class accepts any unit', async () => {
    await assertSucceeds(write(OPEN_CLASS, 'unit.completed', 9, { unit: 9, verified: true }));
  });

  it('an in-order class accepts any unit, which is the documented gap', async () => {
    /* Not an oversight. Sequential asks whether this student finished unit 8,
       and the only record of that is one the student's own browser writes --
       their progress mirror, or their own earlier unit.completed events. A
       rule consulting either would be asking the student for permission. With
       no Cloud Functions in this project there is nowhere a trustworthy answer
       could come from, so the chain stays client-side and this is written down
       rather than papered over. */
    await assertSucceeds(write(CHAIN_CLASS, 'unit.completed', 9, { unit: 9, verified: true }));
  });

  it('a class whose unlock list was never written is permitted, not refused', async () => {
    /* The transitional state. This rule cannot see which units the class's
       assignments hold open until the teacher's dashboard writes the list, and
       class-policy.js falls back to deriving the same answer for the same
       class -- so both sides agree that nothing is enforced yet. A student
       refused a write for a unit their own page said was open would be a worse
       failure than a lock that starts a day late. */
    await assertSucceeds(write(LEGACY_CLASS, 'unit.completed', 3, { unit: 3, verified: true }));
  });
});

describe('a student cannot unlock themselves', () => {
  it('cannot write the class document at all', async () => {
    await assertFails(updateDoc(doc(as('ann'), `classes/${LOCKED_CLASS}`), { manualUnlocks: [3] }));
  });

  it('cannot open a unit by widening the assignment list', async () => {
    await assertFails(updateDoc(doc(as('ann'), `classes/${LOCKED_CLASS}`),
      { assignmentUnlocks: [3, 5] }));
  });

  it('cannot lift their own retake cap', async () => {
    await assertFails(updateDoc(doc(as('ann'), `classes/${LOCKED_CLASS}`),
      { maxTestAttempts: null }));
  });
});

describe('the class settings a teacher may write', () => {
  it('lets a teacher store the assignment unlock list', async () => {
    await assertSucceeds(updateDoc(doc(as('teacher'), `classes/${LOCKED_CLASS}`),
      { assignmentUnlocks: [5, 6] }));
  });

  it('lets a teacher set and clear a retake cap', async () => {
    await assertSucceeds(updateDoc(doc(as('teacher'), `classes/${LOCKED_CLASS}`),
      { maxTestAttempts: 3 }));
    await assertSucceeds(updateDoc(doc(as('teacher'), `classes/${LOCKED_CLASS}`),
      { maxTestAttempts: null }));
  });

  it('refuses a cap that would lock the class out of every test', async () => {
    await assertFails(updateDoc(doc(as('teacher'), `classes/${LOCKED_CLASS}`),
      { maxTestAttempts: 0 }));
    await assertFails(updateDoc(doc(as('teacher'), `classes/${LOCKED_CLASS}`),
      { maxTestAttempts: -1 }));
  });

  it('refuses a cap stored as a string, which reads as zero to some clients', async () => {
    await assertFails(updateDoc(doc(as('teacher'), `classes/${LOCKED_CLASS}`),
      { maxTestAttempts: '3' }));
  });

  it('refuses an absurd cap rather than storing it', async () => {
    await assertFails(updateDoc(doc(as('teacher'), `classes/${LOCKED_CLASS}`),
      { maxTestAttempts: 100000 }));
  });

  it("denies another class's teacher touching these settings", async () => {
    await assertFails(updateDoc(doc(as('someoneElse'), `classes/${LOCKED_CLASS}`),
      { manualUnlocks: [3] }));
  });
});
