import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateChecks } from '../scripts/validate-checks.js';
import { errorsForUnit } from './helpers/check-runner.js';

/* PyPath — Unit 10, the capstone, which has no code exercises to run.
 *
 * Every other unit's suite runs authored cases against real CPython. This one
 * cannot, and the reason is not that the work was skipped. All ten Unit 10
 * pages carry zero editors and zero exercises in the manifest, and the lessons
 * are project work: planning, scoping, proposing, presenting, reflecting. There
 * is no single correct program to compare a student against, and inventing one
 * would mark a good capstone wrong for not being the capstone we imagined.
 *
 * So this file asserts what there actually is: the questions, and the floor
 * that stands under the written answers. It also pins the one thing that
 * stopped `reflections` being authored here -- see "the reflection ids"
 * below -- so that the day it is fixed, this suite says so rather than leaving
 * the gap to be rediscovered.
 */

const ROOT = process.cwd();
const UNIT = 10;
const CHECKS = path.join(ROOT, 'assets', 'data', 'checks', `unit-${UNIT}`);
const PAGES = path.join(ROOT, 'units', `unit-${UNIT}`);

/* The id shape validate-checks.js accepts for a reflection. Restated rather
   than imported because validateReflections is not exported; the test below
   that reads it off a real page is what keeps the two honest. */
const VALIDATOR_ID = /^reflection\d+$/;

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets/data/curriculum.json'), 'utf8')
);
const lessons = manifest.lessons.filter((l) => l.unit === UNIT);

function specFor(slug) {
  return JSON.parse(fs.readFileSync(path.join(CHECKS, `${slug}.json`), 'utf8'));
}

/* The reflection boxes a page really has, read out of the HTML. The manifest
   does not record these, and a check file keyed to an id the page does not
   carry is silently dead: nothing renders, nothing fails. */
function reflectionIdsOn(slug) {
  const html = fs.readFileSync(path.join(PAGES, `${slug}.html`), 'utf8');
  const ids = [];
  const re = /<textarea[^>]*\bid="([^"]+)"[^>]*class="[^"]*\breflection-input\b/g;
  let m;
  while ((m = re.exec(html))) ids.push(m[1]);
  return ids;
}

/* A real answer to each reflection box on each page, in the register a
   fourteen-year-old writes in. These are the "accepts" half: a floor that only
   ever refuses is as useless as one that only ever accepts, and the pair is
   what makes either half mean anything. */
const GOOD = {
  'project-planning-brainstorming': {
    'reflection-exercise1':
      'Planning first means I decide what the project is for before I write any code, '
      + 'so I do not build features that turn out not to fit together.',
    'reflection-exercise2':
      'I look for problems I actually have and start small. My idea is a homework '
      + 'tracker that only adds, lists and saves tasks, with due dates out of scope.',
  },
  'writing-project-proposal': {
    'reflection-exercise1':
      'Title, purpose, features, technical requirements, inputs and outputs, and target '
      + 'users. Each one answers a question I would otherwise have to guess at later.',
    'reflection-exercise2':
      'The purpose names the problem and who has it, and the features are listed in the '
      + 'order I will build them so the important ones get done first.',
  },
  'structuring-python-project': {
    'reflection-exercise1':
      'Structure means I can find code quickly and a change stays in one file. I would '
      + 'keep main.py as the entry point and move the file handling into its own module.',
    'reflection-exercise2':
      'A module is a Python file with related functions in it. I make utils.py and then '
      + 'write from utils import validate_input at the top of my main file.',
  },
  'implementing-core-features': {
    'reflection-exercise1':
      'Core features are the ones the project does not work without, so building them '
      + 'first means I always have something that runs from start to finish.',
    'reflection-exercise2':
      'I build one feature at a time and check it before moving on. Functions help '
      + 'because each one has a name and can be tested on its own.',
  },
  'adding-user-interaction': {
    'reflection-exercise1':
      'It matters because someone has to be able to use the program. I read a value '
      + 'with input, check it is what I expect, and ask again when it is not.',
    'reflection-exercise2':
      'Good feedback says what just happened and what to do next, like task added '
      + 'successfully, or please enter a number between one and five.',
  },
  'error-handling-testing-code': {
    'reflection-exercise1':
      'Error handling stops the program crashing on input I did not expect. I put the '
      + 'risky line in a try block and catch the specific exception it can raise.',
    'reflection-exercise2':
      'I test the normal cases first and then the edges: an empty list, an empty task '
      + 'name, and a task number bigger than the list actually is.',
  },
  'polishing-visuals-output-formatting': {
    'reflection-exercise1':
      'Formatting makes the output readable, which is most of what someone judges a '
      + 'small program on. I would line the columns up with widths in an f-string.',
    'reflection-exercise2':
      'Fixed widths for alignment, numbered lists, and a separator line of equals signs '
      + 'between sections so the eye can find where each part starts.',
  },
  'writing-documentation-comments': {
    'reflection-exercise1':
      'Documentation means I can still understand my own code in a month. A comment says '
      + 'why a line is there and a docstring says what a function takes and returns.',
    'reflection-exercise2':
      'A README should say what the project does, how to run it, and which Python '
      + 'version it needs, so somebody can use it without asking me first.',
  },
  'presenting-your-project': {
    'reflection-exercise1':
      'I start with the problem, then run the program on real input, then explain '
      + 'briefly how it works inside, then say what I learned and what is next.',
    'reflection-exercise2':
      'The problem, how my project solves it, what a user can do with it, which Python '
      + 'ideas I used, and which part was hardest to get working.',
  },
  'reflection-next-steps': {
    'reflection-exercise1':
      'I learned that planning and cutting scope matter more than knowing more syntax, '
      + 'and I got much better at reading an error instead of guessing at it.',
    'reflection-exercise2':
      'Next I want to add the due dates I left out, put the project on GitHub with a '
      + 'proper README, and then build something that talks to an API.',
  },
};

