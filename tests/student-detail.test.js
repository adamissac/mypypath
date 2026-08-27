import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let K;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  K = window.PyPathClassroom;
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 22, 12);
const L1 = '/units/unit-1/first-program.html';
const L2 = '/units/unit-1/syntax-indentation.html';
const LESSONS = [
  { path: L1, title: 'Your First Program', unit: 1, order: 3 },
  { path: L2, title: 'Syntax and Indentation', unit: 1, order: 4 },
];

function ev(type, agoDays, payload) {
  return {
    type,
    at: NOW - agoDays * DAY,
    lessonPath: (payload && payload.lessonPath) || L1,
    unit: 1,
    payload: payload || { lessonPath: L1 },
  };
}

describe('the timeline', () => {
  it('groups events into days, newest day first', () => {
    const days = K.groupByDay([ev('lesson.opened', 0), ev('code.run', 0), ev('code.run', 3)]);
    expect(days.length).toBe(2);
    expect(days[0].count).toBe(2);
    expect(days[1].count).toBe(1);
    expect(days[0].day > days[1].day).toBe(true);
  });

  it('orders events newest first within a day', () => {
    const days = K.groupByDay([
      { type: 'code.run', at: NOW - 3600000, payload: {} },
      { type: 'lesson.opened', at: NOW, payload: {} },
    ]);
    expect(days[0].events[0].type).toBe('lesson.opened');
  });

  it('opens the most recent day and collapses the rest', () => {
    const days = K.groupByDay([ev('lesson.opened', 0), ev('code.run', 3), ev('code.run', 9)]);
    expect(days[0].open).toBe(true);
    expect(days.slice(1).every((d) => d.open === false)).toBe(true);
  });

  it('can be asked to collapse everything', () => {
    const days = K.groupByDay([ev('lesson.opened', 0)], { openLatest: false });
    expect(days[0].open).toBe(false);
  });

  it('ignores events with no usable timestamp', () => {
    expect(K.groupByDay([{ type: 'code.run', at: null, payload: {} }])).toEqual([]);
  });

  it('handles a student with no events', () => {
    expect(K.groupByDay([])).toEqual([]);
  });
});

describe('the per-lesson table', () => {
  it('lists only lessons the student has actually touched', () => {
    const rows = K.perLessonRows([ev('lesson.opened', 0)], LESSONS);
    expect(rows.map((r) => r.lessonPath)).toEqual([L1]);
  });

  it('reports state, attempts and last activity', () => {
    const events = [
      ev('lesson.opened', 1),
      ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'exercise1', passed: 3, total: 3 }),
    ];
    const row = K.perLessonRows(events, LESSONS)[0];
    expect(row.title).toBe('Your First Program');
    expect(row.state).toBe('passed');
    expect(row.attempts).toBe(1);
    expect(row.lastActivity).toBeGreaterThan(0);
  });

  it('reports a first-try rate over the lesson\'s exercises', () => {
    const events = [
      ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e1', passed: 3, total: 3 }),
      ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e2', passed: 1, total: 3 }),
      ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e2', passed: 3, total: 3 }),
    ];
    expect(K.perLessonRows(events, LESSONS)[0].firstTryRate).toBe(0.5);
  });

  it('leaves the first-try rate blank when nothing was attempted', () => {
    // "Nothing attempted" and "failed everything" are different facts and
    // must not render the same.
    const row = K.perLessonRows([ev('lesson.opened', 0)], LESSONS)[0];
    expect(row.firstTryRate).toBe(null);
    expect(row.exercises).toBe(0);
  });

  it('puts the most recently touched lesson first', () => {
    const events = [
      ev('lesson.opened', 5, { lessonPath: L1 }),
      ev('lesson.opened', 1, { lessonPath: L2 }),
    ];
    expect(K.perLessonRows(events, LESSONS)[0].lessonPath).toBe(L2);
  });
});

describe('the header figures', () => {
  it('counts verified units and percent complete', () => {
    const student = {
      uid: 'a',
      displayName: 'ann',
      joinedAt: NOW - 30 * DAY,
      lastActiveAt: NOW - DAY,
      events: [
        ev('unit.completed', 1, { unit: 1, verified: true }),
        ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e1', passed: 3, total: 3 }),
      ],
    };
    const header = K.studentHeader(student, { 1: [L1, L2] });
    expect(header.displayName).toBe('ann');
    expect(header.unitsVerified).toBe(1);
    // 50%, not 100%. The unit test was passed, but the second lesson was never
    // opened, and "lessons passed" has to mean lessons passed. In practice a
    // unit only verifies once every lesson in it has passed, so this state is
    // artificial -- but if the roll-up rule is ever loosened, the header must
    // report what happened rather than what the badge implies.
    expect(header.percentComplete).toBe(50);
  });

  it('does not let a verified unit mark an unopened lesson as done', () => {
    const events = [
      { type: 'unit.completed', at: NOW, lessonPath: L1, unit: 1,
        payload: { unit: 1, verified: true } },
    ];
    expect(K.lessonState(events, L2, true)).toBe('not-opened');
    expect(K.percentComplete(events, { 1: [L1, L2] })).toBe(50);
  });

  it('takes the later of the roster heartbeat and the last event', () => {
    const student = {
      uid: 'a', displayName: 'ann', joinedAt: 0, lastActiveAt: NOW - 10 * DAY,
      events: [ev('lesson.opened', 1)],
    };
    expect(K.studentHeader(student, {}).lastActiveAt).toBe(NOW - DAY);
  });

  it('falls back to the uid when there is no display name', () => {
    expect(K.studentHeader({ uid: 'abc', events: [] }, {}).displayName).toBe('abc');
  });
});

