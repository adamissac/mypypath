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
  var STOP_BIAS = 1.35; // stronger base bias — less clustering near peak
  var BACK_HINT_ALPHA = 0; // omit far-side trail — no ghosting over body

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

  function mixRgb(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
      a: 1
    };
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

    var paperL = rgbToHsl(paper.r, paper.g, paper.b).l;
    var darkTheme = paperL < 0.35;

    // Wide lit / mid / shadow from tokens — obvious light side in both themes
    var facetLit = darkTheme
      ? mixRgb(ink, fog, 0.15)
      : mixRgb(ink, fog, 0.68);
    var facetMid = darkTheme
      ? mixRgb(ink, mist, 0.28)
      : mixRgb(ink, mist, 0.4);
    // Keep shadow readable navy — never crushed black
    var facetShadow = darkTheme
      ? mixRgb(ink, mist, 0.42)
      : mixRgb(ink, mist, 0.12);

    return {
      facetLit: facetLit,
      facetMid: facetMid,
      facetShadow: facetShadow,
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
    var peak = v3(0, 1.0, 0);
    var verts = [peak];
    var faces = [];
    var shoulderDir = -0.65;

    // Deliberate taper: sharp peak → wider base with one shoulder
    var ringY = [0.42, -0.18, -0.85];
    var ringR = [0.34, 0.74, 1.12];

    for (var r = 0; r < rings; r++) {
      var t = (r + 1) / rings;
      var y = ringY[r];
      var baseR = ringR[r];
      for (var s = 0; s < sectors; s++) {
        var ang = (s / sectors) * Math.PI * 2;
        // Smooth shoulder lobe (sub-ridge) — no random silhouette jitter
        var lobe = Math.max(0, Math.cos(ang - shoulderDir));
        lobe = lobe * lobe;
        var shoulder = 1 + 0.22 * lobe * Math.min(1, t * 1.1);
        var rx = baseR * shoulder;
        var rz = baseR * shoulder * 0.86;
        var yJitter = (hash(r * 13 + s * 2.7) - 0.5) * 0.02 * t;
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
   * Spiral trail: ground trailhead → peak. ~1.75 turns.
   * Radius matches mountain taper and sits slightly inset so projections
   * land on front facets (needed for silhouette clipping).
   */
  function mountainRadiusAt(y, ang) {
    // Match buildMountain ring profile (peak y=1 → base y=-0.85)
    var t = (1.0 - y) / (1.0 - -0.85);
    t = Math.max(0, Math.min(1, t));
    var baseR = 0.04 + t * 1.08;
    var shoulderDir = -0.65;
    var lobe = Math.max(0, Math.cos(ang - shoulderDir));
    lobe = lobe * lobe;
    var shoulder = 1 + 0.22 * lobe * t;
    return {
      rx: baseR * shoulder,
      rz: baseR * shoulder * 0.86
    };
  }

  function trailPointAt(t) {
    // Climbing spiral (~1.15 turns). With default yaw ≈ -0.35 most of the
    // path sits on the front; back portions are gated by frontScore.
    var y = -0.82 + t * (1.0 - -0.82);
    var ang = -1.6 + t * Math.PI * 2 * 1.2;
    var rad = mountainRadiusAt(y, ang);
    var inset = 0.98;
    return {
      p: v3(Math.cos(ang) * rad.rx * inset, y, Math.sin(ang) * rad.rz * inset),
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
      p: v3(0, 1.0, 0),
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
      var t = u * 0.82; // leave more room below summit for stop 10
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
    // Hard quantize into 3 readable tones — bias toward lit/shadow clarity
    if (shade >= 0.5) return pal.facetLit;
    if (shade <= 0.36) return pal.facetShadow;
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
    this.trail = buildTrail(160);
    this.stops = sampleStops(this.trail, this.mountain.peak);
    this.light = normalize(v3(-0.65, 0.55, -0.5)); // from front-left so front faces read lit

    this.yaw = -0.35;
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
   * Front-facing score in [-1,1]: +1 = fully toward camera (yaw-only).
   */
  Summit.prototype.frontScore = function (localP, yaw) {
    var cosY = Math.cos(yaw);
    var sinY = Math.sin(yaw);
    var x1 = localP.x * cosY + localP.z * sinY;
    var z1 = -localP.x * sinY + localP.z * cosY;
    var r = Math.sqrt(localP.x * localP.x + localP.z * localP.z) || 1;
    // Toward camera means negative z after yaw
    return -z1 / r;
  };

  function pointInTri2D(px, py, ax, ay, bx, by, cx, cy) {
    var v0x = cx - ax;
    var v0y = cy - ay;
    var v1x = bx - ax;
    var v1y = by - ay;
    var v2x = px - ax;
    var v2y = py - ay;
    var dot00 = v0x * v0x + v0y * v0y;
    var dot01 = v0x * v1x + v0y * v1y;
    var dot02 = v0x * v2x + v0y * v2y;
    var dot11 = v1x * v1x + v1y * v1y;
    var dot12 = v1x * v2x + v1y * v2y;
    var inv = 1 / (dot00 * dot11 - dot01 * dot01 || 1);
    var u = (dot11 * dot02 - dot01 * dot12) * inv;
    var v = (dot00 * dot12 - dot01 * dot02) * inv;
    return u >= -0.02 && v >= -0.02 && u + v <= 1.04;
  }

  Summit.prototype.drawFrame = function (pulsePhase) {
    var ctx = this.ctx;
    var w = this.cssW;
    var h = this.cssH;
    if (!ctx || !w || !h) return;

    var pal = this.palette || buildPalette(readTokens(document.querySelector('.page-home')));
    ctx.clearRect(0, 0, w, h);

    // Fit full mountain + ground + flag with margin (critical at ~220px)
    var cx = w * 0.5;
    var cy = h * 0.5;
    var scalePx = Math.min(w, h) * 0.42;
    var perspective = 3.4;
    var yaw = this.yaw;
    var pitch = this.pitch;
    var roll = this.roll;

    // Ground seat
    ctx.save();
    ctx.translate(cx, cy + scalePx * 0.92);
    ctx.scale(1, 0.26);
    var grd = ctx.createRadialGradient(0, 0, 2, 0, 0, scalePx * 1.35);
    grd.addColorStop(0, cssColor(pal.groundEdge, pal.darkTheme ? 0.7 : 0.5));
    grd.addColorStop(0.4, cssColor(pal.ground, pal.darkTheme ? 0.65 : 0.7));
    grd.addColorStop(1, cssColor(pal.ground, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, scalePx * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, scalePx * 1.05, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(pal.groundEdge, pal.darkTheme ? 0.4 : 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    var tv = [];
    var verts = this.mountain.verts;
    for (var i = 0; i < verts.length; i++) {
      var tp = transformPoint(verts[i], yaw, pitch, roll);
      tv.push({
        world: tp,
        screen: project(tp, cx, cy, scalePx, perspective)
      });
    }

    var frontTris = [];
    var facets = [];
    var faces = this.mountain.faces;
    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      var a = tv[face[0]];
      var b = tv[face[1]];
      var c = tv[face[2]];
      var n = normalize(cross(sub(b.world, a.world), sub(c.world, a.world)));
      if (n.z > 0.02) continue;
      var shade = Math.max(0, Math.min(1, (dot(n, this.light) + 1) * 0.5));
      var mid = avg3(a.world, b.world, c.world);
      var tri = {
        a: a.screen,
        b: b.screen,
        c: c.screen,
        z: mid.z,
        tone: facetTone(shade, pal)
      };
      facets.push(tri);
      frontTris.push(tri);
    }

    facets.sort(function (u, v) { return u.z - v.z; });
    for (var fi = 0; fi < facets.length; fi++) {
      var facet = facets[fi];
      ctx.beginPath();
      ctx.moveTo(facet.a.x, facet.a.y);
      ctx.lineTo(facet.b.x, facet.b.y);
      ctx.lineTo(facet.c.x, facet.c.y);
      ctx.closePath();
      ctx.fillStyle = cssColor(facet.tone, 1);
      ctx.fill();
      // Seal sub-pixel gaps between facets (same tone — not a wireframe)
      ctx.strokeStyle = cssColor(facet.tone, 1);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function onFrontSilhouette(sx, sy) {
      for (var k = 0; k < frontTris.length; k++) {
        var t = frontTris[k];
        if (pointInTri2D(sx, sy, t.a.x, t.a.y, t.b.x, t.b.y, t.c.x, t.c.y)) return true;
      }
      return false;
    }

    // Peak screen Y — reject trail that floats above the summit (except final approach)
    var peakScreen = project(transformPoint(this.mountain.peak, yaw, pitch, roll), cx, cy, scalePx, perspective);

    var trailScreen = [];
    for (var ti = 0; ti < this.trail.length; ti++) {
      var tr = this.trail[ti];
      var tw = transformPoint(tr.p, yaw, pitch, roll);
      var ts = project(tw, cx, cy, scalePx, perspective);
      var score = this.frontScore(tr.p, yaw);
      // Front-hemisphere only — no silhouette kill (that erased the path).
      // Hide points that float above the peak tip in screen space.
      var abovePeak = ts.y < peakScreen.y - 6;
      var visible = score > 0.08 && (tr.t > 0.88 || !abovePeak);
      trailScreen.push({
        x: ts.x,
        y: ts.y,
        z: tw.z,
        w: ts.w,
        t: tr.t,
        visible: visible,
        score: score
      });
    }

    // Trail as continuous dashed runs (breaks only when path goes behind)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = cssColor(pal.trail, 0.95);
    ctx.lineWidth = Math.max(2, scalePx * 0.014);
    var drawing = false;
    ctx.beginPath();
    for (var si = 0; si < trailScreen.length; si++) {
      var pt = trailScreen[si];
      if (!pt.visible) {
        if (drawing) {
          ctx.stroke();
          ctx.beginPath();
          drawing = false;
        }
        continue;
      }
      if (!drawing) {
        ctx.moveTo(pt.x, pt.y);
        drawing = true;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    if (drawing) ctx.stroke();
    ctx.setLineDash([]);

    // Trailhead
    var head = trailScreen[0];
    if (head && head.visible) {
      var hr = Math.max(4.5, scalePx * 0.028);
      ctx.beginPath();
      ctx.arc(head.x, head.y, hr, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(pal.stop, 1);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(head.x, head.y, hr * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(pal.paper, 1);
      ctx.fill();
    }

    // Stops
    var activeStop = this.animateEnabled
      ? Math.floor(pulsePhase * STOP_COUNT) % STOP_COUNT
      : -1;
    for (var sti = 0; sti < this.stops.length; sti++) {
      var stop = this.stops[sti];
      var sw = transformPoint(stop.p, yaw, pitch, roll);
      var ss = project(sw, cx, cy, scalePx, perspective);
      var sScore = stop.isSummit ? 1 : this.frontScore(stop.p, yaw);
      var sFront = sScore > 0.08;
      if (!stop.isSummit && !sFront) continue;
      if (!stop.isSummit && ss.y < peakScreen.y - 6) continue;
      // Drop floaters that land far outside the mountain screen bounds
      if (!stop.isSummit) {
        var maxX = 0;
        for (var bi = 0; bi < frontTris.length; bi++) {
          var ft = frontTris[bi];
          maxX = Math.max(maxX, Math.abs(ft.a.x - cx), Math.abs(ft.b.x - cx), Math.abs(ft.c.x - cx));
        }
        if (Math.abs(ss.x - cx) > maxX * 1.08) continue;
      }

      var radius = (sti === activeStop ? 5.5 : 4.5) * Math.max(0.85, ss.w);
      radius = Math.max(radius, scalePx * 0.022);
      if (stop.isSummit) radius = Math.max(radius, scalePx * 0.026);

      ctx.beginPath();
      ctx.arc(ss.x, ss.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(sti === activeStop ? pal.stopHot : pal.stop, 0.98);
      ctx.fill();
      if (sti === activeStop) {
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, radius * 2, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(pal.stopHot, 0.14);
        ctx.fill();
      }

      // Skip number on summit (flag marks destination) and when too small
      var fontPx = Math.round(Math.max(9, radius * 1.55));
      if (!stop.isSummit && fontPx >= 9 && sFront) {
        ctx.fillStyle = cssColor(pal.paper, 0.98);
        ctx.font = '700 ' + fontPx + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(sti + 1), ss.x, ss.y + 0.5);
      }
    }

    // Flag on peak
    var peak = this.mountain.peak;
    var wave = this.animateEnabled ? Math.sin((pulsePhase || 0) * Math.PI * 2) * 0.035 : 0;
    var flagBase = transformPoint(peak, yaw, pitch, roll);
    var flagTop = transformPoint(v3(peak.x, peak.y + 0.38, peak.z), yaw, pitch, roll);
    var flagTip = transformPoint(
      v3(peak.x + 0.32 + wave, peak.y + 0.3, peak.z + 0.02),
      yaw,
      pitch,
      roll
    );
    var flagMid = transformPoint(
      v3(peak.x + 0.32 - wave * 0.3, peak.y + 0.16, peak.z),
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
    ctx.strokeStyle = cssColor(pal.flagPole, 0.98);
    ctx.lineWidth = Math.max(2, scalePx * 0.012);
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pTip.x, pTip.y);
    ctx.lineTo(pMid.x, pMid.y);
    ctx.closePath();
    ctx.fillStyle = cssColor(pal.flag, 1);
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
