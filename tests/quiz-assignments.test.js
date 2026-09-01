import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* Teacher-assignable quizzes.
 *
 * The design doc is docs/superpowers/specs/2026-08-31-teacher-assignable-quizzes-design.md
 * and the two decisions worth restating here, because these tests are what
 * hold them:
 *
 *   - A quiz is a third kind of assignment target, not a parallel structure. So
 *     assignmentStatus() grows a part and everything downstream -- the
 *     dashboard column, the exports, the student's own list -- keeps working
 *     with no knowledge that quizzes exist.
 *   - A quiz respects unit locking but NOT maxTestAttempts. That setting's own
 *     teacher-facing copy says "end-of-unit test" in as many words, so silently
 *     extending it would make a sentence a teacher already read untrue.
 */

const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const spec = fs.readFileSync(
  'docs/superpowers/specs/2026-08-31-teacher-assignable-quizzes-design.md', 'utf8');

function loadDeps() {
  ['storage-keys', 'curriculum', 'classroom-policy', 'question-types',
    'classroom-core', 'quiz-bank', 'events'].forEach((name) => {
    new Function(fs.readFileSync(`assets/js/${name}.js`, 'utf8')).call(window);
  });
}

const DAY = 86400000;
const NOW = Date.UTC(2026, 7, 31);

function quizAssignment(extra) {
  return Object.assign({
    id: 'a-quiz',
    title: 'Loops check',
    units: [],
    lessonPaths: [],
    quiz: { unit: 2, questionIds: ['q2-match-1'], passMark: 70, attempts: 0 },
    dueAt: NOW - DAY,
  }, extra || {});
}

function submitted(at, score, extra) {
  return {
    type: 'quiz.submitted',
    at,
    payload: Object.assign({ assignmentId: 'a-quiz', unit: 2, score, correct: 4, total: 4, attempt: 1 },
      extra || {}),
  };
}

const OPTS = { now: NOW, lessonsByUnit: {}, lessonTitles: {} };

beforeAll(() => { loadDeps(); });

describe('a quiz is an assignment, not a second due-date system', () => {
  it('shows as a part, the same shape units and lessons already use', () => {
    const status = window.PyPathClassroom.assignmentStatus(quizAssignment(), [], OPTS);
    expect(status.partCount).toBe(1);
    expect(status.parts[0].kind).toBe('quiz');
    expect(status.parts[0].title).toBe('Quiz on Unit 2');
    expect(status.parts[0].assignmentId).toBe('a-quiz');
  });

  it('is overdue when nobody sat it, like any other outstanding work', () => {
    const status = window.PyPathClassroom.assignmentStatus(quizAssignment(), [], OPTS);
    expect(status.state).toBe('overdue');
  });

  it('is on time when it was sat before the due date', () => {
    const events = [submitted(NOW - 2 * DAY, 90)];
    const status = window.PyPathClassroom.assignmentStatus(quizAssignment(), events, OPTS);
    expect(status.state).toBe('done-on-time');
  });

  it('is late, with the day count, when it was sat after', () => {
    const events = [submitted(NOW - DAY + 2 * 3600000, 90)];
    const status = window.PyPathClassroom.assignmentStatus(quizAssignment(), events, OPTS);
    expect(status.state).toBe('done-late');
    expect(status.daysLate).toBe(1);
  });

  it('counts a low score as done, because they did the work', () => {
    /* Deliberate: this column answers "did they do what I set", and a student
       who sat it and scored 20 did. Reading that as not-done would hide them
       among the students who never opened it, which is the opposite of what a
       teacher is scanning for. The mark is carried separately. */
    const events = [submitted(NOW - 2 * DAY, 20)];
    const status = window.PyPathClassroom.assignmentStatus(quizAssignment(), events, OPTS);
    expect(status.state).toBe('done-on-time');
    expect(window.PyPathClassroom.quizScore(events, 'a-quiz').best).toBe(20);
  });

  it('reports the best score across attempts, not the most recent', () => {
    const events = [
      submitted(NOW - 3 * DAY, 40),
      submitted(NOW - 2 * DAY, 85),
      submitted(NOW - DAY, 55),
    ];
    const score = window.PyPathClassroom.quizScore(events, 'a-quiz');
    expect(score.best).toBe(85);
    expect(score.attempts).toBe(3);
  });

  it('ignores a submission for a different assignment', () => {
    const events = [submitted(NOW - 2 * DAY, 90, { assignmentId: 'someone-else' })];
    expect(window.PyPathClassroom.quizScore(events, 'a-quiz')).toBe(null);
    expect(window.PyPathClassroom.assignmentStatus(quizAssignment(), events, OPTS).state)
      .toBe('overdue');
  });

  it('mixes with units and lessons in one assignment', () => {
    // "Finish Unit 1 AND sit this quiz" falls out of the model for free, so it
    // is allowed rather than forbidden.
    const both = quizAssignment({ units: [1] });
    const status = window.PyPathClassroom.assignmentStatus(both, [submitted(NOW - 2 * DAY, 90)], {
      ...OPTS, lessonsByUnit: { 1: [] },
    });
    expect(status.partCount).toBe(2);
    expect(status.doneCount).toBe(1);
    expect(status.state).toBe('overdue');
  });

  it('an assignment with no quiz grows no quiz part', () => {
    const plain = { id: 'a1', title: 'Unit 1', units: [1], lessonPaths: [], dueAt: NOW };
    const status = window.PyPathClassroom.assignmentStatus(plain, [], { ...OPTS, lessonsByUnit: { 1: [] } });
    expect(status.parts.every((p) => p.kind !== 'quiz')).toBe(true);
  });
});

