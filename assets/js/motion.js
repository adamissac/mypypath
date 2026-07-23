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

  /* Auto-tag common blocks so scroll reveals work sitewide without per-page markup */
  function autoEnhanceReveals() {
    var pairs = [
      ['.units-grid', '.unit-card', 'up'],
      ['.about-team-row', '.team-card', 'up'],
      ['.home-practice__grid', '.home-practice__copy, .hero-live', 'up'],
      ['.home-people', '.home-section__head, .home-person, .home-people__link', 'up'],
      ['.home-endcta', '.home-endcta__inner', 'up'],
      ['.path-journey__intro', null, 'up'],
      ['.page-unit .lesson-content', '.content-section', 'up'],
      ['.page-curriculum .section-head, .page-about .about-mission', null, 'up']
    ];

    pairs.forEach(function (pair) {
      var rootSel = pair[0];
      var childSel = pair[1];
      var dir = pair[2];
      document.querySelectorAll(rootSel).forEach(function (root) {
        if (childSel) {
          root.setAttribute('data-reveal-stagger', '');
          Array.from(root.querySelectorAll(childSel)).forEach(function (el, i) {
            if (el.hasAttribute('data-reveal')) return;
            el.setAttribute('data-reveal', dir);
            if (!el.hasAttribute('data-reveal-delay')) {
              el.setAttribute('data-reveal-delay', String(Math.min(i * 70, 420)));
            }
          });
        } else if (!root.hasAttribute('data-reveal')) {
          root.setAttribute('data-reveal', dir);
        }
      });
    });
  }

  /* Header logo — gentle 3D tilt on pointer, one spin on click */
  function initLogoMotion() {
    var brand = document.querySelector('.site-header .brand');
    if (!brand) return;
    var logo = brand.querySelector('.logo');
    if (!logo) return;

    brand.classList.add('brand--motion');
    logo.classList.add('logo--3d');

    if (prefersReduced()) return;

    var spinning = false;

    brand.addEventListener('pointermove', function (e) {
      if (spinning) return;
      var rect = brand.getBoundingClientRect();
      var px = (e.clientX - rect.left) / Math.max(rect.width, 1);
      var py = (e.clientY - rect.top) / Math.max(rect.height, 1);
      var rotY = (px - 0.5) * 28;
      var rotX = (0.5 - py) * 18;
      logo.style.transform =
        'perspective(420px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg) translateZ(6px)';
    });

    brand.addEventListener('pointerleave', function () {
      if (spinning) return;
      logo.style.transform = '';
    });

    brand.addEventListener('click', function (e) {
      // Don't steal middle/right click or modifier opens
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (spinning) return;
      spinning = true;
      logo.classList.add('is-spinning');
      logo.style.transform = '';
      window.setTimeout(function () {
        logo.classList.remove('is-spinning');
        spinning = false;
      }, 900);
    });
  }

  /* Home atmosphere — soft scroll parallax on topo + trail stub */
  function initHomeParallax() {
    if (prefersReduced()) return;
    if (!document.body.classList.contains('page-home')) return;

    var topo = document.querySelector('.home-hero__topo');
    var trail = document.querySelector('.home-hero__trail-start');
    if (!topo && !trail) return;

    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY || 0;
      if (topo) topo.style.transform = 'translate3d(0,' + (y * 0.12).toFixed(1) + 'px,0)';
      if (trail) trail.style.transform = 'translate3d(0,' + (y * -0.06).toFixed(1) + 'px,0)';
    }

    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
  }

  /* Path section — fade intro + gentle map lift as it enters */
  function initPathPresence() {
    if (prefersReduced()) return;
    var journey = document.querySelector('[data-path-journey]');
    if (!journey) return;
    var map = journey.querySelector('.path-journey__map');
    var intro = journey.querySelector('.path-journey__intro');
    if (intro && !intro.hasAttribute('data-reveal')) intro.setAttribute('data-reveal', 'up');
    if (map) map.classList.add('path-map--alive');
  }

  document.addEventListener('DOMContentLoaded', function () {
    migrateLegacyReveals();
    staggerContainers();
    autoEnhanceReveals();
    initPathPresence();
    initReveal();
    initCountUp();
    initSmoothAnchors();
    initLogoMotion();
    initHomeParallax();
  });
})();
