/* PyPath — running authored check files against real CPython, from a test.
 *
 * tests/checks-unit-1.test.js grew this in place, and one unit could carry it.
 * Eight more cannot: every per-unit copy is another chance for the harness to
 * be extracted slightly differently, and a check that passes in one unit's file
 * and not in another's is a bug in the test, not in the lesson.
 *
 * So the runner lives here once. It speaks every case kind checker.js speaks,
 * through the same harness source the browser runs -- extracted from
 * checker.js rather than restated, because a second copy of the harness is a
 * second thing to keep true.
 *
 * Not named *.test.js on purpose: vitest collects tests/**\/*.test.js, and this
 * file has no tests in it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = process.cwd();

/* Whether real Python is on this machine. Every unit's suite skips its
   run-for-real half without it rather than failing, the way Unit 1 does. */
export const havePython =
  spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8' }).status === 0;

let state = null;

/* Loads the browser globals into jsdom and writes the Python halves to disk.
   Call once from beforeAll. Idempotent, so two suites in one process share it. */
export function setup() {
  if (state) return state;

  for (const dep of ['question-types', 'checker-gen', 'checker-ast', 'checker']) {
    new Function(fs.readFileSync(path.join(ROOT, `assets/js/${dep}.js`), 'utf8')).call(window);
  }

  const C = window.PyPathChecker;
  const AST = window.PyPathAst;
  const GEN = window.PyPathGen;

  const analyzerPath = path.join('node_modules', '.pypath-analyzer-shared.py');
  fs.writeFileSync(analyzerPath, AST.ANALYZER, 'utf8');

  /* The harness, read out of checker.js rather than copied. The array is a list
     of Python lines built in JavaScript, so it is evaluated the way checker.js
     evaluates it, with the one variable it closes over supplied. */
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/checker.js'), 'utf8');
  const marker = src.match(/var TIMEOUT_MARKER = '([^']+)'/)[1];
  const body = src.match(/var HARNESS = \[([\s\S]*?)\]\.join\('\\n'\);/)[1];
  // eslint-disable-next-line no-eval
  const lines = eval(`(function(){var TIMEOUT_MARKER=${JSON.stringify(marker)};return [${body}];})()`);
  const harnessPath = path.join('node_modules', '.pypath-harness-shared.py');
  fs.writeFileSync(harnessPath, lines.join('\n'), 'utf8');

  state = { C, AST, GEN, analyzerPath, harnessPath };
  return state;
}

/* One interpreter run, retried once.
 *
 * Eight unit suites run in parallel and each case is its own `python3`, so a
 * full run spawns thousands of processes in a few minutes. Occasionally the OS
 * refuses one, execFileSync throws, and a check that is perfectly good reports
 * as a failure -- worse, as a *flaky* failure, which teaches whoever sees it to
 * re-run rather than to read.
 *
 * A refused spawn is not a verdict about the student's code, so it is retried
 * rather than counted. A second refusal is left to throw: that is a machine
 * problem and it should be loud. Only spawn failures are retried; Python
 * running and printing something unparseable is a real bug and must not be
 * papered over. */
function python(script) {
  for (let attempt = 0; ; attempt++) {
    let raw;
    try {
      raw = execFileSync('python3', ['-c', script], { encoding: 'utf8' });
    } catch (e) {
      // status === null means the process never ran; a non-null status is
      // Python itself exiting badly, which is real and must surface.
      if (attempt >= 1 || e.status !== null) throw e;
      continue;
    }
    return JSON.parse(raw.trim());
  }
}

/* The structural report, from real CPython's own ast module — the same source
   the browser runs, so a case that passes here passes there. */
export function analyze(code) {
  const { analyzerPath } = setup();
  return python([
    `exec(open(${JSON.stringify(analyzerPath)}).read(), globals())`,
    `print(_pypath_analyze(${JSON.stringify(code)}))`,
  ].join('\n'));
}

function runHarness(code, testCase, kind, files) {
  const { harnessPath } = setup();
  const call = (kind === 'value' || kind === 'raises') ? (testCase.call || '') : '';
  return python([
    `exec(open(${JSON.stringify(harnessPath)}).read(), globals())`,
    `print(_pypath_run_case(${JSON.stringify(code)}, ${JSON.stringify(testCase.stdin || '')}, `
      + `${JSON.stringify(call)}, 5, ${JSON.stringify(files ? JSON.stringify(files) : '')}))`,
  ].join('\n'));
}

/* One drawn case set, reference against student, through the same generator the
   browser uses. Returned in full rather than as a boolean so a near miss can be
   asserted as a near miss. */
