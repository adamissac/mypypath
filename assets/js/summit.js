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
  var ROTATION_PERIOD_MS = 36000;
  var PULSE_PERIOD_MS = 8000;
  var PARALLAX_MAX_DEG = 5;
  var PARALLAX_LERP = 0.08;
  var DRAG_FRICTION = 0.94;
  var BASE_ANGULAR_VEL = (Math.PI * 2) / ROTATION_PERIOD_MS;
  var STOP_BIAS = 1.18; // redistribute stops 1–9 toward the base
  var BACK_HINT_ALPHA = 0.07; // residual far-side trail (≤ 0.08)

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
    var l = Math.max(0.04, Math.min(0.94, hsl.l + delta));
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

    // Widen lit/mid/shadow spread so light direction reads at a glance
    var paperL = rgbToHsl(paper.r, paper.g, paper.b).l;
    var darkTheme = paperL < 0.35;
    var litDelta = darkTheme ? 0.34 : 0.3;
    var shadowDelta = darkTheme ? -0.32 : -0.28;

    return {
      facetLit: adjustLightness(ink, litDelta),
      facetMid: adjustLightness(ink, darkTheme ? 0.06 : 0.02),
      facetShadow: adjustLightness(ink, shadowDelta),
      trail: line,
      trailDeep: lineDeep,
      stop: mark,
      stopHot: markHot || adjustLightness(mark, 0.12),
      flagPole: muted,
      flag: lineDeep,
      ground: fog,
      groundEdge: muted,
      mist: mist,
      paper: paper,
      darkTheme: darkTheme
    };
  }

  /* ── Math / geometry ──────────────────────────────────── */

  function v3(x, y, z) {
    return { x: x, y: y, z: z };
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

  /** Deterministic noise — interior only; never used on silhouette radius. */
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * Clean mountain: dominant peak + one smooth shoulder lobe.
   * rings=3 × sectors=6 → 30 triangles (within 30–45).
   * Silhouette radii are smooth & monotonic in angle — no zigzag jitter.
   */
  function buildMountain() {
    var rings = 3;
    var sectors = 6;
    var peak = v3(0, 1.08, 0);
    var verts = [peak];
    var faces = [];
    var shoulderDir = -0.55; // radians — lower right shoulder in default view

    // Ring heights & base radii (taper: peak → base)
    var ringY = [0.52, -0.05, -0.88];
    var ringR = [0.28, 0.62, 0.98];

    for (var r = 0; r < rings; r++) {
      var t = (r + 1) / rings; // 0→1 down the mountain
      var y = ringY[r];
      var baseR = ringR[r];
      for (var s = 0; s < sectors; s++) {
        var ang = (s / sectors) * Math.PI * 2;
        // Smooth shoulder lobe — no random silhouette jitter
        var lobe = Math.max(0, Math.cos(ang - shoulderDir));
        lobe = lobe * lobe; // soften
        var shoulder = 1 + 0.2 * lobe * t;
        // Slight oval so it isn't a perfect cone
        var rx = baseR * shoulder;
        var rz = baseR * shoulder * 0.9;
        // Tiny vertical interior noise only (does not affect outline radius)
        var yJitter = (hash(r * 13 + s * 2.7) - 0.5) * 0.03 * t;
        verts.push(v3(Math.cos(ang) * rx, y + yJitter, Math.sin(ang) * rz));
      }
    }

    for (var s0 = 0; s0 < sectors; s0++) {
      faces.push([0, 1 + s0, 1 + ((s0 + 1) % sectors)]);
    }

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

    return { verts: verts, faces: faces, peak: peak, faceCount: faces.length };
  }

  /**
   * Spiral trail: ground trailhead → peak (flag base). ~2.25 turns.
   * Radius hugs the mountain taper so the path sits on the surface.
   */
  function trailPointAt(t) {
    var turns = 2.25;
    var y = -0.88 + t * (1.08 - -0.88);
    // Match mountain radius profile roughly
    var radius = 0.98 * (1 - t * 0.9) + 0.04;
    var ang = t * turns * Math.PI * 2 - Math.PI * 0.4;
    var shoulderDir = -0.55;
    var lobe = Math.max(0, Math.cos(ang - shoulderDir));
    lobe = lobe * lobe;
    var shoulder = 1 + 0.12 * lobe * (1 - t);
    var rx = radius * shoulder * 1.04;
    var rz = radius * shoulder * 0.94 * 1.04;
    return {
      p: v3(Math.cos(ang) * rx, y, Math.sin(ang) * rz),
      ang: ang,
      t: t
    };
  }

  function buildTrail(samples) {
    var pts = [];
    for (var i = 0; i < samples; i++) {
      pts.push(trailPointAt(i / (samples - 1)));
    }
    // Force exact endpoints: ground start + peak
    pts[0] = trailPointAt(0);
    pts[pts.length - 1] = {
      p: v3(0, 1.08, 0),
      ang: pts[pts.length - 1].ang,
      t: 1
    };
    return pts;
  }

  /**
   * Stops 1–9 along trail with base bias; stop 10 = summit (flag base / peak).
   */
  function sampleStops(trail, peak) {
    var stops = [];
    for (var i = 0; i < STOP_COUNT - 1; i++) {
      // Bias toward base so upper stops don't bunch
      var u = Math.pow(i / (STOP_COUNT - 2), STOP_BIAS);
      // Keep stop 9 short of the peak so stop 10 owns the summit
      var t = u * 0.9;
      var idx = Math.round(t * (trail.length - 1));
      idx = Math.max(0, Math.min(trail.length - 2, idx));
      stops.push({
        p: trail[idx].p,
        ang: trail[idx].ang,
        t: trail[idx].t,
        index: i,
        isSummit: false
      });
    }
    stops.push({
      p: peak,
      ang: 0,
      t: 1,
      index: STOP_COUNT - 1,
      isSummit: true
    });
    return stops;
  }

  function facetTone(shade, pal) {
    // Hard quantize into 3 readable tones
    if (shade >= 0.58) return pal.facetLit;
    if (shade <= 0.4) return pal.facetShadow;
    return pal.facetMid;
  }

  /* ── Instance ─────────────────────────────────────────── */

  function Summit(root) {
    this.root = root;
    this.fallback = root.querySelector('.home-summit__fallback');
    this.canvas = null;
    this.ctx = null;
    this.palette = null;
    this.mountain = buildMountain();
    this.trail = buildTrail(120);
    this.stops = sampleStops(this.trail, this.mountain.peak);
    this.light = normalize(v3(-0.55, 0.75, 0.4));

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

  /**
   * Facing toward camera: positive = near side of spiral.
   * Uses radial direction in XZ after yaw.
   */
  Summit.prototype.pointFacing = function (ang, yaw) {
    return Math.sin(ang + yaw);
  };

  Summit.prototype.drawFrame = function (pulsePhase) {
    var ctx = this.ctx;
    var w = this.cssW;
    var h = this.cssH;
    if (!ctx || !w || !h) return;

    var pal = this.palette || buildPalette(readTokens(document.querySelector('.page-home')));
    ctx.clearRect(0, 0, w, h);

    // Fill the 4:5 box confidently (~18% larger than prior 0.42)
    var cx = w * 0.5;
    var cy = h * 0.55;
    var scalePx = Math.min(w, h) * 0.5;
    var perspective = 3.2;
    var yaw = this.yaw;
    var pitch = this.pitch;
    var roll = this.roll;

    // Stronger ground contact shadow
    ctx.save();
    ctx.translate(cx, cy + scalePx * 0.78);
    ctx.scale(1, 0.26);
    var grd = ctx.createRadialGradient(0, 0, 2, 0, 0, scalePx * 1.15);
    grd.addColorStop(0, cssColor(pal.groundEdge, pal.darkTheme ? 0.45 : 0.35));
    grd.addColorStop(0.45, cssColor(pal.ground, pal.darkTheme ? 0.5 : 0.55));
    grd.addColorStop(1, cssColor(pal.ground, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, scalePx * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Transform mountain verts
    var tv = [];
    var verts = this.mountain.verts;
    for (var i = 0; i < verts.length; i++) {
      var tp = transformPoint(verts[i], yaw, pitch, roll);
      tv.push({
        world: tp,
        screen: project(tp, cx, cy, scalePx, perspective)
      });
    }

    // Painter list: facets + near trail segs + stops (sorted by z)
    var drawList = [];
    var faces = this.mountain.faces;
    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      var a = tv[face[0]];
      var b = tv[face[1]];
      var c = tv[face[2]];
      var n = normalize(cross(sub(b.world, a.world), sub(c.world, a.world)));
      if (n.z > 0.06) continue; // back-face cull
      var shade = Math.max(0, Math.min(1, (dot(n, this.light) + 1) * 0.5));
      var mid = avg3(a.world, b.world, c.world);
      drawList.push({
        kind: 'facet',
        z: mid.z,
        a: a.screen,
        b: b.screen,
        c: c.screen,
        tone: facetTone(shade, pal)
      });
    }

    // Trail samples
    var trailScreen = [];
    for (var ti = 0; ti < this.trail.length; ti++) {
      var tr = this.trail[ti];
      var tw = transformPoint(tr.p, yaw, pitch, roll);
      var ts = project(tw, cx, cy, scalePx, perspective);
      var facing = this.pointFacing(tr.ang, yaw);
      var near = facing > 0.05;
      trailScreen.push({
        x: ts.x,
        y: ts.y,
        z: tw.z,
        facing: facing,
        near: near,
        t: tr.t
      });
    }

    // Far-side hint pass FIRST (α ≤ 0.08), never over the body later
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([5, 8]);
    for (var fi = 1; fi < trailScreen.length; fi++) {
      var fa = trailScreen[fi - 1];
      var fb = trailScreen[fi];
      if (fa.near || fb.near) continue;
      ctx.beginPath();
      ctx.moveTo(fa.x, fa.y);
      ctx.lineTo(fb.x, fb.y);
      ctx.strokeStyle = cssColor(pal.trailDeep, BACK_HINT_ALPHA);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Near trail segments → painter list
    for (var si = 1; si < trailScreen.length; si++) {
      var sa = trailScreen[si - 1];
      var sb = trailScreen[si];
      if (!sa.near && !sb.near) continue;
      // If either end is back, skip — prevents dashes crossing the body
      if (!sa.near || !sb.near) continue;
      drawList.push({
        kind: 'seg',
        z: (sa.z + sb.z) * 0.5,
        a: sa,
        b: sb
      });
    }

    // Trailhead marker at path start (ground)
    var head = trailScreen[0];
    if (head) {
      drawList.push({
        kind: 'trailhead',
        z: head.z - 0.01,
        x: head.x,
        y: head.y,
        w: head.w || 1,
        near: head.near
      });
    }

    // Stops → painter list
    var activeStop = this.animateEnabled
      ? Math.floor(pulsePhase * STOP_COUNT) % STOP_COUNT
      : -1;
    for (var sti = 0; sti < this.stops.length; sti++) {
      var stop = this.stops[sti];
      var sw = transformPoint(stop.p, yaw, pitch, roll);
      var ss = project(sw, cx, cy, scalePx, perspective);
      var sFacing = stop.isSummit ? 1 : this.pointFacing(stop.ang, yaw);
      var sNear = stop.isSummit || sFacing > 0.08;
      // Skip back-side stops entirely (no ghost markers over the body)
      if (!sNear) continue;
      drawList.push({
        kind: 'stop',
        z: sw.z,
        x: ss.x,
        y: ss.y,
        w: ss.w,
        index: sti,
        isPulse: sti === activeStop,
        isLit: this.animateEnabled ? sti <= activeStop : true,
        isSummit: stop.isSummit
      });
    }

    // Far → near
    drawList.sort(function (u, v) {
      return u.z - v.z;
    });

    for (var di = 0; di < drawList.length; di++) {
      var item = drawList[di];
      if (item.kind === 'facet') {
        ctx.beginPath();
        ctx.moveTo(item.a.x, item.a.y);
        ctx.lineTo(item.b.x, item.b.y);
        ctx.lineTo(item.c.x, item.c.y);
        ctx.closePath();
        ctx.fillStyle = cssColor(item.tone, 1);
        ctx.fill();
        // Soft edge only — avoid noisy wireframe
        ctx.strokeStyle = cssColor(pal.facetShadow, 0.06);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else if (item.kind === 'seg') {
        ctx.beginPath();
        ctx.moveTo(item.a.x, item.a.y);
        ctx.lineTo(item.b.x, item.b.y);
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = cssColor(pal.trail, 0.95);
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (item.kind === 'trailhead') {
        var hr = 5.5 * (item.w || 1);
        ctx.beginPath();
        ctx.arc(item.x, item.y, hr, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(pal.stop, 0.95);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(item.x, item.y, hr * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(pal.paper, 0.95);
        ctx.fill();
      } else if (item.kind === 'stop') {
        var radius = (item.isPulse ? 6.2 : item.isLit ? 5 : 3.8) * item.w;
        if (item.isSummit) radius = Math.max(radius, 5.5 * item.w);
        ctx.beginPath();
        ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(item.isPulse ? pal.stopHot : pal.stop, 0.95);
        ctx.fill();
        if (item.isPulse) {
          ctx.beginPath();
          ctx.arc(item.x, item.y, radius * 2.1, 0, Math.PI * 2);
          ctx.fillStyle = cssColor(pal.stopHot, 0.16);
          ctx.fill();
        }
        // Numbers only when ≥ 9px and near (already filtered)
        var fontPx = Math.round(Math.max(radius * 1.55, 9));
        if (fontPx >= 9 && radius >= 4.5) {
          ctx.fillStyle = cssColor(pal.paper, 0.96);
          ctx.font = '700 ' + fontPx + 'px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(item.index + 1), item.x, item.y + 0.5);
        }
      }
    }

    // Summit flag — planted exactly on peak, drawn last
    var peak = this.mountain.peak;
    var wave = this.animateEnabled ? Math.sin((pulsePhase || 0) * Math.PI * 2) * 0.035 : 0;
    var flagBase = transformPoint(peak, yaw, pitch, roll);
    var flagTop = transformPoint(v3(peak.x, peak.y + 0.34, peak.z), yaw, pitch, roll);
    var flagTip = transformPoint(
      v3(peak.x + 0.28 + wave, peak.y + 0.28, peak.z + 0.02),
      yaw,
      pitch,
      roll
    );
    var flagMid = transformPoint(
      v3(peak.x + 0.28 - wave * 0.4, peak.y + 0.16, peak.z),
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
    ctx.strokeStyle = cssColor(pal.flagPole, 0.95);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pTip.x, pTip.y);
    ctx.lineTo(pMid.x, pMid.y);
    ctx.closePath();
    ctx.fillStyle = cssColor(pal.flag, 0.98);
    ctx.fill();
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
