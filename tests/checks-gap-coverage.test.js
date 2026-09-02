import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import { setup, havePython, score, specFor } from './helpers/check-runner.js';

/* The lessons that had an editor and nothing grading it, and the four that had
 * no editor at all.
 *
 * Several of these ask the student for a *comment* -- "write a comment
 * explaining pip install". The AST analyzer cannot see comments, deliberately,
 * so these are the one place source_matches is the right instrument: what is
 * being asked for really is prose in the source, not a computation that prose
 * could be mistaken for.
 *
 * Unit 10 is deliberately not here. A capstone has no reference program, so
 * there is nothing to run a student's project against.
 */

beforeAll(() => setup());

const FIXTURES = [
  // [unit, slug, exerciseId, correct, plausible wrong]
  [1, 'what-is-python', 'practice1',
    'print("I am learning Python to automate my spreadsheets")',
    // The placeholder left exactly as it shipped.
    'print("My name is ___ and I\'m learning Python!")'],
  [1, 'what-is-python', 'exercise1',
    'print("My name is Sam")\nprint("I like maps")',
    'print("Line 1")\nprint("Line 2")'],

  [1, 'installing-python-ide', 'practice2',
    'print("Hello world!")',
    'print("hello world")'],
  [1, 'installing-python-ide', 'exercise2',
    'print("Sam")\nprint("Geography")\nprint("I want to build a map tool")',
    'print("Your Name")\nprint("Your favorite hobby or subject")\nprint("Why you want to learn Python")'],

  [5, 'installing-external-packages', 'exercise1',
    '# pip install requests downloads the package from PyPI and puts it in your environment\n'
      + 'def fake_get(url):\n    return "pretend response from " + url\n\n'
      + 'print(fake_get("https://example.com"))',
    // The comment, but no function of their own.
    '# pip install requests downloads the package\nprint("done")'],
  [5, 'installing-external-packages', 'exercise2',
    '# pip install requests adds a package\n# pip uninstall requests removes it again\n'
      + 'print("pip installs and removes packages so projects can share code")',
    // Only half the commands explained.
    '# pip install requests adds a package\nprint("pip manages packages")'],

  [5, 'virtual-environments', 'exercise1',
    '# a virtual environment is a private package folder for one project\n'
      + 'print("It keeps each project on its own package versions")',
    // No comment at all.
    'print("It keeps each project on its own package versions")'],
  [5, 'virtual-environments', 'exercise2',
    '# requirements.txt lists the packages a project needs\n'
      + '# pip install -r requirements.txt installs all of them at once\n'
      + 'print("Anyone can reproduce the same setup from the list")',
    '# requirements.txt lists things\nprint("it is useful")'],

  [5, 'project-organization-best-practices', 'exercise1',
    '# src holds the code that does the work\n# tests holds the checks on that code\n'
      + '# docs holds the writing that explains it\n'
      + 'print("Knowing where to look is most of maintaining a project")',
    // Two of the three folders.
    '# src holds the code\n# tests holds the checks\nprint("organisation matters")'],
  [5, 'project-organization-best-practices', 'exercise2',
    '# lowercase words joined by underscores, so the name reads as a sentence\n'
      + 'def square_number(n):\n    return n * n\n\nprint(square_number(5))',
    // Right answer, no function, and the name convention untouched.
    'print(25)'],

  [7, 'introduction-file-handling', 'practice1',
    'with open("notes.txt") as f:\n    print(f.read())',
    // The contents typed out instead of read.
    'print("shopping list")\nprint("milk")\nprint("bread")'],

  [8, 'what-is-debugging', 'practice1',
    'def initials(name):\n    letters = ""\n    for word in name.split():\n'
      + '        letters = letters + word[0]\n    return letters\n',
    // The bug exactly as the page ships it.
    'def initials(name):\n    letters = ""\n    for word in name:\n'
      + '        letters = letters + word[0]\n    return letters\n'],

  [8, 'breakpoints-debuggers', 'practice1',
    'def first_negative(numbers):\n    for i in range(len(numbers)):\n'
      + '        if numbers[i] < 0:\n            return i\n    return -1\n',
    // Returns the value rather than the index: right for [-5, 2], wrong for [3, -1, 4].
    'def first_negative(numbers):\n    for i in range(len(numbers)):\n'
      + '        if numbers[i] < 0:\n            return numbers[i]\n    return -1\n'],

  [8, 'maintaining-code-quality', 'practice1',
    'def with_tax(price):\n    return price + price * 0.08\n\n'
      + 'book = 20.00\npen = 3.50\nprint(with_tax(book))\nprint(with_tax(pen))\n',
    // Tidier, but the formula is still written twice.
    'book = 20.00\npen = 3.50\nprint(book + book * 0.08)\nprint(pen + pen * 0.08)\n'],
];

