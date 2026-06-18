/* PyPath — live hero editor (Pyodide) */
(function () {
  'use strict';

  var DEFAULT_CODE = [
    'total = 0',
    '',
    'for i in range(1, 6):',
    '    print("▸" * i)',
    '    total += i',
    '',
    'print("Total markers:", total)'
  ].join('\n');

  var KEYWORDS = [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
  ];

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

  function highlightPython(code) {
    var out = '';
    var i = 0;

    function append(str) { out += str; }

    while (i < code.length) {
      var ch = code[i];
      var rest = code.slice(i);

      if (ch === '#') {
        var end = code.indexOf('\n', i);
        if (end === -1) end = code.length;
        append('<span class="tok-comment">' + escapeHtml(code.slice(i, end)) + '</span>');
        i = end;
        continue;
      }

      if (ch === '"' || ch === "'") {
        var q = ch;
        var j = i + 1;
        while (j < code.length) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === q) { j++; break; }
          j++;
        }
        append('<span class="tok-str">' + escapeHtml(code.slice(i, j)) + '</span>');
        i = j;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        var num = i;
        while (num < code.length && /[0-9.]/.test(code[num])) num++;
        append('<span class="tok-num">' + escapeHtml(code.slice(i, num)) + '</span>');
        i = num;
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) {
        var word = i;
        while (word < code.length && /[A-Za-z0-9_]/.test(code[word])) word++;
        var token = code.slice(i, word);
        var nextNonSpace = code.slice(word).match(/^\s*(\S)/);
        var isCall = nextNonSpace && nextNonSpace[1] === '(';
        if (KEYWORDS.indexOf(token) !== -1) {
          append('<span class="tok-kw">' + escapeHtml(token) + '</span>');
        } else if (isCall) {
          append('<span class="tok-fn">' + escapeHtml(token) + '</span>');
        } else if (token === 'print') {
          append('<span class="tok-builtin">' + escapeHtml(token) + '</span>');
        } else {
          append(escapeHtml(token));
        }
        i = word;
        continue;
      }

      append(escapeHtml(ch));
      i++;
    }

    return out;
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
    var highlightEl = document.getElementById('hero-editor-highlight');
    var outputEl = document.getElementById('hero-editor-output');
    var runBtn = document.getElementById('hero-run-btn');

    if (!codeEl || !outputEl || !runBtn) return;

    if (!codeEl.value.trim()) {
      codeEl.value = DEFAULT_CODE;
    }

    if (window.Pyodide) {
      window.Pyodide.scheduleWarmup();
    }

    if (window.PyIcons) {
      var icon = window.PyIcons.el('play', 15);
      runBtn.insertBefore(icon, runBtn.firstChild);
    }

    function syncHighlight() {
      if (!highlightEl) return;
      var code = codeEl.value;
      highlightEl.innerHTML = highlightPython(code) + '\n';
      syncHeight();
    }

    function syncHeight() {
      codeEl.style.height = 'auto';
      var height = Math.max(codeEl.scrollHeight, 148);
      codeEl.style.height = height + 'px';
    }

    syncHighlight();
    codeEl.addEventListener('input', syncHighlight);

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
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = codeEl.selectionStart;
        var end = codeEl.selectionEnd;
        codeEl.value = codeEl.value.slice(0, start) + '    ' + codeEl.value.slice(end);
        codeEl.selectionStart = codeEl.selectionEnd = start + 4;
        syncHighlight();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
      }
    });
  });
})();
