import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Two Firestore models are live at once, and a join has to land in both.
   classes/{classId} is what the teacher dashboard counts, assigns against and
   locks units with; the flat roster/{uid} is what the certificate approval
   queue and the admin dashboard still read. The join flow wrote only the
   second one, so every student who joined was invisible to the class they had
   the code for, and every one of them fell back to sequential unlocking
   whatever mode their teacher had set. */

const flow = fs.readFileSync('assets/js/join-flow.js', 'utf8');
const menu = fs.readFileSync('assets/js/join-menu.js', 'utf8');
const account = fs.readFileSync('assets/js/account-class.js', 'utf8');
const page = fs.readFileSync('assets/js/classroom-page.js', 'utf8');

describe('both join entry points go through the same flow', () => {
  it('the join modal uses it', () => {
    expect(menu).toContain("from '/assets/js/join-flow.js'");
    expect(menu).toMatch(/await joinAnyClass\(uid, input\.value\)/);
    expect(menu).toMatch(/await leaveAnyClass\(uid\)/);
  });

  it('the account page uses it', () => {
    expect(account).toContain("from '/assets/js/join-flow.js'");
    expect(account).toMatch(/await joinAnyClass\(uid, raw\)/);
    expect(account).toMatch(/await leaveAnyClass\(uid\)/);
  });

  it('neither calls a bare joinClass any more', () => {
    // The whole bug was one of these two reaching straight past the flow.
    for (const [name, src] of [['join-menu', menu], ['account-class', account]]) {
      expect(src, name).not.toMatch(/await joinClass\(/);
      expect(src, name).not.toMatch(/await leaveClass\(/);
    }
  });
});

describe('the flow writes both schemas', () => {
  it('writes the class roster and the account pointer', () => {
    expect(flow).toMatch(/classJoin\(uid, rawCode/);
  });

  it('writes the legacy roster too, or certificates stop reaching teachers', () => {
    // classroom-page.js finds its approval queue by querying the flat roster
    // for teacherUid. A join that skips it drops the student out of that queue
    // with nothing anywhere to say so.
    expect(flow).toMatch(/legacyJoin\(uid, rawCode\)/);
    expect(page).toMatch(/collection\(db, 'roster'\)[\s\S]*where\('teacherUid', '==', state\.uid\)/);
  });

  it('writes the legacy record first, so a retry is not refused', () => {
    // The legacy write is a merge and survives being repeated. The class write
    // cannot be repeated: its update rule refuses to let joinedAt move once it
    // is written, so a retry after a half-finished join has to still find it
    // unwritten. Reversing these two makes the retry path deny itself.
    expect(flow.indexOf('legacyJoin(uid, rawCode)'))
      .toBeLessThan(flow.indexOf('classJoin(uid, rawCode'));
  });

  it('is quiet when the code is one you are already in', () => {
    // The update rule pins joinedAt, and serverTimestamp() is a new value each
    // time, so writing again is a denied update. Read first, write only when
    // the seat is empty. tests/rules/rejoin-repro.test.js proves the deny.
    const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
    const join = store.slice(
      store.indexOf('export async function joinClass'),
      store.indexOf('export async function leaveClass')
    );
    expect(join).toMatch(/const already = await getDoc\(seat\)/);
    expect(join).toMatch(/if \(!already\.exists\(\)\) \{/);
    // The account pointer is written either way -- it is the half a
    // legacy-only student is missing, and re-entering the code is their repair.
    expect(join.indexOf('classId: resolved.classId'))
      .toBeGreaterThan(join.indexOf('already.exists()'));
  });

  it('falls back rather than failing when the code predates classes', () => {
    expect(flow).toMatch(/err\.code === 'legacy'/);
    expect(flow).toMatch(/if \(!isPreClassCode\(e\)\) throw e/);
  });
});

describe('the lock mode applies without a reload', () => {
  it('forces both caches, which are keyed to answers that just changed', () => {
    expect(flow).toMatch(/loadMembership\(uid, true\)/);
    expect(flow).toMatch(/loadPolicy\(classId, true\)/);
  });

  it('resets the policy on leaving', () => {
    expect(flow).toMatch(/loadPolicy\(null, true\)/);
  });

  it('loads the policy after the roster write, which is what unlocks the read', () => {
    // assignments allow read: isTeacherOf() || isEnrolled(), and isEnrolled is
    // the roster document. Reading the policy first would simply be denied.
    expect(flow.indexOf('classJoin(uid, rawCode'))
      .toBeLessThan(flow.indexOf('loadPolicy(classId, true)'));
  });
});
