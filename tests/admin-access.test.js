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

describe('isLastPage', () => {
  it('is finished on a short page', () => {
    expect(ADMIN.isLastPage(0, 200)).toBe(true);
    expect(ADMIN.isLastPage(199, 200)).toBe(true);
  });

  // A page that exactly fills the limit may or may not have anything after it.
  // Calling it finished would drop every account past the boundary.
  it('is not finished on a full page', () => {
    expect(ADMIN.isLastPage(200, 200)).toBe(false);
  });

  it('falls back to the default page size when the limit is junk', () => {
    expect(ADMIN.isLastPage(ADMIN.PAGE_SIZE, 0)).toBe(false);
    expect(ADMIN.isLastPage(ADMIN.PAGE_SIZE - 1, 'lots')).toBe(true);
  });

  // Better to stop than to loop forever asking for a page that never comes.
  it('stops on a junk count', () => {
    expect(ADMIN.isLastPage(null, 200)).toBe(true);
    expect(ADMIN.isLastPage(NaN, 200)).toBe(true);
    expect(ADMIN.isLastPage(-1, 200)).toBe(true);
  });

  it('pages in hundreds, not tens or tens of thousands', () => {
    expect(ADMIN.PAGE_SIZE).toBeGreaterThanOrEqual(50);
    expect(ADMIN.PAGE_SIZE).toBeLessThanOrEqual(1000);
  });
});

describe('coverageNote', () => {
  // The stat tiles, the sort and the search all run over loaded rows. A partial
  // load that says nothing is how an admin reports the wrong headcount.
  it('says what is missing while the load is partial', () => {
    const note = ADMIN.coverageNote(200, false);
    expect(note).toContain('200');
    expect(note.toLowerCase()).toContain('search');
  });

  it('says nothing once everything is loaded', () => {
    expect(ADMIN.coverageNote(200, true)).toBe('');
    expect(ADMIN.coverageNote(0, true)).toBe('');
  });

  // Anything short of an explicit true is a partial load.
  it('treats a missing flag as partial', () => {
    expect(ADMIN.coverageNote(10, undefined)).not.toBe('');
    expect(ADMIN.coverageNote(10, 'yes')).not.toBe('');
  });
});

describe('admin-page.js paging', () => {
  let page;

  beforeAll(() => {
    page = fs.readFileSync('assets/js/admin-page.js', 'utf8');
  });

  // The bug this guards: getDocs over the bare collection is one read per
  // account, every time the page is opened.
  it('never queries the collection unbounded', () => {
    expect(page).not.toMatch(/getDocs\(collection\(db, 'users'\)\)/);
    expect(page).toContain('limit(ADMIN.PAGE_SIZE)');
    expect(page).toContain('startAfter(state.cursor)');
  });

  // orderBy on a field drops documents that lack it, which here would be the
  // oldest accounts -- the ones written before sync.js started stamping them.
  it('orders by document id so no account can be skipped', () => {
    expect(page).toContain('orderBy(documentId())');
  });

  it('drains every page before writing a CSV', () => {
    const handler = page.slice(page.indexOf("csv.addEventListener('click'"));
    expect(handler.indexOf('drainAll()')).toBeGreaterThan(-1);
    expect(handler.indexOf('drainAll()')).toBeLessThan(handler.indexOf('new Blob'));
  });

  it('does not claim a search found nothing when it only searched one page', () => {
    const empty = page.slice(page.indexOf('function emptyHtml'), page.indexOf('function paintCoverage'));
    expect(empty).toContain('state.complete');
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
