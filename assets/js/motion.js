(function () {
  'use strict';

  var REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

  function prefersReduced() {
    if (window.matchMedia && window.matchMedia(REDUCED_QUERY).matches) return true;
    return document.body && document.body.dataset.motion === 'off';
  }

  window.PyMotion = {
    prefersReduced: prefersReduced,
    reduced: prefersReduced
  };

  document.documentElement.classList.add('js-enabled');

  if (window.matchMedia) {
    var mq = window.matchMedia(REDUCED_QUERY);
    mq.addEventListener('change', function () {
      document.documentElement.classList.toggle('reduced-motion', mq.matches);
    });
    document.documentElement.classList.toggle('reduced-motion', mq.matches);
  }

  var observer = null;

  function getDelay(el, index) {
    var custom = el.getAttribute('data-reveal-delay');
    if (custom !== null) return parseInt(custom, 10) || 0;
    var parent = el.closest('[data-reveal-stagger]');
    if (parent) {
      var siblings = Array.from(parent.querySelectorAll('[data-reveal]'));
      var idx = siblings.indexOf(el);
      if (idx >= 0) return idx * 75;
    }
    if (typeof index === 'number') return index * 75;
    return 0;
  }

  function revealElement(el, delay) {
    if (delay) el.style.transitionDelay = delay + 'ms';
    el.classList.add('is-visible', 'revealed');
  }

  function migrateLegacyReveals() {
    document.querySelectorAll('.reveal, .reveal-up, .reveal-left, .reveal-right, .reveal-scale').forEach(function (el) {
      if (el.hasAttribute('data-reveal')) return;
      var dir = 'up';
      if (el.classList.contains('reveal-left')) dir = 'left';
      else if (el.classList.contains('reveal-right')) dir = 'right';
      else if (el.classList.contains('reveal-scale')) dir = 'scale';
      else if (el.classList.contains('reveal')) dir = 'fade';
      el.setAttribute('data-reveal', dir);
    });
  }

  function staggerContainers() {
    document.querySelectorAll('.stagger').forEach(function (container) {
      container.setAttribute('data-reveal-stagger', '');
      Array.from(container.children).forEach(function (el, i) {
        if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'up');
        el.setAttribute('data-reveal-delay', String(i * 80));
      });
    });
  }

  function initReveal() {
    var nodes = document.querySelectorAll('[data-reveal]');
    if (!nodes.length) return;

    if (prefersReduced()) {
      nodes.forEach(function (el) { el.classList.add('is-visible', 'revealed'); });
      return;
    }

    nodes.forEach(function (el, i) {
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.95) {
        revealElement(el, getDelay(el, i));
      }
    });

    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (el, i) {
        if (!el.classList.contains('is-visible')) revealElement(el, getDelay(el, i));
      });
      return;
    }

    observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        revealElement(el, getDelay(el));
        obs.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -2% 0px' });

    nodes.forEach(function (el) {
      if (!el.classList.contains('is-visible')) observer.observe(el);
    });
  }

  function initCountUp() {
    document.querySelectorAll('[data-count-up]').forEach(function (el) {
      var target = parseInt(el.getAttribute('data-count-up'), 10);
      if (isNaN(target)) return;

      if (prefersReduced()) {
        el.textContent = String(target);
        return;
      }

      function run() {
        var start = 0;
        var duration = 800;
        var startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var p = Math.min((ts - startTime) / duration, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = String(Math.round(start + (target - start) * eased));
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }

      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries, obs) {
          if (entries[0].isIntersecting) {
            run();
            obs.disconnect();
          }
        }, { threshold: 0.5 });
        io.observe(el);
      } else {
        run();
      }
    });
  }

  function initSmoothAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute('href') === '#') return;
      var id = a.getAttribute('href');
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var header = document.querySelector('.site-header');
      var offset = header ? header.offsetHeight + 12 : 0;
      var top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({
        top: top,
        behavior: prefersReduced() ? 'auto' : 'smooth'
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    migrateLegacyReveals();
    staggerContainers();
    initReveal();
    initCountUp();
    initSmoothAnchors();
  });
})();
