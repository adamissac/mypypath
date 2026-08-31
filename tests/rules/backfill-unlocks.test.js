import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/* The one-time backfill that arms the unit lock on classes older than it.
 *
 * 47533a6 left every pre-existing class unenforced until its teacher happened
 * to open the dashboard, because the events rule permits a class with no
 * assignmentUnlocks field. This script closes that without waiting on a click,
 * so what matters is that it touches exactly the classes that need it and
 * nothing else -- a script that rewrites a teacher's correct value, or that
 * flattens a class document it only meant to add a field to, would be worse
 * than the gap it closes.
 */

const PROJECT = 'mypypath-backfill-test';
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => { await env.cleanup(); });

function klass(extra) {
  return {
    name: 'A class',
    joinCode: 'ABC234',
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

    // Never opened since 47533a6: by hand, real assignments, no field.
    await setDoc(doc(db, 'classes/needsArming'), klass({
      name: 'Needs arming', joinCode: 'AAA222', lockMode: 'manual', manualUnlocks: [2],
    }));
    await setDoc(doc(db, 'classes/needsArming/assignments/a1'), {
      title: 'Loops', units: [4], lessonPaths: ['/units/unit-6/x.html'],
      dueAt: 1, createdAt: new Date(), archived: false, schemaVersion: 1,
    });

    // A teacher's dashboard visit already wrote the right value.
    await setDoc(doc(db, 'classes/alreadyRight'), klass({
      name: 'Already right', joinCode: 'BBB333', lockMode: 'manual',
      assignmentUnlocks: [3],
    }));
    await setDoc(doc(db, 'classes/alreadyRight/assignments/a1'), {
      title: 'Functions', units: [3], lessonPaths: [],
      dueAt: 1, createdAt: new Date(), archived: false, schemaVersion: 1,
    });

    // Stored value has drifted from the assignments that actually exist.
    await setDoc(doc(db, 'classes/stale'), klass({
      name: 'Stale', joinCode: 'CCC444', lockMode: 'manual',
      assignmentUnlocks: [7, 8],
    }));
    await setDoc(doc(db, 'classes/stale/assignments/a1'), {
      title: 'Data', units: [5], lessonPaths: [],
      dueAt: 1, createdAt: new Date(), archived: false, schemaVersion: 1,
    });

    // The two modes that never consult the list.
    await setDoc(doc(db, 'classes/inOrder'), klass({
      name: 'In order', joinCode: 'DDD555', lockMode: 'sequential',
    }));
    await setDoc(doc(db, 'classes/inOrder/assignments/a1'), {
      title: 'Anything', units: [9], lessonPaths: [],
      dueAt: 1, createdAt: new Date(), archived: false, schemaVersion: 1,
    });
    await setDoc(doc(db, 'classes/openClass'), klass({
      name: 'Open', joinCode: 'EEE666', lockMode: 'free',
    }));

    // By hand with nothing set: the answer is an empty list, and writing it is
    // what arms the class. Absent and [] mean opposite things to the rule.
    await setDoc(doc(db, 'classes/noAssignments'), klass({
      name: 'No assignments', joinCode: 'FFF777', lockMode: 'manual',
    }));
  });
});

function run(...args) {
  return execFileSync('node', ['scripts/backfill-assignment-unlocks.mjs', ...args], {
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081',
      PYPATH_PROJECT: PROJECT,
    },
    encoding: 'utf8',
  });
}

async function read(id) {
  let data = null;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), `classes/${id}`));
    data = snap.exists() ? snap.data() : null;
  });
  return data;
}

describe('the dry run', () => {
  it('reports what it would do and writes nothing', async () => {
    const out = run();
    expect(out).toMatch(/dry run/);
    expect(out).toMatch(/ARM\s+Needs arming/);
    expect(out).toMatch(/Nothing was written/);
    expect((await read('needsArming')).assignmentUnlocks).toBe(undefined);
  });
});

describe('--apply touches exactly the classes that need it', () => {
  it('arms a by-hand class that has never had the field', async () => {
    run('--apply');
    // Unit 4 from units, unit 6 from the lesson path: the same resolution
    // classroom-policy.js does for the dashboard, not a second one.
    expect((await read('needsArming')).assignmentUnlocks).toEqual([4, 6]);
  });

  it('arms a by-hand class with no assignments, because absent is not empty', async () => {
    run('--apply');
    expect((await read('noAssignments')).assignmentUnlocks).toEqual([]);
  });

  it('corrects a stored list that has drifted', async () => {
    run('--apply');
    expect((await read('stale')).assignmentUnlocks).toEqual([5]);
  });

  it("leaves a teacher's already-correct value alone", async () => {
    const out = run('--apply');
    expect(out).toMatch(/ok\s+Already right/);
    expect((await read('alreadyRight')).assignmentUnlocks).toEqual([3]);
  });

  it('skips the two modes that never consult the list', async () => {
    const out = run('--apply');
    expect(out).toMatch(/skip\s+In order/);
    expect(out).toMatch(/skip\s+Open/);
    expect((await read('inOrder')).assignmentUnlocks).toBe(undefined);
    expect((await read('openClass')).assignmentUnlocks).toBe(undefined);
  });

  it('adds a field without flattening the rest of the class document', async () => {
    // A PATCH without an updateMask drops every field it does not send, which
    // on a class document is its name, its code and the teachers who own it.
    run('--apply');
    const after = await read('needsArming');
    expect(after.name).toBe('Needs arming');
    expect(after.joinCode).toBe('AAA222');
    expect(after.teacherUids).toEqual(['teacher']);
    expect(after.manualUnlocks).toEqual([2]);
    expect(after.archived).toBe(false);
  });
});

describe('running it twice is a no-op', () => {
  it('reports everything as already right the second time', async () => {
    run('--apply');
    const second = run('--apply');
    expect(second).not.toMatch(/ARM /);
    expect(second).not.toMatch(/FIX /);
    expect(second).toMatch(/armed 0, corrected 0/);
  });
});
