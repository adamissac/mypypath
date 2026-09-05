import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

/* assets/js/read-counter.js is an ES module that reads location and
   localStorage at import time, so it is compiled here with the export keywords
   stripped -- the same technique tests/profile-read.test.js uses, and for the
   same reason: importing it would bind ON to whatever jsdom's URL happens to be
   and there would be no way to test both states. */
function compile({ search = '', stored = null } = {}) {
  const src = fs.readFileSync('assets/js/read-counter.js', 'utf8');
  const body = src.replace(/\bexport (function|const)/g, '$1');

  const calls = [];
  const fakeWindow = {};
  const factory = new Function(
    'location', 'localStorage', 'console', 'window', 'URLSearchParams',
    `${body}\nreturn { docs, counted, enabled, reset, report, print };`
  );
  return {
    api: factory(
      { search },
      { getItem: (k) => (k === 'pypath:readcount' ? stored : null) },
      { info: (...a) => calls.push(a), table: (...a) => calls.push(a) },
      fakeWindow,
      URLSearchParams
    ),
    calls,
    fakeWindow,
  };
}

describe('read counting is off unless it is asked for', () => {
  it('is off with no flag and no stored preference', () => {
    expect(compile().api.enabled()).toBe(false);
  });

  it('is on with ?readcount=1', () => {
    expect(compile({ search: '?readcount=1' }).api.enabled()).toBe(true);
  });

  it('is on with the stored preference', () => {
    expect(compile({ stored: '1' }).api.enabled()).toBe(true);
  });

  it('is not switched on by some other query parameter', () => {
    expect(compile({ search: '?readcount=0&debug=1' }).api.enabled()).toBe(false);
  });

  it('counts nothing at all when off', () => {
    const { api } = compile();
    api.docs(500, 'readEvents');
    expect(api.report()).toEqual({ total: 0, byLabel: {} });
  });

  it('publishes nothing on window when off', () => {
    // The instrumentation must not be discoverable, let alone usable, on a
    // page a learner has open.
    expect(compile().fakeWindow.PyPathReads).toBe(undefined);
  });

  it('returns its argument either way, so a call site can wrap an expression', () => {
    expect(compile().api.docs(7, 'x')).toBe(7);
    expect(compile({ stored: '1' }).api.docs(7, 'x')).toBe(7);
  });
});

describe('what it counts is what Firestore bills', () => {
  it('adds up documents per label', () => {
    const { api } = compile({ stored: '1' });
    api.docs(500, 'readEvents');
    api.docs(500, 'readEvents');
    api.docs(30, 'readRoster');
    expect(api.report()).toEqual({
      total: 1030,
      byLabel: { readEvents: 1000, readRoster: 30 },
    });
  });

  it('bills an empty query result as one read, not zero', () => {
    /* Firestore's own billing rule, and the reason it is honoured here rather
       than tidied away: the seeded fixture has no progress mirror at all, so a
       counter that scored empty results as free would have reported the mirror
       query as costing nothing on exactly the class used to measure it. */
    const { api } = compile({ stored: '1' });
    api.docs(0, 'readMirror');
    expect(api.report().byLabel.readMirror).toBe(1);
  });

  it('counts a getDoc snapshot as one', () => {
    const { api } = compile({ stored: '1' });
    api.counted({ exists: () => true }, 'readClass');
    expect(api.report().total).toBe(1);
  });

  it('counts a getDocs snapshot by its size', () => {
    const { api } = compile({ stored: '1' });
    api.counted({ size: 42 }, 'readEvents');
    expect(api.report().total).toBe(42);
  });

  it('hands the snapshot straight back', () => {
    const { api } = compile({ stored: '1' });
    const snap = { size: 3 };
    expect(api.counted(snap, 'x')).toBe(snap);
  });

  it('reports labels worst-first, because the report is a to-do list', () => {
    const { api } = compile({ stored: '1' });
    api.docs(1, 'cheap');
    api.docs(900, 'expensive');
    api.docs(50, 'middling');
    expect(Object.keys(api.report().byLabel)).toEqual(['expensive', 'middling', 'cheap']);
  });

  it('resets', () => {
    const { api } = compile({ stored: '1' });
    api.docs(100, 'x');
    api.reset();
    expect(api.report()).toEqual({ total: 0, byLabel: {} });
  });
});

describe('the call sites are wired up', () => {
  const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');

  it('classroom-store.js imports the counter', () => {
    expect(store).toContain("from '/assets/js/read-counter.js'");
  });

  it('counts every read in the file', () => {
    /* The guard that matters. An uncounted read makes the total quietly wrong,
       and a total that is quietly wrong is worse than no instrumentation --
       it is a number someone will put in a commit message. */
    const code = store.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const reads = code.match(/\bawait get(Doc|Docs)\(/g) || [];
    const counted = code.match(/counted\(\s*await get(Doc|Docs)\(/g) || [];
    // The three uncounted reads are the purge loops -- purgeExpired,
    // purgeArchivedClass and purgeStudent. Deliberately outside the count:
    // they are delete loops a teacher runs on purpose, not a page load, and
    // the question this instrument answers is what a page costs. Pinned as a
    // number so a NEW uncounted read cannot hide among them.
    const purgeReads = 3;
    expect(reads.length - counted.length).toBe(purgeReads);
  });
});
