(function () {
  'use strict';

  var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
  var STDOUT_SETUP = [
    'from io import StringIO',
    'import sys',
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
        s.onerror = function () { reject(new Error('Failed to load Pyodide')); };
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
      readyPromise = loadScript()
        .then(function () { return window.loadPyodide(); })
        .then(function (pyodide) {
          window.pyodide = pyodide;
          pyodide.runPython(STDOUT_SETUP);
          window.pyodideReady = true;
          return pyodide;
        })
        .catch(function (err) {
          readyPromise = null;
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

  window.Pyodide = {
    ensureReady: ensureReady,
    scheduleWarmup: scheduleWarmup
  };
})();
