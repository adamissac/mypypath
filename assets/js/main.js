(function () {
  function qs(sel, parent) { return (parent || document).querySelector(sel); }
  function qsa(sel, parent) { return Array.from((parent || document).querySelectorAll(sel)); }

  function currentYear() {
    qsa('#year').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  function getFocusables(container) {
    return qsa(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      container
    ).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  function navInteractions() {
    var nav = qs('.primary-nav');
    var toggle = qs('.mobile-toggle', nav);
    var menu = qs('#primary-menu', nav);
    var backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);

    function closeMobile() {
      if (!nav) return;
      nav.setAttribute('aria-expanded', 'false');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      backdrop.classList.remove('is-visible');
      document.body.classList.remove('nav-open');
    }

    function openMobile() {
      nav.setAttribute('aria-expanded', 'true');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      backdrop.classList.add('is-visible');
      document.body.classList.add('nav-open');
      var focusables = getFocusables(menu);
      if (focusables[0]) focusables[0].focus();
    }

    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var expanded = nav.getAttribute('aria-expanded') === 'true';
        if (expanded) closeMobile();
        else openMobile();
      });
    }

    backdrop.addEventListener('click', closeMobile);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeMobile();
        if (window.PyDropdowns) window.PyDropdowns.closeAll(null);
      }
    });
  }

  function stickyHeader() {
    var header = qs('.site-header');
    if (!header) return;
    var lastY = 0;

    function onScroll() {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      lastY = y;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function reducedMotionRespect() {
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      function apply() {
        document.documentElement.style.scrollBehavior =
          (mq.matches || document.body.dataset.motion === 'off') ? 'auto' : 'smooth';
      }
      mq.addEventListener('change', apply);
      apply();
    }
  }

  function getCompletedUnits() {
    try { return JSON.parse(localStorage.getItem('pypath-completed-units') || '[]'); } catch { return []; }
  }
  function setCompletedUnits(list) {
    try { localStorage.setItem('pypath-completed-units', JSON.stringify(Array.from(new Set(list)))); } catch {}
  }
  function markUnitCompletedFromPage() {
    var match = location.pathname.match(/units\/unit-(\d+)\.html$/);
    if (!match) return;
    var unitNum = Number(match[1]);
    var completed = getCompletedUnits();
    if (!completed.includes(unitNum)) {
      completed.push(unitNum);
      setCompletedUnits(completed);
      showToast('Marked Unit ' + unitNum + ' as completed');
    }
  }
  function updateGlobalProgress() {
    var completed = getCompletedUnits();
    var percent = Math.round((completed.length / 10) * 100);
    var bar = qs('.progress-global .bar');
    var pr = qs('.progress-global');
    if (bar && pr) {
      bar.style.width = percent + '%';
      pr.setAttribute('aria-valuenow', String(percent));
    }
    qsa('.unit-card').forEach(function (card, idx) {
      if (completed.includes(idx + 1)) card.classList.add('completed');
    });
  }

  function ensureToastContainer() {
    var cont = qs('.toast-container');
    if (!cont) {
      cont = document.createElement('div');
      cont.className = 'toast-container';
      cont.setAttribute('aria-live', 'polite');
      document.body.appendChild(cont);
    }
    return cont;
  }

  function showToast(message, timeout) {
    timeout = timeout || 2200;
    var cont = ensureToastContainer();
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    cont.appendChild(el);
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 250);
    }, timeout);
  }

  window.PyUI = Object.assign({}, window.PyUI || {}, { showToast: showToast });

  function setupButtonRipples() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('button.btn, button[class*="btn"]');
      if (!btn || btn.tagName !== 'BUTTON') return;
      if (window.PyMotion && window.PyMotion.prefersReduced()) return;
      var rect = btn.getBoundingClientRect();
      var span = document.createElement('span');
      span.className = 'ripple';
      span.style.left = (e.clientX - rect.left) + 'px';
      span.style.top = (e.clientY - rect.top) + 'px';
      btn.appendChild(span);
      span.addEventListener('animationend', function () { span.remove(); });
    });
  }

  function setupSettingsActions() {
    var resetBtn = qs('#reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        try {
          Object.keys(localStorage).forEach(function (k) {
            if (k.startsWith('pypath-')) localStorage.removeItem(k);
          });
        } catch {}
        showToast('Preferences reset');
        setTimeout(function () { location.reload(); }, 400);
      });
    }
  }

  function initSidebarToggle() {
    qsa('[data-sidebar-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', !document.body.classList.contains('sidebar-closed'));
      btn.addEventListener('click', function () {
        var closed = document.body.classList.toggle('sidebar-closed');
        btn.setAttribute('aria-expanded', String(!closed));
        try { localStorage.setItem('pypath-sidebar-closed', closed ? '1' : '0'); } catch {}
      });
    });
    try {
      if (localStorage.getItem('pypath-sidebar-closed') === '1') {
        document.body.classList.add('sidebar-closed');
      }
    } catch {}
  }

  function initCertAccordions() {
    qsa('.accordion-item').forEach(function (item) {
      var summary = qs('summary', item);
      if (!summary) return;
      summary.setAttribute('role', 'button');
      if (!summary.hasAttribute('aria-expanded')) {
        summary.setAttribute('aria-expanded', item.hasAttribute('open') ? 'true' : 'false');
      }
      item.addEventListener('toggle', function () {
        summary.setAttribute('aria-expanded', item.open ? 'true' : 'false');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    currentYear();
    navInteractions();
    stickyHeader();
    reducedMotionRespect();
    markUnitCompletedFromPage();
    updateGlobalProgress();
    setupButtonRipples();
    setupSettingsActions();
    initSidebarToggle();
    initCertAccordions();
    initLinkPrefetch();
  });

  function initLinkPrefetch() {
    var prefetched = Object.create(null);
    document.addEventListener('mouseover', function (e) {
      var a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      if (a.origin !== location.origin) return;
      var path = a.pathname + a.search;
      if (prefetched[path] || path === location.pathname + location.search) return;
      prefetched[path] = true;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = a.href;
      document.head.appendChild(link);
    }, { passive: true });
  }
})();
