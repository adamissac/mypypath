/* PyPath — shared lesson code editor + Pyodide runner */
(function () {
  'use strict';

  function storageKey(type, id) {
    return 'pypath-lesson-' + window.location.pathname + '-' + type + '-' + id;
  }

  function saveToStorage(type, id, value) {
    try { localStorage.setItem(storageKey(type, id), value); } catch (e) {}
  }

  function loadFromStorage(type, id) {
    try { return localStorage.getItem(storageKey(type, id)); } catch (e) { return null; }
  }

  function clearStorage(type, id) {
    try { localStorage.removeItem(storageKey(type, id)); } catch (e) {}
  }

  async function ensurePyodide() {
    if (!window.Pyodide) throw new Error('Python runtime not available');
    await window.Pyodide.ensureReady();
    return window.pyodide;
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

    outputEl.innerHTML = '<div class="output-loading">Loading Python interpreter...</div>';

    try {
      await ensurePyodide();
      outputEl.innerHTML = '<div class="output-loading">Running...</div>';
      window.pyodide.runPython('stdout_capture.reset(); stderr_capture.reset()');
      window.pyodide.runPython(code);
      var stdout = window.pyodide.runPython('stdout_capture.getvalue()');
      var stderr = window.pyodide.runPython('stderr_capture.getvalue()');

      if (stderr) {
        outputEl.innerHTML = '<div class="output-error">' + stderr.replace(/\n/g, '<br>') + '</div>';
      } else if (stdout) {
        outputEl.innerHTML = '<pre>' + stdout + '</pre>';
      } else {
        outputEl.innerHTML = '<div class="output-placeholder">Code executed successfully (no output)</div>';
      }
    } catch (error) {
      outputEl.innerHTML = '<div class="output-error">' + String(error).replace(/\n/g, '<br>') + '</div>';
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
    if (output) output.innerHTML = '<div class="output-placeholder">Click "Run Code" to see your output here</div>';
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
      await ensurePyodide();
      window.pyodide.runPython('stdout_capture.reset(); stderr_capture.reset()');
      window.pyodide.runPython(code);
      output.stdout = window.pyodide.runPython('stdout_capture.getvalue()') || '';
      output.stderr = window.pyodide.runPython('stderr_capture.getvalue()') || '';
      if (output.stderr) {
        output.error = output.stderr;
        outputEl.innerHTML = '<div class="output-error">' + output.stderr.replace(/\n/g, '<br>') + '</div>';
      } else if (output.stdout) {
        outputEl.innerHTML = '<pre>' + output.stdout + '</pre>';
      } else {
        outputEl.innerHTML = '<div class="output-placeholder">Code executed (no output)</div>';
      }
    } catch (error) {
      output.error = String(error);
      outputEl.innerHTML = '<div class="output-error">' + output.error.replace(/\n/g, '<br>') + '</div>';
    }

    var result = exercise.validator(code, output);
    feedbackEl.className = 'exercise-feedback show ' + (result.correct ? 'correct' : 'incorrect');
    feedbackEl.style.display = 'block';

    if (result.correct) {
      feedbackEl.innerHTML = '<h5>Correct!</h5><p>' + result.message + '</p>';
    } else {
      var hintsHtml = '';
      if (result.hints && result.hints.length) {
        hintsHtml = '<ul>' + result.hints.map(function (h) { return '<li>' + h + '</li>'; }).join('') + '</ul>';
      }
      feedbackEl.innerHTML = '<h5>Not quite right</h5><p>' + result.message + '</p>' + hintsHtml;
    }
  };

  window.showSolution = function (editorId) {
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
      });
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

    if (window.Pyodide) window.Pyodide.scheduleWarmup();
    initEditors();

    document.addEventListener('themechange', function () {
      Object.keys(window.editors || {}).forEach(function (id) {
        window.editors[id].setOption('theme', 'pypath');
        window.editors[id].refresh();
      });
    });
  });
})();
