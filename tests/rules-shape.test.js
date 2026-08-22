import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* A static read of firestore.rules, running in the ordinary `npm test` suite.
   The real behavioural suite is tests/rules/classroom-rules.test.js, which
   needs the Firestore emulator (and so a JVM) and only runs where one exists.
   These checks need neither, and catch the mistakes that are invisible in a
   diff: a vocabulary that drifted out of sync, or a deny that quietly became
   an allow. */

const rules = fs.readFileSync('firestore.rules', 'utf8');

/* Returns the body of a `match <path> { ... }` block, brace-matched so a
   nested block does not end the search early. The search starts after the
   path itself, because a path like /roster/{uid} contains a brace of its own
   and naively taking the first one would return the wildcard name. */
function matchBlock(pathFragment, searchFrom) {
  const anchor = `match ${pathFragment}`;
  const start = rules.indexOf(anchor, searchFrom || 0);
  expect(start, `no match block for ${pathFragment}`).toBeGreaterThan(-1);
  const open = rules.indexOf('{', start + anchor.length);
  let depth = 0;
  for (let j = open; j < rules.length; j += 1) {
    if (rules[j] === '{') depth += 1;
    else if (rules[j] === '}') {
      depth -= 1;
      if (depth === 0) return rules.slice(open + 1, j);
    }
  }
  throw new Error(`unbalanced braces from ${pathFragment}`);
}

/* The classroom roster is nested under /classes; there is also a separate
   legacy top-level /roster collection that predates it. Anchor on the classes
   block so these assertions cannot silently start reading the wrong one. */
const CLASSES_AT = rules.indexOf('match /classes/{classId}');

describe('the rules file parses structurally', () => {
  it('has balanced braces', () => {
    let depth = 0;
    for (const ch of rules) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('declares rules_version 2', () => {
    expect(rules).toMatch(/^rules_version = '2';/m);
  });
});

describe('the event vocabulary is enforced in two places and must agree', () => {
  let jsTypes;
  beforeAll(() => {
    new Function(fs.readFileSync('assets/js/events.js', 'utf8')).call(globalThis);
    jsTypes = globalThis.PyPathEvents
      ? globalThis.PyPathEvents.TYPES
      : globalThis.window.PyPathEvents.TYPES;
  });

  it('lists the same nine types in firestore.rules as in events.js', () => {
    const events = matchBlock('/events/{eventId}');
    const listed = [...events.matchAll(/'([a-z]+\.[a-z_]+)'/g)].map((m) => m[1]);
    expect([...new Set(listed)].sort()).toEqual([...jsTypes].sort());
  });
});

describe('the event log stays append-only', () => {
  const events = matchBlock('/events/{eventId}');

  it('denies update outright', () => {
    expect(events).toMatch(/allow update:\s*if false;/);
  });

  it('never grants a blanket write', () => {
    expect(events).not.toMatch(/allow[^;]*\bwrite\b/);
  });

  it('allows create only to the owner, and only while enrolled', () => {
    expect(events).toMatch(/allow create:\s*if isOwner\(uid\) && isEnrolled\(/);
  });

  it('allows delete only after the student has left the class', () => {
    expect(events).toMatch(/allow delete:\s*if isOwner\(uid\) && !isEnrolled\(/);
  });

  it('pins the timestamp to request.time rather than trusting the client clock', () => {
    expect(events).toMatch(/request\.resource\.data\.at == request\.time/);
  });
});

describe('teachers read, and do not write, student work', () => {
  it('gives the progress mirror no teacher write', () => {
    const progress = matchBlock('/progress/{docId}');
    expect(progress).toMatch(/allow read:\s*if isOwner\(uid\) \|\| isTeacherOf\(/);
    expect(progress).toMatch(/allow create, update:\s*if isOwner\(uid\)/);
    expect(progress).toMatch(/allow delete:\s*if isOwner\(uid\);/);
    expect(progress).not.toMatch(/allow[^;]*write/);
  });

  it('caps mirrored content at the same 100KB the private code collection uses', () => {
    expect(matchBlock('/progress/{docId}')).toMatch(/content\.size\(\) <= 102400/);
    expect(matchBlock('/code/{docId}')).toMatch(/content\.size\(\) <= 102400/);
  });
});

describe('the private user subtree is still owner-only', () => {
  it('gives saved code no teacher and no admin exception', () => {
    const code = matchBlock('/code/{docId}');
    expect(code).not.toMatch(/isAdmin|isTeacherOf/);
  });

  it('keeps the account record away from teachers', () => {
    expect(matchBlock('/users/{uid}')).not.toMatch(/isTeacherOf/);
  });
});

describe('codes and classes cannot be enumerated', () => {
  it('denies listing join codes', () => {
    expect(matchBlock('/joinCodes/{code}')).toMatch(/allow list:\s*if false;/);
  });

  it('denies listing classes', () => {
    expect(matchBlock('/classes/{classId}')).toMatch(/allow list:\s*if false;/);
  });

  it('denies deleting a class, which would strand its subcollections', () => {
    expect(matchBlock('/classes/{classId}')).toMatch(/allow delete:\s*if false;/);
  });
});

describe('roster membership', () => {
  const roster = matchBlock('/roster/{uid}', CLASSES_AT);

  it('requires the join code to point at this very class', () => {
    expect(roster).toMatch(/codeProvesThisClass/);
    expect(roster).toMatch(/\.data\.get\('classId', ''\) == classId/);
  });

  it('refuses to enroll anyone into an archived class', () => {
    expect(roster).toMatch(/archived == false/);
  });

  it('refuses real names and contact details', () => {
    expect(roster).toMatch(/'email', 'photoURL', 'firstName', 'lastName', 'realName'/);
  });

  it('freezes the record of consent after joining', () => {
    expect(roster).toMatch(/affectedKeys\(\)\.hasAny\(\['joinCode', 'joinedAt'\]\)/);
  });
});
