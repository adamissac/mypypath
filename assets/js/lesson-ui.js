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

  function setCopyState(btn, icon, label) {
    btn.innerHTML =
      (window.PyIcons ? window.PyIcons.svg(icon, 14) : '') +
      '<span class="copy-snippet-btn__label">' + label + '</span>';
  }

  function initCopySnippets() {
    document.querySelectorAll('pre.code, .code-example pre').forEach(function (pre) {
      var wrap = pre.parentElement;
      // The wrapper is what the button is positioned against, so the snippet
      // always needs one of its own — without it the button anchored to
      // whatever happened to be positioned further up the page.
      if (!wrap || !wrap.classList.contains('code-block-wrap')) {
        wrap = document.createElement('div');
        wrap.className = 'code-block-wrap';
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(pre);
      }
      if (wrap.querySelector('.copy-snippet-btn')) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-snippet-btn';
      btn.setAttribute('aria-label', 'Copy code');
      setCopyState(btn, 'copy', 'Copy');

      var resetTimer = null;
      btn.addEventListener('click', function () {
        clearTimeout(resetTimer);

        function settle(cls, icon, label, announce) {
          btn.classList.remove('copied', 'copy-failed');
          if (cls) btn.classList.add(cls);
          setCopyState(btn, icon, label);
          btn.setAttribute('aria-label', announce);
          if (cls) {
            resetTimer = setTimeout(function () {
              btn.classList.remove(cls);
              setCopyState(btn, 'copy', 'Copy');
              btn.setAttribute('aria-label', 'Copy code');
            }, 2000);
          }
        }

        var copy = navigator.clipboard
          ? navigator.clipboard.writeText(pre.textContent.trim())
          : Promise.reject(new Error('clipboard unavailable'));

        copy.then(
          function () {
            settle('copied', 'check', 'Copied', 'Code copied to clipboard');
          },
          function () {
            // Denied permission, or an insecure origin. Say so rather than
            // leaving the button looking like nothing happened.
            settle('copy-failed', 'copy', 'Press Ctrl+C', 'Copy failed — select the code and press Ctrl+C');
          }
        );
      });

      wrap.appendChild(btn);
    });
  }

  function enhanceLessonFlow() {
    var content = document.querySelector('.course-main .lesson-content');
    if (!content || document.querySelector('.lesson-outline')) return;
    document.body.classList.add('lesson-reading');
    var headings = Array.from(content.querySelectorAll('h2'));
    if (headings.length > 1) {
      var details = document.createElement('details');
      details.className = 'lesson-outline';
      var summary = document.createElement('summary');
      summary.textContent = 'In this lesson';
      var count = document.createElement('span');
      count.textContent = headings.length + ' sections';
      summary.appendChild(count);
      details.appendChild(summary);
      var nav = document.createElement('nav');
      nav.setAttribute('aria-label', 'Sections in this lesson');
      var list = document.createElement('ol');
      var indexed = new Set();
      function addHeading(heading) {
        if (indexed.has(heading)) return;
        var index = indexed.size;
        indexed.add(heading);
        if (!heading.id) {
          var id = 'lesson-section-' + (index + 1);
          while (document.getElementById(id)) id += '-section';
          heading.id = id;
        }
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.href = '#' + heading.id;
        link.textContent = heading.textContent.trim();
        link.addEventListener('click', function () {
          // Native anchor navigation keeps history and deep links working.
          // Focus follows the jump for keyboard and screen-reader visitors.
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        });
        item.appendChild(link);
        list.appendChild(item);
        count.textContent = indexed.size + ' sections';
      }
      headings.forEach(addHeading);
      // Knowledge checks arrive after the page's initial lesson markup.
      new MutationObserver(function (changes) {
        changes.forEach(function (change) {
          change.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.matches('h2')) addHeading(node);
            node.querySelectorAll('h2').forEach(addHeading);
          });
        });
      }).observe(content, { childList: true, subtree: true });
      nav.appendChild(list);
      details.appendChild(nav);
      content.before(details);
    }
    content.querySelectorAll('.interactive-editor').forEach(function (editor) {
      var toolbar = editor.querySelector('.editor-toolbar-small');
      if (!toolbar) return;
      var run = toolbar.querySelector('.btn-run');
      var reset = toolbar.querySelector('.btn-reset');
      var clear = toolbar.querySelector('.btn-clear');
      if (run) run.textContent = 'Run code';
      if (reset) reset.textContent = 'Reset code';
      if (clear) {
        clear.textContent = 'Clear saved code';
        clear.title = 'Clear this editor and its saved code';
      }
      var hint = document.createElement('p');
      hint.className = 'editor-keyboard-hint';
      hint.textContent = 'Ctrl / ⌘ + Enter to run · Escape to leave the editor';
      editor.appendChild(hint);
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
    enhanceLessonFlow();
    enhanceRunButtons();
  });
})();
