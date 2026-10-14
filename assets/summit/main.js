/* PyPath summit diorama — the scene the home hero mounts.
 *
 * Built into assets/js/summit-scene.js by scripts/build-summit.mjs and loaded by
 * assets/js/summit-3d.js only for visitors who qualify (see qualify.js). If
 * anything here fails, onFail() hands the hero back to the still image. */
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AdditiveBlending, Sprite, SpriteMaterial } from 'three';
import { createRenderer, createStage, dressModel, stopMarker, hitSphere, softDot } from './scene.js';
import { createClouds, createBirds, createFireworks } from './living.js';
import { createInteraction, toScreen } from './interact.js';
import { createSpin } from './spin.js';
import { entranceAt } from './timeline.js';
import { stopStates } from './progress.js';

export { entrancePlan } from './timeline.js';
export { qualifies } from './qualify.js';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function trailSampler(points) {
  const v = points.map((p) => new Vector3().fromArray(p));
  const last = v.length - 1;
  const out = new Vector3();
  return {
    at(f, target = out) {
      const x = Math.max(0, Math.min(1, f)) * last;
      const i = Math.min(Math.floor(x), last - 1);
      return target.copy(v[i]).lerp(v[i + 1], x - i);
    },
    heading(f) {
      const x = Math.max(0, Math.min(1, f)) * last;
      const i = Math.min(Math.floor(x), last - 1);
      return Math.atan2(-(v[i + 1].z - v[i].z), v[i + 1].x - v[i].x);
    },
  };
}

