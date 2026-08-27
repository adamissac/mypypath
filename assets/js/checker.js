/* PyPath — runs a student's code against authored test cases.
 *
 * This is what turns "started" into "actually works". Everything else the
 * dashboard shows is a count of activity; this is the only signal that says
 * the code does what it was supposed to do.
 *
 * Runs in the page's existing Pyodide instance -- there is exactly one
 * interpreter and loading a second would double a cold start that already
 * costs several seconds.
 *
 * The pure parts (normalizing, comparing, summarizing) are on the same global
 * and take no I/O, so they can be tested without a runtime.
 */
(function () {
  'use strict';

  /* Wall-clock budget for one case. Generous, because the first case in a
     lesson may be waiting on a cold interpreter, and stingy enough that a
     runaway loop gives the tab back inside a few seconds. */
  var CASE_TIMEOUT_SEC = 5;

  var TIMEOUT_MARKER = '__pypath_timeout__';

  /* The harness, installed once per Pyodide instance.
   *
   * Every case runs in a namespace of its own: one case defining a name mus
   * not be why the next one passes, and a student's code must not see the
   * harness's own variables.
   *
   * The timeout is enforced with sys.settrace rather than a worker or an
   * interrupt buffer. Pyodide runs on the main thread, and interrupting i
   * properly needs SharedArrayBuffer, which needs cross-origin isolation
   * headers this site does not send. Tracing costs speed -- irrelevant for
   * exercises this size -- and catches what actually strands a tab, which is a
   * `while True:` in the student's own Python. A loop spinning inside a C
   * builtin is not traced and is documented as such rather than pretended
   * about.
   */
  var HARNESS = [
    'import sys, io, json, time, builtins',
    '',
    'def _pypath_run_case(code, stdin_text, call_expr, limit):',
    '    ns = {"__name__": "__main__"}',
    '    out = io.StringIO()',
    '    lines = list(stdin_text.split("\\n")) if stdin_text else []',
    '    pos = [0]',
    '',
    '    def fake_input(prompt=""):',
    '        if prompt:',
    '            out.write(str(prompt))',
    '        if pos[0] >= len(lines):',
    '            raise EOFError("no more input")',
    '        pos[0] += 1',
    '        return lines[pos[0] - 1]',
    '',
    '    ns["input"] = fake_input',
    '    real_stdout, real_input = sys.stdout, builtins.input',
    '    deadline = time.monotonic() + float(limit)',
    '',
    '    def guard(frame, event, arg):',
    '        if time.monotonic() > deadline:',
    '            raise TimeoutError("' + TIMEOUT_MARKER + '")',
    '        return guard',
    '',
    '    result = {"stdout": "", "value": None, "error": None, "timeout": False}',
    '    try:',
    '        sys.stdout = out',
    '        builtins.input = fake_input',
    '        sys.settrace(guard)',
    '        exec(code, ns)',
    '        if call_expr:',
    '            result["value"] = repr(eval(call_expr, ns))',
    '    except TimeoutError as e:',
    '        if "' + TIMEOUT_MARKER + '" in str(e):',
    '            result["timeout"] = True',
    '        result["error"] = "TimeoutError"',
    '    except BaseException as e:',
    '        # Class name only. The message quotes the student\'s own source and',
    '        # has no business leaving this function.',
    '        result["error"] = type(e).__name__',
    '    finally:',
    '        sys.settrace(None)',
    '        sys.stdout = real_stdout',
    '        builtins.input = real_input',
    '    result["stdout"] = out.getvalue()',
    '    return json.dumps(result)',
    ''
  ].join('\n');

  /* ------------------------------------------------------------- pure part */

  /* Trailing whitespace and line endings are not what any of these exercises
     are about, and failing someone for a missing final newline teaches them
     nothing. Interior spacing is left alone: "Hello,  world" really is wrong.  */
  function normalizeOutput(text) {
    return String(text == null ? '' : text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(function (line) { return line.replace(/[ \t]+$/, ''); })
      .join('\n')
      .replace(/\n+$/, '');
  }

  function compareOutput(actual, expected) {
    return normalizeOutput(actual) === normalizeOutput(expected);
  }

  /* Expression cases compare Python reprs, so 'hello' and "hello" -- the same
     string written two ways -- are the same answer. */
  function normalizeValue(text) {
    var s = String(text == null ? '' : text).trim();
    if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
      return '"' + s.slice(1, -1) + '"';
    }
    return s;
  }

  function compareValue(actual, expected) {
    return normalizeValue(actual) === normalizeValue(expected);
  }

  /* Both of these now ask question-types.js, which reads an explicit `kind`
     where an author set one and falls back to exactly the structural inference
     that was written here. Their signatures and their answers are unchanged for
     every case authored so far, which is what lets fifteen check files stay as
     they are. */
  function kindOf(testCase) {
    var Q = window.PyPathQuestions;
    if (Q) return Q.kindOfCase(testCase);
    // Degraded mode for a page where question-types.js did not load.
    var c = testCase || {};
    if (PROPERTY_KEYS.some(function (k) {
      return Object.prototype.hasOwnProperty.call(c, k);
    })) return 'property';
    if (typeof c.call === 'string' && c.call.length > 0) return 'value';
    return 'stdout';
  }

  function isExpressionCase(testCase) {
    return kindOf(testCase) === 'value';
  }

  /* A third kind of case, and the reason for it is worth stating.

     Much of Unit 1 asks for something personal: "print your own message",
     "print three things about yourself". There is no single correct stdout to
     compare against, and inventing one would mean marking a correct answer
     wrong for not being the answer we happened to imagine. A property case
     checks the shape of the result instead -- that three lines were printed,
     that the output is not empty, that a comment was written -- which is
     exactly what the lesson's own success criteria already say.

     Where an exercise does have one right answer, expect_stdout is still used.
     This is not a softer check, it is a check of the thing that was asked. */
  var PROPERTY_KEYS = ['nonempty', 'min_lines', 'max_lines', 'stdout_matches', 'source_matches'];

  function isPropertyCase(testCase) {
    return kindOf(testCase) === 'property';
  }

  function outputLines(text) {
    return normalizeOutput(text)
      .split('\n')
      .filter(function (line) { return line.trim() !== ''; });
  }

  /* Returns { ok, expected, actual } so a property failure reads the same way
     a stdout failure does. */
  function checkProperty(testCase, stdout, source) {
    var lines = outputLines(stdout);

    if (testCase.nonempty === true && lines.length === 0) {
      return { ok: false, expected: 'some output', actual: 'nothing was printed' };
    }
    if (typeof testCase.min_lines === 'number' && lines.length < testCase.min_lines) {
      return {
        ok: false,
        expected: 'at least ' + testCase.min_lines + ' lines of output',
        actual: lines.length + (lines.length === 1 ? ' line' : ' lines')
      };
    }
    if (typeof testCase.max_lines === 'number' && lines.length > testCase.max_lines) {
      return {
        ok: false,
        expected: 'at most ' + testCase.max_lines + ' lines of output',
        actual: lines.length + ' lines'
      };
    }
    if (typeof testCase.stdout_matches === 'string'
        && !new RegExp(testCase.stdout_matches, testCase.flags || 'i').test(normalizeOutput(stdout))) {
      return {
        ok: false,
        expected: testCase.describe || 'output matching the exercise',
        actual: lines.length ? lines.join(' / ') : 'nothing was printed'
      };
    }
    if (typeof testCase.source_matches === 'string'
        && !new RegExp(testCase.source_matches, testCase.flags || 'm').test(String(source || ''))) {
      return {
        ok: false,
        expected: testCase.describe || 'code matching the exercise',
        actual: 'not found in your code'
      };
    }
    return { ok: true, expected: testCase.describe || 'as described', actual: 'matches' };
  }

  /* Builds the result the UI renders.
   *
   * Hidden cases contribute to the counts and never to `failures`. A studen
   * is told how many they passed, never which input caught them out -- the
   * point of a hidden case is that it cannot be special-cased, and naming i
   * hands back exactly what it was withholding.
   */
  function summarize(visible, hidden, spec, attempt) {
    var failures = visible.filter(function (r) { return !r.ok; });
    var hiddenFailed = hidden.filter(function (r) { return !r.ok; }).length;
    var passed = visible.filter(function (r) { return r.ok; }).length +
      (hidden.length - hiddenFailed);

    return {
      passed: passed,
      total: visible.length + hidden.length,
      allPassed: passed === visible.length + hidden.length && passed > 0,
      hiddenTotal: hidden.length,
      hiddenPassed: hidden.length - hiddenFailed,
      failures: failures.map(function (r) {
        return { name: r.name, expected: r.expected, actual: r.actual };
      }),
      timedOut: visible.concat(hidden).some(function (r) { return r.timeout; }),
      errorType: firstErrorType(visible.concat(hidden)),
      // Held back until someone has actually tried twice. Offered sooner it is
      // read before the thinking; offered never it is just a wall.
      hint: attempt >= 2 ? (spec && spec.hint) || '' : ''
    };
  }

  function firstErrorType(results) {
    for (var i = 0; i < results.length; i++) {
      if (results[i].errorType) return results[i].errorType;
    }
    return '';
  }

  /* ---------------------------------------------------------- runtime part */

  // The instance the harness was installed into, not a bare boolean: the
  // comment on HARNESS says "installed once per Pyodide instance", and a flag
  // cannot tell one instance from the next. Today there is only ever one, so
  // this changes nothing; it stops the guard from being wrong if that changes.
  var harnessedIn = null;

  function ensureHarness(pyodide) {
    if (harnessedIn === pyodide) return;
    pyodide.runPython(HARNESS);
    harnessedIn = pyodide;
  }

  function pyLiteral(value) {
    return JSON.stringify(String(value == null ? '' : value));
  }

  function runOneCase(pyodide, code, testCase) {
    var call = isExpressionCase(testCase) ? testCase.call : '';
    var raw = pyodide.runPython(
      '_pypath_run_case(' +
        pyLiteral(code) + ', ' +
        pyLiteral(testCase.stdin || '') + ', ' +
        pyLiteral(call) + ', ' +
        CASE_TIMEOUT_SEC +
      ')'
    );
    var out = JSON.parse(raw);

    var ok;
    var expected;
    var actual;
    if (isPropertyCase(testCase)) {
      if (out.error) {
        ok = false;
        expected = testCase.describe || 'your code to run';
        actual = '(' + out.error + ')';
      } else {
        var verdict = checkProperty(testCase, out.stdout, code);
        ok = verdict.ok;
        expected = verdict.expected;
        actual = verdict.actual;
      }
    } else if (call) {
      expected = String(testCase.expect == null ? '' : testCase.expect);
      actual = out.value == null ? '' : out.value;
      ok = !out.error && compareValue(actual, expected);
    } else {
      expected = String(testCase.expect_stdout == null ? '' : testCase.expect_stdout);
      actual = out.stdout;
      ok = !out.error && compareOutput(actual, expected);
    }

    return {
      name: String(testCase.name || 'case'),
      ok: ok,
      expected: expected,
      actual: out.error ? '(' + out.error + ')' : actual,
      timeout: out.timeout === true,
      errorType: out.error || ''
    };
  }

  /* Runs every case and returns the summary. Rejects only if Pyodide itself
     could not be reached; a student's code failing is a result, not an error. */
  async function run(code, spec, attempt) {
    if (!window.Pyodide) throw new Error('Python is not loaded on this page.');
    var pyodide = await window.Pyodide.ensureReady();
    ensureHarness(pyodide);

    var visible = (spec && spec.cases) || [];
    var hidden = (spec && spec.hiddenCases) || [];

    var visibleResults = visible.map(function (c) {
      return runOneCase(pyodide, code, c);
    });
    // Hidden cases are skipped once a visible one has already failed: they can
    // only repeat news the student has, and each one costs a run of code tha
    // may be the runaway loop we just timed out on.
    var hiddenResults = visibleResults.every(function (r) { return r.ok; })
      ? hidden.map(function (c) { return runOneCase(pyodide, code, c); })
      : hidden.map(function (c) {
        return { name: String(c.name || 'hidden'), ok: false, skipped: true,
          expected: '', actual: '', timeout: false, errorType: '' };
      });

    return summarize(visibleResults, hiddenResults, spec, attempt || 1);
  }

  window.PyPathChecker = {
    CASE_TIMEOUT_SEC: CASE_TIMEOUT_SEC,
    normalizeOutput: normalizeOutput,
    compareOutput: compareOutput,
    normalizeValue: normalizeValue,
    compareValue: compareValue,
    kindOf: kindOf,
    isExpressionCase: isExpressionCase,
    isPropertyCase: isPropertyCase,
    checkProperty: checkProperty,
    outputLines: outputLines,
    summarize: summarize,
    run: run
  };
})();
