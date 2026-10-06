import { describe, it, expect, vi } from 'vitest';
import { schoolAccess } from '../server/school-access.js';
import handler from '../api/school-access.js';
const now = 2000000;
function fixture(overrides = {}) {
  const records = {
    'joinCodes/ABC123': { classId: 'class1', teacherUid: 'teacher1', active: true },
    'classes/class1': { joinCode: 'ABC123', teacherUids: ['teacher1'], archived: false },
    'schoolAuthorizations/class1': { status: 'approved', purpose: 'school-education-only',
      teacherUid: 'teacher1', reviewedBy: 'operator1', evidenceRef: 'private-review-123',
      reviewedAt: 1000000, expiresAt: 3000000 },
    ...overrides,
  };
  return { doc: vi.fn(path => ({ get: async () => ({ exists: !!records[path], data: () => records[path] }) })) };
}
describe('school code authorization', () => {
  it('requires a reviewed, unexpired authorization for the current class and teacher', async () => {
    expect(await schoolAccess(fixture(), 'ABC123', now)).toBe(true);
  });
  it('rejects an ordinary teacher-created code', async () => {
    expect(await schoolAccess(fixture({ 'schoolAuthorizations/class1': null }), 'ABC123', now)).toBe(false);
  });
  it.each([
    { status: 'pending' }, { status: 'revoked' }, { expiresAt: now },
    { reviewedAt: now + 1 }, { reviewedAt: null }, { evidenceRef: '' },
    { reviewedBy: '' }, { teacherUid: 'other' }, { purpose: 'marketing' },
  ])('rejects incomplete or inactive approval %j', async change => {
    const db = fixture();
    const old = (await db.doc('schoolAuthorizations/class1').get()).data();
    expect(await schoolAccess(fixture({ 'schoolAuthorizations/class1': { ...old, ...change } }), 'ABC123', now)).toBe(false);
  });
  it('rejects a retired code, archived class, or changed class code', async () => {
    expect(await schoolAccess(fixture({ 'joinCodes/ABC123': { active: false } }), 'ABC123', now)).toBe(false);
    expect(await schoolAccess(fixture({ 'classes/class1': { archived: true } }), 'ABC123', now)).toBe(false);
    expect(await schoolAccess(fixture({ 'classes/class1': { archived: false, joinCode: 'NEW123' } }), 'ABC123', now)).toBe(false);
  });
  it('rejects path injection before a database request', async () => {
    const db = fixture();
    expect(await schoolAccess(db, '../users/x', now)).toBe(false);
    expect(db.doc).not.toHaveBeenCalled();
  });
});
function response() {
  return { setHeader: vi.fn(), status: vi.fn(function (n) { this.code = n; return this; }), json: vi.fn() };
}
describe('pre-account API boundary', () => {
  it('rejects personal fields instead of accepting a child profile', async () => {
    const res = response();
    await handler({ method: 'POST', body: { code: 'ABC123', email: 'child@example.com' } }, res);
    expect(res.code).toBe(400);
  });
  it('does not expose lookup through GET URLs', async () => {
    const res = response();
    await handler({ method: 'GET' }, res);
    expect(res.code).toBe(405);
  });
  it('fails closed without server configuration', async () => {
    vi.stubEnv('PYPATH_SCHOOL_CODE_CHECKS', '');
    const res = response();
    await handler({ method: 'POST', body: { code: 'ABC123' } }, res);
    expect(res.code).toBe(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'unavailable' });
    vi.unstubAllEnvs();
  });
});
