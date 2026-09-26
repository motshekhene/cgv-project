import * as THREE from 'three';
import { attachModel } from './attachModel.js';

/**
 * Traffic — Member 2A
 *
 * A fixed pool of slower vehicles driving the same way as the player, spawned
 * ahead and recycled once passed. Nothing is created or destroyed while
 * playing: the pool is built once in init(), every vehicle is a clone that
 * shares geometry and materials with the cached .glb, and Level.teardown()
 * frees the lot in one call. That is the chunk-streaming / disposal story.
 *
 *   const traffic = new Traffic(this.root, assets);
 *   await traffic.init(car.mesh.position.z);
 *   const hits = traffic.update(dt, car);   // [{ damage, impact }]
 */
export const LANES = [-9, -3, 3, 9];     // road is 24 wide, rails at ±12

const TYPES = [
  { path: 'level2/traffic/taxi.glb',     length: 3.8 },
  { path: 'level2/traffic/van.glb',      length: 4.4 },
  { path: 'level2/traffic/suv.glb',      length: 4.2 },
  { path: 'level2/traffic/truck.glb',    length: 5.2 },
  { path: 'level2/traffic/delivery.glb', length: 5.4 },
];

const rand = (a, b) => a + Math.random() * (b - a);

export class Traffic {
  constructor(parent, assets, {
    count = 12, spawnMin = 130, spawnMax = 300, despawnBehind = 35, despawnAhead = 380,
    minSpeed = 9, maxSpeed = 22,
  } = {}) {
    this.parent = parent;
    this.assets = assets;
    this.cfg = { count, spawnMin, spawnMax, despawnBehind, despawnAhead, minSpeed, maxSpeed };
    this.pool = [];
  }

