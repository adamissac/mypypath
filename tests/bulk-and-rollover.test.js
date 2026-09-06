import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Bulk assignment, duplication and class rollover.
 *
 * Read statically, the way tests/join-flow.test.js reads classroom-store.js:
 * these are Firestore write paths in an ES module that imports the SDK from an
 * absolute site path, so the behavioural argument happens in tests/rules/ and
 * against the emulator. What is asserted here is the set of decisions that are
 * easy to reverse by accident and expensive to reverse in production.
 */

const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');

function fn(name) {
  const start = store.indexOf(`export async function ${name}`);
  expect(start, `no ${name}`).toBeGreaterThan(-1);
  const next = store.indexOf('\nexport ', start + 1);
  return store.slice(start, next === -1 ? store.length : next);
}

describe('setting the same work for several classes', () => {
  const src = fn('createAssignmentIn');

  it('makes a real assignment per class, not one shared object', () => {
    // Two periods diverge the moment one of them has a fire drill.
    expect(src).toContain('await createAssignment(classId, draft)');
  });

  it('deduplicates the class list', () => {
    // A picker that can select the current class twice must not set the work
    // twice.
    expect(src).toContain('new Set(classIds');
  });

  it('reports partial success instead of throwing it away', () => {
    /* A co-teacher may have archived one of three classes since the picker was
       drawn. Failing the whole call discards two assignments that were created
       perfectly well and leaves the teacher unable to tell which. */
    expect(src).toContain('results.push({ classId, ok: true');
    expect(src).toMatch(/ok: false/);
    expect(src).toContain('return results');
  });

  it('refuses an empty selection rather than silently doing nothing', () => {
    expect(src).toContain("'no-classes'");
  });
});

describe('duplicating an assignment', () => {
  const src = fn('duplicateAssignment');

  it('creates a new assignment rather than copying the document', () => {
    // A new id, and no completion state travelling with it.
    expect(src).toContain('return createAssignment(');
    expect(src).not.toMatch(/setDoc\([\s\S]*source\)/);
  });

  it('carries the targets, including the quiz', () => {
    for (const key of ['units', 'lessonPaths', 'quiz']) {
      expect(src, key).toContain(`${key}:`);
    }
  });

  it('REFUSES to inherit the due date', () => {
    /* The single most likely way this feature could hurt somebody: a duplicate
       that silently inherits a date three weeks in the past lands in every
       student's list already overdue. */
    expect(src).toContain("'no-due-date'");
    expect(src).toContain('dueAt: o.dueAt');
    expect(src).not.toMatch(/dueAt:\s*source\.dueAt/);
  });

  it('can copy into another class', () => {
    expect(src).toContain('toClassId || fromClassId');
  });

  it('says so when the source is gone', () => {
    expect(src).toContain("'not-found'");
  });
});

describe('rolling a class into a new term', () => {
  const src = fn('rolloverClass');

  it('creates a genuinely new class, with its own join code', () => {
    // A join code is a credential, and last year's is on a whiteboard photo in
    // forty camera rolls.
    expect(src).toContain('await createClass(uid, name)');
    expect(src).toContain('joinCode: made.joinCode');
  });

  it('DOES NOT copy the roster', () => {
    /* The enrollment-is-consent boundary the whole model rests on. Copying a
       roster would enroll last year's students in this year's class without
       their consent and show their work to a teacher who is no longer theirs. */
    expect(src).not.toMatch(/readRoster|\/roster\//);
  });

  it('does not copy events, progress or summaries either', () => {
    for (const bad of ['readEvents', 'readMirror', 'readSummary', 'readCertificates']) {
      expect(src, bad).not.toContain(bad);
    }
  });

  it('copies settings through their own setters, not as a blind write', () => {
    /* A class document written wholesale from another carries its teacherUids,
       its join code and its createdAt: three ways to corrupt the new class at
       once. setLockPolicy also validates the mode against what the rules
       accept. */
    expect(src).toContain('setLockPolicy(made.classId');
    expect(src).toContain('showSolutions');
    expect(src).toContain('maxTestAttempts');
    expect(src).not.toMatch(/setDoc\(doc\(db, `classes\/\$\{made\.classId\}`\), source/);
  });

  it('shifts due dates rather than copying them', () => {
    // A term of assignments landing all already overdue is not a rollover.
    expect(src).toContain('Number(a.dueAt || 0) + shift');
  });

  it('skips assignments that were archived in the source class', () => {
    expect(src).toContain('if (a.archived) continue');
  });

  it('reports what it could not copy instead of failing the rollover', () => {
    expect(src).toContain('failed.push(');
    expect(src).toContain('copied: copied.length');
  });

  it('names the new class rather than leaving it blank', () => {
    expect(src).toContain('(new term)');
  });

  it('lets the caller skip the assignments', () => {
    expect(src).toContain('opts.withAssignments !== false');
  });
});
