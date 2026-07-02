/* ============================================================
   LESSON FORMAT KIT — behavior
   Consolidated & simplified from the PyPath lesson pages:
     - theme (light/dark) toggle
     - mobile primary-nav toggle
     - lesson sidebar collapse (desktop) / overlay (mobile)
     - reading progress bar (auto-injected on lesson pages)
     - copy-to-clipboard buttons on code blocks
     - interactive code editors (CodeMirror + a pluggable "run")
     - exercise checker (pluggable validators)
     - reflection textarea autosave

   No build step, no dependencies required for the layout/format
   itself. CodeMirror + a code runner (e.g. Pyodide) are only
   needed if you use `.code-editor-small` / `.interactive-editor`.
   ============================================================ */
(function () {
  'use strict';

  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ----------------------------------------------------------
     Theme toggle (light/dark) — persisted in localStorage
     ---------------------------------------------------------- */
  var THEME_KEY = 'lesson-format-theme';

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    document.dispatchEvent(new CustomEvent('lessonformat:themechange', { detail: { theme: theme } }));
  }

  function initTheme() {
    var stored;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    applyTheme(stored || getSystemTheme());

    qsa('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    });
  }

  /* ----------------------------------------------------------
     Mobile primary nav toggle
     ---------------------------------------------------------- */
  function initMobileNav() {
    var toggle = document.querySelector('.mobile-toggle');
    var nav = document.querySelector('.primary-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function () {
      var open = nav.getAttribute('aria-expanded') === 'true';
      nav.setAttribute('aria-expanded', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }

  /* ----------------------------------------------------------
     Lesson sidebar: collapse on desktop, overlay on mobile
     ---------------------------------------------------------- */
  var SIDEBAR_MQ = window.matchMedia('(max-width: 980px)');
  var SIDEBAR_STORAGE_KEY = 'lesson-format-sidebar-closed';

  function isSidebarOpen() {
    if (SIDEBAR_MQ.matches) return document.body.classList.contains('sidebar-open');
    return !document.body.classList.contains('sidebar-closed');
  }

  function setSidebarOpen(open) {
    if (SIDEBAR_MQ.matches) {
      document.body.classList.toggle('sidebar-open', open);
      document.body.classList.remove('sidebar-closed');
    } else {
      document.body.classList.toggle('sidebar-closed', !open);
      document.body.classList.remove('sidebar-open');
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? '0' : '1'); } catch (e) {}
    }
    qsa('[data-sidebar-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Hide lesson menu' : 'Show lesson menu');
      if (btn.classList.contains('sidebar-toggle-btn')) {
        btn.textContent = open ? 'Hide lesson menu' : 'Show lesson menu';
      }
    });
    var reopenBtn = document.querySelector('.sidebar-reopen-btn');
    if (reopenBtn) reopenBtn.hidden = SIDEBAR_MQ.matches ? true : open;
  }

  function toggleSidebar() { setSidebarOpen(!isSidebarOpen()); }

  // Injects the collapse button (inside the sidebar) + the floating
  // reopen button (appended to <body>) so a lesson page only needs
  // to provide the raw <aside class="course-sidebar">...</aside> markup.
  function enhanceLessonSidebar() {
    var layout = document.querySelector('.layout-course');
    if (!layout) return;
    var sidebar = layout.querySelector('.course-sidebar');
    if (!sidebar || sidebar.querySelector('.sidebar-collapse-btn')) return;

    var collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'sidebar-collapse-btn';
    collapseBtn.setAttribute('data-sidebar-toggle', '');
    collapseBtn.setAttribute('aria-label', 'Hide lesson menu');
    collapseBtn.setAttribute('aria-expanded', 'true');
    collapseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18 9 12l6-6"/><path d="M4 6v12"/></svg>';

    var heading = sidebar.querySelector('.sidebar-unit-label') || sidebar.querySelector('h3');
    if (heading) {
      var head = document.createElement('div');
      head.className = 'sidebar-head';
      heading.parentNode.insertBefore(head, heading);
      head.appendChild(heading);
      head.appendChild(collapseBtn);
    } else {
      sidebar.insertBefore(collapseBtn, sidebar.firstChild);
    }

    if (!document.querySelector('.sidebar-reopen-btn')) {
      var reopenBtn = document.createElement('button');
      reopenBtn.type = 'button';
      reopenBtn.className = 'sidebar-reopen-btn';
      reopenBtn.setAttribute('data-sidebar-toggle', '');
      reopenBtn.setAttribute('aria-label', 'Show lesson menu');
      reopenBtn.setAttribute('aria-expanded', 'false');
      reopenBtn.hidden = true;
      reopenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/><path d="M20 6v12"/></svg><span>Lessons</span>';
      document.body.appendChild(reopenBtn);
    }

    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (SIDEBAR_MQ.matches) setSidebarOpen(false);
      });
    });
  }

  function initSidebarToggle() {
    enhanceLessonSidebar();
    if (!document.querySelector('.layout-course')) return;

    var storedClosed = false;
    try { storedClosed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'; } catch (e) {}
    if (!SIDEBAR_MQ.matches && storedClosed) document.body.classList.add('sidebar-closed');
    setSidebarOpen(isSidebarOpen());

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sidebar-toggle]');
      if (!btn) return;
      e.preventDefault();
      toggleSidebar();
    });

    SIDEBAR_MQ.addEventListener('change', function () {
      document.body.classList.remove('sidebar-open', 'sidebar-closed');
      var closed = false;
      try { closed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'; } catch (e) {}
      if (!SIDEBAR_MQ.matches && closed) document.body.classList.add('sidebar-closed');
      setSidebarOpen(isSidebarOpen());
    });
  }

  /* ----------------------------------------------------------
     Reading progress bar (auto-injected wherever .lesson-content exists)
     ---------------------------------------------------------- */
  function initReadingProgress() {
    if (!document.querySelector('.lesson-content')) return;
    var bar = document.createElement('div');
    bar.className = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<div class="reading-progress-bar"></div>';
    document.body.appendChild(bar);
    var fill = bar.querySelector('.reading-progress-bar');

    function update() {
      var scrollTop = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
      fill.style.transform = 'scaleX(' + pct + ')';
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ----------------------------------------------------------
     Copy-to-clipboard button on <pre class="code"> blocks
     ---------------------------------------------------------- */
  function initCopySnippets() {
    qsa('pre.code, .code-example pre').forEach(function (pre) {
      if (pre.parentElement && pre.parentElement.querySelector('.copy-snippet-btn')) return;
      var wrap = pre.parentElement;
      if (!wrap || !wrap.classList.contains('code-block-wrap')) {
        wrap = document.createElement('div');
        wrap.className = 'code-block-wrap';
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(pre);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-snippet-btn';
      btn.setAttribute('aria-label', 'Copy code');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(pre.textContent.trim()).then(function () {
          btn.classList.add('copied');
          setTimeout(function () { btn.classList.remove('copied'); }, 2000);
        });
      });
      wrap.appendChild(btn);
    });
  }

  /* ----------------------------------------------------------
     Interactive code editors
     - Plug in ANY runner by setting `window.LessonRunner.run(code)`
       to return a Promise<{ stdout, stderr, error }>.
     - Falls back to a stub message if no runner is configured.
     ---------------------------------------------------------- */
  function storageKey(type, id) { return 'lesson-format-' + window.location.pathname + '-' + type + '-' + id; }
  function saveToStorage(type, id, value) { try { localStorage.setItem(storageKey(type, id), value); } catch (e) {} }
  function loadFromStorage(type, id) { try { return localStorage.getItem(storageKey(type, id)); } catch (e) { return null; } }
  function clearStorage(type, id) { try { localStorage.removeItem(storageKey(type, id)); } catch (e) {} }

  function renderRunOutput(outputEl, result) {
    if (result.error) {
      outputEl.innerHTML = '<div class="output-error">' + String(result.error).replace(/\n/g, '<br>') + '</div>';
      return;
    }
    if (result.stderr) {
      outputEl.innerHTML = '<div class="output-error">' + result.stderr.replace(/\n/g, '<br>') + '</div>';
      return;
    }
    if (result.stdout) {
      outputEl.innerHTML = '<pre>' + result.stdout + '</pre>';
      return;
    }
    outputEl.innerHTML = '<div class="output-placeholder">Code executed successfully (no output)</div>';
  }

  function getRunner() {
    return window.LessonRunner || {
      run: function () {
        return Promise.resolve({ stdout: '', stderr: '', error: 'No code runner configured. Set window.LessonRunner.run(code).' });
      }
    };
  }

  window.runEditorCode = function (editorId) {
    var outputEl = document.getElementById('output-' + editorId);
    var editor = window.editors && window.editors[editorId];
    var code = editor ? editor.getValue() : ((document.getElementById('editor-' + editorId) || {}).value || '');
    if (!outputEl) return;
    if (!code.trim()) {
      outputEl.innerHTML = '<div class="output-placeholder">No code to run. Write something first!</div>';
      return;
    }
    outputEl.innerHTML = '<div class="output-loading">Running...</div>';
    getRunner().run(code).then(function (result) {
      renderRunOutput(outputEl, result);
    }).catch(function (error) {
      outputEl.innerHTML = '<div class="output-error">' + String(error).replace(/\n/g, '<br>') + '</div>';
    });
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
    if (output) output.innerHTML = '<div class="output-placeholder">Press Run to see output</div>';
  };

  window.clearSaved = function (editorId) {
    if (!confirm('Clear your saved code for this editor?')) return;
    clearStorage('code', editorId);
    var editor = window.editors && window.editors[editorId];
    if (editor) editor.setValue('');
  };

  // Exercise checking — provide validators via:
  //   window.exerciseSolutions = {
  //     exercise1: { solution: 'code...', validator: function(code, output) { return { correct, message, hints }; } }
  //   };
  window.checkExercise = function (editorId) {
    var editor = window.editors && window.editors[editorId];
    var feedbackEl = document.getElementById('feedback-' + editorId);
    var outputEl = document.getElementById('output-' + editorId);
    if (!editor || !feedbackEl || !outputEl) return;

    var code = editor.getValue().trim();
    var exercise = (window.exerciseSolutions || {})[editorId];
    if (!code) {
      feedbackEl.className = 'exercise-feedback show incorrect';
      feedbackEl.innerHTML = '<h5>Please write some code first!</h5>';
      return;
    }
    if (!exercise) {
      alert('No validator registered for "' + editorId + '". Add it to window.exerciseSolutions.');
      return;
    }

    outputEl.innerHTML = '<div class="output-loading">Checking your code...</div>';
    getRunner().run(code).then(function (runResult) {
      renderRunOutput(outputEl, runResult);
      var result = exercise.validator(code, runResult);
      feedbackEl.className = 'exercise-feedback show ' + (result.correct ? 'correct' : 'incorrect');
      var hintsHtml = (result.hints && result.hints.length)
        ? '<ul>' + result.hints.map(function (h) { return '<li>' + h + '</li>'; }).join('') + '</ul>'
        : '';
      feedbackEl.innerHTML = '<h5>' + (result.correct ? 'Correct!' : 'Not quite right') + '</h5><p>' + result.message + '</p>' + hintsHtml;
    });
  };

  window.showSolution = function (editorId) {
    var exercise = (window.exerciseSolutions || {})[editorId];
    var editor = window.editors && window.editors[editorId];
    if (!exercise || !editor) return;
    if (!confirm('Show the solution? This will replace your current code.')) return;
    editor.setValue(exercise.solution);
  };

  function initEditors() {
    if (typeof CodeMirror === 'undefined') { setTimeout(initEditors, 50); return; }
    window.editors = window.editors || {};

    qsa('.code-editor-small').forEach(function (textarea) {
      var editorId = textarea.id.replace('editor-', '');
      if (window.editors[editorId]) return;
      var saved = loadFromStorage('code', editorId);

      window.editors[editorId] = CodeMirror.fromTextArea(textarea, {
        mode: 'python',
        theme: 'lesson',
        lineNumbers: true,
        indentUnit: 4,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        value: saved || textarea.value || ''
      });
      window.editors[editorId].setSize(null, 150);
      window.editors[editorId].on('change', function () {
        saveToStorage('code', editorId, window.editors[editorId].getValue());
      });
      window.editors[editorId].setOption('extraKeys', {
        'Ctrl-Enter': function () { window.runEditorCode(editorId); },
        'Cmd-Enter': function () { window.runEditorCode(editorId); }
      });
    });

    qsa('.reflection-input').forEach(function (textarea) {
      var saved = loadFromStorage('reflection', textarea.id);
      if (saved) textarea.value = saved;
      textarea.addEventListener('input', function () {
        saveToStorage('reflection', textarea.id, textarea.value);
      });
    });
  }

  /* ----------------------------------------------------------
     Boot
     ---------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initMobileNav();
    initSidebarToggle();
    initReadingProgress();
    initCopySnippets();
    if (document.querySelector('.code-editor-small')) initEditors();
  });

  window.LessonFormat = { toggleSidebar: toggleSidebar, applyTheme: applyTheme };
})();
