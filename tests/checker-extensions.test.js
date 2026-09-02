import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

/* The case kinds Units 3 to 10 needed and Units 1 and 2 never did.
 *
 * Unit 1 asks for a value printed, so stdout was enough. Unit 6 asks whether a
 * class inherits from another, Unit 7 asks whether the wrong input raises and
 * whether the file was written, and Unit 8 asks whether a student's own tests
 * are any good. None of those is a string comparison, and each one here is
 * tested the way the check files will be: against real CPython, with a correct
 * answer that must pass and a wrong one that must not.
 */

let C;
let AST;
let GEN;
let harnessPath;
let analyzerPath;

const python = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8' });
const havePython = python.status === 0;

beforeAll(() => {
  for (const dep of ['question-types', 'checker-gen', 'checker-ast', 'checker']) {
    new Function(fs.readFileSync(`assets/js/${dep}.js`, 'utf8')).call(window);
  }
  C = window.PyPathChecker;
  AST = window.PyPathAst;
  GEN = window.PyPathGen;

  analyzerPath = path.join('node_modules', '.pypath-analyzer-ext.py');
  fs.writeFileSync(analyzerPath, AST.ANALYZER, 'utf8');

  const src = fs.readFileSync('assets/js/checker.js', 'utf8');
  const marker = src.match(/var TIMEOUT_MARKER = '([^']+)'/)[1];
  const body = src.match(/var HARNESS = \[([\s\S]*?)\]\.join\('\\n'\);/)[1];
  // eslint-disable-next-line no-eval
  const lines = eval(`(function(){var TIMEOUT_MARKER=${JSON.stringify(marker)};return [${body}];})()`);
  harnessPath = path.join('node_modules', '.pypath-harness-ext.py');
  fs.writeFileSync(harnessPath, lines.join('\n'), 'utf8');
});

function analyze(code) {
  const script = [
    `exec(open(${JSON.stringify(analyzerPath)}).read(), globals())`,
    `print(_pypath_analyze(${JSON.stringify(code)}))`,
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());
}

/* One case through the real harness, the way runOneCase calls it. */
function runCase(code, testCase) {
  const kind = C.kindOf(testCase);
  const call = (kind === 'value' || kind === 'raises') ? (testCase.call || '') : '';
  const files = testCase.files || null;
  const script = [
    `exec(open(${JSON.stringify(harnessPath)}).read(), globals())`,
    `print(_pypath_run_case(${JSON.stringify(code)}, ${JSON.stringify(testCase.stdin || '')}, `
      + `${JSON.stringify(call)}, 5, ${JSON.stringify(files ? JSON.stringify(files) : '')}))`,
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());
}

function runMutation(code, testCase) {
  const script = [
    `exec(open(${JSON.stringify(harnessPath)}).read(), globals())`,
    `print(_pypath_run_mutation(${JSON.stringify(code)}, ${JSON.stringify(testCase.reference)}, `
      + `${JSON.stringify(JSON.stringify(testCase.mutants))}, 5))`,
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());
}

/* ------------------------------------------------------- drawn dicts and sets */

describe('drawing a dict', () => {
  const spec = { type: 'dict', keys: { type: 'str', maxLength: 3 }, values: { type: 'int' },
    minLength: 1, maxLength: 4 };

  it('never draws the same key twice', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const drawn = GEN.drawOne(spec, GEN.seeded(seed));
      const keys = drawn.entries.map((pair) => pair[0]);
      expect(new Set(keys).size, `seed ${seed}`).toBe(keys.length);
    }
  });

  it('writes as a Python dict literal', () => {
    const drawn = { __pytype: 'dict', entries: [['a', 1], ['b', 2]] };
    expect(GEN.toPython(drawn)).toBe('{"a": 1, "b": 2}');
  });

  it('writes an empty dict, which is the edge that breaks beginner code', () => {
    expect(GEN.toPython({ __pytype: 'dict', entries: [] })).toBe('{}');
    const edges = GEN.draw([{ type: 'dict', minLength: 0 }], 6, 1);
    expect(edges[0][0].entries).toEqual([]);
  });
});

