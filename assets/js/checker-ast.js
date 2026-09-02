/* PyPath — reading a student's code as code, not as text.
 *
 * The problem this exists for, stated exactly:
 *
 *   "area is calculated, not typed in"
 *   source_matches: "length\\s*\\*\\s*width"
 *
 * That case ships in unit 1 today, and it is satisfied by typing
 * `# length * width` as a comment above a print of the answer. It is also
 * satisfied by putting it in a string. A regex over source cannot tell code
 * from text about code, because to a regex there is no difference.
 *
 * Python's own parser can. A comment is discarded before a tree exists, and a
 * string literal is a Constant node rather than a multiplication. So the check
 * becomes "is there a Mult node whose operands mention these names", which is
 * the thing the author meant in the first place and cannot be typed around.
 *
 * The Python half is a source string, like HARNESS in checker.js and for the
 * same reason: it runs in the page's one Pyodide instance. The JavaScript half
 * is pure, takes a report and a spec, and is tested with no interpreter.
 */
(function () {
  'use strict';

  /* Author-facing vocabulary, deliberately small. Every entry is a question a
     lesson actually asks. Anything more exotic is a sign the exercise wants a
     generated case against a reference instead, which is a stronger check than
     any structural one. */
  var REQUIRE_KEYS = ['loops', 'conditionals', 'functions', 'calls', 'binop',
    'names', 'returns', 'imports', 'classes', 'raises', 'handlers', 'withs',
    'decorators', 'boolops', 'compares'];

  /* Builds the report. Returns a JSON string, so the JS side sees plain data.

     Wrapped in its own try: a student mid-edit has code that does not parse,
     and that is a normal state to be in, not an error to surface. */
  var ANALYZER = [
    'import ast, json',
    '',
    'def _pypath_analyze(source):',
    '    try:',
    '        tree = ast.parse(source)',
    '    except SyntaxError:',
    '        return json.dumps({"parsed": False})',
    '',
    '    report = {',
    '        "parsed": True, "loops": [], "conditionals": 0, "functions": [],',
    '        "calls": [], "binop": [], "binops": [], "names": [], "returns": 0,',
    '        "imports": [],',
    '        "classes": [], "raises": [], "handlers": [], "withs": 0,',
    '        "decorators": [], "boolops": [], "compares": [],',
    '        "maxNesting": 0, "hardcoded": [], "prints": 0,',
    '    }',
    '',
    '    def _name_of(node):',
    '        # A base class or an exception is written as a bare name (ValueError)',
    '        # or as an attribute (errors.ShapeError). Both are one thing to an',
    '        # author, so both come back as the last segment they wrote.',
    '        if isinstance(node, ast.Name):',
    '            return node.id',
    '        if isinstance(node, ast.Attribute):',
    '            return node.attr',
    '        if isinstance(node, ast.Call):',
    '            return _name_of(node.func)',
    '        return None',
    '',
    '    for node in ast.walk(tree):',
    '        if isinstance(node, (ast.For, ast.AsyncFor)):',
    '            report["loops"].append("for")',
    '        elif isinstance(node, ast.While):',
    '            report["loops"].append("while")',
    '        elif isinstance(node, (ast.comprehension,)):',
    '            report["loops"].append("comprehension")',
    '        elif isinstance(node, ast.If):',
    '            report["conditionals"] += 1',
    '        elif isinstance(node, ast.IfExp):',
    '            report["conditionals"] += 1',
    '        elif isinstance(node, ast.Return):',
    '            report["returns"] += 1',
    '        elif isinstance(node, ast.BinOp):',
    '            report["binop"].append(type(node.op).__name__)',
    '            # Which names this operation actually works on.',
    '            #',
    '            # Presence is not enough and the attack suite proved it:',
    '            # `length = 8` then `print(8 * 5)` has a Mult and mentions both',
    '            # names, and multiplies neither of them. An author asking for',
    '            # "length times width" means the operands, so the operands are',
    '            # what gets recorded.',
    '            operands = sorted({',
    '                n.id for side in (node.left, node.right)',
    '                for n in ast.walk(side) if isinstance(n, ast.Name)',
    '            })',
    '            report["binops"].append({',
    '                "op": type(node.op).__name__, "names": operands})',
    '        elif isinstance(node, ast.Name):',
    '            report["names"].append(node.id)',
    '        elif isinstance(node, ast.Attribute):',
    '            report["calls"].append(node.attr)',
    '        elif isinstance(node, ast.Call):',
    '            if isinstance(node.func, ast.Name):',
    '                report["calls"].append(node.func.id)',
    '                if node.func.id == "print":',
    '                    report["prints"] += 1',
    '        elif isinstance(node, (ast.Import, ast.ImportFrom)):',
    '            mod = getattr(node, "module", None)',
    '            if mod:',
    '                report["imports"].append(mod)',
    '            for alias in getattr(node, "names", []) or []:',
    '                report["imports"].append(alias.name)',
    '        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):',
    '            report["functions"].append({',
    '                "name": node.name,',
    '                "params": len(node.args.args),',
    '            })',
    '            for dec in node.decorator_list:',
    '                found = _name_of(dec)',
    '                if found:',
    '                    report["decorators"].append(found)',
    '        elif isinstance(node, ast.ClassDef):',
    '            # Methods, not every function in the file. "does Dog define',
    '            # speak" is a question about the class body, and a module-level',
    '            # def named speak is not an answer to it.',
    '            methods = [b.name for b in node.body',
    '                       if isinstance(b, (ast.FunctionDef, ast.AsyncFunctionDef))]',
    '            report["classes"].append({',
    '                "name": node.name,',
    '                "bases": [b for b in (_name_of(x) for x in node.bases) if b],',
    '                "methods": methods,',
    '            })',
    '            for dec in node.decorator_list:',
    '                found = _name_of(dec)',
    '                if found:',
    '                    report["decorators"].append(found)',
    '        elif isinstance(node, ast.Raise):',
    '            found = _name_of(node.exc) if node.exc is not None else None',
    '            # A bare `raise` re-raises whatever is being handled. It is a',
    '            # raise, and recording it as one keeps "this code raises',
    '            # something" honest.',
    '            report["raises"].append(found or "raise")',
    '        elif isinstance(node, ast.ExceptHandler):',
    '            # `except (ValueError, TypeError)` is two handled types, and an',
    '            # author asking for either should find either.',
    '            if node.type is None:',
    '                report["handlers"].append("bare")',
    '            elif isinstance(node.type, ast.Tuple):',
    '                for one in node.type.elts:',
    '                    found = _name_of(one)',
    '                    if found:',
    '                        report["handlers"].append(found)',
    '            else:',
    '                found = _name_of(node.type)',
    '                if found:',
    '                    report["handlers"].append(found)',
    '        elif isinstance(node, (ast.With, ast.AsyncWith)):',
    '            report["withs"] += 1',
    '        elif isinstance(node, ast.BoolOp):',
    '            # Unit 2 asks for "age >= 18 AND has_ticket", and with a true',
    '            # ticket an `or` returns the same answer. Only the operator',
    '            # the student wrote tells the two apart, so it is recorded.',
    '            report["boolops"].append(type(node.op).__name__)',
    '        elif isinstance(node, ast.Compare):',
    '            for op in node.ops:',
    '                report["compares"].append(type(op).__name__)',
    '',
    '    def depth(node, level=0):',
    '        deepest = level',
    '        for child in ast.iter_child_nodes(node):',
    '            step = 1 if isinstance(child, (ast.For, ast.While, ast.If,',
    '                                           ast.With, ast.Try)) else 0',
    '            deepest = max(deepest, depth(child, level + step))',
    '        return deepest',
    '',
    '    report["maxNesting"] = depth(tree)',
    '',
    '    # What hardcoding looks like as a tree.',
    '    #',
    '    # Two shapes, both of which a correct beginner solution never has and',
    '    # both of which are reported rather than failed: a student who has',
    '    # genuinely misunderstood parameters writes the first one by accident.',
    '    for node in ast.walk(tree):',
    '        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):',
    '            continue',
    '        params = {a.arg for a in node.args.args}',
    '        if not params:',
    '            continue',
    '        used = {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}',
    '        if not (params & used):',
    '            report["hardcoded"].append({',
    '                "name": node.name, "why": "ignores-parameters"})',
    '            continue',
    '        # A body that is nothing but "if x == <literal>: return <literal>".',
    '        tests = [s for s in node.body if isinstance(s, ast.If)]',
    '        if len(tests) >= 2 and len(tests) == len([',
    '                s for s in node.body if not isinstance(s, ast.Return)]):',
    '            literal_branches = 0',
    '            for branch in tests:',
    '                cmp_ok = (isinstance(branch.test, ast.Compare)',
    '                          and all(isinstance(c, ast.Constant)',
    '                                  for c in branch.test.comparators))',
    '                body_ok = all(isinstance(s, ast.Return)',
    '                              and isinstance(s.value, ast.Constant)',
    '                              for s in branch.body)',
    '                if cmp_ok and body_ok:',
    '                    literal_branches += 1',
    '            if literal_branches == len(tests):',
    '                report["hardcoded"].append({',
    '                    "name": node.name, "why": "literal-lookup"})',
    '',
    '    return json.dumps(report)',
    ''
  ].join('\n');

  function listOf(report, key) {
    var value = (report || {})[key];
    return Array.isArray(value) ? value : [];
  }

  function hasAll(present, wanted) {
    var seen = {};
    present.forEach(function (v) { seen[String(v).toLowerCase()] = true; });
    return wanted.every(function (v) { return seen[String(v).toLowerCase()] === true; });
  }

  function hasAny(present, wanted) {
    var seen = {};
    present.forEach(function (v) { seen[String(v).toLowerCase()] = true; });
    return wanted.some(function (v) { return seen[String(v).toLowerCase()] === true; });
  }

  /* Reads one requirement off the report. `spec` is what the author wrote under
     `requires` or `forbids`; `true` means "any at all". */
  function satisfies(report, key, want) {
    if (key === 'conditionals' || key === 'returns' || key === 'withs') {
      var count = Number(report[key] || 0);
      return want === true ? count > 0 : count >= Number(want);
    }
    /* A class is asked about the way a function is: by name, and optionally by
       what it is built from. `bases` is what makes an inheritance exercise
       checkable at all -- "Dog extends Animal" is a fact about the class
       statement, and no amount of running the code proves the student did not
       copy Animal's methods into Dog by hand. */
    if (key === 'classes') {
      var classes = listOf(report, 'classes');
      if (want === true) return classes.length > 0;
      return (Array.isArray(want) ? want : [want]).every(function (spec) {
        if (typeof spec === 'string') {
          return classes.some(function (c) { return c.name === spec; });
        }
        return classes.some(function (c) {
          return (!spec.name || c.name === spec.name)
            && (!spec.bases || hasAll(c.bases || [], spec.bases))
            && (!spec.methods || hasAll(c.methods || [], spec.methods));
        });
      });
    }
    if (key === 'functions') {
      var functions = listOf(report, 'functions');
      if (want === true) return functions.length > 0;
      var wanted = Array.isArray(want) ? want : [want];
      return wanted.every(function (spec) {
        if (typeof spec === 'string') {
          return functions.some(function (f) { return f.name === spec; });
        }
        return functions.some(function (f) {
          return (!spec.name || f.name === spec.name)
            && (spec.params === undefined || f.params === Number(spec.params));
        });
      });
    }
    if (key === 'binop') {
      var wanted = Array.isArray(want) ? want : [want];
      return wanted.every(function (spec) {
        // A bare string is the loose form, kept because it is what a simple
        // "uses division somewhere" question means.
        if (typeof spec === 'string') return hasAll(listOf(report, 'binop'), [spec]);
        // The strict form: this operation, on these operands.
        return listOf(report, 'binops').some(function (found) {
          if (spec.op && String(found.op).toLowerCase() !== String(spec.op).toLowerCase()) {
            return false;
          }
          return hasAll(found.names || [], spec.names || []);
        });
      });
    }
    var present = listOf(report, key);
    if (want === true) return present.length > 0;
    return hasAll(present, Array.isArray(want) ? want : [want]);
  }

  function violates(report, key, want) {
    if (key === 'conditionals' || key === 'returns' || key === 'withs') {
      return Number(report[key] || 0) > 0;
    }
    if (key === 'functions') {
      return listOf(report, 'functions').length > 0;
    }
    // Named classes are forbidden by name; `true` forbids defining any at all.
    if (key === 'classes') {
      var classes = listOf(report, 'classes');
      if (want === true) return classes.length > 0;
      var names = classes.map(function (c) { return c.name; });
      return hasAny(names, Array.isArray(want) ? want : [want]);
    }
    var present = listOf(report, key);
    if (want === true) return present.length > 0;
    return hasAny(present, Array.isArray(want) ? want : [want]);
  }

  /* Returns { ok, expected, actual } so an AST failure reads exactly the way a
     stdout failure does in check-ui.js. */
  function check(testCase, report) {
    var c = testCase || {};
    var described = c.describe || 'code matching the exercise';

    if (!report || report.parsed !== true) {
      return { ok: false, expected: described, actual: 'your code has a syntax error' };
    }

    var requires = c.requires || {};
    for (var i = 0; i < REQUIRE_KEYS.length; i++) {
      var key = REQUIRE_KEYS[i];
      if (!(key in requires)) continue;
      if (!satisfies(report, key, requires[key])) {
        return { ok: false, expected: described, actual: 'not found in your code' };
      }
    }

    if (typeof c.max_nesting === 'number' && Number(report.maxNesting) > c.max_nesting) {
      return {
        ok: false,
        expected: 'at most ' + c.max_nesting + ' levels of nesting',
        actual: report.maxNesting + ' levels'
      };
    }

    var forbids = c.forbids || {};
    for (var j = 0; j < REQUIRE_KEYS.length; j++) {
      var fkey = REQUIRE_KEYS[j];
      if (!(fkey in forbids)) continue;
      if (violates(report, fkey, forbids[fkey])) {
        return {
          ok: false,
          expected: described,
          // Named, unlike a hidden case: an exercise that forbids sorted() said
          // so in the prompt, so there is nothing left to give away.
          actual: 'your code uses something this exercise asks you not to'
        };
      }
    }

    return { ok: true, expected: described, actual: 'matches' };
  }

  /* What a teacher is told, and the wording is the rule.
   *
   * "Does not use its own parameters" is a fact about the code. It is not
   * called cheating, here or in the dashboard, because a student who has
   * genuinely not understood what a parameter is writes exactly this, and a
   * dashboard that accuses them has done real damage over a guess. */
  var HARDCODE_REASON = {
    'ignores-parameters': 'does not use the values passed into it',
    'literal-lookup': 'returns a fixed answer for each input it recognises'
  };

  function describeHardcoding(report) {
    return listOf(report, 'hardcoded').map(function (entry) {
      return entry.name + ' ' + (HARDCODE_REASON[entry.why] || 'looks unusual');
    });
  }

  window.PyPathAst = {
    ANALYZER: ANALYZER,
    REQUIRE_KEYS: REQUIRE_KEYS,
    HARDCODE_REASON: HARDCODE_REASON,
    satisfies: satisfies,
    violates: violates,
    check: check,
    describeHardcoding: describeHardcoding
  };
})();
