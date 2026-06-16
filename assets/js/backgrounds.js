(function () {
  'use strict';

  function reduced() {
    return window.PyMotion && window.PyMotion.prefersReduced();
  }

  function parseLayers() {
    var raw = document.body.getAttribute('data-bg') || '';
    return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function mountLayers() {
    if (reduced()) return;
    var layers = parseLayers();
    if (!layers.length) return;

    var root = document.createElement('div');
    root.className = 'bg-layers';
    root.setAttribute('aria-hidden', 'true');

    layers.forEach(function (name) {
      if (name === 'glow' || name === 'noise') return;
      var el = document.createElement('div');
      el.className = 'bg-layer bg-layer--' + name;
      if (name === 'aurora') {
        var orb = document.createElement('div');
        orb.className = 'bg-aurora-orb';
        orb.setAttribute('aria-hidden', 'true');
        el.appendChild(orb);
      }
      if (name === 'constellation') {
        var canvas = document.createElement('canvas');
        canvas.className = 'bg-constellation-canvas';
        el.appendChild(canvas);
      }
      root.appendChild(el);
    });

    document.body.insertBefore(root, document.body.firstChild);

    if (layers.indexOf('glow') !== -1) initCursorGlow(root);
    return root;
  }

  function initConstellation(root) {
    var canvas = root && root.querySelector('.bg-constellation-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var particles = [];
    var count = window.innerWidth < 768 ? 16 : 30;
    var raf = null;
    var visible = true;
    var lastTs = 0;
    var mouseX = null;
    var mouseY = null;
    var smoothMx = null;
    var smoothMy = null;
    var color = '#0EA5E9';
    var colorTick = 0;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initParticles() {
      particles = [];
      var w = window.innerWidth;
      var h = window.innerHeight;
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.08,
          vy: (Math.random() - 0.5) * 0.08,
          r: Math.random() * 1 + 0.5
        });
      }
    }

    function wrapParticle(p, w, h) {
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;
    }

    function draw(ts) {
      if (!visible || reduced()) {
        raf = null;
        return;
      }

      if (!lastTs) lastTs = ts;
      var dt = Math.min((ts - lastTs) / 16.667, 2.5);
      lastTs = ts;

      if (++colorTick % 120 === 0) {
        color = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0EA5E9';
      }

      var w = window.innerWidth;
      var h = window.innerHeight;
      var hasPointer = window.matchMedia('(pointer: fine)').matches;

      if (hasPointer && mouseX !== null) {
        if (smoothMx === null) {
          smoothMx = mouseX;
          smoothMy = mouseY;
        } else {
          var follow = 1 - Math.pow(0.015, dt);
          smoothMx += (mouseX - smoothMx) * follow;
          smoothMy += (mouseY - smoothMy) * follow;
        }
      } else {
        smoothMx = null;
        smoothMy = null;
      }

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (smoothMx !== null) {
          var dxm = smoothMx - p.x;
          var dym = smoothMy - p.y;
          var distm = Math.sqrt(dxm * dxm + dym * dym);
          if (distm < 220) {
            var pull = (1 - distm / 220) * 0.012 * dt;
            p.x += dxm * pull;
            p.y += dym * pull;
          }
        }

        wrapParticle(p, w, h);
      }

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = color;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        ctx.globalAlpha = 0.32;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.lineWidth = 0.6;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        for (var j = i + 1; j < particles.length; j++) {
          var q = particles[j];
          var dx = p.x - q.x;
          var dy = p.y - q.y;
          var dist = dx * dx + dy * dy;
          if (dist < 10000) {
            dist = Math.sqrt(dist);
            ctx.globalAlpha = 0.07 * (1 - dist / 100);
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (raf) return;
      lastTs = 0;
      raf = requestAnimationFrame(draw);
    }

    function stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    resize();
    initParticles();
    start();

    window.addEventListener('resize', function () {
      resize();
      initParticles();
    });

    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden;
      if (visible) start();
      else stop();
    });

    if (window.matchMedia('(pointer: fine)').matches) {
      document.addEventListener('mousemove', function (e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
      }, { passive: true });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting && !document.hidden;
        if (visible) start();
        else stop();
      }, { threshold: 0 });
      io.observe(canvas);
    }
  }

  function initCursorGlow(root) {
    if (!root || reduced() || !window.matchMedia('(pointer: fine)').matches) return;
    var glow = document.createElement('div');
    glow.className = 'bg-cursor-glow';
    root.appendChild(glow);

    var x = window.innerWidth * 0.5;
    var y = window.innerHeight * 0.5;
    var tx = x;
    var ty = y;
    var lastTs = 0;
    var half = 210;

    document.addEventListener('mousemove', function (e) {
      tx = e.clientX;
      ty = e.clientY;
    }, { passive: true });

    function tick(ts) {
      if (!lastTs) lastTs = ts;
      var dt = Math.min((ts - lastTs) / 16.667, 2.5);
      lastTs = ts;

      var ease = 1 - Math.pow(0.04, dt);
      x += (tx - x) * ease;
      y += (ty - y) * ease;
      glow.style.transform = 'translate3d(' + (x - half) + 'px,' + (y - half) + 'px,0)';
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = mountLayers();
    if (!root) {
      if (parseLayers().indexOf('glow') !== -1) {
        var g = document.createElement('div');
        g.className = 'bg-layers';
        document.body.insertBefore(g, document.body.firstChild);
        initCursorGlow(g);
      }
      return;
    }
    initConstellation(root);
  });
})();
