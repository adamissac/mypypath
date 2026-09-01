#!/usr/bin/env node
/* Seed a realistic class into the Firebase emulators.
 *
 * WHY THIS EXISTS. The teacher dashboard is the one screen in this project that
 * cannot be judged empty. Every panel on it -- needs-attention, the mastery
 * grid, the roster, assignments, certificates, both exports -- is a summary of
 * a class that has done some work, and with no students it renders as a page of
 * empty states that says nothing about whether the summaries are any good.
 * Nobody should be finding that out for the first time in front of a partner.
 *
 * WHERE IT WRITES. The emulators, and only the emulators. Two reasons this is
 * not a production tool:
 *
 *   - firebase-config.js already points the site at the emulators on
 *     localhost, so a seeded emulator plus `npm run serve` gives the real
 *     dashboard, running the real code, over invented data.
 *   - Seeding production would put invented students in a real teacher's
 *     class, create real auth accounts, and leave a cleanup job behind. A demo
 *     is not worth that, and the emulator tests the identical code path.
 *
 * The guard below refuses to run against anything but 127.0.0.1 rather than
 * trusting an environment variable to be right.
 *
 * HOW IT WRITES. The emulators' own REST APIs, with `Authorization: Bearer
 * owner`, which bypasses firestore.rules. That is deliberate and is the only
 * way to write a plausible history: the rules pin every event's `at` to
 * request.time, so a client-side seeder could only ever produce a class that
 * did everything in the last few seconds -- no idle student, no overdue
 * assignment, no "last active 12 days ago", which are exactly the states worth
 * looking at.
 *
 * It also means this script proves nothing about the rules. It is a fixture,
 * not a test. tests/rules/ is where the rules are argued with.
 *
 * Usage:
 *   npx firebase emulators:start --only auth,firestore     # terminal 1
 *   node scripts/seed-classroom.mjs                        # terminal 2
 *   npm run serve  ->  http://localhost:8080/classroom.html
 */

const PROJECT = 'mypypath';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8081';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

const TEACHER_EMAIL = 'teacher@pypath.test';
const PASSWORD = 'pypath123';
const CLASS_NAME = 'Period 3 — Intro to Python';
const JOIN_CODE = 'DEMO24';

const DAY = 86400000;
const NOW = Date.now();
const ago = (days) => NOW - Math.round(days * DAY);

/* ------------------------------------------------------------ the wire */

function refuseNonLocal() {
  for (const url of [AUTH, FIRESTORE]) {
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`Refusing to seed ${host}: this script is emulator-only.`);
    }
  }
}

/* Firestore's REST API is typed, so a plain object has to be told what its
   values are. Numbers are the trap: JavaScript has one number type and
   Firestore has two, and a score written as a double reads back as 88.0 in
   places that string-concatenate it. Integers stay integers. */
function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encode) } };
  }
  return { mapValue: { fields: fields(value) } };
}

function fields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = encode(v);
  return out;
}

async function put(path, data) {
  const at = path.lastIndexOf('/');
  const parent = path.slice(0, at);
  const id = path.slice(at + 1);
  const res = await fetch(`${DOCS}/${parent}?documentId=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: fields(data) }),
  });
  if (res.ok) return;
  // A rerun should be idempotent rather than a wall of 409s.
  if (res.status === 409) {
    const patch = await fetch(`${DOCS}/${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields: fields(data) }),
    });
    if (patch.ok) return;
    throw new Error(`PATCH ${path} -> ${patch.status} ${await patch.text()}`);
  }
  throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
}

