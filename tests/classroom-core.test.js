import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let K;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  K = window.PyPathClassroom;
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 22);
const L1 = '/units/unit-1/first-program.html';
const L2 = '/units/unit-1/syntax-indentation.html';

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
const ran = (d, id, p) => ev('code.run', d, { lessonPath: p || L1, editorId: id, ok: true });
const checked = (d, id, passed, total, p) =>
  ev('code.tests_passed', d, { lessonPath: p || L1, editorId: id, passed, total });

describe('lesson mastery states', () => {
  it('reads no events at all as not opened', () => {
    expect(K.lessonState([], L1, false)).toBe('not-opened');
  });

  it('does not treat another lesson\'s events as this one\'s', () => {
    expect(K.lessonState([opened(1, L2)], L1, false)).toBe('not-opened');
  });

  it('reads opened with nothing tried as in progress', () => {
    expect(K.lessonState([opened(1)], L1, false)).toBe('in-progress');
  });

  it('reads a run as attempted', () => {
    expect(K.lessonState([opened(1), ran(1, 'exercise1')], L1, false)).toBe('attempted');
  });

  it('reads a saved reflection answer as attempted', () => {
    const answered = ev('answer.submitted', 1, { lessonPath: L1, exerciseId: 'exercise1', attempt: 1 });
    expect(K.lessonState([opened(1), answered], L1, false)).toBe('attempted');
  });

  it('reads a partial check result as attempted, not passed', () => {
    expect(K.lessonState([checked(1, 'exercise1', 2, 3)], L1, false)).toBe('attempted');
  });

  it('reads every check passing as passed', () => {
    expect(K.lessonState([checked(1, 'exercise1', 3, 3)], L1, false)).toBe('passed');
  });

  it('keeps the best result rather than the latest', () => {
    // A student who passed and then broke their code has still demonstrated it.
    const events = [checked(2, 'exercise1', 3, 3), checked(1, 'exercise1', 1, 3)];
    expect(K.lessonState(events, L1, false)).toBe('passed');
  });

  it('reads a verified unit as verified regardless of lesson detail', () => {
    expect(K.lessonState([opened(1)], L1, true)).toBe('verified');
  });

  it('offers a distinct mark and label for every state, so colour is never alone', () => {
    for (const state of K.MASTERY) {
      expect(K.MASTERY_LABEL[state]).toBeTruthy();
      expect(K.MASTERY_MARK[state]).toBeTruthy();
    }
    expect(new Set(Object.values(K.MASTERY_MARK)).size).toBe(K.MASTERY.length);
  });
});

describe('unit mastery states', () => {
  const lessons = [L1, L2];

  it('is not opened when no lesson in it has been', () => {
    expect(K.unitState([], lessons, 1)).toBe('not-opened');
  });

  it('takes the weakest lesson, not the average', () => {
    // One finished lesson must not hide one untouched lesson.
    const events = [checked(1, 'exercise1', 3, 3, L1)];
    expect(K.unitState(events, lessons, 1)).toBe('attempted');
  });

  it('is passed only when every lesson passes', () => {
    const events = [checked(1, 'e1', 3, 3, L1), checked(1, 'e1', 2, 2, L2)];
    expect(K.unitState(events, lessons, 1)).toBe('passed');
  });

  it('is verified when the unit test was passed', () => {
    const done = ev('unit.completed', 1, { unit: 1, verified: true });
    expect(K.unitState([done], lessons, 1)).toBe('verified');
  });

  it('is not verified when the unit was only self-reported', () => {
    const done = ev('unit.completed', 1, { unit: 1, verified: false });
    expect(K.unitState([done, checked(1, 'e1', 3, 3, L1)], lessons, 1)).not.toBe('verified');
  });
});

describe('percent complete', () => {
  it('counts passed and verified lessons out of the whole course', () => {
    const lessonsByUnit = { 1: [L1, L2] };
    expect(K.percentComplete([], lessonsByUnit)).toBe(0);
    expect(K.percentComplete([checked(1, 'e1', 3, 3, L1)], lessonsByUnit)).toBe(50);
    expect(K.percentComplete(
      [checked(1, 'e1', 3, 3, L1), checked(1, 'e1', 1, 1, L2)], lessonsByUnit
    )).toBe(100);
  });

  it('is zero rather than NaN with no lessons', () => {
    expect(K.percentComplete([], {})).toBe(0);
  });
});

