import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

// sync.js and class-state.js are ES modules that import the Firebase SDK from
// gstatic.com, so they cannot be executed in jsdom the way the classic scripts
// are. The decision they encode is tested in merge.test.js (needsFullSync);
// what is checked here is that they are actually wired to it -- the same
// source-contract approach nav-classroom.test.js takes with bake_layout.py.
let sync;
let classState;

beforeAll(() => {
  sync = fs.readFileSync('assets/js/sync.js', 'utf8');
  classState = fs.readFileSync('assets/js/class-state.js', 'utf8');
});

describe('sync.js reconciliation cadence', () => {
  // The bug this guards: pypath:auth fires on every page load, and the
  // reconciliation reads the learner's whole code collection. Ungated, opening
  // a lesson cost one Firestore read per saved editor, every time.
  it('gates the server round trip behind the resync window', () => {
    expect(sync).toContain('MERGE.needsFullSync(');
    expect(sync).toContain('MERGE.RESYNC_AFTER_MS');
    expect(sync).toMatch(/if \(dueForSync\(user\.uid\)\) \{\s*await fullSync\(user\);/);
  });

  it('keeps the whole round trip inside fullSync, not the auth handler', () => {
    const full = sync.slice(sync.indexOf('async function fullSync'), sync.indexOf('function repush'));
    ['identity(user)', 'reconcileWithRemote(', 'mirrorToRoster(', 'markSynced('].forEach((call) => {
      expect(full).toContain(call);
    });

    // The cheap path must not read or write anything but the cached teacher.
    const handler = sync.slice(sync.indexOf("document.addEventListener('pypath:auth'"));
    expect(handler).not.toContain('reconcileWithRemote(');
    expect(handler).not.toContain('setDoc(');
    expect(handler).not.toContain('getDoc');
  });

  // A failed run must not look like a finished one, or an offline learner waits
  // out the whole window before anything is retried.
  it('stamps the session only after the last write lands', () => {
    const full = sync.slice(sync.indexOf('async function fullSync'), sync.indexOf('function repush'));
    expect(full.indexOf('markSynced(')).toBeGreaterThan(full.indexOf('mirrorToRoster('));
    // The catch *clause*, not the first occurrence of the word: fullSync now
    // opens with an awaited loadProfile whose own .catch() would otherwise be
    // mistaken for the end of the try block. The claim is unchanged -- only a
    // run that got all the way through stamps the session.
    expect(full.indexOf('markSynced(')).toBeLessThan(full.indexOf('} catch (err)'));
  });

  // A page load re-reconciles; a tab left open for an hour never gets one.
  it('re-reconciles a stale tab on wake', () => {
    expect(sync).toMatch(/function wake\(\)\s*\{[^}]*repush\(\);[^}]*dueForSync/);
    expect(sync).toContain("window.addEventListener('online', wake)");
    expect(sync).toContain("if (document.visibilityState === 'visible') wake();");
  });

  it('does not let two reconciliations overlap', () => {
    expect(sync).toMatch(/if \(syncing\) return;/);
  });

  // lesson-runner.js writes the editor on every CodeMirror change, so this
  // debounce is the only thing between typing and a write per keystroke.
  it('debounces editor writes in seconds, not milliseconds', () => {
    const debounce = Number(/const DEBOUNCE_MS = (\d+);/.exec(sync)[1]);
    const ceiling = Number(/const MAX_WAIT_MS = (\d+);/.exec(sync)[1]);
    expect(debounce).toBeGreaterThanOrEqual(3000);
    expect(ceiling).toBeGreaterThanOrEqual(debounce);
    // Past this the cloud copy is far enough behind to be worth a conversation.
    expect(ceiling).toBeLessThanOrEqual(60000);
  });
});