describe('drawing a set', () => {
  it('never draws the same member twice', () => {
    const spec = { type: 'set', of: { type: 'int', min: 0, max: 8 }, minLength: 1, maxLength: 5 };
    for (let seed = 1; seed <= 40; seed++) {
      const drawn = GEN.drawOne(spec, GEN.seeded(seed));
      expect(new Set(drawn.items).size, `seed ${seed}`).toBe(drawn.items.length);
    }
  });

  /* `{}` is an empty dict in Python. A set spec that wrote it would hand the
     student's function the wrong type and fail them for the author's slip. */
  it('writes an empty set as set(), not as {}', () => {
    expect(GEN.toPython({ __pytype: 'set', items: [] })).toBe('set()');
    expect(GEN.toPython({ __pytype: 'set', items: [1, 2] })).toBe('{1, 2}');
  });
});

describe.skipIf(!havePython)('a drawn dict is valid Python', () => {
  it('round-trips through the interpreter', () => {
    const rows = GEN.draw([{ type: 'dict', keys: { type: 'str' }, values: { type: 'int' },
      minLength: 2, maxLength: 4 }], 8, 99);
    for (const row of rows) {
      const literal = GEN.toPython(row[0]);
      const out = execFileSync('python3', ['-c', `print(len(${literal}))`], { encoding: 'utf8' });
      expect(Number(out.trim())).toBe(row[0].entries.length);
    }
  });
});

/* ------------------------------------------------------------- classes (U6) */

describe.skipIf(!havePython)('reading a class off the tree', () => {
  const CODE = [
    'class Animal:',
    '    def __init__(self, name):',
    '        self.name = name',
    '    def speak(self):',
    '        return "..."',
    '',
    'class Dog(Animal):',
    '    def speak(self):',
    '        return "Woof"',
    '',
  ].join('\n');

  it('records the name, the base and the methods', () => {
    const report = analyze(CODE);
    const dog = report.classes.find((c) => c.name === 'Dog');
    expect(dog.bases).toEqual(['Animal']);
    expect(dog.methods).toEqual(['speak']);
  });

  it('accepts an inheritance requirement the honest way', () => {
    const testCase = { kind: 'ast', describe: 'a Dog that extends Animal',
      requires: { classes: [{ name: 'Dog', bases: ['Animal'], methods: ['speak'] }] } };
    expect(AST.check(testCase, analyze(CODE)).ok).toBe(true);
  });

  /* The wrong answer this key exists for. Copying Animal's methods into Dog
     produces the same behaviour and is not inheritance, and no amount of
     running the code can tell the two apart. */
  it('refuses a Dog that copied the methods instead of inheriting', () => {
    const copied = [
      'class Animal:',
      '    def speak(self):',
      '        return "..."',
      '',
      'class Dog:',
      '    def speak(self):',
      '        return "Woof"',
      '',
    ].join('\n');
    const testCase = { kind: 'ast', describe: 'a Dog that extends Animal',
      requires: { classes: [{ name: 'Dog', bases: ['Animal'] }] } };
    expect(AST.check(testCase, analyze(copied)).ok).toBe(false);
  });

  /* A module-level def named speak is not a method on Dog, and an author
     asking for the method means the method. */
  it('does not count a loose function as a method', () => {
    const loose = 'class Dog:\n    pass\n\ndef speak():\n    return "Woof"\n';
    const testCase = { kind: 'ast', describe: 'a Dog with a speak method',
      requires: { classes: [{ name: 'Dog', methods: ['speak'] }] } };
    expect(AST.check(testCase, analyze(loose)).ok).toBe(false);
  });

  it('can forbid a class where the exercise asked for a function', () => {
    const testCase = { kind: 'ast', describe: 'a function, not a class',
      forbids: { classes: true } };
    expect(AST.check(testCase, analyze(CODE)).ok).toBe(false);
    expect(AST.check(testCase, analyze('def speak():\n    return "Woof"\n')).ok).toBe(true);
  });
});

/* ------------------------------------------ raising and handling (U7) */