describe('needs attention', () => {
  const titles = { [L1]: 'Your First Program', [L2]: 'Syntax and Indentation' };
  const opts = { now: NOW, lessonTitles: titles };

  it('flags an enrolled student with no activity at all', () => {
    const rows = K.needsAttention([{ uid: 'a', displayName: 'ann', events: [] }], opts);
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe('never-started');
    expect(rows[0].nextStep).toBeTruthy();
  });

  it('flags three failed attempts at the same exercise', () => {
    const events = [
      opened(1),
      checked(1, 'exercise1', 1, 3),
      checked(1, 'exercise1', 1, 3),
      checked(1, 'exercise1', 2, 3),
    ];
    const rows = K.needsAttention([{ uid: 'a', displayName: 'ann', events }], opts);
    const stuck = rows.filter((r) => r.kind === 'stuck');
    expect(stuck.length).toBe(1);
    expect(stuck[0].reason).toContain('3 times');
    expect(stuck[0].lessonPath).toBe(L1);
    expect(stuck[0].exerciseId).toBe('exercise1');
  });

  it('does not flag two failed attempts, which is a normal amount of wrong', () => {
    const events = [opened(1), checked(1, 'exercise1', 1, 3), checked(1, 'exercise1', 2, 3)];
    const rows = K.needsAttention([{ uid: 'a', displayName: 'ann', events }], opts);
    expect(rows.filter((r) => r.kind === 'stuck')).toEqual([]);
  });

  it('stops flagging as stuck once the exercise passes', () => {
    const events = [
      checked(1, 'exercise1', 1, 3),
      checked(1, 'exercise1', 1, 3),
      checked(1, 'exercise1', 3, 3),
    ];
    const rows = K.needsAttention([{ uid: 'a', displayName: 'ann', events }], opts);
    expect(rows.filter((r) => r.kind === 'stuck')).toEqual([]);
  });

  it('flags a student idle for a week', () => {
    const rows = K.needsAttention(
      [{ uid: 'a', displayName: 'ann', events: [opened(9), ran(9, 'e1')] }], opts
    );
    const idle = rows.filter((r) => r.kind === 'idle');
    expect(idle.length).toBe(1);
    expect(idle[0].reason).toContain('9 days');
  });

  it('does not flag a student who was here yesterday', () => {
    const rows = K.needsAttention(
      [{ uid: 'a', displayName: 'ann', events: [opened(1)] }], opts
    );
    expect(rows.filter((r) => r.kind === 'idle')).toEqual([]);
  });

  it('flags a low first-try rate across a unit', () => {
    const events = [
      checked(1, 'e1', 1, 3), checked(1, 'e1', 3, 3),
      checked(1, 'e2', 1, 3), checked(1, 'e2', 3, 3),
      checked(1, 'e3', 1, 3), checked(1, 'e3', 3, 3),
    ];
    const rows = K.needsAttention([{ uid: 'a', displayName: 'ann', events }], opts);
    const concept = rows.filter((r) => r.kind === 'concept');
    expect(concept.length).toBe(1);
    expect(concept[0].reason).toContain('Unit 1');
  });

  it('does not call two exercises a pattern', () => {
    const events = [checked(1, 'e1', 1, 3), checked(1, 'e2', 1, 3)];
    const rows = K.needsAttention([{ uid: 'a', displayName: 'ann', events }], opts);
    expect(rows.filter((r) => r.kind === 'concept')).toEqual([]);
  });

  it('puts the most urgent kind first', () => {
    const students = [
      { uid: 'a', displayName: 'ann', events: [] },
      {
        uid: 'b',
        displayName: 'bo',
        events: [checked(1, 'e1', 1, 3), checked(1, 'e1', 1, 3), checked(1, 'e1', 1, 3)],
      },
    ];
    const rows = K.needsAttention(students, opts);
    expect(rows[0].kind).toBe('stuck');
  });

  it('describes what happened and never what the student is', () => {
    const students = [
      { uid: 'a', displayName: 'ann', events: [] },
      { uid: 'b', displayName: 'bo', events: [opened(30)] },
      {
        uid: 'c',
        displayName: 'cy',
        events: [checked(1, 'e1', 0, 3), checked(1, 'e1', 0, 3), checked(1, 'e1', 0, 3)],
      },
    ];
    const text = JSON.stringify(K.needsAttention(students, opts)).toLowerCase();
    for (const word of ['weak', 'lazy', 'poor', 'bad student', 'struggler', 'failing student']) {
      expect(text, `should not describe a student as "${word}"`).not.toContain(word);
    }
  });

  it('gives every row a next step and somewhere to go', () => {
    const students = [
      { uid: 'a', displayName: 'ann', events: [] },
      { uid: 'b', displayName: 'bo', events: [opened(30)] },
    ];
    for (const row of K.needsAttention(students, opts)) {
      expect(row.nextStep, row.kind).toBeTruthy();
      expect(row.lessonPath, row.kind).toBeTruthy();
      expect(row.displayName, row.kind).toBeTruthy();
    }
  });
});

