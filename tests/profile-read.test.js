import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';

/* The account record, and the reason a genuine teacher was told they were not.
 *
 * Reproduced on the live site twice, on /classroom.html and /account.html, on
 * a fresh navigation and never on a reload. The mechanism, which profile.js
 * documents at length: the Firestore client is configured with a persistent
 * local cache that can be cold, sync.js issues
 * setDoc(users/{uid}, identity, {merge:true}) on the same pypath:auth event
 * that the role checks fire on, and a merge write against a document the cache
 * has never seen synthesizes a local document containing only the merged
 * fields. getDoc() resolves from that view happily -- it only refuses a
 * cache-only answer when the document does not exist at all -- so the role came
 * back undefined and normalizeRole() read that as 'student'.
 *
 * The first group below is that exact sequence.
 *
 * THE HARNESS, because it looks odd on purpose: profile.js is an ES module
 * that imports the Firebase SDK from an absolute site path, so vitest cannot
 * import it. It is compiled here with the import machinery stripped and `doc`
 * and `onSnapshot` injected, which lets the race be driven directly rather
 * than asserted about with a regex. It is deliberately brittle: if the shape
 * of the module's imports changes, this fails loudly rather than quietly
 * testing nothing.
 */
function compileProfile(onSnapshot) {
  const src = fs.readFileSync('assets/js/profile.js', 'utf8');
  const body = src
    .replace(/^import \{[^}]*\} from '\/assets\/js\/firebase-config\.js';$/m, '')
    .replace(/^const BASE = [\s\S]*?firebase-firestore\.js`\);$/m, '')
    .replace(/^const \{ doc, onSnapshot \}[\s\S]*?;$/m, '')
    .replace(/\bexport (async function|function)/g, '$1');

  // Proof the strip actually happened, so a refactor cannot leave this suite
  // silently evaluating a module with its real imports still in it.
  expect(body).not.toContain('firebase-config.js');
  expect(body).toContain('function loadProfile');

  const db = {};
  const factory = new Function(
    'db', 'doc', 'onSnapshot',
    `${body}\nreturn { loadProfile, invalidateProfile, currentProfile };`
  );
  return factory(db, (_db, path) => path, onSnapshot);
}

/* A snapshot the way the SDK hands one over. `fromCache` and `hasPendingWrites`
   are the only two facts that matter here. */
function snapshot(data, meta) {
  return {
    metadata: { fromCache: !!meta.fromCache, hasPendingWrites: !!meta.hasPendingWrites },
    exists: () => data !== null,
    data: () => data,
  };
}

// The half-built document a merge write leaves in a cold cache: real fields,
// no role.
const HALF_BUILT = { email: 'teacher@example.com', displayName: 'A Teacher' };
const REAL = { email: 'teacher@example.com', displayName: 'A Teacher', role: 'teacher', classIds: ['c1'] };

/* An onSnapshot that plays a scripted sequence of snapshots, each after a
   delay, and records how many subscriptions were opened. */
function scripted(steps) {
  const calls = { subscriptions: 0, unsubscribed: 0 };
  const fn = (_ref, _opts, next, error) => {
    calls.subscriptions += 1;
    const timers = steps.map((step) => setTimeout(() => {
      if (step.error) error(step.error);
      else next(snapshot(step.data, step));
    }, step.after || 0));
    return () => {
      calls.unsubscribed += 1;
      timers.forEach(clearTimeout);
    };
  };
  fn.calls = calls;
  return fn;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// Runs the promise alongside the fake clock, which the timeout inside
// profile.js depends on.
async function settle(promise, ms) {
  const result = promise.then((v) => ({ ok: v }), (e) => ({ err: e }));
  await vi.advanceTimersByTimeAsync(ms);
  return result;
}

describe('the cold-cache race that told a teacher they were a student', () => {
  it('ignores the half-built local document and waits for the server', async () => {
    // Exactly the observed sequence: sync.js's merge write lands in the cache
    // first, the server answers a moment later.
    const P = compileProfile(scripted([
      { data: HALF_BUILT, fromCache: true, hasPendingWrites: true, after: 5 },
      { data: REAL, fromCache: false, hasPendingWrites: false, after: 50 },
    ]));
    const out = await settle(P.loadProfile('u1'), 100);
    expect(out.err).toBe(undefined);
    expect(out.ok.role).toBe('teacher');
    expect(out.ok.classIds).toEqual(['c1']);
  });

  it('would have answered "student" from the snapshot it now skips', () => {
    // Pins what the bug actually was, so the guard above cannot be removed
    // without somebody reading this line.
    expect(HALF_BUILT.role).toBe(undefined);
  });

  it('answers immediately when the server snapshot is the first one', async () => {
    const P = compileProfile(scripted([
      { data: REAL, fromCache: false, hasPendingWrites: false, after: 10 },
    ]));
    const out = await settle(P.loadProfile('u1'), 20);
    expect(out.ok.role).toBe('teacher');
  });

  it('treats a document that really does not exist as an answer', async () => {
    // A brand new account with no record written yet is not a teacher, and
    // saying so is correct rather than a failure.
    const P = compileProfile(scripted([
      { data: null, fromCache: false, hasPendingWrites: false, after: 10 },
    ]));
    const out = await settle(P.loadProfile('u1'), 20);
    expect(out.ok).toEqual({});
  });
});

describe('a slow answer is not an absent one', () => {
  /* WHAT SLIPPED PAST THE FIRST SEVENTEEN TESTS, and it is worth naming: every
     one of them scripted its snapshots inside the four second deadline, so not
     one of them ever let the timer fire while the sequence was still
     progressing. They proved the metadata logic, which was right, and never
     touched the deadline, which was wrong. Re-testing the deploy under four
     tabs contending for the persistence lock, the confirmed snapshot regularly
     arrived later than four seconds and the read was rejected as unreachable on
     a working connection -- 0 of 32 cold tabs rendered the dashboard.

     This is that case, and it fails against 47533a6. */
  it('waits for a server snapshot that takes six seconds', async () => {
    const P = compileProfile(scripted([
      { data: HALF_BUILT, fromCache: true, hasPendingWrites: true, after: 5 },
      { data: REAL, fromCache: false, hasPendingWrites: false, after: 6000 },
    ]));
    const out = await settle(P.loadProfile('u1'), 8000);
    expect(out.err).toBe(undefined);
    expect(out.ok.role).toBe('teacher');
  });

  it('still gives up eventually rather than hanging a page forever', async () => {
    const P = compileProfile(scripted([
      { data: HALF_BUILT, fromCache: true, hasPendingWrites: true, after: 5 },
    ]));
    const out = await settle(P.loadProfile('u1'), 25000);
    expect(out.err.code).toBe('unavailable');
  });
});

describe('a browser that says it has no network is believed at once', () => {
  /* The other half of moving the deadline out. Twenty seconds is the right
     ceiling for "online but struggling" and the wrong one for a learner on a
     train, who can be answered immediately from a copy we already hold. */
  function offline(value) {
    Object.defineProperty(window.navigator, 'onLine', {
      value, configurable: true, writable: true,
    });
  }

  afterEach(() => offline(true));

  it('answers from the cached copy without waiting out the deadline', async () => {
    offline(false);
    const P = compileProfile(scripted([
      { data: REAL, fromCache: true, hasPendingWrites: false, after: 5 },
    ]));
    // Only 100ms of clock is advanced: waiting the deadline would not resolve.
    const out = await settle(P.loadProfile('u1'), 100);
    expect(out.ok.role).toBe('teacher');
  });

  it('refuses at once rather than resolving the half-built document', async () => {
    // Offline is not permission to answer from our own pending write.
    offline(false);
    const P = compileProfile(scripted([
      { data: HALF_BUILT, fromCache: true, hasPendingWrites: true, after: 5 },
    ]));
    const out = await settle(P.loadProfile('u1'), 100);
    expect(out.ok).toBe(undefined);
    expect(out.err.code).toBe('unavailable');
  });
});

describe('offline is reported as offline, never as "not a teacher"', () => {
  it('rejects when only a pending-write view was ever available', async () => {
    // The dangerous fallback. Resolving the half-built document here would be
    // the original bug with a four second delay in front of it.
    const P = compileProfile(scripted([
      { data: HALF_BUILT, fromCache: true, hasPendingWrites: true, after: 5 },
    ]));
    // 25s, not 5s: the deadline moved out to twenty seconds because four was
    // rejecting reads that were still making progress. See the slow-answer
    // group above.
    const out = await settle(P.loadProfile('u1'), 25000);
    expect(out.ok).toBe(undefined);
    expect(out.err.code).toBe('unavailable');
  });

  it('falls back to a clean cached copy when there is one', async () => {
    // A teacher on a plane, whose own record was read on a previous load.
    const P = compileProfile(scripted([
      { data: REAL, fromCache: true, hasPendingWrites: false, after: 5 },
    ]));
    const out = await settle(P.loadProfile('u1'), 25000);
    expect(out.ok.role).toBe('teacher');
  });

  it('passes a listener error straight through', async () => {
    const P = compileProfile(scripted([
      { error: Object.assign(new Error('denied'), { code: 'permission-denied' }), after: 5 },
    ]));
    const out = await settle(P.loadProfile('u1'), 20);
    expect(out.err.code).toBe('permission-denied');
  });

  it('does not cache a failure', async () => {
    // Remembering an offline read would leave the page wrong for as long as
    // it is open, which is worse than paying for one more read.
    const fn = scripted([{ error: new Error('offline'), after: 5 }]);
    const P = compileProfile(fn);
    await settle(P.loadProfile('u1'), 20);
    await settle(P.loadProfile('u1'), 20);
    expect(fn.calls.subscriptions).toBe(2);
  });
});

describe('four callers, one read, one answer', () => {
  /* The coordination half. classroom-page.js, classroom-dashboard.js,
     account-class.js and classroom-store.js's classesFor all asked this
     question off the same auth event and could each get a different answer. */
  it('shares a single in-flight read between concurrent callers', async () => {
    const fn = scripted([{ data: REAL, fromCache: false, hasPendingWrites: false, after: 30 }]);
    const P = compileProfile(fn);
    const all = Promise.all([
      P.loadProfile('u1'), P.loadProfile('u1'), P.loadProfile('u1'), P.loadProfile('u1'),
    ]);
    const out = await settle(all, 60);
    expect(fn.calls.subscriptions).toBe(1);
    expect(out.ok.map((p) => p.role)).toEqual(['teacher', 'teacher', 'teacher', 'teacher']);
  });

  it('answers a later caller from the cache without reading again', async () => {
    const fn = scripted([{ data: REAL, fromCache: false, hasPendingWrites: false, after: 10 }]);
    const P = compileProfile(fn);
    await settle(P.loadProfile('u1'), 20);
    await settle(P.loadProfile('u1'), 20);
    expect(fn.calls.subscriptions).toBe(1);
  });

  it('lets go of the listener once it has an answer', async () => {
    const fn = scripted([{ data: REAL, fromCache: false, hasPendingWrites: false, after: 10 }]);
    const P = compileProfile(fn);
    await settle(P.loadProfile('u1'), 20);
    expect(fn.calls.unsubscribed).toBe(1);
  });

  it('reads again after a write invalidates it', async () => {
    // "Become a teacher" writes the role and then re-renders. Serving the
    // record from before that write would paint the student view over a
    // teacher account.
    const fn = scripted([{ data: REAL, fromCache: false, hasPendingWrites: false, after: 10 }]);
    const P = compileProfile(fn);
    await settle(P.loadProfile('u1'), 20);
    P.invalidateProfile('u1');
    await settle(P.loadProfile('u1'), 20);
    expect(fn.calls.subscriptions).toBe(2);
  });

  it('reads again when force is passed', async () => {
    const fn = scripted([{ data: REAL, fromCache: false, hasPendingWrites: false, after: 10 }]);
    const P = compileProfile(fn);
    await settle(P.loadProfile('u1'), 20);
    await settle(P.loadProfile('u1', true), 20);
    expect(fn.calls.subscriptions).toBe(2);
  });

  it('does not answer one account from another account\'s cache', async () => {
    const fn = scripted([{ data: REAL, fromCache: false, hasPendingWrites: false, after: 10 }]);
    const P = compileProfile(fn);
    await settle(P.loadProfile('u1'), 20);
    await settle(P.loadProfile('u2'), 20);
    expect(fn.calls.subscriptions).toBe(2);
  });
});

describe('every role check goes through it', () => {
  const join = fs.readFileSync('assets/js/class-join.js', 'utf8');
  const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
  const nav = fs.readFileSync('assets/js/role-nav.js', 'utf8');
  const sync = fs.readFileSync('assets/js/sync.js', 'utf8');

  it('readProfile delegates rather than reading for itself', () => {
    // The three modules that reproduced the bug all call readProfile by name,
    // so repointing it fixes all of them at once and any future caller too.
    expect(join).toMatch(/export async function readProfile\(uid\) \{\s*return loadProfile\(uid\);/);
  });

  it('classesFor asks the same reader for the class index', () => {
    // The fourth caller. A half-built local copy has no classIds either, which
    // is a teacher with classes shown as a teacher with none.
    expect(store).not.toMatch(/getDoc\(doc\(db, `users\/\$\{uid\}`\)\)/);
    expect(store).toMatch(/const profile = await loadProfile\(uid\)/);
  });

  it('every write that changes the answer invalidates it', () => {
    for (const [name, src] of [['class-join', join], ['classroom-store', store]]) {
      const writes = src.split('\n')
        .map((line, i) => [line, i])
        .filter(([line]) => /setDoc\(\s*$|setDoc\(doc\(db, `users\//.test(line));
      expect(writes.length, name).toBeGreaterThan(0);
    }
    // Named rather than counted: these are the four in class-join.js and the
    // four in classroom-store.js that move a role, a class index or a code.
    expect(join.match(/invalidateProfile\(uid\)/g).length).toBe(4);
    expect(store.match(/invalidateProfile\(uid\)/g).length).toBe(4);
  });

  /* The fifth reader, which 47533a6 missed. role-nav.js runs on all 124 pages
     and had its own getDoc with the same cold-cache bug -- and the worst
     consequence of the five, because it wrote its answer to sessionStorage
     rather than to a page-lifetime cache. */
  it('role-nav reads through the shared reader rather than its own getDoc', () => {
    expect(nav).toContain("from '/assets/js/profile.js'");
    expect(nav).toMatch(/await loadProfile\(user\.uid\)/);
    expect(nav).not.toMatch(/getDoc\(/);
  });

  it('role-nav never caches a role it failed to read', () => {
    /* It used to announce('student') here. That did not merely leave the
       teacher link hidden: paint() calls ROLES.rememberRole, which writes
       sessionStorage, which ROLES.teachingNow() reads, which lesson-progress.js
       asks before applying the unit lock. One unlucky read left a teacher
       locked out of their own course for the whole session. */
    const fn = nav.slice(nav.indexOf('async function apply'), nav.indexOf('// Changing role'));
    // Comments stripped: the block explains at length what it no longer does,
    // and an assertion that matched its own explanation would prove nothing.
    const rescue = fn.slice(fn.indexOf('} catch'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(rescue).not.toMatch(/announce\(/);
    expect(rescue).not.toMatch(/remember\(/);
  });

  it('sync reads the profile before it writes over it', () => {
    // The race removed at source: with the shared read resolved first there is
    // no unacknowledged merge write for any reader to be poisoned by.
    const fn = sync.slice(sync.indexOf('async function fullSync'));
    expect(fn.indexOf('await loadProfile(')).toBeGreaterThan(-1);
    expect(fn.indexOf('await loadProfile(')).toBeLessThan(fn.indexOf('identity(user)'));
  });
});