  async init(playerZ = 0) {
    await Promise.allSettled(TYPES.map((t) => this.assets.model(t.path)));
    for (let i = 0; i < this.cfg.count; i++) {
      const type = TYPES[i % TYPES.length];
      const holder = new THREE.Group();
      const model = await attachModel(this.assets, holder, type.path, { length: type.length });
      let bounds = model && model.userData.bounds;
      if (!bounds) {
        // model failed to load: a plain box keeps the traffic (and its collisions) working
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 1.4, type.length),
          new THREE.MeshStandardMaterial({ color: 0x556070 })
        );
        box.position.y = 0.7;
        holder.add(box);
        bounds = { min: new THREE.Vector3(-0.95, 0, -type.length / 2), max: new THREE.Vector3(0.95, 1.4, type.length / 2) };
      }
      const v = {
        holder,
        halfW: (bounds.max.x - bounds.min.x) / 2,
        halfL: (bounds.max.z - bounds.min.z) / 2,
        x: 0, z: 0, yaw: 0, vx: 0, spin: 0,
        baseSpeed: 0, speed: 0, hitT: 0,
      };
      this.parent.add(holder);
      this.pool.push(v);
      this._spawn(v, playerZ);
    }
  }

  /* ---------------- spawning ---------------- */

  _isFree(v, lane, z) {
    let near = 0;
    for (const w of this.pool) {
      if (w === v) continue;
      const dz = Math.abs(w.z - z);
      if (dz < 14) near++;
      if (Math.abs(w.x - LANES[lane]) < 2 && dz < 30) return false;   // same lane, too close
    }
    return near < 2;                                                  // always leave 2 lanes open
  }

  _spawn(v, playerZ) {
    const { spawnMin, spawnMax, minSpeed, maxSpeed } = this.cfg;
    let lane = 0, z = 0, ok = false;
    for (let i = 0; i < 10 && !ok; i++) {
      lane = Math.floor(Math.random() * LANES.length);
      z = playerZ + rand(spawnMin, spawnMax + i * 20);
      ok = this._isFree(v, lane, z);
    }
    v.x = LANES[lane]; v.z = z; v.yaw = 0; v.vx = 0; v.spin = 0; v.hitT = 0;
    v.baseSpeed = v.speed = rand(minSpeed, maxSpeed);
    this._place(v);
  }

  _place(v) {
    v.holder.position.set(v.x, 0, v.z);
    v.holder.rotation.y = v.yaw;
  }

  /* ---------------- per frame ---------------- */

  update(dt, car) {
    const hits = [];
    const px = car.mesh.position.x, pz = car.mesh.position.z;
    const { despawnBehind, despawnAhead } = this.cfg;

    for (const v of this.pool) {
      // follow the vehicle in front instead of driving through it
      let leader = null, gap = Infinity;
      for (const w of this.pool) {
        if (w === v || Math.abs(w.x - v.x) > 2) continue;
        const g = w.z - v.z - w.halfL - v.halfL;
        if (g > -1 && g < gap) { gap = g; leader = w; }
      }
      const blocked = leader && gap < 10;
      v.speed = blocked ? Math.min(v.speed, leader.speed)
                        : THREE.MathUtils.lerp(v.speed, v.baseSpeed, Math.min(1, dt));

      v.z += v.speed * dt;
      if (v.vx || v.spin) {                         // shoved by a crash
        v.x = THREE.MathUtils.clamp(v.x + v.vx * dt, -11, 11);
        v.yaw += v.spin * dt;
        const damp = Math.exp(-2.2 * dt);
        v.vx *= damp; v.spin *= damp;
        if (Math.abs(v.vx) < 0.05) v.vx = 0;
        if (Math.abs(v.spin) < 0.02) v.spin = 0;
      }
      v.hitT = Math.max(0, v.hitT - dt);

      if (v.z < pz - despawnBehind || v.z > pz + despawnAhead) this._spawn(v, pz);
      else this._place(v);

      if (v.hitT === 0) {
        const hit = this._collide(v, car, px, pz);
        if (hit) hits.push(hit);
      }
    }
    return hits;
  }

  _collide(v, car, px, pz) {
    const h = car.heading, cos = Math.cos(h), sin = Math.sin(h);
    const dx = v.x - px, dz = v.z - pz;
    const lx = dx * cos - dz * sin;                 // traffic centre in the player's frame
    const lz = dx * sin + dz * cos;

    const b = car.bounds || { halfW: 0.9, halfL: 1.8 };
    const cy = Math.abs(Math.cos(v.yaw)), sy = Math.abs(Math.sin(v.yaw));
    const tx = v.halfW * cy + v.halfL * sy, tz = v.halfL * cy + v.halfW * sy;
    const ax = Math.abs(cos), az = Math.abs(sin);
    const ex = tx * ax + tz * az, ez = tz * ax + tx * az;   // traffic extents seen from the player

    const ox = b.halfW + ex - Math.abs(lx);
    const oz = b.halfL + ez - Math.abs(lz);
    if (ox <= 0 || oz <= 0) return null;

    const longitudinal = oz < ox;
    const rel = Math.max(0, car.speed - v.speed);
    let damage, impact;

    if (longitudinal) {
      // push the player back out along its own forward axis
      const push = oz * (lz >= 0 ? -1 : 1);
      car.mesh.position.x += sin * push;
      car.mesh.position.z += cos * push;
      if (lz >= 0) car.speed = Math.min(car.speed, v.speed) * 0.7;   // rear-ended it
      damage = 6 + rel * 0.55;
      impact = Math.min(1, rel / 25);
    } else {
      const push = ox * (lx >= 0 ? -1 : 1);
      car.mesh.position.x += cos * push;
      car.mesh.position.z -= sin * push;
      car.speed *= 0.85;                                             // side swipe
      damage = 5 + Math.abs(car.speed) * 0.2;
      impact = 0.4;
    }

    const side = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
    v.vx = side * (3 + rel * 0.15);
    v.spin = side * (1 + rel * 0.06);
    v.hitT = 1.2;
    return { damage: Math.min(25, Math.round(damage)), impact };
  }
}
