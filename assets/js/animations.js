(function () {
  function revealOnScroll() {
    var elements = document.querySelectorAll('.reveal, .reveal-up, .reveal-left, .reveal-right, .reveal-scale');
    if (!elements.length) return;

    var reduced = window.PyMotion && window.PyMotion.prefersReduced();

    elements.forEach(function (el) {
      if (!el.hasAttribute('data-reveal')) {
        var dir = 'up';
        if (el.classList.contains('reveal-left')) dir = 'left';
        else if (el.classList.contains('reveal-right')) dir = 'right';
        else if (el.classList.contains('reveal-scale')) dir = 'scale';
        else if (el.classList.contains('reveal')) dir = 'fade';
        el.setAttribute('data-reveal', dir);
      }
    });

    if (reduced) {
      elements.forEach(function (el) { el.classList.add('is-visible', 'revealed'); });
      return;
    }

    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (el) { el.classList.add('is-visible', 'revealed'); });
      return;
    }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible', 'revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

    elements.forEach(function (el) { io.observe(el); });
  }

  function pageTransitions() {
    /* Instant navigation — no artificial delay or exit animation */
  }

  function heroParallax() {
    if (window.PyMotion && window.PyMotion.prefersReduced()) return;
    var hero = document.querySelector('.hero');
    if (!hero || !window.matchMedia('(pointer: fine)').matches) return;

    var orb1 = hero.querySelector('.orb-1');
    var orb2 = hero.querySelector('.orb-2');
    var screen = hero.querySelector('.screen');
    var rafId = null;

    hero.addEventListener('mousemove', function (e) {
      var rect = hero.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      if (rafId) return;
      rafId = requestAnimationFrame(function () {
        if (orb1) orb1.style.transform = 'translate(' + (x * 14) + 'px,' + (y * -10) + 'px)';
        if (orb2) orb2.style.transform = 'translate(' + (x * -10) + 'px,' + (y * 12) + 'px)';
        if (screen) screen.style.transform = 'perspective(900px) rotateY(' + (x * -6) + 'deg) rotateX(' + (y * 4) + 'deg)';
        rafId = null;
      });
    });

    hero.addEventListener('mouseleave', function () {
      if (orb1) orb1.style.transform = '';
      if (orb2) orb2.style.transform = '';
      if (screen) screen.style.transform = '';
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

  window.PyAnim = { revealOnScroll: revealOnScroll, pageTransitions: pageTransitions, heroParallax: heroParallax };

  document.addEventListener('DOMContentLoaded', function () {
    staggerContainers();
    revealOnScroll();
    heroParallax();
  });
})();