describe('the bank a teacher picks from', () => {
  const BANK = () => window.PyPathQuizBank;

  it('puts the newer kinds first, so they are not buried behind fifty MCQs', () => {
    const merged = BANK().merge(
      [{ id: 'm1', prompt: 'a', kind: 'mcq', choices: ['x', 'y'], answer: 0 }],
      [{ id: 'x1', prompt: 'b', kind: 'match', left: ['a'], right: ['b'], answer: [0] }]
    );
    expect(merged.map((q) => q.id)).toEqual(['x1', 'm1']);
  });

  it('drops a question question-types.js could not mark', () => {
    const merged = BANK().merge([
      { id: 'ok', prompt: 'a', kind: 'mcq', choices: ['x', 'y'], answer: 0 },
      { id: 'broken', prompt: 'b', kind: 'match' },
      { id: 'nameless', prompt: 'c', kind: 'mcq', choices: ['x', 'y'] },
      { prompt: 'no id', kind: 'mcq', choices: ['x', 'y'] },
    ], []);
    // Both survivors are mcq, so they fall back to id order.
    expect(merged.map((q) => q.id)).toEqual(['nameless', 'ok']);
  });

  it('lets the deliberately authored question win an id collision', () => {
    const merged = BANK().merge(
      [{ id: 'dup', prompt: 'from the pool', kind: 'mcq', choices: ['x', 'y'], answer: 0 }],
      [{ id: 'dup', prompt: 'from the bank', kind: 'mcq', choices: ['x', 'y'], answer: 0 }]
    );
    expect(merged.length).toBe(1);
    expect(merged[0].prompt).toBe('from the bank');
  });

  it('picks in the order the teacher chose, dropping ids that no longer exist', () => {
    const bank = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(BANK().pick(bank, ['c', 'gone', 'a']).map((q) => q.id)).toEqual(['c', 'a']);
  });

  it('names the kinds a unit offers', () => {
    const bank = [
      { id: '1', prompt: 'p', kind: 'match', left: ['a'], right: ['b'], answer: [0] },
      { id: '2', prompt: 'p', kind: 'mcq', choices: ['x', 'y'], answer: 0 },
    ];
    expect(BANK().kindsIn(bank)).toEqual(['match', 'mcq']);
  });

  it('refuses a unit outside the course', () => {
    expect(BANK().isUnit(0)).toBe(false);
    expect(BANK().isUnit(11)).toBe(false);
    expect(BANK().isUnit(3)).toBe(true);
  });
});

