/* PyPath — the "Check my work" button on an exercise that has authored tests.
 *
 * Renders next to the existing Check Answer button rather than replacing it.
 * The two answer different questions: Check Answer compares against a sample
 * solution, this one runs the code against real cases and says which passed.
 *
 * Everything here is additive and fails quiet. A lesson with no check file
 * gets no button, a browser that cannot reach the file gets no button, and in
 * both cases the page behaves exactly as it did before.
 */
(function () {
  'use strict';

  // storage-keys.js owns this prefix and the sync allowlist that matches it;
  // the literal is only a fallback for the degraded case where that script
  // failed to load, matching what progress-store.js and lesson-runner.js do.
  var BEST_PREFIX = (window.PyPathKeys && window.PyPathKeys.CHECKS_PREFIX)
    || 'pypath-checks-';

  var attempts = {};
  var specs = null;

  function note(type, payload) {
    if (!window.PyPathEvents) return;
    try { window.PyPathEvents.record(type, payload); } catch (e) {}
  }

  function lessonPath() {
    try { return location.pathname; } catch (e) { return ''; }
  }

  /* /units/unit-3/return-statements.html -> assets/data/checks/unit-3/return-statements.json */
  function specUrl() {
    var m = /^\/units\/(unit-\d+)\/([a-z0-9-]+)\.html$/.exec(lessonPath());
    return m ? '/assets/data/checks/' + m[1] + '/' + m[2] + '.json' : null;
  }

  function loadSpecs() {
    var url = specUrl();
    if (!url) return Promise.resolve(null);
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function codeFor(editorId) {
    var editor = window.editors && window.editors[editorId];
    if (editor) return editor.getValue();
    var ta = document.getElementById('editor-' + editorId);
    return ta ? ta.value : '';
  }

  /* Best result only ever improves. A student who passed four of five and then
     broke their code keeps the four: the record is what they demonstrated, and
     a teacher looking at it wants their high-water mark, not their last
     keystroke. */
  function recordBest(exerciseId, result) {
    if (!window.ProgressStore) return;
    var key = BEST_PREFIX + lessonPath();
    var all = {};
    try { all = JSON.parse(window.ProgressStore.getItem(key) || '{}') || {}; } catch (e) { all = {}; }
    var prev = all[exerciseId];
    if (prev && Number(prev.passed) >= result.passed) return;
    all[exerciseId] = {
      passed: result.passed,
      total: result.total,
      at: Date.now(),
      schemaVersion: window.PyPathSchema ? window.PyPathSchema.SCHEMA_VERSION : 1
    };
    window.ProgressStore.setItem(key, JSON.stringify(all));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Status is never carried by colour alone: every row leads with a mark and
     a word, so the result survives a colourblind reader, a greyscale print,
     and a screenshot pasted into a message. */
  function renderResult(panel, result, spec) {
    panel.innerHTML = '';

    var heading = el('p', 'check-summary');
    heading.textContent = result.allPassed
      ? 'All ' + result.total + ' checks passed.'
      : 'Passed ' + result.passed + ' of ' + result.total + ' checks.';
    panel.appendChild(heading);

    if (result.timedOut) {
      panel.appendChild(el(
        'p', 'check-note',
        'Your code took too long to finish. Check for a loop that never ends.'
      ));
    }

    var list = el('ul', 'check-list');
    var visible = (spec.cases || []);
    visible.forEach(function (testCase) {
      var failure = result.failures.filter(function (f) {
        return f.name === testCase.name;
      })[0];
      var row = el('li', 'check-row ' + (failure ? 'is-fail' : 'is-pass'));
      row.appendChild(el('span', 'check-mark', failure ? '✕' : '✓'));
      row.appendChild(el('span', 'check-state', failure ? 'Failed' : 'Passed'));
      row.appendChild(el('span', 'check-name', testCase.name));
      if (failure) {
        var detail = el('span', 'check-detail');
        detail.textContent = 'expected ' + failure.expected + ', got ' + failure.actual;
        row.appendChild(detail);
      }
      list.appendChild(row);
    });
    panel.appendChild(list);

    // Hidden cases are reported as a count and never by name. Naming one hands
    // back the input it was withholding, which is the entire point of it.
    if (result.hiddenTotal) {
      panel.appendChild(el(
        'p', 'check-note',
        'Hidden checks: ' + result.hiddenPassed + ' of ' + result.hiddenTotal + ' passed.'
      ));
    }

    if (result.hint) {
      var hint = el('p', 'check-hint');
      hint.appendChild(el('strong', null, 'Hint: '));
      hint.appendChild(document.createTextNode(result.hint));
      panel.appendChild(hint);
    }

    panel.hidden = false;
  }

  function attach(container, exerciseId, spec) {
    var toolbar = container.querySelector('.editor-toolbar-small');
    if (!toolbar || toolbar.querySelector('.btn-check-work')) return;

    var button = el('button', 'btn-check-work', 'Check my work');
    button.type = 'button';

    var panel = el('div', 'check-results');
    panel.hidden = true;
    // Results replace each other as the student retries, so a screen reader
    // is told about the new ones rather than left on the old.
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');

    button.addEventListener('click', function () {
      var code = codeFor(exerciseId);
      if (!code.trim()) {
        panel.innerHTML = '';
        panel.appendChild(el('p', 'check-note', 'Write some code first, then check it.'));
        panel.hidden = false;
        return;
      }

      attempts[exerciseId] = (attempts[exerciseId] || 0) + 1;
      button.disabled = true;
      var previousLabel = button.textContent;
      button.textContent = 'Checking...';

      window.PyPathChecker.run(code, spec, attempts[exerciseId])
        .then(function (result) {
          renderResult(panel, result, spec);
          recordBest(exerciseId, result);
          note('code.tests_passed', {
            lessonPath: lessonPath(),
            editorId: exerciseId,
            passed: result.passed,
            total: result.total
          });
          if (result.errorType) {
            note('code.error', {
              lessonPath: lessonPath(),
              editorId: exerciseId,
              errorType: result.errorType
            });
          }
        })
        .catch(function () {
          panel.innerHTML = '';
          panel.appendChild(el(
            'p', 'check-note',
            'Python is still loading. Give it a moment and try again.'
          ));
          panel.hidden = false;
        })
        .then(function () {
          button.disabled = false;
          button.textContent = previousLabel;
        });
    });

    toolbar.appendChild(button);
    var output = container.querySelector('.editor-output');
    if (output && output.parentNode) output.parentNode.insertBefore(panel, output.nextSibling);
    else container.appendChild(panel);
  }

  function init() {
    if (!window.PyPathChecker) return;
    loadSpecs().then(function (loaded) {
      if (!loaded) return;
      specs = loaded;
      document.querySelectorAll('.interactive-editor[data-editor-id]').forEach(function (container) {
        var id = container.getAttribute('data-editor-id');
        var spec = specs[id];
        if (spec && (spec.cases || []).length) attach(container, id, spec);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PyPathCheckUI = { BEST_PREFIX: BEST_PREFIX, specUrl: specUrl, renderResult: renderResult };
})();
