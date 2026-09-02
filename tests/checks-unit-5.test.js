import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import {
  score, specFor, havePython, setup, errorsForUnit,
} from './helpers/check-runner.js';

/* Unit 5 is about imports, and until recently the grader ran one file with no
   filesystem at all. It now seeds each case's working directory with the
   author's `files` and chdirs into it, so a fixture module really is
   importable -- `sys.path[0]` is '' and resolves to whatever the current
   directory is at import time. The first describe below proves that rather
   than asserting it, because the whole authoring decision for this unit turned
   on the answer.
 *
 * The answer being yes does not mean these lessons want fixtures. Every Unit 5
 * exercise prompt either uses the standard library, which is importable
 * anywhere, or asks the student to write the module's functions themselves and
 * says so ("simulate importing from a module: create a function greet(name)").
 * Seeding greetings.py under the second kind would hand over the answer the
 * exercise is asking for. So no exercise here carries `files`, and the
 * capability is proved once, here, instead.
 *
 * Everything else mirrors Unit 1: a reference solution that must pass every
 * case and a wrong answer that must not, run against real CPython through the
 * same harness the browser uses. The "rejects" half is what makes the
 * "accepts" half mean anything.
 */

beforeAll(() => {
  setup();
});

/* A correct solution and a plausible wrong one for every Unit 5 exercise. The
   wrong answers are the mistakes this unit actually produces: the module
   imported and then the function called bare, the alias created and then the
   original name used, `import *` where the prompt asked for one name, the
   module confused with the class inside it, test code left outside the
   __name__ guard. */
const FIXTURES = [
  ['what-are-modules', 'exercise1',
    'import random\n\nprint(random.randint(1, 10))\n',
    // Imported, then called as if the import had put randint in this file.
    'import random\n\nprint(randint(1, 10))\n'],
  ['what-are-modules', 'exercise2',
    'import random\n\nprint(dir(random))\nhelp(random.choice)\n',
    // dir() answers "what is in here" and is mistaken for answering both.
    'import random\n\nprint(dir(random))\n'],
  ['importing-builtin-modules', 'exercise1',
    'import math\n\nradius = 7\narea = math.pi * radius ** 2\nprint(f"Area: {area:.2f}")\n',
    // Right arithmetic, no rounding: prints 153.93804002589985.
    'import math\n\nradius = 7\nprint(math.pi * radius ** 2)\n'],
  ['importing-builtin-modules', 'exercise2',
    'from random import randint\n\nprint(randint(50, 100))\n',
    // Works, but is the plain import the exercise asked them not to use.
    'import random\n\nprint(random.randint(50, 100))\n'],
  ['creating-your-own-modules', 'exercise1',
    'def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b\n\n'
      + 'print(f"10 + 5 = {add(10, 5)}")\nprint(f"10 - 5 = {subtract(10, 5)}")\n',
    // Subtraction the wrong way round, which reads fine until you call it.
    'def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return b - a\n\n'
      + 'print(f"10 + 5 = {add(10, 5)}")\nprint(f"10 - 5 = {subtract(10, 5)}")\n'],
  ['creating-your-own-modules', 'exercise2',
    'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Python"))\n',
    // Prints instead of returning, so nothing can use the greeting.
    'def greet(name):\n    print(f"Hello, {name}!")\n\ngreet("Python")\n'],
  ['name-main-pattern', 'exercise1',
    'def double(n):\n    return n * 2\n\nif __name__ == "__main__":\n    print(double(7))\n',
    // The test runs on import too, which is the thing the pattern prevents.
    'def double(n):\n    return n * 2\n\nprint(double(7))\n'],
  ['name-main-pattern', 'exercise2',
    'print(__name__)\n\nif __name__ == "__main__":\n    print("Running directly")\n'
      + 'else:\n    print("Imported as module")\n',
    // Both messages printed unconditionally, so the if decides nothing.
    'print(__name__)\nprint("Running directly")\nprint("Imported as module")\n'],
  ['working-with-packages', 'exercise1',
    'def greet(name):\n    return f"Hello, {name}!"\n\n'
      + 'def farewell(name):\n    return f"Goodbye, {name}!"\n\n'
      + 'print(greet("Python"))\nprint(farewell("Python"))\n',
    // farewell takes a name and then ignores it.
    'def greet(name):\n    return f"Hello, {name}!"\n\n'
      + 'def farewell(name):\n    return "Goodbye!"\n\n'
      + 'print(greet("Python"))\nprint(farewell("Python"))\n'],
  ['working-with-packages', 'exercise2',
    'def square(n):\n    return n ** 2\n\ndef cube(n):\n    return n ** 3\n\n'
      + 'print(square(5))\nprint(cube(3))\n',
    // Cubing read as multiplying by three.
    'def square(n):\n    return n ** 2\n\ndef cube(n):\n    return n * 3\n\n'
      + 'print(square(5))\nprint(cube(3))\n'],
  ['python-standard-library', 'exercise1',
    'from datetime import datetime\n\nnow = datetime.now()\nprint(f"Current time: {now}")\n',
    // The module imported where the class was meant: module has no now().
    'import datetime\n\nprint(f"Current time: {datetime.now()}")\n'],
  ['python-standard-library', 'exercise2',
    'import random\n\nprint(dir(random))\nhelp(random.randint)\n',
    'import random\n\nprint(dir(random))\n'],
  ['module-aliases-selective-imports', 'exercise1',
    'import math as m\n\nresult = m.sqrt(25)\nprint(f"Square root of 25: {result}")\n',
    // Aliased, then used under the original name, which no longer exists.
    'import math as m\n\nresult = math.sqrt(25)\nprint(f"Square root of 25: {result}")\n'],
  ['module-aliases-selective-imports', 'exercise2',
    'from random import randint\n\nprint(randint(1, 100))\n',
    // The star import the lesson spends a section warning about.
    'from random import *\n\nprint(randint(1, 100))\n'],
];

