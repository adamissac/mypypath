import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* A class-level setting for whether an exercise offers its answer.

   What it is not: a lock. The solutions travel inside each lesson's own HTML
   as window.exerciseSolutions, so this removes the button and not the answer,
   and every piece of copy about it has to say so. */

let P;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  P = window.PyPathPolicy;
});

const rules = fs.readFileSync('firestore.rules', 'utf8');
const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
const read = fs.readFileSync('assets/js/class-policy.js', 'utf8');
const lp = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');
const runner = fs.readFileSync('assets/js/lesson-runner.js', 'utf8');
const html = fs.readFileSync('classroom.html', 'utf8');

describe('who may see a solution', () => {
  it('a teacher always may', () => {
    // They are checking the exercise, not sitting it.
    expect(P.solutionsAllowed({ showSolutions: false }, true)).toBe(true);
  });

  it('a learner in no class may, which is what they always had', () => {
    expect(P.solutionsAllowed(null, false)).toBe(true);
  });

  it('a class that predates the setting may', () => {
    // Absent means yes, so no class needs a migration.
    expect(P.solutionsAllowed({ mode: 'free' }, false)).toBe(true);
  });

  it('only an explicit false turns it off', () => {
    expect(P.solutionsAllowed({ showSolutions: false }, false)).toBe(false);
    expect(P.solutionsAllowed({ showSolutions: true }, false)).toBe(true);
  });

  it('a denied or offline policy read leaves the button alone', () => {
    // class-policy.js announces null when it cannot ask. Turning the button
    // off on a failed read would take something away over a bad network.
    expect(P.solutionsAllowed(undefined, false)).toBe(true);
  });
});

describe('the setting is stored and typed', () => {
  it('the rules admit the field', () => {
    expect(rules).toMatch(/'showSolutions'\]\);/);
  });

  it('the rules pin it to a boolean', () => {
    // A string "false" is truthy, and would read as allowed where a teacher
    // meant to turn it off.
    expect(rules).toMatch(/request\.resource\.data\.showSolutions is bool/);
  });

  it('the store writes one field and leaves createdAt alone', () => {
    expect(store).toMatch(/updateDoc\(doc\(db, `classes\/\$\{classId\}`\), \{ showSolutions: on \}\)/);
  });

  it('the reader treats absent as allowed', () => {
    expect(read).toMatch(/showSolutions: data\.showSolutions !== false/);
  });
});

describe('what it does on a lesson page', () => {
  it('hides the buttons rather than disabling them', () => {
    // A greyed-out button promises something is coming, and nothing is.
    expect(lp).toMatch(/buttons\[i\]\.hidden = !allowed/);
  });

  it('leaves the exercise, the checker and the hints alone', () => {
    const fn = lp.slice(lp.indexOf('function paintSolutionButtons'),
      lp.indexOf('function repaint'));
    expect(fn).toMatch(/\.btn-solution/);
    expect(fn).not.toMatch(/btn-check|feedback|editors|hint/);
  });

  it('refuses in showSolution too, for a stale button', () => {
    expect(runner).toMatch(/if \(window\.pyPathSolutionsAllowed === false\) return;/);
  });

  it('repaints when the policy lands', () => {
    // The policy is fetched after the page renders, so a lesson opened before
    // it arrives would otherwise keep whatever it drew first.
    const repaint = lp.slice(lp.indexOf('function repaint'), lp.indexOf('function repaint') + 400);
    expect(repaint).toContain('paintSolutionButtons');
  });
});

describe('the copy does not overclaim', () => {
  it('the teacher is told it removes the button, not the answer', () => {
    const joined = html.replace(/\s+/g, ' ');
    expect(joined).toMatch(/It does not remove the answer/);
    expect(joined).toMatch(/page source/);
  });

  it('the explanation says the same thing', () => {
    const K = window.PyPathClassroom;
    expect(K.EXPLANATIONS.showSolutions).toMatch(/does not hide the answer/);
    expect(K.EXPLANATIONS.showSolutions).toMatch(/lock it away/);
  });

  it('the code comment says it too, where the next reader will be', () => {
    expect(lp).toMatch(/removes the\s+\*? ?button and not the answer/);
  });
});
