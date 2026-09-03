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
    'import sys, io, json, time, builtins, os, tempfile, shutil',
    '',
    '# Unit 7 asks students to read and write files, and a file exercise that',
    '# cannot be given a file to read is a prose exercise. Each case runs in a',
    '# directory of its own, seeded with whatever the author listed, for the same',
    '# reason each case gets its own namespace: one case must not be why the next',
    '# one passes. The directory goes away afterwards either way -- a student who',
    '# writes a hundred megabytes into it should not still be paying for that on',
    '# the next attempt.',
    'def _pypath_files_in(where):',
    '    found = {}',
    '    for root, _dirs, names in os.walk(where):',
    '        for name in names:',
    '            full = os.path.join(root, name)',
    '            rel = os.path.relpath(full, where).replace(os.sep, "/")',
    '            try:',
    '                with open(full, "r", encoding="utf-8") as fh:',
    '                    found[rel] = fh.read()',
    '            except (UnicodeDecodeError, OSError):',
    '                # A binary or unreadable file is still a file that exists,',
    '                # and a case asking whether it was created should see it.',
    '                found[rel] = None',
    '    return found',
    '',
    'def _pypath_run_case(code, stdin_text, call_expr, limit, files_json=""):',
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
    '    result = {"stdout": "", "value": None, "error": None, "timeout": False,',
    '              "files": {}}',
    '    fixtures = json.loads(files_json) if files_json else {}',
    '    workdir = tempfile.mkdtemp(prefix="pypath_case_")',
    '    here = os.getcwd()',
    '    for name, body in fixtures.items():',
    '        # Author-supplied, but still joined into a path, so a name that',
    '        # climbs out of the working directory is refused rather than',
    '        # written wherever it pointed.',
    '        safe = os.path.normpath(os.path.join(workdir, name))',
    '        if not safe.startswith(os.path.normpath(workdir) + os.sep):',
    '            continue',
    '        os.makedirs(os.path.dirname(safe), exist_ok=True)',
    '        with open(safe, "w", encoding="utf-8") as fh:',
    '            fh.write("" if body is None else str(body))',
    '    try:',
    '        sys.stdout = out',
    '        builtins.input = fake_input',
    '        os.chdir(workdir)',
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
    '        # Read before the chdir back, and cleaned up whatever happened: a',
    '        # case that failed still has to say what was on disk when it did.',
    '        try:',
    '            result["files"] = _pypath_files_in(workdir)',
    '        except OSError:',
    '            result["files"] = {}',
    '        os.chdir(here)',
    '        shutil.rmtree(workdir, ignore_errors=True)',
    '    result["stdout"] = out.getvalue()',
    '    return json.dumps(result)',
    '',
    '# Unit 8 asks students to write tests, and output cannot grade a test. What',
    '# grades a test is whether it can tell a working implementation from a',
    '# broken one, so it is given both: green against the reference, red against',
    '# every mutant. A suite of `assert True` goes green everywhere and fails',
    '# here, which is the entire point.',
    'def _pypath_run_mutation(code, reference, mutants_json, limit):',
    '    mutants = json.loads(mutants_json)',
    '    deadline = time.monotonic() + float(limit)',
    '',
    '    def guard(frame, event, arg):',
    '        if time.monotonic() > deadline:',
    '            raise TimeoutError("' + TIMEOUT_MARKER + '")',
    '        return guard',
    '',
    '    def verdict(impl):',
    '        """None if the suite passed against impl, else the failure type."""',
    '        ns = {"__name__": "__main__"}',
    '        sink = io.StringIO()',
    '        real_stdout = sys.stdout',
    '        try:',
    '            sys.stdout = sink',
    '            sys.settrace(guard)',
    '            exec(impl, ns)',
    '            exec(code, ns)',
    '            # Tests written as functions are only tests once something calls',
    '            # them. Bare asserts at module level already ran above.',
    '            for name in sorted(ns):',
    '                if name.startswith("test_") and callable(ns[name]):',
    '                    ns[name]()',
    '        except BaseException as e:',
    '            return type(e).__name__',
    '        finally:',
    '            sys.settrace(None)',
    '            sys.stdout = real_stdout',
    '        return None',
    '',
    '    result = {"green": False, "greenError": None, "caught": 0,',
    '              "total": len(mutants), "timeout": False, "error": None}',
    '    try:',
    '        failed = verdict(reference)',
    '        result["green"] = failed is None',
    '        result["greenError"] = failed',
    '        if failed is None:',
    '            for mutant in mutants:',
    '                if verdict(mutant) is not None:',
    '                    result["caught"] += 1',
    '    except BaseException as e:',
    '        result["error"] = type(e).__name__',
    '    if result["greenError"] == "TimeoutError":',
    '        result["timeout"] = True',
    '    return json.dumps(result)',
    ''
  ].join('\n');

  /* Runs one drawn case twice: the author's reference and the student's code,
     in separate namespaces, and reports whether they agreed.

     Both sides run here rather than the reference being precomputed in JS,
     because the reference is Python and only Python knows what it returns.
     Integer division, float formatting and string methods all differ from the
     JavaScript answer somebody would otherwise have to reimplement. */
  var GENERATOR = [
    'def _pypath_run_generated(code, reference, call_expr, limit):',
    '    import json, time',
    '    result = {"passed": 0, "total": 0, "error": None, "timeout": False}',
    '    calls = json.loads(call_expr)',
    '    deadline = time.monotonic() + float(limit)',
    '',
    '    ref_ns = {"__name__": "__pypath_ref__"}',
    '    try:',
    '        exec(reference, ref_ns)',
    '    except BaseException as e:',
    '        # An author error, not a student one, and it must not read as one.',
    '        result["error"] = "ReferenceError"',
    '        return json.dumps(result)',
    '',
    '    ns = {"__name__": "__main__"}',
    '    try:',
    '        exec(code, ns)',
    '    except BaseException as e:',
    '        result["error"] = type(e).__name__',
    '        return json.dumps(result)',
    '',
    '    for one in calls:',
    '        if time.monotonic() > deadline:',
    '            result["timeout"] = True',
    '            break',
    '        result["total"] += 1',
    '        try:',
    '            expected = eval(one, ref_ns)',
    '        except BaseException:',
    '            result["total"] -= 1',
    '            continue',
    '        try:',
    '            actual = eval(one, ns)',
    '        except BaseException as e:',
    '            if result["error"] is None:',
    '                result["error"] = type(e).__name__',
    '            continue',
    '        if repr(actual) == repr(expected):',
    '            result["passed"] += 1',
    '',
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
  /* Kinds an author has to name. Kept next to kindOf because the list and the
     inference below it are one decision written twice otherwise. */
  var DECLARED_KINDS = ['generated', 'ast', 'raises', 'file', 'mutation'];

  function kindOf(testCase) {
    var c = testCase || {};
    // The kinds that have no structural tell. None can be inferred: an authored
    // case either says it is one of these or it is not one. `raises` in
    // particular looks exactly like a `value` case from the outside -- both
    // carry a call and an expect -- and the difference between them is whether
    // the expectation is an answer or an exception.
    if (DECLARED_KINDS.indexOf(c.kind) !== -1) return c.kind;

    var Q = window.PyPathQuestions;
    if (Q) return Q.kindOfCase(testCase);
    // Degraded mode for a page where question-types.js did not load.
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

  /* What a file case asks, off the map the harness read back out of the case's
     own directory. Pure, so the whole vocabulary is testable without Pyodide.

     `exists: false` is deliberately supported: "the temporary file is cleaned
     up afterwards" is a real thing Unit 7 asks for, and it is not expressible
     as a property of any file's contents. */
  function checkFile(testCase, files) {
    var found = files || {};
    var wanted = String(testCase.path == null ? '' : testCase.path);
    var described = testCase.describe || (wanted ? wanted : 'the file');
    var present = Object.prototype.hasOwnProperty.call(found, wanted);

    if (testCase.exists === false) {
      return present
        ? { ok: false, expected: described + ' should not exist', actual: 'it is still there' }
        : { ok: true, expected: described, actual: 'matches' };
    }
    if (!present) {
      return {
        ok: false,
        expected: described,
        actual: Object.keys(found).length
          ? 'your code wrote ' + Object.keys(found).sort().join(', ')
          : 'no file was written'
      };
    }

    var body = found[wanted];
    if (body === null) {
      // Written, but not as text. Existence is the only question left that can
      // honestly be answered.
      return testCase.expect === undefined && testCase.expect_matches === undefined
        ? { ok: true, expected: described, actual: 'matches' }
        : { ok: false, expected: described, actual: 'the file is not readable as text' };
    }
    if (typeof testCase.expect === 'string'
        && !compareOutput(body, testCase.expect)) {
      return { ok: false, expected: testCase.expect, actual: body };
    }
    if (typeof testCase.expect_matches === 'string'
        && !new RegExp(testCase.expect_matches, testCase.flags || 'i').test(normalizeOutput(body))) {
      return { ok: false, expected: described, actual: body || '(the file is empty)' };
    }
    return { ok: true, expected: described, actual: 'matches' };
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
    var allPassed = passed === visible.length + hidden.length && passed > 0;

    return {
      passed: passed,
      total: visible.length + hidden.length,
      allPassed: allPassed,
      hiddenTotal: hidden.length,
      hiddenPassed: hidden.length - hiddenFailed,
      failures: failures.map(function (r) {
        return { name: r.name, expected: r.expected, actual: r.actual };
      }),
      timedOut: visible.concat(hidden).some(function (r) { return r.timeout; }),
      errorType: firstErrorType(visible.concat(hidden)),
      /* Held back until someone has actually tried twice, and only while they
         are still stuck. Offered sooner it is read before the thinking.
         Offered after a pass -- which is what happened before `allPassed` was
         part of this -- it tells a student who has just solved the exercise
         how to solve the exercise, and the one who failed on their first
         attempt gets nothing at the moment they need it most. */
      hint: (attempt >= 2 && !allPassed) ? (spec && spec.hint) || '' : ''
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
    pyodide.runPython(GENERATOR);
    // The AST analyzer lives in its own file because it is a different kind of
    // thing: HARNESS runs code, this one reads it.
    if (window.PyPathAst) pyodide.runPython(window.PyPathAst.ANALYZER);
    harnessedIn = pyodide;
  }

  function pyLiteral(value) {
    return JSON.stringify(String(value == null ? '' : value));
  }

  /* A drawn case. One interpreter call for the whole set rather than one per
     drawn row: forty round trips through runPython to answer one question is
     forty times the overhead for the same answer. */
  function runGeneratedCase(pyodide, code, testCase, attempt) {
    var GEN = window.PyPathGen;
    if (!GEN || !testCase.reference) {
      return {
        name: String(testCase.name || 'generated'), ok: false,
        expected: 'a reference solution', actual: 'this exercise is not set up yet',
        timeout: false, errorType: ''
      };
    }

    // The seed moves with the attempt, so running the check twice draws two
    // different sets and a student cannot tune to one.
    var rows = GEN.draw(testCase.args || [], testCase.runs || 20, (attempt || 1) * 7919);
    var calls = rows.map(function (row) { return GEN.callFor(testCase.entry, row); })
      .filter(Boolean);

    if (!calls.length) {
      return {
        name: String(testCase.name || 'generated'), ok: false,
        expected: 'a function to test', actual: 'this exercise is not set up yet',
        timeout: false, errorType: ''
      };
    }

    var raw = pyodide.runPython(
      '_pypath_run_generated(' +
        pyLiteral(code) + ', ' +
        pyLiteral(testCase.reference) + ', ' +
        pyLiteral(JSON.stringify(calls)) + ', ' +
        CASE_TIMEOUT_SEC +
      ')'
    );
    var out = JSON.parse(raw);
    var ok = out.total > 0 && out.passed === out.total && !out.error;

    return {
      name: String(testCase.name || 'generated'),
      ok: ok,
      // A count, never the input that caught them. "31 of 40" says the rule is
      // nearly right; naming the case hands back a branch to special-case, and
      // hands back exactly what a drawn case exists to withhold.
      expected: out.total + ' of ' + out.total + ' random inputs',
      actual: out.error ? '(' + out.error + ')' : out.passed + ' of ' + out.total,
      timeout: out.timeout === true,
      errorType: out.error || ''
    };
  }

  /* A structural case, read off the analyzer's report. The report is built once
     per run and shared, because parsing the same file for every AST case would
     be one parse per case for no extra information. */
  function runAstCase(code, testCase, report) {
    var AST = window.PyPathAst;
    var verdict = AST
      ? AST.check(testCase, report)
      : { ok: true, expected: 'as described', actual: 'not checked' };
    return {
      name: String(testCase.name || 'structure'),
      ok: verdict.ok,
      expected: verdict.expected,
      actual: verdict.actual,
      timeout: false,
      errorType: ''
    };
  }

  /* A test-quality case. The student's code is a suite, not a solution, so the
     verdict is two-sided: it has to pass what works and fail what does not. */
  function runMutationCase(pyodide, code, testCase) {
    var mutants = Array.isArray(testCase.mutants) ? testCase.mutants : [];
    var name = String(testCase.name || 'your tests');
    if (!testCase.reference || !mutants.length) {
      return {
        name: name, ok: false, expected: 'a reference and some broken versions',
        actual: 'this exercise is not set up yet', timeout: false, errorType: ''
      };
    }

    var out = JSON.parse(pyodide.runPython(
      '_pypath_run_mutation(' +
        pyLiteral(code) + ', ' +
        pyLiteral(testCase.reference) + ', ' +
        pyLiteral(JSON.stringify(mutants)) + ', ' +
        CASE_TIMEOUT_SEC +
      ')'
    ));

    // Green first, and said separately. "Your tests fail the working version"
    // and "your tests miss two bugs" are different problems and a student told
    // the wrong one goes looking in the wrong place.
    if (!out.green) {
      return {
        name: name, ok: false,
        expected: 'your tests to pass a correct version',
        actual: out.greenError ? '(' + out.greenError + ')' : 'they did not',
        timeout: out.timeout === true, errorType: out.greenError || ''
      };
    }
    return {
      name: name,
      ok: out.caught === out.total && out.total > 0,
      // A count, not which mutant survived: naming it hands back the exact
      // assertion to write, which is the thing being assessed.
      expected: out.total + ' of ' + out.total + ' broken versions caught',
      actual: out.caught + ' of ' + out.total,
      timeout: out.timeout === true,
      errorType: out.error || ''
    };
  }

  function runOneCase(pyodide, code, testCase, context) {
    var ctx = context || {};
    var kind = kindOf(testCase);
    if (kind === 'generated') return runGeneratedCase(pyodide, code, testCase, ctx.attempt);
    if (kind === 'ast') return runAstCase(code, testCase, ctx.report);
    if (kind === 'mutation') return runMutationCase(pyodide, code, testCase);

    // Fixtures are declared once for the exercise and can be overridden by a
    // case that needs a different starting file.
    var files = testCase.files || ctx.files || null;
    // A raises case runs its call inside the harness rather than as an
    // expression result, because the whole point is that evaluating it throws.
    var call = (kind === 'value' || kind === 'raises') ? (testCase.call || '') : '';
    var raw = pyodide.runPython(
      '_pypath_run_case(' +
        pyLiteral(code) + ', ' +
        pyLiteral(testCase.stdin || '') + ', ' +
        pyLiteral(call) + ', ' +
        CASE_TIMEOUT_SEC + ', ' +
        pyLiteral(files ? JSON.stringify(files) : '') +
      ')'
    );
    var out = JSON.parse(raw);

    var ok;
    var expected;
    var actual;
    if (kind === 'raises') {
      expected = String(testCase.expect || 'an error');
      actual = out.error || 'no error was raised';
      // Timeouts are never the error an exercise asked for, and an exercise
      // that expected TimeoutError would be asking for a hung tab.
      ok = !out.timeout && out.error === expected;
    } else if (kind === 'file') {
      if (out.error) {
        ok = false;
        expected = testCase.describe || 'your code to run';
        actual = '(' + out.error + ')';
      } else {
        var fileVerdict = checkFile(testCase, out.files);
        ok = fileVerdict.ok;
        expected = fileVerdict.expected;
        actual = fileVerdict.actual;
      }
    } else if (isPropertyCase(testCase)) {
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

    /* An expected exception is the answer, not a fault. Left as an errorType it
       would reach firstErrorType and the summary would report the exercise
       working exactly as asked under a banner saying the code crashed. The
       case's own `actual` still names whichever exception did arrive. */
    var faulted = out.error && kind !== 'raises';

    return {
      name: String(testCase.name || 'case'),
      ok: ok,
      expected: expected,
      actual: faulted ? '(' + out.error + ')' : actual,
      timeout: out.timeout === true,
      errorType: faulted ? out.error : ''
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

    /* The structural report, built once and shared by every ast case in the
       run. Parsing the same file per case would be one parse per case for
       exactly the same answer.

       Built only when something asks for it: the overwhelming majority of
       exercises have no ast case, and they should not pay for a parse. */
    var context = {
      attempt: attempt || 1,
      report: null,
      // Declared once for the exercise, seeded fresh into every case's own
      // directory. A lesson that gives the class a scores.txt gives it to each
      // case unchanged, however the case before it left the file.
      files: (spec && spec.files) || null
    };
    var wantsAst = visible.concat(hidden).some(function (c) {
      return kindOf(c) === 'ast';
    });
    if (wantsAst) {
      try {
        context.report = JSON.parse(
          pyodide.runPython('_pypath_analyze(' + pyLiteral(code) + ')')
        );
      } catch (e) {
        // A parse that itself fails reads as unparseable code, which is what
        // the case then reports. It must not take the whole run down.
        context.report = { parsed: false };
      }
    }

    var visibleResults = visible.map(function (c) {
      return runOneCase(pyodide, code, c, context);
    });
    // Hidden cases are skipped once a visible one has already failed: they can
    // only repeat news the student has, and each one costs a run of code tha
    // may be the runaway loop we just timed out on.
    var hiddenResults = visibleResults.every(function (r) { return r.ok; })
      ? hidden.map(function (c) { return runOneCase(pyodide, code, c, context); })
      : hidden.map(function (c) {
        return { name: String(c.name || 'hidden'), ok: false, skipped: true,
          expected: '', actual: '', timeout: false, errorType: '' };
      });

    var out = summarize(visibleResults, hiddenResults, spec, attempt || 1);
    // Reported, never failed. A student who has not understood parameters yet
    // writes this shape by accident, and failing them on a heuristic would be
    // marking a guess rather than an answer.
    out.structureNotes = (context.report && window.PyPathAst)
      ? window.PyPathAst.describeHardcoding(context.report)
      : [];
    return out;
  }

  window.PyPathChecker = {
    CASE_TIMEOUT_SEC: CASE_TIMEOUT_SEC,
    normalizeOutput: normalizeOutput,
    compareOutput: compareOutput,
    normalizeValue: normalizeValue,
    compareValue: compareValue,
    DECLARED_KINDS: DECLARED_KINDS,
    kindOf: kindOf,
    isExpressionCase: isExpressionCase,
    isPropertyCase: isPropertyCase,
    checkProperty: checkProperty,
    checkFile: checkFile,
    outputLines: outputLines,
    summarize: summarize,
    run: run
  };
})();
