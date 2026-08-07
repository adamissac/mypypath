/* Summit 3D — replaces the static hero mountain (summit.png) with a
   slowly rotating low-poly 3D scene: a craggy main peak with a jagged
   snowline, two rocky shoulder peaks, pine trees on the base, drifting
   clouds, a winding dashed trail, numbered stops 1-10, and a summit flag.

   Progressive enhancement: the <img> stays for no-JS, reduced-motion,
   WebGL-less browsers, or if three.js fails to load. */
(function () {
  'use strict';

  var THREE_SRC = '/assets/vendor/three.min.js';
  var TURN_SECONDS = 36;  // mountain: one full rotation
  var CLOUD_SECONDS = 70; // clouds drift slower for parallax

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

  /* Point on the main flank: radius shrinks linearly toward the peak */
  function trailPoint(t, baseRadius, height, turns, offset) {
    var angle = -Math.PI * 0.62 + t * turns * Math.PI * 2;
    var r = baseRadius * (1 - t * 0.96) + (offset || 0);
    return new THREE.Vector3(
      Math.cos(angle) * r,
      t * height,
      Math.sin(angle) * r
    );
  }

  /* Continuous pseudo-noise from angle + height ratio. Deterministic in
     its inputs, so shared cone-seam vertices displace identically and
     the surface never cracks. */
  function crag(a, h) {
    return (
      Math.sin(a * 3.1 + h * 5.2) * 0.45 +
      Math.sin(a * 5.7 + 1.3 - h * 2.1) * 0.33 +
      Math.sin(a * 9.3 + h * 11.0) * 0.22
    );
  }

  /* Build one craggy peak; classify each face as rock or snow and append
     it (with per-face colors) into the shared geometry buffers. */
  function addPeak(buf, opts) {
    var geo = new THREE.ConeGeometry(opts.radius, opts.height, opts.radialSegs, opts.heightSegs);
    geo.translate(0, opts.height / 2, 0);
    geo = geo.toNonIndexed();
    var pos = geo.attributes.position;

    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      var h = v.y / opts.height;
      if (h > 0.004 && h < 0.996) {
        var a = Math.atan2(v.z, v.x);
        // strongest crags mid-slope; base ring and tip stay clean
        var envelope = Math.sin(Math.PI * Math.min(h * 1.25, 1)) * (1 - h * 0.35);
        var ridge = 1 + crag(a, h) * 0.16 * envelope;
        v.x *= ridge;
        v.z *= ridge;
        v.y += crag(a + 2.4, h * 1.7) * 0.09 * envelope * opts.height * 0.33;
      }
      pos.setXYZ(i,
        v.x + opts.x, v.y + (opts.y || 0), v.z + opts.z);
    }

    var rockDeep = new THREE.Color('#16334f');
    var rockMid = new THREE.Color('#4f7ea8');
    var rockHigh = new THREE.Color('#7fa3c4');
    var snowLow = new THREE.Color('#cddcec');
    var snowHigh = new THREE.Color('#f4f8fd');
    var face = new THREE.Color();

    for (var f = 0; f < pos.count; f += 3) {
      var cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3 - (opts.y || 0);
      var cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3 - opts.x;
      var cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3 - opts.z;
      var ca = Math.atan2(cz, cx);

      // jagged absolute snowline shared by every peak
      var snowY = buf.snowY + Math.sin(ca * 3.3 + 2.0) * 0.17 + Math.sin(ca * 7.1) * 0.1;
      var isSnow = cy > snowY;

      var t = Math.min(Math.max(cy / opts.height, 0), 1);
      if (isSnow) {
        face.copy(snowLow).lerp(snowHigh, Math.min((cy - snowY) / 0.9, 1));
        face.offsetHSL(0, 0, (Math.random() - 0.5) * 0.045);
      } else if (t < 0.5) {
        face.copy(rockDeep).lerp(rockMid, t / 0.5);
        face.offsetHSL(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.085);
      } else {
        face.copy(rockMid).lerp(rockHigh, (t - 0.5) / 0.5);
        face.offsetHSL(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.085);
      }

      var target = isSnow ? buf.snow : buf.rock;
      for (var k = 0; k < 3; k++) {
        target.pos.push(pos.getX(f + k), pos.getY(f + k), pos.getZ(f + k));
        target.col.push(face.r, face.g, face.b);
      }
    }
  }

  function meshFromBuffer(part, material) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(part.col, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }

  function addTree(group, angle, dist, scale) {
    var x = Math.cos(angle) * dist;
    var z = Math.sin(angle) * dist;
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.03, 0.09, 5),
      new THREE.MeshStandardMaterial({ color: '#5d4433', flatShading: true })
    );
    trunk.position.set(x, 0.045 * scale, z);
    trunk.scale.setScalar(scale);
    group.add(trunk);

    var foliage = new THREE.MeshStandardMaterial({ color: '#2f6b57', flatShading: true, roughness: 0.9 });
    var lower = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.17, 6), foliage);
    lower.position.set(x, (0.09 + 0.085) * scale, z);
    lower.scale.setScalar(scale);
    group.add(lower);
    var upper = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.14, 6), foliage);
    upper.position.set(x, (0.09 + 0.16) * scale, z);
    upper.scale.setScalar(scale);
    group.add(upper);
  }

  function addCloud(cloudGroup, angle, dist, y, scale) {
    var mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      flatShading: true,
      roughness: 1,
      transparent: true,
      opacity: 0.92
    });
    var cloud = new THREE.Group();
    var lobes = [
      [0, 0, 0, 0.16],
      [0.17, -0.02, 0.03, 0.12],
      [-0.16, -0.03, -0.02, 0.11],
      [0.04, 0.05, -0.06, 0.1]
    ];
    for (var i = 0; i < lobes.length; i++) {
      var m = new THREE.Mesh(new THREE.IcosahedronGeometry(lobes[i][3], 0), mat);
      m.position.set(lobes[i][0], lobes[i][1], lobes[i][2]);
      cloud.add(m);
    }
    cloud.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
    cloud.scale.set(scale, scale * 0.62, scale);
    cloud.userData.baseY = y;
    cloudGroup.add(cloud);
    return cloud;
  }

  function buildMountain(group) {
    var HEIGHT = 3.0;
    var RADIUS = 1.9;

    var buf = {
      snowY: HEIGHT * 0.62,
      rock: { pos: [], col: [] },
      snow: { pos: [], col: [] }
    };

    /* Main peak + two rocky shoulder peaks for a craggier silhouette.
       Shoulders stay under the snowline and clear of the trail's spiral. */
    addPeak(buf, { radius: RADIUS, height: HEIGHT, radialSegs: 11, heightSegs: 6, x: 0, z: 0 });
    addPeak(buf, { radius: 0.82, height: 1.32, radialSegs: 7, heightSegs: 3, x: Math.cos(2.4) * 1.12, z: Math.sin(2.4) * 1.12 });
    addPeak(buf, { radius: 0.68, height: 0.95, radialSegs: 6, heightSegs: 3, x: Math.cos(5.3) * 1.28, z: Math.sin(5.3) * 1.28 });

    group.add(meshFromBuffer(buf.rock, new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.88,
      metalness: 0.04
    })));
    group.add(meshFromBuffer(buf.snow, new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.55,
      metalness: 0.0
    })));

    /* Ground disc, echoing the pale ellipse under the original art */
    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS * 1.35, 48),
      new THREE.MeshBasicMaterial({ color: '#dce9f7' })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.02;
    group.add(disc);

    /* Pines scattered on the apron between the shoulders and the rim */
    var treeSpots = [0.3, 0.9, 1.6, 2.9, 3.5, 4.1, 4.8, 5.6, 6.0];
    for (var ti = 0; ti < treeSpots.length; ti++) {
      addTree(group, treeSpots[ti] + Math.sin(ti * 7.3) * 0.15,
        2.08 + (ti % 3) * 0.15, 0.85 + ((ti * 37) % 10) / 22);
    }

    /* Winding dashed trail up the main flank */
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

  function buildClouds(scene) {
    var cloudGroup = new THREE.Group();
    scene.add(cloudGroup);
    var clouds = [
      addCloud(cloudGroup, 0.8, 2.15, 2.25, 1.0),
      addCloud(cloudGroup, 2.9, 2.3, 1.7, 0.8),
      addCloud(cloudGroup, 4.9, 2.05, 2.6, 0.65)
    ];
    return { group: cloudGroup, clouds: clouds };
  }

  function init() {
    var host = document.querySelector('.home-summit');
    var img = host && host.querySelector('.home-summit__art');
    if (!host || !img) return;

    var scene = new THREE.Scene();
    var group = new THREE.Group();
    scene.add(group);
    var dims = buildMountain(group);
    var sky = buildClouds(scene);

    scene.add(new THREE.AmbientLight('#ffffff', 0.62));
    scene.add(new THREE.HemisphereLight('#dcecff', '#31506e', 0.5));
    var sun = new THREE.DirectionalLight('#fff4e0', 1.15);
    sun.position.set(4, 6, 3);
    scene.add(sun);
    var fill = new THREE.DirectionalLight('#9fc3e8', 0.4);
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
    var elapsed = 0;

    function frame(now) {
      rafId = null;
      if (last !== null) {
        var dt = Math.min((now - last) / 1000, 0.1);
        elapsed += dt;
        group.rotation.y += dt * (Math.PI * 2) / TURN_SECONDS;
        sky.group.rotation.y += dt * (Math.PI * 2) / CLOUD_SECONDS;
        for (var i = 0; i < sky.clouds.length; i++) {
          sky.clouds[i].position.y =
            sky.clouds[i].userData.baseY + Math.sin(elapsed * 0.45 + i * 2.1) * 0.06;
        }
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
