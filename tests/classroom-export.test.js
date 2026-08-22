import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let X;
let K;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-export.js', 'utf8')).call(window);
  X = window.PyPathExport;
  K = window.PyPathClassroom;
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 22);
const L1 = '/units/unit-1/first-program.html';

function ev(type, agoDays, payload) {
  return {
    type, at: NOW - agoDays * DAY, lessonPath: L1, unit: 1,
    payload: payload || { lessonPath: L1 },
  };
}

describe('CSV escaping', () => {
  it('leaves a plain field alone', () => {
    expect(X.csvField('ann')).toBe('ann');
    expect(X.csvField("O'Brien")).toBe("O'Brien");
  });

  it('quotes a field containing a comma', () => {
    expect(X.csvField('Smith, Jo')).toBe('"Smith, Jo"');
  });

  it('doubles an embedded quote', () => {
    expect(X.csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a field containing a newline', () => {
    expect(X.csvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('handles null and undefined as empty', () => {
    expect(X.csvField(null)).toBe('');
    expect(X.csvField(undefined)).toBe('');
  });

  it('defuses a field a spreadsheet would run as a formula', () => {
    // Usernames are user-controlled text, and Excel treats a leading =, +, -
    // or @ as the start of a formula.
    expect(X.csvField('=1+1')).toBe("'=1+1");
    expect(X.csvField('+1')).toBe("'+1");
    expect(X.csvField('-1')).toBe("'-1");
    expect(X.csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(X.csvField('=cmd|\'/c calc\'!A1')).toContain("'=cmd");
  });

  it('uses CRLF line endings, as RFC 4180 and Excel expect', () => {
    expect(X.toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n');
  });
});

describe('the mastery grid export', () => {
  const students = [
    {
      uid: 'a', displayName: 'ann', joinedAt: NOW - 30 * DAY, lastActiveAt: NOW - DAY,
      events: [ev('lesson.opened', 1), ev('code.tests_passed', 1,
        { lessonPath: L1, editorId: 'e1', passed: 3, total: 3 })],
    },
    { uid: 'b', displayName: 'bo', joinedAt: NOW - 30 * DAY, lastActiveAt: 0, events: [] },
  ];
  const opts = { lessonsByUnit: { 1: [L1] }, totalUnits: 10 };

  it('has a header row and one row per student', () => {
    const lines = X.masteryCsv(students, opts).trim().split('\r\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/^Student,Percent complete,Units verified,Last active,Unit 1,/);
  });

  it('has one column per unit', () => {
    const header = X.masteryCsv(students, opts).split('\r\n')[0].split(',');
    expect(header.filter((h) => /^Unit \d+$/.test(h)).length).toBe(10);
  });

  it('writes the state as a word, not the grid mark', () => {
    // A spreadsheet is not the place for a glyph whose key is on another page.
    const csv = X.masteryCsv(students, opts);
    expect(csv).toContain('Passed');
    expect(csv).toContain('Not opened');
    expect(csv).not.toMatch(/[·+*]/);
  });

  it('produces a header-only file for an empty class', () => {
    expect(X.masteryCsv([], opts).trim().split('\r\n').length).toBe(1);
  });
});

describe('the single-student export', () => {
  const student = {
    uid: 'a', displayName: 'ann',
    events: [ev('lesson.opened', 1),
      ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e1', passed: 2, total: 3 })],
  };
  const lessons = [{ path: L1, title: 'Your First Program', unit: 1, order: 3 }];

  it('names the student and the export date', () => {
    const csv = X.studentCsv(student, { lessons });
    expect(csv).toContain('Student,ann');
    expect(csv).toContain('Exported,');
  });

  it('carries the caveat in the file itself', () => {
    // A CSV outlives the page it came from and will be read by someone who
    // never saw the dashboard's caveats.
    const csv = X.studentCsv(student, { lessons });
    expect(csv).toContain('Not a grade');
    expect(csv).toContain('own browser');
  });

  it('has one row per lesson touched', () => {
    const csv = X.studentCsv(student, { lessons });
    expect(csv).toContain('Your First Program');
    expect(csv).toContain('Attempted');
  });
});

describe('the weekly digest', () => {
  const students = [
    { uid: 'a', displayName: 'ann', events: [] },
    {
      uid: 'b', displayName: 'bo',
      events: [
        ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e1', passed: 1, total: 3 }),
        ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e1', passed: 1, total: 3 }),
        ev('code.tests_passed', 1, { lessonPath: L1, editorId: 'e1', passed: 2, total: 3 }),
      ],
    },
  ];
  const opts = { now: NOW, lessonTitles: { [L1]: 'Your First Program' }, className: 'Period 1' };

  it('names the class and the week', () => {
    expect(X.digest(students, opts)).toContain('Period 1 — week to 2026-08-22');
  });

  it('lists who is worth a conversation, with the next step', () => {
    const text = X.digest(students, opts);
    expect(text).toContain('Worth a conversation:');
    expect(text).toContain('bo');
    expect(text).toContain('ann');
    expect(text).toMatch(/- bo: .+\. .+\./);
  });

  it('says plainly that these are not grades', () => {
    const text = X.digest(students, opts);
    expect(text).toContain('not grades');
    expect(text).toContain('can be');
  });

  it('handles a quiet week without pretending there is news', () => {
    const quiet = [{ uid: 'a', displayName: 'ann', events: [ev('lesson.opened', 1)] }];
    expect(X.digest(quiet, opts)).toContain('Nothing flagged this week.');
  });

  it('is plain text with no markup', () => {
    expect(X.digest(students, opts)).not.toMatch(/<[a-z]/i);
  });
});

describe('the dashboard wiring', () => {
  const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');
  const html = fs.readFileSync('classroom.html', 'utf8');

  it('offers CSV, the digest and print', () => {
    expect(html).toContain('data-cr-export');
    expect(html).toContain('data-cr-digest');
    expect(html).toContain('data-cr-print');
  });

  it('builds the file in the browser rather than uploading anything', () => {
    expect(dash).toMatch(/window\.PyPathExport\.download\(/);
    const exporter = fs.readFileSync('assets/js/classroom-export.js', 'utf8');
    expect(exporter).toMatch(/URL\.createObjectURL/);
    expect(exporter).not.toMatch(/fetch\(|XMLHttpRequest/);
  });

  it('uses no third-party CSV library', () => {
    const exporter = fs.readFileSync('assets/js/classroom-export.js', 'utf8');
    expect(exporter).not.toMatch(/^import |require\(/m);
  });

  it('shares with a co-teacher account, not a secret link', () => {
    expect(html).toContain('data-cr-share');
    expect(html).toContain('deliberately not a secret link');
    expect(dash).toMatch(/addCoTeacher\(activeClassId, uid\)/);
    // No token or unguessable-URL machinery anywhere.
    expect(dash).not.toMatch(/shareToken|publicUrl|secretLink/i);
  });

  it('generates the digest on request and never on a schedule', () => {
    expect(html).toContain('PyPath sends no scheduled mail');
    expect(dash).not.toMatch(/setInterval\([^)]*digest/i);
  });
});

describe('leaving a class erases the class copy', () => {
  const account = fs.readFileSync('assets/js/account-class.js', 'utf8');
  const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');

  it('purges after leaving, which is the order the rules require', () => {
    // Events may only be deleted once the roster document is gone.
    expect(account).toMatch(/await leaveClass\(uid\);[\s\S]*await purgeClassCopy\(uid\);/);
  });

  it('deletes the roster row, the mirror and the events', () => {
    for (const sub of K.ERASED_ON_LEAVE) {
      expect(store, sub).toMatch(new RegExp(sub));
    }
    expect(store).toMatch(/for \(const sub of \['events', 'progress'\]\)/);
  });

  it('deletes in batches, since a student can have more events than one batch', () => {
    expect(store).toMatch(/limit\(400\)/);
    expect(store).toMatch(/for \(;;\)/);
  });

  it('tells the student what leaving deletes, before they do it', () => {
    const html = fs.readFileSync('account.html', 'utf8');
    expect(html).toContain('Leaving deletes the class copy of your work');
    expect(html).toContain('Your own progress and saved code are untouched');
  });
});

describe('the retention policy is one number in one place', () => {
  const privacy = fs.readFileSync('privacy.html', 'utf8');

  it('states the event and snapshot period the code declares', () => {
    expect(privacy).toContain(`<strong>${K.RETENTION.EVENT_DAYS} days</strong>`);
  });

  it('states the archived-class period', () => {
    expect(K.RETENTION.ARCHIVED_CLASS_DAYS).toBe(365);
    expect(privacy).toContain('<strong>one year</strong>');
  });

  it('quotes the snapshot caps the code enforces', () => {
    expect(privacy).toContain(`${K.RETENTION.SNAPSHOTS_PER_EDITOR} states per editor`);
    expect(privacy).toContain('64KB per lesson');
    new Function(fs.readFileSync('assets/js/snapshots.js', 'utf8')).call(window);
    expect(window.PyPathSnapshots.MAX_PER_EDITOR).toBe(K.RETENTION.SNAPSHOTS_PER_EDITOR);
    expect(window.PyPathSnapshots.MAX_BYTES_PER_LESSON)
      .toBe(K.RETENTION.SNAPSHOT_BYTES_PER_LESSON);
  });

  it('cites the rule that makes indefinite retention unavailable', () => {
    expect(privacy).toContain('22 April 2026');
    expect(privacy).toContain('COPPA');
  });
});

describe('the privacy policy matches what the code actually does', () => {
  const privacy = fs.readFileSync('privacy.html', 'utf8');
  const account = fs.readFileSync('account.html', 'utf8');

  it('no longer promises a teacher cannot see lesson code', () => {
    // The classroom work viewer makes that false, and a policy describing the
    // previous version of the product is worse than none.
    expect(privacy).not.toContain('cannot see the Python you write');
    expect(account).not.toContain('They can never see the code you write');
  });

  it('says what it now shares, and flags that this changed', () => {
    expect(privacy).toContain('The code you write in lesson exercises');
    expect(privacy).toContain('This is a change from what this page previously');
  });

  it('keeps the distinction that still holds', () => {
    expect(privacy).toContain('still readable by you alone');
  });

  it('states that a real name is never used in a classroom', () => {
    expect(privacy).toContain('It is never used in a classroom');
    expect(privacy).toContain('Your legal name');
  });

  it('lists on the join screen exactly what the code declares', () => {
    // One source, three surfaces.
    const disclosure = fs.readFileSync('assets/js/join-disclosure.js', 'utf8');
    expect(disclosure).toContain('CORE.TEACHER_CAN_SEE');
    expect(disclosure).toContain('CORE.TEACHER_CANNOT_SEE');
    expect(account).toContain('data-join-disclosure');
    for (const item of K.TEACHER_CAN_SEE) {
      const gist = item.split(',')[0].replace(/^Which /, '');
      expect(privacy.toLowerCase(), item).toContain(gist.toLowerCase().slice(0, 20));
    }
  });
});