describe('the drill-down view', () => {
  const src = fs.readFileSync('assets/js/student-detail.js', 'utf8');
  const html = fs.readFileSync('classroom.html', 'utf8');

  it('is read-only, with no write anywhere in the module', () => {
    for (const banned of ['setDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'addDoc']) {
      expect(src, `drill-down must not call ${banned}`).not.toContain(banned);
    }
  });

  /* The property is read-only, not a particular arity. A teacher who could
     write into a student's record could also produce a record of them having
     answered, so this asserts that nothing that writes is even in scope. */
  it('imports reads and nothing that writes', () => {
    expect(src).toMatch(/import \{\s*readEvents, readMirror, readAssignments,\s*\} from/);
    const imported = /import \{([^}]*)\} from '\/assets\/js\/classroom-store\.js'/.exec(src);
    expect(imported).toBeTruthy();
    for (const name of imported[1].split(',').map((n) => n.trim()).filter(Boolean)) {
      expect(name, name).toMatch(/^read/);
    }
  });

  it('shows what the exercise had to do, beside the student\'s code', () => {
    expect(src).toMatch(/function expectationPanel/);
    expect(src).toMatch(/expectationsFor\(lessonPath\)/);
    expect(src).toMatch(/el\('div', 'sd-pair'\)/);
  });

  it('recovers the lesson and editor from the saved-code key', () => {
    // pypath-lesson-<path>-<type>-<id>, so the right expectations land beside
    // the right code.
    const re = /\^pypath-lesson-\(\.\+\)-\(code\|reflection\)-\(\.\+\)\$/;
    expect(src).toMatch(re);
    const parse = new RegExp('^pypath-lesson-(.+)-(code|reflection)-(.+)$');
    const m = parse.exec('pypath-lesson-/units/unit-1/first-program.html-code-exercise1');
    expect(m[1]).toBe('/units/unit-1/first-program.html');
    expect(m[3]).toBe('exercise1');
  });

  it('states the expected behaviour rather than a single sample solution', () => {
    // A lone sample invites reading any difference from it as a mistake.
    expect(src).toMatch(/What it had to do/);
    expect(src).toMatch(/invites reading any difference from it as a mistake/);
  });

  it('carries no dead declarations', () => {
    // Matching the declaration, not the bare name: SNAPSHOTS_PREFIX is a real
    // use and contains the same letters.
    expect(src).not.toMatch(/const SNAPS =/);
    expect(src).not.toMatch(/let current\b/);
  });

  it('renders student code into a pre, never an editable field', () => {
    expect(src).toMatch(/el\('pre', 'sd-code'\)/);
    expect(src).not.toMatch(/contentEditable|<textarea|createElement\('textarea'\)/);
  });

  it('says on the page that it is read-only', () => {
    expect(html).toContain('This is a read-only view');
  });

  it('collapses the timeline with details, so the browser owns the behaviour', () => {
    // <details> is keyboard operable and announced correctly with no script.
    expect(src).toMatch(/createElement\('details'\)/);
    expect(src).toMatch(/details\.open = day\.open/);
  });

  it('describes events in words rather than showing raw type names', () => {
    expect(src).toMatch(/case 'code\.tests_passed':/);
    expect(src).toMatch(/'Opened ' \+ title/);
  });

  it('offers a labelled scrubber over the snapshots', () => {
    expect(src).toMatch(/slider\.type = 'range'/);
    expect(src).toMatch(/label\.setAttribute\('for', sliderId\)/);
  });

  it('labels a large insertion neutrally and explains it', () => {
    expect(src).toMatch(/flag\.textContent = 'Large paste'/);
    expect(src).toMatch(/data-cr-info', 'largePaste'/);
    // No verdict vocabulary anywhere in the view.
    for (const banned of ['plagiar', 'cheat', 'suspicious', 'integrity score']) {
      expect(src.toLowerCase()).not.toContain(banned);
    }
  });

  it('explains the large paste label as a question, not evidence', () => {
    expect(K.EXPLANATIONS.largePaste).toMatch(/ask a question/);
    expect(K.EXPLANATIONS.largePaste).toMatch(/look the same here/);
  });

  it('shows a username, never a legal name', () => {
    const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');
    expect(dash).toMatch(/displayName: student\.displayName/);
    for (const banned of ['firstName', 'lastName', 'realName', 'fullName', '\\.email']) {
      expect(src).not.toMatch(new RegExp(banned));
    }
  });

  it('closes on Escape and returns focus to a real button', () => {
    expect(src).toMatch(/e\.key === 'Escape'/);
    expect(src).toMatch(/close\.focus\(\)/);
  });

  it('is announced as busy while it loads', () => {
    expect(src).toMatch(/setAttribute\('aria-busy', 'true'\)/);
    expect(src).toMatch(/setAttribute\('aria-busy', 'false'\)/);
  });

  it('scopes its table headers', () => {
    expect(src).toMatch(/th\.scope = 'row'/);
    const section = html.slice(html.indexOf('data-sd-lessons'), html.indexOf('data-sd-lessons-empty'));
    const headers = [...section.matchAll(/<th\b([^>]*)>/g)].map((m) => m[1]);
    expect(headers.length).toBeGreaterThan(0);
    for (const attrs of headers) expect(attrs).toMatch(/scope="col"/);
  });
});
