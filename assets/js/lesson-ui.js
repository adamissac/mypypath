(function () {
  'use strict';

  function reduced() {
    return window.PyMotion && window.PyMotion.prefersReduced();
  }

  function initReadingProgress() {
    if (!document.body.classList.contains('page-unit')) return;
    var bar = document.createElement('div');
    bar.className = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<div class="reading-progress-bar"></div>';
    document.body.appendChild(bar);
    var fill = bar.querySelector('.reading-progress-bar');

    function update() {
      var main = document.querySelector('.course-main') || document.documentElement;
      var scrollTop = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
      fill.style.transform = 'scaleX(' + pct + ')';
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function initCopySnippets() {
    document.querySelectorAll('pre.code, .code-example pre').forEach(function (pre) {
      if (pre.querySelector('.copy-snippet-btn')) return;
      var wrap = pre.parentElement;
      if (!wrap || wrap.classList.contains('code-block-wrap')) {
        wrap = document.createElement('div');
        wrap.className = 'code-block-wrap';
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(pre);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-snippet-btn';
      btn.setAttribute('aria-label', 'Copy code');
      if (window.PyIcons) btn.innerHTML = window.PyIcons.svg('copy', 16);
      btn.addEventListener('click', function () {
        var text = pre.textContent;
        navigator.clipboard.writeText(text.trim()).then(function () {
          btn.classList.add('copied');
          if (window.PyIcons) btn.innerHTML = window.PyIcons.svg('check', 16);
          setTimeout(function () {
            btn.classList.remove('copied');
            if (window.PyIcons) btn.innerHTML = window.PyIcons.svg('copy', 16);
          }, 2000);
        });
      });
      wrap.appendChild(btn);
    });
  }

  function enhanceRunButtons() {
    document.querySelectorAll('.run-code-btn, [data-run-code]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.add('is-running');
        setTimeout(function () { btn.classList.remove('is-running'); }, 1200);
      });
    });
  }

  function tabTargets(tab, arg) {
    var onclick = tab.getAttribute('onclick') || '';
    return (
      onclick.indexOf("('" + arg + "')") !== -1 ||
      onclick.indexOf('("' + arg + '")') !== -1 ||
      tab.getAttribute('data-os') === arg ||
      tab.getAttribute('data-terminal') === arg
    );
  }

  function switchTabGroup(options) {
    var targetId = options.targetId;
    var tabArg = options.tabArg || targetId;
    var panel = document.getElementById(targetId);
    if (!panel) return;

    var root = panel.closest(options.rootSelector) || document;
    var tabs = root.querySelectorAll(options.tabSelector);
    var panels = root.querySelectorAll(options.panelSelector);

    panels.forEach(function (el) {
      el.classList.toggle('active', el === panel || el.id === targetId);
    });

    tabs.forEach(function (tab) {
      var isActive = tabTargets(tab, tabArg);
      tab.classList.toggle('active', isActive);
      if (tab.hasAttribute('aria-selected')) {
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    });
  }

  // Used by Windows/Mac install + terminal instruction tabs in unit lessons.
  window.switchOS = function (os) {
    if (!os) return;
    switchTabGroup({
      targetId: os + '-instructions',
      tabArg: os,
      rootSelector: '.installation-steps',
      tabSelector: '.os-tab',
      panelSelector: '.os-instructions'
    });
  };

  window.switchTerminal = function (terminalId) {
    if (!terminalId) return;
    switchTabGroup({
      targetId: terminalId,
      tabArg: terminalId,
      rootSelector: '.terminal-guide',
      tabSelector: '.terminal-tab',
      panelSelector: '.terminal-instructions'
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    initReadingProgress();
    initCopySnippets();
    enhanceRunButtons();
  });
})();
