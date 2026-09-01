import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

/* Teacher-assignable quizzes, on the side that actually enforces anything.
 *
 * Two claims are under test and they are different sizes.
 *
 * The real one: a quiz submission is graded work, so `quiz.submitted` joins
 * countsForCredit() and the rules refuse it for a unit a by-hand class has not
 * opened. That is a genuine server-side barrier, because the inputs -- the
 * class's lockMode, manualUnlocks and assignmentUnlocks -- are teacher-written
 * and a student cannot touch them.
 *
 * The smaller one: the quiz map on an assignment document is bounded. That
 * document is read by every student in the class, so an unbounded blob written
 * there is an unbounded blob delivered to everybody's page.
 *
 * What is deliberately NOT tested here, because it is not enforced and the
 * code says so: the score, and how many attempts a student has had. Both are
 * counted in the student's own browser. A quiz mark is a record of what the
 * site saw, not a proctored result.
 */

let env;

const LOCKED_CLASS = 'byHand';   // manual mode; unit 2 open, unit 3 shut
const OPEN_CLASS = 'openClass';  // free mode
const CODE = 'ABC234';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-quiz-rules-test',
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
    await setDoc(doc(db, `classes/${LOCKED_CLASS}`), klass({
      lockMode: 'manual', manualUnlocks: [2], assignmentUnlocks: [],
    }));
    await setDoc(doc(db, `classes/${OPEN_CLASS}`), klass({
      lockMode: 'free', manualUnlocks: [], assignmentUnlocks: [],
    }));
    for (const classId of [LOCKED_CLASS, OPEN_CLASS]) {
      await setDoc(doc(db, `classes/${classId}/roster/ann`), {
        displayName: 'ann', joinedAt: new Date(), lastActiveAt: new Date(),
        joinCode: CODE, schemaVersion: 1,
      });
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

function submitQuiz(classId, unit, payload, uid = 'ann') {
  return setDoc(
    doc(as(uid), `classes/${classId}/roster/ann/events/quiz-${unit}-${Math.random()}`),
    {
      type: 'quiz.submitted',
      lessonPath: '',
      unit,
      at: serverTimestamp(),
      payload: payload || {
        assignmentId: 'a1', unit, score: 80, correct: 4, total: 5, attempt: 1,
      },
      schemaVersion: 1,
    }
  );
}

function assignment(extra) {
  return {
    title: 'Loops check',
    units: [],
    lessonPaths: [],
    dueAt: Date.now() + 86400000,
    createdAt: serverTimestamp(),
    archived: false,
    schemaVersion: 1,
    ...extra,
  };
}

const goodQuiz = { unit: 2, questionIds: ['q2-match-1'], passMark: 70, attempts: 0 };

function setAssignment(quiz, extra) {
  return setDoc(
    doc(as('teacher'), `classes/${LOCKED_CLASS}/assignments/a1`),
    assignment({ ...(quiz ? { quiz } : {}), ...(extra || {}) })
  );
}

describe('a quiz submission is graded work, and the unit lock applies', () => {
  it('is accepted for a unit the teacher has opened', async () => {
    await assertSucceeds(submitQuiz(LOCKED_CLASS, 2));
  });

  it('is refused for a unit the teacher has not opened', async () => {
    // The whole point of putting quiz.submitted in countsForCredit(). Without
    // it a student could bank a mark on a unit their class never opened.
    await assertFails(submitQuiz(LOCKED_CLASS, 3));
  });

  it('is accepted anywhere when the class is in open mode', async () => {
    await assertSucceeds(submitQuiz(OPEN_CLASS, 7));
  });

  it('cannot be written by the teacher into the student\'s log', async () => {
    // Same rule the rest of the event log has: a record a teacher can forge is
    // worth nothing as a record.
    await assertFails(submitQuiz(LOCKED_CLASS, 2, null, 'teacher'));
  });

  it('cannot be written by somebody not in the class', async () => {
    await assertFails(setDoc(
      doc(as('stranger'), `classes/${LOCKED_CLASS}/roster/ann/events/e1`),
      {
        type: 'quiz.submitted', lessonPath: '', unit: 2, at: serverTimestamp(),
        payload: { assignmentId: 'a1', unit: 2, score: 100, correct: 5, total: 5, attempt: 1 },
        schemaVersion: 1,
      }
    ));
  });

  it('is refused if the type is misspelled', async () => {
    await assertFails(setDoc(
      doc(as('ann'), `classes/${LOCKED_CLASS}/roster/ann/events/e2`),
      {
        type: 'quiz.submit', lessonPath: '', unit: 2, at: serverTimestamp(),
        payload: {}, schemaVersion: 1,
      }
    ));
  });

  it('is refused if the client backdates it', async () => {
    // at == request.time is what makes "submitted late" mean anything, and
    // lateness is the thing this whole feature reports.
    await assertFails(setDoc(
      doc(as('ann'), `classes/${LOCKED_CLASS}/roster/ann/events/e3`),
      {
        type: 'quiz.submitted', lessonPath: '', unit: 2,
        at: new Date(Date.now() - 86400000),
        payload: { assignmentId: 'a1', unit: 2, score: 80, correct: 4, total: 5, attempt: 1 },
        schemaVersion: 1,
      }
    ));
  });
});

describe('the quiz on an assignment is bounded, because every student reads it', () => {
  it('a teacher may set a well-formed quiz', async () => {
    await assertSucceeds(setAssignment(goodQuiz));
  });

  it('a quiz may be the only thing an assignment requires', async () => {
    // No units and no lessons: previously that was a row nothing could satisfy
    // and the rule refused it. A quiz is a third way to require something.
    await assertSucceeds(setAssignment(goodQuiz, { units: [], lessonPaths: [] }));
  });

  it('an assignment requiring nothing at all is still refused', async () => {
    await assertFails(setAssignment(null));
  });

  it('refuses more questions than a quiz can hold', async () => {
    const tooMany = { ...goodQuiz, questionIds: Array.from({ length: 26 }, (_, i) => 'q' + i) };
    await assertFails(setAssignment(tooMany));
  });

  it('refuses an empty question list', async () => {
    await assertFails(setAssignment({ ...goodQuiz, questionIds: [] }));
  });

  it('refuses a unit outside the course', async () => {
    await assertFails(setAssignment({ ...goodQuiz, unit: 0 }));
    await assertFails(setAssignment({ ...goodQuiz, unit: 11 }));
  });

  it('refuses a pass mark that is not a mark', async () => {
    await assertFails(setAssignment({ ...goodQuiz, passMark: 101 }));
    await assertFails(setAssignment({ ...goodQuiz, passMark: -1 }));
  });

  it('refuses an attempt cap outside its range', async () => {
    await assertFails(setAssignment({ ...goodQuiz, attempts: 11 }));
    await assertFails(setAssignment({ ...goodQuiz, attempts: -1 }));
  });

  it('refuses a field nobody declared', async () => {
    await assertFails(setAssignment({ ...goodQuiz, secretPayload: 'x'.repeat(10000) }));
  });

  it('refuses a quiz that is not a map at all', async () => {
    await assertFails(setAssignment('not a map'));
  });

  it('a student cannot set one', async () => {
    // An assignment a student can edit is not an assignment.
    await assertFails(setDoc(
      doc(as('ann'), `classes/${LOCKED_CLASS}/assignments/a2`),
      assignment({ quiz: goodQuiz })
    ));
  });

  it('a student may still read one, because their own page shows what is due', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `classes/${LOCKED_CLASS}/assignments/a1`),
        assignment({ quiz: goodQuiz, createdAt: new Date() }));
    });
    const { getDoc } = await import('firebase/firestore');
    await assertSucceeds(getDoc(doc(as('ann'), `classes/${LOCKED_CLASS}/assignments/a1`)));
  });
});