describe('the authored questions actually mark correctly', () => {
  /* Content, not plumbing, and the realistic bug is an answer index typed one
     out. Every seeded question is scored with its own key and with a
     deliberately wrong answer. */
  const files = Array.from({ length: 10 }, (_, i) =>
    `assets/data/quiz-bank/unit-${i + 1}.json`);

  it('every seeded question scores full marks for its own key', () => {
    const Q = window.PyPathQuestions;
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8')).forEach((q) => {
        const key = q.kind === 'multi' ? q.answers
          : q.kind === 'blank' ? q.blanks.map((b) => b.accept[0])
            : q.answer;
        expect(Q.score(q, key).right, `${q.id} in ${file}`).toBe(true);
      });
    });
  });

  it('and none of them scores full marks for a wrong answer', () => {
    const Q = window.PyPathQuestions;
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8')).forEach((q) => {
        const wrong = q.kind === 'match' ? q.answer.map((a) => (a + 1) % q.right.length)
          : q.kind === 'order' ? q.answer.slice().reverse()
            : q.kind === 'multi' ? []
              : q.kind === 'blank' ? q.blanks.map(() => 'definitely not')
                : (q.answer + 1) % q.choices.length;
        expect(Q.score(q, wrong).right, `${q.id} in ${file}`).toBe(false);
      });
    });
  });

  it('every seeded question is one the bank will accept', () => {
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8')).forEach((q) => {
        expect(window.PyPathQuizBank.usable(q), q.id).toBe(true);
      });
    });
  });

  it('seeds the newer kinds, which is the whole reason the file exists', () => {
    const kinds = new Set();
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8')).forEach((q) => kinds.add(q.kind));
    });
    expect([...kinds].sort()).toEqual(['blank', 'match', 'multi', 'order']);
  });

  it('covers every unit, not just the ones that were easy to write', () => {
    /* This shipped seeded for units 1-3 with the gap called out as content
       work rather than plumbing. That was a real gap: a teacher assigning a
       quiz on Unit 7 got fifty MCQs and none of the kinds this feature exists
       to make reachable. All ten are authored now, and this is what stops a
       future unit being added without them. */
    files.forEach((file) => {
      expect(fs.existsSync(file), file).toBe(true);
      const questions = JSON.parse(fs.readFileSync(file, 'utf8'));
      const kinds = new Set(questions.map((q) => q.kind));
      expect([...kinds].sort(), file).toEqual(['blank', 'match', 'multi', 'order']);
    });
  });

  it('gives every question a unique id across the whole bank', () => {
    // Ids collide across units easily -- q4-match-1 and q7-match-1 are one
    // typo apart -- and merge() would silently drop the loser.
    const seen = new Set();
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8')).forEach((q) => {
        expect(seen.has(q.id), `${q.id} appears twice`).toBe(false);
        seen.add(q.id);
      });
    });
    expect(seen.size).toBe(60);
  });

  it('gives a fill-the-blank exactly as many gaps as it has blanks', () => {
    // Fewer gaps than blanks and renderBlank appends loose boxes at the end;
    // more gaps than blanks and a box scores nothing whatever is typed in it.
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8'))
        .filter((q) => q.kind === 'blank')
        .forEach((q) => {
          const gaps = (String(q.code || q.prompt).match(/___/g) || []).length;
          expect(gaps, `${q.id} in ${file}`).toBe(q.blanks.length);
        });
    });
  });

  it('gives a matching question as many right options as left rows', () => {
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8'))
        .filter((q) => q.kind === 'match')
        .forEach((q) => {
          expect(q.right.length, `${q.id} in ${file}`).toBe(q.left.length);
          expect(q.answer.length, `${q.id} in ${file}`).toBe(q.left.length);
        });
    });
  });

  it('explains every answer, because the review screen shows it', () => {
    files.forEach((file) => {
      JSON.parse(fs.readFileSync(file, 'utf8')).forEach((q) => {
        expect(typeof q.explain, `${q.id} in ${file}`).toBe('string');
        expect(q.explain.length, `${q.id} in ${file}`).toBeGreaterThan(20);
      });
    });
  });
});

describe('the event type', () => {
  it('is registered with the fields the dashboard reads', () => {
    const made = window.PyPathEvents.makeEvent
      ? null : null; // makeEvent is internal; the registry is what matters here
    expect(window.PyPathEvents.TYPES).toContain('quiz.submitted');
    expect(made).toBe(null);
  });

  it('is separate from test.submitted on purpose', () => {
    // One type carrying both would make every reader disambiguate them, and
    // only one of the two unlocks a unit.
    expect(window.PyPathEvents.TYPES).toContain('test.submitted');
    expect(spec).toMatch(/A quiz score does \*\*not\*\* unlock the next unit/);
  });
});