export function runGenerated(code, testCase, attempt) {
  const { GEN } = setup();
  const rows = GEN.draw(testCase.args || [], testCase.runs || 20, (attempt || 1) * 7919);
  const calls = rows.map((row) => GEN.callFor(testCase.entry, row)).filter(Boolean);
  /* The student's code is exec'd here, and a lesson about print debugging
     produces code that prints. Its output would land on the same stdout this
     function parses its JSON off, so stdout is swapped for a sink across the
     whole run and restored only for the final line.

     The browser does not need this: runPython hands the result back as a
     return value, and Pyodide's stdout goes to the console where it is
     harmless. Only the test harness reads an answer out of stdout. */
  const out = python([
    'import json, io, sys',
    '_real_stdout = sys.stdout',
    '_sink = io.StringIO()',
    'sys.stdout = _sink',
    '_ref_ns = {}',
    '_err = None',
    'try:',
    `    exec(${JSON.stringify(testCase.reference)}, _ref_ns)`,
    'except BaseException as e:',
    '    _err = "ReferenceError"',
    '_ns = {}',
    'if _err is None:',
    '    try:',
    `        exec(${JSON.stringify(code)}, _ns)`,
    '    except BaseException as e:',
    '        _err = type(e).__name__',
    '_passed = 0',
    '_total = 0',
    `for _one in json.loads(${JSON.stringify(JSON.stringify(calls))}):`,
    '    if _err: break',
    '    _total += 1',
    '    try:',
    '        _want = eval(_one, _ref_ns)',
    '    except BaseException:',
    '        _total -= 1',
    '        continue',
    '    try:',
    '        _got = eval(_one, _ns)',
    '    except BaseException:',
    '        continue',
    '    if repr(_got) == repr(_want): _passed += 1',
    'sys.stdout = _real_stdout',
    'print(json.dumps({"passed": _passed, "total": _total, "error": _err}))',
  ].join('\n'));
  return { ok: !out.error && out.total > 0 && out.passed === out.total, ...out };
}

/* A student's test suite against a working implementation and every broken one.
   Green against the reference and red against all of them is the pass. */
export function runMutation(code, testCase) {
  const { harnessPath } = setup();
  const out = python([
    `exec(open(${JSON.stringify(harnessPath)}).read(), globals())`,
    `print(_pypath_run_mutation(${JSON.stringify(code)}, ${JSON.stringify(testCase.reference)}, `
      + `${JSON.stringify(JSON.stringify(testCase.mutants || []))}, 5))`,
  ].join('\n'));
  return { ok: out.green === true && out.total > 0 && out.caught === out.total, ...out };
}

/* Marks one case exactly as runOneCase in checker.js does. `files` is the
   exercise's fixtures; a case may carry its own. */
export function runCase(code, testCase, attempt, files) {
  const { C, AST } = setup();
  const kind = C.kindOf(testCase);

  if (kind === 'ast') return AST.check(testCase, analyze(code)).ok;
  if (kind === 'generated') return runGenerated(code, testCase, attempt).ok;
  if (kind === 'mutation') return runMutation(code, testCase).ok;

  const out = runHarness(code, testCase, kind, testCase.files || files || null);

  if (kind === 'raises') {
    return !out.timeout && out.error === String(testCase.expect || '');
  }
  if (kind === 'file') {
    return !out.error && C.checkFile(testCase, out.files).ok;
  }
  if (kind === 'property') {
    return !out.error && C.checkProperty(testCase, out.stdout, code).ok;
  }
  if (kind === 'value') {
    return !out.error && C.compareValue(out.value == null ? '' : out.value, testCase.expect);
  }
  return !out.error && C.compareOutput(out.stdout, testCase.expect_stdout);
}

/* Runs every visible and hidden case for one exercise and returns the tally. */
export function score(spec, code, attempt) {
  const all = [...(spec.cases || []), ...(spec.hiddenCases || [])];
  const results = all.map((c) => ({
    name: c.name,
    ok: runCase(code, c, attempt, spec.files || null),
  }));
  return {
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    failed: results.filter((r) => !r.ok).map((r) => r.name),
  };
}

/* One exercise out of one unit's check file. */
export function specFor(unit, slug, exerciseId) {
  const file = path.join(ROOT, `assets/data/checks/unit-${unit}/${slug}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'))[exerciseId];
}

/* The ids a lesson page actually has an editor for. A check file naming
   anything else is dead: no button appears and nothing fails. */
export function editorsFor(unit, slug) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets/data/curriculum.json'), 'utf8')
  );
  const lesson = manifest.lessons.find((l) => l.unit === unit && l.slug === slug);
  if (!lesson) return [];
  return [...new Set([...(lesson.exercises || []), ...(lesson.editors || [])])];
}

/* Only the problems in one unit's files. validateChecks reads every unit, and a
   suite must not go red because another unit is mid-edit. */
export function errorsForUnit(allErrors, unit) {
  return allErrors.filter((e) => e.includes(`checks/unit-${unit}/`));
}
