/* Summit 3D — replaces the static hero mountain (summit.png) with a
   slowly rotating low-poly 3D mountain: faceted slopes, winding dashed
   trail, numbered stops 1-10, and a flag on the peak.

   Progressive enhancement: the <img> stays for no-JS, reduced-motion,
   WebGL-less browsers, or if three.js fails to load. */
(function () {
  'use strict';

  var THREE_SRC = '/assets/vendor/three.min.js';
  var TURN_SECONDS = 36; // one full rotation — slow, ambient

  function prefersReduced() {
    if (window.PyMotion && typeof window.PyMotion.prefersReduced === 'function') {
      return window.PyMotion.prefersReduced();
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function webglAvailable() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    var s = document.createElement('script');
    s.src = THREE_SRC;
    s.onload = function () { if (window.THREE) cb(); };
    document.head.appendChild(s);
  }

  /* Canvas-drawn numbered stop marker, used as an always-facing sprite */
  function makeStopTexture(label) {
    var size = 128;
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#1f7ae0';
    ctx.fill();
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 ' + size * 0.44 + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size * 0.54);
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  /* Point on the mountain flank: radius shrinks linearly toward the peak */
  function trailPoint(t, baseRadius, height, turns, offset) {
    var angle = -Math.PI * 0.62 + t * turns * Math.PI * 2;
    var r = baseRadius * (1 - t * 0.96) + (offset || 0);
    return new THREE.Vector3(
      Math.cos(angle) * r,
      t * height,
      Math.sin(angle) * r
    );
  }

  function buildMountain(group) {
    var HEIGHT = 3.0;
    var RADIUS = 1.9;

    /* Faceted cone — jittered vertices + per-face colors for the
       low-poly look of the original art */
    var geo = new THREE.ConeGeometry(RADIUS, HEIGHT, 9, 5);
    geo.translate(0, HEIGHT / 2, 0);
    geo = geo.toNonIndexed();

    var pos = geo.attributes.position;
    var jitter = {};
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y > 0.01 && y < HEIGHT - 0.01) {
        var key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
        if (!(key in jitter)) {
          jitter[key] = {
            r: 1 + (Math.random() - 0.5) * 0.16,
            y: (Math.random() - 0.5) * 0.14
          };
        }
        var j = jitter[key];
        pos.setX(i, x * j.r);
        pos.setZ(i, z * j.r);
        pos.setY(i, y + j.y);
      }
    }

    /* Face colors: deep navy at the base to pale ice-blue near the
       snow line, with slight per-face variation */
    var base = new THREE.Color('#1d3f5e');
    var mid = new THREE.Color('#5b82a6');
    var snow = new THREE.Color('#dbe7f3');
    var colors = new Float32Array(pos.count * 3);
    var face = new THREE.Color();
    for (var f = 0; f < pos.count; f += 3) {
      var cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
      var t = Math.min(Math.max(cy / HEIGHT, 0), 1);
      if (t < 0.55) {
        face.copy(base).lerp(mid, t / 0.55);
      } else {
        face.copy(mid).lerp(snow, (t - 0.55) / 0.45);
      }
      var v = (Math.random() - 0.5) * 0.07;
      face.offsetHSL(0, 0, v);
      for (var k = 0; k < 3; k++) {
        colors[(f + k) * 3] = face.r;
        colors[(f + k) * 3 + 1] = face.g;
        colors[(f + k) * 3 + 2] = face.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    var mountain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.85,
        metalness: 0.05
      })
    );
    group.add(mountain);

    /* Ground disc, echoing the pale ellipse under the original art */
    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS * 1.35, 48),
      new THREE.MeshBasicMaterial({ color: '#dce9f7' })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.02;
    group.add(disc);

    /* Winding dashed trail up the flank */
    var TURNS = 2.2;
    var pts = [];
    for (var s = 0; s <= 160; s++) {
      pts.push(trailPoint(s / 160, RADIUS, HEIGHT * 0.965, TURNS, 0.1));
    }
    var trailGeo = new THREE.BufferGeometry().setFromPoints(pts);
    var trail = new THREE.Line(
      trailGeo,
      new THREE.LineDashedMaterial({
        color: '#1f7ae0',
        dashSize: 0.11,
        gapSize: 0.07,
        linewidth: 2
      })
    );
    trail.computeLineDistances();
    group.add(trail);

    /* Numbered stops 1-10 along the trail — sprites always face the
       camera, and get occluded when they pass behind the mountain */
    for (var n = 1; n <= 10; n++) {
      var tt = 0.04 + ((n - 1) / 9) * 0.92;
      var p = trailPoint(tt, RADIUS, HEIGHT * 0.965, TURNS, 0.16);
      var sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: makeStopTexture(String(n)) })
      );
      sprite.position.copy(p);
      var sc = 0.34 - tt * 0.08;
      sprite.scale.set(sc, sc, 1);
      group.add(sprite);
    }

    /* Flag on the summit */
    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6),
      new THREE.MeshBasicMaterial({ color: '#12293d' })
    );
    pole.position.set(0, HEIGHT + 0.22, 0);
    group.add(pole);

    var flagShape = new THREE.BufferGeometry();
    flagShape.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0,
      0.42, 0.11, 0,
      0, 0.24, 0
    ]), 3));
    flagShape.computeVertexNormals();
    var flag = new THREE.Mesh(
      flagShape,
      new THREE.MeshBasicMaterial({ color: '#1f7ae0', side: THREE.DoubleSide })
    );
    flag.position.set(0.02, HEIGHT + 0.22, 0);
    group.add(flag);

    return { height: HEIGHT };
  }

  function init() {
    var host = document.querySelector('.home-summit');
    var img = host && host.querySelector('.home-summit__art');
    if (!host || !img) return;

    var scene = new THREE.Scene();
    var group = new THREE.Group();
    scene.add(group);
    var dims = buildMountain(group);

    scene.add(new THREE.AmbientLight('#ffffff', 0.75));
    var sun = new THREE.DirectionalLight('#ffffff', 1.1);
    sun.position.set(4, 6, 3);
    scene.add(sun);
    var fill = new THREE.DirectionalLight('#bcd7ef', 0.35);
    fill.position.set(-4, 2, -2);
    scene.add(fill);

    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camera.position.set(0, dims.height * 0.62, 7.8);
    camera.lookAt(0, dims.height * 0.47, 0);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'home-summit__canvas';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', img.getAttribute('alt') || 'Rotating mountain with ten numbered stops');

    function size() {
      var w = host.clientWidth || 320;
      renderer.setSize(w, w, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    }
    size();

    host.appendChild(renderer.domElement);
    host.classList.add('is-3d');

    if (window.ResizeObserver) {
      new ResizeObserver(size).observe(host);
    } else {
      window.addEventListener('resize', size);
    }

    /* Render only while on-screen and the tab is visible */
    var onScreen = true;
    var rafId = null;
    var last = null;

    function frame(now) {
      rafId = null;
      if (last !== null) {
        var dt = Math.min((now - last) / 1000, 0.1);
        group.rotation.y += dt * (Math.PI * 2) / TURN_SECONDS;
      }
      last = now;
      renderer.render(scene, camera);
      schedule();
    }

    function schedule() {
      if (onScreen && !document.hidden && rafId === null) {
        rafId = window.requestAnimationFrame(frame);
      }
    }

    function halt() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      last = null;
    }

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) schedule(); else halt();
      }, { threshold: 0.02 }).observe(host);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) halt(); else schedule();
    });

    schedule();
  }

  function boot() {
    if (!document.body || !document.body.classList.contains('page-home')) return;
    if (prefersReduced() || !webglAvailable()) return;
    if (!document.querySelector('.home-summit .home-summit__art')) return;
    loadThree(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
