import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import {
  score, specFor, havePython, setup, errorsForUnit,
} from './helpers/check-runner.js';

/* Unit 4 is the first unit where the thing being graded is a *shape* rather
   than a number: a tuple that should not have been a list, a set that still
   has its duplicates, a dictionary whose key was added instead of replaced.
   None of that shows up in stdout on its own -- print([1, 2]) and print((1, 2))
   differ by two characters -- so most of the work here is done by value cases
   that ask the namespace what it actually holds, and by raises cases that try
   to mutate a tuple and expect to be refused.

   Every exercise below is run for real: a solution that must pass every case,
   and the mistake a beginner actually makes, which must not. The "rejects"
   half is the part that makes the "accepts" half mean anything. */

beforeAll(() => {
  setup();
});

function spec(slug, exerciseId) {
  return specFor(4, slug, exerciseId);
}

/* The wrong answers are the named beginner mistakes of this unit: the list
   that should have been a tuple or a set, sort() and append() assigned over
   the variable they emptied, a slice that stops one short, a dictionary key
   added under a different capitalisation, iterating a dictionary and being
   handed keys, and the copy that was only ever a second name. */
const FIXTURES = [
  ['introduction-data-structures', 'exercise1',
    '# List\ncolors = ["red", "blue", "green"]\nprint(f"List: {colors}")\n'
      + '# Tuple\ncoordinates = (10, 20)\nprint(f"Tuple: {coordinates}")\n'
      + '# Dictionary\nperson = {"name": "Alice", "age": 25}\nprint(f"Dictionary: {person}")\n'
      + '# Set\nnumbers = {1, 2, 3, 3, 4, 5}\nprint(f"Set: {numbers}")',
    // The set written as a list, so the duplicate survives.
    '# List\ncolors = ["red", "blue", "green"]\nprint(f"List: {colors}")\n'
      + '# Tuple\ncoordinates = (10, 20)\nprint(f"Tuple: {coordinates}")\n'
      + '# Dictionary\nperson = {"name": "Alice", "age": 25}\nprint(f"Dictionary: {person}")\n'
      + '# Set\nnumbers = [1, 2, 3, 3, 4]\nprint(f"Set: {numbers}")'],

  ['introduction-data-structures', 'exercise2',
    '# List\nfruits = ["apple", "banana", "orange"]\nprint(f"List: {fruits}")\n'
      + '# Tuple\ncoordinates = (5, 10)\nprint(f"Tuple: {coordinates}")\n'
      + '# Dictionary\nlocation = {"city": "New York"}\nprint(f"Dictionary: {location}")\n'
      + '# Set\nnumbers = {1, 2, 2, 3}\nprint(f"Set: {numbers}")',
    // No comments, and the set is a list that keeps both 2s.
    'fruits = ["apple", "banana", "orange"]\nprint(fruits)\n'
      + 'coordinates = (5, 10)\nprint(coordinates)\n'
      + 'location = {"city": "New York"}\nprint(location)\n'
      + 'numbers = [1, 2, 2, 3]\nprint(numbers)'],

  ['lists-operations', 'exercise1',
    'grades = [85, 90, 78]\ngrades.append(92)\ngrades.remove(78)\nprint(grades)',
    // append() returns None, so the list is thrown away by the assignment.
    'grades = [85, 90, 78]\ngrades = grades.append(92)\ngrades.remove(78)\nprint(grades)'],

  ['lists-operations', 'exercise2',
    'numbers = [5, 2, 8, 2, 1]\nnumbers.sort()\ncount = numbers.count(2)\n'
      + 'print(f"Sorted: {numbers}")\nprint(f"Count of 2: {count}")',
    // The same mistake with sort(), which is where students meet it first.
    'numbers = [5, 2, 8, 2, 1]\nnumbers = numbers.sort()\ncount = numbers.count(2)\n'
      + 'print(f"Sorted: {numbers}")\nprint(f"Count of 2: {count}")'],

  ['indexing-slicing-lists', 'exercise1',
    'numbers = [10, 20, 30, 40, 50]\nprint(f"First: {numbers[0]}")\n'
      + 'print(f"Last: {numbers[-1]}")\nprint(f"Middle: {numbers[2]}")',
    // Counting from one: every index is off by exactly one.
    'numbers = [10, 20, 30, 40, 50]\nprint(f"First: {numbers[1]}")\n'
      + 'print(f"Last: {numbers[-2]}")\nprint(f"Middle: {numbers[3]}")'],

  ['indexing-slicing-lists', 'exercise2',
    'letters = ["a", "b", "c", "d", "e", "f"]\nprint(f"First three: {letters[:3]}")\n'
      + 'print(f"Last two: {letters[-2:]}")\nprint(f"Middle: {letters[2:5]}")',
    // The stop of a slice is exclusive, so [2:4] is one item short.
    'letters = ["a", "b", "c", "d", "e", "f"]\nprint(f"First three: {letters[:3]}")\n'
      + 'print(f"Last two: {letters[-2:]}")\nprint(f"Middle: {letters[2:4]}")'],

  ['nested-lists-2d', 'exercise1',
    'grid = [[1, 2, 3], [4, 5, 6]]\nprint(f"Element at [0][1]: {grid[0][1]}")\n'
      + 'print(f"Element at [1][2]: {grid[1][2]}")',
    // Row and column the wrong way round.
    'grid = [[1, 2, 3], [4, 5, 6]]\nprint(f"Element at [1][0]: {grid[1][0]}")\n'
      + 'print(f"Element at [1][1]: {grid[1][1]}")'],

  ['nested-lists-2d', 'exercise2',
    'table = [[10, 20], [30, 40], [50, 60]]\nfor row in table:\n'
      + '    for element in row:\n        print(element)',
    // One loop only, so each row is printed with its brackets.
    'table = [[10, 20], [30, 40], [50, 60]]\nfor row in table:\n    print(row)'],

  ['tuples-immutable', 'exercise1',
    'coordinates = (10, 20)\nprint(f"X-coordinate: {coordinates[0]}")\n'
      + 'print(f"Y-coordinate: {coordinates[1]}")',
    // Square brackets instead of parentheses: a list that reads the same.
    'coordinates = [10, 20]\nprint(f"X-coordinate: {coordinates[0]}")\n'
      + 'print(f"Y-coordinate: {coordinates[1]}")'],

  ['tuples-immutable', 'exercise2',
    'info = ("Python", 3, "Beginner")\nprint(f"Length: {len(info)}")\n'
      + 'print(f"First element: {info[0]}")\nfor item in info:\n    print(item)',
    // A list, and the whole thing printed instead of walked.
    'info = ["Python", 3, "Beginner"]\nprint(f"Length: {len(info)}")\n'
      + 'print(f"First element: {info[0]}")\nprint(info)'],

  ['dictionaries-key-value', 'exercise1',
    'person = {"name": "Alice", "age": 25, "city": "Boston"}\n'
      + 'print(f"Name: {person[\'name\']}")\nprint(f"Age: {person[\'age\']}")',
    // Three values in a list, reached by position instead of by key.
    'person = ["Alice", 25, "Boston"]\nprint(f"Name: {person[0]}")\n'
      + 'print(f"Age: {person[1]}")'],

  ['dictionaries-key-value', 'exercise2',
    'car = {"brand": "Toyota", "model": "Camry"}\ncar["year"] = 2020\n'
      + 'car["model"] = "Corolla"\nprint(car)',
    // Keys are case-sensitive, so this adds a fourth key and Camry stays.
    'car = {"brand": "Toyota", "model": "Camry"}\ncar["year"] = 2020\n'
      + 'car["Model"] = "Corolla"\nprint(car)'],

  ['dictionary-methods-iteration', 'exercise1',
    'inventory = {"apples": 10, "bananas": 5, "oranges": 8}\n'
      + 'apples = inventory.get("apples")\ngrapes = inventory.get("grapes", 0)\n'
      + 'print(f"Apples: {apples}")\nprint(f"Grapes: {grapes}")',
    // Square brackets on a key that is not there stops the program.
    'inventory = {"apples": 10, "bananas": 5, "oranges": 8}\n'
      + 'print(f"Apples: {inventory[\'apples\']}")\n'
      + 'print(f"Grapes: {inventory[\'grapes\']}")'],

  ['dictionary-methods-iteration', 'exercise2',
    'scores = {"Alice": 85, "Bob": 92, "Charlie": 78}\n'
      + 'for name, score in scores.items():\n    print(f"{name}: {score}")',
    // Iterating a dictionary hands you keys, not pairs.
    'scores = {"Alice": 85, "Bob": 92, "Charlie": 78}\nfor name in scores:\n    print(name)'],

  ['sets-unique-collections', 'exercise1',
    'colors = {"red", "green", "blue"}\ncolors.add("yellow")\ncolors.remove("green")\nprint(colors)',
    // A list with the same three colours: add() becomes append() and the
    // duplicate guarantee is gone.
    'colors = ["red", "green", "blue"]\ncolors.append("yellow")\n'
      + 'colors.remove("green")\nprint(colors)'],

  ['sets-unique-collections', 'exercise2',
    'set1 = {1, 2, 3, 4}\nset2 = {3, 4, 5, 6}\nintersection = set1 & set2\n'
      + 'union = set1 | set2\nprint(f"Intersection: {intersection}")\nprint(f"Union: {union}")',
    // - instead of &: what only set1 has, rather than what both have.
    'set1 = {1, 2, 3, 4}\nset2 = {3, 4, 5, 6}\nintersection = set1 - set2\n'
      + 'union = set1 | set2\nprint(f"Intersection: {intersection}")\nprint(f"Union: {union}")'],

  ['copying-comparing-structures', 'exercise1',
    'original = [1, 2, 3]\ncopy_list = original.copy()\ncopy_list.append(4)\n'
      + 'print(f"Original: {original}")\nprint(f"Copy: {copy_list}")',
    // Assignment copies the name, so appending changes original too.
    'original = [1, 2, 3]\ncopy_list = original\ncopy_list.append(4)\n'
      + 'print(f"Original: {original}")\nprint(f"Copy: {copy_list}")'],

  ['copying-comparing-structures', 'exercise2',
    'list1 = [1, 2, 3]\nlist2 = [1, 2, 3]\nprint(f"Equal: {list1 == list2}")\n'
      + 'print(f"Same object: {list1 is list2}")',
    // One list under two names, so `is` answers True and the point is lost.
    'list1 = [1, 2, 3]\nlist2 = list1\nprint(f"Equal: {list1 == list2}")\n'
      + 'print(f"Same object: {list1 is list2}")'],

  ['choosing-right-structure', 'exercise1',
    'days = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")\n'
      + 'print(days)',
    // A list, for data the exercise says is fixed.
    'days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]\n'
      + 'print(days)'],

  ['choosing-right-structure', 'exercise2',
    'words = ["apple", "banana", "apple", "cherry", "banana", "apple"]\ncount = {}\n'
      + 'for word in words:\n    if word in count:\n        count[word] += 1\n'
      + '    else:\n        count[word] = 1\nprint(count)',
    // No check for a key that is already there, so every count stays at 1.
    'words = ["apple", "banana", "apple", "cherry", "banana", "apple"]\ncount = {}\n'
      + 'for word in words:\n    count[word] = 1\nprint(count)'],
];

