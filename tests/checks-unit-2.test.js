import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import {
  setup, havePython, score, specFor, errorsForUnit,
} from './helpers/check-runner.js';

/* Unit 2 shipped eleven check files of concept questions and no graded
 * exercise, so control flow -- the unit where a beginner first writes code
 * that decides something -- had nothing running their code.
 *
 * Nothing here is a function, so the drawn cases that carry Unit 3 do not
 * apply: there is no entry point to call with different arguments. What
 * replaces them is asking the *page's own variables* what they hold. A student
 * who prints the answer instead of computing it passes the stdout case and
 * fails `age >= minimum_age`, because that expression is evaluated in their
 * namespace and not in ours.
 */

beforeAll(() => setup());

/* A correct solution and a plausible wrong one for every Unit 2 exercise. The
   wrong answers are beginner mistakes, and several are the specific mistake of
   producing the right output without doing the work: the printed literal, the
   three prints where a loop was asked for, the narrowed range that never
   breaks. */
const FIXTURES = [
  ['understanding-control-flow', 'exercise1',
    'print("First message")\nprint("Second message")\nprint("Third message")',
    'print("First message")\nprint("Third message")\nprint("Second message")'],

  ['comparison-logical-operators', 'exercise1',
    'age = 20\nminimum_age = 18\nprint(age >= minimum_age)',
    // Right output, no comparison. The hidden case evaluates the expression
    // in the student's own namespace and finds nothing to evaluate.
    'print(True)'],
  ['comparison-logical-operators', 'exercise2',
    'age = 20\nhas_ticket = True\nprint(age >= 18 and has_ticket)',
    'age = 20\nhas_ticket = True\nprint(age >= 18 or has_ticket)'],

  ['if-statement', 'exercise1',
    'age = 20\nif age >= 18:\n    print("You are an adult!")',
    'age = 20\nprint("You are an adult!")'],
  ['if-statement', 'exercise2',
    'temperature = 85\nis_summer = True\nif temperature > 80 and is_summer:\n    print("It\'s hot!")',
    'temperature = 85\nis_summer = True\nprint("It\'s hot!")'],

  ['if-else-elif', 'exercise1',
    'age = 15\nif age >= 18:\n    print("Adult")\nelse:\n    print("Minor")',
    'age = 15\nprint("Minor")'],
  ['if-else-elif', 'exercise2',
    'score = 85\nif score >= 90:\n    print("A")\nelif score >= 80:\n    print("B")\n'
      + 'elif score >= 70:\n    print("C")\nelse:\n    print("F")',
    // One test where three were asked for: it prints B today and calls a 95 a B too.
    'score = 85\nif score >= 80:\n    print("B")\nelse:\n    print("F")'],

  ['nested-conditionals', 'exercise1',
    'age = 20\nhas_license = True\nif age >= 18:\n    if has_license:\n        print("You can drive!")',
    'age = 20\nhas_license = True\nif age >= 18 and has_license:\n    print("You can drive!")'],
  ['nested-conditionals', 'exercise2',
    'temperature = 85\nis_summer = True\nif temperature > 80:\n    if is_summer:\n'
      + '        print("Perfect for swimming!")\n    else:\n        print("Unusual heat for this season.")',
    'temperature = 85\nis_summer = True\nprint("Perfect for swimming!")'],

  ['boolean-logic-practice', 'exercise1',
    'age = 20\nhas_license = True\nhas_insurance = True\n'
      + 'if age >= 18 and has_license and has_insurance:\n    print("You can drive legally!")',
    'age = 20\nhas_license = True\nhas_insurance = True\nprint("You can drive legally!")'],
  ['boolean-logic-practice', 'exercise2',
    'age = 20\nhas_ticket = True\nis_vip = False\n'
      + 'if age >= 18 and (has_ticket or is_vip):\n    print("You can enter!")',
    'age = 20\nhas_ticket = True\nis_vip = False\nprint("You can enter!")'],

  ['introduction-loops', 'exercise1',
    'for i in range(3):\n    print("Hello")',
    // The output the loop was meant to replace.
    'print("Hello")\nprint("Hello")\nprint("Hello")'],

  ['while-loop', 'exercise1',
    'count = 1\nwhile count <= 3:\n    print(count)\n    count = count + 1',
    'print(1)\nprint(2)\nprint(3)'],
  ['while-loop', 'exercise2',
    'total = 0\ncount = 1\nwhile count <= 5:\n    total = total + count\n    count = count + 1\nprint(total)',
    'print(15)'],

  ['for-loop', 'exercise1',
    'for i in range(1, 6):\n    print(i)',
    // The off-by-one range writes six lines, and the last of them is 6.
    'for i in range(1, 7):\n    print(i)'],
  ['for-loop', 'exercise2',
    'colors = ["red", "blue", "green"]\nfor color in colors:\n    print(color)',
    'colors = ["red", "blue", "green"]\nprint(colors)'],

  ['loop-control-statements', 'exercise1',
    'for i in range(1, 11):\n    print(i)\n    if i == 7:\n        break',
    // Same seven lines, nothing broken out of.
    'for i in range(1, 8):\n    print(i)'],
  ['loop-control-statements', 'exercise2',
    'for i in range(1, 11):\n    if i % 3 == 0:\n        continue\n    print(i)',
    // continue after the print, so the multiples of three are printed anyway.
    'for i in range(1, 11):\n    print(i)\n    if i % 3 == 0:\n        continue'],

  ['practical-control-flow-examples', 'exercise1',
    'num1 = 15\nnum2 = 3\noperation = "*"\n'
      + 'if operation == "+":\n    print(num1 + num2)\nelif operation == "-":\n    print(num1 - num2)\n'
      + 'elif operation == "*":\n    print(num1 * num2)\nelse:\n    print(num1 / num2)',
    'num1 = 15\nnum2 = 3\noperation = "*"\nprint(45)'],
  ['practical-control-flow-examples', 'exercise2',
    'numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nfor num in numbers:\n    if num % 2 == 0:\n        print(num)',
    'numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nfor num in numbers:\n    print(num)'],
];

