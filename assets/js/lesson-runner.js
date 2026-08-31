/* PyPath — shared lesson code editor + Pyodide runner */
(function () {
  'use strict';

  function storageKey(type, id) {
    return 'pypath-lesson-' + window.location.pathname + '-' + type + '-' + id;
  }

  function saveToStorage(type, id, value) {
    if (window.ProgressStore) window.ProgressStore.setItem(storageKey(type, id), value);
  }

  function loadFromStorage(type, id) {
    return window.ProgressStore ? window.ProgressStore.getItem(storageKey(type, id)) : null;
  }

  function clearStorage(type, id) {
    if (window.ProgressStore) window.ProgressStore.removeItem(storageKey(type, id));
  }

  // Default practice-editor source, captured before CodeMirror replaces textareas.
  window.editorDefaults = window.editorDefaults || {};

  var OUTPUT_HINT = (window.Pyodide && window.Pyodide.OUTPUT_HINT) || 'Press Run to see output';

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function editorIdFromButton(btn) {
    var root = btn.closest('[data-editor-id], [data-exercise-id]');
    if (!root) return null;
    return root.getAttribute('data-editor-id') || root.getAttribute('data-exercise-id');
  }

  function decodeJsStringBody(body) {
    return String(body || '')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  function defaultCodeFor(editorId, btn) {
    if (window.editorDefaults[editorId] != null && window.editorDefaults[editorId] !== '') {
      return window.editorDefaults[editorId];
    }
    var oc = (btn && btn.getAttribute('onclick')) || '';
    var m = oc.match(/^resetEditor\(\s*['"]([^'"]+)['"]\s*,\s*'([\s\S]*)'\s*\)$/);
    if (m) return decodeJsStringBody(m[2]);
    var ta = document.getElementById('editor-' + editorId);
    return ta ? ta.value : '';
  }

  function bindLessonButtons() {
    function idFromOnclick(btn, fnName) {
      var oc = btn.getAttribute('onclick') || '';
      var re = new RegExp('^' + fnName + '\\(\\s*[\\\'"]([^\\\'"]+)[\\\'"]');
      var m = oc.trim().match(re);
      if (m) return m[1];
      return editorIdFromButton(btn);
    }

    function markBound(btn) {
      if (btn.getAttribute('data-lesson-bound') === '1') return false;
      btn.setAttribute('data-lesson-bound', '1');
      return true;
    }

    // Bind by onclick text and standard classes so nonstandard button classes still work.
    document.querySelectorAll('button[onclick*="checkExercise("], .btn-check').forEach(function (btn) {
      var id = idFromOnclick(btn, 'checkExercise') || editorIdFromButton(btn);
      if (!id || !markBound(btn)) return;
      btn.removeAttribute('onclick');
      btn.addEventListener('click', function () { window.checkExercise(id); });
    });

    document.querySelectorAll('button[onclick*="showSolution("], .btn-solution').forEach(function (btn) {
      var id = idFromOnclick(btn, 'showSolution') || editorIdFromButton(btn);
      if (!id || !markBound(btn)) return;
      btn.removeAttribute('onclick');
      btn.addEventListener('click', function () { window.showSolution(id); });
    });

    document.querySelectorAll('button[onclick*="runEditorCode("], .btn-run').forEach(function (btn) {
      var id = idFromOnclick(btn, 'runEditorCode') || editorIdFromButton(btn);
      if (!id || !markBound(btn)) return;
      btn.removeAttribute('onclick');
      btn.addEventListener('click', function () { window.runEditorCode(id); });
    });

    document.querySelectorAll('button[onclick*="clearSaved("], .btn-clear').forEach(function (btn) {
      var id = idFromOnclick(btn, 'clearSaved') || editorIdFromButton(btn);
      if (!id || !markBound(btn)) return;
      btn.removeAttribute('onclick');
      btn.addEventListener('click', function () { window.clearSaved(id); });
    });

    document.querySelectorAll(
      'button[onclick*="resetExercise("], button[onclick*="resetEditor("], .btn-reset'
    ).forEach(function (btn) {
      var oc = btn.getAttribute('onclick') || '';
      var isExerciseReset = /resetExercise\s*\(/.test(oc) ||
        (!/resetEditor\s*\(/.test(oc) && !!btn.closest('[data-exercise-id]'));
      var id = idFromOnclick(btn, isExerciseReset ? 'resetExercise' : 'resetEditor') || editorIdFromButton(btn);
      if (!id || !markBound(btn)) return;
      var practiceDefault = isExerciseReset ? '' : defaultCodeFor(id, btn);
      btn.removeAttribute('onclick');
      if (isExerciseReset) {
        btn.addEventListener('click', function () { window.resetExercise(id); });
      } else {
        btn.addEventListener('click', function () { window.resetEditor(id, practiceDefault); });
      }
    });
  }

  async function ensurePyodide() {
    if (!window.Pyodide) throw new Error('Python runtime not available');
    await window.Pyodide.ensureReady();
    return window.pyodide;
  }

  function renderRunOutput(outputEl, result) {
    if (result.error) {
      var msg = result.error && result.error.toString ? result.error.toString() : String(result.error);
      outputEl.innerHTML = '<div class="output-error">' + escapeHtml(msg).replace(/\n/g, '<br>') + '</div>';
      return;
    }
    if (result.stderr) {
      outputEl.innerHTML = '<div class="output-error">' + escapeHtml(result.stderr).replace(/\n/g, '<br>') + '</div>';
      return;
    }
    if (result.stdout) {
      outputEl.innerHTML = '<pre>' + escapeHtml(result.stdout) + '</pre>';
      return;
    }
    outputEl.innerHTML = '<div class="output-placeholder">Code executed successfully (no output)</div>';
  }

  /* The classroom event log, when there is one. Every call below is a no-op
     for a guest and for a signed-in learner who has joined no class, which is
     what keeps the classroom feature from costing a lone learner anything. */
  function note(type, payload) {
    if (!window.PyPathEvents) return;
    try { window.PyPathEvents.record(type, payload); } catch (e) {}
  }

  function lessonPath() {
    try { return location.pathname; } catch (e) { return ''; }
  }

  /* A snapshot of one editor, taken on save and on run -- never on keystroke.
     Per-keystroke history would be a recording of someone thinking, which is
     both far more than a teacher needs and far more than a student would
     expect to be kept.

     Only stored for a learner whose work is mirrored to a class. A lone
     learner's editor history is nobody's business and is not written at all. */
  /* saveToStorage fires on every CodeMirror change, which is every keystroke.
     Snapshotting there would be a recording of someone thinking. This waits
     for typing to stop, so a snapshot marks a pause in the work rather than a
     keypress. */
  var SETTLE_MS = 3000;
  var settleTimers = {};

  function snapshotWhenSettled(editorId, getCode) {
    if (settleTimers[editorId]) window.clearTimeout(settleTimers[editorId]);
    settleTimers[editorId] = window.setTimeout(function () {
      settleTimers[editorId] = null;
      snapshot(editorId, getCode(), 'save');
    }, SETTLE_MS);
  }

  function snapshot(editorId, code, reason) {
    if (!window.PyPathSnapshots || !window.ProgressStore) return;
    if (!window.PyPathEvents || !window.PyPathEvents.isEnabled()) return;
    var key = (window.PyPathKeys ? window.PyPathKeys.SNAPSHOTS_PREFIX : 'pypath-snapshots-')
      + lessonPath();
    var current = {};
    try {
      current = JSON.parse(window.ProgressStore.getItem(key) || '{}') || {};
    } catch (e) {
      current = {};
    }
    var next = window.PyPathSnapshots.record(current, editorId, code, Date.now(), reason);
    try {
      window.ProgressStore.setItem(key, JSON.stringify(next));
    } catch (e) {}
  }

  function getSolutions() {
    return window.exerciseSolutions || {};
  }

  window.runEditorCode = async function (editorId) {
    var outputEl = document.getElementById('output-' + editorId);
    var editor = window.editors && window.editors[editorId];
    var code = editor
      ? editor.getValue()
      : ((document.getElementById('editor-' + editorId) || {}).value || '');

    if (!outputEl) return;

    if (!code.trim()) {
      outputEl.innerHTML = '<div class="output-placeholder">No code to run. Write some Python code first!</div>';
      return;
    }

    try {
      // Boot console owns the panel while the runtime loads; only show
      // "Running..." once Python is actually ready to execute.
      if (!window.pyodideReady && window.Pyodide && window.Pyodide.attachBootPanel) {
        window.Pyodide.attachBootPanel(outputEl);
        await window.Pyodide.ensureReady();
      }
      outputEl.innerHTML = '<div class="output-loading">Running...</div>';
      var result = await window.Pyodide.runCode(code);
      renderRunOutput(outputEl, result);

      var failed = !!(result && (result.error || result.stderr));
      snapshot(editorId, code, 'run');
      note('code.run', { lessonPath: lessonPath(), editorId: editorId, ok: !failed });
      if (failed) {
        note('code.error', {
          lessonPath: lessonPath(),
          editorId: editorId,
          // Class name only. errorClassOf drops the message, which quotes the
          // student's own source.
          errorType: window.PyPathEvents
            ? window.PyPathEvents.errorClassOf(result.error || result.stderr)
            : 'UnknownError'
        });
      }
    } catch (error) {
      outputEl.innerHTML = '<div class="output-error">' + escapeHtml(String(error)).replace(/\n/g, '<br>') + '</div>';
      note('code.run', { lessonPath: lessonPath(), editorId: editorId, ok: false });
      note('code.error', {
        lessonPath: lessonPath(),
        editorId: editorId,
        errorType: window.PyPathEvents
          ? window.PyPathEvents.errorClassOf(error)
          : 'UnknownError'
      });
    }
  };

  window.resetEditor = function (editorId, defaultCode) {
    var editor = window.editors && window.editors[editorId];
    if (editor) editor.setValue(defaultCode);
    else {
      var ta = document.getElementById('editor-' + editorId);
      if (ta) ta.value = defaultCode;
    }
    clearStorage('code', editorId);
    var output = document.getElementById('output-' + editorId);
    if (output) output.innerHTML = '<div class="output-placeholder">' + OUTPUT_HINT + '</div>';
  };

  window.clearSaved = function (editorId) {
    if (!confirm('Clear your saved code for this editor?')) return;
    clearStorage('code', editorId);
    var editor = window.editors && window.editors[editorId];
    if (editor) editor.setValue('');
  };

  window.checkExercise = async function (editorId) {
    var editor = window.editors && window.editors[editorId];
    var feedbackEl = document.getElementById('feedback-' + editorId);
    var outputEl = document.getElementById('output-' + editorId);

    if (!editor) {
      alert('Editor not found. Please refresh the page.');
      return;
    }
    if (!feedbackEl || !outputEl) {
      alert('Page elements not found. Please refresh the page.');
      return;
    }

    var code = editor.getValue().trim();
    if (!code) {
      feedbackEl.className = 'exercise-feedback show incorrect';
      feedbackEl.style.display = 'block';
      feedbackEl.innerHTML = '<h5>Please write some code first!</h5>';
      return;
    }

    var exercise = getSolutions()[editorId];
    if (!exercise) {
      alert('Exercise validation not found for ' + editorId);
      return;
    }

    outputEl.innerHTML = '<div class="output-loading">Checking your code...</div>';
    var output = { stdout: '', stderr: '', error: null };

    try {
      var runResult = await window.Pyodide.runCode(code);
      output.stdout = runResult.stdout || '';
      output.stderr = runResult.stderr || '';
      if (runResult.error) {
        output.error = runResult.error.toString ? runResult.error.toString() : String(runResult.error);
      } else if (output.stderr) {
        output.error = output.stderr;
      }
      renderRunOutput(outputEl, runResult);
    } catch (error) {
      output.error = String(error);
      outputEl.innerHTML = '<div class="output-error">' + escapeHtml(output.error).replace(/\n/g, '<br>') + '</div>';
    }

    var result = exercise.validator(code, output);
    feedbackEl.className = 'exercise-feedback show ' + (result.correct ? 'correct' : 'incorrect');
    feedbackEl.style.display = 'block';

    if (result.correct) {
      var okMsg = String(result.message || '').replace(/^\s*Correct!\s*/i, '');
      feedbackEl.innerHTML = '<h5>Correct!</h5>' + (okMsg ? '<p>' + escapeHtml(okMsg) + '</p>' : '');
    } else {
      var hintsHtml = '';
      if (result.hints && result.hints.length) {
        hintsHtml = '<ul>' + result.hints.map(function (h) { return '<li>' + escapeHtml(h) + '</li>'; }).join('') + '</ul>';
      }
      feedbackEl.innerHTML = '<h5>Not quite right</h5><p>' + escapeHtml(result.message) + '</p>' + hintsHtml;
    }
  };

  window.showSolution = function (editorId) {
    // Set by lesson-progress.js from the class policy. Checked here so a
    // button left over from an earlier paint cannot still act. Not a lock: the
    // solutions are in this page's own source either way, which is why the
    // teacher's setting says it removes the button rather than the answer.
    if (window.pyPathSolutionsAllowed === false) return;
    var exercise = getSolutions()[editorId];
    if (!exercise) { alert('Solution not found.'); return; }
    var editor = window.editors && window.editors[editorId];
    if (!editor) return;
    if (!confirm('Show the solution? This will replace your current code.')) return;
    editor.setValue(exercise.solution);
    var feedbackEl = document.getElementById('feedback-' + editorId);
    if (feedbackEl) {
      feedbackEl.className = 'exercise-feedback';
      feedbackEl.innerHTML = '';
      feedbackEl.style.display = 'none';
    }
  };

  window.resetExercise = function (editorId) {
    var editor = window.editors && window.editors[editorId];
    if (!editor) return;
    editor.setValue('');
    var outputEl = document.getElementById('output-' + editorId);
    var feedbackEl = document.getElementById('feedback-' + editorId);
    if (outputEl) outputEl.innerHTML = '<div class="output-placeholder">Write your code above and click "Check Answer" to verify it\'s correct.</div>';
    if (feedbackEl) {
      feedbackEl.className = 'exercise-feedback';
      feedbackEl.innerHTML = '';
      feedbackEl.style.display = 'none';
    }
  };

  function initEditors() {
    if (typeof CodeMirror === 'undefined') {
      setTimeout(initEditors, 50);
      return;
    }

    window.editors = window.editors || {};

    document.querySelectorAll('.code-editor-small').forEach(function (textarea) {
      var editorId = textarea.id.replace('editor-', '');
      if (window.editors[editorId]) return;

      var isExercise = textarea.closest('[data-exercise-id]');
      if (!isExercise && window.editorDefaults[editorId] == null) {
        window.editorDefaults[editorId] = textarea.value || '';
      }
      var saved = loadFromStorage('code', editorId);
      var initial = isExercise ? (saved || '') : (saved || textarea.value || '');

      window.editors[editorId] = CodeMirror.fromTextArea(textarea, {
        mode: 'python',
        theme: 'pypath',
        lineNumbers: true,
        indentUnit: 4,
        indentWithTabs: false,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        value: initial
      });

      window.editors[editorId].setSize(null, isExercise ? 180 : 150);
      window.editors[editorId].on('change', function () {
        saveToStorage('code', editorId, window.editors[editorId].getValue());
        snapshotWhenSettled(editorId, function () {
          return window.editors[editorId].getValue();
        });
      });

      window.editors[editorId].setOption('extraKeys', Object.assign({}, window.editors[editorId].getOption('extraKeys') || {}, {
        'Ctrl-Enter': function () { window.runEditorCode(editorId); },
        'Cmd-Enter': function () { window.runEditorCode(editorId); }
      }));
    });

    document.querySelectorAll('.reflection-input').forEach(function (textarea) {
      var saved = loadFromStorage('reflection', textarea.id);
      if (saved) textarea.value = saved;
      textarea.addEventListener('input', function () {
        saveToStorage('reflection', textarea.id, textarea.value);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.code-editor-small')) return;

    if (window.Pyodide) {
      window.Pyodide.scheduleWarmup();
      // Practice runners get the boot console; exercise panels keep
      // their "Check Answer" hint (different copy, different action).
      if (window.Pyodide.attachBootPanel) {
        document.querySelectorAll('.editor-output').forEach(function (el) {
          if (!el.closest('[data-exercise-id]')) window.Pyodide.attachBootPanel(el);
        });
      }
    }
    // Capture defaults before CodeMirror replaces textareas, then bind buttons
    // with addEventListener so Check/Show/Run/Reset keep working even if an
    // onclick attribute was corrupted by nested quotes.
    document.querySelectorAll('.code-editor-small').forEach(function (textarea) {
      var editorId = textarea.id.replace('editor-', '');
      if (!textarea.closest('[data-exercise-id]') && window.editorDefaults[editorId] == null) {
        window.editorDefaults[editorId] = textarea.value || '';
      }
    });
    bindLessonButtons();
    initEditors();

    // Once per page load. This is the event that makes "opened it and
    // struggled" distinguishable from "never opened it", which is the whole
    // reason the log exists.
    var unit = window.PyPathCurriculum
      ? window.PyPathCurriculum.unitOf(lessonPath())
      : null;
    if (unit) note('lesson.opened', { lessonPath: lessonPath(), unit: unit });

    document.addEventListener('themechange', function () {
      Object.keys(window.editors || {}).forEach(function (id) {
        window.editors[id].setOption('theme', 'pypath');
        window.editors[id].refresh();
      });
    });
  });
})();
