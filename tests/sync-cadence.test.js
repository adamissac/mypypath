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
    expect(full.indexOf('markSynced(')).toBeLessThan(full.indexOf('catch'));
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
