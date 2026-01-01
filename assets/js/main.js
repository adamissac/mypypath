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
      
      // Prevent clicks on invisible or off-screen links
      const rect = a.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && 
                       rect.top < window.innerHeight && 
                       rect.bottom > 0 && 
                       rect.left < window.innerWidth && 
                       rect.right > 0;
      
      // Check if element is actually visible (not hidden by CSS)
      const style = window.getComputedStyle(a);
      const isHidden = style.display === 'none' || 
                      style.visibility === 'hidden' || 
                      style.opacity === '0' ||
                      style.pointerEvents === 'none';
      
      if (!isVisible || isHidden) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      const id = a.getAttribute('href');
      if (!id) return;
      const target = qs(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  
  // Prevent accidental link clicks on mobile - AGGRESSIVE VERSION
  function preventInvisibleLinkClicks() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     ('ontouchstart' in window) || 
                     (navigator.maxTouchPoints > 0);
    
    if (!isMobile) return;
    
    // Track touch start position to detect accidental taps
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    
    document.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        touchMoved = false;
      }
    }, { passive: true });
    
    document.addEventListener('touchmove', () => {
      touchMoved = true;
    }, { passive: true });
    
    // Intercept ALL clicks on mobile and validate them aggressively
    document.addEventListener('click', (e) => {
      // Always allow buttons and form elements
      if (e.target.closest('button') || 
          e.target.tagName === 'BUTTON' ||
          e.target.closest('input, textarea, select')) {
        return;
      }
      
      // Check if clicking on a link
      const a = e.target.closest('a');
      if (!a) {
        // Not a link, allow it
        return;
      }
      
      // If user was scrolling, block the click
      if (touchMoved) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Check if link is actually visible and clickable
      const rect = a.getBoundingClientRect();
      const style = window.getComputedStyle(a);
      
      // If link is invisible or has no dimensions, prevent click
      if (style.display === 'none' || 
          style.visibility === 'hidden' || 
          parseFloat(style.opacity) < 0.1 ||
          style.pointerEvents === 'none' ||
          rect.width === 0 || 
          rect.height === 0 ||
          rect.top >= window.innerHeight ||
          rect.bottom <= 0 ||
          rect.left >= window.innerWidth ||
          rect.right <= 0) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Check if this was a scroll gesture, not a tap
      const touchDuration = Date.now() - touchStartTime;
      const clickX = e.clientX || touchStartX;
      const clickY = e.clientY || touchStartY;
      
      // If user moved finger more than 5px, it's probably a scroll, not a click
      const moveDistance = Math.sqrt(
        Math.pow(clickX - touchStartX, 2) + Math.pow(clickY - touchStartY, 2)
      );
      
      if (moveDistance > 5 || touchDuration > 200) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Verify click is actually on the link element (strict bounds)
      if (clickX && clickY) {
        if (clickX < rect.left || clickX > rect.right || 
            clickY < rect.top || clickY > rect.bottom) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
      
      // For ALL links, require clicking directly on the link text/content
      // Block clicks on padding or empty space
      const linkText = a.textContent.trim();
      if (!linkText || linkText.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Only allow if clicking directly on the link element itself or its direct text
      const clickedElement = e.target;
      if (clickedElement !== a && 
          clickedElement.parentElement !== a && 
          !(clickedElement.nodeType === 3 && clickedElement.parentElement === a)) {
        // Check if it's a valid child (like span with text)
        const isTextChild = clickedElement.tagName === 'SPAN' || 
                           clickedElement.tagName === 'STRONG' ||
                           clickedElement.tagName === 'EM' ||
                           clickedElement.nodeType === 3;
        if (!isTextChild) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
      
      // Additional check: link must have reasonable size (not a tiny invisible link)
      if (rect.width < 20 || rect.height < 20) {
        // Allow small links only if they're buttons or explicitly styled
        if (!a.classList.contains('btn') && !a.closest('.btn')) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    }, true); // Use capture phase to catch early
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
    preventInvisibleLinkClicks();
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