describe.skipIf(!havePython)('reading exception handling off the tree', () => {
  const CODE = [
    'def read_age(text):',
    '    try:',
    '        value = int(text)',
    '    except ValueError:',
    '        raise ValueError("not a number")',
    '    with open("log.txt", "w") as fh:',
    '        fh.write(str(value))',
    '    return value',
    '',
  ].join('\n');

  it('records what is raised, what is handled and that with was used', () => {
    const report = analyze(CODE);
    expect(report.raises).toContain('ValueError');
    expect(report.handlers).toContain('ValueError');
    expect(report.withs).toBe(1);
  });

  it('records both types of a tuple except', () => {
    const report = analyze('try:\n    pass\nexcept (ValueError, TypeError):\n    pass\n');
    expect(report.handlers.sort()).toEqual(['TypeError', 'ValueError']);
  });

  it('records a bare except as bare, so a lesson can ask against it', () => {
    const report = analyze('try:\n    pass\nexcept:\n    pass\n');
    expect(report.handlers).toEqual(['bare']);
    const testCase = { kind: 'ast', describe: 'catch the specific error, not everything',
      forbids: { handlers: ['bare'] } };
    expect(AST.check(testCase, report).ok).toBe(false);
  });

  /* The Unit 7 version of the comment cheat: closing the file by hand looks
     right until the code raises halfway through. */
  it('can require the with statement rather than a manual close', () => {
    const testCase = { kind: 'ast', describe: 'open the file with a with statement',
      requires: { withs: 1 } };
    expect(AST.check(testCase, analyze(CODE)).ok).toBe(true);
    const manual = 'fh = open("log.txt", "w")\nfh.write("x")\nfh.close()\n';
    expect(AST.check(testCase, analyze(manual)).ok).toBe(false);
  });
});

/* ------------------------------------------------------- the raises kind (U7) */

describe.skipIf(!havePython)('a raises case', () => {
  const CODE = [
    'def set_age(value):',
    '    if value < 0:',
    '        raise ValueError("age cannot be negative")',
    '    return value',
    '',
  ].join('\n');

  const CASE = { kind: 'raises', name: 'rejects a negative age',
    call: 'set_age(-1)', expect: 'ValueError' };

  it('is a kind an author has to declare, never one inferred from shape', () => {
    // Same shape as a value case. Only the declared kind separates them.
    expect(C.kindOf({ call: 'set_age(-1)', expect: 'ValueError' })).toBe('value');
    expect(C.kindOf(CASE)).toBe('raises');
  });

  it('passes when the named exception is raised', () => {
    const out = runCase(CODE, CASE);
    expect(out.error).toBe('ValueError');
  });

  it('fails when nothing is raised at all', () => {
    const lenient = 'def set_age(value):\n    return value\n';
    const out = runCase(lenient, CASE);
    expect(out.error).toBe(null);
  });

  /* Raising *something* is not the same as raising the right thing, and a
     lesson that teaches ValueError should not accept a bare assert. */
  it('fails when the wrong exception is raised', () => {
    const wrong = 'def set_age(value):\n    assert value >= 0\n    return value\n';
    const out = runCase(wrong, CASE);
    expect(out.error).toBe('AssertionError');
    expect(out.error).not.toBe('ValueError');
  });
});

/* --------------------------------------------------------- file cases (U7) */