/* The four ways a box gets filled without being answered. Everything here must
   be refused, or the floor is decoration. */
const EVASIVE = {
  'a shrug': 'idk',
  'a non-answer': 'it was fine',
  'one character': 'aaaaaaaaaa',
  'one word padded out': 'good good good good good good good good good',
  'keyboard mash': 'asdf qwer zxcv hjkl bnmm wert cvbn xkcd',
};

beforeAll(() => {
  // Same idiom check-runner.js uses for the other browser globals: these files
  // are IIFEs that hang themselves off window and export nothing.
  for (const dep of ['reflection-check', 'concept-check']) {
    new Function(fs.readFileSync(path.join(ROOT, `assets/js/${dep}.js`), 'utf8')).call(window);
  }
});

describe('the check files', () => {
  it('validate cleanly', () => {
    const { errors } = validateChecks();
    expect(errorsForUnit(errors, UNIT)).toEqual([]);
  });

  it('exist for all ten lessons', () => {
    expect(lessons).toHaveLength(10);
    for (const lesson of lessons) {
      expect(fs.existsSync(path.join(CHECKS, `${lesson.slug}.json`))).toBe(true);
    }
  });

  /* Nothing in this unit has an editor, so a file that names an exercise id has
     named one that is not on the page. validate-checks.js catches that, but
     only once the id exists; this says the shape of the unit out loud. */
  it('carry questions and nothing that needs an editor', () => {
    for (const lesson of lessons) {
      const spec = specFor(lesson.slug);
      expect(lesson.exercises).toEqual([]);
      expect(lesson.editors).toEqual([]);
      // Reflections need no editor -- they attach to the written-answer boxes
      // the page already has -- so they are the one other key allowed here.
      expect(Object.keys(spec).sort()).toEqual(['questions', 'reflections']);
    }
  });
});