/* The Unit 5 lessons with no exercise entry, and why. Each asks for comments
   and a printed explanation -- "explain what pip list does" -- which running
   the code cannot grade. A check that passes for any two comments and a print
   would tell a teacher the student understood something that was never
   tested, so these get questions only. */
const QUESTIONS_ONLY = [
  'installing-external-packages',
  'virtual-environments',
  'project-organization-best-practices',
];

describe('the Unit 5 check files are valid', () => {
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, 5)).toEqual([]);
  });

  it('covers every Unit 5 lesson', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const slugs = manifest.lessons.filter((l) => l.unit === 5).map((l) => l.slug);
    const authored = fs
      .readdirSync('assets/data/checks/unit-5')
      .map((n) => n.replace(/\.json$/, ''));
    expect(slugs.filter((s) => !authored.includes(s))).toEqual([]);
  });

  it('gives every graded exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(specFor(5, slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });

  it('gives every lesson three to five questions', () => {
    for (const name of fs.readdirSync('assets/data/checks/unit-5')) {
      const spec = JSON.parse(fs.readFileSync(`assets/data/checks/unit-5/${name}`, 'utf8'));
      expect(spec.questions, name).toBeTruthy();
      expect(spec.questions.length, name).toBeGreaterThanOrEqual(3);
      expect(spec.questions.length, name).toBeLessThanOrEqual(5);
    }
  });

  /* These three ask for comments and a printed explanation rather than a
     calculation, so they were left unchecked at first. They are checked now,
     and the instrument is source_matches -- the one place it is right, because
     what the exercise asks for really is prose in the source. The AST analyzer
     cannot see a comment, deliberately, so it cannot see these either.

     Still pinned, but on the thing that matters: each one has to be able to
     fail. A check on a prose exercise that accepts anything is worse than no
     check, because it reports a pass nobody earned. */
  it('checks the three prose lessons on their comments, and can fail them', () => {
    for (const slug of QUESTIONS_ONLY) {
      const spec = JSON.parse(fs.readFileSync(`assets/data/checks/unit-5/${slug}.json`, 'utf8'));
      const exercises = Object.keys(spec).filter((k) => k !== 'questions' && k !== 'reflections');
      expect(exercises.length, `${slug} has no graded exercise`).toBeGreaterThan(0);
      for (const id of exercises) {
        const all = [...(spec[id].cases || []), ...(spec[id].hiddenCases || [])];
        const canFail = all.some((c) => c.source_matches || c.kind === 'ast'
          || c.expect_stdout !== undefined || c.call);
        expect(canFail, `${slug}/${id} has nothing that can fail`).toBe(true);
      }
    }
  });
});

/* The capability this unit was authored against. Not a check file test: it is
   the evidence for why the check files look the way they do, and it fails
   loudly if seeding ever stops working. */
describe.skipIf(!havePython)('a fixture module is importable from a case', () => {
  const files = { 'greetings.py': 'def hello(name):\n    return f"Hello, {name}!"\n' };
  const spec = {
    files,
    cases: [{ name: 'imports the seeded module', expect_stdout: 'Hello, Ada!' }],
  };

  it('imports a seeded module and calls into it', () => {
    const s = score(spec, 'import greetings\n\nprint(greetings.hello("Ada"))\n');
    expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
  });

  it('finds nothing to import when no fixture was seeded', () => {
    const bare = { cases: spec.cases };
    expect(score(bare, 'import greetings\n\nprint(greetings.hello("Ada"))\n').passed).toBe(0);
  });
}, 60000);

describe.skipIf(!havePython)('every Unit 5 check, run against real Python', () => {
  for (const [slug, exerciseId, correct, wrong] of FIXTURES) {
    it(`${slug} / ${exerciseId}: accepts a correct solution`, () => {
      const s = score(specFor(5, slug, exerciseId), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`${slug} / ${exerciseId}: rejects a plausible wrong answer`, () => {
      const s = score(specFor(5, slug, exerciseId), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 300000);