describe.skipIf(!havePython)('an exercise with starting files', () => {
  const FILES = { 'scores.txt': '80\n95\n72\n' };

  it('gives the code the file the author listed', () => {
    const code = 'with open("scores.txt") as fh:\n    print(len(fh.read().split()))\n';
    const out = runCase(code, { name: 'reads it', files: FILES, expect_stdout: '3' });
    expect(out.stdout.trim()).toBe('3');
    expect(out.error).toBe(null);
  });

  it('reads back what the code wrote', () => {
    const code = 'with open("report.txt", "w") as fh:\n    fh.write("average: 82.33")\n';
    const out = runCase(code, { name: 'writes it', files: FILES });
    expect(out.files['report.txt']).toBe('average: 82.33');
    expect(C.checkFile({ kind: 'file', path: 'report.txt', expect_matches: 'average' },
      out.files).ok).toBe(true);
  });

  /* Each case gets its own directory for the same reason each gets its own
     namespace: one case must not be why the next one passes. */
  it('does not carry a written file into the next case', () => {
    const writes = 'open("left-behind.txt", "w").write("x")\n';
    runCase(writes, { name: 'first', files: FILES });
    const out = runCase('import os\nprint(os.path.exists("left-behind.txt"))\n',
      { name: 'second', files: FILES });
    expect(out.stdout.trim()).toBe('False');
  });

  it('refuses a fixture that climbs out of the exercise directory', () => {
    const out = runCase('import os\nprint(sorted(os.listdir(".")))\n',
      { name: 'escape', files: { '../escaped.txt': 'nope' } });
    expect(out.stdout).not.toContain('escaped.txt');
  });

  it('reports a missing file by naming what was written instead', () => {
    const verdict = C.checkFile({ kind: 'file', path: 'report.txt', expect_matches: 'average' },
      { 'notes.txt': 'x' });
    expect(verdict.ok).toBe(false);
    expect(verdict.actual).toContain('notes.txt');
  });

  it('can ask that a temporary file was cleaned up', () => {
    const gone = { kind: 'file', path: 'tmp.txt', exists: false };
    expect(C.checkFile(gone, { 'out.txt': 'x' }).ok).toBe(true);
    expect(C.checkFile(gone, { 'tmp.txt': 'x' }).ok).toBe(false);
  });
});

/* ----------------------------------------------------- the mutation kind (U8) */

describe.skipIf(!havePython)('grading a student\'s own tests', () => {
  const CASE = {
    kind: 'mutation',
    name: 'your tests catch the bugs',
    reference: 'def average(xs):\n    return sum(xs) / len(xs)\n',
    mutants: [
      'def average(xs):\n    return sum(xs)\n',
      'def average(xs):\n    return sum(xs) / (len(xs) - 1)\n',
      'def average(xs):\n    return max(xs)\n',
    ],
  };

  it('accepts a suite that passes the real one and catches every broken one', () => {
    const tests = [
      'def test_two_numbers():',
      '    assert average([2, 4]) == 3',
      'def test_one_number():',
      '    assert average([5]) == 5',
      'def test_three_numbers():',
      '    assert average([1, 2, 6]) == 3',
      '',
    ].join('\n');
    const out = runMutation(tests, CASE);
    expect(out.green).toBe(true);
    expect(out.caught).toBe(out.total);
  });

  it('accepts bare asserts as well as test functions', () => {
    const tests = 'assert average([2, 4]) == 3\nassert average([5]) == 5\n';
    const out = runMutation(tests, CASE);
    expect(out.green).toBe(true);
    expect(out.caught).toBe(out.total);
  });

  /* The whole reason this kind exists. A suite that asserts nothing about the
     code passes every version of it, and stdout grading cannot tell. */
  it('refuses a suite that asserts nothing', () => {
    const out = runMutation('def test_nothing():\n    assert True\n', CASE);
    expect(out.green).toBe(true);
    expect(out.caught).toBe(0);
  });

  it('refuses a suite that misses one of the bugs, and says how many', () => {
    // Passes [2,4] under both the real rule and max(), so max() survives.
    const weak = 'def test_average():\n    assert average([4, 4]) == 4\n';
    const out = runMutation(weak, CASE);
    expect(out.green).toBe(true);
    expect(out.caught).toBeGreaterThan(0);
    expect(out.caught).toBeLessThan(out.total);
  });

  /* Told apart from the above on purpose: "your tests fail the working
     version" and "your tests miss a bug" send a student to different places. */
  it('reports a suite that fails the correct version as not green', () => {
    const broken = 'def test_wrong():\n    assert average([2, 4]) == 4\n';
    const out = runMutation(broken, CASE);
    expect(out.green).toBe(false);
    expect(out.greenError).toBe('AssertionError');
  });
});
