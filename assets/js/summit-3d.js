/* Summit 3D — a rotating alpine diorama: offset snowy peaks, a switchback
   trail with ten stops, blue pine groves, a glacial lake, and a
   fractured floating island. Terrain and trail share one height field.

   Progressive enhancement: the <img> stays for no-JS, reduced-motion,
   WebGL-less browsers, or if three.js fails to load. */
(function () {
  'use strict';

  var THREE_SRC = '/assets/vendor/three.min.js';
  var TURN_SECONDS = 52;  // mountain: one full rotation
  var CLOUD_SECONDS = 70; // clouds drift slower for parallax
  var host = document.querySelector('.home-summit');
  var mountain = host && host.querySelector('.home-summit__mountain');
  var moon = host && host.querySelector('.home-summit__moon');
  var started = false;

  // Mount exactly one scene. Keep the inactive scene detached so it cannot
  // flash, occupy space, or remain in the accessibility tree.
  function syncCourseArtwork() {
    if (!host || !mountain || !moon) return;
    var next = document.documentElement.dataset.course === 'data' ? moon : mountain;
    if (host.firstElementChild !== next || host.children.length !== 1) host.replaceChildren(next);
    if (next === mountain) boot();
  }

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

  /* three.min.js is 618KB -- by a wide margin the largest asset this site
   * serves, and it is decoration. The static summit.png underneath it is a
   * complete picture of the same mountain, which is why the <img> stays in the
   * markup: nothing is missing while this loads, or if it never does.
   *
   * It used to fetch on requestIdleCallback with a 2.5s timeout, which still
   * charged every homepage visitor 618KB -- including people who never scroll
   * to the mountain -- and landed inside the 4s perf window. Approach is the
   * real signal, same as the Pyodide warmup: load when the summit is near.
   *
   * It is also skipped outright in two cases the old code did not consider,
   * both of which are someone telling us not to:
   *
   *   Save-Data. A header that exists precisely to mean "do not send me
   *   decorative payloads". 618KB of rotating mountain is the canonical thing
   *   it is asking us not to send.
   *
   *   A 2G or slow-3G connection. On those, 618KB is measured in tens of
   *   seconds, during which it is stealing bandwidth from the lesson the
   *   visitor came for.
   *
   * Both fall back to the <img>, which is what a reduced-motion or WebGL-less
   * visitor already gets. */
  function shouldSkipHeavyScene() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return false;
    if (c.saveData === true) return true;
    return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
  }

  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    if (shouldSkipHeavyScene()) return;

    function fetchIt() {
      var s = document.createElement('script');
      s.src = THREE_SRC;
      s.onload = function () { if (window.THREE) cb(); };
      document.head.appendChild(s);
    }

    /* Idle-with-2.5s-timeout still fetched 618KB on every homepage open,
     * including visitors who never scroll to the mountain, and it landed
     * inside the 4s perf window. Approach is the real signal: the static
     * <img> is already the picture. */
    if (host && 'IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            obs.disconnect();
            fetchIt();
            return;
          }
        }
      }, { rootMargin: '40% 0px' });
      obs.observe(host);
      return;
    }
    fetchIt();
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
    ctx.fillStyle = '#0369a1';
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

  /* A shared height field makes the ridges, trail and forest belong to
     the same landscape. Offset peaks avoid a rotationally symmetric cone. */
  function terrainHeight(x, z) {
    var peaks = [
      [-0.42, -0.38, 2.8, 1.85, 1.58],
      [0.88, -0.12, 2.15, 1.32, 1.4],
      [-1.12, 0.58, 1.7, 1.08, 1.1],
      [0.45, -1.15, 1.6, 1.2, 0.9]
    ];
    var height = 0;
    for (var i = 0; i < peaks.length; i++) {
      var p = peaks[i];
      var dx = (x - p[0]) / p[3], dz = (z - p[1]) / p[4];
      var angle = Math.atan2(dz, dx);
      var distance = Math.hypot(dx, dz);
      var ridge = 1 + 0.065 * Math.sin(angle * 3 + i) + 0.035 * Math.cos(angle * 5 - i);
      height = Math.max(height, p[2] * Math.pow(Math.max(0, 1 - distance * ridge), 1.2));
    }
    return 0.07 + height;
  }

  function islandRadius(angle) {
    return 2.42 + Math.sin(angle * 5) * 0.13 + Math.cos(angle * 3) * 0.12;
  }

  function terrainFace(part, a, b, c, color) {
    [a, b, c].forEach(function (v) {
      part.pos.push(v.x, v.y, v.z);
      part.col.push(color.r, color.g, color.b);
    });
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
    var ground = terrainHeight(x, z);
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.03, 0.09, 5),
      new THREE.MeshStandardMaterial({ color: '#0c4566', flatShading: true })
    );
    trunk.position.set(x, ground + 0.045 * scale, z);
    trunk.scale.setScalar(scale);
    group.add(trunk);

    var foliage = new THREE.MeshStandardMaterial({ color: '#165a7a', flatShading: true, roughness: 0.9 });
    var lower = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.17, 6), foliage);
    lower.position.set(x, ground + (0.09 + 0.085) * scale, z);
    lower.scale.setScalar(scale);
    group.add(lower);
    var upper = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.14, 6), foliage);
    upper.position.set(x, ground + (0.09 + 0.16) * scale, z);
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
    var surface = { pos: [], col: [] };
    var rings = [], segments = 36, steps = 14;
    var summit = new THREE.Vector3(0, 0, 0);
    for (var r = 0; r <= steps; r++) {
      var row = [];
      for (var j = 0; j < segments; j++) {
        var angle = j / segments * Math.PI * 2;
        var radius = islandRadius(angle) * r / steps;
        var x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        var vertex = new THREE.Vector3(x, terrainHeight(x, z), z);
        row.push(vertex);
        if (vertex.y > summit.y) summit.copy(vertex);
      }
      rings.push(row);
    }
    function face(a, b, c) {
      var y = (a.y + b.y + c.y) / 3;
      var x = (a.x + b.x + c.x) / 3;
      var z = (a.z + b.z + c.z) / 3;
      var snowline = (x > 0.45 ? 1.6 : 1.9) + Math.sin(x * 5 + z * 4) * 0.12 + Math.cos(z * 5) * 0.08;
      var color = new THREE.Color();
      if (y > snowline) {
        color.set('#e5f3fa').lerp(new THREE.Color('#ffffff'), Math.min((y - snowline) / 1.3, 1));
      } else if (y < 0.32) {
        color.set('#428aba').lerp(new THREE.Color('#76b8db'), y / 0.32);
      } else {
        color.set('#0c4566').lerp(new THREE.Color('#1679b0'), Math.min(y / 1.7, 1));
      }
      terrainFace(surface, a, b, c, color);
    }
    for (var ri = 0; ri < steps; ri++) {
      for (var si = 0; si < segments; si++) {
        var next = (si + 1) % segments;
        face(rings[ri][si], rings[ri][next], rings[ri + 1][si]);
        face(rings[ri][next], rings[ri + 1][next], rings[ri + 1][si]);
      }
    }
    group.add(meshFromBuffer(surface, new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.86, side: THREE.DoubleSide
    })));

    /* Broken rock strata taper underneath the irregular meadow edge. */
    var rock = { pos: [], col: [] }, strata = [];
    for (var layer = 0; layer < 4; layer++) {
      var band = [];
      for (var k = 0; k < segments; k++) {
        var a = k / segments * Math.PI * 2;
        var radius = islandRadius(a) * [1, 0.95, 0.66, 0.22][layer];
        var y = [0.07, -0.23, -0.85, -1.28][layer];
        if (layer > 0) y += Math.sin(k * 2.7 + layer) * 0.14;
        band.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
      }
      strata.push(band);
    }
    for (var l = 0; l < 3; l++) {
      for (var n = 0; n < segments; n++) {
        var nextRock = (n + 1) % segments;
        var tint = new THREE.Color(['#286e9b', '#0c4566', '#0a2840'][l]);
        tint.offsetHSL(0, 0, Math.sin(n * 1.1 + l) * 0.025);
        terrainFace(rock, strata[l][n], strata[l + 1][n], strata[l][nextRock], tint);
        terrainFace(rock, strata[l][nextRock], strata[l + 1][n], strata[l + 1][nextRock], tint);
      }
    }
    group.add(meshFromBuffer(rock, new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide
    })));

    for (var tree = 0; tree < 18; tree++) {
      var angle = tree * 2.399;
      var dist = 1.6 + (Math.sin(tree * 3.7) + 1) * 0.33;
      // Leave the front-right shore open for the lake.
      if (Math.cos(angle) > 0.15 && Math.sin(angle) > 0.5) continue;
      addTree(group, angle, dist, 0.7 + (Math.sin(tree * 8.1) + 1) * 0.3);
    }

    /* A quiet glacial lake uses the same blue as the site accents. */
    var waterMat = new THREE.MeshStandardMaterial({ color: '#0284c7', emissive: '#0369a1', emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.25, side: THREE.DoubleSide });
    var lakeShape = new THREE.Shape();
    for (var shore = 0; shore <= 32; shore++) {
      var shoreAngle = shore / 32 * Math.PI * 2;
      var shoreRadius = 0.45 + Math.sin(shoreAngle * 3) * 0.035 + Math.cos(shoreAngle * 5) * 0.02;
      var sx = Math.cos(shoreAngle) * shoreRadius, sy = Math.sin(shoreAngle) * shoreRadius;
      if (shore === 0) lakeShape.moveTo(sx, sy); else lakeShape.lineTo(sx, sy);
    }
    var lake = new THREE.Mesh(new THREE.ShapeGeometry(lakeShape), waterMat);
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(0.8, 1.25, 1);
    lake.position.set(1.15, 0.092, 1.58);
    group.add(lake);
    /* Switchbacks follow the actual terrain instead of wrapping like a spring. */
    var route = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.9, 0, 1.2), new THREE.Vector3(-0.65, 0, 1.5),
      new THREE.Vector3(0.25, 0, 1.1), new THREE.Vector3(-0.85, 0, 0.8),
      new THREE.Vector3(-0.05, 0, 0.48), new THREE.Vector3(-0.68, 0, 0.17),
      new THREE.Vector3(-0.28, 0, -0.06), new THREE.Vector3(summit.x, 0, summit.z)
    ]);
    var points = route.getPoints(240).map(function (p) {
      p.y = terrainHeight(p.x, p.z) + 0.065;
      return p;
    });
    var trail = new THREE.CatmullRomCurve3(points);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(trail, 240, 0.022, 5, false),
      new THREE.MeshStandardMaterial({ color: '#e0f2fe', emissive: '#0ea5e9', emissiveIntensity: 0.45, roughness: 0.6 })));
    for (var stop = 1; stop <= 10; stop++) {
      var p = trail.getPointAt((stop - 1) / 9);
      var marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeStopTexture(String(stop)), toneMapped: false }));
      marker.position.copy(p);
      marker.position.y += 0.09;
      marker.scale.setScalar(0.25);
      group.add(marker);
    }

    var top = summit.y;
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6), new THREE.MeshStandardMaterial({ color: '#1c344c' }));
    pole.position.set(summit.x, top + 0.2, summit.z);
    group.add(pole);
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), new THREE.MeshStandardMaterial({ color: '#0ea5e9', side: THREE.DoubleSide, roughness: 0.75 }));
    flag.position.set(summit.x + 0.16, top + 0.32, summit.z);
    group.add(flag);

    return { height: 3.3 };
  }

  function buildClouds(scene) {
    var cloudGroup = new THREE.Group();
    scene.add(cloudGroup);
    var clouds = [
      addCloud(cloudGroup, 0.4, 2.1, 1.85, 1.35),
      addCloud(cloudGroup, 2.9, 2.15, 1.6, 1.15),
      addCloud(cloudGroup, 4.9, 2.05, 2.55, 0.85)
    ];
    return { group: cloudGroup, clouds: clouds };
  }

  function init() {
    var img = mountain && mountain.querySelector('.home-summit__art');
    if (!host || !img) return;

    var scene = new THREE.Scene();
    var group = new THREE.Group();
    scene.add(group);
    buildMountain(group);
    var sky = buildClouds(scene);

    scene.add(new THREE.AmbientLight('#ffffff', 0.35));
    scene.add(new THREE.HemisphereLight('#dcecff', '#31506e', 0.5));
    var sun = new THREE.DirectionalLight('#eef8ff', 1.15);
    sun.position.set(4, 6, 3);
    scene.add(sun);
    var fill = new THREE.DirectionalLight('#95d9ff', 0.5);
    fill.position.set(-4, 2, -2);
    scene.add(fill);
    var rim = new THREE.DirectionalLight('#7dd3fc', 0.75);
    rim.position.set(2, 1, -5);
    scene.add(rim);

    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camera.position.set(0, 3.5, 10.2);
    camera.lookAt(0, 0.8, 0);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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

    mountain.appendChild(renderer.domElement);
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
        group.position.y = Math.sin(elapsed * 0.65) * 0.065;
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
      if (onScreen && !document.hidden && document.documentElement.dataset.course !== 'data' && rafId === null) {
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

    new MutationObserver(function () {
      if (document.documentElement.dataset.course === 'data') halt(); else schedule();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-course'] });
    schedule();
  }

  function boot() {
    if (started || document.documentElement.dataset.course === 'data') return;
    if (!document.body || !document.body.classList.contains('page-home')) return;
    if (prefersReduced() || !webglAvailable()) return;
    if (!mountain || !mountain.querySelector('.home-summit__art')) return;
    started = true;
    loadThree(init);
  }

  // Deferred scripts run while readyState is interactive, before other
  // modules have finished. Do not let the optional 3D library compete with
  // those modules: wait for DOMContentLoaded even in that intermediate state.
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', syncCourseArtwork, { once: true });
  } else {
    syncCourseArtwork();
  }
  new MutationObserver(syncCourseArtwork).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-course'],
  });
})();
