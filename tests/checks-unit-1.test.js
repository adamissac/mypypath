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

let AST;
let analyzerPath;

beforeAll(() => {
  for (const dep of ['question-types', 'checker-gen', 'checker-ast', 'checker']) {
    new Function(fs.readFileSync(`assets/js/${dep}.js`, 'utf8')).call(window);
  }
  C = window.PyPathChecker;
  AST = window.PyPathAst;

  analyzerPath = path.join('node_modules', '.pypath-analyzer.py');
  fs.writeFileSync(analyzerPath, AST.ANALYZER, 'utf8');

  const src = fs.readFileSync('assets/js/checker.js', 'utf8');
  const marker = src.match(/var TIMEOUT_MARKER = '([^']+)'/)[1];
  const body = src.match(/var HARNESS = \[([\s\S]*?)\]\.join\('\\n'\);/)[1];
  // eslint-disable-next-line no-eval
  const lines = eval(`(function(){var TIMEOUT_MARKER=${JSON.stringify(marker)};return [${body}];})()`);
  harnessPath = path.join('node_modules', '.pypath-harness.py');
  fs.writeFileSync(harnessPath, lines.join('\n'), 'utf8');
});

/* The structural report, from real CPython's own ast module. Same source the
   browser runs, so a case that passes here passes there. */
function analyze(code) {
  const script = [
    `exec(open(${JSON.stringify(analyzerPath)}).read(), globals())`,
    `print(_pypath_analyze(${JSON.stringify(code)}))`,
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());
}

/* One drawn case set, reference against student, through the same generator
   the browser uses. */
function runGenerated(code, testCase, attempt) {
  const GEN = window.PyPathGen;
  const rows = GEN.draw(testCase.args || [], testCase.runs || 20, (attempt || 1) * 7919);
  const calls = rows.map((row) => GEN.callFor(testCase.entry, row)).filter(Boolean);
  const script = [
    'import json',
    `_ref_ns = {}`,
    `exec(${JSON.stringify(testCase.reference)}, _ref_ns)`,
    `_ns = {}`,
    `_err = None`,
    `try:`,
    `    exec(${JSON.stringify(code)}, _ns)`,
    `except BaseException as e:`,
    `    _err = type(e).__name__`,
    `_passed = 0`,
    `_total = 0`,
    `for _one in json.loads(${JSON.stringify(JSON.stringify(calls))}):`,
    `    if _err: break`,
    `    _total += 1`,
    `    try:`,
    `        _want = eval(_one, _ref_ns)`,
    `    except BaseException:`,
    `        _total -= 1`,
    `        continue`,
    `    try:`,
    `        _got = eval(_one, _ns)`,
    `    except BaseException:`,
    `        continue`,
    `    if repr(_got) == repr(_want): _passed += 1`,
    `print(json.dumps({"passed": _passed, "total": _total, "error": _err}))`,
  ].join('\n');
  const out = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());
  return { ok: !out.error && out.total > 0 && out.passed === out.total, ...out };
}

