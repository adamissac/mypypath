(function () {
  'use strict';

  var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
  var STDOUT_SETUP = [
    'from io import StringIO',
    'import sys',
    '',
    'def _pypath_input(prompt=""):',
    '    import js',
    '    return js.prompt(prompt or "") or ""',
    '',
    'import builtins',
    'builtins.input = _pypath_input',
    '',
    'class OutputCapture:',
    '    def __init__(self):',
    '        self.buffer = StringIO()',
    '    def write(self, s):',
    '        self.buffer.write(s)',
    '    def getvalue(self):',
    '        return self.buffer.getvalue()',
    '    def reset(self):',
    '        self.buffer = StringIO()',
    '',
    'stdout_capture = OutputCapture()',
    'stderr_capture = OutputCapture()',
    'sys.stdout = stdout_capture',
    'sys.stderr = stderr_capture'
  ].join('\n');

  var scriptPromise = null;
  var readyPromise = null;

  /* ── Boot console ──────────────────────────────────────────────
     Terminal-style lines rendered into registered runner output
     panels, tied to real load events (not timers):
       line 1 — ensureReady() actually starts (script fetch begins)
       line 2 — interpreter instantiated (loadPyodide() resolved)
       line 3 — stdout capture installed, runtime ready
     Pyodide 0.24.1 ships CPython 3.11, hence the version string.
     A ~400ms minimum display stops the sequence flashing when the
     runtime is already cached. */
  var BOOT_MIN_DISPLAY = 400;
  var bootPanels = [];
  var bootPhase = 'idle'; // idle | booting | interp | ready | error
  var bootError = null;
  var bootStartedAt = 0;

  function bootLine(text, cls) {
    return '<span class="pp-line' + (cls ? ' ' + cls : '') + '">' + text + '</span>';
  }

  function bootMarkup(phase, err) {
    var html = bootLine('Booting Python 3.11 ...');
    if (phase === 'interp' || phase === 'ready') {
      html += bootLine('Loading interpreter ... <span class="pp-ok">✓</span>');
    }
    if (phase === 'ready') {
      html += bootLine('<span class="pp-ready">&gt;&gt;&gt; ready — press Run</span>');
    } else if (phase === 'error') {
      html += bootLine('Python couldn’t load — check your connection.', 'pp-err');
    } else {
      html += '<span class="pp-boot-caret"></span>';
    }
    return '<pre class="pp-boot-console">' + html + '</pre>' +
      (phase === 'error'
        ? '<button type="button" class="pp-boot-retry">Try again</button>'
        : '');
  }

  function paintPanel(el) {
    /* Only touch panels we own: either the idle placeholder is still
       up, or our own console is (a runner overwriting the panel with
       results takes it out of boot mode automatically). */
    if (bootPhase === 'idle') return;
    var owned = el.querySelector('.pp-boot-console') ||
      el.querySelector('.output-placeholder, .hero-live-output-hint') ||
      !el.firstElementChild;
    if (!owned) return;
    el.innerHTML = bootMarkup(bootPhase, bootError);
    var retry = el.querySelector('.pp-boot-retry');
    if (retry) {
      retry.addEventListener('click', function () {
        setBootPhase('booting');
        ensureReady().catch(function () {});
      });
    }
  }

  function paintAll() {
    bootPanels.forEach(paintPanel);
  }

  function setBootPhase(phase, err) {
    bootPhase = phase;
    bootError = err || null;
    if (phase === 'booting') bootStartedAt = Date.now();
    if (phase === 'ready') {
      var elapsed = Date.now() - bootStartedAt;
      if (elapsed < BOOT_MIN_DISPLAY) {
        window.setTimeout(paintAll, BOOT_MIN_DISPLAY - elapsed);
        /* Show the intermediate line for the interim */
        bootPhase = 'ready';
        bootPanels.forEach(function (el) {
          if (el.querySelector('.pp-boot-console') || el.querySelector('.output-placeholder, .hero-live-output-hint') || !el.firstElementChild) {
            el.innerHTML = bootMarkup('interp');
          }
        });
        return;
      }
    }
    paintAll();
  }

  function attachBootPanel(el) {
    if (!el || bootPanels.indexOf(el) !== -1) {
      if (el) paintPanel(el);
      return;
    }
    bootPanels.push(el);
    paintPanel(el);
  }

  function loadScript() {
    if (typeof window.loadPyodide === 'function' && !window.loadPyodide.__pypathStub) {
      return Promise.resolve();
    }
    if (!scriptPromise) {
      scriptPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = PYODIDE_URL;
        s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () {
          // Drop the cached rejection so a retry can attempt a fresh load
          scriptPromise = null;
          if (s.parentNode) s.parentNode.removeChild(s);
          reject(new Error('Failed to load Pyodide'));
        };
        document.head.appendChild(s);
      });
    }
    return scriptPromise;
  }

  function ensureReady() {
    if (window.pyodideReady && window.pyodide) {
      return Promise.resolve(window.pyodide);
    }
    if (!readyPromise) {
      setBootPhase('booting');
      readyPromise = loadScript()
        .then(function () { return window.loadPyodide(); })
        .then(function (pyodide) {
          setBootPhase('interp');
          window.pyodide = pyodide;
          pyodide.runPython(STDOUT_SETUP);
          window.pyodideReady = true;
          setBootPhase('ready');
          return pyodide;
        })
        .catch(function (err) {
          readyPromise = null;
          setBootPhase('error', err);
          throw err;
        });
    }
    return readyPromise;
  }

  function scheduleWarmup() {
    var run = function () { ensureReady().catch(function () {}); };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 5000 });
    } else {
      setTimeout(run, 2000);
    }
    return ensureReady;
  }

  function runCode(source) {
    return ensureReady().then(function (pyodide) {
      pyodide.runPython('stdout_capture.reset(); stderr_capture.reset()');
      var result = { stdout: '', stderr: '', error: null };
      try {
        pyodide.runPython(source);
      } catch (err) {
        result.error = err;
      }
      result.stdout = pyodide.runPython('stdout_capture.getvalue()') || '';
      result.stderr = pyodide.runPython('stderr_capture.getvalue()') || '';
      return result;
    });
  }

  window.Pyodide = {
    ensureReady: ensureReady,
    scheduleWarmup: scheduleWarmup,
    runCode: runCode,
    attachBootPanel: attachBootPanel,
    RUN_LABEL: 'Run',
    OUTPUT_HINT: 'Press Run to see output'
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('.code-editor-small, [data-run-code], .run-code-btn, #code-editor, #hero-editor-code')) {
      scheduleWarmup();
    }
  });
})();
