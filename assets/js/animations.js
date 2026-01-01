(function() {
  function revealOnScroll() {
    const elements = document.querySelectorAll('.reveal, .reveal-up, .reveal-left, .reveal-right, .reveal-scale');
    if (!('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('revealed'));
      return;
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '40px' });
    elements.forEach(el => io.observe(el));
  }

  function pageTransitions() {
    // Detect if mobile/touch device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     ('ontouchstart' in window) || 
                     (navigator.maxTouchPoints > 0);
    
    // Disable page transitions on mobile to prevent accidental redirects
    if (isMobile) {
      return;
    }
    
    // Subtle fade/blur without overlay (desktop only)
    document.addEventListener('click', (e) => {
      // Don't intercept if clicking on a button or inside a button
      if (e.target.closest('button') || e.target.tagName === 'BUTTON') {
        return;
      }
      
      // Don't intercept if clicking on inputs, textareas, or other form elements
      if (e.target.closest('input, textarea, select, label')) {
        return;
      }
      
      // Don't intercept if clicking on code blocks or interactive elements
      if (e.target.closest('pre, code, .code-example, .interactive-editor, .practice-box')) {
        return;
      }
      
      // Only intercept if clicking directly on a link element itself
      const a = e.target.closest('a.route');
      if (!a) return;
      
      // Only proceed if clicking directly on the link or its direct text content
      if (e.target !== a && e.target.parentElement !== a && !(e.target.nodeType === 3 && e.target.parentElement === a)) {
        return;
      }
      
      // Don't intercept if link has special attributes
      if (a.target === '_blank' || a.hasAttribute('download') || a.href.indexOf('#') !== -1) {
        return;
      }
      
      // Don't intercept if the link contains interactive elements
      if (a.querySelector('button, input, textarea, select, .btn')) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.add('route-leaving');
      setTimeout(() => { window.location.href = a.href; }, 180);
    });
  }

  function heroParallax() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const orb1 = hero.querySelector('.orb-1');
    const orb2 = hero.querySelector('.orb-2');
    const screen = hero.querySelector('.screen');
    let rafId = null;
    let targetX = 0, targetY = 0;
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = x; targetY = y;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        if (orb1) orb1.style.transform = `translate(${x * 14}px, ${y * -10}px)`;
        if (orb2) orb2.style.transform = `translate(${x * -10}px, ${y * 12}px)`;
        if (screen) screen.style.transform = `perspective(900px) rotateY(${x * -8}deg) rotateX(${y * 6}deg)`;
        rafId = null;
      });
    });
    hero.addEventListener('mouseleave', () => {
      if (orb1) orb1.style.transform = '';
      if (orb2) orb2.style.transform = '';
      if (screen) screen.style.transform = '';
    });
  }

  function staggerContainers() {
    // Apply stagger delays to children when parent revealed
    const containers = document.querySelectorAll('.stagger');
    containers.forEach(container => {
      const children = Array.from(container.children);
      children.forEach((el, i) => {
        el.style.transitionDelay = `${80 * i}ms`;
      });
    });
    // when reveal fires, add revealed class to enable stagger CSS transitions
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '40px' });
    containers.forEach(c => io.observe(c));
  }

  function autoTagReveal() {
    const selectors = [
      '.features-grid .feature',
      '.units-grid .unit-card',
      '.testimonials .testimonial',
      '.section-head h2',
    ];
    selectors.forEach(sel => {
      const nodes = Array.from(document.querySelectorAll(sel));
      nodes.forEach((el, i) => {
        if (el.classList.matches?.('reveal, .reveal-up, .reveal-left, .reveal-right, .reveal-scale')) return;
        if (sel.includes('h2')) { el.classList.add('reveal-up'); return; }
        if (sel.includes('units-grid')) { el.classList.add('reveal-scale'); return; }
        if (sel.includes('features-grid') || sel.includes('testimonials')) {
          el.classList.add(i % 2 === 0 ? 'reveal-left' : 'reveal-right');
          return;
        }
        el.classList.add('reveal');
      });
    });
  }

  window.PyAnim = { revealOnScroll, pageTransitions, heroParallax, staggerContainers };

  document.addEventListener('DOMContentLoaded', () => {
    autoTagReveal();
    revealOnScroll();
    pageTransitions();
    heroParallax();
    staggerContainers();
    
    // Fallback: reveal all elements after a short delay if IntersectionObserver fails
    setTimeout(() => {
      const unrevealed = document.querySelectorAll('.reveal-up:not(.revealed)');
      if (unrevealed.length > 0) {
        unrevealed.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight + 100) {
            el.classList.add('revealed');
          }
        });
      }
    }, 500);
  });
})();


