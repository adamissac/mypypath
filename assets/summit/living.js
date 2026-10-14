/* Small things that keep the island alive: drifting clouds, a few birds, and
   fireworks from the summit flag. Each is cheap on its own and allocates
   nothing per frame. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, IcosahedronGeometry, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, Points, ShaderMaterial,
} from 'three';
import { softDot } from './scene.js';

/* A low-poly cloud: a few flat-shaded icosahedra, one material so the whole
   cloud fades together. Matches the faceted island. */
function makeCloud(scale, opacity) {
  const mat = new MeshStandardMaterial({ color: '#ffffff', emissive: '#dceefa', emissiveIntensity: 0.35, roughness: 1, flatShading: true, transparent: true, opacity });
  const cloud = new Group();
  for (const [x, y, z, r] of [[0, 0, 0, 0.32], [0.3, -0.04, 0.05, 0.24], [-0.3, -0.06, -0.03, 0.22], [0.08, 0.1, -0.1, 0.2]]) {
    const m = new Mesh(new IcosahedronGeometry(r, 0), mat);
    m.position.set(x, y, z);
    m.rotation.set(x * 3, y * 5, z * 7);
    cloud.add(m);
  }
  cloud.scale.set(scale, scale * 0.6, scale * 0.8);
  cloud.userData.mat = mat;
  cloud.userData.base = opacity;
  return cloud;
}

export function createClouds(scene) {
  const drift = new Group();
  const bank = new Group();
  scene.add(drift);
  scene.add(bank);
  // Drifting clouds orbit the island slowly at different heights.
  const drifting = [[0.4, 2.45, 2.3, 1.1], [2.4, 2.6, 1.55, 0.95], [3.9, 2.4, 2.8, 0.8], [5.3, 2.7, 0.95, 1.0]].map(([a, r, y, sc]) => {
    const cloud = makeCloud(sc, 0.95);
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
    const cloud = makeCloud(1.7 + (i % 3) * 0.35, 1);
    cloud.userData.a = a;
    cloud.userData.r = 1.2 + (i % 2) * 0.9;
    cloud.position.set(Math.cos(a) * cloud.userData.r, -0.9 + (i % 3) * 0.25, Math.sin(a) * cloud.userData.r + 1.1);
    bank.add(cloud);
    banked.push(cloud);
  }
  const day = new Color('#ffffff');
  const night = new Color('#a9b6d8');
  const tint = new Color();

  return {
    update(t, part, nightness) {
      tint.copy(day).lerp(night, nightness);
      for (const c of drifting) {
        const a = c.userData.a + t * 0.012;
        c.position.set(Math.cos(a) * c.userData.r, c.userData.y + Math.sin(t * 0.4 + a) * 0.06, Math.sin(a) * c.userData.r);
        c.rotation.y = a;
        c.userData.mat.color.copy(tint);
        c.userData.mat.emissiveIntensity = 0.35 * (1 - nightness);
        c.userData.mat.opacity = c.userData.base * (1 - 0.45 * nightness);
      }
      bank.visible = part < 1;
      if (!bank.visible) return;
      for (const c of banked) {
        const push = 1 + part * 2.2;
        c.position.x = Math.cos(c.userData.a) * c.userData.r * push;
        c.position.z = Math.sin(c.userData.a) * c.userData.r * push + 1.1;
        c.position.y = -0.9 + part * 0.6;
        c.userData.mat.opacity = (1 - part) * c.userData.base;
        c.userData.mat.color.copy(tint);
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