async function createUser(email, displayName) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, displayName, returnSecureToken: true }),
    }
  );
  const body = await res.json();
  if (body.error) {
    if (String(body.error.message).includes('EMAIL_EXISTS')) {
      // Reuse the account so the script can be run twice.
      const look = await fetch(
        `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
        }
      );
      const found = await look.json();
      if (found.localId) return found.localId;
    }
    throw new Error(`${email}: ${body.error.message}`);
  }
  return body.localId;
}

async function reachable() {
  try {
    await fetch(`${FIRESTORE}/`, { method: 'GET' });
    await fetch(`${AUTH}/`, { method: 'GET' });
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------- the curriculum */

/* Read from curriculum.js rather than typed out here.
 *
 * The first version of this script hand-listed the lesson slugs, and seven of
 * them were wrong -- 'if-statements', 'while-loops' and friends are plausible
 * names for lessons this course does not have. The dashboard did exactly what
 * it should with them: unresolvable paths appeared raw in the attention list
 * instead of as titles, and completion was measured against lessons nobody
 * could ever finish. A fixture that quietly disagrees with the curriculum is
 * worse than an empty one, because everything it produces looks plausible.
 *
 * curriculum.js is a browser IIFE that hangs its data off `window`, so it gets
 * a one-property window to hang it off. That keeps this in step with the real
 * course for free: a lesson renamed there is renamed here on the next run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadCurriculum() {
  const src = readFileSync(join(ROOT, 'assets/js/curriculum.js'), 'utf8');
  const sandbox = {};
  new Function('window', src)(sandbox);
  if (!sandbox.PyPathCurriculum) {
    throw new Error('curriculum.js did not define PyPathCurriculum');
  }
  return sandbox.PyPathCurriculum;
}

const CURRICULUM = loadCurriculum();

// Only the units the seeded class has actually reached. Paths come back whole,
// so there is no slug to get wrong.
const LESSONS = {};
for (let u = 1; u <= 4; u += 1) LESSONS[u] = CURRICULUM.lessonsIn(u);

const pathFor = (unit, i) => LESSONS[unit][i];

/* ------------------------------------------------------------ the class */

/* Fourteen students, written as profiles rather than as random noise.
 *
 * Random data produces a dashboard that looks busy and says nothing. Every
 * panel here is meant to have something worth reading in it, so each profile
 * exists to light one up: someone the attention list should catch, someone it
 * should not, an idle account, a certificate waiting on a decision, a student
 * who is late on set work and one who was on time.
 */
const STUDENTS = [
  { name: 'Ada Nwosu', units: 4, into: 2, lastSeen: 0.2, kind: 'ahead' },
  { name: 'Malik Rahman', units: 4, into: 1, lastSeen: 0.5, kind: 'ahead' },
  { name: 'Priya Sharma', units: 3, into: 4, lastSeen: 0.8, kind: 'ahead' },
  { name: 'Jonas Berg', units: 2, into: 5, lastSeen: 1.1, kind: 'ontrack' },
  { name: 'Chloe Martin', units: 2, into: 3, lastSeen: 1.4, kind: 'ontrack' },
  { name: 'Diego Alvarez', units: 2, into: 2, lastSeen: 2.0, kind: 'ontrack' },
  { name: 'Yuki Tanaka', units: 2, into: 1, lastSeen: 2.3, kind: 'ontrack' },
  { name: 'Sam Okafor', units: 1, into: 4, lastSeen: 3.1, kind: 'behind' },
  { name: 'Lena Fischer', units: 1, into: 2, lastSeen: 4.0, kind: 'behind' },
  { name: 'Tom Whitfield', units: 0, into: 5, lastSeen: 2.6, kind: 'stuck' },
  { name: 'Aisha Bello', units: 0, into: 3, lastSeen: 1.9, kind: 'stuck' },
  { name: 'Ravi Menon', units: 1, into: 1, lastSeen: 12.0, kind: 'idle' },
  { name: 'Grace Lin', units: 2, into: 4, lastSeen: 0.9, kind: 'flagged' },
  { name: 'Noah Petersen', units: 4, into: 10, lastSeen: 0.4, kind: 'finished' },
];

let eventSeq = 0;

/* How often each kind of student passes an exercise on the first go.
 *
 * This is the number the attention list actually reads. attemptsByExercise()
 * counts code.run, answer.submitted and code.tests_passed together, and marks
 * a first-try pass only when the pass is the FIRST of those for that exercise
 * -- which is what a student who clicks Check and gets it right produces,
 * since check-ui.js emits code.tests_passed without a code.run in front of it.
 *
 * Getting this wrong is not cosmetic. The first version of this script emitted
 * code.run before every pass, so nobody in the class had a first-try pass at
 * all, and the attention list filled with "Ada Nwosu: passing 0% of Unit 1
 * exercises on the first try" for a student who had finished four units with
 * high marks. A fixture that libels the strongest student in the room is worse
 * than no fixture: it would have sent someone looking for a bug in the
 * dashboard, which was reading its input correctly.
 *
 * Below STRUGGLE_RATE (0.5) a unit raises a row, so `behind` and `stuck` sit
 * under it on purpose and everyone else sits above it.
 */
const FIRST_TRY = {
  ahead: 0.85, ontrack: 0.65, behind: 0.4, stuck: 0.25,
  idle: 0.6, flagged: 0.7, finished: 0.8,
};

// Deterministic, so two runs of this script produce the same class and a
// screenshot taken today still matches the data tomorrow.
function passesFirstTry(profile, unit, i) {
  const seed = (profile.name.charCodeAt(0) * 31 + unit * 17 + i * 7) % 100;
  return seed < Math.round(FIRST_TRY[profile.kind] * 100);
}

function makeEvents(profile) {
  const out = [];
  const at = (days) => new Date(ago(days));
  const push = (type, days, extra) => out.push({ type, at: at(days), ...extra });

  /* The clock walks backwards from the student's most recent activity, so the
     newest event lands exactly on profile.lastSeen.

     It used to start at lastSeen + 26 and decrement, which put the last event
     weeks before the roster's lastActiveAt -- the roster said Ravi was here 12
     days ago and the attention list, which reads events, said 34. Two panels on
     one page disagreeing about the same student is precisely the bug a fixture
     is supposed to help you notice, not cause. */
  const STEP = 0.35;
  const worked = LESSONS[1].length * Math.min(profile.units, 1)
    + [2, 3, 4].reduce((n, u) => n + (profile.units >= u ? LESSONS[u].length : 0), 0)
    + profile.into;
  let clock = profile.lastSeen + worked * STEP;

  /* One worked exercise.
   *
   * First try: the pass is the first event for that exercise, which is what
   * clicking Check and getting it right looks like.
   * Otherwise: runs and errors first, then the pass -- the same shape as a
   * student who kept trying until it worked. */
  function exercise(unit, i, firstTry) {
    const p = pathFor(unit, i);
    clock -= STEP;
    push('lesson.opened', clock, { lessonPath: p, unit, payload: { lessonPath: p, unit } });
    if (!firstTry) {
      const tries = 1 + ((i + unit) % 3);
      for (let a = 0; a < tries; a += 1) {
        push('code.run', clock, { lessonPath: p, unit, payload: { lessonPath: p, editorId: 'ex1', ok: false } });
        push('code.error', clock, {
          lessonPath: p, unit,
          payload: { lessonPath: p, editorId: 'ex1', errorType: a % 2 ? 'NameError' : 'SyntaxError' },
        });
      }
    }
    push('code.tests_passed', clock, {
      lessonPath: p, unit, payload: { lessonPath: p, editorId: 'ex1', passed: 3, total: 3 },
    });
  }

  // Whole units, finished.
  for (let unit = 1; unit <= profile.units; unit += 1) {
    LESSONS[unit].forEach((_, i) => exercise(unit, i, passesFirstTry(profile, unit, i)));
    const score = 70 + ((profile.name.length * (unit + 3)) % 28);
    push('test.started', clock, { unit, payload: { unit } });
    push('test.submitted', clock, {
      unit, payload: { unit, score, total: 100, attempt: 1, durationSec: 900 + unit * 60 },
    });
    push('unit.completed', clock, { unit, payload: { unit, verified: true } });
  }

  // The unit they are part-way through.
  const unit = Math.min(profile.units + 1, 4);
  for (let i = 0; i < profile.into && i < LESSONS[unit].length; i += 1) {
    if (profile.kind === 'stuck' && i === profile.into - 1) {
      /* The "stuck" row: more than STUCK_ATTEMPTS goes at one exercise with no
         pass at the end of it. Written as a real sequence rather than one event
         carrying a big number, because a sequence is what the reader counts. */
      const p = pathFor(unit, i);
      clock -= STEP;
      push('lesson.opened', clock, { lessonPath: p, unit, payload: { lessonPath: p, unit } });
      for (let a = 0; a < 6; a += 1) {
        push('code.run', clock, { lessonPath: p, unit, payload: { lessonPath: p, editorId: 'ex1', ok: false } });
        push('code.error', clock, {
          lessonPath: p, unit,
          payload: { lessonPath: p, editorId: 'ex1', errorType: a % 2 ? 'IndentationError' : 'TypeError' },
        });
      }
    } else {
      exercise(unit, i, passesFirstTry(profile, unit, i));
    }
  }

  // A sitting under the mark, so the grid and the end-of-unit card have a
  // below-70 in them rather than only clean passes.
  if (profile.kind === 'behind' || profile.kind === 'stuck') {
    const next = Math.min(profile.units + 1, 4);
    push('test.started', profile.lastSeen + 1.2, { unit: next, payload: { unit: next } });
    push('test.submitted', profile.lastSeen + 1.1, {
      unit: next,
      payload: { unit: next, score: 42 + (profile.name.length % 20), total: 100, attempt: 1, durationSec: 780 },
    });
  }

  /* The written-answer flag needs AI_FLAG_RUN (3) answers that missed the
     lesson's own concepts. It is a word check and the dashboard says so; this
     gives that panel one row to show. */
  if (profile.kind === 'flagged') {
    for (let i = 0; i < 4; i += 1) {
      const p = pathFor(2, i);
      push('answer.submitted', profile.lastSeen + 0.5 + i * 0.1, {
        lessonPath: p, unit: 2,
        payload: { lessonPath: p, itemId: `reflect-${i}`, missedConcepts: true },
      });
    }
  }

  return out.map((e) => ({
    id: `seed-${String(eventSeq++).padStart(5, '0')}`,
    doc: {
      type: e.type,
      lessonPath: e.lessonPath || '',
      unit: e.unit || 0,
      at: e.at,
      payload: e.payload || {},
      schemaVersion: 1,
    },
  }));
}

/* --------------------------------------------------------------- run it */

async function main() {
  refuseNonLocal();
  if (!(await reachable())) {
    console.error(
      'The emulators are not answering on 9099/8081.\n' +
      'Start them first:  npx firebase emulators:start --only auth,firestore'
    );
    process.exit(1);
  }

  console.log(`Seeding "${CLASS_NAME}" into the emulators…\n`);

  const teacherUid = await createUser(TEACHER_EMAIL, 'Ms Iyer');
  const classId = 'demo-class-01';

  await put(`classes/${classId}`, {
    name: CLASS_NAME,
    joinCode: JOIN_CODE,
    teacherUids: [teacherUid],
    createdAt: new Date(ago(30)),
    archived: false,
    schemaVersion: 1,
    lockMode: 'sequential',
    manualUnlocks: [],
    assignmentUnlocks: [2, 3],
    showSolutions: true,
    maxTestAttempts: 0,
  });
  await put(`joinCodes/${JOIN_CODE}`, {
    teacherUid, classId, active: true, createdAt: ago(30),
  });
  await put(`users/${teacherUid}`, {
    role: 'teacher', classIds: [classId], updatedAt: NOW,
  });

  // Set work, including a quiz, so the assignment column and the quiz feature
  // both have something in them.
  await put(`classes/${classId}/assignments/a-loops`, {
    title: 'Loops and conditionals',
    units: [2], lessonPaths: [], dueAt: ago(3),
    createdAt: new Date(ago(12)), archived: false, schemaVersion: 1,
  });
  await put(`classes/${classId}/assignments/a-functions`, {
    title: 'Functions practice',
    units: [3], lessonPaths: [], dueAt: NOW + 4 * DAY,
    createdAt: new Date(ago(5)), archived: false, schemaVersion: 1,
  });
  await put(`classes/${classId}/assignments/a-quiz`, {
    title: 'Quick check: loops',
    units: [], lessonPaths: [],
    quiz: {
      unit: 2,
      questionIds: ['q2-match-1', 'q2-order-1', 'q2-blank-1', 'u2-m01', 'u2-m02'],
      passMark: 70,
      attempts: 0,
    },
    dueAt: ago(1),
    createdAt: new Date(ago(6)), archived: false, schemaVersion: 1,
  });

  let events = 0;
  for (const [i, profile] of STUDENTS.entries()) {
    const email = `student${String(i + 1).padStart(2, '0')}@pypath.test`;
    const uid = await createUser(email, profile.name);

    await put(`classes/${classId}/roster/${uid}`, {
      displayName: profile.name,
      joinedAt: new Date(ago(28 - i * 0.4)),
      lastActiveAt: new Date(ago(profile.lastSeen)),
      joinCode: JOIN_CODE,
      schemaVersion: 1,
    });

    const finished = profile.kind === 'finished';
    await put(`roster/${uid}`, {
      teacherUid,
      joinCode: JOIN_CODE,
      joinedClassAt: ago(28 - i * 0.4),
      displayName: profile.name,
      completedUnits: Array.from({ length: profile.units }, (_, n) => n + 1),
      unitsCompleted: profile.units,
      // One learner waiting on a decision, so the certificate panel is a job
      // rather than an empty list.
      hasCertificate: finished,
      certificateRequestedAt: finished ? ago(2) : 0,
      certificateDecidedAt: 0,
      updatedAt: ago(profile.lastSeen),
    });
    await put(`users/${uid}`, { role: 'student', classId, updatedAt: NOW });

    for (const e of makeEvents(profile)) {
      await put(`classes/${classId}/roster/${uid}/events/${e.id}`, e.doc);
      events += 1;
    }

    // Quiz submissions for some of the class, so the quiz assignment reads as
    // partly done rather than untouched.
    if (['ahead', 'ontrack', 'flagged', 'finished'].includes(profile.kind)) {
      const score = 55 + ((profile.name.length * 7) % 45);
      await put(`classes/${classId}/roster/${uid}/events/seed-quiz-${uid}`, {
        type: 'quiz.submitted',
        lessonPath: '',
        unit: 2,
        at: new Date(ago(profile.lastSeen + 0.3)),
        payload: {
          assignmentId: 'a-quiz', unit: 2, score,
          correct: Math.round(score / 10), total: 10, attempt: 1,
        },
        schemaVersion: 1,
      });
      events += 1;
    }

    console.log(`  ${profile.name.padEnd(18)} ${String(profile.units).padStart(2)} units  ${profile.kind}`);
  }

  console.log(`\n${STUDENTS.length} students, ${events} events, 3 assignments.\n`);
  console.log('Sign in to the dashboard as:');
  console.log(`  ${TEACHER_EMAIL}  /  ${PASSWORD}`);
  console.log(`  join code: ${JOIN_CODE}`);
  console.log('\n  npm run serve   ->   http://localhost:8080/classroom.html');
  console.log('\nStudents are studentNN@pypath.test with the same password.');
}

main().catch((err) => {
  console.error('\nSeeding failed:', err.message);
  process.exit(1);
});
