/* PyPath core — layout, nav, dropdowns, UI */
(function () {
  'use strict';

  function inject() {
    /* Header/footer are baked into HTML — no runtime DOM replacement. */
    var footer = document.querySelector('footer.site-footer #year');
    if (footer && !footer.textContent) {
      footer.textContent = String(new Date().getFullYear());
    }
  }

  // The run/save shortcuts take Ctrl as happily as Cmd, but the hints were
  // written with ⌘ hardcoded — a key a school Chromebook does not have.
  function labelModifierKeys() {
    var apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    if (apple) return;
    document.querySelectorAll('kbd[data-mod-key]').forEach(function (key) {
      key.textContent = 'Ctrl';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    inject();
    labelModifierKeys();
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

  /* A `position: fixed` panel inside the header is not necessarily laid out
     against the viewport: the header carries a backdrop-filter, which makes it
     the containing block for fixed descendants. Rather than guess which origin
     applies, drop an empty fixed probe at 0,0 next to the panel and see where
     it actually lands — that offset is what viewport coordinates must be
     shifted by. Measuring the panel itself would fold in its open animation's
     transform. */
  function fixedOrigin(panel) {
    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;';
    (panel.parentNode || document.body).appendChild(probe);
    var at = probe.getBoundingClientRect();
    probe.parentNode.removeChild(probe);
    return { top: at.top, left: at.left };
  }

  function positionNavPanel(root, trigger, panel) {
    var header = trigger.closest('.site-header');
    var rect = trigger.getBoundingClientRect();
    var panelWidth = Math.min(400, window.innerWidth - 24);
    var left = rect.left + rect.width / 2 - panelWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));

    // Hang the panel off the bottom of the bar, not off the trigger: the
    // trigger is centred in the header, so a trigger-relative panel opened
    // inside the bar with the header's bottom rule drawn across it.
    var top = header ? header.getBoundingClientRect().bottom + 10 : rect.bottom + 8;

    var origin = fixedOrigin(panel);
    panel.style.position = 'fixed';
    panel.style.top = Math.round(top - origin.top) + 'px';
    panel.style.left = Math.round(left - origin.left) + 'px';
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

    function onScroll() {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function reducedMotionRespect() {
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      function apply() {
        document.documentElement.style.scrollBehavior =
          mq.matches ? 'auto' : 'smooth';
      }
      mq.addEventListener('change', apply);
      apply();
    }
  }

  function getCompletedUnits() {
    return window.ProgressStore ? window.ProgressStore.getCompletedUnits() : [];
  }
  // The certificate prints the date the learner actually finished, so stamp it
  // the first time all ten units are done and never move it afterwards.
  function stampCourseCompletion() {
    var store = window.ProgressStore;
    if (!store) return;
    // getCompletedUnits() already dedupes and range-filters to 1..10, so a
    // length of 10 is exactly "every unit done". Checked here rather than via
    // PyPathCertificate because that module only loads on certificate.html.
    if (store.getCompletedUnits().length !== 10) return;
    var key = window.PyPathKeys ? window.PyPathKeys.COMPLETED_AT_KEY : 'pypath-completed-at';
    if (store.getItem(key)) return;
    store.setItem(key, String(Date.now()));
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

  function isBackupKey(k) {
    var syncable = window.PyPathKeys && window.PyPathKeys.isSyncable(k);
    return k.startsWith('pypath-') || !!syncable;
  }

  function setupSettingsActions() {
    // Scoped to the settings page. core.js runs everywhere, and #export-btn is
    // a generic enough id that another page can claim it in good faith; when
    // the sandbox did, its menu caret silently downloaded a settings backup.
    if (!document.body || !document.body.classList.contains('page-settings')) return;

    var exportBtn = qs('#export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        try {
          var data = {};
          Object.keys(localStorage).forEach(function (k) {
            if (isBackupKey(k)) data[k] = localStorage.getItem(k);
          });
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url;
          link.download = 'pypath-settings.json';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          // Revoking immediately can cancel the download in some browsers --
          // the same rule PyPathExport.download() follows.
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          showToast('Settings exported');
        } catch (e) {
          showToast('Could not export settings');
        }
      });
    }

    var resetBtn = qs('#reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        var confirmed = window.confirm(
          'This permanently deletes your saved progress, lesson code, and sandbox projects on this device. This cannot be undone. Continue?'
        );
        if (!confirmed) return;
        try {
          Object.keys(localStorage).forEach(function (k) {
            if (!isBackupKey(k)) return;
            if (window.PyPathKeys && window.PyPathKeys.isSyncable(k) && window.ProgressStore) {
              window.ProgressStore.removeItem(k);
            } else {
              localStorage.removeItem(k);
            }
          });
        } catch (e) {}
        showToast('Preferences reset');
        setTimeout(function () { location.reload(); }, 400);
      });
    }
  }

  function initSidebarToggle() {
    var layout = document.querySelector('.layout-course');
    var sidebar = layout && layout.querySelector('.course-sidebar');
    if (!sidebar) return;
    var trigger = layout.querySelector('[data-sidebar-toggle]');
    var returnFocus = trigger;
    sidebar.id = sidebar.id || 'lesson-sidebar';
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'Lesson menu');
    sidebar.tabIndex = -1;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'sidebar-collapse-btn';
    close.textContent = 'Close menu';
    close.setAttribute('aria-label', 'Close lesson menu');
    sidebar.prepend(close);
    // Keep the drawer outside transformed/overflow-clipped lesson containers.
    document.body.appendChild(sidebar);
    var backdrop = document.createElement('div');
    backdrop.className = 'lesson-menu-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);

    function setOpen(open, restoreFocus) {
      document.body.classList.toggle('sidebar-open', open);
      document.body.classList.toggle('sidebar-closed', !open);
      sidebar.hidden = !open;
      sidebar.inert = !open;
      backdrop.hidden = !open;
      qsa('[data-sidebar-toggle]').forEach(function (button) {
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-controls', sidebar.id);
        button.setAttribute('aria-label', open ? 'Hide lesson menu' : 'Show lesson menu');
        button.textContent = 'Lesson menu';
      });
      if (open) close.focus({ preventScroll: true });
      else if (restoreFocus && returnFocus) returnFocus.focus({ preventScroll: true });
    }
    setOpen(document.documentElement.dataset.sidebar === 'always', false);
    close.addEventListener('click', function () { setOpen(false, true); });
    backdrop.addEventListener('click', function () { setOpen(false, true); });
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-sidebar-toggle]');
      if (!button) return;
      event.preventDefault();
      returnFocus = button;
      setOpen(sidebar.hidden, true);
    });
    document.addEventListener('keydown', function (event) {
      if (sidebar.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false, true);
      } else if (event.key === 'Tab') {
        var controls = Array.from(sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]'))
          .filter(function (node) { return !node.hidden && node.getClientRects().length; });
        var first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    });
    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false, false); });
    });
    // A visible route back is available without scrolling to the lesson footer.
    var toolbar = layout.querySelector('.sidebar-toggle');
    if (toolbar && !toolbar.querySelector('.lesson-back-link')) {
      var back = document.createElement('a');
      back.className = 'lesson-back-link route';
      back.href = location.pathname.indexOf('/data/') === 0 ? '/data.html' : '/index.html';
      back.textContent = 'Back to path';
      toolbar.appendChild(back);
    }
    if (toolbar) {
      toolbar.setAttribute('data-lesson-navigation', '');
      document.querySelector('main').prepend(toolbar);
    }
    backdrop.addEventListener('wheel', function (event) { event.preventDefault(); }, { passive: false });
  }

  function initInspireBanner() {
    var STORAGE_KEY = 'pypath-inspire-banner-dismissed';
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch (err) {}

    if (qs('.inspire-banner')) return;

    var banner = document.createElement('div');
    banner.className = 'inspire-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Site credit');
    banner.innerHTML =
      '<p class="inspire-banner__text">Inspired by ' +
        '<a class="inspire-banner__link" href="https://runestone.academy/ns/books/published/csawesome/index.html" target="_blank" rel="noopener noreferrer">C.S. Awesome</a>' +
      '</p>' +
      '<button type="button" class="inspire-banner__close" data-inspire-dismiss aria-label="Dismiss banner">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' +
        '</svg>' +
      '</button>';

    document.body.insertBefore(banner, document.body.firstChild);

    function show() {
      document.body.classList.add('has-inspire-banner');
      requestAnimationFrame(function () {
        banner.classList.add('is-visible');
      });
    }

    function dismiss() {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (err) {}
      banner.classList.remove('is-visible');
      banner.classList.add('is-hiding');
      document.body.classList.remove('has-inspire-banner');
      var reduce = prefersReducedMotion();
      window.setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, reduce ? 0 : 480);
    }

    var closeBtn = qs('[data-inspire-dismiss]', banner);
    if (closeBtn) closeBtn.addEventListener('click', dismiss);

    document.addEventListener('keydown', function onKey(e) {
      if (e.key !== 'Escape') return;
      if (!document.body.classList.contains('has-inspire-banner')) return;
      dismiss();
      document.removeEventListener('keydown', onKey);
    });

    show();
  }

  document.addEventListener('DOMContentLoaded', function () {
    currentYear();
    navInteractions();
    stickyHeader();
    reducedMotionRespect();
    stampCourseCompletion();
    updateGlobalProgress();
    setupSettingsActions();
    initSidebarToggle();
    initNavigation();
    initInspireBanner();
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
