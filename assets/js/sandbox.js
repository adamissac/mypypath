(function() {
  'use strict';

  const STORAGE_KEY = 'pypath-sandbox-projects';
  let projects = [];
  let currentProjectId = null;
  let editor = null;
  let pyodide = null;
  let pyodideReady = false;

  // Initialize CodeMirror editor
  function initEditor() {
    const textarea = document.getElementById('code-editor');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    editor = CodeMirror.fromTextArea(textarea, {
      mode: 'python',
      theme: isDark ? 'monokai' : 'default',
      lineNumbers: true,
      indentUnit: 4,
      indentWithTabs: false,
      lineWrapping: true,
      autofocus: true,
      extraKeys: {
        'Ctrl-S': function() { saveCurrentProject(true); return false; },
        'Cmd-S': function() { saveCurrentProject(true); return false; },
        'Ctrl-Enter': function() { runCode(); return false; },
        'Cmd-Enter': function() { runCode(); return false; }
      }
    });

    // Update theme when it changes
    window.addEventListener('themechange', () => {
      const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'monokai' : 'default';
      editor.setOption('theme', theme);
    });

    editor.on('change', () => {
      markUnsaved();
    });

    // Set initial value
    editor.setValue('# Select or create a project to get started...\n# Click "New" to create your first project!\n');
  }

  // Load projects from localStorage
  function loadProjects() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        projects = JSON.parse(stored);
      } else {
        projects = [];
      }
    } catch (e) {
      console.error('Error loading projects:', e);
      projects = [];
    }
    renderProjects();
  }

  // Save projects to localStorage
  function saveProjects() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('Error saving projects:', e);
      alert('Error saving projects. Storage may be full.');
    }
  }

  // Render project list
  function renderProjects() {
    const list = document.getElementById('projects-list');
    const select = document.getElementById('project-select');
    
    list.innerHTML = '';
    select.innerHTML = '<option value="">Select a project...</option>';

    if (projects.length === 0) {
      list.innerHTML = '<p class="muted" style="padding: 20px; text-align: center;">No projects yet. Create one to get started!</p>';
      return;
    }

    projects.forEach(project => {
      // Add to sidebar list
      const item = document.createElement('div');
      item.className = `project-item ${project.id === currentProjectId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="project-item-content">
          <strong>${escapeHtml(project.name)}</strong>
          <span class="project-meta">${formatDate(project.updated)}</span>
        </div>
      `;
      item.addEventListener('click', () => loadProject(project.id));
      list.appendChild(item);

      // Add to select dropdown
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      if (project.id === currentProjectId) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  // Create new project
  function createNewProject() {
    const name = prompt('Enter project name:');
    if (!name || !name.trim()) return;

    const project = {
      id: Date.now().toString(),
      name: name.trim(),
      code: '# Welcome to your new project!\n# Start coding here...\n\nprint("Hello, World!")',
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };

    projects.push(project);
    saveProjects();
    loadProject(project.id);
    renderProjects();
  }

  // Load project
  function loadProject(projectId) {
    // Save current project if needed
    if (currentProjectId) {
      saveCurrentProject(false);
    }

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    currentProjectId = projectId;
    editor.setValue(project.code);
    editor.clearHistory();
    updateProjectStatus('saved');
    renderProjects();
  }

  // Save current project
  function saveCurrentProject(showMessage = true) {
    if (!currentProjectId) {
      const name = prompt('Enter project name to save:');
      if (!name || !name.trim()) return;

      const project = {
        id: Date.now().toString(),
        name: name.trim(),
        code: editor.getValue(),
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      projects.push(project);
      currentProjectId = project.id;
      saveProjects();
      renderProjects();
      updateProjectStatus('saved');
      if (showMessage) {
        showNotification('Project saved!');
      }
      return;
    }

    const project = projects.find(p => p.id === currentProjectId);
    if (project) {
      project.code = editor.getValue();
      project.updated = new Date().toISOString();
      saveProjects();
      renderProjects();
      updateProjectStatus('saved');
      if (showMessage) {
        showNotification('Project saved!');
      }
    }
  }

  // Delete current project
  function deleteCurrentProject() {
    if (!currentProjectId) {
      alert('No project selected.');
      return;
    }

    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;

    if (!confirm(`Are you sure you want to delete "${project.name}"? This cannot be undone.`)) {
      return;
    }

    projects = projects.filter(p => p.id !== currentProjectId);
    currentProjectId = null;
    editor.setValue('# Select or create a project to get started...\n');
    editor.clearHistory();
    saveProjects();
    renderProjects();
    updateProjectStatus('');
    showNotification('Project deleted.');
  }

  // Initialize Pyodide
  async function initPyodide() {
    if (pyodideReady) return;
    
    const output = document.getElementById('output-content');
    output.innerHTML = '<p class="muted">Loading Python interpreter...</p>';
    
    try {
      pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
      });
      
      // Capture stdout and stderr
      pyodide.runPython(`
        import sys
        from io import StringIO
        
        class OutputCapture:
            def __init__(self):
                self.buffer = StringIO()
            
            def write(self, s):
                if s:
                    self.buffer.write(str(s))
            
            def flush(self):
                pass
            
            def getvalue(self):
                return self.buffer.getvalue()
            
            def reset(self):
                from io import StringIO
                self.buffer = StringIO()
        
        stdout_capture = OutputCapture()
        stderr_capture = OutputCapture()
        sys.stdout = stdout_capture
        sys.stderr = stderr_capture
      `);
      
      pyodideReady = true;
      output.innerHTML = '<p class="muted">Python interpreter ready! Run your code to see output here...</p>';
    } catch (error) {
      output.innerHTML = `
        <div class="output-line error">
          <span class="output-label">Error:</span>
          <span class="output-text">Failed to load Python interpreter: ${escapeHtml(error.message)}</span>
        </div>
      `;
    }
  }

  // Run code using Pyodide
  async function runCode() {
    if (!pyodideReady) {
      await initPyodide();
      if (!pyodideReady) return;
    }

    const code = editor.getValue();
    const output = document.getElementById('output-content');
    
    if (!code.trim()) {
      output.innerHTML = '<p class="muted">No code to run. Write some Python code first!</p>';
      return;
    }

    output.innerHTML = '<p class="muted">Running code...</p>';

    try {
      // Reset output buffers
      pyodide.runPython(`
        stdout_capture.reset()
        stderr_capture.reset()
      `);

      // Execute the user's code
      pyodide.runPython(code);

      // Get captured output
      const stdout = pyodide.runPython('stdout_capture.getvalue()');
      const stderr = pyodide.runPython('stderr_capture.getvalue()');

      let outputHTML = '';

      if (stdout) {
        outputHTML += `
          <div class="output-line">
            <span class="output-label">Output:</span>
            <pre class="output-text">${escapeHtml(stdout)}</pre>
          </div>
        `;
      }

      if (stderr) {
        outputHTML += `
          <div class="output-line error">
            <span class="output-label">Error:</span>
            <pre class="output-text">${escapeHtml(stderr)}</pre>
          </div>
        `;
      }

      if (!stdout && !stderr) {
        outputHTML = '<p class="muted">Code executed successfully (no output).</p>';
      }

      output.innerHTML = outputHTML;

    } catch (error) {
      const errorMessage = error.toString();
      output.innerHTML = `
        <div class="output-line error">
          <span class="output-label">Error:</span>
          <pre class="output-text">${escapeHtml(errorMessage)}</pre>
        </div>
      `;
    }
  }

  // Update project status
  function updateProjectStatus(status) {
    const statusEl = document.getElementById('project-status');
    if (status === 'saved') {
      statusEl.textContent = '✓ Saved';
      statusEl.className = 'project-status saved';
    } else if (status === 'unsaved') {
      statusEl.textContent = '● Unsaved';
      statusEl.className = 'project-status unsaved';
    } else {
      statusEl.textContent = '';
      statusEl.className = 'project-status';
    }
  }

  // Mark as unsaved
  function markUnsaved() {
    if (currentProjectId) {
      updateProjectStatus('unsaved');
    }
  }

  // Clear output
  function clearOutput() {
    document.getElementById('output-content').innerHTML = '<p class="muted">Run your code to see output here...</p>';
  }

  // Show notification
  function showNotification(message) {
    // Simple notification - could be enhanced
    const status = document.getElementById('project-status');
    const original = status.textContent;
    status.textContent = message;
    setTimeout(() => {
      status.textContent = original;
    }, 2000);
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  // Event listeners
  document.addEventListener('DOMContentLoaded', async () => {
    initEditor();
    loadProjects();
    
    // Initialize Pyodide in the background
    initPyodide();

    document.getElementById('new-project-btn').addEventListener('click', createNewProject);
    document.getElementById('save-btn').addEventListener('click', () => saveCurrentProject(true));
    document.getElementById('delete-btn').addEventListener('click', deleteCurrentProject);
    document.getElementById('run-btn').addEventListener('click', runCode);
    document.getElementById('clear-output-btn').addEventListener('click', clearOutput);
    document.getElementById('project-select').addEventListener('change', (e) => {
      if (e.target.value) {
        loadProject(e.target.value);
      }
    });

    // Auto-save on blur (optional)
    editor.on('blur', () => {
      if (currentProjectId) {
        saveCurrentProject(false);
      }
    });
  });
})();

