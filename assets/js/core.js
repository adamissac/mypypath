/* PyPath core — layout, nav, dropdowns, UI */
(function () {
  'use strict';

  var UNIT_NAMES = [
    'Foundations',
    'Control Flow',
    'Functions',
    'Data Structures',
    'Modules & Packages',
    'OOP',
    'Files & Errors',
    'Testing',
    'APIs',
    'Certification Prep'
  ];

  var CHEVRON =
    '<svg class="dd-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function isActive(re) {
    return re.test(window.location.pathname);
  }

  function unitsActive() {
    return /\/units\//.test(window.location.pathname);
  }

  function currentUnitNum() {
    var m = window.location.pathname.match(/\/units\/unit-(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function unitMenuItems() {
    var current = currentUnitNum();
    var html = '';
    for (var i = 0; i < 10; i++) {
      var num = i + 1;
      var href = '/units/unit-' + num + '/';
      if (num === 1) href = '/units/unit-1/what-is-python.html';
      else if (num === 2) href = '/units/unit-2/understanding-control-flow.html';
      else if (num === 3) href = '/units/unit-3/what-are-functions.html';
      else if (num === 4) href = '/units/unit-4/introduction-data-structures.html';
      else if (num === 5) href = '/units/unit-5/what-are-modules.html';
      else if (num === 6) href = '/units/unit-6/introduction-oop-concepts.html';
      else if (num === 7) href = '/units/unit-7/introduction-file-handling.html';
      else if (num === 8) href = '/units/unit-8/what-is-debugging.html';
      else if (num === 9) href = '/units/unit-9/recursion-problem-decomposition.html';
      else if (num === 10) href = '/units/unit-10/project-planning-brainstorming.html';
      var active = current === num ? ' is-current' : '';
      html +=
        '<li role="none">' +
          '<a role="menuitem" href="' + href + '" class="dd-item route' + active + '">' +
            '<span class="dd-item__num">' + num + '</span>' +
            '<span class="dd-item__body">' +
              '<span class="dd-item__title">' + UNIT_NAMES[i] + '</span>' +
              '<span class="dd-item__meta">Unit ' + num + '</span>' +
            '</span>' +
          '</a>' +
        '</li>';
    }
    return html;
  }

  function unitsDropdown() {
    var btnActive = unitsActive() ? ' aria-current="page"' : '';
    return (
      '<li class="dd dd--nav" data-dd>' +
        '<button type="button" class="dd-trigger" id="nav-units-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="nav-units-panel"' + btnActive + '>' +
          '<span>Units</span>' + CHEVRON +
        '</button>' +
        '<div class="dd-panel" id="nav-units-panel" role="menu" aria-labelledby="nav-units-btn" hidden>' +
          '<div class="dd-panel__head">' +
            '<span class="dd-panel__label">Curriculum</span>' +
            '<span class="dd-panel__hint">10 units</span>' +
          '</div>' +
          '<ul class="dd-panel__list dd-panel__list--grid">' +
            unitMenuItems() +
          '</ul>' +
        '</div>' +
      '</li>'
    );
  }

  function headerHtml(showProgress) {
    var homeActive = isActive(/^\/$|\/index\.html$/) ? ' active' : '';
    var sandboxActive = isActive(/sandbox\.html$/) ? ' active' : '';
    var settingsActive = isActive(/settings\.html$/) ? ' active' : '';

    var progress = showProgress
      ? '<div class="header-progress"><div class="container"><div class="progress-global" aria-label="Course progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bar"></div></div></div></div>'
      : '';

    return (
      '<header class="site-header">' +
        '<div class="header-accent" aria-hidden="true"></div>' +
        '<div class="container header-inner">' +
          '<a class="brand route" href="/">' +
            '<img src="/assets/img/pyPathLogo.png" alt="PyPath Logo" class="logo" width="36" height="36">' +
            '<span class="brand-text">PyPath</span>' +
          '</a>' +
          '<div class="header-actions">' +
            '<nav class="primary-nav" aria-label="Primary" aria-expanded="false">' +
              '<button type="button" class="mobile-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="primary-menu">' +
                '<span class="mobile-toggle-bar" aria-hidden="true"></span>' +
                '<span class="mobile-toggle-bar" aria-hidden="true"></span>' +
                '<span class="mobile-toggle-bar" aria-hidden="true"></span>' +
              '</button>' +
              '<div class="nav-pill">' +
                '<ul class="menu" id="primary-menu">' +
                  '<li><a href="/" class="route' + homeActive + '">Home</a></li>' +
                  unitsDropdown() +
                  '<li><a href="/sandbox.html" class="route' + sandboxActive + '">Sandbox</a></li>' +
                  '<li><a href="/settings.html" class="route' + settingsActive + '">Settings</a></li>' +
                '</ul>' +
              '</div>' +
            '</nav>' +
            '<a href="/units/unit-1/what-is-python.html" class="btn btn-primary header-cta route">Start learning</a>' +
          '</div>' +
        '</div>' +
        progress +
      '</header>'
    );
  }

  function footerHtml() {
    return (
      '<footer class="site-footer">' +
        '<div class="container">' +
          '<div class="footer-grid">' +
            '<div class="footer-brand">' +
              '<a class="brand small route" href="/">' +
                '<img src="/assets/img/pyPathLogo.png" alt="" class="logo small" width="28" height="28">' +
                '<span class="brand-text">PyPath</span>' +
              '</a>' +
              '<p class="footer-tagline">Learn Python with clarity — free, structured lessons from foundations to certification.</p>' +
              '<p class="footer-copy muted">&copy; <span id="year"></span> PyPath</p>' +
            '</div>' +
            '<div class="footer-col">' +
              '<h4 class="footer-heading">Learn</h4>' +
              '<ul class="footer-links">' +
                '<li><a href="/curriculum.html" class="route">Curriculum</a></li>' +
                '<li><a href="/sandbox.html" class="route">Sandbox</a></li>' +
                '<li><a href="/settings.html" class="route">Settings</a></li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</footer>'
    );
  }

  function inject() {
    /* Header/footer are baked into HTML — no runtime DOM replacement. */
    var footer = document.querySelector('footer.site-footer #year');
    if (footer && !footer.textContent) {
      footer.textContent = String(new Date().getFullYear());
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    inject();
    document.dispatchEvent(new CustomEvent('pypath:layout-ready'));
  });
  window.PyLayout = { inject: inject };
})();

/**
 * PyPath — unified dropdown / disclosure controller
 */
(function () {
  'use strict';

  var OPEN_CLASS = 'is-open';
  var DESKTOP = window.matchMedia('(min-width: 981px)');

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function closeAll(except) {
    qsa('[data-dd]').forEach(function (root) {
      if (root === except) return;
      closeDd(root);
    });
  }

  function openDd(root) {
    var trigger = root.querySelector('.dd-trigger');
    var panel = root.querySelector('.dd-panel');
    if (!trigger || !panel) return;

    closeAll(root);
    root.classList.add(OPEN_CLASS);
    trigger.setAttribute('aria-expanded', 'true');
    panel.removeAttribute('hidden');

    if (DESKTOP.matches && root.classList.contains('dd--nav')) {
      positionNavPanel(root, trigger, panel);
    }
  }

  function closeDd(root) {
    var trigger = root.querySelector('.dd-trigger');
    var panel = root.querySelector('.dd-panel');
    if (!trigger || !panel) return;

    root.classList.remove(OPEN_CLASS);
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('hidden', '');
    panel.style.removeProperty('top');
    panel.style.removeProperty('left');
    panel.style.removeProperty('width');
  }

  function positionNavPanel(root, trigger, panel) {
    var rect = trigger.getBoundingClientRect();
    var panelWidth = Math.min(400, window.innerWidth - 24);
    var left = rect.left + rect.width / 2 - panelWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));

    panel.style.position = 'fixed';
    panel.style.top = Math.round(rect.bottom + 8) + 'px';
    panel.style.left = Math.round(left) + 'px';
    panel.style.width = panelWidth + 'px';
  }

  function initDisclosures() {
    qsa('[data-disclosure]').forEach(function (btn) {
      if (btn.dataset.disclosureBound) return;
      btn.dataset.disclosureBound = '1';

      var id = btn.getAttribute('aria-controls');
      var target = id ? document.getElementById(id) : null;
      if (!target) return;

      var open = btn.getAttribute('aria-expanded') === 'true' || (!target.hasAttribute('hidden') && target.offsetParent !== null);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');

      btn.addEventListener('click', function () {
        var isOpen = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isOpen));
        btn.classList.toggle('is-open', !isOpen);
        if (isOpen) target.setAttribute('hidden', '');
        else target.removeAttribute('hidden');
      });
    });
  }

  function initAccordions() {
    qsa('.accordion .accordion-item').forEach(function (item) {
      var summary = item.querySelector('summary');
      if (!summary || summary.dataset.accBound) return;
      summary.dataset.accBound = '1';
      summary.setAttribute('role', 'button');
      summary.setAttribute('aria-expanded', item.open ? 'true' : 'false');
      item.addEventListener('toggle', function () {
        summary.setAttribute('aria-expanded', item.open ? 'true' : 'false');
      });
    });
  }

  var globalListenersBound = false;

  function bindGlobalListeners() {
    if (globalListenersBound) return;
    globalListenersBound = true;

    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-dd]')) closeAll(null);
    });

    window.addEventListener('resize', function () {
      qsa('[data-dd].' + OPEN_CLASS).forEach(function (root) {
        if (DESKTOP.matches && root.classList.contains('dd--nav')) {
          positionNavPanel(root, root.querySelector('.dd-trigger'), root.querySelector('.dd-panel'));
        }
      });
    });

    window.addEventListener('scroll', function () {
      qsa('[data-dd].dd--nav.' + OPEN_CLASS).forEach(function (root) {
        if (DESKTOP.matches) {
          positionNavPanel(root, root.querySelector('.dd-trigger'), root.querySelector('.dd-panel'));
        }
      });
    }, { passive: true });
  }

  function initNavDropdowns() {
    bindGlobalListeners();

    qsa('[data-dd]').forEach(function (root) {
      if (root.dataset.ddBound) return;
      root.dataset.ddBound = '1';

      var trigger = root.querySelector('.dd-trigger');
      var panel = root.querySelector('.dd-panel');
      if (!trigger || !panel) return;

      panel.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (root.classList.contains(OPEN_CLASS)) closeDd(root);
        else openDd(root);
      });

      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          openDd(root);
          var first = panel.querySelector('a, button');
          if (first) first.focus();
        }
        if (e.key === 'Escape') closeDd(root);
      });

      panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeDd(root);
          trigger.focus();
        }
      });
    });
  }

  function init() {
    initNavDropdowns();
    initDisclosures();
    initAccordions();
  }

  document.addEventListener('pypath:layout-ready', init);
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(init, 0);
  });
  window.PyDropdowns = { open: openDd, close: closeDd, closeAll: closeAll };
})();

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
    function closeMobile() {
      if (!nav) return;
      nav.setAttribute('aria-expanded', 'false');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');
    }

    function openMobile() {
      nav.setAttribute('aria-expanded', 'true');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
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

    if (menu) {
      menu.addEventListener('click', function (e) {
        if (e.target.closest('a.route')) closeMobile();
      });
    }

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

  function setupSettingsActions() {
    var exportBtn = qs('#export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        try {
          var data = {};
          Object.keys(localStorage).forEach(function (k) {
            if (k.startsWith('pypath-')) data[k] = localStorage.getItem(k);
          });
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url;
          link.download = 'pypath-settings.json';
          link.click();
          URL.revokeObjectURL(url);
          showToast('Settings exported');
        } catch (e) {
          showToast('Could not export settings');
        }
      });
    }

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

  var SIDEBAR_MQ = window.matchMedia('(max-width: 980px)');

  function isSidebarOpen() {
    if (SIDEBAR_MQ.matches) {
      return document.body.classList.contains('sidebar-open');
    }
    return !document.body.classList.contains('sidebar-closed');
  }

  function setSidebarOpen(open) {
    if (SIDEBAR_MQ.matches) {
      document.body.classList.toggle('sidebar-open', open);
      document.body.classList.remove('sidebar-closed');
    } else {
      document.body.classList.toggle('sidebar-closed', !open);
      document.body.classList.remove('sidebar-open');
      try { localStorage.setItem('pypath-sidebar-closed', open ? '0' : '1'); } catch {}
    }
    qsa('[data-sidebar-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', String(open));
      var label = open ? 'Hide lesson menu' : 'Show lesson menu';
      btn.setAttribute('aria-label', label);
      if (btn.classList.contains('sidebar-toggle-btn')) {
        btn.textContent = open ? 'Hide lesson menu' : 'Show lesson menu';
      }
    });
    var reopenBtn = document.querySelector('.sidebar-reopen-btn');
    if (reopenBtn) {
      if (SIDEBAR_MQ.matches) {
        reopenBtn.hidden = true;
      } else {
        reopenBtn.hidden = open;
      }
    }
  }

  function toggleSidebar() {
    setSidebarOpen(!isSidebarOpen());
  }

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
    collapseBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M15 18 9 12l6-6"/><path d="M4 6v12"/></svg>';

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
      reopenBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M9 18l6-6-6-6"/><path d="M20 6v12"/></svg>' +
        '<span>Lessons</span>';
      document.body.appendChild(reopenBtn);
    }

    var inlineToggle = layout.querySelector('.sidebar-toggle-btn');
    if (inlineToggle) {
      inlineToggle.textContent = 'Show lesson menu';
    }

    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (SIDEBAR_MQ.matches) setSidebarOpen(false);
      });
    });
  }

  function initSidebarToggle() {
    enhanceLessonSidebar();

    var storedClosed = false;
    try { storedClosed = localStorage.getItem('pypath-sidebar-closed') === '1'; } catch {}

    if (!SIDEBAR_MQ.matches && storedClosed) {
      document.body.classList.add('sidebar-closed');
    }

    setSidebarOpen(isSidebarOpen());

    if (!document.documentElement.dataset.sidebarToggleBound) {
      document.documentElement.dataset.sidebarToggleBound = '1';
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-sidebar-toggle]');
        if (!btn) return;
        e.preventDefault();
        toggleSidebar();
      });
    }

    SIDEBAR_MQ.addEventListener('change', function () {
      document.body.classList.remove('sidebar-open', 'sidebar-closed');
      var closed = false;
      try { closed = localStorage.getItem('pypath-sidebar-closed') === '1'; } catch {}
      if (!SIDEBAR_MQ.matches && closed) {
        document.body.classList.add('sidebar-closed');
      }
      setSidebarOpen(isSidebarOpen());
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    currentYear();
    navInteractions();
    stickyHeader();
    reducedMotionRespect();
    markUnitCompletedFromPage();
    updateGlobalProgress();
    setupSettingsActions();
    initSidebarToggle();
    initNavigation();
  });

  function prefersReducedMotion() {
    return document.documentElement.classList.contains('reduced-motion') ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function isInternalNavLink(a) {
    if (!a || !a.href) return false;
    if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return false;
    if (a.origin !== location.origin) return false;
    var url = new URL(a.href);
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    return true;
  }

  function prefetchUrl(href) {
    if (!href) return;
    try {
      var url = new URL(href, location.href);
      if (url.origin !== location.origin) return;
      var key = url.pathname + url.search;
      if (prefetchUrl.done[key]) return;
      prefetchUrl.done[key] = true;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url.href;
      document.head.appendChild(link);
    } catch (e) { /* ignore */ }
  }
  prefetchUrl.done = Object.create(null);

  function showNavProgress() {
    var bar = document.getElementById('nav-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nav-progress';
      bar.className = 'nav-progress';
      bar.setAttribute('aria-hidden', 'true');
      bar.innerHTML = '<div class="nav-progress__bar"></div>';
      document.body.appendChild(bar);
    }
    bar.classList.add('is-active');
    requestAnimationFrame(function () {
      bar.classList.add('is-visible');
    });
  }

  function hideNavProgress() {
    var bar = document.getElementById('nav-progress');
    if (bar) {
      bar.classList.remove('is-visible', 'is-active');
    }
  }

  function finishPageEnter() {
    try { sessionStorage.removeItem('pypath-nav'); } catch (e) {}
    document.documentElement.classList.remove('page-from-nav');
    document.documentElement.classList.add('page-entered');
    hideNavProgress();
    var main = document.querySelector('main');
    if (main) main.classList.add('is-entered');
  }

  function initNavigation() {
    qsa('.lesson-nav a[href], .lesson-overview a[href]').forEach(function (a) {
      prefetchUrl(a.href);
    });

    document.addEventListener('mouseover', function (e) {
      var a = e.target.closest('a[href]');
      if (isInternalNavLink(a)) prefetchUrl(a.href);
    }, { passive: true });

    document.addEventListener('focusin', function (e) {
      var a = e.target.closest('a[href]');
      if (isInternalNavLink(a)) prefetchUrl(a.href);
    });

    document.addEventListener('touchstart', function (e) {
      var a = e.target.closest('a[href]');
      if (isInternalNavLink(a)) prefetchUrl(a.href);
    }, { passive: true });

    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest('a[href]');
      if (!isInternalNavLink(a)) return;

      try { sessionStorage.setItem('pypath-nav', '1'); } catch (err) {}

      if (window.PyDropdowns) window.PyDropdowns.closeAll(null);
      document.body.classList.remove('nav-open');
      var nav = qs('.primary-nav');
      if (nav) nav.setAttribute('aria-expanded', 'false');
      var toggle = qs('.mobile-toggle', nav);
      if (toggle) toggle.setAttribute('aria-expanded', 'false');

      if (!prefersReducedMotion()) {
        showNavProgress();
        var overlay = document.getElementById('page-transition');
        if (overlay) overlay.classList.add('is-active');
      }
    }, true);

    window.addEventListener('pageshow', function (e) {
      finishPageEnter();
      if (e.persisted) {
        qsa('.lesson-nav a[href], .lesson-overview a[href]').forEach(function (a) {
          prefetchUrl(a.href);
        });
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', finishPageEnter);
    } else {
      requestAnimationFrame(finishPageEnter);
    }
  }

})();
