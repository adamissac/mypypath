import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import { score, specFor, havePython, setup, errorsForUnit } from './helpers/check-runner.js';

/* Unit 3 is the unit `generated` was built for: almost every lesson asks for a
   function with a rule, and a rule is exactly the thing a fixed list of hidden
   cases fails to test. So the strong exercises here are graded against a
   reference solution over drawn arguments, and the ones that cannot be -- the
   lessons about docstrings, scope, lambda syntax and nested helpers -- are
   graded structurally, through the parser rather than through a regex.

   Each exercise is run for real below: a correct solution that must pass every
   case, and a wrong answer that must not. The wrong answers are the mistakes a
   beginner makes -- printing where a return was wanted, forgetting the return
   altogether, defining a helper and never calling it, hardcoding the answer the
   listed cases ask for -- because a check that cannot fail is worse than no
   check.

   One constraint shapes the fixtures. The shared runner draws generated cases
   by execing the student's code in a python3 subprocess whose stdout carries
   the result back as JSON, so any exercise graded with a generated case has a
   fixture that defines its function and prints nothing. That is why the
   print-and-check exercises and the drawn-case exercises are disjoint here. */

beforeAll(() => {
  setup();
});

const FIXTURES = [
  ['what-are-functions', 'exercise1',
    'print(len("Python"))\nprint(type("Python"))',
    // The two answers typed in as literals, which is what a student who has not
    // understood that len and type do the work writes.
    'print(6)\nprint("<class \'str\'>")'],

  ['defining-calling-functions', 'exercise1',
    'def introduce():\n    print("My name is Ada")\n    print("I like birdwatching")\n\nintroduce()\nintroduce()',
    // Defined and called, but only once.
    'def introduce():\n    print("My name is Ada")\n    print("I like birdwatching")\n\nintroduce()'],
  ['defining-calling-functions', 'exercise2',
    'def display_info():\n    print("Ada")\n    print("36")\n    print("blue")\n\ndisplay_info()',
    // The right output, with no function anywhere in it.
    'print("Ada")\nprint("36")\nprint("blue")'],

  ['parameters-arguments', 'exercise1',
    'def say_hello(name):\n    print("Hello, " + name + "!")\n\nsay_hello("Ada")',
    // Takes a parameter and ignores it, so it greets Ada whoever it is passed.
    'def say_hello(name):\n    print("Hello, Ada!")\n\nsay_hello("Ada")'],
  ['parameters-arguments', 'exercise2',
    'def calculate_area(length, width):\n    print(length * width)\n\ncalculate_area(5, 3)',
    'def calculate_area(length, width):\n    print(15)\n\ncalculate_area(5, 3)'],

  ['return-statements', 'exercise1',
    'def calculate_perimeter(length, width):\n    return 2 * length + 2 * width\n',
    // Works out the right number and throws it away.
    'def calculate_perimeter(length, width):\n    2 * length + 2 * width\n'],
  ['return-statements', 'exercise2',
    'def double(number):\n    return number * 2\n',
    'def double(number):\n    return number + 2\n'],

  ['variable-scope-lifetime', 'exercise1',
    'name = "Python"\n\ndef greet():\n    greeting = "Hello"\n    print(greeting)\n    print(name)\n\ngreet()',
    // Only prints the local, so the point about reading an outer variable is missed.
    'name = "Python"\n\ndef greet():\n    greeting = "Hello"\n    print(greeting)\n\ngreet()'],
  ['variable-scope-lifetime', 'exercise2',
    'counter = 0\n\ndef increment_counter():\n    global counter\n    counter = counter + 1\n    print(counter)\n\nincrement_counter()\nincrement_counter()',
    // Assigns inside the function without `global`, so each call counts its own
    // fresh local from zero and both calls print 1.
    'counter = 0\n\ndef increment_counter():\n    counter = 0\n    counter = counter + 1\n    print(counter)\n\nincrement_counter()\nincrement_counter()'],

  ['default-optional-parameters', 'exercise1',
    'def greet(name, greeting="Hello"):\n    print(greeting + ", " + name)\n\ngreet("Ada")\ngreet("Ada", "Welcome")',
    // No default, so the caller is forced to supply the greeting every time.
    'def greet(name, greeting):\n    print(greeting + ", " + name)\n\ngreet("Ada", "Hello")\ngreet("Ada", "Welcome")'],
  ['default-optional-parameters', 'exercise2',
    'def create_message(name, prefix="Hi", suffix="!"):\n    return prefix + ", " + name + suffix\n',
    'def create_message(name, prefix="Hi", suffix="!"):\n    return prefix + ", " + name\n'],

  ['docstrings-documentation', 'exercise1',
    'def square_number(number):\n    """Return the square of the number given to it."""\n    return number * number\n',
    // A comment where the docstring should be: nothing can read it back.
    'def square_number(number):\n    # Return the square of the number given to it.\n    return number * number\n'],
  ['docstrings-documentation', 'exercise2',
    'def calculate_total(price, tax_rate=0.08):\n'
      + '    """Work out the total price once tax has been added.\n\n'
      + '    Parameters:\n'
      + '        price: the price before tax\n'
      + '        tax_rate: the tax rate as a decimal, 0.08 by default\n\n'
      + '    Returns:\n'
      + '        The total price including tax.\n'
      + '    """\n'
      + '    return price * (1 + tax_rate)\n',
    // Right arithmetic, one-line docstring, so the multi-line requirement is missed.
    'def calculate_total(price, tax_rate=0.08):\n    """Work out the total."""\n    return price * (1 + tax_rate)\n'],

  ['nested-helper-functions', 'exercise1',
    'def calculate_discount(price, discount_percentage):\n'
      + '    def apply_discount(amount, percentage):\n'
      + '        return amount - (amount * percentage / 100)\n\n'
      + '    return apply_discount(price, discount_percentage)\n',
    // The helper is defined and then never called.
    'def calculate_discount(price, discount_percentage):\n'
      + '    def apply_discount(amount, percentage):\n'
      + '        return amount - (amount * percentage / 100)\n\n'
      + '    return price\n'],
  ['nested-helper-functions', 'exercise2',
    'def validate_password(password):\n'
      + '    def has_min_length(value):\n'
      + '        return len(value) >= 8\n\n'
      + '    def has_number(value):\n'
      + '        for character in value:\n'
      + '            if character.isdigit():\n'
      + '                return True\n'
      + '        return False\n\n'
      + '    return has_min_length(password) and has_number(password)\n',
    // Both helpers written, only one of them used.
    'def validate_password(password):\n'
      + '    def has_min_length(value):\n'
      + '        return len(value) >= 8\n\n'
      + '    def has_number(value):\n'
      + '        return value.isdigit()\n\n'
      + '    return has_min_length(password)\n'],

  ['lambda-functions', 'exercise1',
    'triple = lambda number: number * 3\n',
    // Correct arithmetic, wrong shape: the lesson is about the lambda.
    'def triple(number):\n    return number * 3\n'],
  ['lambda-functions', 'exercise2',
    'numbers = [1, 2, 3, 4, 5]\nsquares = list(map(lambda x: x * x, numbers))\nprint(squares)',
    // The right list, built with a comprehension instead of map.
    'numbers = [1, 2, 3, 4, 5]\nsquares = [x * x for x in numbers]\nprint(squares)'],

  ['practical-function-examples', 'exercise1',
    'def calculate(num1, operation, num2):\n'
      + '    """Return the result of applying operation to num1 and num2."""\n'
      + '    if operation == "+":\n        return num1 + num2\n'
      + '    elif operation == "-":\n        return num1 - num2\n'
      + '    elif operation == "*":\n        return num1 * num2\n'
      + '    elif operation == "/":\n        return num1 / num2\n',
    // Three branches written and the fourth forgotten, so division returns None.
    'def calculate(num1, operation, num2):\n'
      + '    """Return the result of applying operation to num1 and num2."""\n'
      + '    if operation == "+":\n        return num1 + num2\n'
      + '    elif operation == "-":\n        return num1 - num2\n'
      + '    elif operation == "*":\n        return num1 * num2\n'],
  ['practical-function-examples', 'exercise2',
    'def process_text(text, uppercase=False, reverse=False):\n'
      + '    """Return the text with the requested changes applied."""\n'
      + '    def to_uppercase(value):\n        return value.upper()\n\n'
      + '    def reverse_text(value):\n        return value[::-1]\n\n'
      + '    result = text\n'
      + '    if uppercase:\n        result = to_uppercase(result)\n'
      + '    if reverse:\n        result = reverse_text(result)\n'
      + '    return result\n',
    // Both helpers applied every time, so the two flags do nothing.
    'def process_text(text, uppercase=False, reverse=False):\n'
      + '    """Return the text with the requested changes applied."""\n'
      + '    def to_uppercase(value):\n        return value.upper()\n\n'
      + '    def reverse_text(value):\n        return value[::-1]\n\n'
      + '    return reverse_text(to_uppercase(text))\n'],
];

