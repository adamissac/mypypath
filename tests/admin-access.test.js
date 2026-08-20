import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let ADMIN;
let rules;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/admin-access.js', 'utf8')).call(window);
  ADMIN = window.PyPathAdmin;
  rules = fs.readFileSync('firestore.rules', 'utf8');
});

describe('isAdminUid', () => {
  it('accepts each listed staff uid', () => {
    ADMIN.ADMIN_UIDS.forEach((uid) => {
      expect(ADMIN.isAdminUid(uid)).toBe(true);
    });
  });

  it('rejects a learner uid', () => {
    expect(ADMIN.isAdminUid('someLearnerUid000000000000000')).toBe(false);
  });

  it('rejects a near-miss uid', () => {
    const near = ADMIN.ADMIN_UIDS[0].slice(0, -1) + 'X';
    expect(ADMIN.isAdminUid(near)).toBe(false);
  });

  it('rejects a truncated uid', () => {
    expect(ADMIN.isAdminUid(ADMIN.ADMIN_UIDS[0].slice(0, -2))).toBe(false);
  });

  it('rejects non-strings', () => {
    [null, undefined, 0, {}, []].forEach((v) => {
      expect(ADMIN.isAdminUid(v)).toBe(false);
    });
  });
});

describe('isAdmin', () => {
  it('accepts a signed-in staff user', () => {
    expect(ADMIN.isAdmin({ uid: ADMIN.ADMIN_UIDS[0] })).toBe(true);
  });

  it('rejects a signed-out visitor', () => {
    expect(ADMIN.isAdmin(null)).toBe(false);
    expect(ADMIN.isAdmin(undefined)).toBe(false);
  });

  // An admin email on a non-admin uid must not open the door: the rules key
  // off uid, so a client that trusted email would show a page whose every
  // query then fails.
  it('rejects a user whose email matches but whose uid does not', () => {
    expect(ADMIN.isAdmin({ uid: 'imposter', email: 'sai.chowdarapu09@gmail.com' })).toBe(false);
  });
});

// The client list is cosmetic and the rules list is enforcement. If they drift,
// an admin sees a dashboard whose queries are all denied, or a removed admin
// keeps real access.
describe('firestore.rules stays in sync', () => {
  it('lists exactly the same uids in isAdmin()', () => {
    const block = rules.slice(rules.indexOf('function isAdmin()'));
    const inRules = (block.slice(0, block.indexOf('}')).match(/'([A-Za-z0-9]{20,})'/g) || [])
      .map((s) => s.replace(/'/g, ''));
    expect(inRules.sort()).toEqual(ADMIN.ADMIN_UIDS.slice().sort());
  });
});