describe('sync.js code collection reads', () => {
  // The largest read on the site: one document per saved editor, a few hundred
  // for a learner near the end of the course.
  it('asks only for documents written since the last look', () => {
    expect(sync).toContain("where('updatedAt', '>', since)");
    expect(sync).toContain('MERGE.FULL_SCAN_AFTER_MS');
  });

  it('still scans the whole collection on a schedule', () => {
    // An incremental query never returns a deleted document, so without this a
    // deletion made on another device would never reach this browser.
    expect(sync).toMatch(/const full = !lastSeen \|\| MERGE\.needsFullSync\(/);
    expect(sync).toContain('full ? codeRef : query(codeRef');
  });

  it('leaves room for a writing device whose clock runs behind', () => {
    expect(sync).toContain('CLOCK_SKEW_MS');
    expect(sync).toMatch(/const since = Math\.max\(0, lastSeen - CLOCK_SKEW_MS\)/);
  });

  // Moving the floor after a read that never happened would skip whatever was
  // written while this device was offline.
  it('moves the floor only after a read that landed', () => {
    expect(sync).toMatch(/if \(read\) \{\s*writeStamp\(CODE_SEEN_PREFIX/);
    expect(sync).toMatch(/if \(full\) writeStamp\(CODE_SCAN_PREFIX/);
  });

  // Session-scoped would mean re-reading the whole collection in every new tab,
  // which is the cost this exists to avoid.
  it('keeps the code stamps on the device, not the session', () => {
    const block = sync.slice(sync.indexOf('function readStamp'), sync.indexOf('function toast'));
    expect(block).toContain('localStorage.getItem');
    expect(block).not.toContain('sessionStorage');
  });
});

describe('activity.js write cadence', () => {
  let core;

  beforeAll(() => {
    core = fs.readFileSync('assets/js/activity-core.js', 'utf8');
    new Function(core).call(window);
  });

  // Two or three document writes per flush, so this constant was the single
  // largest write cost on the platform.
  it('flushes accrued time in minutes, not once a minute', () => {
    const ms = window.PyPathActivity.FLUSH_MS;
    expect(ms).toBeGreaterThanOrEqual(3 * 60000);
    // Long enough and "Last active" on the dashboards stops meaning anything.
    expect(ms).toBeLessThanOrEqual(15 * 60000);
  });

  it('still banks time far more often than it writes it', () => {
    expect(window.PyPathActivity.TICK_MS).toBeLessThan(window.PyPathActivity.FLUSH_MS);
  });

  // The whole reason a longer flush window costs nothing: unwritten seconds
  // are on disk, and the tab going away forces a flush.
  it('parks unwritten time on the device and flushes when the tab goes', () => {
    const activity = fs.readFileSync('assets/js/activity.js', 'utf8');
    expect(activity).toContain('savePending(uid, pendingSeconds)');
    expect(activity).toMatch(/pagehide[\s\S]{0,120}flush\(\)/);
    expect(activity).toMatch(/visibilitychange[\s\S]{0,320}flush\(\)/);
  });
});

describe('class-state.js teacher cache', () => {
  it('answers from the session cache instead of a roster read', () => {
    expect(classState).toContain('sessionStorage.getItem(CACHE_PREFIX');
    expect(classState).toContain('sessionStorage.setItem(CACHE_PREFIX');
  });

  // "In no class" is a real answer and has to survive the round trip as
  // something other than null, which means "never read".
  it('treats an empty cached value as an answer, not a miss', () => {
    expect(classState).toMatch(/if \(cached !== null\)/);
  });

  it('lets a caller force past the cache', () => {
    expect(classState).toMatch(/export async function loadFor\(uid, force\)/);
    expect(classState).toContain('if (force !== true)');
    // The forced read is what carries a teacher-side removal to the learner.
    expect(sync).toContain('loadFor(user.uid, true)');
  });

  it('keeps the cache current when the learner joins or leaves a class', () => {
    const setter = classState.slice(classState.indexOf('export function setTeacher'));
    expect(setter).toContain('writeCache(ownerUid, teacherUid)');
  });

  // Caching a failure would leave a learner unmirrored to their teacher for the
  // rest of the session.
  it('never caches an offline answer', () => {
    const failure = classState.slice(classState.indexOf('} catch (e) {'));
    expect(failure).not.toContain('writeCache(');
  });
});
