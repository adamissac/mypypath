/* PyPath — sandbox save/export rules. Pure string work, no DOM, no storage. */
(function () {
  'use strict';

  var MAX_BASE_LENGTH = 64;
  var FALLBACK_BASE = 'sketch';

  // Windows refuses these as filenames whatever the extension, and a download
  // that silently fails is worse than one with a slightly odd name.
  var RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

  function sanitizeBase(name) {
    var base = typeof name === 'string' ? name : '';

    base = base.replace(/\.(py|txt|pdf)$/i, '');
    base = base.replace(/[\/\\]+/g, ' ');
    base = base.replace(/[\u0000-\u001F\u007F<>:"|?*]+/g, '');
    base = base.replace(/\s+/g, '_');
    base = base.replace(/^[._\-]+/, '').replace(/[._\-]+$/, '');
    base = base.slice(0, MAX_BASE_LENGTH);
    base = base.replace(/[._\-]+$/, '');

    if (!base || RESERVED.test(base)) return FALLBACK_BASE;
    return base;
  }

  function filenameFor(name, extension) {
    var ext = String(extension || '').replace(/^\./, '');
    return sanitizeBase(name) + (ext ? '.' + ext : '');
  }

  function normalizeCode(code) {
    var text = typeof code === 'string' ? code : '';
    return text.replace(/\r\n/g, '\n');
  }

  // A .py file has to stay executable, so nothing but the code goes in it.
  function buildPyContent(code) {
    var text = normalizeCode(code);
    if (text && text.charAt(text.length - 1) !== '\n') text += '\n';
    return text;
  }

  // The .txt is the "show my work" artefact — code plus whatever the last run
  // printed — so a student can hand in one file. The output section is omitted
  // entirely when nothing has been run, rather than left as an empty heading.
  function buildTextContent(options) {
    var opts = options || {};
    var title = sanitizeBase(opts.name);
    var code = normalizeCode(opts.code);
    var output = normalizeCode(opts.output).replace(/\s+$/, '');

    var lines = [title + '.py', '='.repeat(Math.min(title.length + 3, 72)), '', code.replace(/\s+$/, '')];

    if (output) {
      lines.push('', '--- Output ---', '', output);
    }

    return lines.join('\n') + '\n';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Markup for the print-only view the PDF export renders. Kept as a pure
  // string builder so the escaping and the "no output yet" case are testable.
  function buildPrintHtml(options) {
    var opts = options || {};
    var title = sanitizeBase(opts.name) + '.py';
    var code = normalizeCode(opts.code).replace(/\s+$/, '');
    var output = normalizeCode(opts.output).replace(/\s+$/, '');
    var stamp = typeof opts.date === 'string' ? opts.date : '';

    var html =
      '<h1 class="sandbox-print-title">' + escapeHtml(title) + '</h1>' +
      (stamp ? '<p class="sandbox-print-meta">' + escapeHtml(stamp) + '</p>' : '') +
      '<h2 class="sandbox-print-heading">Code</h2>' +
      '<pre class="sandbox-print-code">' + escapeHtml(code) + '</pre>';

    if (output) {
      html +=
        '<h2 class="sandbox-print-heading">Output</h2>' +
        '<pre class="sandbox-print-output">' + escapeHtml(output) + '</pre>';
    }

    return html;
  }

  window.SandboxExport = {
    FALLBACK_BASE: FALLBACK_BASE,
    MAX_BASE_LENGTH: MAX_BASE_LENGTH,
    sanitizeBase: sanitizeBase,
    filenameFor: filenameFor,
    buildPyContent: buildPyContent,
    buildTextContent: buildTextContent,
    buildPrintHtml: buildPrintHtml
  };
})();

(function () {
  'use strict';

  const STORAGE_KEY = 'pypath-sandbox-projects';
  const DEFAULT_CODE = `print("Welcome to the PyPath sandbox!")
print("Write Python here and press Run.")

for i in range(3):
    print("  " * i + "▸" * (i + 1))`;

  const PRINT_ROOT_ID = 'sandbox-print-root';

  let projects = [];
  let currentProjectId = null;
  let editor = null;
  // Plain-text mirror of the last run, kept alongside the HTML the output panel
  // renders so the .txt and PDF exports don't have to scrape markup back out.
  let lastOutput = '';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 7) return days + 'd ago';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function setFilename(name) {
    const el = $('sandbox-filename');
    if (!el) return;
    const base = (name || 'untitled').replace(/\.py$/i, '');
    el.textContent = base + '.py';
  }

  function updateProjectStatus(status) {
    const statusEl = $('project-status');
    if (!statusEl) return;
    if (status === 'saved') {
      statusEl.textContent = 'Saved';
      statusEl.className = 'project-status saved';
    } else if (status === 'unsaved') {
      statusEl.textContent = 'Unsaved';
      statusEl.className = 'project-status unsaved';
    } else {
      statusEl.textContent = '';
      statusEl.className = 'project-status';
    }
  }

  function loadProjects() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      projects = stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error loading projects:', e);
      projects = [];
    }
    renderProjects();
  }

  function saveProjects() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('Error saving projects:', e);
      alert('Could not save projects. Storage may be full.');
    }
  }

  function renderProjects() {
    const list = $('projects-list');
    if (!list) return;
    list.innerHTML = '';

    if (!projects.length) {
      const empty = document.createElement('p');
      empty.className = 'sandbox-projects-empty';
      empty.textContent = 'No saved projects yet. Run some code, then Save.';
      list.appendChild(empty);
      return;
    }

    projects.forEach((project) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'project-item' + (project.id === currentProjectId ? ' active' : '');
      item.innerHTML =
        '<div class="project-item-content">' +
        '<strong>' + escapeHtml(project.name) + '</strong>' +
        '<span class="project-meta">' + formatDate(project.updated) + '</span>' +
        '</div>';
      item.addEventListener('click', () => loadProject(project.id));
      list.appendChild(item);
    });
  }

  function createNewProject() {
    currentProjectId = null;
    if (editor) {
      editor.setValue(DEFAULT_CODE);
      editor.clearHistory();
      editor.focus();
    }
    setFilename('untitled');
    updateProjectStatus('');
    renderProjects();
  }

  function loadProject(projectId) {
    if (currentProjectId) saveCurrentProject(false);

    const project = projects.find((p) => p.id === projectId);
    if (!project || !editor) return;

    currentProjectId = projectId;
    editor.setValue(project.code || '');
    editor.clearHistory();
    setFilename(project.name);
    updateProjectStatus('saved');
    renderProjects();
  }

  function saveCurrentProject(showMessage) {
    const code = editor ? editor.getValue() : '';

    if (!currentProjectId) {
      const name = prompt('Project name:', 'my_script');
      if (!name || !name.trim()) return;

      const project = {
        id: Date.now().toString(),
        name: name.trim(),
        code,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      projects.push(project);
      currentProjectId = project.id;
      saveProjects();
      setFilename(project.name);
      renderProjects();
      updateProjectStatus('saved');
      if (showMessage) notify('Project saved');
      return;
    }

    const project = projects.find((p) => p.id === currentProjectId);
    if (!project) return;

    project.code = code;
    project.updated = new Date().toISOString();
    saveProjects();
    setFilename(project.name);
    renderProjects();
    updateProjectStatus('saved');
    if (showMessage) notify('Project saved');
  }

  function deleteCurrentProject() {
    if (!currentProjectId) {
      if (editor) editor.setValue(DEFAULT_CODE);
      setFilename('untitled');
      updateProjectStatus('');
      clearOutput();
      return;
    }

    const project = projects.find((p) => p.id === currentProjectId);
    if (!project) return;

    if (!confirm('Delete "' + project.name + '"? This cannot be undone.')) return;

    projects = projects.filter((p) => p.id !== currentProjectId);
    currentProjectId = null;
    if (editor) {
      editor.setValue(DEFAULT_CODE);
      editor.clearHistory();
    }
    setFilename('untitled');
    updateProjectStatus('');
    saveProjects();
    renderProjects();
    clearOutput();
    notify('Project deleted');
  }

  function markUnsaved() {
    if (currentProjectId) updateProjectStatus('unsaved');
  }

  function clearOutput() {
    lastOutput = '';
    const output = $('output-content');
    if (!output) return;
    output.classList.remove('is-revealing');
    output.innerHTML = '<p class="output-placeholder muted">Press Run to see output</p>';
  }

  function currentProjectName() {
    const project = projects.find((p) => p.id === currentProjectId);
    return project ? project.name : 'untitled';
  }

  function currentCode() {
    return editor ? editor.getValue() : '';
  }

  function closeExportMenu(refocus) {
    const root = document.querySelector('.sandbox-export-dd');
    if (!root) return;
    if (window.PyDropdowns && window.PyDropdowns.close) window.PyDropdowns.close(root);
    if (!refocus) return;
    const trigger = $('export-btn');
    if (trigger) trigger.focus();
  }

  function downloadBlob(filename, text, mimeType) {
    let url = null;
    try {
      const blob = new Blob([text], { type: mimeType });
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error('Sandbox: download failed', e);
      notify('Could not start the download');
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  // "Save a copy": the buffer becomes a brand new project and the editor
  // follows it, so the project it was forked from keeps its last saved state.
  function saveAsNewProject() {
    const name = prompt('Save a copy as:', currentProjectName() + '_copy');
    if (!name || !name.trim()) return;

    const now = new Date().toISOString();
    const project = {
      id: Date.now().toString(),
      name: name.trim(),
      code: currentCode(),
      created: now,
      updated: now,
    };

    projects.push(project);
    currentProjectId = project.id;
    saveProjects();
    setFilename(project.name);
    renderProjects();
    updateProjectStatus('saved');
    notify('Copy saved as "' + project.name + '"');
  }

  function downloadPython() {
    const name = currentProjectName();
    downloadBlob(
      window.SandboxExport.filenameFor(name, 'py'),
      window.SandboxExport.buildPyContent(currentCode()),
      'text/x-python;charset=utf-8'
    );
  }

  function downloadText() {
    const name = currentProjectName();
    downloadBlob(
      window.SandboxExport.filenameFor(name, 'txt'),
      window.SandboxExport.buildTextContent({ name: name, code: currentCode(), output: lastOutput }),
      'text/plain;charset=utf-8'
    );
  }

  // No PDF library: we render a print-only view and hand the job to the
  // browser's own "Save as PDF" print destination, which every target browser
  // ships. Nothing new is vendored and the output honours the user's paper size.
  function exportPdf() {
    let root = $(PRINT_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = PRINT_ROOT_ID;
      root.setAttribute('aria-hidden', 'true');
      document.body.appendChild(root);
    }

    root.innerHTML = window.SandboxExport.buildPrintHtml({
      name: currentProjectName(),
      code: currentCode(),
      output: lastOutput,
      date: new Date().toLocaleString(),
    });

    document.body.classList.add('is-printing');

    // afterprint is the only reliable "the dialog is gone" signal; Chrome
    // returns from print() before the preview is dismissed, so tearing the
    // view down in a finally would blank the page being previewed.
    const cleanup = () => {
      document.body.classList.remove('is-printing');
      const node = $(PRINT_ROOT_ID);
      if (node) node.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    try {
      window.print();
    } catch (e) {
      console.error('Sandbox: print failed', e);
      cleanup();
      notify('Could not open the print dialog');
    }
  }

  function notify(message) {
    if (window.PyUI && window.PyUI.showToast) {
      window.PyUI.showToast(message);
      return;
    }
    const status = $('project-status');
    if (!status) return;
    const original = status.textContent;
    const originalClass = status.className;
    status.textContent = message;
    setTimeout(() => {
      status.textContent = original;
      status.className = originalClass;
    }, 2000);
  }

  async function ensurePyodide() {
    if (!window.Pyodide || typeof window.Pyodide.ensureReady !== 'function') {
      throw new Error('Python runtime unavailable');
    }
    await window.Pyodide.ensureReady();
    return window.pyodide;
  }

  async function runCode() {
    const runBtn = $('run-btn');
    const output = $('output-content');
    if (!editor || !output) return;

    if (runBtn) runBtn.classList.add('is-running');

    const code = editor.getValue();
    if (!code.trim()) {
      output.innerHTML = '<p class="output-placeholder muted">Write some Python code first.</p>';
      if (runBtn) runBtn.classList.remove('is-running');
      return;
    }

    output.classList.remove('is-revealing');

    try {
      // While Pyodide is still booting, the boot console shows honest
      // progress in the panel; "Running…" only once it's truly running.
      if (!window.pyodideReady && window.Pyodide && window.Pyodide.attachBootPanel) {
        window.Pyodide.attachBootPanel(output);
        await ensurePyodide();
      }
      output.innerHTML = '<p class="output-placeholder muted">Running…</p>';
      const result = await window.Pyodide.runCode(code);
      let outputHTML = '';
      let outputText = '';

      if (result.stdout) {
        outputText += result.stdout;
        outputHTML +=
          '<div class="output-line">' +
          '<span class="output-label">Output:</span>' +
          '<pre class="output-text">' + escapeHtml(result.stdout) + '</pre>' +
          '</div>';
      }

      if (result.stderr) {
        outputText += (outputText ? '\n' : '') + result.stderr;
        outputHTML +=
          '<div class="output-line error">' +
          '<span class="output-label">Error:</span>' +
          '<pre class="output-text">' + escapeHtml(result.stderr) + '</pre>' +
          '</div>';
      }

      if (result.error) {
        const msg = result.error && result.error.toString ? result.error.toString() : String(result.error);
        outputText += (outputText ? '\n' : '') + msg;
        outputHTML +=
          '<div class="output-line error">' +
          '<span class="output-label">Error:</span>' +
          '<pre class="output-text">' + escapeHtml(msg) + '</pre>' +
          '</div>';
      }

      if (!result.stdout && !result.stderr && !result.error) {
        outputHTML = '<p class="output-placeholder muted">Code ran successfully (no output).</p>';
      }

      lastOutput = outputText;
      output.innerHTML = outputHTML;
      output.classList.add('is-revealing');
      output.scrollTop = output.scrollHeight;
    } catch (error) {
      const errorMessage = error && error.toString ? error.toString() : String(error);
      lastOutput = errorMessage;
      output.innerHTML =
        '<div class="output-line error">' +
        '<span class="output-label">Error:</span>' +
        '<pre class="output-text">' + escapeHtml(errorMessage) + '</pre>' +
        '</div>';
      output.classList.add('is-revealing');
    } finally {
      if (runBtn) runBtn.classList.remove('is-running');
    }
  }

  function initEditor() {
    const textarea = $('code-editor');
    if (!textarea || !document.body.classList.contains('page-sandbox')) return false;
    if (!window.CodeMirror) return false;
    if (editor) return true;

    editor = window.CodeMirror.fromTextArea(textarea, {
      mode: 'python',
      theme: 'pypath',
      lineNumbers: true,
      indentUnit: 4,
      indentWithTabs: false,
      lineWrapping: true,
      autofocus: true,
      extraKeys: {
        Tab: (cm) => {
          if (cm.somethingSelected()) cm.indentSelection('add');
          else cm.replaceSelection('    ', 'end');
        },
        'Ctrl-S': () => {
          saveCurrentProject(true);
          return false;
        },
        'Cmd-S': () => {
          saveCurrentProject(true);
          return false;
        },
        'Ctrl-Enter': () => {
          runCode();
          return false;
        },
        'Cmd-Enter': () => {
          runCode();
          return false;
        },
      },
    });

    editor.setValue(DEFAULT_CODE);
    setFilename('untitled');

    window.addEventListener('themechange', () => {
      if (!editor) return;
      editor.setOption('theme', 'pypath');
      editor.refresh();
    });

    editor.on('change', markUnsaved);

    requestAnimationFrame(() => {
      if (editor) editor.refresh();
    });
    window.addEventListener('resize', () => {
      if (editor) editor.refresh();
    });

    return true;
  }

  function waitForEditor(attemptsLeft) {
    if (initEditor()) return;
    if (attemptsLeft <= 0) {
      console.error('Sandbox: CodeMirror failed to load');
      return;
    }
    setTimeout(() => waitForEditor(attemptsLeft - 1), 50);
  }

  function setupToolbarIcons() {
    if (!window.PyIcons) return;
    const map = {
      'run-btn': 'play',
      'save-btn': 'save',
      'delete-btn': 'trash',
      'new-project-btn': 'plus',
    };
    Object.keys(map).forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      const icon = window.PyIcons.el(map[id], 16);
      const label = btn.textContent.trim().replace(/^[^\w]+/, '').trim() || id;
      btn.textContent = '';
      btn.appendChild(icon);
      btn.appendChild(document.createTextNode(' ' + label));
      if (id === 'run-btn') btn.setAttribute('aria-label', 'Run code');
      if (id === 'save-btn') btn.setAttribute('aria-label', 'Save project');
      if (id === 'delete-btn') btn.setAttribute('aria-label', 'Delete project');
    });

    // Menu items keep their visible text; the icon is decorative and is
    // prepended rather than replacing the label.
    const itemIcons = {
      'export-copy-btn': 'copy',
      'export-py-btn': 'code',
      'export-txt-btn': 'book',
      'export-pdf-btn': 'pen',
    };
    Object.keys(itemIcons).forEach((id) => {
      const btn = $(id);
      if (!btn || btn.querySelector('svg')) return;
      const icon = window.PyIcons.el(itemIcons[id], 15);
      icon.setAttribute('aria-hidden', 'true');
      btn.insertBefore(icon, btn.firstChild);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.body.classList.contains('page-sandbox')) return;

    waitForEditor(40);
    loadProjects();
    setupToolbarIcons();

    $('new-project-btn')?.addEventListener('click', createNewProject);
    $('save-btn')?.addEventListener('click', () => saveCurrentProject(true));
    $('delete-btn')?.addEventListener('click', deleteCurrentProject);
    $('run-btn')?.addEventListener('click', runCode);
    $('clear-output-btn')?.addEventListener('click', clearOutput);

    // Every menu item closes the menu and hands focus back to the trigger
    // before doing its work, so a prompt() or print dialog never steals focus
    // from an item that is about to be hidden.
    const exportActions = {
      'export-copy-btn': saveAsNewProject,
      'export-py-btn': downloadPython,
      'export-txt-btn': downloadText,
      'export-pdf-btn': exportPdf,
    };
    Object.keys(exportActions).forEach((id) => {
      $(id)?.addEventListener('click', () => {
        closeExportMenu(true);
        exportActions[id]();
      });
    });

    if (window.Pyodide && typeof window.Pyodide.scheduleWarmup === 'function') {
      window.Pyodide.scheduleWarmup();
      if (window.Pyodide.attachBootPanel) {
        const output = $('output-content');
        if (output) window.Pyodide.attachBootPanel(output);
      }
    }
  });
})();