describe('the questions', () => {
  it('number three to five per lesson and every one explains itself', () => {
    for (const lesson of lessons) {
      const { questions } = specFor(lesson.slug);
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);
      for (const q of questions) {
        expect(q.prompt, `${lesson.slug} ${q.id}`).toBeTruthy();
        expect(q.explain, `${lesson.slug} ${q.id}`).toBeTruthy();
      }
    }
  });

  /* Two identical options make a question unanswerable, and the learner reads
     the explanation for an option that was never right. */
  it('have no duplicate choices', () => {
    for (const lesson of lessons) {
      for (const q of specFor(lesson.slug).questions) {
        const lists = [q.choices, q.items, q.left, q.right].filter(Array.isArray);
        for (const list of lists) {
          expect(new Set(list).size, `${lesson.slug} ${q.id}`).toBe(list.length);
        }
      }
    }
  });

  /* validate-checks.js checks ids are unique within a file. quiz-bank.js pools
     a whole unit, so two lessons reusing an id would collide there instead. */
  it('have ids unique across the whole unit', () => {
    const seen = new Set();
    for (const lesson of lessons) {
      for (const q of specFor(lesson.slug).questions) {
        expect(seen.has(q.id), `duplicate ${q.id}`).toBe(false);
        seen.add(q.id);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });
});

/* Why this unit has no `reflections` block, asserted rather than explained in a
 * comment nobody reads.
 *
 * All ten pages do carry two reflection boxes each, and the questions on them
 * are exactly what `expect_any` is for. But the boxes are named
 * `reflection-exercise1` and `reflection-exercise2` -- the shared lesson
 * template's naming, used by forty pages across the course -- and
 * validateReflections only accepts ids matching /^reflection\d+$/, which was
 * written against the one hand-authored page that uses `reflection1`.
 *
 * That leaves no id that both validates and connects. lesson-progress.js looks
 * the spec up by the DOM id, so `reflection1` here would pass the validator and
 * never fire; `reflection-exercise1` would fire and fail the build. Authoring
 * either would be worse than authoring neither, so neither is authored, and
 * these tests fail the moment the mismatch is repaired.
 */
describe('the reflection ids', () => {
  it('are two per page, on every page', () => {
    for (const lesson of lessons) {
      expect(reflectionIdsOn(lesson.slug), lesson.slug).toHaveLength(2);
    }
  });

  it('are the template names, which the validator does not accept', () => {
    for (const lesson of lessons) {
      const ids = reflectionIdsOn(lesson.slug);
      expect(ids).toEqual(['reflection-exercise1', 'reflection-exercise2']);
      for (const id of ids) expect(VALIDATOR_ID.test(id), id).toBe(false);
    }
  });

  /* This used to assert that no reflections could be authored: the validator
     enforced `^reflection\d+$` and these boxes are named reflection-exercise1
     and reflection-exercise2, so an id that validated never fired and an id
     that fired never validated. The validator reads the page now, and every
     box on this unit has a spec against the id it really carries. */
  it('are the ids the check files actually use', () => {
    for (const lesson of lessons) {
      const authored = Object.keys(specFor(lesson.slug).reflections || {});
      expect(authored.sort(), lesson.slug)
        .toEqual(['reflection-exercise1', 'reflection-exercise2']);
    }
  });
});

/* Written into the suite ahead of the ids being fixed, so that whoever fixes
   them gets these assertions for free rather than a green suite that checks
   nothing about what they just authored. */
describe('any reflections that are authored', () => {
  const authored = lessons.flatMap((lesson) => {
    const reflections = specFor(lesson.slug).reflections || {};
    return Object.entries(reflections).map(([id, entry]) => ({ lesson, id, entry }));
  });

  it.each(authored)('$lesson.slug $id is usable', ({ lesson, id, entry }) => {
    expect(entry.hint, 'a miss with no hint shows the learner nothing').toBeTruthy();
    expect(Array.isArray(entry.expect_any) && entry.expect_any.length).toBeTruthy();

    const good = (GOOD[lesson.slug] || {})[id];
    expect(good, `no sample answer written for ${lesson.slug} ${id}`).toBeTruthy();
    expect(window.PyPathConcepts.assess(good, entry).ok).toBe(true);
    // A group list generous enough to accept anything accepts a shrug too.
    expect(window.PyPathConcepts.assess('idk', entry).ok).toBe(false);
  });

  /* Was "expected to be empty for now". It is not empty any more, and the
     useful assertion is the opposite one: every box on every lesson is
     covered, so a later page that adds a third box shows up here. */
  it('covers every written-answer box in the unit', () => {
    expect(authored.length).toBe(lessons.length * 2);
  });
});

/* The floor, run for real.
 *
 * It is the only automated thing standing between a student and a ticked
 * reflection box anywhere in Unit 10, so it is worth knowing it works on this
 * unit's actual prompts rather than on an invented one. */
describe('the floor under a written answer', () => {
  const samples = lessons.flatMap((lesson) =>
    Object.entries(GOOD[lesson.slug]).map(([id, text]) => ({ slug: lesson.slug, id, text })));

  it('has a sample answer for every box on every page', () => {
    expect(samples).toHaveLength(20);
    for (const lesson of lessons) {
      expect(Object.keys(GOOD[lesson.slug]).sort()).toEqual(reflectionIdsOn(lesson.slug).sort());
    }
  });

  it.each(samples)('accepts a real answer to $slug $id', ({ text }) => {
    expect(window.PyPathReflection.assess(text).ok).toBe(true);
  });

  it.each(Object.entries(EVASIVE))('refuses %s', (_name, text) => {
    const out = window.PyPathReflection.assess(text);
    expect(out.ok).toBe(false);
    // A refusal that does not say what is wanted is a wall, not a floor.
    expect(out.reason).toBeTruthy();
  });

  it('refuses an empty box', () => {
    expect(window.PyPathReflection.assess('').ok).toBe(false);
  });

  /* The known miss, asserted rather than hidden, in the same spirit as
     concept-check.test.js. The floor is structural: it counts words, it does
     not read them. A fluent sentence about nothing in particular clears it, and
     on these ten pages there is no `reflections` block behind it to notice.
     Whether the answer was any good is a person's job, not this file's. */
  it('cannot tell an on-topic answer from a fluent off-topic one', () => {
    const offTopic =
      'Python is a programming language that a lot of people use to write '
      + 'programs on their computers for many different reasons.';
    expect(window.PyPathReflection.assess(offTopic).ok).toBe(true);
  });

  /* Worth knowing because it is inert here. The paste-back guard compares the
     answer to `.exercise-prompt`, or failing that the item's h3 -- and these
     pages have no `.exercise-prompt`, so the prompt it sees is the heading
     "Exercise 1: Presentation" rather than the question underneath it. A
     student pasting the actual question back is caught by the word count, not
     by this. */
  it('catches the heading pasted back, which is not the question asked', () => {
    const heading = 'Exercise 1: Presentation';
    expect(window.PyPathReflection.assess(heading, { prompt: heading }).ok).toBe(false);
  });
});
