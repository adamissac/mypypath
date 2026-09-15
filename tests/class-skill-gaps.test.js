import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* The teacher's per-skill panel: counts, not scores, and never a student list. */

let G;
let CORE;
let art;
const P = '/units/unit-2/for-loop.html';
const Q = '/units/unit-3/lambda-functions.html';

const pass = (path, ed, at) => ({ type: 'code.tests_passed', at, lessonPath: path, payload: { lessonPath: path, editorId: ed, passed: 3, total: 3 } });
const fail = (path, ed, at) => ({ type: 'code.tests_passed', at, lessonPath: path, payload: { lessonPath: path, editorId: ed, passed: 1, total: 3 } });

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/class-skill-gaps.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  G = window.PyPathSkillGaps;
  CORE = window.PyPathClassroom;
  art = JSON.parse(fs.readFileSync('assets/data/model/mastery-v1.json', 'utf8'));
});

describe('classSkillGaps', () => {
  it('counts students per skill and names the lesson to revisit', () => {
    const students = [
      { uid: 'a', displayName: 'Ada', events: [fail(P, 'exercise1', 1), fail(P, 'exercise1', 2), fail(P, 'exercise1', 3)] },
      { uid: 'b', displayName: 'Bo', events: [fail(P, 'exercise1', 1)] },
      { uid: 'c', displayName: 'Cy', events: [pass(P, 'exercise1', 1)] },
    ];
    const rows = G.classSkillGaps(students, art, CORE.attemptsByExercise);
    const row = rows.find((r) => r.skill === 'py.for-loops');
    expect(row).toBeTruthy();
    expect(row).toMatchObject({ tried: 3, notYet: 2, manyTries: 1, lessonPath: P });
    expect(row.evidence).toBe('2 students of the 3 who tried its exercises have one not passed yet; 1 student has made three or more attempts at the same exercise.');
  });

  it('leaves a skill out when only one student is behind on it', () => {
    const students = [
      { uid: 'a', events: [fail(P, 'exercise1', 1)] },
      { uid: 'b', events: [pass(P, 'exercise1', 1)] },
    ];
    expect(G.classSkillGaps(students, art, CORE.attemptsByExercise).find((r) => r.skill === 'py.for-loops')).toBeUndefined();
  });

  it('never names a student and never shows a percentage', () => {
    const students = ['Ada', 'Bo', 'Cy'].map((n, i) => ({ uid: n, displayName: n, events: [fail(Q, 'exercise1', i)] }));
    const out = JSON.stringify(G.classSkillGaps(students, art, CORE.attemptsByExercise));
    for (const n of ['Ada', 'Bo', 'Cy']) expect(out).not.toContain(n);
    expect(out).not.toContain('%');
  });

  it('needs more than one student before it says anything about a skill', () => {
    const rows = G.classSkillGaps([{ uid: 'a', events: [fail(Q, 'exercise1', 1)] }], art, CORE.attemptsByExercise);
    expect(rows).toEqual([]);
  });

  it('works from the summary-expanded log the dashboard actually has', () => {
    // roster-summary.js cannot load in jsdom (top-level await over the Firebase
    // SDK); compiled with its imports stripped, as tests/roster-summary.test.js does.
    const body = fs.readFileSync('assets/js/roster-summary.js', 'utf8')
      .replace(/^import \{[^}]*\} from '\/assets\/js\/firebase-config\.js';$/m, '')
      .replace(/^const BASE = [\s\S]*?firebase-firestore\.js`\);$/m, '')
      .replace(/^import \{ counted \} from '\/assets\/js\/read-counter\.js';$/m, '')
      .replace(/\bexport (async function|function|const)/g, '$1');
    const RS = new Function('db', 'doc', 'getDoc', 'setDoc', 'serverTimestamp', 'setTimeout', 'clearTimeout',
      `${body}\nreturn { applyEvents, eventsFromSummary };`)({}, () => ({}), async () => ({}), async () => {}, () => 'ts',
      globalThis.setTimeout, globalThis.clearTimeout);
    const summary = RS.applyEvents(null, [fail(P, 'exercise1', 1), fail(P, 'exercise1', 2), fail(P, 'exercise1', 3)]);
    const rows = G.classSkillGaps([{ events: RS.eventsFromSummary(summary) }, { events: [fail(P, 'exercise1', 1)] }],
      art, CORE.attemptsByExercise);
    const row = rows.find((r) => r.skill === 'py.for-loops');
    expect(row).toMatchObject({ tried: 2, notYet: 2, manyTries: 1 });
  });
});
