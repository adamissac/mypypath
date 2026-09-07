import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* A year-long course crosses the 180-day retention line.
 *
 * Events are deleted after 180 days by rule, and before Phase 2 the dashboard
 * derived every cell by replaying them. A student in a September-to-June course
 * would have had their first two terms silently vanish from their teacher's
 * grid in March -- not as an error, as a student who appeared to have done
 * nothing until spring.
 *
 * The audit asked whether the roster summary is the fix. It is, and this is
 * the proof: the summary is a durable fold, so what it records survives the
 * events that produced it being deleted.
 */

let K;
let RS;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/unit-progress.js', 'utf8')).call(window);
  K = window.PyPathClassroom;

  const src = fs.readFileSync('assets/js/roster-summary.js', 'utf8');
  const body = src
    .replace(/^import \{[^}]*\} from '\/assets\/js\/firebase-config\.js';$/m, '')
    .replace(/^const BASE = [\s\S]*?firebase-firestore\.js`\);$/m, '')
    .replace(/^import \{ counted \} from '\/assets\/js\/read-counter\.js';$/m, '')
    .replace(/\bexport (async function|function|const)/g, '$1');
  RS = new Function(
    'db', 'doc', 'getDoc', 'setDoc', 'serverTimestamp', 'counted',
    `${body}\nreturn { applyEvents, emptySummary, eventsFromSummary, lessonKey };`
  )({}, () => ({}), null, null, () => null, (x) => x);
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 15);          // mid-June
const SEPT = NOW - 280 * DAY;                // the previous September
const RETENTION_DAYS = 180;

const L = (u, n) => `/units/unit-${u}/lesson-${n}.html`;

/* A year of work: two units finished in the autumn term, one in the spring,
   one in progress now. The autumn events are older than the retention window
   and would be gone. */
function yearOfEvents() {
  const events = [];
  const add = (daysAgo, type, lessonPath, payload) => events.push({
    type, at: NOW - daysAgo * DAY, lessonPath: lessonPath || '',
    unit: (payload && payload.unit) || 0, payload: payload || {},
  });

  // Autumn term: units 1 and 2, ~250 and ~210 days ago. Well past 180.
  for (const [unit, days] of [[1, 250], [2, 210]]) {
    for (let n = 1; n <= 3; n += 1) {
      add(days, 'code.tests_passed', L(unit, n),
        { lessonPath: L(unit, n), passed: 5, total: 5 });
    }
    add(days - 1, 'test.submitted', '', { unit, score: 18, total: 20 });
    add(days - 1, 'unit.completed', '', { unit, verified: true });
  }
  // Spring term: unit 3, 90 days ago. Inside the window.
  for (let n = 1; n <= 3; n += 1) {
    add(90, 'code.tests_passed', L(3, n), { lessonPath: L(3, n), passed: 5, total: 5 });
  }
  add(89, 'test.submitted', '', { unit: 3, score: 16, total: 20 });
  // Now: unit 4 in progress.
  add(2, 'code.run', L(4, 1), { lessonPath: L(4, 1), editorId: 'e1', ok: true });
  return events;
}

const ALL = yearOfEvents();
const SURVIVING = ALL.filter((e) => (NOW - e.at) / DAY < RETENTION_DAYS);

const LESSONS = {
  1: [L(1, 1), L(1, 2), L(1, 3)],
  2: [L(2, 1), L(2, 2), L(2, 3)],
  3: [L(3, 1), L(3, 2), L(3, 3)],
  4: [L(4, 1)],
};

describe('the fixture is the situation being tested', () => {
  it('has events on both sides of the retention line', () => {
    expect(ALL.length).toBeGreaterThan(SURVIVING.length);
    expect(SURVIVING.length).toBeGreaterThan(0);
  });

  it('the autumn term is genuinely expired', () => {
    const autumn = ALL.filter((e) => e.lessonPath.includes('unit-1'));
    expect(autumn.length).toBeGreaterThan(0);
    for (const e of autumn) expect((NOW - e.at) / DAY).toBeGreaterThan(RETENTION_DAYS);
  });
});

describe('replaying the surviving log loses the year, which is the problem', () => {
  it('units 1 and 2 read as untouched', () => {
    /* This is what the dashboard showed before the summary: a student who
       finished two units in the autumn appears in March to have done nothing
       until spring. Not an error -- a confident wrong answer. */
    expect(K.unitState(SURVIVING, LESSONS[1], 1)).toBe('not-opened');
    expect(K.unitState(SURVIVING, LESSONS[2], 2)).toBe('not-opened');
  });

  it('and their completion dates are gone', () => {
    expect(K.completedAt(SURVIVING, { kind: 'unit', unit: 1, lessonPaths: LESSONS[1] }))
      .toBe(null);
  });

  it('the overall percentage halves', () => {
    expect(K.percentComplete(SURVIVING, LESSONS))
      .toBeLessThan(K.percentComplete(ALL, LESSONS));
  });
});

describe('the summary survives the expiry, because it is a fold and not a replay', () => {
  /* The summary is written as the student works, so what it records does not
     depend on the events still existing afterwards. This is the property that
     makes it the fix for the retention problem rather than merely a
     performance optimisation. */
  /* Built in beforeAll, not at describe level: the module compile happens in
     the file's own beforeAll, and a describe body runs during collection --
     before it. */
  let summary;
  let afterExpiry;
  beforeAll(() => {
    summary = RS.applyEvents(RS.emptySummary(), ALL);
    afterExpiry = RS.eventsFromSummary(summary);
  });

  it('still knows units 1 and 2 are finished', () => {
    expect(K.unitState(afterExpiry, LESSONS[1], 1)).toBe('verified');
    expect(K.unitState(afterExpiry, LESSONS[2], 2)).toBe('verified');
  });

  it('keeps the completion dates from before the window', () => {
    const then = K.completedAt(ALL, { kind: 'unit', unit: 1, lessonPaths: LESSONS[1] });
    const now = K.completedAt(afterExpiry, { kind: 'unit', unit: 1, lessonPaths: LESSONS[1] });
    expect(now).toBe(then);
  });

  it('keeps the autumn test scores', () => {
    expect(summary.units['1'].testBest).toEqual({ score: 18, total: 20 });
    expect(summary.units['2'].testBest).toEqual({ score: 18, total: 20 });
  });

  it('reports the same overall percentage as the full log', () => {
    expect(K.percentComplete(afterExpiry, LESSONS))
      .toBe(K.percentComplete(ALL, LESSONS));
  });

  it('and the same per-lesson states', () => {
    for (const paths of Object.values(LESSONS)) {
      for (const p of paths) {
        expect(K.lessonState(afterExpiry, p, false), p)
          .toBe(K.lessonState(ALL, p, false));
      }
    }
  });
});

describe('a later fold does not undo an earlier one', () => {
  /* The mechanism that makes the above true: applyEvents ratchets, so the
     spring term's events are folded into a summary that already holds the
     autumn's, rather than replacing it. */
  it('folding only the surviving events into an existing summary keeps the autumn', () => {
    const autumn = RS.applyEvents(RS.emptySummary(), ALL.filter((e) => (NOW - e.at) / DAY >= 180));
    const both = RS.applyEvents(autumn, SURVIVING);
    expect(both.units['1'].verifiedAt).toBe(autumn.units['1'].verifiedAt);
    expect(Object.keys(both.lessons).length)
      .toBeGreaterThan(Object.keys(RS.applyEvents(RS.emptySummary(), SURVIVING).lessons).length);
  });
});

describe('the backfill refuses to overwrite a summary the log can no longer support', () => {
  it('has the guard, and says why', () => {
    /* The one place this could still go wrong: running the backfill against a
       year-old class would rebuild each summary from the SURVIVING events and
       delete two terms of somebody's record. */
    const src = fs.readFileSync('scripts/backfill-roster-summaries.mjs', 'utf8');
    expect(src).toContain('function wouldLoseHistory');
    expect(src).toContain('180');
    expect(src).toMatch(/has\(existing\.lessons\) > has\(rebuilt\.lessons\)/);
  });
});
