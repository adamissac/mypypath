import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

/* The roster summary, and the one property that decides whether it can be
 * trusted: IT MUST AGREE WITH classroom-core.js.
 *
 * Two implementations now compute the same facts about a student. The grid
 * reads a summary that was folded together incrementally as the student
 * worked; the drill-down and both exports replay the whole event log at read
 * time. If those disagree, a teacher gets one answer at a glance and a
 * different one when they click through to check it -- which is worse than the
 * cost problem the summary was built to solve, because a slow dashboard is
 * merely expensive and a lying one is not.
 *
 * So the shape of this file is: build an event fixture, fold it, replay it,
 * and assert the two agree. The fixtures deliberately include the awkward
 * cases -- out-of-order arrival, a bad retake after a good attempt, a partial
 * pass, a batch split in half -- because those are where an incremental fold
 * and a whole-log replay come apart.
 */

let K;
let RS;

beforeAll(async () => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/unit-progress.js', 'utf8')).call(window);
  K = window.PyPathClassroom;

  /* roster-summary.js is an ES module that imports firebase-config.js, which
     is top-level await over the SDK on gstatic and cannot run in jsdom. The
     pure half is compiled with its imports stripped and its I/O left
     undefined, the same technique tests/profile-read.test.js uses.

     Only applyEvents and its helpers are exercised here. The I/O half is
     exercised by the browser measurement in scripts/, which is the only place
     it means anything. */
  const src = fs.readFileSync('assets/js/roster-summary.js', 'utf8');
  const body = src
    .replace(/^import \{[^}]*\} from '\/assets\/js\/firebase-config\.js';$/m, '')
    .replace(/^const BASE = [\s\S]*?firebase-firestore\.js`\);$/m, '')
    .replace(/^import \{ counted \} from '\/assets\/js\/read-counter\.js';$/m, '')
    .replace(/\bexport (async function|function|const)/g, '$1');

  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  expect(code).not.toMatch(/\bimport\b/);
  expect(code).toContain('function applyEvents');

  RS = new Function(
    'db', 'doc', 'getDoc', 'setDoc', 'serverTimestamp', 'setTimeout', 'clearTimeout',
    `${body}\nreturn { applyEvents, emptySummary, lessonKey, eventsFromSummary,
                        SUMMARY_SCHEMA, WRITE_DEBOUNCE_MS, FLAGGED_CAP };`
  )({}, () => ({}), async () => ({ exists: () => false }), async () => {}, () => 'ts',
    globalThis.setTimeout, globalThis.clearTimeout);
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 5);
const L1 = '/units/unit-1/first-program.html';
const L2 = '/units/unit-1/syntax-indentation.html';
const L3 = '/units/unit-2/loops.html';

function ev(type, agoDays, payload) {
  return {
    type,
    at: NOW - agoDays * DAY,
    lessonPath: (payload && payload.lessonPath) || L1,
    unit: (payload && payload.unit) || 1,
    payload: payload || {},
  };
}

const opened = (d, p) => ev('lesson.opened', d, { lessonPath: p || L1, unit: 1 });
const ran = (d, p) => ev('code.run', d, { lessonPath: p || L1, editorId: 'e1', ok: true });
const checked = (d, passed, total, p) =>
  ev('code.tests_passed', d, { lessonPath: p || L1, passed, total });
const tested = (d, unit, score, total) =>
  ev('test.submitted', d, { unit, score, total });
const verified = (d, unit) =>
  ev('unit.completed', d, { unit, verified: true });

/* The summary's own view of a lesson, in classroom-core.js's vocabulary. The
   summary stores 'verified' on the unit rather than on each lesson, so this
   applies it the way the grid does at render -- see the note in
   roster-summary.js about why it is not baked into the lesson entry. */
function stateFromSummary(summary, path, unitVerified) {
  if (unitVerified) return 'verified';
  const entry = summary.lessons[RS.lessonKey(path)];
  return entry ? entry.state : 'not-opened';
}

describe('the fold agrees with the replay, lesson by lesson', () => {
  const cases = [
    ['never touched', []],
    ['opened only', [opened(3)]],
    ['opened and run', [opened(3), ran(2)]],
    ['a partial check', [opened(3), checked(2, 2, 5)]],
    ['a full pass', [opened(3), checked(2, 5, 5)]],
    ['a pass then a bad retake', [opened(5), checked(4, 5, 5), checked(1, 1, 5)]],
    ['a bad attempt then a pass', [opened(5), checked(4, 1, 5), checked(1, 5, 5)]],
    ['a check with no run in front of it', [checked(2, 5, 5)]],
    ['an answer submitted', [ev('answer.submitted', 2, { lessonPath: L1 })]],
    ['a concept check answered', [ev('check.answered', 2, { lessonPath: L1 })]],
  ];

  for (const [name, events] of cases) {
    it(name, () => {
      const summary = RS.applyEvents(RS.emptySummary(), events);
      expect(stateFromSummary(summary, L1, false))
        .toBe(K.lessonState(events, L1, false));
    });
  }

  it('keeps two lessons apart', () => {
    const events = [opened(3, L1), checked(2, 5, 5, L1), opened(2, L2)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(stateFromSummary(summary, L1, false)).toBe(K.lessonState(events, L1, false));
    expect(stateFromSummary(summary, L2, false)).toBe(K.lessonState(events, L2, false));
    expect(stateFromSummary(summary, L3, false)).toBe('not-opened');
  });
});

describe('the fold agrees with the replay on completion dates', () => {
  it('firstPassAt is the earliest full pass, not the latest', () => {
    const events = [checked(9, 5, 5, L1), checked(2, 5, 5, L1)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.lessons[RS.lessonKey(L1)].firstPassAt)
      .toBe(K.completedAt(events, { kind: 'lesson', path: L1 }));
  });

  it('a partial check does not set a completion date', () => {
    const events = [checked(3, 4, 5, L1)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.lessons[RS.lessonKey(L1)].firstPassAt).toBe(undefined);
    expect(K.completedAt(events, { kind: 'lesson', path: L1 })).toBe(null);
  });

  it('verifiedAt is the earliest verification', () => {
    const events = [verified(9, 1), verified(2, 1)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.units['1'].verifiedAt).toBe(NOW - 9 * DAY);
  });

  it('firstTestPassAt ignores a paper below the pass mark', () => {
    // 60% then 90%. Only the second one is a pass, so the date is the second.
    const events = [tested(9, 1, 6, 10), tested(2, 1, 9, 10)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.units['1'].firstTestPassAt).toBe(NOW - 2 * DAY);
  });

  it('a quiz is done the first time it is submitted, whatever the score', () => {
    const events = [
      ev('quiz.submitted', 5, { assignmentId: 'a1', unit: 2, score: 30, total: 10 }),
      ev('quiz.submitted', 1, { assignmentId: 'a1', unit: 2, score: 90, total: 10 }),
    ];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.quizzes.a1).toBe(NOW - 5 * DAY);
    expect(summary.quizzes.a1)
      .toBe(K.completedAt(events, { kind: 'quiz', assignmentId: 'a1' }));
  });
});

describe('the ratchet holds, which is the whole point', () => {
  it('a bad retake cannot undo a good test', () => {
    const summary = RS.applyEvents(RS.emptySummary(), [tested(9, 1, 19, 20), tested(1, 1, 3, 20)]);
    expect(summary.units['1'].testBest).toEqual({ score: 19, total: 20 });
  });

  it('best is by ratio, not by raw score', () => {
    // 8/10 beats 15/100 despite the smaller number, because they are not the
    // same paper and the raw score does not mean the same thing.
    const summary = RS.applyEvents(RS.emptySummary(), [tested(9, 1, 15, 100), tested(1, 1, 8, 10)]);
    expect(summary.units['1'].testBest).toEqual({ score: 8, total: 10 });
  });

  it('a bad retake cannot undo a passed lesson', () => {
    const summary = RS.applyEvents(RS.emptySummary(), [checked(9, 5, 5), checked(1, 1, 5)]);
    expect(summary.lessons[RS.lessonKey(L1)].state).toBe('passed');
    expect(summary.lessons[RS.lessonKey(L1)].bestRatio).toBe(1);
  });

  it('a completion date cannot move later, which is how work walks across a due date', () => {
    const first = RS.applyEvents(RS.emptySummary(), [checked(9, 5, 5)]);
    const then = RS.applyEvents(first, [checked(1, 5, 5)]);
    expect(then.lessons[RS.lessonKey(L1)].firstPassAt).toBe(NOW - 9 * DAY);
  });

  it('an out-of-order arrival still yields the earliest date', () => {
    // Batches arrive in flush order, which is not event order after an offline
    // spell: a lesson done on the train syncs after one done at a desk.
    const late = RS.applyEvents(RS.emptySummary(), [checked(1, 5, 5)]);
    const early = RS.applyEvents(late, [checked(9, 5, 5)]);
    expect(early.lessons[RS.lessonKey(L1)].firstPassAt).toBe(NOW - 9 * DAY);
  });
});

describe('folding in batches is the same as folding all at once', () => {
  /* The property that makes an incremental cache legitimate. Events arrive in
     whatever batches the flush cadence produces, and the summary must not
     depend on where those boundaries fell. */
  const events = [
    opened(9, L1), ran(8, L1), checked(7, 3, 5, L1), checked(6, 5, 5, L1),
    opened(5, L2), checked(4, 5, 5, L2),
    tested(3, 1, 18, 20), verified(3, 1),
    ev('quiz.submitted', 2, { assignmentId: 'a1', unit: 2, score: 70, total: 10 }),
  ];

  it('one batch equals nine batches', () => {
    const all = RS.applyEvents(RS.emptySummary(), events);
    let one = RS.emptySummary();
    for (const e of events) one = RS.applyEvents(one, [e]);
    expect(one).toEqual(all);
  });

  it('and equals the reverse order for everything ratcheted', () => {
    const all = RS.applyEvents(RS.emptySummary(), events);
    const reversed = RS.applyEvents(RS.emptySummary(), [...events].reverse());
    expect(reversed.lessons).toEqual(all.lessons);
    expect(reversed.units).toEqual(all.units);
    expect(reversed.quizzes).toEqual(all.quizzes);
    expect(reversed.lastEventAt).toEqual(all.lastEventAt);
  });

  it('does not mutate the summary it was given', () => {
    const before = RS.emptySummary();
    RS.applyEvents(before, events);
    expect(before).toEqual(RS.emptySummary());
  });
});

describe('the shape matches what the rules will accept', () => {
  it('carries exactly the keys firestore.rules pins', () => {
    const summary = RS.applyEvents(RS.emptySummary(), [checked(1, 5, 5)]);
    expect(Object.keys(summary).sort())
      .toEqual(['exercises', 'flagged', 'lastEventAt', 'lastLessonPath',
                'lessons', 'quizzes', 'schemaVersion', 'units']);
  });

  it('the rules pin the same key set this file writes', () => {
    // Both halves in one assertion, because a summary the rules reject is a
    // dashboard that silently stops updating for every student at once.
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    const block = rules.slice(rules.indexOf('match /summary/{docId}'));
    for (const key of ['schemaVersion', 'updatedAt', 'lessons', 'units', 'quizzes',
                       'exercises', 'flagged', 'lastLessonPath', 'lastEventAt']) {
      expect(block.slice(0, 2000)).toContain(`'${key}'`);
    }
  });

  it('lesson keys contain no slash, which Firestore map keys may not', () => {
    const summary = RS.applyEvents(RS.emptySummary(), [checked(1, 5, 5, L1)]);
    for (const key of Object.keys(summary.lessons)) expect(key).not.toContain('/');
  });

  it('the key escaping is injective', () => {
    // '_' is escaped before '/', so a path containing the escape sequence
    // cannot collide with one containing a slash.
    expect(RS.lessonKey('a/b')).not.toBe(RS.lessonKey('a__b'));
    expect(RS.lessonKey('a_b')).not.toBe(RS.lessonKey('a/b'));
  });
});

describe('the pass mark does not drift between the two implementations', () => {
  it('roster-summary.js uses the same mark as classroom-core.js', () => {
    const summarySrc = fs.readFileSync('assets/js/roster-summary.js', 'utf8');
    const coreSrc = fs.readFileSync('assets/js/classroom-core.js', 'utf8');
    const mark = /UNIT_TEST_PASS_MARK = (\d+)/;
    expect(summarySrc.match(mark)[1]).toBe(coreSrc.match(mark)[1]);
  });

  it('a paper exactly on the mark counts as passed in both', () => {
    // 7/10 is exactly 70. Compared against unitProgress().testPassed rather
    // than completedAt(): completedAt for a unit with no lesson paths reads
    // only the verification event and never consults the mark at all, so it
    // would have agreed for the wrong reason.
    const events = [tested(2, 1, 7, 10)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.units['1'].firstTestPassAt).toBe(NOW - 2 * DAY);
    expect(K.unitProgress(events, [], 1).testPassed).toBe(true);
  });

  it('and a paper one mark below it does not, in either', () => {
    const events = [tested(2, 1, 69, 100)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.units['1'].firstTestPassAt).toBe(undefined);
    expect(K.unitProgress(events, [], 1).testPassed).toBe(false);
  });
});

describe('lastEventAt', () => {
  it('is the most recent event, and matches the replay', () => {
    const events = [opened(9), ran(2), checked(5, 5, 5)];
    const summary = RS.applyEvents(RS.emptySummary(), events);
    expect(summary.lastEventAt).toBe(K.lastEventAt(events));
  });

  it('is zero for a student who has done nothing', () => {
    expect(RS.applyEvents(RS.emptySummary(), []).lastEventAt).toBe(0);
  });
});

describe('the canonical log answers every question the real one does', () => {
  /* THE TEST THAT DECIDES WHETHER ANY OF THIS IS SAFE.
   *
   * The dashboard does not read summaries directly. It expands one back into
   * the smallest event log that produces the same answers, and hands that to
   * classroom-core.js exactly as before -- so there is one implementation of
   * unitState, one of percentComplete, one of assignmentStatus, rather than a
   * parallel set to keep in agreement forever.
   *
   * That is only legitimate if the canonical log really is answer-for-answer
   * identical. So: build a realistic log, fold it, expand it, and run every
   * function the dashboard calls over BOTH, asserting they agree.
   */

  const LESSONS = {
    1: [L1, L2],
    2: [L3],
  };

  const events = [
    opened(20, L1), ran(19, L1), checked(18, 3, 5, L1), checked(17, 5, 5, L1),
    opened(16, L2), ran(15, L2), ran(14, L2), checked(13, 5, 5, L2),
    opened(10, L3), ran(9, L3), ran(8, L3), ran(7, L3),
    tested(12, 1, 18, 20),
    verified(12, 1),
    tested(6, 2, 9, 20),
    ev('answer.submitted', 11, { lessonPath: L1, itemId: 'r1', missedConcepts: true }),
    ev('answer.submitted', 5, { lessonPath: L3, itemId: 'r2', missedConcepts: true }),
    ev('quiz.submitted', 4, { assignmentId: 'a1', unit: 2, score: 70, total: 10 }),
  ];

  let real;
  let canonical;

  beforeEach(() => {
    real = events;
    canonical = RS.eventsFromSummary(RS.applyEvents(RS.emptySummary(), events));
  });

  it('is very much smaller', () => {
    // The point of the exercise. Not asserted as a ratio, because the ratio
    // grows with the student -- a term of work is 500 events and roughly the
    // same canonical log.
    expect(canonical.length).toBeLessThan(real.length);
  });

  it('agrees on every lesson state', () => {
    for (const path of [L1, L2, L3, '/units/unit-9/never.html']) {
      for (const verifiedFlag of [false, true]) {
        expect(K.lessonState(canonical, path, verifiedFlag), path)
          .toBe(K.lessonState(real, path, verifiedFlag));
      }
    }
  });

  it('agrees on verified units', () => {
    expect(K.verifiedUnits(canonical)).toEqual(K.verifiedUnits(real));
  });

  it('agrees on every unit state', () => {
    for (const unit of [1, 2, 3]) {
      expect(K.unitState(canonical, LESSONS[unit] || [], unit), `unit ${unit}`)
        .toBe(K.unitState(real, LESSONS[unit] || [], unit));
    }
  });

  it('agrees on unit progress, including the test flag', () => {
    for (const unit of [1, 2]) {
      const a = K.unitProgress(canonical, LESSONS[unit], unit);
      const b = K.unitProgress(real, LESSONS[unit], unit);
      expect(a.lessonsPassed, `unit ${unit} passed`).toBe(b.lessonsPassed);
      expect(a.lessonsStarted, `unit ${unit} started`).toBe(b.lessonsStarted);
      expect(a.testPassed, `unit ${unit} testPassed`).toBe(b.testPassed);
      expect(a.percent, `unit ${unit} percent`).toBe(b.percent);
      expect(a.state, `unit ${unit} state`).toBe(b.state);
    }
  });

  it('agrees on the overall percentage', () => {
    expect(K.percentComplete(canonical, LESSONS)).toBe(K.percentComplete(real, LESSONS));
  });

  it('agrees on lastEventAt', () => {
    expect(K.lastEventAt(canonical)).toBe(K.lastEventAt(real));
  });

  it('agrees on every completion date', () => {
    const targets = [
      { kind: 'lesson', path: L1 },
      { kind: 'lesson', path: L2 },
      { kind: 'lesson', path: L3 },
      { kind: 'unit', unit: 1, lessonPaths: LESSONS[1] },
      { kind: 'unit', unit: 2, lessonPaths: LESSONS[2] },
      { kind: 'quiz', assignmentId: 'a1' },
    ];
    for (const t of targets) {
      expect(K.completedAt(canonical, t), JSON.stringify(t))
        .toBe(K.completedAt(real, t));
    }
  });

  it('agrees on assignment status, which is what lateness is computed from', () => {
    const assignment = {
      id: 'a1', units: [1], lessonPaths: [L3],
      quiz: { unit: 2 }, dueAt: NOW - 8 * DAY,
    };
    const opts = { now: NOW, lessonsByUnit: LESSONS, lessonTitles: {} };
    const a = K.assignmentStatus(assignment, canonical, opts);
    const b = K.assignmentStatus(assignment, real, opts);
    expect(a.state).toBe(b.state);
    expect(a.parts.map((p) => [p.kind, p.done, p.completedAt]))
      .toEqual(b.parts.map((p) => [p.kind, p.done, p.completedAt]));
  });

  it('agrees on attempts per exercise, which the attention panel reads', () => {
    // Compared on the fields needsAttention uses. The synthetic log cannot
    // reproduce WHICH editor a student used on which day, and nothing reads
    // that; it must reproduce the counts and the first-try flag, and does.
    const strip = (index) => Object.values(index)
      .map((e) => [e.lessonPath, e.exerciseId, e.attempts, e.passed, e.firstTryPassed])
      .sort();
    expect(strip(K.attemptsByExercise(canonical))).toEqual(strip(K.attemptsByExercise(real)));
  });

  it('agrees on the first-try rate per unit', () => {
    for (const unit of [1, 2]) {
      expect(K.firstTryRate(canonical, unit), `unit ${unit}`)
        .toBe(K.firstTryRate(real, unit));
    }
  });

  it('agrees on flagged answers', () => {
    const strip = (list) => list.map((f) => [f.lessonPath, f.itemId, f.at]).sort();
    expect(strip(K.flaggedAnswers(canonical))).toEqual(strip(K.flaggedAnswers(real)));
  });

  it('agrees on the whole attention table', () => {
    // The end-to-end assertion: same rows, same kinds, same priorities, same
    // wording. This is what a teacher actually reads.
    const student = (evts) => ({
      uid: 'u1', displayName: 'A Student', events: evts, certificate: {},
    });
    const opts = { now: NOW, lessonTitles: {} };
    expect(K.needsAttention([student(canonical)], opts))
      .toEqual(K.needsAttention([student(real)], opts));
  });

  it('marks every synthetic event as synthetic', () => {
    for (const e of canonical) expect(e.synthetic).toBe(true);
  });
});

describe('a stuck student survives the round trip, because that row is the point', () => {
  /* The attention panel's most valuable row is "has retried this exercise N
     times without passing". It is also the one most easily lost by an
     incremental summary, because it is a COUNT rather than a best or an
     earliest. */
  const stuck = [];
  for (let i = 0; i < 9; i += 1) {
    stuck.push(ev('code.run', 5, { lessonPath: L1, editorId: 'practice1', ok: false }));
  }

  it('keeps the attempt count', () => {
    const summary = RS.applyEvents(RS.emptySummary(), stuck);
    const canonical = RS.eventsFromSummary(summary);
    const index = K.attemptsByExercise(canonical);
    const entry = Object.values(index)[0];
    expect(entry.attempts).toBe(9);
    expect(entry.passed).toBe(false);
  });

  it('and raises the same row', () => {
    const summary = RS.applyEvents(RS.emptySummary(), stuck);
    const student = (evts) => ({ uid: 'u1', displayName: 'A', events: evts, certificate: {} });
    const opts = { now: NOW, lessonTitles: {} };
    const fromCanonical = K.needsAttention([student(RS.eventsFromSummary(summary))], opts);
    const fromReal = K.needsAttention([student(stuck)], opts);
    expect(fromCanonical.filter((r) => r.kind === 'stuck'))
      .toEqual(fromReal.filter((r) => r.kind === 'stuck'));
  });

  it('a first-try pass stays a first-try pass', () => {
    const first = [checked(3, 5, 5, L1)];
    // The order matters: attemptsByExercise sets firstTryPassed only when the
    // pass is attempt number one, so the expansion has to emit it first.
    const canonical = RS.eventsFromSummary(RS.applyEvents(RS.emptySummary(), [
      ev('code.tests_passed', 3, { lessonPath: L1, editorId: 'p1', passed: 5, total: 5 }),
    ]));
    const entry = Object.values(K.attemptsByExercise(canonical))[0];
    expect(entry.firstTryPassed).toBe(true);
  });

  it('a pass after failures does not become one', () => {
    const real = [
      ev('code.run', 5, { lessonPath: L1, editorId: 'p1', ok: false }),
      ev('code.run', 4, { lessonPath: L1, editorId: 'p1', ok: false }),
      ev('code.tests_passed', 3, { lessonPath: L1, editorId: 'p1', passed: 5, total: 5 }),
    ];
    const canonical = RS.eventsFromSummary(RS.applyEvents(RS.emptySummary(), real));
    const entry = Object.values(K.attemptsByExercise(canonical))[0];
    expect(entry.firstTryPassed).toBe(false);
    expect(entry.passed).toBe(true);
    expect(entry.attempts).toBe(3);
  });
});

describe('the flagged list is capped', () => {
  it('keeps the most recent FLAGGED_CAP and no more', () => {
    const many = [];
    for (let i = 0; i < RS.FLAGGED_CAP + 15; i += 1) {
      many.push(ev('answer.submitted', 60 - i * 0.5,
        { lessonPath: L1, itemId: `r${i}`, missedConcepts: true }));
    }
    const summary = RS.applyEvents(RS.emptySummary(), many);
    expect(summary.flagged).toHaveLength(RS.FLAGGED_CAP);
    // The most recent, because the panel links to the last one.
    expect(summary.flagged[summary.flagged.length - 1].itemId)
      .toBe(`r${RS.FLAGGED_CAP + 14}`);
  });

  it('the rules cap it at the same number', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    const block = rules.slice(rules.indexOf('match /summary/{docId}'));
    expect(block.slice(0, 2000)).toContain(`flagged.size() <= ${RS.FLAGGED_CAP}`);
  });
});
