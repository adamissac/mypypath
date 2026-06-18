(function () {
  'use strict';

  const STORAGE_KEY = 'pypath-sandbox-projects';
  const DEFAULT_CODE = `print("Welcome to the PyPath sandbox!")
print("Write Python here and press Run.")

for i in range(3):
    print("  " * i + "▸" * (i + 1))`;

  let projects = [];
  let currentProjectId = null;
  let editor = null;

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
    const output = $('output-content');
    if (!output) return;
    output.classList.remove('is-revealing');
    output.innerHTML = '<p class="output-placeholder muted">Press Run to see output</p>';
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
    output.innerHTML = '<p class="output-placeholder muted">Running…</p>';

    try {
      const pyodide = await ensurePyodide();
      pyodide.runPython('stdout_capture.reset(); stderr_capture.reset()');
      pyodide.runPython(code);

      const stdout = pyodide.runPython('stdout_capture.getvalue()') || '';
      const stderr = pyodide.runPython('stderr_capture.getvalue()') || '';

      let outputHTML = '';

      if (stdout) {
        outputHTML +=
          '<div class="output-line">' +
          '<span class="output-label">Output:</span>' +
          '<pre class="output-text">' + escapeHtml(stdout) + '</pre>' +
          '</div>';
      }

      if (stderr) {
        outputHTML +=
          '<div class="output-line error">' +
          '<span class="output-label">Error:</span>' +
          '<pre class="output-text">' + escapeHtml(stderr) + '</pre>' +
          '</div>';
      }

      if (!stdout && !stderr) {
        outputHTML = '<p class="output-placeholder muted">Code ran successfully (no output).</p>';
      }

      output.innerHTML = outputHTML;
      output.classList.add('is-revealing');
      output.scrollTop = output.scrollHeight;
    } catch (error) {
      const errorMessage = error && error.toString ? error.toString() : String(error);
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

    if (window.Pyodide && typeof window.Pyodide.scheduleWarmup === 'function') {
      window.Pyodide.scheduleWarmup();
    }
  });
})();
