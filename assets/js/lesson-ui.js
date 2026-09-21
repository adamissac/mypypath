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

  /* ── Lesson table of contents ─────────────────────────────────────────
     One navigation built from the lesson's own <h2> section headings. It is
     a sticky column beside the lesson on desktop and a disclosure above the
     lesson below 1024px -- the same <nav>, moved, rather than two copies
     that would duplicate every link for a screen reader.

     The unit menu (.course-sidebar, an overlay dialog owned by core.js) is a
     different thing: that one moves between lessons, this one moves within
     the lesson. Both are needed and neither replaces the other. */

  var DESKTOP_TOC = '(min-width: 1024px)';

  /* The section a reader has just asked for.
     A jump lands the heading at the scrollport's padding edge, but the page
     keeps settling afterwards -- a check renders, an editor takes its height --
     and content ABOVE the target pushes it back down. The browser has already
     finished scrolling, so the heading ends up below the reading line and the
     column marks the section before it as current, immediately after the
     reader clicked this one. Measured at 210px against a 154px line on the
     final review of unit-1/variables-types.

     So a clicked topic is the current one until the reader scrolls away from
     it. Re-scrolling to correct the drift was the alternative and is worse: it
     would yank the page under anyone who started reading in the meantime. */
  var pendingSection = null;
  var pendingAt = 0;

  function clearPending() { pendingSection = null; }

  // The reader taking over ends the jump, whatever the animation is doing.
  ['wheel', 'touchstart', 'keydown'].forEach(function (type) {
    document.addEventListener(type, clearPending, { passive: true });
  });

  function media(query) {
    return typeof matchMedia === 'function'
      ? matchMedia(query)
      : { matches: false, addEventListener: null, addListener: null };
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section';
  }

  function buildLessonToc(content) {
    var headings = Array.from(content.querySelectorAll('h2'));
    if (headings.length < 2) return null;

    var aside = document.createElement('aside');
    aside.className = 'lesson-toc';
    var details = document.createElement('details');
    details.className = 'lesson-toc__disclosure';
    var summary = document.createElement('summary');
    summary.className = 'lesson-toc__summary';
    var label = document.createElement('span');
    label.className = 'lesson-toc__label';
    label.textContent = 'In this lesson';
    var count = document.createElement('span');
    count.className = 'lesson-toc__count';
    summary.appendChild(label);
    summary.appendChild(count);
    details.appendChild(summary);

    /* The docked panel's own header. Below 1024px the <summary> above is the
       header and this is hidden; above it, the summary is hidden and this
       carries the label and the collapse control. */
    var head = document.createElement('div');
    head.className = 'lesson-toc__head';
    var heading = document.createElement('span');
    heading.className = 'lesson-toc__heading';
    heading.textContent = 'In this lesson';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lesson-toc__toggle';
    head.appendChild(heading);
    head.appendChild(toggle);

    var nav = document.createElement('nav');
    nav.className = 'lesson-toc__nav';
    nav.id = 'lesson-toc-nav';
    nav.setAttribute('aria-label', 'Sections in this lesson');
    var list = document.createElement('ol');
    list.className = 'lesson-toc__list';
    nav.appendChild(list);
    details.appendChild(head);
    details.appendChild(nav);
    aside.appendChild(details);

    /* Collapsing must not move the lesson.
       The grid track keeps its width whether the panel is open or shut, so the
       reading column's left edge and its width are identical in both states --
       the freed space becomes gutter rather than being handed to the text.
       This is the whole point: the previous version of a collapsible menu here
       was a column in the lesson's own grid, and opening it moved the left
       edge and re-wrapped the paragraph someone was in the middle of. */
    var STORE = 'pypath-lesson-contents';
    function setCollapsed(collapsed, moveFocus) {
      aside.classList.toggle('is-collapsed', collapsed);
      nav.hidden = collapsed;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-controls', nav.id);
      toggle.setAttribute('aria-label', collapsed ? 'Show lesson contents' : 'Hide lesson contents');
      toggle.textContent = collapsed ? 'Contents' : 'Hide';
      if (moveFocus) toggle.focus();
      try { localStorage.setItem(STORE, collapsed ? 'hidden' : 'shown'); } catch (err) {}
    }
    var stored = null;
    try { stored = localStorage.getItem(STORE); } catch (err) {}
    setCollapsed(stored === 'hidden', false);
    toggle.addEventListener('click', function () {
      setCollapsed(!aside.classList.contains('is-collapsed'), true);
    });

    var indexed = new Set();
    var links = [];

    function uniqueId(heading) {
      // A heading that already carries an id keeps it: quiz checkpoints are
      // linked by id from their review links, and a reader may have
      // bookmarked one.
      if (heading.id) return heading.id;
      var base = slugify(heading.textContent.trim());
      var id = base;
      for (var n = 2; document.getElementById(id); n += 1) id = base + '-' + n;
      return id;
    }

    function addHeading(heading) {
      if (indexed.has(heading)) return;
      indexed.add(heading);
      heading.id = uniqueId(heading);
      /* Focusable before the jump, not during it. A fragment navigation moves
         focus to the target only if the target is already focusable when the
         browser handles it, and resets focus to <body> otherwise -- so setting
         tabindex inside the click handler was a race that a screen-reader user
         lost: the page scrolled and their focus was thrown to the top. */
      heading.setAttribute('tabindex', '-1');
      var item = document.createElement('li');
      item.className = 'lesson-toc__item';
      var link = document.createElement('a');
      link.className = 'lesson-toc__link';
      link.href = '#' + heading.id;
      link.textContent = heading.textContent.trim();
      link.addEventListener('click', function () {
        pendingSection = link;
        pendingAt = Date.now();
        // Native anchor navigation keeps history, deep links and the URL
        // working, and the scrollport's scroll-padding-top keeps the heading
        // clear of the fixed header. Focus follows the jump for keyboard and
        // screen-reader visitors.
        heading.focus({ preventScroll: true });
        if (!media(DESKTOP_TOC).matches) details.open = false;
      });
      item.appendChild(link);
      // A quiz can arrive between existing sections after fetch completes.
      // Insert its link at its real document position, not the end.
      var next = Array.from(list.children).find(function (existing) {
        var other = document.getElementById(existing.querySelector('a').hash.slice(1));
        return other && !!(heading.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      list.insertBefore(item, next || null);
      links = Array.from(list.querySelectorAll('a'));
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

    return {
      aside: aside,
      details: details,
      list: list,
      headings: function () { return Array.from(indexed); },
      links: function () { return links; }
    };
  }

  /* The TOC lives beside the lesson on a wide screen and above it on a narrow
     one. Those are different parents, so the node moves rather than being
     duplicated -- a second copy would put every section link in the
     accessibility tree twice. */
  function placeLessonToc(toc, layout, content) {
    var query = media(DESKTOP_TOC);

    function place() {
      var desktop = query.matches;
      if (desktop && layout) {
        if (toc.aside.parentElement !== layout) layout.insertBefore(toc.aside, layout.firstChild);
        layout.classList.add('layout-course--with-toc');
      } else {
        if (toc.aside.parentElement !== content.parentElement) content.before(toc.aside);
        if (layout) layout.classList.remove('layout-course--with-toc');
      }
      // Open and summary-less beside the lesson; a collapsed disclosure above it.
      toc.details.open = desktop;
      toc.aside.classList.toggle('lesson-toc--docked', desktop);
      // The lesson toolbar above the canvas widens to match only when the
      // column is really there.
      document.body.classList.toggle('has-lesson-toc', desktop);
    }

    place();
    if (query.addEventListener) query.addEventListener('change', place);
    else if (query.addListener) query.addListener(place);
  }

  /* Active section. IntersectionObserver fires only when a heading crosses the
     reading line, not on every scroll frame, so the rect scan below runs a
     handful of times per lesson rather than continuously. */
  function trackActiveSection(toc) {
    if (typeof IntersectionObserver !== 'function') return;
    var frame = null;

    /* The reading line is derived from the scrollport's own scroll-padding-top
       -- the exact offset the browser uses when it lands an anchor. Reading
       --header-height here instead meant two answers to one question: the
       banner redefines it on <body>, so an anchor cleared 118px while this
       still believed 76, a heading landed below the line it was supposed to
       have crossed, and the column marked the section above it as current. */
    function headerOffset() {
      var root = getComputedStyle(document.documentElement);
      var pad = parseFloat(root.scrollPaddingTop);
      if (isNaN(pad)) {
        var header = parseFloat(root.getPropertyValue('--header-height'));
        pad = (isNaN(header) ? 76 : header) + 12;
      }
      return pad + 24;
    }

    function update() {
      frame = null;
      var links = toc.links();
      if (!links.length) return;
      var line = headerOffset();
      var active = null;
      links.forEach(function (link) {
        var heading = document.getElementById(link.hash.slice(1));
        if (heading && heading.getBoundingClientRect().top <= line) active = link;
      });
      // Before the first heading scrolls past the line, the first section is
      // still the one being read.
      if (!active) active = links[0];
      /* At the end of the document the last section can never reach the
         reading line -- there is no scroll left to bring it there -- so
         without this the final review stays unmarked however far down a
         reader goes, and the column points at the section above it. */
      var root = document.documentElement;
      if (window.innerHeight + window.scrollY >= root.scrollHeight - 2) {
        active = links[links.length - 1];
      }
      if (pendingSection) {
        var asked = document.getElementById(pendingSection.hash.slice(1));
        if (!asked) {
          pendingSection = null;
        } else if (Date.now() - pendingAt < 2000) {
          // Still travelling. A smooth jump runs for several frames and the
          // target is far down the page for all of them, so its position says
          // nothing yet.
          active = pendingSection;
        } else {
          var top = asked.getBoundingClientRect().top;
          // Arrived. Hold it while it is still in the reading area, which is
          // what keeps it marked when the page settled it a little too low.
          if (top > -8 && top < window.innerHeight * 0.6) active = pendingSection;
          else pendingSection = null;
        }
      }
      links.forEach(function (link) {
        var on = link === active;
        link.classList.toggle('is-active', on);
        if (on) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      revealActive(toc.list, active);
    }

    function schedule() {
      if (frame === null) frame = requestAnimationFrame(update);
    }

    var observer = new IntersectionObserver(schedule, {
      rootMargin: '-' + headerOffset() + 'px 0px -55% 0px',
      threshold: 0
    });

    function observeAll() {
      toc.headings().forEach(function (heading) { observer.observe(heading); });
    }

    observeAll();
    // Re-observe when async checks add sections.
    new MutationObserver(function () { observeAll(); schedule(); })
      .observe(toc.list, { childList: true });
    window.addEventListener('hashchange', schedule);

    /* The observer fires on crossings, which is every frame that matters
       while a reader scrolls -- but a smooth jump from the column comes to
       rest AFTER its last crossing, so the section just jumped to was not yet
       the current one. `scrollend` is one event at the end of a gesture, not a
       listener that runs while scrolling. Where it is unsupported, a passive
       listener coalesced into the same rAF does the same job; update() reads a
       dozen rects and runs at most once a frame either way. */
    if ('onscrollend' in window) window.addEventListener('scrollend', schedule);
    else window.addEventListener('scroll', schedule, { passive: true });

    schedule();
  }

  /* Keep the current topic in view when a long lesson overflows the docked
     list, without scrolling the page itself. */
  function revealActive(list, link) {
    if (list.scrollHeight <= list.clientHeight + 1) return;
    // .lesson-toc__list is position: relative, so offsetTop is measured
    // against the list itself.
    var item = link.parentElement;
    var top = item.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + item.offsetHeight - list.clientHeight;
    }
  }

  /* Heading ids are assigned here, after parse, so a lesson opened directly on
     #some-topic has nothing to land on at load time. Land it once the ids
     exist. */
  function landOnInitialHash() {
    if (!location.hash) return;
    var target;
    try {
      target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch (err) {
      return;
    }
    if (!target) return;
    requestAnimationFrame(function () {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }

  /* Focus follows the section, however the section was reached.
     Doing this only in the link's click handler left it dependent on the order
     the click handler and the browser's own fragment navigation ran in, which
     is not fixed -- and it did nothing at all for Back, Forward, or a link
     into the lesson from somewhere else on the page. One listener on the
     thing that actually changed covers all of them. */
  function focusSectionFromHash(content) {
    window.addEventListener('hashchange', function () {
      var target;
      try {
        target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      } catch (err) {
        return;
      }
      if (!target || !content.contains(target)) return;
      target.setAttribute('tabindex', '-1');
      /* Next frame, not this one. The browser does its own focus handling as
         part of navigating to a fragment, and it does not always finish before
         hashchange is delivered: focusing here directly landed on the heading
         three times out of four and was reset to <body> on the fourth. */
      requestAnimationFrame(function () {
        target.focus({ preventScroll: true });
      });
    });
  }

  function enhanceLessonFlow() {
    var content = document.querySelector('.course-main .lesson-content');
    if (!content || document.querySelector('.lesson-toc')) return;
    document.body.classList.add('lesson-reading');
    var toc = buildLessonToc(content);
    if (toc) {
      placeLessonToc(toc, document.querySelector('.layout-course'), content);
      trackActiveSection(toc);
      focusSectionFromHash(content);
      landOnInitialHash();
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
