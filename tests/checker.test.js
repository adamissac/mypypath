import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

let C;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/checker.js', 'utf8')).call(window);
  C = window.PyPathChecker;
});

describe('output normalization', () => {
  it('ignores a missing or extra trailing newline', () => {
    expect(C.compareOutput('Hello!\n', 'Hello!')).toBe(true);
    expect(C.compareOutput('Hello!', 'Hello!\n')).toBe(true);
    expect(C.compareOutput('Hello!\n\n\n', 'Hello!')).toBe(true);
  });

  it('ignores line endings', () => {
    expect(C.compareOutput('a\r\nb', 'a\nb')).toBe(true);
    expect(C.compareOutput('a\rb', 'a\nb')).toBe(true);
  });

  it('ignores trailing spaces on a line', () => {
    expect(C.compareOutput('a   \nb\t\n', 'a\nb')).toBe(true);
  });

  it('does not ignore interior spacing, which really is wrong', () => {
    expect(C.compareOutput('Hello,  world', 'Hello, world')).toBe(false);
  });

  it('does not ignore case or content', () => {
    expect(C.compareOutput('hello', 'Hello')).toBe(false);
    expect(C.compareOutput('Hello', 'Hello!')).toBe(false);
  });

  it('treats leading whitespace as significant', () => {
    expect(C.compareOutput('  indented', 'indented')).toBe(false);
  });
});

describe('expression comparison', () => {
  it('accepts the same string written with either quote', () => {
    expect(C.compareValue("'hello'", '"hello"')).toBe(true);
    expect(C.compareValue('"hello"', "'hello'")).toBe(true);
  });

  it('still distinguishes different strings', () => {
    expect(C.compareValue("'hello'", "'goodbye'")).toBe(false);
  });

  it('compares numbers and containers by repr', () => {
    expect(C.compareValue('42', '42')).toBe(true);
    expect(C.compareValue('[1, 2]', '[1, 2]')).toBe(true);
    expect(C.compareValue('42', '42.0')).toBe(false);
  });

  it('tolerates surrounding whitespace in the authored expectation', () => {
    expect(C.compareValue('42', '  42  ')).toBe(true);
  });
});

describe('case kinds', () => {
  it('recognizes an expression case by its call field', () => {
    expect(C.isExpressionCase({ call: "greet('')", expect: "''" })).toBe(true);
    expect(C.isExpressionCase({ expect_stdout: 'hi' })).toBe(false);
    expect(C.isExpressionCase({ call: '' })).toBe(false);
  });
});

describe('summarizing a run', () => {
  const pass = (name) => ({ name, ok: true });
  const fail = (name) => ({ name, ok: false, expected: 'x', actual: 'y' });

  it('counts visible and hidden cases together', () => {
    const s = C.summarize([pass('a'), pass('b')], [pass('h1')], {}, 1);
    expect(s.passed).toBe(3);
    expect(s.total).toBe(3);
    expect(s.allPassed).toBe(true);
  });

  it('never names a hidden case in the failures it reports', () => {
    const s = C.summarize([pass('visible')], [fail('secret edge case')], {}, 1);
    expect(s.failures).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/secret edge case/);
  });

  it('still tells the student how many hidden cases they passed', () => {
    const s = C.summarize([pass('v')], [pass('h1'), fail('h2')], {}, 1);
    expect(s.hiddenTotal).toBe(2);
    expect(s.hiddenPassed).toBe(1);
    expect(s.allPassed).toBe(false);
  });

  it('reports a visible failure with what was expected and what came back', () => {
    const s = C.summarize([fail('prints greeting')], [], {}, 1);
    expect(s.failures).toEqual([
      { name: 'prints greeting', expected: 'x', actual: 'y' },
    ]);
  });

  it('withholds the hint until the second attempt', () => {
    const spec = { hint: 'Check your indentation.' };
    expect(C.summarize([fail('a')], [], spec, 1).hint).toBe('');
    expect(C.summarize([fail('a')], [], spec, 2).hint).toBe('Check your indentation.');
  });

  it('does not call an empty run a pass', () => {
    expect(C.summarize([], [], {}, 1).allPassed).toBe(false);
  });

  it('surfaces a timeout and the first exception class seen', () => {
    const s = C.summarize(
      [{ name: 'a', ok: false, timeout: true, errorType: 'TimeoutError' }], [], {}, 1
    );
    expect(s.timedOut).toBe(true);
    expect(s.errorType).toBe('TimeoutError');
  });
});

