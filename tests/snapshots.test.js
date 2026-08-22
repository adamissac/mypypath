import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let S;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/snapshots.js', 'utf8')).call(window);
  S = window.PyPathSnapshots;
});

describe('the ring buffer', () => {
  it('records the first snapshot', () => {
    const h = S.push([], 'x = 1', 1000, 'save');
    expect(h.length).toBe(1);
    expect(h[0].code).toBe('x = 1');
    expect(h[0].at).toBe(1000);
    expect(h[0].reason).toBe('save');
  });

  it('does not record code that has not changed', () => {
    // Running the same code three times is one state, not three.
    let h = S.push([], 'x = 1', 1000, 'save');
    h = S.push(h, 'x = 1', 2000, 'run');
    h = S.push(h, 'x = 1', 3000, 'run');
    expect(h.length).toBe(1);
  });

  it('keeps at most twenty and drops the oldest', () => {
    let h = [];
    for (let i = 0; i < 25; i += 1) h = S.push(h, 'line ' + i, i, 'save');
    expect(h.length).toBe(S.MAX_PER_EDITOR);
    expect(h[0].code).toBe('line 5');
    expect(h[h.length - 1].code).toBe('line 24');
  });

  it('never mutates the history it was given', () => {
    const original = S.push([], 'x = 1', 1000, 'save');
    const copy = JSON.parse(JSON.stringify(original));
    S.push(original, 'x = 2', 2000, 'save');
    expect(original).toEqual(copy);
  });

  it('records whether the snapshot came from a run or a save', () => {
    let h = S.push([], 'a', 1, 'save');
    h = S.push(h, 'ab', 2, 'run');
    expect(h.map((s) => s.reason)).toEqual(['save', 'run']);
  });

  it('truncates one enormous snapshot rather than dropping it', () => {
    const huge = 'x'.repeat(S.MAX_SNAPSHOT_BYTES * 2);
    const h = S.push([], huge, 1, 'save');
    expect(h.length).toBe(1);
    expect(h[0].code.length).toBe(S.MAX_SNAPSHOT_BYTES);
  });
});

describe('the large-insertion flag', () => {
  it('counts characters added since the previous snapshot', () => {
    expect(S.charsAdded('ab', 'abcde')).toBe(3);
    expect(S.charsAdded('', 'abc')).toBe(3);
  });

  it('never reports a deletion as a negative addition', () => {
    expect(S.charsAdded('abcdef', 'ab')).toBe(0);
  });

  it('flags roughly a screenful arriving at once', () => {
    expect(S.isLargeInsertion('', 'x'.repeat(S.LARGE_INSERTION_CHARS))).toBe(true);
    expect(S.isLargeInsertion('', 'x'.repeat(S.LARGE_INSERTION_CHARS - 1))).toBe(false);
  });

  it('does not flag the very first snapshot', () => {
    // Opening a lesson whose editor is pre-filled is not an insertion.
    const h = S.push([], 'x'.repeat(500), 1, 'save');
    expect(h[0].largeInsertion).toBe(false);
  });

  it('flags a later jump', () => {
    let h = S.push([], 'x = 1', 1, 'save');
    h = S.push(h, 'x = 1\n' + 'y'.repeat(300), 2, 'save');
    expect(h[1].largeInsertion).toBe(true);
  });

  it('derives no score, ratio or verdict from the flag', () => {
    // A student who typed fast, pasted their own earlier work, or copied an
    // example from the lesson all look identical here. The only honest use is
    // as a reason to ask a question.
    const api = Object.keys(S).join(' ').toLowerCase();
    for (const banned of ['plagiar', 'score', 'cheat', 'suspicio', 'integrity', 'confidence']) {
      expect(api).not.toContain(banned);
    }
    let h = S.push([], 'a', 1, 'save');
    h = S.push(h, 'a' + 'b'.repeat(400), 2, 'save');
    expect(Object.keys(h[1]).sort()).toEqual(['added', 'at', 'code', 'largeInsertion', 'reason']);
  });
});

describe('the storage budget', () => {
  it('measures the whole lesson, across editors', () => {
    const byEditor = { e1: [{ code: 'x'.repeat(100) }], e2: [{ code: 'y'.repeat(50) }] };
    expect(S.historyBytes(byEditor)).toBe(150);
  });

  it('drops the oldest first when the lesson exceeds its budget', () => {
    const chunk = 'x'.repeat(5000);
    let byEditor = {};
    for (let i = 0; i < 30; i += 1) {
      byEditor = S.record(byEditor, 'e1', chunk + i, i, 'save');
    }
    expect(S.historyBytes(byEditor)).toBeLessThanOrEqual(S.MAX_BYTES_PER_LESSON);
    // What survives is the most recent work, which is what a teacher opens it for.
    const kept = byEditor.e1;
    expect(kept[kept.length - 1].code).toContain('29');
  });

  it('does not let one busy editor evict another entirely in one go', () => {
    let byEditor = { e2: [{ code: 'y'.repeat(200), at: 0 }] };
    byEditor = S.record(byEditor, 'e1', 'x'.repeat(100), 1, 'save');
    expect(byEditor.e2).toBeTruthy();
    expect(byEditor.e1).toBeTruthy();
  });

  it('keeps recording across editors on the same lesson', () => {
    let byEditor = S.record({}, 'practice1', 'a', 1, 'save');
    byEditor = S.record(byEditor, 'exercise1', 'b', 2, 'run');
    expect(Object.keys(byEditor).sort()).toEqual(['exercise1', 'practice1']);
  });
});

describe('wiring into the lesson', () => {
  const runner = fs.readFileSync('assets/js/lesson-runner.js', 'utf8');

  it('snapshots on run', () => {
    expect(runner).toMatch(/snapshot\(editorId, code, 'run'\)/);
  });

  it('snapshots on save only after typing settles, never per keystroke', () => {
    // The existing save fires on every CodeMirror change. Snapshotting there
    // would be a recording of someone thinking.
    expect(runner).toMatch(/snapshotWhenSettled\(editorId/);
    expect(runner).toMatch(/var SETTLE_MS = 3000;/);
    expect(runner).toMatch(/window\.clearTimeout\(settleTimers\[editorId\]\)/);
  });

  it('writes nothing at all for a learner who is not in a class', () => {
    expect(runner).toMatch(/if \(!window\.PyPathEvents \|\| !window\.PyPathEvents\.isEnabled\(\)\) return;/);
  });

  it('syncs under a deliberately allowlisted key', () => {
    new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
    expect(window.PyPathKeys.SNAPSHOTS_PREFIX).toBe('pypath-snapshots-');
    expect(window.PyPathKeys.isSyncable('pypath-snapshots-/units/unit-1/x.html')).toBe(true);
  });

  it('is loaded before the runner that calls it', () => {
    const page = fs.readFileSync('units/unit-1/first-program.html', 'utf8');
    expect(page.indexOf('/assets/js/snapshots.js'))
      .toBeLessThan(page.indexOf('/assets/js/lesson-runner.js'));
  });
});
