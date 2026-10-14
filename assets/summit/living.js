/* Small things that keep the island alive: drifting clouds, a few birds, and
   fireworks from the summit flag. Each is cheap on its own and allocates
   nothing per frame. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, Mesh,
  MeshBasicMaterial, Points, ShaderMaterial, Sprite, SpriteMaterial, SRGBColorSpace,
} from 'three';
import { softDot } from './scene.js';

function puffTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const blobs = [[0.5, 0.58, 0.3], [0.32, 0.62, 0.22], [0.68, 0.62, 0.22], [0.42, 0.45, 0.2], [0.6, 0.47, 0.18]];
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createClouds(scene) {
  const tex = puffTexture();
  const drift = new Group();
  const bank = new Group();
  scene.add(drift);
  scene.add(bank);
  const make = (scale, opacity) => {
    const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity, toneMapped: false }));
    s.scale.set(scale, scale * 0.55, 1);
    s.userData.base = opacity;
    return s;
  };
  // Drifting clouds orbit the island slowly at different heights.
  const drifting = [[0.4, 2.45, 2.3, 1.35], [2.4, 2.6, 1.55, 1.15], [3.9, 2.4, 2.8, 1.0], [5.3, 2.7, 0.95, 1.2]].map(([a, r, y, s]) => {
    const cloud = make(s, 0.85);
    cloud.userData.a = a;
    cloud.userData.r = r;
    cloud.userData.y = y;
    drift.add(cloud);
    return cloud;
  });
  // The entrance bank: a ring of clouds the island rises through.
  const banked = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const cloud = make(2.1 + (i % 3) * 0.4, 1);
    cloud.userData.a = a;
    cloud.userData.r = 1.2 + (i % 2) * 0.9;
    cloud.position.set(Math.cos(a) * cloud.userData.r, -0.9 + (i % 3) * 0.25, Math.sin(a) * cloud.userData.r + 1.1);
    bank.add(cloud);
    banked.push(cloud);
  }

  return {
    update(t, part, night) {
      const tint = 1 - night * 0.55;
      for (const c of drifting) {
        const a = c.userData.a + t * 0.012;
        c.position.set(Math.cos(a) * c.userData.r, c.userData.y + Math.sin(t * 0.4 + a) * 0.06, Math.sin(a) * c.userData.r);
        c.material.color.setRGB(tint, tint, tint + night * 0.15);
      }
      bank.visible = part < 1;
      if (!bank.visible) return;
      for (const c of banked) {
        const push = 1 + part * 2.2;
        c.position.x = Math.cos(c.userData.a) * c.userData.r * push;
        c.position.z = Math.sin(c.userData.a) * c.userData.r * push + 1.1;
        c.position.y = -0.9 + part * 0.6;
        c.material.opacity = (1 - part) * c.userData.base;
        c.material.color.setRGB(tint, tint, tint + night * 0.15);
      }
    },
  };
}

export function createBirds(scene, summit) {
  const wing = new BufferGeometry();
  // Two triangles meeting at the body; the wing tips are animated.
  const base = new Float32Array([0, 0, 0.02, -0.09, 0, -0.02, 0, 0, -0.02, 0, 0, 0.02, 0.09, 0, -0.02, 0, 0, -0.02]);
  wing.setAttribute('position', new BufferAttribute(base.slice(), 3));
  const mat = new MeshBasicMaterial({ color: '#1c344c', side: DoubleSide });
  const group = new Group();
  scene.add(group);
  const birds = [0, 2.1, 4.2].map((phase, i) => {
    const g = wing.clone();
    const m = new Mesh(g, mat);
    m.userData = { phase, r: 1.25 + i * 0.28, y: summit[1] + 0.35 + i * 0.18, speed: 0.32 - i * 0.04 };
    group.add(m);
    return m;
  });
  return {
    update(t, night) {
      mat.color.set(night > 0.5 ? '#c9d6f2' : '#1c344c');
      for (const b of birds) {
        const u = b.userData;
        const a = t * u.speed + u.phase;
        b.position.set(summit[0] + Math.cos(a) * u.r, u.y + Math.sin(t * 0.7 + u.phase) * 0.08, summit[2] + Math.sin(a) * u.r);
        b.rotation.y = -a;
        const flap = Math.sin(t * 9 + u.phase * 3) * 0.05;
        const p = b.geometry.attributes.position;
        p.setY(1, flap);
        p.setY(4, flap);
        p.needsUpdate = true;
      }
    },
  };
}

const COLORS = ['#0ea5e9', '#f2bc63', '#a78bfa', '#ffffff', '#38bdf8'].map((c) => new Color(c));
const PER_BURST = 90;
const POOL = 3;

export function createFireworks(scene) {
  const count = PER_BURST * POOL;
  const geo = new BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const life = new Float32Array(count);
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('life', new BufferAttribute(life, 1));
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    uniforms: { uMap: { value: softDot(32) } },
    vertexShader: `attribute float life; varying float vLife; varying vec3 vColor;
      void main(){ vLife = life; vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = (6.0 + 10.0 * life) * (10.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vLife; varying vec3 vColor;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor, t.a * vLife); }`,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  let next = 0;
  let lastBurst = -10;
  let alive = 0;

  return {
    points,
    burst(at, t) {
      if (t - lastBurst < 2) return false;
      lastBurst = t;
      const start = next * PER_BURST;
      next = (next + 1) % POOL;
      for (let i = 0; i < PER_BURST; i++) {
        const k = start + i;
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const speed = 0.9 + Math.random() * 0.6;
        pos.set(at, k * 3);
        vel[k * 3] = s * Math.cos(a) * speed;
        vel[k * 3 + 1] = u * speed + 0.6;
        vel[k * 3 + 2] = s * Math.sin(a) * speed;
        const c = COLORS[(i + next) % COLORS.length];
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        life[k] = 1;
      }
      geo.attributes.color.needsUpdate = true;
      points.visible = true;
      alive = 1;
      return true;
    },
    update(dt) {
      if (!points.visible) return;
      let any = false;
      for (let k = 0; k < count; k++) {
        if (life[k] <= 0) continue;
        any = true;
        life[k] = Math.max(0, life[k] - dt * 0.75);
        vel[k * 3 + 1] -= 1.1 * dt;
        pos[k * 3] += vel[k * 3] * dt;
        pos[k * 3 + 1] += vel[k * 3 + 1] * dt;
        pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.life.needsUpdate = true;
      alive = any ? 1 : 0;
      points.visible = any;
    },
    get active() { return alive > 0; },
  };
}
