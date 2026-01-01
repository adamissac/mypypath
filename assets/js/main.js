(function() {
  function qs(sel, parent) { return (parent || document).querySelector(sel); }
  function qsa(sel, parent) { return Array.from((parent || document).querySelectorAll(sel)); }

  function currentYear() {
    const yearEl = qs('#year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  function navInteractions() {
    const nav = qs('.primary-nav');
    const toggle = qs('.mobile-toggle', nav);
    const dropdownParents = qsa('.has-dropdown');
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        const expanded = nav.getAttribute('aria-expanded') === 'true';
        nav.setAttribute('aria-expanded', String(!expanded));
        toggle.setAttribute('aria-label', expanded ? 'Open Menu' : 'Close Menu');
      });
    }
    dropdownParents.forEach(parent => {
      const button = qs('.dropdown-toggle', parent);
      if (!button) return;
      button.addEventListener('click', () => {
        const expanded = parent.getAttribute('aria-expanded') === 'true';
        parent.setAttribute('aria-expanded', String(!expanded));
      });
      // close on outside click
      document.addEventListener('click', (e) => {
        if (!parent.contains(e.target)) parent.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function smoothInternalLinks() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (!id) return;
      const target = qs(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function reducedMotionRespect() {
    const observer = new MutationObserver(() => {
      const motion = document.body.dataset.motion || 'on';
      document.documentElement.style.setProperty('scroll-behavior', motion === 'off' ? 'auto' : 'smooth');
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-motion'] });
  }

  // --- Progress ---
  function getCompletedUnits() {
    try { return JSON.parse(localStorage.getItem('pypath-completed-units') || '[]'); } catch { return []; }
  }
  function setCompletedUnits(list) {
    try { localStorage.setItem('pypath-completed-units', JSON.stringify(Array.from(new Set(list)))); } catch {}
  }
  function markUnitCompletedFromPage() {
    const match = location.pathname.match(/units\/unit-(\d+)\.html$/);
    if (!match) return;
    const unitNum = Number(match[1]);
    const completed = getCompletedUnits();
    if (!completed.includes(unitNum)) {
      completed.push(unitNum);
      setCompletedUnits(completed);
      showToast(`Marked Unit ${unitNum} as completed`);
    }
  }
  function updateGlobalProgress() {
    const completed = getCompletedUnits();
    const total = 10;
    const percent = Math.round((completed.length / total) * 100);
    const bar = qs('.progress-global .bar');
    const pr = qs('.progress-global');
    if (bar && pr) {
      bar.style.width = `${percent}%`;
      pr.setAttribute('aria-valuenow', String(percent));
    }
    // add badges to unit cards
    qsa('.unit-card').forEach((card, idx) => {
      const unitIndex = idx + 1; // relies on order matching unit numbers
      if (completed.includes(unitIndex)) {
        card.classList.add('completed');
      }
    });
  }

  // --- Toasts ---
  function ensureToastContainer() {
    let cont = qs('.toast-container');
    if (!cont) {
      cont = document.createElement('div');
      cont.className = 'toast-container';
      document.body.appendChild(cont);
    }
    return cont;
  }
  function showToast(message, timeout = 2200) {
    const cont = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    cont.appendChild(el);
    // force reflow for transition
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, timeout);
  }

  // expose toast API
  window.PyUI = Object.assign({}, window.PyUI || {}, { showToast });

  // --- Button motion accents (ripple) ---
  function setupButtonRipples() {
    document.addEventListener('click', (e) => {
      // Only handle actual button elements, not links styled as buttons
      const btn = e.target.closest('button.btn, button[class*="btn"]');
      if (!btn || btn.tagName !== 'BUTTON') return;
      
      // Stop propagation to prevent accidental redirects
      e.stopPropagation();
      
      const rect = btn.getBoundingClientRect();
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.left = `${e.clientX - rect.left}px`;
      span.style.top = `${e.clientY - rect.top}px`;
      btn.appendChild(span);
      span.addEventListener('animationend', () => span.remove());
    });
  }

  // Settings actions
  function setupSettingsActions() {
    const resetBtn = qs('#reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        try {
          localStorage.removeItem('pypath-completed-units');
          localStorage.removeItem('pypath-theme');
          localStorage.removeItem('pypath-motion');
          localStorage.removeItem('pypath-accent');
          localStorage.removeItem('pypath-fontscale');
          localStorage.removeItem('pypath-tooltips');
          localStorage.removeItem('pypath-compact');
          localStorage.removeItem('pypath-focus');
          localStorage.removeItem('pypath-notifications');
          localStorage.removeItem('pypath-autosave');
          localStorage.removeItem('pypath-shortcuts');
          localStorage.removeItem('pypath-codetheme');
          localStorage.removeItem('pypath-sidebar');
          localStorage.removeItem('pypath-reminders');
        } catch {}
        showToast('Preferences reset');
        setTimeout(() => location.reload(), 400);
      });
    }
    const exportBtn = qs('#export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = {
          completedUnits: (function(){ try { return JSON.parse(localStorage.getItem('pypath-completed-units')||'[]'); } catch { return []; } })(),
          theme: (function(){ try { return localStorage.getItem('pypath-theme'); } catch { return null; } })(),
          motion: (function(){ try { return localStorage.getItem('pypath-motion'); } catch { return null; } })(),
          accent: (function(){ try { return localStorage.getItem('pypath-accent'); } catch { return null; } })(),
          fontScale: (function(){ try { return localStorage.getItem('pypath-fontscale'); } catch { return null; } })(),
          tooltips: (function(){ try { return localStorage.getItem('pypath-tooltips'); } catch { return null; } })(),
          compact: (function(){ try { return localStorage.getItem('pypath-compact'); } catch { return null; } })(),
          focus: (function(){ try { return localStorage.getItem('pypath-focus'); } catch { return null; } })(),
          notifications: (function(){ try { return localStorage.getItem('pypath-notifications'); } catch { return null; } })(),
          autosave: (function(){ try { return localStorage.getItem('pypath-autosave'); } catch { return null; } })(),
          shortcuts: (function(){ try { return localStorage.getItem('pypath-shortcuts'); } catch { return null; } })(),
          codeTheme: (function(){ try { return localStorage.getItem('pypath-codetheme'); } catch { return null; } })(),
          sidebar: (function(){ try { return localStorage.getItem('pypath-sidebar'); } catch { return null; } })(),
          reminders: (function(){ try { return localStorage.getItem('pypath-reminders'); } catch { return null; } })(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'pypath-preferences.json'; a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    currentYear();
    navInteractions();
    smoothInternalLinks();
    reducedMotionRespect();
    markUnitCompletedFromPage();
    updateGlobalProgress();
    setupButtonRipples();
    setupSettingsActions();
    // Sidebar toggle
    document.querySelectorAll('[data-sidebar-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const closed = document.body.classList.toggle('sidebar-closed');
        try { localStorage.setItem('pypath-sidebar-closed', closed ? '1' : '0'); } catch {}
      });
    });
    // Restore sidebar state
    try {
      if (localStorage.getItem('pypath-sidebar-closed') === '1') {
        document.body.classList.add('sidebar-closed');
      }
    } catch {}
  });
})();