describe('the Unit 3 check files are valid', () => {
  /* Scoped to this unit on purpose. validateChecks reads every unit, and units
     4 to 10 are being authored alongside this one. */
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, 3)).toEqual([]);
  });

  it('covers every Unit 3 lesson that has exercises', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const withExercises = manifest.lessons
      .filter((l) => l.unit === 3 && l.exercises.length)
      .map((l) => l.slug);
    const authored = fs
      .readdirSync('assets/data/checks/unit-3')
      .map((n) => n.replace(/\.json$/, ''));
    expect(withExercises.filter((s) => !authored.includes(s))).toEqual([]);
  });

  it('grades every exercise the pages actually have', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const missing = [];
    for (const lesson of manifest.lessons.filter((l) => l.unit === 3)) {
      const spec = JSON.parse(
        fs.readFileSync(`assets/data/checks/unit-3/${lesson.slug}.json`, 'utf8')
      );
      for (const id of lesson.exercises) {
        if (!spec[id]) missing.push(`${lesson.slug}/${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(specFor(3, slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });

  it('has a fixture for every exercise it authored', () => {
    const covered = new Set(FIXTURES.map(([slug, id]) => `${slug}/${id}`));
    const authored = [];
    for (const name of fs.readdirSync('assets/data/checks/unit-3')) {
      const slug = name.replace(/\.json$/, '');
      const spec = JSON.parse(fs.readFileSync(`assets/data/checks/unit-3/${name}`, 'utf8'));
      for (const id of Object.keys(spec)) {
        if (id === 'questions' || id === 'reflections') continue;
        authored.push(`${slug}/${id}`);
      }
    }
    expect(authored.filter((one) => !covered.has(one))).toEqual([]);
  });
});

describe.skipIf(!havePython)('every Unit 3 check, run against real Python', () => {
  for (const [slug, exerciseId, correct, wrong] of FIXTURES) {
    it(`${slug} / ${exerciseId}: accepts a correct solution`, () => {
      const s = score(specFor(3, slug, exerciseId), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`${slug} / ${exerciseId}: rejects a plausible wrong answer`, () => {
      const s = score(specFor(3, slug, exerciseId), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 300000);

/* ---------------------------------------------------- the drawn cases bite */

/* The generated cases are the reason this unit can be graded at all, so they
   get their own tests: a rule that is right passes, and the two ways a student
   fakes a rule do not. */
describe.skipIf(!havePython)('generated cases against a faked rule', () => {
  it('refuses a perimeter hardcoded to the cases the exercise lists', () => {
    const cheat = 'def calculate_perimeter(length, width):\n'
      + '    if length == 5 and width == 3: return 16\n'
      + '    if length == 0 and width == 0: return 0\n'
      + '    return 0\n';
    const s = score(specFor(3, 'return-statements', 'exercise1'), cheat);
    expect(s.failed).toContain('works for any two sides, not only the ones listed');
  });

  it('refuses a password check that only looks at the length', () => {
    const cheat = 'def validate_password(password):\n'
      + '    def has_min_length(value):\n        return len(value) >= 8\n\n'
      + '    def has_number(value):\n        return True\n\n'
      + '    return has_min_length(password) and has_number(password)\n';
    const s = score(specFor(3, 'nested-helper-functions', 'exercise2'), cheat);
    expect(s.failed).toContain('both rules hold for any password');
  });
}, 120000);

/* The structural cases are the other half. Where a lesson is about the shape of
   the code rather than the answer, the answer alone must not be enough. */
describe.skipIf(!havePython)('structural cases against the right answer in the wrong shape', () => {
  it('refuses a squaring lambda rewritten as a def', () => {
    const s = score(specFor(3, 'lambda-functions', 'exercise1'), 'def triple(n):\n    return n * 3\n');
    expect(s.failed).toContain('triple is written as a lambda, not with def');
  });

  it('refuses map replaced by a for loop', () => {
    const cheat = 'numbers = [1, 2, 3, 4, 5]\nsquares = []\n'
      + 'for n in numbers:\n    squares.append(n * n)\nprint(squares)';
    const s = score(specFor(3, 'lambda-functions', 'exercise2'), cheat);
    expect(s.failed).toContain('the squaring is done by map, not by a loop or a named function');
  });

  /* The cheat the ast analyzer exists for: a comment is not code, and a regex
     over source cannot tell the difference. */
  it('refuses an area whose multiplication is only written in a comment', () => {
    const cheat = 'def calculate_area(length, width):\n    # length * width\n    print(15)\n\n'
      + 'calculate_area(5, 3)';
    const s = score(specFor(3, 'parameters-arguments', 'exercise2'), cheat);
    expect(s.failed).toContain('the area is multiplied out of the two parameters');
  });

  it('refuses a docstring written as a comment above the def', () => {
    const cheat = '# Return the square of the number given to it.\n'
      + 'def square_number(number):\n    return number * number\n';
    const s = score(specFor(3, 'docstrings-documentation', 'exercise1'), cheat);
    expect(s.failed).toContain('the function carries a docstring');
  });
}, 120000);
