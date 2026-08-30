import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* What a class has asked of a student, on the student's own page.
   The data was always theirs to read -- firestore.rules lets an enrolled
   student read the assignments, and its own comment says this is so "their own
   page shows what is due". Nothing rendered it. */

let K;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  K = window.PyPathClassroom;
});

const src = fs.readFileSync('assets/js/student-work.js', 'utf8');
const page = fs.readFileSync('progress.html', 'utf8');

describe('the judgement is the teacher-side judgement', () => {
  it('asks classroom-core for the state rather than deciding locally', () => {
    // Two implementations of "is this late" is one too many: the teacher and
    // the student must never be shown different answers about the same row.
    expect(src).toMatch(/CORE\.assignmentStatus\(a, events, opts\)/);
    expect(src).not.toMatch(/dueAt\s*<\s*now|now\s*>\s*dueAt/);
  });

  it('reads the student\'s own log, not the class\'s', () => {
    expect(src).toMatch(/readEvents\(classId, uid, 500\)/);
  });

  it('handles one student\'s events, which is what it is given', () => {
    // The function was written for the teacher side; this is the check that it
    // works unwrapped on a single learner's own log.
    const a = { title: 'Loops', units: [2], lessonPaths: [], dueAt: Date.UTC(2026, 7, 20) };
    const status = K.assignmentStatus(a, [], {
      now: Date.UTC(2026, 7, 25), lessonsByUnit: { 2: ['/units/unit-2/a.html'] },
    });
    expect(status.state).toBe('overdue');
    expect(status.parts).toHaveLength(1);
    expect(status.parts[0].title).toBe('Unit 2');
  });

  it('names each part instead of showing a path', () => {
    const a = { title: 'Reading', units: [], lessonPaths: ['/units/unit-3/loops.html'], dueAt: 0 };
    const status = K.assignmentStatus(a, [], {
      now: Date.now(), lessonTitles: { '/units/unit-3/loops.html': 'Loops and conditionals' },
    });
    expect(status.parts[0].title).toBe('Loops and conditionals');
  });
});

describe('what the page says', () => {
  it('puts outstanding work above finished work', () => {
    expect(src).toMatch(/const openX = x\.status\.state === 'overdue' \|\| x\.status\.state === 'not-due'/);
  });

  it('carries a mark as well as a colour, like the mastery grid', () => {
    expect(src).toMatch(/STATE_MARK/);
    for (const state of ['done-on-time', 'done-late', 'not-due', 'overdue', 'expired']) {
      expect(src, state).toContain(state);
    }
  });

  it('says where a completion time comes from, as the teacher side does', () => {
    // EXPLANATIONS.assignmentLate makes the same promise to the teacher. A
    // student told their work is late deserves the same account of how that
    // was decided, not a shorter one implying more certainty.
    // Adjacent string literals joined first: the copy wraps across lines in
    // the source, so the sentence is only contiguous once it is built.
    const joined = src.replace(/'\s*\+\s*'/g, '');
    expect(joined).toMatch(/stamped with server time when it arrived/);
    expect(K.EXPLANATIONS.assignmentLate).toMatch(/stamped with server time when it arrived/);
  });

  it('treats nothing-due as good news, not as an empty box', () => {
    expect(page).toContain('Nothing outstanding');
    expect(page).toContain('has not set any work yet');
  });

  it('hides itself entirely for a learner in no class', () => {
    // Someone working alone owes nobody anything, and a permanent empty panel
    // would be an apology for a feature they are not using.
    expect(src).toMatch(/if \(!classId\) \{[\s\S]*?show\(section, false\);/);
  });
});

describe('the page is wired', () => {
  it('loads the module and the judgement it depends on', () => {
    expect(page).toContain('/assets/js/student-work.js');
    expect(page).toContain('/assets/js/classroom-core.js');
  });

  it('shows the nav link only to a student who is in a class', () => {
    const nav = fs.readFileSync('assets/js/role-nav.js', 'utf8');
    expect(nav).toMatch(/data-student-class/);
    expect(nav).toMatch(/inClass = !!\(await loadMembership\(user\.uid\)\)/);
    expect(nav).toMatch(/!ROLES\.isTeacher\(role\)/);
    expect(page).toContain('data-student-class');
  });
});
