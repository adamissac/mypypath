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
