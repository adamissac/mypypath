import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import fs from 'node:fs';

let env;
const timezone = 'America/New_York';
const as = (uid) => env.authenticatedContext(uid).firestore();
const classRef = (uid = 'teacher') => doc(as(uid), 'classes/room');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-class-timezone-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  // Use the actual creation rules, including the timezone createClass writes.
  await assertSucceeds(setDoc(classRef(), {
    name: 'Period 1', joinCode: 'ABC234', teacherUids: ['teacher'],
    createdAt: serverTimestamp(), archived: false, schemaVersion: 1, timezone,
  }));
});

describe('classes created with a timezone remain usable', () => {
  it.each([
    ['lessons', { units: [], lessonPaths: ['/units/unit-1/what-is-python.html'] }],
    ['whole units', { units: [1], lessonPaths: [] }],
    ['quiz', { units: [], lessonPaths: [], quiz: {
      unit: 1, questionIds: ['q1'], passMark: 70, attempts: 0,
    } }],
  ])('allows assigning %s after opening the target unit', async (_label, targets) => {
    // createAssignment widens class access before publishing the assignment.
    await assertSucceeds(updateDoc(classRef(), { assignmentUnlocks: [1] }));
    const ref = doc(as('teacher'), 'classes/room/assignments/work');
    await assertSucceeds(setDoc(ref, {
      title: 'Introduction to Python', dueAt: Date.now() + 86400000,
      ...targets, createdAt: serverTimestamp(), archived: false, schemaVersion: 1,
    }));
    expect((await getDoc(ref)).data().title).toBe('Introduction to Python');
    await assertSucceeds(updateDoc(classRef(), { assignmentUnlocks: arrayUnion(2) }));
    expect((await getDoc(classRef())).data().assignmentUnlocks).toEqual([1, 2]);
  });

  it.each([
    ['rename', { name: 'Period 2' }],
    ['archive', { archived: true }],
    ['rotate join code', { joinCode: 'DEF678' }],
    ['co-teacher', { teacherUids: ['teacher', 'colleague'] }],
    ['unit access', { lockMode: 'manual', manualUnlocks: [1, 2] }],
    ['solutions', { showSolutions: false }],
    ['test attempts', { maxTestAttempts: 2 }],
    ['assignment backfill', { assignmentUnlocks: [] }],
  ])('allows %s while preserving the timezone', async (_label, patch) => {
    await assertSucceeds(updateDoc(classRef(), patch));
    expect((await getDoc(classRef())).data()).toMatchObject({ ...patch, timezone });
  });

  it.each(['student', 'stranger'])('still denies class changes by %s', async (uid) => {
    await assertFails(updateDoc(classRef(uid), { assignmentUnlocks: [1] }));
  });

  it.each([42, null, 'x'.repeat(65)])('rejects an invalid timezone: %s', async (value) => {
    await assertFails(updateDoc(classRef(), { timezone: value }));
  });

  it('still rejects unknown fields', async () => {
    await assertFails(updateDoc(classRef(), { unexpected: true }));
  });
});
