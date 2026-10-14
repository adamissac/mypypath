/* The summit diorama's renderer, lights and materials.
 *
 * The model (assets/models/summit.glb) is built by scripts/summit/build_diorama.py:
 * vertex colours with ambient occlusion baked in, no materials. Everything here
 * turns those meshes into the miniature: soft sun, sky light, a contact shadow,
 * and a night rig that the site's dark theme cross-fades to. */
import {
  ACESFilmicToneMapping, AdditiveBlending, BufferGeometry, CanvasTexture, CircleGeometry, Color, DirectionalLight,
  DoubleSide, Float32BufferAttribute, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, Points, PointsMaterial,
  Scene, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';

const DAY = {
  sun: new Color('#fff4e2'), sunI: 2.4, sky: new Color('#dcecff'), ground: new Color('#3a5f7d'), hemiI: 1.15,
  fill: new Color('#9fd8ff'), fillI: 0.55, exposure: 1.0,
};
const NIGHT = {
  sun: new Color('#9db8ff'), sunI: 0.75, sky: new Color('#2a3d66'), ground: new Color('#0b1424'), hemiI: 0.55,
  fill: new Color('#6f86ff'), fillI: 0.35, exposure: 1.05,
};

export function softDot(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createRenderer(canvas, { small }) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

export function createStage(meta, { shadows }) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(meta.camera.fov, 1, 0.1, 80);
  camera.position.fromArray(meta.camera.position);
  const target = new Vector3().fromArray(meta.camera.target);
  camera.lookAt(target);

  // world -> lift (entrance) -> pivot (spin/tilt) -> model
  const lift = new Group();
  const pivot = new Group();
  scene.add(lift);
  lift.add(pivot);

  const hemi = new HemisphereLight(DAY.sky, DAY.ground, DAY.hemiI);
  scene.add(hemi);
  const sun = new DirectionalLight(DAY.sun, DAY.sunI);
  sun.position.set(4.5, 7.5, 4.0);
  scene.add(sun);
  scene.add(sun.target);
  const fill = new DirectionalLight(DAY.fill, DAY.fillI);
  fill.position.set(-5, 2.5, -3);
  scene.add(fill);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.045;
    sun.shadow.radius = 3;
    const cam = sun.shadow.camera;
    cam.left = -3.4; cam.right = 3.4; cam.top = 3.4; cam.bottom = -3.4; cam.near = 1; cam.far = 20;
  }

  // Contact shadow far below the floating island: a flat 12-sided disc.
  const contact = new Mesh(new CircleGeometry(1, 12), new MeshBasicMaterial({ color: '#0c4566', transparent: true, opacity: 0.12, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.scale.set(1.25, 0.4, 1);
  contact.position.y = -2.55;
  scene.add(contact);

  // A sparse star field round the island, shown at night.
  const starGeo = new BufferGeometry();
  const pts = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 3.6 + rnd() * 2.2;
    pts.push(Math.cos(a) * r, -1.5 + rnd() * 6.5, Math.sin(a) * r - 1.5);
  }
  starGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const stars = new Points(starGeo, new PointsMaterial({
    map: softDot(32), size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, color: '#dfe8ff',
  }));
  scene.add(stars);

  let night = 0;
  function setNight(n) {
    night = n;
    hemi.color.copy(DAY.sky).lerp(NIGHT.sky, n);
    hemi.groundColor.copy(DAY.ground).lerp(NIGHT.ground, n);
    hemi.intensity = DAY.hemiI + (NIGHT.hemiI - DAY.hemiI) * n;
    sun.color.copy(DAY.sun).lerp(NIGHT.sun, n);
    sun.intensity = DAY.sunI + (NIGHT.sunI - DAY.sunI) * n;
    fill.color.copy(DAY.fill).lerp(NIGHT.fill, n);
    fill.intensity = DAY.fillI + (NIGHT.fillI - DAY.fillI) * n;
    stars.material.opacity = n * 0.9;
    stars.visible = n > 0.01;
  }
  setNight(0);

  return { scene, camera, lift, pivot, sun, contact, stars, setNight, get night() { return night; } };
}

/* Replace the model's (absent) materials with the diorama's. Returns handles
   the animation code needs. */
export function dressModel(root, { shadows }) {
  const byName = {};
  root.traverse((o) => { if (o.isMesh) byName[o.name] = o; });
  // Flat shading: every facet one colour, lit as a plane (the site's flat,
  // sharp-edged style).
  const clay = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
  const handles = { lanterns: [], cairns: [], uniforms: { time: { value: 0 }, reveal: { value: 1 }, night: { value: 0 } } };

  for (const [name, mesh] of Object.entries(byName)) {
    if (/^(island|underside|pines|rocks|cabin|flagpole|hiker)$/.test(name) || /^stop_\d+$/.test(name)) {
      mesh.material = clay;
      mesh.castShadow = shadows && name !== 'island';
      mesh.receiveShadow = shadows && (name === 'island' || name === 'rocks');
    }
  }
  if (byName.island && shadows) byName.island.castShadow = true;

  for (let n = 1; n <= 10; n++) {
    const key = String(n).padStart(2, '0');
    const lantern = byName[`lantern_${key}`];
    if (lantern) {
      lantern.material = new MeshStandardMaterial({ color: '#c9a76a', emissive: '#ffc35a', emissiveIntensity: 0, roughness: 0.5 });
      handles.lanterns.push(lantern);
    }
    if (byName[`stop_${key}`]) handles.cairns.push(byName[`stop_${key}`]);
  }

  if (byName.cabin_windows) {
    byName.cabin_windows.material = new MeshStandardMaterial({ color: '#6b5a3e', emissive: '#ffcf7a', emissiveIntensity: 0, roughness: 0.6 });
    handles.windows = byName.cabin_windows;
  }

  if (byName.lake) {
    byName.lake.material = new MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.3, metalness: 0.05, emissive: '#0369a1', emissiveIntensity: 0.3, flatShading: true });
    byName.lake.receiveShadow = shadows;
  }

  const u = handles.uniforms;
  if (byName.waterfall) {
    byName.waterfall.material = new ShaderMaterial({
      uniforms: { uTime: u.time, uNight: u.night },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform float uNight; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float streak = 0.55 + 0.45 * sin(vUv.x * 23.0 + sin(vUv.y * 9.0)) * sin((vUv.y * 14.0 - uTime * 2.6));
          float fade = smoothstep(1.0, 0.82, vUv.y);
          vec3 col = mix(vec3(0.80, 0.93, 0.99), vec3(0.45, 0.62, 0.86), uNight);
          gl_FragColor = vec4(col * (0.85 + 0.25 * streak), edge * fade * (0.55 + 0.35 * streak));
        }`,
    });
    byName.waterfall.renderOrder = 2;
  }

  if (byName.trail) {
    byName.trail.material = new ShaderMaterial({
      uniforms: { uReveal: u.reveal, uTime: u.time, uNight: u.night },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uReveal; uniform float uTime; uniform float uNight; varying vec2 vUv;
        void main(){
          float shown = step(vUv.x, uReveal);
          float head = smoothstep(0.06, 0.0, abs(vUv.x - uReveal)) * step(uReveal, 0.999);
          float side = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          vec3 day = vec3(0.97, 0.99, 1.0);
          vec3 glow = vec3(1.0, 0.82, 0.45);
          vec3 col = mix(day, mix(vec3(0.62, 0.72, 0.9), glow, 0.35), uNight) + glow * head * 1.4;
          float a = side * (shown * 0.92 + head);
          gl_FragColor = vec4(col, a);
        }`,
    });
    byName.trail.renderOrder = 1;
  }

  if (byName.flag) {
    const flagMat = new MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.7, side: DoubleSide });
    flagMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.time;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float w = uv.x;
         transformed.z += sin(uv.x * 7.0 - uTime * 5.0) * 0.035 * w;
         transformed.y += sin(uv.x * 5.0 - uTime * 4.0) * 0.008 * w;`,
      );
    };
    byName.flag.material = flagMat;
    byName.flag.castShadow = shadows;
    handles.flag = byName.flag;
  }

  handles.hiker = byName.hiker || null;
  handles.byName = byName;
  return handles;
}

/* Numbered markers that always face the camera, like the trail map's. */
export function stopMarker(n) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new Sprite(new SpriteMaterial({ map: tex, toneMapped: false, depthTest: true, transparent: true }));
  sprite.renderOrder = 5;
  function draw(state) {
    g.clearRect(0, 0, size, size);
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
    g.fillStyle = state === 'lit' ? '#f2bc63' : state === 'here' ? '#0369a1' : '#ffffff';
    g.fill();
    g.lineWidth = size * 0.07;
    g.strokeStyle = state === 'lit' ? '#ffffff' : state === 'here' ? '#ffffff' : '#0369a1';
    g.stroke();
    g.fillStyle = state === 'lit' ? '#4a2f05' : state === 'here' ? '#ffffff' : '#0c4566';
    g.font = `800 ${n === 10 ? size * 0.36 : size * 0.44}px "Plus Jakarta Sans", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), size / 2, size * 0.535);
    tex.needsUpdate = true;
  }
  draw('idle');
  sprite.userData.draw = draw;
  return sprite;
}

export function hitSphere(radius) {
  const m = new Mesh(new SphereGeometry(radius, 8, 6), new MeshBasicMaterial({ visible: false }));
  return m;
}
