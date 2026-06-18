/* PyPath — live hero editor (Pyodide) */
(function () {
  'use strict';

  var DEFAULT_CODE = [
    'for i in range(1, 6):',
    '    print("▸" * i)'
  ].join('\n');

  function prefersReducedMotion() {
    return document.documentElement.classList.contains('reduced-motion') ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function setOutput(el, html, animate) {
    el.innerHTML = html;
    el.classList.remove('is-active');
    if (animate && !prefersReducedMotion()) {
      void el.offsetWidth;
      el.classList.add('is-active');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var codeEl = document.getElementById('hero-editor-code');
    var outputEl = document.getElementById('hero-editor-output');
    var runBtn = document.getElementById('hero-run-btn');
    var caret = document.querySelector('.hero-live-caret');
    var wrap = document.querySelector('.hero-live-code-wrap');

    if (!codeEl || !outputEl || !runBtn) return;

    if (!codeEl.value.trim()) {
      codeEl.value = DEFAULT_CODE;
    }

    if (window.Pyodide) {
      window.Pyodide.scheduleWarmup();
    }

    if (window.PyIcons) {
      var icon = window.PyIcons.el('play', 16);
      runBtn.insertBefore(icon, runBtn.firstChild);
    }

    function setCaretVisible(show) {
      if (caret) caret.classList.toggle('is-hidden', !show);
    }

    codeEl.addEventListener('focus', function () { setCaretVisible(false); });
    codeEl.addEventListener('blur', function () {
      setCaretVisible(!codeEl.value.trim() && document.activeElement !== codeEl);
    });

    if (wrap && caret && !prefersReducedMotion()) {
      setCaretVisible(!codeEl.value.trim() && document.activeElement !== codeEl);
      codeEl.addEventListener('input', function () {
        setCaretVisible(!codeEl.value.trim() && document.activeElement !== codeEl);
      });
    } else if (caret) {
      caret.classList.add('is-hidden');
    }

    async function runCode() {
      var code = codeEl.value;
      if (!code.trim()) {
        setOutput(outputEl, '<span class="hero-live-output-hint">Write some Python, then press Run.</span>', false);
        return;
      }

      runBtn.disabled = true;
      runBtn.setAttribute('aria-busy', 'true');
      setOutput(outputEl, '<span class="hero-live-output-loading">Loading Python…</span>', false);

      try {
        if (!window.Pyodide) throw new Error('Python runtime unavailable');
        await window.Pyodide.ensureReady();

        setOutput(outputEl, '<span class="hero-live-output-loading">Running…</span>', false);
        window.pyodide.runPython('stdout_capture.reset(); stderr_capture.reset()');
        window.pyodide.runPython(code);
        var stdout = window.pyodide.runPython('stdout_capture.getvalue()');
        var stderr = window.pyodide.runPython('stderr_capture.getvalue()');

        if (stderr) {
          setOutput(outputEl, '<pre class="hero-live-output-error">' + escapeHtml(stderr) + '</pre>', true);
        } else if (stdout) {
          setOutput(outputEl, '<pre class="hero-live-output-text">' + escapeHtml(stdout) + '</pre>', true);
        } else {
          setOutput(outputEl, '<span class="hero-live-output-hint">Finished — no output printed.</span>', true);
        }
      } catch (err) {
        setOutput(outputEl, '<pre class="hero-live-output-error">' + escapeHtml(String(err)) + '</pre>', true);
      } finally {
        runBtn.disabled = false;
        runBtn.removeAttribute('aria-busy');
      }
    }

    runBtn.addEventListener('click', runCode);

    codeEl.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
      }
    });
  });
})();
