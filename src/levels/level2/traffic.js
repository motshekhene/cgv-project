import * as THREE from 'three';
import { attachModel } from './attachModel.js';
import { applyPaint, detectPaint, TRAFFIC_PAINTS } from './paint.js';

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

// weight = how often it appears; speed = m/s range; mass = how hard it hits
// (damage multiplier) and how hard it is to shove; paint = random colours
// cars: Quaternius Cars Bundle (CC0). Vans/trucks: still Kenney Car Kit
// (CC0) until replacements arrive — see CREDITS.md
const TYPES = [
  { name: 'taxi',     path: 'level2/traffic/taxi.glb',     length: 4.6, weight: 1,   speed: [14, 22], mass: 1.0, paint: false },
  { name: 'sedan',    path: 'level2/cars/sedan.glb',       length: 4.5, weight: 1.5, speed: [15, 23], mass: 1.0, paint: true },
  { name: 'hatch',    path: 'level2/cars/hatch.glb',       length: 3.9, weight: 1,   speed: [14, 22], mass: 0.9, paint: true },
  { name: 'suv',      path: 'level2/cars/suv.glb',         length: 4.8, weight: 1.5, speed: [13, 21], mass: 1.3, paint: true },
  { name: 'van',      path: 'level2/traffic/van.glb',      length: 4.6, weight: 2,   speed: [11, 18], mass: 1.5, paint: true },
  { name: 'delivery', path: 'level2/traffic/delivery.glb', length: 5.6, weight: 2,   speed: [10, 16], mass: 1.8, paint: true },
  { name: 'truck',    path: 'level2/traffic/truck.glb',    length: 5.4, weight: 2,   speed: [9, 15],  mass: 1.9, paint: true },
  // the same truck scaled up into a freight rig: slow, huge, hurts
  { name: 'freight',  path: 'level2/traffic/truck.glb',    length: 8.2, weight: 1.5, speed: [8, 12],  mass: 2.8, paint: true },
];

/** A fixed, shuffled list of types for the pool, following the weights. */
function typeList(count) {
  const total = TYPES.reduce((a, t) => a + t.weight, 0);
  const list = [];
  for (const t of TYPES) for (let i = 0; i < Math.round((t.weight / total) * count); i++) list.push(t);
  while (list.length < count) list.push(TYPES[list.length % TYPES.length]);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, count);
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Traffic {
  constructor(parent, assets, {
    count = 16, spawnMin = 130, spawnMax = 300, despawnBehind = 35, despawnAhead = 380,
    minSpeed = 9, maxSpeed = 22,
  } = {}) {
    this.parent = parent;
    this.assets = assets;
    this.cfg = { count, spawnMin, spawnMax, despawnBehind, despawnAhead, minSpeed, maxSpeed };
    this.pool = [];
  }

  async init(playerZ = 0) {
    await Promise.allSettled(TYPES.map((t) => this.assets.model(t.path)));
    const types = typeList(this.cfg.count);
    const paintInfo = new Map();               // detected bodywork colour, per model file
    for (let i = 0; i < this.cfg.count; i++) {
      const type = types[i];
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
        type, mass: type.mass, model,
      };
      if (model && type.paint) {
        if (!paintInfo.has(type.path)) paintInfo.set(type.path, detectPaint(model));
        v.paintInfo = paintInfo.get(type.path);
      }
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
    const [lo, hi] = v.type ? v.type.speed : [minSpeed, maxSpeed];
    v.baseSpeed = v.speed = rand(lo, hi);
    // a fresh colour every time it respawns, so the road never looks cloned
    if (v.paintInfo) applyPaint(v.model, TRAFFIC_PAINTS[Math.floor(Math.random() * TRAFFIC_PAINTS.length)], v.paintInfo);
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

      // the damage has a cooldown, the bodies don't: still solid while it runs
      const hit = this._collide(v, car, car.mesh.position.x, car.mesh.position.z, v.hitT > 0);
      if (hit) hits.push(hit);
    }
    return hits;
  }

  /**
   * Keeps another vehicle (the Handler) out of the traffic. Unlike the
   * player's collisions this has no cooldown and deals no damage: it just
   * separates the bodies every frame and shoves the traffic aside, so he
   * can barge through a gap but never drive inside a truck.
   *   body: { mesh, heading, halfW, halfL, speed, latVel }
   */
  collideBody(body) {
    const h = body.heading, cos = Math.cos(h), sin = Math.sin(h);
    const bx = body.mesh.position;
    for (const v of this.pool) {
      const dx = v.x - bx.x, dz = v.z - bx.z;
      if (Math.abs(dz) > 12 || Math.abs(dx) > 6) continue;
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const cy = Math.abs(Math.cos(v.yaw)), sy = Math.abs(Math.sin(v.yaw));
      const tx = v.halfW * cy + v.halfL * sy, tz = v.halfL * cy + v.halfW * sy;
      const ax = Math.abs(cos), az = Math.abs(sin);
      const ex = tx * ax + tz * az, ez = tz * ax + tx * az;
      const ox = body.halfW + ex - Math.abs(lx);
      const oz = body.halfL + ez - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;

      if (ox < oz) {
        // side by side: split the push, the traffic gets knocked sideways
        const side = Math.sign(lx) || 1;
        bx.x -= side * cos * ox * 0.6;
        bx.z += side * sin * ox * 0.6;
        v.x += side * ox * 0.4;
        v.vx = side * Math.max(Math.abs(v.vx), 2.5 / (v.mass || 1));
        v.spin = side * 0.4;
        body.latVel = (body.latVel || 0) * 0.3;
      } else {
        // nose to tail: he's pushed back out and has to slow to its speed
        const ahead = lz >= 0;
        bx.x -= (ahead ? 1 : -1) * sin * oz;
        bx.z -= (ahead ? 1 : -1) * cos * oz;
        if (ahead) body.speed = Math.min(body.speed, v.speed);
        else v.speed = Math.max(v.speed, body.speed);
      }
      this._place(v);
    }
  }

  _collide(v, car, px, pz, pushOnly = false) {
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

    if (pushOnly) {
      // just separate the bodies (no damage, no new shove) during the cooldown
      if (longitudinal) {
        const push = oz * (lz >= 0 ? -1 : 1);
        car.mesh.position.x += sin * push;
        car.mesh.position.z += cos * push;
        if (lz >= 0) car.speed = Math.min(car.speed, v.speed);
      } else {
        const push = ox * (lx >= 0 ? -1 : 1);
        car.mesh.position.x += cos * push;
        car.mesh.position.z -= sin * push;
      }
      return null;
    }
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
    const mass = v.mass || 1;
    return { damage: Math.min(30, Math.round(damage * mass)), impact: Math.min(1, impact * (0.7 + 0.3 * mass)) };
  }
}