describe('the Unit 2 check files are valid', () => {
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, 2)).toEqual([]);
  });

  it('covers every Unit 2 lesson that has an exercise', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const missing = [];
    for (const lesson of manifest.lessons.filter((l) => l.unit === 2)) {
      const spec = JSON.parse(
        fs.readFileSync(`assets/data/checks/unit-2/${lesson.slug}.json`, 'utf8')
      );
      for (const id of lesson.exercises) {
        if (!spec[id]) missing.push(`${lesson.slug}/${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(specFor(2, slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });

  it('left the concept questions alone', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    for (const lesson of manifest.lessons.filter((l) => l.unit === 2)) {
      const spec = JSON.parse(
        fs.readFileSync(`assets/data/checks/unit-2/${lesson.slug}.json`, 'utf8')
      );
      expect(spec.questions, lesson.slug).toBeTruthy();
      expect(spec.questions.length, lesson.slug).toBeGreaterThanOrEqual(3);
    }
  });
});

describe.skipIf(!havePython)('every Unit 2 check, run against real Python', () => {
  for (const [slug, exerciseId, correct, wrong] of FIXTURES) {
    it(`${slug} / ${exerciseId}: accepts a correct solution`, () => {
      const s = score(specFor(2, slug, exerciseId), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`${slug} / ${exerciseId}: rejects a plausible wrong answer`, () => {
      const s = score(specFor(2, slug, exerciseId), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 180000);

/* ------------------------------------------------- output without the work */

/* Unit 2 has no functions, so there is no entry point to call with drawn
 * arguments and no way to defeat memorisation the way Unit 3 does. What is
 * available instead is the student's own namespace: an exercise that says
 * "compare these two variables" can ask Python to compare them afterwards, and
 * a printed literal has nothing to compare.
 *
 * These are the specific answers that produce exactly the right output and do
 * none of the work. Each one is what a stuck student actually types.
 */
describe.skipIf(!havePython)('the right output, none of the work', () => {
  const rejects = (slug, id, code, caseName) => {
    const s = score(specFor(2, slug, id), code);
    expect(s.failed, `${slug}/${id} accepted: ${code.split('\n')[0]}`).toContain(caseName);
  };

  it('refuses a printed True where a comparison was asked for', () => {
    rejects('comparison-logical-operators', 'exercise1', 'print(True)',
      'age holds 20');
  });

  it('refuses a message printed without the if that should guard it', () => {
    rejects('if-statement', 'exercise1', 'age = 20\nprint("You are an adult!")',
      'the message is inside an if');
  });

  it('refuses three prints where a loop was asked for', () => {
    rejects('introduction-loops', 'exercise1',
      'print("Hello")\nprint("Hello")\nprint("Hello")',
      'a loop does the repeating');
  });

  it('refuses a narrowed range standing in for break', () => {
    rejects('loop-control-statements', 'exercise1',
      'for i in range(1, 8):\n    print(i)',
      'a loop with a test inside it');
  });

  it('refuses a calculator that prints its own answer', () => {
    rejects('practical-control-flow-examples', 'exercise1',
      'num1 = 15\nnum2 = 3\noperation = "*"\nprint(45)',
      'the answer is calculated from the two numbers');
  });

  /* The comment cheat, which is why these are ast cases and not source
     regexes: a multiplication described in a comment is not a multiplication. */
  it('does not accept a multiplication written only in a comment', () => {
    rejects('practical-control-flow-examples', 'exercise1',
      'num1 = 15\nnum2 = 3\noperation = "*"\n# num1 * num2\nprint(45)',
      'the answer is calculated from the two numbers');
  });

  it('refuses and where the exercise asked for a nested if', () => {
    rejects('nested-conditionals', 'exercise1',
      'age = 20\nhas_license = True\nif age >= 18 and has_license:\n    print("You can drive!")',
      'one condition inside another');
  });

  /* Ordering, not just output. One test that happens to print B today would
     call a 95 a B as well, and the exercise is about the ladder. */
  it('refuses a single test where a grade ladder was asked for', () => {
    rejects('if-else-elif', 'exercise2',
      'score = 85\nif score >= 80:\n    print("B")\nelse:\n    print("F")',
      'three tests, checked in order');
  });
});
