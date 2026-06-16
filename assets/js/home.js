(function () {
  'use strict';

  function reduced() {
    return window.PyMotion && window.PyMotion.prefersReduced();
  }

  function typewriter(el, text, speed, cb) {
    if (reduced()) {
      el.textContent = text;
      if (cb) cb();
      return;
    }
    var i = 0;
    el.textContent = '';
    function tick() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, speed);
      } else if (cb) {
        cb();
      }
    }
    tick();
  }

  function initHeroTypewriter() {
    var codeLine = document.querySelector('.hero-code-line');
    if (!codeLine) return;
    var text = 'def learn():';
    typewriter(codeLine, text, 55, function () {
      codeLine.classList.add('typed');
      var headline = document.querySelector('.hero-copy .headline');
      if (headline) {
        headline.classList.add('hero-headline-ready', 'is-visible');
      }
    });
  }

  function initHeroCodeReveal() {
    var screen = document.querySelector('.hero-visual .screen code');
    if (!screen || reduced()) return;

    var lines = screen.innerHTML.split('\n');
    var original = screen.innerHTML;
    screen.innerHTML = '';
    screen.classList.add('code-reveal');

    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      var idx = 0;
      function showLine() {
        if (idx >= lines.length) {
          var out = document.createElement('span');
          out.className = 'code-output-line';
          out.textContent = '\n# → Hello, World!';
          screen.appendChild(out);
          return;
        }
        var span = document.createElement('span');
        span.className = 'code-line';
        span.textContent = lines[idx] + (idx < lines.length - 1 ? '\n' : '');
        screen.appendChild(span);
        requestAnimationFrame(function () { span.classList.add('visible'); });
        idx++;
        setTimeout(showLine, 90);
      }
      showLine();
    }, { threshold: 0.3 });

    io.observe(screen.closest('.screen') || screen);
    if (!('IntersectionObserver' in window)) screen.innerHTML = original;
  }

  function initCopyButtons() {
    document.querySelectorAll('[data-copy-code]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sel = btn.getAttribute('data-copy-code');
        var block = document.querySelector(sel);
        if (!block) return;
        var text = block.textContent;
        navigator.clipboard.writeText(text.trim()).then(function () {
          btn.classList.add('copied');
          var label = btn.getAttribute('aria-label') || 'Copy';
          btn.setAttribute('aria-label', 'Copied!');
          setTimeout(function () {
            btn.classList.remove('copied');
            btn.setAttribute('aria-label', label);
          }, 2000);
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.body.classList.contains('page-home')) return;
    initHeroTypewriter();
    initHeroCodeReveal();
    initCopyButtons();
  });
})();
