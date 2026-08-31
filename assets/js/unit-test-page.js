/* PyPath — the end-of-unit test page: render a paper, run it, grade it, store it.

   One page serves all ten units through ?unit=N. The rules it grades against
   live in unit-test.js; this file only fetches the question pools, draws the
   paper, drives Pyodide, and writes the result through ProgressStore.

   The record shape it persists is the contract in
   docs/superpowers/specs/2026-08-20-unit-tests-design.md. The pure half of
   that (normalize and merge) hangs off window.PyPathUnitTestPage so the "best
   never decreases" rule is testable without a DOM. */
(function () {
  'use strict';

  var KEYS = window.PyPathKeys;
  var STORE_KEY = (KEYS && KEYS.UNIT_TESTS_KEY) || 'pypath-unit-tests';

  // The in-progress paper is deliberately sessionStorage and deliberately not
  // in the sync allowlist. It is scratch for one tab: syncing it would push a
  // half finished paper to another device, and persisting it forever would
  // hand a learner an unlimited think-time exam.
  var ATTEMPT_PREFIX = 'pypath-unit-test-attempt-';

  var TOTAL_UNITS = 10;
  var DATA_DIR = '/assets/data/unit-tests/';

  // ---------- pure rules: the stored record ----------

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    var n = num(value, min);
    return Math.min(max, Math.max(min, n));
  }

  // The pass mark belongs to the engine, but this file must still normalize a
  // stored blob if unit-test.js failed to load, so it falls back to the
  // contract's own number rather than throwing.
  function reachedPassMark(score) {
    var engine = window.PyPathUnitTest;
    return engine ? engine.hasPassed(score) : Number(score) >= 70;
  }

  function normalizeLast(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return {
      score: clamp(Math.round(num(raw.score, 0)), 0, 100),
      mcqCorrect: clamp(Math.round(num(raw.mcqCorrect, 0)), 0, 10),
      frqId: typeof raw.frqId === 'string' ? raw.frqId : '',
      frqCasesPassed: Math.max(0, Math.round(num(raw.frqCasesPassed, 0))),
      frqCasesTotal: Math.max(0, Math.round(num(raw.frqCasesTotal, 0))),
      at: Math.max(0, Math.round(num(raw.at, 0)))
    };
  }

  // Only unit numbers 1..10 survive. Anything else in the blob is a bug or a
  // hand edit, and carrying it forward would let it reach the teacher summary.
  function normalizeRecords(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    var out = {};
    Object.keys(raw).forEach(function (key) {
      var unit = Number(key);
      if (!Number.isInteger(unit) || unit < 1 || unit > TOTAL_UNITS) return;
      var entry = raw[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;

      var best = clamp(Math.round(num(entry.best, 0)), 0, 100);
      out[String(unit)] = {
        best: best,
        passed: entry.passed === true || reachedPassMark(best),
        attempts: Math.max(0, Math.round(num(entry.attempts, 0))),
        lastAt: Math.max(0, Math.round(num(entry.lastAt, 0))),
        last: normalizeLast(entry.last)
      };
    });
    return out;
  }

  // A retake that goes worse must not cost a learner the unit they already
  // earned, so `best` and `passed` only ever ratchet upward; `last` and
  // `attempts` always reflect the most recent sitting.
  function mergeAttempt(prev, attempt) {
    var before = normalizeRecords({ '1': prev })['1'] || null;
    var last = normalizeLast(attempt) || normalizeLast({});
    var best = Math.max(before ? before.best : 0, last.score);

    return {
      best: best,
      passed: (before ? before.passed : false) || reachedPassMark(best),
      attempts: (before ? before.attempts : 0) + 1,
      lastAt: last.at,
      last: last
    };
  }

  window.PyPathUnitTestPage = {
    STORE_KEY: STORE_KEY,
    ATTEMPT_PREFIX: ATTEMPT_PREFIX,
    normalizeRecords: normalizeRecords,
    mergeAttempt: mergeAttempt
  };

  // ---------- storage ----------

  function store() { return window.ProgressStore || null; }

  function readRecords() {
    var s = store();
    if (!s) return {};
    try { return normalizeRecords(JSON.parse(s.getItem(STORE_KEY) || '{}')); }
    catch (e) { return {}; }
  }

  // Always through ProgressStore, never localStorage: the store is what
  // stamps the write and hands it to the sync layer.
  function writeRecords(records) {
    var s = store();
    if (!s) return;
    s.setItem(STORE_KEY, JSON.stringify(records));
  }

  /* The classroom event log, when there is one. A no-op for a guest and for a
     signed-in learner who has joined no class. */
  function note(type, payload) {
    if (!window.PyPathEvents) return;
    try { window.PyPathEvents.record(type, payload); } catch (e) {}
  }

  // When this sitting began, for the duration on test.submitted. Module-level
  // rather than stored: a duration that survived a reload would count the time
  // the tab spent closed.
  var startedAt = 0;

  function attemptKey(unit) { return ATTEMPT_PREFIX + unit; }

  function readAttempt(unit) {
    try {
      var raw = sessionStorage.getItem(attemptKey(unit));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.mcqIds) || typeof parsed.frqId !== 'string') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeAttempt(unit, attempt) {
    try { sessionStorage.setItem(attemptKey(unit), JSON.stringify(attempt)); }
    catch (e) {}
  }

  function clearAttempt(unit) {
    try { sessionStorage.removeItem(attemptKey(unit)); }
    catch (e) {}
  }

  // ---------- page ----------

  if (typeof document === 'undefined') return;

  var T = window.PyPathUnitTest;

  var unit = null;
  var pools = { mcq: [], frq: [] };
  var paper = { mcq: [], frq: null, answers: [], code: '' };
  var editor = null;
  var grading = false;

  /* The class's settings, once class-policy.js has read them. Null until then,
     and null forever for a guest and for a learner in no class -- which is the
     answer that means "unlimited retakes, sequential unlocking", exactly what
     this page did before either setting existed. */
  var classPolicy = null;

  function teaching() {
    var R = window.PyPathRoles;
    return !!(R && R.teachingNow());
  }

  function attemptsUsed() {
    var record = readRecords()[String(unit)];
    return record ? record.attempts : 0;
  }

  function bestSoFar() {
    var record = readRecords()[String(unit)];
    return record ? record.best : 0;
  }

  /* Why this learner may not sit this paper, or null when they may.
   *
   * Two reasons, checked in this order and never both. A unit that is not open
   * to this class cannot be sat at all, and telling somebody how many attempts
   * they have left at a test they cannot reach would be the wrong sentence to
   * put on the screen.
   *
   * Both are client-side, and they are not the same strength. The unit lock is
   * enforced in firestore.rules too, so a student who gets past this one has
   * their result refused where it would have counted. The retake cap is not,
   * and cannot be: see the note above validEvent() in firestore.rules for why
   * rules cannot count a student's prior attempts. It is a rule this page
   * keeps, and it is worth exactly that much.
   */
  function blockedReason() {
    var POLICY = window.PyPathPolicy;
    if (!POLICY || unit === null) return null;

    var units = window.ProgressStore ? window.ProgressStore.getCompletedUnits() : [];
    if (!POLICY.resolveUnlocked(unit, classPolicy, units, teaching())) {
      var byHand = classPolicy && POLICY.normalizeMode(classPolicy.mode) === 'manual';
      return byHand
        ? 'Unit ' + unit + ' is not open for your class yet, so this test cannot '
          + 'be taken. Your teacher chooses which units are open. Nothing you '
          + 'have already finished is affected.'
        : 'Unit ' + unit + ' is not unlocked yet. Finish Unit ' + (unit - 1)
          + ' and pass its test first.';
    }

    var left = POLICY.attemptsLeft(classPolicy, attemptsUsed(), teaching());
    if (left === 0) {
      var cap = POLICY.attemptCap(classPolicy, teaching());
      return 'Your teacher allows ' + cap + (cap === 1 ? ' attempt' : ' attempts')
        + ' at this test for your class, and you have used '
        + (cap === 1 ? 'it' : 'them all') + '. Your best score of ' + bestSoFar()
        + ' out of 100 still stands.';
    }
    return null;
  }

  /* The retake sentence, which is only true by default.

     Left exactly as authored when there is no cap, so a learner outside a
     class -- and every class that has not set one -- reads what this page has
     always said. */
  function paintRetakeLine() {
    var line = $('ut-retakes');
    var POLICY = window.PyPathPolicy;
    if (!line || !POLICY) return;
    var cap = POLICY.attemptCap(classPolicy, teaching());
    if (cap === null) return;
    var used = attemptsUsed();
    var left = POLICY.attemptsLeft(classPolicy, used, teaching());
    line.textContent = 'Your teacher allows ' + cap
      + (cap === 1 ? ' attempt' : ' attempts') + ' at this test for your class. '
      + 'You have used ' + used + ' of ' + cap + ', so you have ' + left
      + (left === 1 ? ' attempt left. ' : ' attempts left. ')
      + 'Your best score is the one that counts, so a worse retake never takes '
      + 'anything away.';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function $(id) { return document.getElementById(id); }

  function show(node, visible) {
    if (node) node.hidden = !visible;
  }

  function notice(text, kind) {
    var box = $('ut-notice');
    if (!box) return;
    box.textContent = '';
    box.className = 'ut-notice' + (kind ? ' ut-notice--' + kind : '');
    if (!text) { box.hidden = true; return; }
    box.appendChild(el('p', null, text));
    box.hidden = false;
  }

  function unitFromQuery() {
    var raw = null;
    try { raw = new URLSearchParams(window.location.search).get('unit'); }
    catch (e) { raw = null; }
    if (raw === null || !/^\d+$/.test(raw.trim())) return null;
    var n = Number(raw.trim());
    return n >= 1 && n <= TOTAL_UNITS ? n : null;
  }

  // A missing or nonsense ?unit= is a plain menu, not a broken page. It is
  // also the page a learner lands on if they bookmark /unit-test.html bare.
  function renderPicker() {
    var box = $('ut-notice');
    if (!box) return;
    box.textContent = '';
    box.className = 'ut-notice';
    box.appendChild(el('p', null, 'Pick a unit to take its end of unit test.'));
    var list = el('ul', 'ut-picker');
    for (var i = 1; i <= TOTAL_UNITS; i++) {
      var item = el('li');
      var link = el('a', 'route', 'Unit ' + i + ' test');
      link.href = '/unit-test.html?unit=' + i;
      item.appendChild(link);
      list.appendChild(item);
    }
    box.appendChild(list);
    box.hidden = false;
  }

  // The content files are written by another hand and may be an array or an
  // object wrapping one. Accept either rather than break on a shape the
  // contract never pinned down.
  function questionList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      var keys = ['questions', 'items', 'mcq', 'frq', 'pool'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
      }
    }
    return [];
  }

  function fetchPool(name) {
    return fetch(DATA_DIR + 'unit-' + unit + '-' + name + '.json', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(questionList);
  }

  function byId(pool, id) {
    for (var i = 0; i < pool.length; i++) {
      if (pool[i] && pool[i].id === id) return pool[i];
    }
    return null;
  }

  // ---------- building a paper ----------

  function rollPaper() {
    paper.mcq = T.pickQuestions(pools.mcq, T.MCQ_COUNT);
    paper.frq = T.pickOne(pools.frq);
    paper.answers = paper.mcq.map(function () { return null; });
    paper.code = paper.frq && typeof paper.frq.starter === 'string' ? paper.frq.starter : '';
    saveAttempt();
  }

  // Restoring by id, not by index, is the point: a reload must hand back the
  // same paper. Rerolling on reload would let a learner refresh until they
  // drew ten easy questions.
  function restorePaper(saved) {
    var mcq = saved.mcqIds.map(function (id) { return byId(pools.mcq, id); });
    if (mcq.length !== T.MCQ_COUNT || mcq.indexOf(null) !== -1) return false;
    var frq = byId(pools.frq, saved.frqId);
    if (!frq) return false;

    paper.mcq = mcq;
    paper.frq = frq;
    paper.answers = mcq.map(function (q, i) {
      var a = Array.isArray(saved.answers) ? saved.answers[i] : null;
      return a === null || a === undefined ? null : Number(a);
    });
    paper.code = typeof saved.code === 'string' ? saved.code : (frq.starter || '');
    return true;
  }

  function saveAttempt() {
    writeAttempt(unit, {
      unit: unit,
      mcqIds: paper.mcq.map(function (q) { return q.id; }),
      frqId: paper.frq ? paper.frq.id : '',
      answers: paper.answers,
      code: editor ? editor.getValue() : paper.code
    });
  }

  // ---------- rendering the paper ----------

  function renderCode(source) {
    var pre = el('pre', 'ut-code');
    pre.appendChild(el('code', null, source));
    return pre;
  }

  function renderMcq() {
    var host = $('ut-mcq');
    host.textContent = '';

    paper.mcq.forEach(function (q, qi) {
      // A real fieldset with a legend, so the four radios are announced as one
      // group and arrow keys move between them. A div with role=radiogroup
      // would need every one of those behaviours rebuilt by hand.
      var fs = el('fieldset', 'ut-q');
      fs.setAttribute('data-q', String(qi));

      var legend = el('legend', 'ut-q__legend', 'Question ' + (qi + 1) + ' of ' + paper.mcq.length);
      fs.appendChild(legend);
      fs.appendChild(el('p', 'ut-q__prompt', q.prompt));
      if (typeof q.code === 'string' && q.code) fs.appendChild(renderCode(q.code));

      var choices = el('div', 'ut-choices');
      (q.choices || []).forEach(function (choice, ci) {
        var id = 'ut-q' + qi + '-c' + ci;
        var label = el('label', 'ut-choice');
        label.setAttribute('for', id);

        var input = document.createElement('input');
        input.type = 'radio';
        input.name = 'ut-q' + qi;
        input.id = id;
        input.value = String(ci);
        if (paper.answers[qi] === ci) input.checked = true;
        input.addEventListener('change', function () {
          paper.answers[qi] = ci;
          saveAttempt();
        });

        label.appendChild(input);
        label.appendChild(el('span', 'ut-choice__text', choice));
        choices.appendChild(label);
      });

      fs.appendChild(choices);
      host.appendChild(fs);
    });
  }

  function formatArg(value) {
    try { return JSON.stringify(value); }
    catch (e) { return String(value); }
  }

  function formatCall(entry, args) {
    return entry + '(' + (args || []).map(formatArg).join(', ') + ')';
  }

  function renderCaseRow(frq, c) {
    var row = el('tr');
    row.appendChild(el('td', 'ut-case__call', formatCall(frq.entry, c.args)));
    row.appendChild(el('td', 'ut-case__expect', formatArg(c.expect)));
    return row;
  }

  function renderFrq() {
    var host = $('ut-frq');
    host.textContent = '';
    var frq = paper.frq;
    if (!frq) return;

    host.appendChild(el('h2', 'ut-frq__heading', 'Free response'));
    host.appendChild(el('h3', 'ut-frq__title', frq.title || 'Write a function'));
    host.appendChild(el('p', 'ut-frq__prompt', frq.prompt));

    var entryLine = el('p', 'ut-frq__entry');
    entryLine.appendChild(document.createTextNode('Your answer must define a function named '));
    entryLine.appendChild(el('code', null, frq.entry));
    entryLine.appendChild(document.createTextNode('. Anything it prints is ignored.'));
    host.appendChild(entryLine);

    var visible = (frq.cases || []).filter(function (c) { return c && c.hidden !== true; });
    if (visible.length) {
      var table = el('table', 'ut-cases');
      var caption = el('caption', null, 'Sample cases');
      table.appendChild(caption);
      var thead = el('thead');
      var hr = el('tr');
      hr.appendChild(el('th', null, 'Call'));
      hr.appendChild(el('th', null, 'Returns'));
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el('tbody');
      visible.forEach(function (c) { tbody.appendChild(renderCaseRow(frq, c)); });
      table.appendChild(tbody);
      host.appendChild(table);
      host.appendChild(el('p', 'ut-hint', 'There are more cases behind the scenes, so solve the problem rather than the samples.'));
    }

    host.appendChild(el('p', 'ut-frq__label', 'Your answer'));
    var wrap = el('div', 'ut-editor');
    var ta = document.createElement('textarea');
    ta.id = 'ut-frq-code';
    ta.className = 'ut-editor__textarea';
    ta.setAttribute('aria-label', 'Your Python answer');
    ta.value = paper.code;
    wrap.appendChild(ta);
    host.appendChild(wrap);

    mountEditor(ta);
  }

  // Same options as the sandbox editor so the test feels like the practice
  // pages. If CodeMirror never arrives the bare textarea is still a working
  // answer box, which matters more than syntax colouring.
  function mountEditor(textarea) {
    editor = null;
    var tries = 40;
    (function attempt() {
      if (typeof window.CodeMirror === 'undefined') {
        if (tries-- <= 0) return;
        setTimeout(attempt, 50);
        return;
      }
      editor = window.CodeMirror.fromTextArea(textarea, {
        mode: 'python',
        theme: 'pypath',
        lineNumbers: true,
        indentUnit: 4,
        indentWithTabs: false,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true
      });
      editor.setValue(paper.code);
      editor.setSize(null, 260);
      editor.on('change', function () {
        paper.code = editor.getValue();
        saveAttempt();
      });
      document.addEventListener('themechange', function () {
        if (!editor) return;
        editor.setOption('theme', 'pypath');
        editor.refresh();
      });
    })();
  }

  function currentCode() {
    if (editor) return editor.getValue();
    var ta = $('ut-frq-code');
    return ta ? ta.value : paper.code;
  }

  // ---------- running the free response answer ----------

  /* Pyodide runs on the main thread, so a learner's `while True:` would freeze
     the tab with no way out but a refresh. The trace hook below charges every
     executed line against one budget for the whole paper and raises when it
     runs out, which turns a runaway program into a failed case in a bounded
     amount of time. The budget is shared rather than per case so a pathological
     answer cannot multiply the freeze by the number of cases.

     Every case is also wrapped on its own: a crash fails that case and grading
     carries on, because one exception must not zero a paper that would
     otherwise score. */
  var HARNESS = [
    'import json, sys',
    '',
    'class _PPTooLong(Exception):',
    '    pass',
    '',
    '_PP_LINE_BUDGET = 1000000',
    '_pp_lines = [0]',
    '',
    'def _pp_trace(frame, event, arg):',
    '    _pp_lines[0] += 1',
    '    if _pp_lines[0] > _PP_LINE_BUDGET:',
    '        raise _PPTooLong()',
    '    return _pp_trace',
    '',
    'def _pp_too_long(exc):',
    '    return isinstance(exc, _PPTooLong)',
    '',
    'def _pp_describe(exc):',
    '    if isinstance(exc, _PPTooLong):',
    '        return "your program ran too long"',
    '    text = str(exc)',
    '    name = type(exc).__name__',
    '    return name + ": " + text if text else name',
    '',
    'def _pp_call(fn, args):',
    '    sys.settrace(_pp_trace)',
    '    try:',
    '        return fn(*args)',
    '    finally:',
    '        sys.settrace(None)',
    '',
    'def _pp_grade(source, entry, cases):',
    '    _pp_lines[0] = 0',
    '    results = []',
    '',
    '    # input() would open a blocking browser prompt in the middle of',
    '    # grading, so it is shadowed for the answer module only.',
    '    def _pp_no_input(prompt=""):',
    '        raise RuntimeError("input() is not available in a test")',
    '',
    '    ns = {"__name__": "__pypath_answer__", "input": _pp_no_input}',
    '    try:',
    '        _pp_call(lambda: exec(compile(source, "<answer>", "exec"), ns), [])',
    '    except BaseException as exc:',
    '        why = _pp_describe(exc)',
    '        return [{"ok": False, "error": why, "got": None} for _ in cases]',
    '',
    '    fn = ns.get(entry)',
    '    if not callable(fn):',
    '        why = "no function named " + str(entry) + " was defined"',
    '        return [{"ok": False, "error": why, "got": None} for _ in cases]',
    '',
    '    for case in cases:',
    '        args = case.get("args") or []',
    '        expect = case.get("expect")',
    '        record = {"ok": False, "error": None, "got": None}',
    '        try:',
    '            got = _pp_call(fn, args)',
    '            record["got"] = repr(got)',
    '            record["ok"] = bool(got == expect)',
    '        except BaseException as exc:',
    '            record["error"] = _pp_describe(exc)',
    '        results.append(record)',
    '    return results',
    ''
  ].join('\n');

  var harnessInstalled = false;

  function failAllCases(cases, why) {
    return cases.map(function () {
      return { ok: false, error: why, got: null };
    });
  }

  function runFrq(frq, source) {
    var cases = (frq && frq.cases) || [];
    if (!cases.length) return Promise.resolve([]);
    if (!window.Pyodide) {
      return Promise.resolve(failAllCases(cases, 'the Python runtime could not load'));
    }

    return window.Pyodide.ensureReady().then(function (pyodide) {
      if (!harnessInstalled) {
        pyodide.runPython(HARNESS);
        harnessInstalled = true;
      }
      // A chatty answer would otherwise keep growing the shared capture buffer
      // across retakes.
      try { pyodide.runPython('stdout_capture.reset(); stderr_capture.reset()'); }
      catch (e) {}

      pyodide.globals.set('_pp_src', String(source || ''));
      pyodide.globals.set('_pp_entry', String(frq.entry || ''));
      pyodide.globals.set('_pp_cases', JSON.stringify(cases));

      var raw = pyodide.runPython(
        'json.dumps(_pp_grade(_pp_src, _pp_entry, json.loads(_pp_cases)))'
      );
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length === cases.length
        ? parsed
        : failAllCases(cases, 'the grader could not run your answer');
    }).catch(function (err) {
      return failAllCases(cases, 'the Python runtime could not load');
    });
  }

  // ---------- grading and the result ----------

  function submit(event) {
    if (event) event.preventDefault();
    if (grading) return;
    grading = true;

    var btn = $('ut-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Grading...';
    }
    notice('Running your answer. This can take a moment the first time, while Python loads.', 'busy');

    var source = currentCode();
    paper.code = source;

    runFrq(paper.frq, source).then(function (caseResults) {
      var passedCases = caseResults.filter(function (c) { return c && c.ok; }).length;
      var mcqCorrect = T.scoreMcq(paper.mcq, paper.answers);
      var scored = T.scoreAttempt({
        mcqCorrect: mcqCorrect,
        frqCasesPassed: passedCases,
        frqCasesTotal: caseResults.length
      });

      var at = Date.now();

      note('test.submitted', {
        unit: unit,
        score: scored.total,
        total: 100,
        attempt: (readRecords()[String(unit)] || {}).attempts + 1 || 1,
        // Clamped by the sanitizer, so a tab left open over a weekend cannot
        // report a two-day test.
        durationSec: startedAt ? Math.round((at - startedAt) / 1000) : 0
      });

      var finished = persist({
        score: scored.total,
        mcqCorrect: mcqCorrect,
        frqId: paper.frq ? paper.frq.id : '',
        frqCasesPassed: passedCases,
        frqCasesTotal: caseResults.length,
        at: at
      });

      clearAttempt(unit);
      renderResult(scored, mcqCorrect, caseResults, finished);
    }).catch(function () {
      notice('Something went wrong while grading. Your answers are still here, so try submitting again.', 'error');
    }).then(function () {
      grading = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Submit the paper';
      }
    });
  }

  // Returns whether the unit is now finished, which is not the same as whether
  // the test was passed: the lessons have to be done too, and a learner can
  // reach the test without having worked through them.
  function persist(attempt) {
    var records = readRecords();
    records[String(unit)] = mergeAttempt(records[String(unit)], attempt);
    writeRecords(records);

    if (!records[String(unit)].passed) return false;

    // Finishing the test is the last thing a unit needs, and it does not
    // happen on a lesson page, so the roll-up has to be nudged from here.
    var LP = window.PyPathLessonProgress;
    if (LP && LP.rollUpUnitNumber) LP.rollUpUnitNumber(unit);

    var s = store();
    return !!s && s.getCompletedUnits().indexOf(unit) !== -1;
  }

  function renderReview(caseResults) {
    var host = $('ut-result');

    var mcqHead = el('h3', 'ut-review__heading', 'Multiple choice review');
    host.appendChild(mcqHead);

    var list = el('ol', 'ut-review');
    paper.mcq.forEach(function (q, qi) {
      var given = paper.answers[qi];
      var right = given !== null && Number(given) === Number(q.answer);
      var item = el('li', 'ut-review__item ' + (right ? 'is-correct' : 'is-wrong'));

      item.appendChild(el('p', 'ut-review__prompt', q.prompt));
      if (typeof q.code === 'string' && q.code) item.appendChild(renderCode(q.code));

      var yours = given === null || given === undefined
        ? 'You skipped this one.'
        : 'Your answer: ' + (q.choices || [])[given];
      item.appendChild(el('p', 'ut-review__yours', yours));
      if (!right) {
        item.appendChild(el('p', 'ut-review__answer', 'Correct answer: ' + (q.choices || [])[q.answer]));
      }
      if (q.explain) item.appendChild(el('p', 'ut-review__explain', q.explain));
      list.appendChild(item);
    });
    host.appendChild(list);

    if (!paper.frq) return;
    host.appendChild(el('h3', 'ut-review__heading', 'Free response review'));

    var table = el('table', 'ut-cases ut-cases--result');
    var thead = el('thead');
    var hr = el('tr');
    ['Call', 'Expected', 'Result'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    (paper.frq.cases || []).forEach(function (c, i) {
      var r = caseResults[i] || { ok: false, error: 'not run', got: null };
      var row = el('tr', r.ok ? 'is-pass' : 'is-fail');

      var call = el('td', 'ut-case__call', formatCall(paper.frq.entry, c.args));
      if (c.hidden === true) {
        call.appendChild(document.createTextNode(' '));
        call.appendChild(el('span', 'ut-case__tag', 'hidden'));
      }
      row.appendChild(call);
      row.appendChild(el('td', 'ut-case__expect', formatArg(c.expect)));

      var got = r.error ? r.error : (r.got === null || r.got === undefined ? '' : r.got);
      var cell = el('td', 'ut-case__got');
      cell.appendChild(el('span', 'ut-case__verdict', r.ok ? 'Passed' : 'Failed'));
      if (got) {
        cell.appendChild(document.createTextNode(' '));
        cell.appendChild(el('span', 'ut-case__detail', got));
      }
      row.appendChild(cell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function verdictText(scored, finished) {
    if (!scored.passed) {
      return 'You did not pass this time. You need ' + T.PASS_MARK +
        ' to move on, so take it again when you are ready.';
    }
    // Passing the test is only half of finishing a unit. Telling a learner the
    // next unit is open when their lessons are still outstanding would send
    // them to a page the lock notice then turns them away from.
    return finished
      ? 'You passed. Unit ' + unit + ' is signed off and the next unit is open.'
      : 'You passed the test. Finish the remaining Unit ' + unit +
        ' lessons and the unit is signed off.';
  }

  function renderResult(scored, mcqCorrect, caseResults, finished) {
    notice('');
    show($('ut-paper'), false);
    show($('ut-intro'), false);

    var host = $('ut-result');
    host.textContent = '';
    host.className = 'ut-result ' + (scored.passed ? 'is-pass' : 'is-fail');

    host.appendChild(el('h2', 'ut-score', scored.total + ' out of 100'));
    host.appendChild(el('p', 'ut-verdict', verdictText(scored, finished)));

    var split = el('ul', 'ut-split');
    var mcqLine = el('li', null, 'Multiple choice: ' + scored.mcqPoints + ' of ' +
      (T.MCQ_COUNT * T.MCQ_WEIGHT) + ' points, ' + mcqCorrect + ' of ' + paper.mcq.length + ' correct');
    split.appendChild(mcqLine);
    var passedCases = caseResults.filter(function (c) { return c && c.ok; }).length;
    split.appendChild(el('li', null, 'Free response: ' + scored.frqPoints + ' of ' + T.FRQ_WEIGHT +
      ' points, ' + passedCases + ' of ' + caseResults.length + ' cases passed'));
    host.appendChild(split);

    var actions = el('div', 'ut-actions');
    var retake = el('button', 'btn btn-primary', 'Take the test again');
    retake.type = 'button';
    retake.addEventListener('click', function () {
      clearAttempt(unit);
      rollPaper();
      startPaper();
      window.scrollTo(0, 0);
    });
    actions.appendChild(retake);

    var back = el('a', 'btn btn-ghost route', 'Back to Unit ' + unit);
    back.href = '/units/unit-' + unit + '.html';
    actions.appendChild(back);
    host.appendChild(actions);

    renderReview(caseResults);
    show(host, true);
  }

  // ---------- flow ----------

  function startPaper() {
    // The gate again, at the moment of action. renderIntro already hides the
    // button, but the policy can land between a page render and a click, and a
    // stale button must not be a way through.
    if (blockedReason()) {
      renderIntro();
      return;
    }
    show($('ut-intro'), false);
    show($('ut-result'), false);
    notice('');
    renderMcq();
    renderFrq();
    show($('ut-paper'), true);
    startedAt = Date.now();
    note('test.started', { unit: unit });
  }

  function renderIntro() {
    var records = readRecords();
    var record = records[String(unit)] || null;
    var best = $('ut-best');
    if (best) {
      if (record && record.attempts) {
        best.textContent = 'Your best so far is ' + record.best + ' out of 100, over ' +
          record.attempts + (record.attempts === 1 ? ' attempt.' : ' attempts.');
        best.hidden = false;
      } else {
        best.hidden = true;
      }
    }

    paintRetakeLine();

    // The button goes rather than greys out. A disabled Start promises that
    // something is about to become available, and neither of these reasons
    // resolves itself by waiting on this page.
    var reason = blockedReason();
    var gate = $('ut-gate');
    if (gate) {
      gate.textContent = reason || '';
      gate.hidden = !reason;
    }
    show($('ut-start-row'), !reason);

    show($('ut-intro'), true);
  }

  function boot() {
    unit = unitFromQuery();

    var title = $('ut-title');
    var eyebrow = $('ut-eyebrow');

    if (unit === null) {
      if (title) title.textContent = 'End of unit test';
      renderPicker();
      return;
    }

    if (eyebrow) {
      eyebrow.textContent = 'Unit ' + unit;
      eyebrow.hidden = false;
    }
    if (title) title.textContent = 'Unit ' + unit + ' test';
    document.title = 'Unit ' + unit + ' test • PyPath';

    notice('Loading the test...', 'busy');

    Promise.all([fetchPool('mcq'), fetchPool('frq')]).then(function (loaded) {
      pools.mcq = loaded[0];
      pools.frq = loaded[1];
      if (pools.mcq.length < T.MCQ_COUNT || !pools.frq.length) {
        throw new Error('pool too small');
      }
      notice('');

      // A paper left half finished in this tab is not a way past the gate: a
      // unit that closed, or a limit reached on another device, has to hold
      // here too.
      var saved = blockedReason() ? null : readAttempt(unit);
      if (saved && restorePaper(saved)) {
        startPaper();
        notice('Picking up the paper you already started.', 'info');
        return;
      }
      clearAttempt(unit);
      renderIntro();
    }).catch(function () {
      // Honest and specific: the questions for this unit are not published
      // yet, or the fetch failed. Either way there is nothing to sit.
      notice('This test is not ready yet. Please check back soon.', 'error');
      show($('ut-intro'), false);
      show($('ut-paper'), false);
    });

    var start = $('ut-start');
    if (start) {
      start.addEventListener('click', function () {
        rollPaper();
        startPaper();
      });
    }
    var form = $('ut-paper');
    if (form) form.addEventListener('submit', submit);
  }

  /* The class's settings arrive one read after sign-in, which is after this
     page has already drawn its intro. Redraw when they land -- but only the
     intro, and never over a paper in progress: taking the questions off the
     screen mid-sitting because a policy read completed would lose work the
     learner is in the middle of, and the gate is checked again at submit time
     through the same rules that would refuse it server-side. */
  document.addEventListener('pypath:policy', function (e) {
    classPolicy = (e && e.detail && e.detail.policy) || null;
    var intro = $('ut-intro');
    if (unit !== null && intro && !intro.hidden) renderIntro();
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.body || !document.body.classList.contains('page-unit-test')) return;
    if (window.Pyodide && window.Pyodide.scheduleWarmup) window.Pyodide.scheduleWarmup();
    boot();
  });
})();