describe('the three angles the retake cap already uses', () => {
  /* The same coverage maxTestAttempts and the unit lock have, applied to the
     thing a quiz actually gates on. A quiz does not inherit maxTestAttempts --
     that setting's own copy says "end-of-unit test" -- so the cap here is the
     quiz's own, and it is client-side like every other cap in this app. What
     the rules gate is the unit. */

  it('blocked: a shut unit refuses the mark', async () => {
    await assertFails(submitQuiz(LOCKED_CLASS, 3));
  });

  it('allowed: an open unit takes it', async () => {
    await assertSucceeds(submitQuiz(LOCKED_CLASS, 2));
  });

  it('self-study: no class, so no by-hand lock to apply', async () => {
    /* A learner with no teacher writes nothing to any class, which is exactly
       why they are unaffected: this collection only exists under a class. The
       claim being pinned is that they are untouched rather than quietly
       blocked, and the evidence is that there is no path here for them at all.
    */
    await assertFails(setDoc(
      doc(as('solo'), `classes/${LOCKED_CLASS}/roster/solo/events/e1`),
      {
        type: 'quiz.submitted', lessonPath: '', unit: 2, at: serverTimestamp(),
        payload: { assignmentId: 'a1', unit: 2, score: 90, correct: 5, total: 5, attempt: 1 },
        schemaVersion: 1,
      }
    ));
  });

  it('the cap the rules do NOT enforce is named in the rules file', async () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    const note = rules.slice(rules.indexOf('The types whose unit is checked'),
      rules.indexOf('function unitAllowed'));
    expect(note).toMatch(/cannot check/);
    expect(note).toMatch(/not a proctored result/);
  });
});