describe('class summary', () => {
  const titles = { [L1]: 'Your First Program' };
  const opts = { now: NOW, lessonTitles: titles };

  it('reports the median unit reached, not the mean', () => {
    const students = [
      { uid: 'a', events: [ev('lesson.opened', 1, { unit: 1 })] },
      { uid: 'b', events: [ev('lesson.opened', 1, { unit: 1 })] },
      { uid: 'c', events: [ev('lesson.opened', 1, { unit: 10 })] },
    ];
    // The mean would be 4; one student racing ahead must not move the class.
    expect(K.classSummary(students, opts).medianUnitReached).toBe(1);
  });

  it('counts students active in the last week', () => {
    const students = [
      { uid: 'a', events: [opened(1)] },
      { uid: 'b', events: [opened(30)] },
      { uid: 'c', events: [] },
    ];
    expect(K.classSummary(students, opts).activeThisWeek).toBe(1);
  });

  it('names the hardest lesson by average attempts', () => {
    const students = [
      { uid: 'a', events: [ran(1, 'e1', L1), ran(1, 'e1', L1), ran(1, 'e1', L1)] },
      { uid: 'b', events: [ran(1, 'e1', L1), ran(1, 'e1', L1), ran(1, 'e1', L1)] },
    ];
    const summary = K.classSummary(students, opts);
    expect(summary.hardestLesson.lessonPath).toBe(L1);
    expect(summary.hardestLesson.title).toBe('Your First Program');
    expect(summary.hardestLesson.averageAttempts).toBe(3);
  });

  it('does not call one student\'s bad afternoon the hardest lesson', () => {
    const students = [{ uid: 'a', events: [ran(1, 'e1', L1), ran(1, 'e1', L1)] }];
    expect(K.classSummary(students, opts).hardestLesson).toBe(null);
  });

  it('reports the most common error of the week', () => {
    const err = (d, type) => ev('code.error', d, { lessonPath: L1, editorId: 'e1', errorType: type });
    const students = [
      { uid: 'a', events: [err(1, 'IndentationError'), err(2, 'IndentationError')] },
      { uid: 'b', events: [err(1, 'NameError')] },
    ];
    const summary = K.classSummary(students, opts);
    expect(summary.commonError).toEqual({ errorType: 'IndentationError', count: 2 });
  });

  it('ignores errors older than the week it claims to describe', () => {
    const err = (d, type) => ev('code.error', d, { lessonPath: L1, editorId: 'e1', errorType: type });
    const students = [{ uid: 'a', events: [err(30, 'IndentationError')] }];
    expect(K.classSummary(students, opts).commonError).toBe(null);
  });

  it('handles an empty class without dividing by zero', () => {
    const summary = K.classSummary([], opts);
    expect(summary).toMatchObject({
      students: 0, medianUnitReached: 0, activeThisWeek: 0,
      hardestLesson: null, commonError: null,
    });
  });
});

describe('what the dashboard deliberately does not compute', () => {
  it('has no engagement metrics on the public surface', () => {
    // Time on site, clicks, sessions and streaks are easy to compute and they
    // crowd out the signal, because a teacher has a few minutes and spends
    // them on whatever is biggest on the page.
    const api = Object.keys(K).join(' ').toLowerCase();
    for (const banned of ['timeonsite', 'sessioncount', 'clicks', 'streak', 'loginc']) {
      expect(api).not.toContain(banned);
    }
  });

  it('has no ranking or leaderboard', () => {
    const api = Object.keys(K).join(' ').toLowerCase();
    for (const banned of ['rank', 'leaderboard', 'position', 'topstudent']) {
      expect(api).not.toContain(banned);
    }
  });
});

describe('every metric can be interrogated', () => {
  it('explains each one in plain words', () => {
    for (const key of ['mastery', 'stuck', 'idle', 'neverStarted', 'concept',
      'medianUnit', 'activeThisWeek', 'hardestLesson', 'commonError']) {
      expect(K.EXPLANATIONS[key], key).toBeTruthy();
      expect(K.EXPLANATIONS[key].length, key).toBeGreaterThan(30);
    }
  });

  it('says out loud that the events are self-reported', () => {
    expect(K.EXPLANATIONS.trust).toMatch(/own browser/);
    expect(K.EXPLANATIONS.trust).toMatch(/not to decide a grade|not proof/);
  });
});

describe('timestamps', () => {
  it('reads the shapes Firestore hands back', () => {
    expect(K.toMillis(1000)).toBe(1000);
    expect(K.toMillis({ seconds: 2, nanoseconds: 0 })).toBe(2000);
    expect(K.toMillis({ toMillis: () => 3000 })).toBe(3000);
    expect(K.toMillis(null)).toBe(0);
    expect(K.toMillis(undefined)).toBe(0);
  });
});
