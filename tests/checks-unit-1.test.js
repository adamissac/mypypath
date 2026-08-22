import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateChecks } from '../scripts/validate-checks.js';

/* Authoring a check file is easy to get subtly wrong: a regex that never
   matches, an expected stdout with the wrong float formatting, a case that
   passes for the wrong reason. So each Unit 1 exercise is run here for real --
   a reference solution that must pass every case, and a wrong answer that must
   not -- against actual CPython through the same harness the browser uses.

   A check that cannot fail is worse than no check: it tells a teacher the
   student succeeded when nothing was verified. The "rejects" half of each
   pair is the part that makes the "accepts" half mean something. */

let C;
let harnessPath;

const python = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8' });
const havePython = python.status === 0;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/checker.js', 'utf8')).call(window);
  C = window.PyPathChecker;

  const src = fs.readFileSync('assets/js/checker.js', 'utf8');
  const marker = src.match(/var TIMEOUT_MARKER = '([^']+)'/)[1];
  const body = src.match(/var HARNESS = \[([\s\S]*?)\]\.join\('\\n'\);/)[1];
  // eslint-disable-next-line no-eval
  const lines = eval(`(function(){var TIMEOUT_MARKER=${JSON.stringify(marker)};return [${body}];})()`);
  harnessPath = path.join('node_modules', '.pypath-harness.py');
  fs.writeFileSync(harnessPath, lines.join('\n'), 'utf8');
});

function runCase(code, testCase) {
  const call = C.isExpressionCase(testCase) ? testCase.call : '';
  const script = [
    `exec(open(${JSON.stringify(harnessPath)}).read(), globals())`,
    `print(_pypath_run_case(${JSON.stringify(code)}, ${JSON.stringify(testCase.stdin || '')}, ` +
      `${JSON.stringify(call)}, 5))`,
  ].join('\n');
  const out = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());

  if (C.isPropertyCase(testCase)) {
    if (out.error) return false;
    return C.checkProperty(testCase, out.stdout, code).ok;
  }
  if (call) return !out.error && C.compareValue(out.value == null ? '' : out.value, testCase.expect);
  return !out.error && C.compareOutput(out.stdout, testCase.expect_stdout);
}

/* Runs every visible and hidden case for one exercise and returns the tally. */
function score(spec, code) {
  const all = [...(spec.cases || []), ...(spec.hiddenCases || [])];
  const results = all.map((c) => ({ name: c.name, ok: runCase(code, c) }));
  return {
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    failed: results.filter((r) => !r.ok).map((r) => r.name),
  };
}

function spec(slug, exerciseId) {
  return JSON.parse(
    fs.readFileSync(`assets/data/checks/unit-1/${slug}.json`, 'utf8')
  )[exerciseId];
}

/* A correct solution and a plausible wrong one for every Unit 1 exercise. The
   wrong answers are the mistakes a beginner actually makes, not nonsense: the
   unindented body, the string multiplied instead of converted, the missing
   parentheses that let multiplication go first. */
const FIXTURES = [
  ['first-program', 'exercise1',
    'print("Hello from Ada!")',
    'Hello from Ada!'],
  ['first-program', 'exercise2',
    'print("Ada")\nprint("blue")\nprint("noodles")',
    'print("Ada")'],
  ['syntax-indentation', 'exercise1',
    'if True:\n    print("Hello")',
    'if True:\nprint("Hello")'],
  ['syntax-indentation', 'exercise2',
    'print("Start")\nif True:\n    print("Middle")\nprint("End")',
    'print("Start")\nprint("Middle")\nprint("End")'],
  ['variables-types', 'exercise1',
    'age = 30\nheight = 1.75\nname = "Ada"\nprint(age)\nprint(height)\nprint(name)',
    'age = 30\nname = "Ada"\nprint(age)\nprint(name)'],
  ['variables-types', 'exercise2',
    'price = 15.50\nquantity = 4\nprint(price * quantity)',
    'price = 15.50\nquantity = 4\nprint(price + quantity)'],
  ['type-io', 'exercise1',
    'text_number = "10"\nprint(int(text_number) * 5)',
    'text_number = "10"\nprint(text_number * 5)'],
  ['type-io', 'exercise2',
    'name = "Alice"\nage = 25\nprint(f"Hello, {name}! You are {age} years old.")',
    'name = "Alice"\nage = 25\nprint("Hello,", name, "! You are", age, "years old.")'],
  ['comments-docs', 'exercise1',
    '# the radius we were given\nradius = 5\n# area of a circle is pi times the radius squared\narea = 3.14 * radius * radius\nprint(area)',
    'radius = 5\narea = 3.14 * radius * radius\nprint(area)'],
  ['comments-docs', 'exercise2',
    '# the price before tax\nprice = 20.00\n# 8% tax, so the total is 108% of the price\ntotal = price * 1.08\nprint(total)',
    'price = 20.00\ntotal = price * 1.08\nprint(total)'],
  ['arithmetic-expressions', 'exercise1',
    'length = 8\nwidth = 5\nprint(length * width)',
    'length = 8\nwidth = 5\nprint(40)'],
  ['arithmetic-expressions', 'exercise2',
    'print((10 + 5) * 3 - 8)',
    'print(10 + 5 * 3 - 8)'],
];

describe('the Unit 1 check files are valid', () => {
  it('names only exercises that exist on the page', () => {
    expect(validateChecks().errors).toEqual([]);
  });

  it('covers every Unit 1 lesson that has exercises', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const withExercises = manifest.lessons
      .filter((l) => l.unit === 1 && l.exercises.length)
      .map((l) => l.slug);
    const authored = fs
      .readdirSync('assets/data/checks/unit-1')
      .map((n) => n.replace(/\.json$/, ''));
    expect(withExercises.filter((s) => !authored.includes(s))).toEqual([]);
  });

  it('gives every exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(spec(slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });
});

describe.skipIf(!havePython)('every Unit 1 check, run against real Python', () => {
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
}, 120000);