export async function mount(host, opts) {
  const {
    modelUrl, meta, units = [], completedUnits = [], theme = 'light',
    small = false, shadows = true, onReady = () => {}, onFail = () => {}, label: labelText,
  } = opts;

  // `plan` may be a function: the entrance is decided once the scene is ready,
  // because how long the model took is what decides it.
  let plan = typeof opts.plan === 'function' ? 'none' : (opts.plan || 'full');

  const canvas = document.createElement('canvas');
  canvas.className = 'home-summit__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', labelText || 'A floating mountain island with a trail of ten numbered stops. You can drag to turn it.');

  let renderer;
  try {
    renderer = createRenderer(canvas, { small });
  } catch (err) {
    onFail(err);
    return null;
  }
  renderer.shadowMap.enabled = shadows;

  const stage = createStage(meta, { shadows });
  const { scene, camera, lift, pivot, contact } = stage;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let gltf;
  try {
    gltf = await loader.loadAsync(modelUrl);
  } catch (err) {
    renderer.dispose();
    onFail(err);
    return null;
  }

  const model = gltf.scene;
  const handles = dressModel(model, { shadows });
  pivot.add(model);

  const trail = trailSampler(meta.trail);
  const lastIndex = meta.trail.length - 1;
  const states = stopStates(completedUnits);

  // Number markers and generous invisible hit areas, riding the island.
  const markers = [];
  const hits = [];
  meta.stops.forEach((stop, i) => {
    const unit = units[i] || { n: stop.n, title: `Unit ${stop.n}`, href: `/units/unit-${stop.n}.html` };
    const marker = stopMarker(stop.n);
    marker.position.fromArray(stop.top).add(new Vector3(0, 0.16, 0));
    marker.scale.setScalar(0.24);
    pivot.add(marker);
    const hit = hitSphere(0.2);
    hit.position.copy(marker.position).add(new Vector3(0, -0.06, 0));
    hit.userData.target = { kind: 'stop', index: i, unit, marker, fraction: stop.fraction };
    pivot.add(hit);
    hits.push(hit);
    markers.push(marker);
  });
  // Night glow round each lantern.
  const glowTex = softDot(64, 'rgba(255,206,110,0.9)', 'rgba(255,206,110,0)');
  const glows = handles.lanterns.map((lantern) => {
    const g = new Sprite(new SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, opacity: 0 }));
    lantern.geometry.computeBoundingBox();
    lantern.geometry.boundingBox.getCenter(g.position);
    g.scale.setScalar(0.46);
    pivot.add(g);
    return g;
  });
  const flagHit = hitSphere(0.24);
  flagHit.position.fromArray(meta.flag);
  flagHit.userData.target = { kind: 'flag' };
  pivot.add(flagHit);
  hits.push(flagHit);

  const hiker = handles.hiker;
  const hikerTarget = meta.stops[states.hiker].trailIndex / lastIndex;
  const hikerPos = new Vector3();

  const clouds = createClouds(scene);
  const birds = createBirds(pivot, meta.summit);
  const fireworks = createFireworks(pivot);

  // Label pill, positioned over the canvas.
  const label = document.createElement('div');
  label.className = 'home-summit__label';
  label.setAttribute('aria-hidden', 'true');
  label.hidden = true;

  const spin = createSpin();
  let hoverTarget = null;
  let clock = 0;
  let entranceT = 0;
  let nightTarget = theme === 'dark' ? 1 : 0;
  stage.setNight(nightTarget);
  handles.uniforms.night.value = nightTarget;

  const interaction = createInteraction({
    host,
    canvas,
    camera,
    spin,
    targets: () => hits,
    onHover(target) {
      hoverTarget = target;
      if (target && target.kind === 'stop') {
        const u = target.unit;
        label.textContent = `Unit ${u.n} · ${u.title}${u.hours ? ` · ${u.hours}` : ''}`;
        label.hidden = false;
      } else {
        label.hidden = true;
      }
      host.dataset.hover = target && target.kind === 'stop' ? String(target.unit.n) : '';
    },
    onStop(target) {
      window.location.assign(target.unit.href);
    },
    onFlag() {
      if (fireworks.burst(flagHit.position.clone().add(new Vector3(0, 0.3, 0)), clock)) host.dataset.fireworks = String(Date.now());
    },
  });

  // ── frame ──────────────────────────────────────────────────────────────
  let running = false;
  let raf = 0;
  let last = 0;
  let onScreen = true;
  let paused = false;
  const markerState = [];

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    clock += dt;
    entranceT += dt;
    const e = entranceAt(entranceT, plan);

    // Night follows the theme over ~600 ms.
    const night = stage.night + (nightTarget - stage.night) * (1 - Math.exp(-dt * 7));
    if (Math.abs(night - stage.night) > 1e-4) stage.setNight(night);
    handles.uniforms.night.value = stage.night;
    handles.uniforms.time.value = clock;
    handles.uniforms.reveal.value = easeInOut(e.trail);

    // Rise through the clouds, then spin/lean.
    const rise = easeOut(e.rise);
    lift.position.y = -3.6 * (1 - rise) + Math.sin(clock * 0.65) * 0.05 * rise;
    const s = spin.step(e.done ? dt : 0);
    const l = interaction.step(dt);
    pivot.rotation.set(s.tilt + l.pitch, s.yaw + l.yaw - (1 - rise) * 0.9, 0);
    contact.material.opacity = rise * 0.08;
    clouds.update(clock, e.clouds, stage.night);
    birds.update(clock, stage.night);
    fireworks.update(dt);

    // Stops pop in as the light passes them; lanterns show what is finished.
    const reveal = handles.uniforms.reveal.value;
    markers.forEach((m, i) => {
      const pop = Math.max(0, Math.min(1, (reveal - meta.stops[i].fraction) * 14 + 1));
      const hovered = hoverTarget && hoverTarget.index === i && hoverTarget.kind === 'stop';
      const scale = 0.24 * easeOut(pop) * (hovered ? 1.25 : 1);
      m.scale.setScalar(Math.max(scale, 0.0001));
      const want = states.lit[i] ? 'lit' : i === states.hiker ? 'here' : 'idle';
      if (markerState[i] !== want) { markerState[i] = want; m.userData.draw(want); }
      const lantern = handles.lanterns[i];
      if (lantern) {
        const lit = states.lit[i] ? 0.8 + 1.6 * stage.night : 0.25 * stage.night;
        lantern.material.emissiveIntensity = lit + (hovered ? 1.2 : 0);
        glows[i].material.opacity = (states.lit[i] ? 0.85 : 0.3) * stage.night + (hovered ? 0.5 : 0);
        glows[i].visible = glows[i].material.opacity > 0.01;
      }
      const cairn = handles.cairns[i];
      if (cairn) cairn.position.y += ((hovered ? 0.025 : 0) - cairn.position.y) * Math.min(1, dt * 12);
    });
    if (handles.windows) handles.windows.material.emissiveIntensity = 1.9 * stage.night;

    // The hiker walks from the cabin to their stop, then waits.
    if (hiker) {
      const f = hikerTarget * easeInOut(e.hiker);
      trail.at(f, hikerPos);
      hiker.position.copy(hikerPos);
      hiker.position.y += e.hiker > 0 && e.hiker < 1 ? Math.abs(Math.sin(clock * 12)) * 0.01 : Math.sin(clock * 2) * 0.002;
      hiker.rotation.y = trail.heading(Math.min(f + 0.002, 1));
      hiker.visible = e.trail > 0.02 || plan !== 'full';
    }

    if (!label.hidden && hoverTarget && hoverTarget.marker) {
      const p = toScreen(hoverTarget.marker, 0.14, camera, canvas);
      label.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    }

    renderer.render(scene, camera);
    host.dataset.entranceDone = e.done ? '1' : '0';
    schedule();
  }

  // One full frame at t = 0 (markers, hiker, clouds all placed) before the
  // canvas is shown, so it never flashes a half-built scene.
  function frameOnce() {
    frame(performance.now());
  }

  function schedule() {
    const want = onScreen && !paused && !document.hidden;
    running = want;
    host.dataset.running = want ? '1' : '0';
    if (want && !raf) raf = requestAnimationFrame(frame);
    if (!want) last = 0;
  }

  function pagePoint(object, dy) {
    const r = canvas.getBoundingClientRect();
    const p = toScreen(object, dy, camera, canvas);
    return { x: r.left + p.x, y: r.top + p.y };
  }

  function size() {
    const w = host.clientWidth || 320;
    renderer.setSize(w, w, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }

  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    paused = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    host.dataset.running = '0';
    onFail(new Error('webgl context lost'));
  });

  size();
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
  if (ro) ro.observe(host); else window.addEventListener('resize', size);
  const io = window.IntersectionObserver ? new IntersectionObserver((entries) => {
    onScreen = entries[0].isIntersecting;
    schedule();
  }, { threshold: 0.02 }) : null;
  if (io) io.observe(host);
  const onVisibility = () => schedule();
  document.addEventListener('visibilitychange', onVisibility);

  if (typeof opts.plan === 'function') plan = opts.plan();
  host.dataset.entrance = plan;
  // First frame before revealing, so the canvas never flashes empty.
  frameOnce();
  onReady({ canvas, label, plan });
  schedule();

  return {
    setTheme(t) {
      nightTarget = t === 'dark' ? 1 : 0;
      host.dataset.sceneTheme = t === 'dark' ? 'dark' : 'light';
      schedule();
    },
    pause() { paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; schedule(); },
    resume() { paused = false; schedule(); },
    dispose() {
      paused = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
    },
    get running() { return running; },
    // Where a stop / the flag is on screen right now (viewport px), for tests.
    stopPoint(i) { return pagePoint(markers[i], -0.02); },
    flagPoint() { return pagePoint(flagHit, 0); },
  };
}