/* The Python harness is the half that cannot be reasoned about from the
   JavaScript side, so it is executed for real. Pyodide is CPython 3.11 and the
   harness uses nothing version-specific, so the local interpreter is a fair
   stand-in for what the browser will do. */
const python = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8' });
const havePython = python.status === 0;

describe.skipIf(!havePython)('the Python harness, run against real Python', () => {
  let harnessPath;

  beforeAll(() => {
    const src = fs.readFileSync('assets/js/checker.js', 'utf8');
    const marker = src.match(/var TIMEOUT_MARKER = '([^']+)'/)[1];
    const body = src.match(/var HARNESS = \[([\s\S]*?)\]\.join\('\\n'\);/)[1];
    // eslint-disable-next-line no-eval
    const lines = eval(`(function(){var TIMEOUT_MARKER=${JSON.stringify(marker)};return [${body}];})()`);
    harnessPath = 'node_modules/.cache-pypath-harness.py';
    fs.mkdirSync('node_modules', { recursive: true });
    fs.writeFileSync(harnessPath, lines.join('\n'), 'utf8');
  });

  function runCase(code, stdin, call, limit) {
    const script = [
      'import json,sys',
      `exec(open(${JSON.stringify(harnessPath)}).read(), globals())`,
      `print(_pypath_run_case(${JSON.stringify(code)}, ${JSON.stringify(stdin || '')}, ` +
        `${JSON.stringify(call || '')}, ${limit || 5}))`,
    ].join('\n');
    return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());
  }

  it('captures what the student printed', () => {
    expect(runCase('print("Hello, world!")').stdout).toBe('Hello, world!\n');
  });

  it('evaluates a call against what the student defined', () => {
    const r = runCase('def greet(n):\n    return "Hi " + n', '', 'greet("Bo")');
    expect(r.value).toBe("'Hi Bo'");
    expect(r.error).toBe(null);
  });

  it('feeds stdin to input() and echoes the prompt, as a terminal would', () => {
    expect(runCase('n = input("Name? ")\nprint(n)', 'Ada').stdout).toBe('Name? Ada\n');
  });

  it('reports a missing input as EOFError rather than hanging', () => {
    expect(runCase('input()', '').error).toBe('EOFError');
  });

  it('reports only the exception class, never the message or the source', () => {
    const r = runCase('my_secret_value = 10\nx = my_secret_value / 0');
    expect(r.error).toBe('ZeroDivisionError');
    expect(JSON.stringify(r)).not.toMatch(/my_secret_value|division by zero/);
  });

  it('reports a syntax mistake by class', () => {
    expect(runCase('def f():\nreturn 1').error).toBe('IndentationError');
  });

  it('gives each case a namespace of its own', () => {
    // One case defining a name must not be why the next one passes.
    expect(runCase('secret = 42', '', 'secret').value).toBe('42');
    expect(runCase('pass', '', 'secret').error).toBe('NameError');
  });

  it('stops an infinite loop instead of hanging the tab', () => {
    const started = Date.now();
    const r = runCase('while True:\n    pass', '', '', 2);
    expect(r.timeout).toBe(true);
    expect(r.error).toBe('TimeoutError');
    expect(Date.now() - started).toBeLessThan(15000);
  });

  it('puts stdout back afterwards, so the page keeps working', () => {
    const script = [
      `exec(open(${JSON.stringify(harnessPath)}).read(), globals())`,
      '_pypath_run_case(\'print("inside")\', "", "", 5)',
      'print("outside")',
    ].join('\n');
    const out = execFileSync('python3', ['-c', script], { encoding: 'utf8' });
    expect(out.trim()).toBe('outside');
  });
}, 30000);