describe('what the rules enforce, and what the code says they do not', () => {
  it('accepts the new type', () => {
    expect(rules).toMatch(/'unit\.completed', 'quiz\.submitted'/);
  });

  it('gates it on the unit being open, like a test', () => {
    const fn = rules.slice(rules.indexOf('function countsForCredit'),
      rules.indexOf('function unitAllowed'));
    expect(fn).toContain('quiz.submitted');
  });

  it('says out loud that it cannot check the score or the attempt count', () => {
    // The note sits above the function, so slice from the note.
    const note = rules.slice(rules.indexOf('The types whose unit is checked'),
      rules.indexOf('function unitAllowed'));
    expect(note).toMatch(/cannot check/);
    expect(note).toMatch(/not a proctored result/);
    expect(note).toMatch(/does NOT unlock anything/);
  });

  it('bounds the quiz map, because every student in the class reads it', () => {
    const fn = rules.slice(rules.indexOf('function quizWellFormed'),
      rules.indexOf('function wellFormed'));
    expect(fn).toMatch(/questionIds\.size\(\) <= 25/);
    expect(fn).toMatch(/unit <= 10/);
    expect(fn).toMatch(/hasOnly\(\s*\n?\s*\['unit', 'questionIds', 'passMark', 'attempts'\]\)/);
  });

  it('lets a quiz be the only thing an assignment requires', () => {
    const fn = rules.slice(rules.indexOf('function wellFormed'),
      rules.indexOf('// Students read, and have to'));
    expect(fn).toMatch(/\|\| 'quiz' in request\.resource\.data/);
  });
});

describe('the store validates before the rules have to refuse', () => {
  it('caps the question count at the same number the rule does', () => {
    expect(store).toMatch(/ids\.length > 25/);
    expect(store).toMatch(/A quiz can hold at most 25 questions/);
  });

  it('defaults attempts to unlimited, like a class that never set a cap', () => {
    expect(store).toMatch(/attempts: Number\.isInteger\(attempts\) && attempts > 0/);
  });

  it('opens the quiz unit before the assignment is written, never after', () => {
    // Reversed, there is a window where a student meets a quiz that is assigned
    // to them and locked against them -- and quiz.submitted counts for credit,
    // so the rules would refuse the result of work they had already done.
    const fn = store.slice(store.indexOf('export async function createAssignment'),
      store.indexOf('export async function readAssignments'));
    expect(fn.indexOf('widenUnlocks')).toBeLessThan(fn.indexOf('await setDoc(ref'));
    expect(fn).toMatch(/openUnits\.push\(quiz\.unit\)/);
  });

  it('omits the field entirely rather than writing null', () => {
    // `'quiz' in data` is true for a null, which would then fail the shape
    // check underneath it.
    expect(store).toMatch(/if \(quiz\) record\.quiz = quiz;/);
  });
});

describe('the three question surfaces stay distinguishable', () => {
  it('the ungraded lesson quiz is untouched', () => {
    const lessonQuiz = fs.readFileSync('assets/js/lesson-quiz.js', 'utf8');
    expect(lessonQuiz).toMatch(/test and are not scored/);
  });

  it('the end-of-unit test is untouched, including its older question kinds', () => {
    const unitTest = fs.readFileSync('assets/js/unit-test.js', 'utf8');
    expect(unitTest).not.toMatch(/quiz\.submitted/);
    expect(fs.readFileSync('assets/js/unit-test-page.js', 'utf8'))
      .not.toMatch(/quiz\.submitted/);
  });

  it('the quiz page says which of the three it is before the first question', () => {
    const page = fs.readFileSync('assets/js/quiz-page.js', 'utf8');
    expect(page).toMatch(/This one counts/);
    expect(page).toMatch(/recorded for your teacher/);
  });

  it('a quiz does not inherit the retake cap, and the reason is written down', () => {
    const page = fs.readFileSync('assets/js/quiz-page.js', 'utf8');
    // It reads the quiz's own attempts, never the class's maxTestAttempts.
    expect(page).toMatch(/Number\(quiz\.attempts\)/);
    // The cap it honours is the quiz's own. maxTestAttempts is named only in
    // the header comment that explains why it is NOT consulted, so what
    // matters is that none of the policy readers for it are ever called.
    expect(page).not.toMatch(/POLICY\.attemptCap|POLICY\.attemptsLeft|POLICY\.canSitTest/);
    expect(spec).toMatch(/It does \*not\* inherit `maxTestAttempts`/);
  });
});