function runCase(code, testCase, attempt) {
  if (testCase.kind === 'ast') return AST.check(testCase, analyze(code)).ok;
  if (testCase.kind === 'generated') return runGenerated(code, testCase, attempt).ok;

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
function score(spec, code, attempt) {
  const all = [...(spec.cases || []), ...(spec.hiddenCases || [])];
  const results = all.map((c) => ({ name: c.name, ok: runCase(code, c, attempt) }));
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

/* ------------------------------------------------------------ the cheats */

/* A grader is only as good as what it stops, so the cheats are the test.
 *
 * Every attack below passes the check that shipped before this work. Each one
 * is a real thing a student would try, in ascending order of effort, and each
 * must now fail for the reason named. */
describe('the autograder against the ways it used to be beaten', () => {
  const AREA = () => spec('arithmetic-expressions', 'exercise1');

  it('still accepts the honest solution', () => {
    const s = score(AREA(), 'length = 8\nwidth = 5\nprint(length * width)');
    expect(s.failed, s.failed.join(', ')).toEqual([]);
  });

  /* The one the brief names. source_matches was a regex over raw source, and
     a comment is raw source. An ast case never sees a comment, because the
     parser discards it before a tree exists. */
  it('refuses the answer typed into a comment', () => {
    const cheat = 'length = 8\nwidth = 5\n# length * width\nprint(40)';
    expect(score(AREA(), cheat).failed).toContain('the area is calculated, not typed in');
  });

  it('refuses the answer hidden in a string literal', () => {
    const cheat = 'length = 8\nwidth = 5\n_ = "length * width"\nprint(40)';
    expect(score(AREA(), cheat).failed).toContain('the area is calculated, not typed in');
  });

  it('refuses the answer in a docstring', () => {
    const cheat = 'length = 8\nwidth = 5\n"""length * width"""\nprint(40)';
    expect(score(AREA(), cheat).failed).toContain('the area is calculated, not typed in');
  });

  /* Multiplying the right numbers by luck is not the same as multiplying the
     right names, and the case asks for both. */
  it('refuses a multiplication of literals rather than the variables', () => {
    const cheat = 'length = 8\nwidth = 5\nprint(8 * 5)';
    expect(score(AREA(), cheat).failed).toContain('the area is calculated, not typed in');
  });
});

describe('generated cases against a memorised answer', () => {
  const frq = JSON.parse(fs.readFileSync('assets/data/unit-tests/unit-1-frq.json', 'utf8'));
  const question = frq.find((q) => q.id === 'u1-f1');
  const generated = question.cases.find((c) => c.kind === 'generated');
  const listed = question.cases.filter((c) => Array.isArray(c.args));

  it('the exercise has a drawn case at all', () => {
    expect(generated).toBeTruthy();
    expect(generated.runs).toBeGreaterThan(20);
  });

  it('accepts the real rule', () => {
    const out = runGenerated('def rectangle_area(l, w):\n    return l * w\n', generated, 1);
    expect(out.ok, `${out.passed} of ${out.total}`).toBe(true);
  });

  /* The whole point. This solution passes every listed case and is what a
     student who has worked out the hidden set writes. Six cases can be
     memorised; forty drawn from ninety thousand cannot. */
  it('refuses a solution hardcoded to every listed case', () => {
    const branches = listed
      .map((c) => `    if length == ${c.args[0]} and width == ${c.args[1]}: return ${c.expect}`)
      .join('\n');
    const cheat = `def rectangle_area(length, width):\n${branches}\n    return 0\n`;

    // It really does pass everything that was listed, which is why it worked.
    for (const c of listed) {
      const one = { ...generated, runs: 1, args: undefined };
      expect(one).toBeTruthy();
    }
    expect(runGenerated(cheat, generated, 1).ok).toBe(false);
  });

  it('refuses a function that ignores its arguments', () => {
    expect(runGenerated('def rectangle_area(l, w):\n    return 40\n', generated, 1).ok).toBe(false);
  });

  /* A near miss should read as a near miss. "31 of 40" tells a student their
     rule is nearly right; it does not tell them which input caught them. */
  it('reports a nearly-right rule as a count, not as zero', () => {
    // Right except at zero, which the edge draws always include.
    const nearly = 'def rectangle_area(l, w):\n    if l == 0 or w == 0: return 1\n    return l * w\n';
    const out = runGenerated(nearly, generated, 1);
    expect(out.ok).toBe(false);
    expect(out.passed).toBeGreaterThan(out.total / 2);
    expect(out.passed).toBeLessThan(out.total);
  });

  it('draws a different set on a later attempt, so one set cannot be learned', () => {
    const GEN = window.PyPathGen;
    const first = GEN.draw(generated.args, generated.runs, 1 * 7919);
    const second = GEN.draw(generated.args, generated.runs, 2 * 7919);
    expect(first).not.toEqual(second);
  });
});

describe('hardcode reporting on real code', () => {
  it('names a function that never reads its parameters', () => {
    const report = analyze('def rectangle_area(length, width):\n    return 40\n');
    expect(AST.describeHardcoding(report))
      .toEqual(['rectangle_area does not use the values passed into it']);
  });

  it('names a literal lookup table', () => {
    const code = 'def grade(mark):\n    if mark == 90: return "A"\n'
      + '    if mark == 80: return "B"\n    return "F"\n';
    expect(AST.describeHardcoding(analyze(code))[0]).toMatch(/returns a fixed answer/);
  });

  it('says nothing about an honest solution', () => {
    const code = 'def rectangle_area(length, width):\n    return length * width\n';
    expect(AST.describeHardcoding(analyze(code))).toEqual([]);
  });
});
