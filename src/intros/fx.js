import * as THREE from 'three';
import { rng } from '../levels/jungle/props.js';

/**
 * Particle effects for the cutscenes. Every one is a function of time (age =
 * scene time minus when it starts), not a simulation stepped per frame, so a
 * scene that starts at ?t=7 or gets skipped looks the same as one played
 * through.
 */
let DOT = null;

/** Soft round sprite shared by glows and particles. */
export function dotTexture() {
  if (DOT) return DOT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  DOT = new THREE.CanvasTexture(c);
  DOT.colorSpace = THREE.SRGBColorSpace;
  return DOT;
}

function points(count, { size, color, opacity = 1, additive = false, fog = true }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({
      map: dotTexture(), size, color, transparent: true, opacity, depthWrite: false, fog,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
}

/**
 * A ring of dust kicked up at `at` when the scene clock reaches `start`
 * (the Handler hitting the bars, a gate slamming, the jeep's wheels).
 *   const b = new Burst(root, { at, start: 4.2 }); ... b.update(s);
 */
export class Burst {
  constructor(parent, { at, start, count = 46, color = 0xcbb894, speed = 4.2, size = 0.5, lift = 1.6, life = 1.1, spread = 0, dir = null, gravity = 1.2, additive = false, seed = 3 }) {
    this.at = at.clone();
    this.start = start;
    this.life = life;
    this.size = size;
    this.gravity = gravity;
    this.pts = points(count, { size, color, opacity: 0.8, additive });
    this.pts.visible = false;
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    const r = rng(seed);
    this.p0 = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.3;
      const v = speed * (0.6 + r() * 0.6);
      this.p0.set([(r() - 0.5) * spread, r() * 0.3, (r() - 0.5) * spread * 0.3], i * 3);
      const d = dir ? [dir.x * v + Math.cos(a) * v * 0.35, dir.y * v, dir.z * v + Math.sin(a) * v * 0.35] : [Math.cos(a) * v, 0, Math.sin(a) * v];
      this.v.set([d[0], d[1] + 0.6 + r() * lift, d[2]], i * 3);
    }
  }

  update(s) {
    const age = s - this.start;
    const on = age >= 0 && age < this.life;
    this.pts.visible = on;
    if (!on) return;
    const p = this.pts.geometry.attributes.position;
    const drag = (1 - Math.exp(-3.2 * age)) / 3.2; // integral of exp(-3.2 t): horizontal drag
    for (let i = 0; i < p.count; i++) {
      const o = i * 3;
      const y = this.at.y + this.p0[o + 1] + this.v[o + 1] * age - 0.5 * this.gravity * age * age;
      p.setXYZ(i, this.at.x + this.p0[o] + this.v[o] * drag, Math.max(this.at.y + 0.05, y), this.at.z + this.p0[o + 2] + this.v[o + 2] * drag);
    }
    p.needsUpdate = true;
    const k = age / this.life;
    this.pts.material.opacity = 0.8 * (1 - k);
    this.pts.material.size = this.size * (1 + k * 1.8);
  }
}

/** Pollen drifting in the light shafts, in a box that travels with `center` (wraps, so it never runs out). */
export class Pollen {
  constructor(parent, { count = 260, size = 0.07, box = [30, 7, 40], color = 0xffe2a0, seed = 9 } = {}) {
    this.box = box;
    this.pts = points(count, { size, color, opacity: 0.9, additive: true });
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    const r = rng(seed);
    this.base = Float32Array.from({ length: count * 3 }, () => r());
  }

  update(time, center) {
    const p = this.pts.geometry.attributes.position;
    const [bx, by, bz] = this.box;
    const wrap = (v, size) => ((v % size) + size) % size - size / 2;
    for (let i = 0; i < p.count; i++) {
      const o = i * 3;
      const x = this.base[o] * bx + Math.sin(time * 0.21 + i * 1.7) * 0.9 - center.x;
      const z = this.base[o + 2] * bz + Math.cos(time * 0.17 + i * 2.3) * 0.9 - center.z;
      p.setXYZ(i, center.x + wrap(x, bx), 0.4 + this.base[o + 1] * by + Math.sin(time * 0.37 + i * 0.9) * 0.45, center.z + wrap(z, bz));
    }
    p.needsUpdate = true;
  }
}

/** Rain streaks in a box that follows the camera. Wind leans them a little. */
export class Rain {
  constructor(parent, { count = 2200, box = [44, 26, 44], speed = 24, length = 0.7, wind = [1.8, 0, -1.2], color = 0x9fb2cc, opacity = 0.32, seed = 5 } = {}) {
    this.box = box;
    this.speed = speed;
    this.length = length;
    this.wind = wind;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    parent.add(this.lines);
    const r = rng(seed);
    this.base = Float32Array.from({ length: count * 4 }, () => r());
  }

  update(time, center) {
    const p = this.lines.geometry.attributes.position;
    const [bx, by, bz] = this.box;
    const [wx, , wz] = this.wind;
    const n = p.count / 2;
    const len = this.length / this.speed;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const fall = (this.base[o + 1] * by + time * this.speed * (0.85 + this.base[o + 3] * 0.3)) % by;
      const y = center.y + by / 2 - fall;
      const x = center.x + (this.base[o] - 0.5) * bx + (by - fall) * wx / this.speed;
      const z = center.z + (this.base[o + 2] - 0.5) * bz + (by - fall) * wz / this.speed;
      p.setXYZ(i * 2, x, y, z);
      p.setXYZ(i * 2 + 1, x - wx * len, y + this.length, z - wz * len);
    }
    p.needsUpdate = true;
  }
}

/**
 * Solid chunks flung from one point (the bridge rail, the gate's stonework):
 * ballistic, tumbling, gone once they're below `floor`.
 */
export class Debris {
  constructor(parent, { at, start, count = 14, material, size = [0.25, 0.6], dir = new THREE.Vector3(1, 0.4, 0), speed = 7, spread = 0.6, gravity = 9.8, floor = -Infinity, seed = 13 }) {
    this.at = at.clone();
    this.start = start;
    this.gravity = gravity;
    this.floor = floor;
    this.chunks = [];
    const r = rng(seed);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, material);
      const sz = size[0] + r() * (size[1] - size[0]);
      m.scale.set(sz, sz * (0.5 + r() * 0.6), sz * (0.6 + r() * 0.5));
      m.castShadow = true;
      m.visible = false;
      parent.add(m);
      const v = dir.clone().normalize().multiplyScalar(speed * (0.6 + r() * 0.7));
      v.x += (r() - 0.5) * spread * speed;
      v.y += (r() - 0.3) * spread * speed;
      v.z += (r() - 0.5) * spread * speed;
      this.chunks.push({ m, v, p0: new THREE.Vector3((r() - 0.5) * 1.2, r() * 0.8, (r() - 0.5) * 1.6), spin: new THREE.Vector3(r() * 9, r() * 9, r() * 9) });
    }
  }

  update(s) {
    const age = s - this.start;
    for (const c of this.chunks) {
      const y = this.at.y + c.p0.y + c.v.y * age - 0.5 * this.gravity * age * age;
      c.m.visible = age >= 0 && y > this.floor;
      if (!c.m.visible) continue;
      c.m.position.set(this.at.x + c.p0.x + c.v.x * age, y, this.at.z + c.p0.z + c.v.z * age);
      c.m.rotation.set(c.spin.x * age, c.spin.y * age, c.spin.z * age);
    }
  }
}
