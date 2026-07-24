/**
 * PyPath — The Summit
 * Low-poly 3D mountain with a spiral curriculum trail (canvas 2D).
 * Progressive enhancement: hides the static SVG fallback when ready.
 * Namespace: window.PySummit
 */
(function (global) {
  'use strict';

  var NS = 'PySummit';
  var STOP_COUNT = 10;
  var ROTATION_PERIOD_MS = 36000; // ~one revolution / 36s
  var PULSE_PERIOD_MS = 8000;
  var PARALLAX_MAX_DEG = 5;
  var PARALLAX_LERP = 0.08;
  var DRAG_FRICTION = 0.94;
  var BASE_ANGULAR_VEL = (Math.PI * 2) / ROTATION_PERIOD_MS;

  var TOKEN_KEYS = [
    '--home-ink',
    '--home-ink-soft',
    '--home-fog',
    '--home-mist',
    '--home-line',
    '--home-line-deep',
    '--home-mark',
    '--home-mark-hot',
    '--home-paper',
    '--home-muted'
  ];

  /* ── Color helpers (no hardcoded palette) ─────────────── */

  function parseColor(str) {
    if (!str) return null;
    str = String(str).trim();
    var m = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (m) {
      return {
        r: +m[1],
        g: +m[2],
        b: +m[3],
        a: m[4] !== undefined ? +m[4] : 1
      };
    }
    m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) {
        return {
          r: parseInt(h[0] + h[0], 16),
          g: parseInt(h[1] + h[1], 16),
          b: parseInt(h[2] + h[2], 16),
          a: 1
        };
      }
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: 1
      };
    }
    return null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        default:
          h = ((r - g) / d + 4) / 6;
      }
    }
    return { h: h * 360, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0;
    var g = 0;
    var b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function adjustLightness(rgb, delta) {
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var l = Math.max(0.05, Math.min(0.92, hsl.l + delta));
    var out = hslToRgb(hsl.h, hsl.s, l);
    out.a = rgb.a != null ? rgb.a : 1;
    return out;
  }

  function cssColor(rgb, alpha) {
    var a = alpha != null ? alpha : rgb.a != null ? rgb.a : 1;
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
  }

  function readTokens(el) {
    var cs = getComputedStyle(el || document.documentElement);
    var tokens = {};
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      var key = TOKEN_KEYS[i];
      tokens[key] = parseColor(cs.getPropertyValue(key)) || parseColor('#888888');
    }
    return tokens;
  }

  function buildPalette(tokens) {
    var ink = tokens['--home-ink'];
    var fog = tokens['--home-fog'];
    var mist = tokens['--home-mist'];
    var line = tokens['--home-line'];
    var lineDeep = tokens['--home-line-deep'];
    var mark = tokens['--home-mark'];
    var markHot = tokens['--home-mark-hot'];
    var muted = tokens['--home-muted'];
    var paper = tokens['--home-paper'];

    return {
      facetBase: ink,
      facetLight: adjustLightness(ink, 0.18),
      facetDark: adjustLightness(ink, -0.16),
      facetMid: adjustLightness(ink, 0.04),
      trail: line,
      trailDeep: lineDeep,
      stop: mark,
      stopHot: markHot || adjustLightness(mark, 0.12),
      flagPole: muted,
      flag: lineDeep,
      ground: fog,
      groundEdge: muted,
      mist: mist,
      paper: paper
    };
  }

  /* ── Math / geometry ──────────────────────────────────── */

  function v3(x, y, z) {
    return { x: x, y: y, z: z };
  }

  function add(a, b) {
    return v3(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  function sub(a, b) {
    return v3(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function scale(a, s) {
    return v3(a.x * s, a.y * s, a.z * s);
  }

  function cross(a, b) {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function normalize(a) {
    var len = Math.sqrt(dot(a, a)) || 1;
    return scale(a, 1 / len);
  }

  function avg3(a, b, c) {
    return v3((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
  }

  /** Rotate around Y, then X (pitch), then Z (roll) — camera-ish order. */
  function transformPoint(p, yaw, pitch, roll) {
    var cosY = Math.cos(yaw);
    var sinY = Math.sin(yaw);
    var x1 = p.x * cosY + p.z * sinY;
    var y1 = p.y;
    var z1 = -p.x * sinY + p.z * cosY;

    var cosP = Math.cos(pitch);
    var sinP = Math.sin(pitch);
    var y2 = y1 * cosP - z1 * sinP;
    var z2 = y1 * sinP + z1 * cosP;
    var x2 = x1;

    var cosR = Math.cos(roll);
    var sinR = Math.sin(roll);
    return v3(x2 * cosR - y2 * sinR, x2 * sinR + y2 * cosR, z2);
  }

  function project(p, cx, cy, scalePx, perspective) {
    var w = perspective / (perspective + p.z);
    return { x: cx + p.x * scalePx * w, y: cy - p.y * scalePx * w, w: w, z: p.z };
  }

  /* Deterministic pseudo-noise for irregular silhouette */
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * Build a low-poly irregular cone (~50–70 triangles).
   * Y up; peak near y=1, base near y=-0.85.
   */
  function buildMountain() {
    // Target ~50–70 facets (spec: roughly 30–80 triangles)
    var rings = 5;
    var sectors = 8;
    var peak = v3(0.02, 1.05, -0.01);
    var verts = [peak];
    var faces = [];

    for (var r = 1; r <= rings; r++) {
      var t = r / rings;
      var y = 1.05 - t * 1.9;
      var radius = 0.12 + t * 0.95;
      for (var s = 0; s < sectors; s++) {
        var ang = (s / sectors) * Math.PI * 2;
        var jitter = 0.78 + hash(r * 17 + s * 3.1) * 0.38;
        var rr = radius * jitter;
        var bump = (hash(s * 9.3 + r) - 0.5) * 0.08 * t;
        verts.push(
          v3(
            Math.cos(ang) * rr + bump,
            y + (hash(r + s * 0.7) - 0.5) * 0.06 * t,
            Math.sin(ang) * rr - bump * 0.5
          )
        );
      }
    }

    // Peak ring faces
    for (var s0 = 0; s0 < sectors; s0++) {
      var a = 1 + s0;
      var b = 1 + ((s0 + 1) % sectors);
      faces.push([0, a, b]);
    }

    // Ring quads as two triangles
    for (var ring = 0; ring < rings - 1; ring++) {
      var baseA = 1 + ring * sectors;
      var baseB = 1 + (ring + 1) * sectors;
      for (var s1 = 0; s1 < sectors; s1++) {
        var i0 = baseA + s1;
        var i1 = baseA + ((s1 + 1) % sectors);
        var i2 = baseB + ((s1 + 1) % sectors);
        var i3 = baseB + s1;
        faces.push([i0, i3, i1]);
        faces.push([i1, i3, i2]);
      }
    }

    return { verts: verts, faces: faces, peak: peak };
  }

  /** Spiral trail: ~2.25 turns from base to peak. */
  function buildTrail(samples) {
    var pts = [];
    var turns = 2.25;
    for (var i = 0; i < samples; i++) {
      var t = i / (samples - 1); // 0 base → 1 peak
      var y = -0.78 + t * 1.78;
      var radius = 0.95 * (1 - t * 0.88) + 0.06;
      var ang = t * turns * Math.PI * 2 - Math.PI * 0.35;
      // Slight outward offset so trail sits on surface
      pts.push({
        p: v3(Math.cos(ang) * radius * 1.02, y, Math.sin(ang) * radius * 1.02),
        ang: ang,
        t: t
      });
    }
    return pts;
  }

  function sampleStops(trail) {
    var stops = [];
    for (var i = 0; i < STOP_COUNT; i++) {
      var t = STOP_COUNT === 1 ? 0 : i / (STOP_COUNT - 1);
      var idx = Math.round(t * (trail.length - 1));
      stops.push({
        p: trail[idx].p,
        ang: trail[idx].ang,
        t: t,
        index: i
      });
    }
    return stops;
  }

  /* ── Instance ─────────────────────────────────────────── */

  function Summit(root) {
    this.root = root;
    this.fallback = root.querySelector('.home-summit__fallback');
    this.canvas = null;
    this.ctx = null;
    this.palette = null;
    this.mountain = buildMountain();
    this.trail = buildTrail(96);
    this.stops = sampleStops(this.trail);
    this.light = normalize(v3(-0.45, 0.85, 0.35));

    this.yaw = -0.55;
    this.pitch = 0.18;
    this.roll = 0;
    this.targetPitch = 0.18;
    this.targetRoll = 0;
    this.angularVel = BASE_ANGULAR_VEL;
    this.userSpin = 0;

    this.running = false;
    this.visible = true;
    this.pageVisible = true;
    this.reduced = false;
    this.animateEnabled = true;
    this.parallaxEnabled = false;
    this.dragging = false;
    this.lastPointerX = 0;
    this.raf = 0;
    this.lastTs = 0;
    this.pulsePhase = 0;
    this.dpr = 1;
    this.cssW = 0;
    this.cssH = 0;

    this._onResize = this.onResize.bind(this);
    this._onVis = this.onVisibility.bind(this);
    this._onTheme = this.onTheme.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerLeave = this.onPointerLeave.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onMedia = this.onMedia.bind(this);
    this._tick = this.tick.bind(this);
  }

  Summit.prototype.mount = function () {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'home-summit__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.refreshMotionFlags();
    this.refreshPalette();
    this.onResize();

    if (this.fallback) {
      this.fallback.setAttribute('hidden', '');
      this.fallback.setAttribute('aria-hidden', 'true');
    }
    this.root.classList.add('is-enhanced');

    window.addEventListener('resize', this._onResize, { passive: true });
    document.addEventListener('visibilitychange', this._onVis);
    window.addEventListener('themechange', this._onTheme);
    if (typeof MutationObserver !== 'undefined') {
      this._themeObs = new MutationObserver(this._onTheme);
      this._themeObs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class']
      });
    }

    if (typeof IntersectionObserver !== 'undefined') {
      var self = this;
      this._io = new IntersectionObserver(
        function (entries) {
          var entry = entries[0];
          self.visible = !!(entry && entry.isIntersecting);
          self.syncLoop();
        },
        { threshold: 0.05 }
      );
      this._io.observe(this.root);
    }

    this._mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
    this._mqWide = window.matchMedia('(min-width: 768px)');
    if (this._mqReduce.addEventListener) {
      this._mqReduce.addEventListener('change', this._onMedia);
      this._mqFine.addEventListener('change', this._onMedia);
      this._mqWide.addEventListener('change', this._onMedia);
    } else if (this._mqReduce.addListener) {
      this._mqReduce.addListener(this._onMedia);
      this._mqFine.addListener(this._onMedia);
      this._mqWide.addListener(this._onMedia);
    }

    this.bindPointer();
    this.syncLoop();
    if (!this.animateEnabled) this.drawFrame(0);
  };

  Summit.prototype.refreshMotionFlags = function () {
    var reduced =
      (global.PyMotion && typeof global.PyMotion.prefersReduced === 'function' && global.PyMotion.prefersReduced()) ||
      document.documentElement.classList.contains('reduced-motion') ||
      (document.body && document.body.dataset.motion === 'off') ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.reduced = !!reduced;
    var wideEnough = !(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
    // Spec: <768px — no animation loop; static fallback / modest static frame
    this.animateEnabled = !this.reduced && wideEnough;
    this.parallaxEnabled =
      this.animateEnabled &&
      window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  };

  Summit.prototype.bindPointer = function () {
    var hero = this.root.closest('.home-hero') || this.root;
    hero.removeEventListener('pointermove', this._onPointerMove);
    hero.removeEventListener('pointerleave', this._onPointerLeave);
    this.root.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);

    if (this.parallaxEnabled) {
      hero.addEventListener('pointermove', this._onPointerMove, { passive: true });
      hero.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    }
    if (this.animateEnabled && this.parallaxEnabled) {
      this.root.addEventListener('pointerdown', this._onPointerDown, { passive: true });
      window.addEventListener('pointerup', this._onPointerUp, { passive: true });
      window.addEventListener('pointercancel', this._onPointerUp, { passive: true });
    }
  };

  Summit.prototype.onMedia = function () {
    this.refreshMotionFlags();
    this.bindPointer();
    if (!this.parallaxEnabled) {
      this.targetPitch = 0.18;
      this.targetRoll = 0;
    }
    this.syncLoop();
    if (!this.animateEnabled) this.drawFrame(0);
  };

  Summit.prototype.onTheme = function () {
    this.refreshPalette();
    if (!this.running) this.drawFrame(this.pulsePhase);
  };

  Summit.prototype.refreshPalette = function () {
    var scope = document.querySelector('.page-home') || document.documentElement;
    this.palette = buildPalette(readTokens(scope));
  };

  Summit.prototype.onVisibility = function () {
    this.pageVisible = document.visibilityState !== 'hidden';
    this.syncLoop();
  };

  Summit.prototype.onResize = function () {
    var rect = this.root.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.running) this.drawFrame(this.pulsePhase);
  };

  Summit.prototype.onPointerMove = function (e) {
    if (!this.parallaxEnabled) return;
    var hero = this.root.closest('.home-hero') || this.root;
    var rect = hero.getBoundingClientRect();
    var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    var max = (PARALLAX_MAX_DEG * Math.PI) / 180;
    this.targetRoll = -nx * max;
    this.targetPitch = 0.18 + ny * max * 0.65;

    if (this.dragging) {
      var dx = e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
      this.userSpin += dx * 0.005;
      this.angularVel = BASE_ANGULAR_VEL + dx * 0.00035;
    }
  };

  Summit.prototype.onPointerLeave = function () {
    if (!this.parallaxEnabled) return;
    this.targetPitch = 0.18;
    this.targetRoll = 0;
    this.dragging = false;
  };

  Summit.prototype.onPointerDown = function (e) {
    if (!this.animateEnabled || e.button !== 0) return;
    this.dragging = true;
    this.lastPointerX = e.clientX;
  };

  Summit.prototype.onPointerUp = function () {
    this.dragging = false;
  };

  Summit.prototype.syncLoop = function () {
    var shouldRun = this.animateEnabled && this.visible && this.pageVisible;
    if (shouldRun && !this.running) {
      this.running = true;
      this.lastTs = 0;
      this.raf = requestAnimationFrame(this._tick);
    } else if (!shouldRun && this.running) {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  };

  Summit.prototype.tick = function (ts) {
    if (!this.running) return;
    if (!this.lastTs) this.lastTs = ts;
    var dt = Math.min(48, ts - this.lastTs);
    this.lastTs = ts;

    this.yaw += this.angularVel * dt + this.userSpin;
    this.userSpin *= 0.85;
    if (!this.dragging) {
      this.angularVel = this.angularVel * DRAG_FRICTION + BASE_ANGULAR_VEL * (1 - DRAG_FRICTION);
    }

    this.pitch += (this.targetPitch - this.pitch) * PARALLAX_LERP;
    this.roll += (this.targetRoll - this.roll) * PARALLAX_LERP;

    this.pulsePhase = (this.pulsePhase + dt / PULSE_PERIOD_MS) % 1;
    this.drawFrame(this.pulsePhase);

    this.raf = requestAnimationFrame(this._tick);
  };

  Summit.prototype.drawFrame = function (pulsePhase) {
    var ctx = this.ctx;
    var w = this.cssW;
    var h = this.cssH;
    if (!ctx || !w || !h) return;

    var pal = this.palette || buildPalette(readTokens(document.querySelector('.page-home')));
    ctx.clearRect(0, 0, w, h);

    var cx = w * 0.5;
    var cy = h * 0.58;
    var scalePx = Math.min(w, h) * 0.42;
    var perspective = 3.2;
    var yaw = this.yaw;
    var pitch = this.pitch;
    var roll = this.roll;

    // Ground ellipse (seats the mountain)
    ctx.save();
    ctx.translate(cx, cy + scalePx * 0.72);
    ctx.scale(1, 0.28);
    var grd = ctx.createRadialGradient(0, 0, 4, 0, 0, scalePx * 1.05);
    grd.addColorStop(0, cssColor(pal.ground, 0.55));
    grd.addColorStop(1, cssColor(pal.ground, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, scalePx * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Transform & project mountain verts
    var tv = [];
    var verts = this.mountain.verts;
    for (var i = 0; i < verts.length; i++) {
      var tp = transformPoint(verts[i], yaw, pitch, roll);
      tv.push({
        world: tp,
        screen: project(tp, cx, cy, scalePx, perspective)
      });
    }

    // Facets with flat shading + painter sort
    var facets = [];
    var faces = this.mountain.faces;
    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      var a = tv[face[0]];
      var b = tv[face[1]];
      var c = tv[face[2]];
      var n = normalize(cross(sub(b.world, a.world), sub(c.world, a.world)));
      // Back-face cull (normals pointing roughly away from camera +Z toward viewer: -Z camera)
      if (n.z > 0.08) continue;
      var shade = Math.max(0, Math.min(1, (dot(n, this.light) + 1) * 0.5));
      var mid = avg3(a.world, b.world, c.world);
      facets.push({
        a: a.screen,
        b: b.screen,
        c: c.screen,
        z: mid.z,
        shade: shade
      });
    }
    facets.sort(function (u, v) {
      return u.z - v.z;
    });

    for (var fi = 0; fi < facets.length; fi++) {
      var facet = facets[fi];
      var col;
      if (facet.shade > 0.62) col = pal.facetLight;
      else if (facet.shade < 0.38) col = pal.facetDark;
      else col = pal.facetMid;
      // Blend toward base by shade for smoother flats
      var mix = facet.shade;
      var rr = Math.round(col.r * (0.55 + mix * 0.45) + pal.facetBase.r * (0.2 - mix * 0.1));
      var gg = Math.round(col.g * (0.55 + mix * 0.45) + pal.facetBase.g * (0.2 - mix * 0.1));
      var bb = Math.round(col.b * (0.55 + mix * 0.45) + pal.facetBase.b * (0.2 - mix * 0.1));
      ctx.beginPath();
      ctx.moveTo(facet.a.x, facet.a.y);
      ctx.lineTo(facet.b.x, facet.b.y);
      ctx.lineTo(facet.c.x, facet.c.y);
      ctx.closePath();
      ctx.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
      ctx.fill();
      ctx.strokeStyle = cssColor(pal.facetDark, 0.18);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // Trail — dashed, with far-side fade based on facing (world z / radial)
    var trailScreen = [];
    for (var ti = 0; ti < this.trail.length; ti++) {
      var tr = this.trail[ti];
      var tw = transformPoint(tr.p, yaw, pitch, roll);
      var ts = project(tw, cx, cy, scalePx, perspective);
      // Facing: positive local radial · camera-forward after yaw ≈ -sin/cos of ang+yaw
      var facing = Math.sin(tr.ang + yaw);
      // After our Y rotation, points with negative world.z tend to be farther
      var depthFade = 0.5 + 0.5 * Math.max(-1, Math.min(1, -tw.z * 1.1));
      var faceFade = 0.22 + 0.78 * Math.max(0, Math.min(1, (facing + 0.35) / 1.35));
      var alpha = Math.min(depthFade, faceFade);
      trailScreen.push({ x: ts.x, y: ts.y, z: tw.z, alpha: alpha, t: tr.t });
    }

    // Draw trail in two passes: far (faded) then near
    this.drawTrailPass(ctx, trailScreen, true, pal);
    this.drawTrailPass(ctx, trailScreen, false, pal);

    // Stops
    var activeStop = this.animateEnabled
      ? Math.floor(pulsePhase * STOP_COUNT) % STOP_COUNT
      : -1;
    for (var si = 0; si < this.stops.length; si++) {
      var stop = this.stops[si];
      var sw = transformPoint(stop.p, yaw, pitch, roll);
      var ss = project(sw, cx, cy, scalePx, perspective);
      var sFacing = Math.sin(stop.ang + yaw);
      var sAlpha = 0.25 + 0.75 * Math.max(0, Math.min(1, (sFacing + 0.4) / 1.4));
      var isPulse = si === activeStop;
      var isLit = this.animateEnabled ? si <= activeStop : true;
      var radius = (isPulse ? 5.5 : isLit ? 4.2 : 3.2) * ss.w;
      ctx.beginPath();
      ctx.arc(ss.x, ss.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(isPulse ? pal.stopHot : pal.stop, isLit ? sAlpha : sAlpha * 0.45);
      ctx.fill();
      if (isPulse) {
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, radius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(pal.stopHot, 0.18 * sAlpha);
        ctx.fill();
      }
      // Tiny number if large enough
      if (ss.w > 0.85 && radius > 3.5 && sAlpha > 0.45) {
        ctx.fillStyle = cssColor(pal.paper, 0.95);
        ctx.font = '600 ' + Math.max(7, Math.round(radius * 1.5)) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(si + 1), ss.x, ss.y + 0.5);
      }
    }

    // Summit flag
    var peakW = transformPoint(this.mountain.peak, yaw, pitch, roll);
    // Nudge flag slightly above peak
    var flagBase = transformPoint(v3(this.mountain.peak.x, this.mountain.peak.y + 0.02, this.mountain.peak.z), yaw, pitch, roll);
    var flagTop = transformPoint(v3(this.mountain.peak.x, this.mountain.peak.y + 0.22, this.mountain.peak.z), yaw, pitch, roll);
    var wave = this.animateEnabled ? Math.sin((pulsePhase || 0) * Math.PI * 2) * 0.04 : 0;
    var flagTip = transformPoint(
      v3(this.mountain.peak.x + 0.18 + wave, this.mountain.peak.y + 0.18, this.mountain.peak.z + 0.02),
      yaw,
      pitch,
      roll
    );
    var flagMid = transformPoint(
      v3(this.mountain.peak.x + 0.18 - wave * 0.5, this.mountain.peak.y + 0.1, this.mountain.peak.z),
      yaw,
      pitch,
      roll
    );
    var pb = project(flagBase, cx, cy, scalePx, perspective);
    var pt = project(flagTop, cx, cy, scalePx, perspective);
    var pTip = project(flagTip, cx, cy, scalePx, perspective);
    var pMid = project(flagMid, cx, cy, scalePx, perspective);

    ctx.beginPath();
    ctx.moveTo(pb.x, pb.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = cssColor(pal.flagPole, 0.9);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pTip.x, pTip.y);
    ctx.lineTo(pMid.x, pMid.y);
    ctx.closePath();
    ctx.fillStyle = cssColor(pal.flag, 0.95);
    ctx.fill();
  };

  Summit.prototype.drawTrailPass = function (ctx, trailScreen, farPass, pal) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([5, 7]);
    for (var i = 1; i < trailScreen.length; i++) {
      var a = trailScreen[i - 1];
      var b = trailScreen[i];
      var alpha = Math.min(a.alpha, b.alpha);
      var isFar = alpha < 0.55;
      if (farPass !== isFar) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = cssColor(farPass ? pal.trailDeep : pal.trail, farPass ? alpha * 0.35 : alpha * 0.95);
      ctx.lineWidth = farPass ? 1.4 : 2.2;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  Summit.prototype.destroy = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('themechange', this._onTheme);
    if (this._themeObs) this._themeObs.disconnect();
    if (this._io) this._io.disconnect();
    var hero = this.root.closest('.home-hero') || this.root;
    hero.removeEventListener('pointermove', this._onPointerMove);
    hero.removeEventListener('pointerleave', this._onPointerLeave);
    this.root.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
  };

  function init() {
    var root = document.querySelector('[data-summit]');
    if (!root) return null;
    var instance = new Summit(root);
    instance.mount();
    global[NS] = { instance: instance, init: init };
    return instance;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
