import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* Per-student extensions and corrected marks, as the dashboard applies them.
 *
 * The rules are argued in tests/rules/override-rules.test.js. This is the
 * other half: that an override actually changes what a teacher SEES, for the
 * one student it was granted to and for nobody else, and that it never hides
 * what the student actually did.
 */

let K;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  K = window.PyPathClassroom;
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 20);
const L1 = '/units/unit-1/first-program.html';

const passed = (agoDays) => ({
  type: 'code.tests_passed', at: NOW - agoDays * DAY, lessonPath: L1, unit: 1,
  payload: { lessonPath: L1, passed: 5, total: 5 },
});

const ASSIGNMENT = { id: 'a1', lessonPaths: [L1], units: [], dueAt: NOW - 5 * DAY };
const OPTS = { now: NOW, lessonsByUnit: { 1: [L1] }, lessonTitles: {} };

const ext = (dueAt, extra) => ({
  kind: 'due', assignmentId: 'a1', dueAt, reason: 'IEP: extended time',
  byUid: 't1', byName: 'Ms Teacher', ...extra,
});

describe('an extension moves the deadline for one student', () => {
  it('a student who finished after the class date is late without one', () => {
    const s = K.assignmentStatus(ASSIGNMENT, [passed(2)], OPTS);
    expect(s.state).toBe('done-late');
  });

  it('and on time with one', () => {
    // Finished on day 2; class due day 5; extension to day 1.
    const s = K.assignmentStatus(ASSIGNMENT, [passed(2)], {
      ...OPTS, overrides: [ext(NOW - 1 * DAY)],
    });
    expect(s.state).toBe('done-on-time');
  });

  it('an unfinished student stops being overdue until the new date', () => {
    const overdue = K.assignmentStatus(ASSIGNMENT, [], OPTS);
    expect(overdue.state).toBe('overdue');
    const extended = K.assignmentStatus(ASSIGNMENT, [], {
      ...OPTS, overrides: [ext(NOW + 3 * DAY)],
    });
    expect(extended.state).toBe('not-due');
  });

  it('the new date is reported, so nothing reads "on time" unexplained', () => {
    /* A row reading "on time" with no sign its deadline was moved misleads
       whoever reads it next, including the teacher who granted the extension
       and has since forgotten they did. */
    const s = K.assignmentStatus(ASSIGNMENT, [passed(2)], {
      ...OPTS, overrides: [ext(NOW - 1 * DAY)],
    });
    expect(s.extended).toBeTruthy();
    expect(s.extended.byName).toBe('Ms Teacher');
    expect(s.extended.reason).toBe('IEP: extended time');
    expect(s.dueAt).toBe(NOW - 1 * DAY);
  });

  it('reports nothing when there is no extension', () => {
    expect(K.assignmentStatus(ASSIGNMENT, [passed(2)], OPTS).extended).toBe(null);
  });
});

describe('an extension cannot be used as a punishment', () => {
  it('an EARLIER date is ignored', () => {
    /* Moving a deadline earlier for one student is a punishment with no name
       in any policy, and the accommodation this exists for is by definition
       more time. Enforced in the rules and the store; honoured here too so a
       document written before either existed cannot shorten a deadline. */
    const s = K.assignmentStatus(ASSIGNMENT, [passed(2)], {
      ...OPTS, overrides: [ext(NOW - 9 * DAY)],
    });
    expect(s.dueAt).toBe(ASSIGNMENT.dueAt);
    expect(s.state).toBe('done-late');
    expect(s.extended).toBe(null);
  });
});

describe('an extension applies to one assignment and one student', () => {
  it('ignores an override for a different assignment', () => {
    const s = K.assignmentStatus(ASSIGNMENT, [passed(2)], {
      ...OPTS, overrides: [ext(NOW + 5 * DAY, { assignmentId: 'a2' })],
    });
    expect(s.state).toBe('done-late');
    expect(s.extended).toBe(null);
  });

  it('ignores an override of the wrong kind', () => {
    const s = K.assignmentStatus(ASSIGNMENT, [passed(2)], {
      ...OPTS,
      overrides: [{ kind: 'grade', unit: 1, score: 99, outOf: 100, assignmentId: 'a1' }],
    });
    expect(s.state).toBe('done-late');
  });

  it('the overrides travel with the student, not the assignment', () => {
    // Two students, same assignment, one extension. This is the whole point:
    // a 504 accommodation must not silently be given to the class.
    const src = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');
    expect(src).toContain('overrides: student.overrides || []');
  });
});

describe('a corrected mark says it was corrected', () => {
  const src = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');

  it('keeps the original score on the row', () => {
    /* A corrected score that hid what the student actually scored would
       destroy the evidence this page exists to provide. */
    expect(src).toContain('original: best.score');
  });

  it('records who adjusted it', () => {
    // And one that hid who corrected it would be worse.
    expect(src).toContain('adjustedBy: o.byName');
  });

  it('marks the cell, not only the tooltip', () => {
    // A mark a teacher changed and a mark a student earned are different facts
    // and must not look identical.
    expect(src).toContain("el('abbr', 'cr-roster__adj'");
    expect(src).toContain('Adjusted from ');
  });

  it('scales the correction to the same scale the column uses', () => {
    // The column is out of 100; an override recorded out of 20 must not render
    // as 18%.
    expect(src).toContain('Math.round((Number(o.score) / outOf) * 100)');
  });

  it('only applies to the unit it was written for', () => {
    expect(src).toContain('Number(o.unit) !== best.unit');
  });
});

describe('the store refuses the adjustments that would be indefensible', () => {
  const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
  const fn = (name) => {
    const i = store.indexOf(`export async function ${name}`);
    const j = store.indexOf('\nexport ', i + 1);
    return store.slice(i, j === -1 ? store.length : j);
  };

  it('an extension must be later than the class date', () => {
    expect(fn('setDueOverride')).toContain("'not-later'");
  });

  it('a grade change requires a reason', () => {
    /* This record is the thing a teacher will be asked about at a parents'
       evening eighteen months from now, and "37 -> 62, no reason given, by
       someone" is not a defensible answer. */
    expect(fn('setGradeOverride')).toContain("'no-reason'");
  });

  it('a grade change is bounded by the paper it is on', () => {
    expect(fn('setGradeOverride')).toContain('marks > total');
  });

  it('one override per kind per target, so it replaces rather than stacks', () => {
    expect(store).toContain('function overrideId(kind, key)');
  });

  it('withdrawing deletes rather than writing a counter-override', () => {
    /* The student's own record was never touched, so removing the override
       returns the view to what they actually did -- which is the correct
       meaning of "I was wrong about that extension". */
    expect(fn('clearOverride')).toContain('deleteDoc');
  });
});