describe('the Unit 4 check files are valid', () => {
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, 4)).toEqual([]);
  });

  it('covers every Unit 4 lesson that has exercises', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const withExercises = manifest.lessons
      .filter((l) => l.unit === 4 && l.exercises.length)
      .map((l) => l.slug);
    const authored = fs
      .readdirSync('assets/data/checks/unit-4')
      .map((n) => n.replace(/\.json$/, ''));
    expect(withExercises.filter((s) => !authored.includes(s))).toEqual([]);
  });

  it('has a fixture for every exercise it grades', () => {
    const graded = [];
    for (const name of fs.readdirSync('assets/data/checks/unit-4')) {
      const slug = name.replace(/\.json$/, '');
      const file = JSON.parse(fs.readFileSync(`assets/data/checks/unit-4/${name}`, 'utf8'));
      for (const id of Object.keys(file)) {
        if (id === 'questions' || id === 'reflections') continue;
        graded.push(`${slug}/${id}`);
      }
    }
    const covered = FIXTURES.map(([slug, id]) => `${slug}/${id}`);
    expect(graded.filter((one) => !covered.includes(one))).toEqual([]);
  });

  it('gives every exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(spec(slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });
});

describe.skipIf(!havePython)('every Unit 4 check, run against real Python', () => {
  for (const [slug, exerciseId, correct, wrong] of FIXTURES) {
    it(`${slug} / ${exerciseId}: accepts a correct solution`, () => {
      const s = score(spec(slug, exerciseId), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`${slug} / ${exerciseId}: rejects a plausible wrong answer`, () => {
      const s = score(spec(slug, exerciseId), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 300000);

/* ------------------------------------------------- what the shapes catch */

/* The value cases in this unit are the only thing standing between "printed
   something that looks right" and "built the structure the lesson asked for",
   so each one is pinned to the confusion it exists to catch. */
describe.skipIf(!havePython)('the structure checks against the near misses', () => {
  it('a list where a tuple was asked for fails the tuple check', () => {
    const s = score(spec('tuples-immutable', 'exercise1'), 'coordinates = [10, 20]\nprint(10)\nprint(20)');
    expect(s.failed).toContain('coordinates is a tuple, so nothing can be appended to it');
  });

  it('a list where a set was asked for keeps its duplicates and is caught', () => {
    const s = score(spec('sets-unique-collections', 'exercise1'),
      'colors = ["red", "green", "blue", "yellow"]\ncolors.remove("green")\nprint(colors)');
    expect(s.failed).toContain('colors really is a set');
  });

  it('a dictionary counted by hand fails the loop check', () => {
    const s = score(spec('choosing-right-structure', 'exercise2'),
      'count = {"apple": 3, "banana": 2, "cherry": 1}\nprint(count)');
    expect(s.failed).toContain('the counts come out of a loop');
  });

  it('output that reads correctly but skips items() is still refused', () => {
    // Correct output, wrong method. The lesson asks for items() by name, and
    // only the ast case can tell the two apart.
    const s = score(spec('dictionary-methods-iteration', 'exercise2'),
      'scores = {"Alice": 85, "Bob": 92, "Charlie": 78}\nfor name in scores:\n'
        + '    print(f"{name}: {scores[name]}")');
    expect(s.failed).toEqual(['items() drives the loop']);
  });
}, 120000);