describe('the newly graded lessons', () => {
  it('are valid check files', () => {
    expect(validateChecks().errors).toEqual([]);
  });

  it('gives every one of them a hint', () => {
    for (const [unit, slug, id] of FIXTURES) {
      expect(specFor(unit, slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });

  /* The coverage claim, asserted rather than believed. Every lesson in the
     course now has something that runs the student's code, except unit 10 --
     where a capstone has no reference program to run anything against. */
  it('leaves nothing but unit 10 ungraded', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const ungraded = [];
    for (const lesson of manifest.lessons) {
      const file = `assets/data/checks/unit-${lesson.unit}/${lesson.slug}.json`;
      const spec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
      const graded = Object.keys(spec).filter((k) => k !== 'questions' && k !== 'reflections');
      if (!graded.length) ungraded.push(`u${lesson.unit}/${lesson.slug}`);
    }
    expect(ungraded.every((u) => u.startsWith('u10/')), ungraded.join(', ')).toBe(true);
    expect(ungraded.length).toBe(10);
  });

  /* An editor with no check file is a button that grades nothing; a check file
     naming an editor the page lacks is caught by the validator. This is the
     other direction. */
  it('has a check for every editor the pages offer outside unit 10', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const orphans = [];
    for (const lesson of manifest.lessons) {
      if (lesson.unit === 10) continue;
      const file = `assets/data/checks/unit-${lesson.unit}/${lesson.slug}.json`;
      if (!fs.existsSync(file)) continue;
      const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
      const ids = [...new Set([...lesson.exercises, ...lesson.editors])];
      // Practice editors are for playing in; the graded ones are what a
      // teacher sees. A lesson is covered when at least one of its ids is.
      if (ids.length && !ids.some((id) => spec[id])) {
        orphans.push(`u${lesson.unit}/${lesson.slug} has [${ids}] and grades none`);
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe.skipIf(!havePython)('every newly graded check, run against real Python', () => {
  for (const [unit, slug, id, correct, wrong] of FIXTURES) {
    it(`u${unit}/${slug} / ${id}: accepts a correct solution`, () => {
      const s = score(specFor(unit, slug, id), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`u${unit}/${slug} / ${id}: rejects a plausible wrong answer`, () => {
      const s = score(specFor(unit, slug, id), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 180000);

/* ------------------------------------------------- the specific wrong answers */

describe.skipIf(!havePython)('the answers these lessons exist to refuse', () => {
  const rejects = (unit, slug, id, code, caseName) => {
    const s = score(specFor(unit, slug, id), code);
    expect(s.failed, `${slug}/${id} accepted it`).toContain(caseName);
  };

  /* The file lesson's version of the memorised answer: the contents typed out.
     It passes the visible case and fails the hidden one, which seeds a
     different file behind the same name. */
  it('refuses a shopping list typed from memory', () => {
    rejects(7, 'introduction-file-handling', 'practice1',
      'print("shopping list")\nprint("milk")\nprint("bread")',
      'reads the file rather than remembering it');
  });

  it('refuses a refactor that left the formula written twice', () => {
    rejects(8, 'maintaining-code-quality', 'practice1',
      'book = 20.00\npen = 3.50\nprint(book + book * 0.08)\nprint(pen + pen * 0.08)\n',
      'the function exists and is used twice');
  });

  it('refuses a square that was never a function', () => {
    rejects(5, 'project-organization-best-practices', 'exercise2', 'print(25)',
      'the work is done by a function');
  });

  /* PEP 8 is a fact about the name, which is source and not tree. */
  it('refuses a camelCase function name where the lesson taught snake_case', () => {
    rejects(5, 'project-organization-best-practices', 'exercise2',
      '# naming matters\ndef SquareNumber(n):\n    return n * n\n\nprint(SquareNumber(5))',
      'the name is lowercase with underscores');
  });

  it('refuses the unedited placeholder as a personal sentence', () => {
    rejects(1, 'what-is-python', 'practice1',
      'print("My name is ___ and I\'m learning Python!")',
      'the sentence is your own');
  });
});
