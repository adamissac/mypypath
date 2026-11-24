import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

/* The summary's WRITE path, against in-memory fakes of Firestore.
 *
 * Two bugs this pins, both of which reached the teacher's dashboard:
 *
 *   1. Events reached the summary with no time. The log gets a server time as
 *      it is written; the summary's copy never got one, so every date in a
 *      student-written summary was 0 -- and a completion at 0 is before every
 *      due date, so late work showed as on time.
 *
 *   2. A student with an event log but no summary (enrolled before summaries,
 *      missed by the backfill) got a first summary built from nothing. The
 *      dashboard switched to it and their whole history vanished from view.
 */

let RS;
let K;
let store;   // what writeSummary wrote
let log;     // the student's event log, as Firestore would return it
let summaryDoc;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/unit-progress.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  K = window.PyPathClassroom;

  const src = fs.readFileSync('assets/js/roster-summary.js', 'utf8');
  const body = src
    .replace(/^import \{[^}]*\} from '\/assets\/js\/firebase-config\.js';$/m, '')
    .replace(/^const \{[\s\S]*?\|\| \{\};$/m, '')
    .replace(/^import \{ counted \} from '\/assets\/js\/read-counter\.js';$/m, '')
    .replace(/\bexport (async function|function|const)/g, '$1');
  expect(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/\bimport\b/);

  RS = new Function(
    'db', 'doc', 'getDoc', 'getDocs', 'setDoc', 'serverTimestamp', 'collection', 'query',
    'orderBy', 'limit', 'counted', 'setTimeout', 'clearTimeout',
    `${body}\nreturn { noteEvents, flushSummary, _resetForTests, eventsFromSummary };`
  )(
    {},
    (_db, path) => ({ path }),
    async () => ({ exists: () => summaryDoc != null, data: () => summaryDoc }),
    async () => ({ docs: log.slice().sort((a, b) => b.at - a.at).map((e) => ({ data: () => e })) }),
    async (_ref, data) => { store = data; },
    () => 'server-time',
    () => ({}), () => ({}), () => ({}), () => ({}),
    (x) => x,
    globalThis.setTimeout, globalThis.clearTimeout
  );
});

beforeEach(() => {
  RS._resetForTests();
  store = null;
  log = [];
  summaryDoc = null;
});

const DAY = 86400000;
const quiz = (id, at) => ({ type: 'quiz.submitted', at, lessonPath: '', unit: 2,
  payload: { assignmentId: id, unit: 2, score: 80, correct: 4, total: 5, attempt: 1 } });
const test = (unit, score, at) => ({ type: 'test.submitted', at, lessonPath: '', unit,
  payload: { unit, score, total: 100, attempt: 1, durationSec: 60 } });

describe('every event in the summary has a time', () => {
  it('stamps a batch that arrives without one, so late work reads as late', async () => {
    summaryDoc = { units: {}, lessons: {}, quizzes: {}, exercises: {}, flagged: [] };
    const before = Date.now();
    // Exactly what events.js hands over: no `at`.
    const { at, ...unstamped } = quiz('q1', 0);
    RS.noteEvents('c', 'u', [unstamped]);
    await RS.flushSummary('c', 'u');
    expect(store.quizzes.q1).toBeGreaterThanOrEqual(before);

    const events = RS.eventsFromSummary(store);
    const assignment = { id: 'q1', units: [], lessonPaths: [], quiz: { unit: 2, questionIds: ['x'] },
      dueAt: before - 3 * DAY };
    expect(K.assignmentStatus(assignment, events, { now: Date.now(), lessonsByUnit: {}, lessonTitles: {} }).state)
      .toBe('done-late');
  });

  it('keeps a time that is already there', async () => {
    summaryDoc = { units: {}, lessons: {}, quizzes: {}, exercises: {}, flagged: [] };
    RS.noteEvents('c', 'u', [quiz('q1', 12345)]);
    await RS.flushSummary('c', 'u');
    expect(store.quizzes.q1).toBe(12345);
  });
});

describe('a first summary is built from the student\'s history, not from nothing', () => {
  it('carries every earlier mark when the student has a log and no summary', async () => {
    log = [test(1, 82, 1000), test(3, 96, 2000), test(2, 21, 3000)];
    // The batch being noted is the last event, already in the log.
    RS.noteEvents('c', 'u', [log[2]]);
    await RS.flushSummary('c', 'u');
    expect(store.units['1'].testBest.score).toBe(82);
    expect(store.units['3'].testBest.score).toBe(96);
    expect(store.units['2'].testBest.score).toBe(21);
  });

  it('does not count the batch twice', async () => {
    log = [quiz('q1', 1000)];
    RS.noteEvents('c', 'u', [log[0]]);
    await RS.flushSummary('c', 'u');
    expect(Object.keys(store.quizzes)).toEqual(['q1']);
    expect(store.quizzes.q1).toBe(1000);
  });

  it('still builds on an existing summary without reading the log', async () => {
    summaryDoc = { lastEventAt: 5, units: { 1: { testBest: { score: 60, total: 100 } } },
      lessons: {}, quizzes: {}, exercises: {}, flagged: [] };
    log = [test(4, 99, 5)]; // must NOT be read
    RS.noteEvents('c', 'u', [test(2, 75, 10)]);
    await RS.flushSummary('c', 'u');
    expect(store.units['1'].testBest.score).toBe(60);
    expect(store.units['2'].testBest.score).toBe(75);
    expect(store.units['4']).toBeUndefined();
  });
});

describe('a summary written without dates is repaired from the log', () => {
  it('rebuilds a summary whose every date is 0, so old late work is late again', async () => {
    summaryDoc = { lastEventAt: 0, units: {}, lessons: {}, quizzes: { q1: 0 }, exercises: {}, flagged: [] };
    log = [quiz('q1', 7777), test(1, 90, 8888)];
    RS.noteEvents('c', 'u', [log[1]]);
    await RS.flushSummary('c', 'u');
    expect(store.quizzes.q1).toBe(7777);
    expect(store.lastEventAt).toBe(8888);
  });

  it('leaves a dated summary alone', async () => {
    summaryDoc = { lastEventAt: 50, units: {}, lessons: {}, quizzes: { q1: 50 }, exercises: {}, flagged: [] };
    log = [quiz('q1', 1)];
    RS.noteEvents('c', 'u', [test(2, 70, 60)]);
    await RS.flushSummary('c', 'u');
    expect(store.quizzes.q1).toBe(50);
  });
});
