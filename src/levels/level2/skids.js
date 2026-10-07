import * as THREE from 'three';

/**
 * Skid marks + tyre smoke — Member 2A
 *
 *  Skids  fading dark trails behind the rear wheels, drawn into ONE
 *         preallocated mesh (a ring buffer of quads), so it never allocates
 *         or grows while playing.
 *  Smoke  a pool of soft sprites that rise, grow and fade.
 *
 * Call setDims(bounds) after a car model is swapped, then every frame:
 *   skids.update(dt, car, skidding);   smoke.update(dt);
 */
export class Skids {
  constructor(parent, { maxQuads = 900, life = 8, width = 0.26 } = {}) {
    this.max = maxQuads;
    this.life = life;
    this.half = width / 2;
    this.t = 0;
    this.cursor = 0;
    this.wheelX = 0.8;
    this.wheelZ = -1.2;
    this.prev = [null, null];        // last skid point per wheel while a skid is in progress

    const pos = new Float32Array(maxQuads * 4 * 3);
    const col = new Float32Array(maxQuads * 4 * 4);
    for (let i = 0; i < maxQuads * 4; i++) col.set([0.02, 0.02, 0.025, 0], i * 4);
    const idx = new Uint32Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const o = q * 4;
      idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], q * 6);
    }
    this.birth = new Float32Array(maxQuads).fill(-1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));    // rgba: alpha drives the fade
    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;   // the bounds change every frame
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  setDims({ min, max }) {
    this.wheelX = ((max.x - min.x) / 2) * 0.82;
    this.wheelZ = min.z + (max.z - min.z) * 0.2;
  }

  _wheelWorld(car, side) {
    const h = car.heading, cos = Math.cos(h), sin = Math.sin(h);
    const lx = side * this.wheelX, lz = this.wheelZ;
    return new THREE.Vector3(
      car.mesh.position.x + lx * cos + lz * sin, 0.03, car.mesh.position.z - lx * sin + lz * cos
    );
  }

  /** World positions of both rear wheels — the smoke uses these too. */
  wheels(car) { return [this._wheelWorld(car, -1), this._wheelWorld(car, 1)]; }

  update(dt, car, skidding) {
    this.t += dt;
    const pos = this.mesh.geometry.attributes.position;
    const col = this.mesh.geometry.attributes.color;

    if (skidding) {
      this.wheels(car).forEach((p, w) => {
        const prev = this.prev[w];
        if (!prev) { this.prev[w] = p; return; }
        const dx = p.x - prev.x, dz = p.z - prev.z, len = Math.hypot(dx, dz);
        if (len < 0.3) return;
        const sx = (-dz / len) * this.half, sz = (dx / len) * this.half;   // sideways from travel direction
        const o = this.cursor * 4;
        pos.setXYZ(o,     prev.x - sx, 0.03, prev.z - sz);
        pos.setXYZ(o + 1, prev.x + sx, 0.03, prev.z + sz);
        pos.setXYZ(o + 2, p.x - sx,    0.03, p.z - sz);
        pos.setXYZ(o + 3, p.x + sx,    0.03, p.z + sz);
        this.birth[this.cursor] = this.t;
        this.cursor = (this.cursor + 1) % this.max;
        this.prev[w] = p;
      });
      pos.needsUpdate = true;
    } else {
      this.prev[0] = this.prev[1] = null;   // next skid starts a fresh line
    }

    // fade by age
    for (let q = 0; q < this.max; q++) {
      const b = this.birth[q];
      if (b < 0) continue;
      const a = 0.75 * (1 - (this.t - b) / this.life);
      const o = q * 4;
      if (a <= 0) {
        this.birth[q] = -1;
        for (let k = 0; k < 4; k++) col.setW(o + k, 0);
      } else {
        for (let k = 0; k < 4; k++) col.setW(o + k, a);
      }
    }
    col.needsUpdate = true;
  }
}

export class Smoke {
  constructor(parent, { count = 48 } = {}) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;

    this.items = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map, color: 0xb9c3cc, transparent: true, depthWrite: false, opacity: 0,
      }));
      s.visible = false;
      parent.add(s);
      this.items.push({ sprite: s, age: 0, life: 1, vy: 0, vx: 0, vz: 0, size: 1, active: false });
    }
    this.cursor = 0;
    this.timer = 0;
  }

  emit(p) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.active = true; it.age = 0; it.life = 0.7 + Math.random() * 0.5;
    it.vy = 0.8 + Math.random() * 0.8;
    it.vx = (Math.random() - 0.5) * 1.2; it.vz = (Math.random() - 0.5) * 1.2;
    it.size = 0.8 + Math.random() * 0.5;
    it.sprite.position.set(p.x, 0.25, p.z);
    it.sprite.visible = true;
  }

  /** wheels: the two rear-wheel positions; emit while skidding. */
  update(dt, wheels, skidding) {
    if (skidding) {
      this.timer += dt;
      while (this.timer > 0.04) {
        this.timer -= 0.04;
        wheels.forEach((w) => this.emit(w));
      }
    }
    for (const it of this.items) {
      if (!it.active) continue;
      it.age += dt;
      const k = it.age / it.life;
      if (k >= 1) { it.active = false; it.sprite.visible = false; continue; }
      it.sprite.position.x += it.vx * dt;
      it.sprite.position.y += it.vy * dt;
      it.sprite.position.z += it.vz * dt;
      const s = it.size * (1 + k * 2.2);
      it.sprite.scale.set(s, s, 1);
      it.sprite.material.opacity = 0.5 * (1 - k);
    }
  }
}

/**
 * Tyre tracks — the tread prints every wheel leaves in the mud, all the time,
 * not just while skidding (that's Skids, darker, on top). One preallocated
 * ring buffer of quads shared by every vehicle that drives on the trail, a
 * small canvas tread texture repeated along each track, and an age fade, so
 * nothing is allocated while playing.
 *
 *   const tracks = new TyreTracks(root);
 *   tracks.follow('player', car.mesh, car.heading, bounds);   // every frame, per vehicle
 *   tracks.update(dt);
 */
export class TyreTracks {
  constructor(parent, { maxQuads = 6000, life = 12, width = 0.36, step = 0.8, opacity = 0.6 } = {}) {
    this.max = maxQuads;
    this.life = life;
    this.half = width / 2;
    this.step = step;           // a new quad every `step` metres per wheel
    this.opacity = opacity;
    this.t = 0;
    this.cursor = 0;
    this.vehicles = new Map();  // key -> { prev: [Vector3|null x4], v: [tread v x4] }

    const pos = new Float32Array(maxQuads * 4 * 3);
    const uv = new Float32Array(maxQuads * 4 * 2);
    const col = new Float32Array(maxQuads * 4 * 4);
    for (let i = 0; i < maxQuads * 4; i++) col.set([1, 1, 1, 0], i * 4);
    const idx = new Uint32Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const o = q * 4;
      idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], q * 6);
    }
    this.birth = new Float32Array(maxQuads).fill(-1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));

    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x2a1c12, map: treadTexture(), vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  /**
   * Lays track under one vehicle's four wheels.
   *   holder   the vehicle's Group (position on the ground)
   *   heading  its yaw (0 = +z)
   *   bounds   attachModel's model.userData.bounds, in the holder's space
   */
  follow(key, holder, heading, bounds, { y = 0.025 } = {}) {
    if (!bounds) return;
    let v = this.vehicles.get(key);
    if (!v) this.vehicles.set(key, (v = { prev: [null, null, null, null], v: [0, 0, 0, 0] }));
    const wx = ((bounds.max.x - bounds.min.x) / 2) * 0.8;
    const len = bounds.max.z - bounds.min.z;
    const fz = bounds.max.z - len * 0.2, rz = bounds.min.z + len * 0.2;
    const cos = Math.cos(heading), sin = Math.sin(heading), p = holder.position;
    const airborne = p.y > 0.4;
    const pos = this.mesh.geometry.attributes.position;
    const uv = this.mesh.geometry.attributes.uv;
    let wrote = false;
    [[-wx, rz], [wx, rz], [-wx, fz], [wx, fz]].forEach(([lx, lz], w) => {
      const x = p.x + lx * cos + lz * sin, z = p.z - lx * sin + lz * cos;
      const prev = v.prev[w];
      if (airborne) { v.prev[w] = null; return; }
      if (!prev) { v.prev[w] = new THREE.Vector3(x, y, z); return; }
      const dx = x - prev.x, dz = z - prev.z, d = Math.hypot(dx, dz);
      if (d < this.step) return;
      if (d > 6) { prev.set(x, y, z); return; }         // teleported (restart, respawn): don't draw a line
      const sx = (-dz / d) * this.half, sz = (dx / d) * this.half;
      const o = this.cursor * 4;
      const v0 = v.v[w], v1 = v0 + d / 0.6;              // one tread repeat every 60 cm
      pos.setXYZ(o, prev.x - sx, y, prev.z - sz);
      pos.setXYZ(o + 1, prev.x + sx, y, prev.z + sz);
      pos.setXYZ(o + 2, x - sx, y, z - sz);
      pos.setXYZ(o + 3, x + sx, y, z + sz);
      uv.setXY(o, 0, v0); uv.setXY(o + 1, 1, v0); uv.setXY(o + 2, 0, v1); uv.setXY(o + 3, 1, v1);
      v.v[w] = v1 % 1;
      this.birth[this.cursor] = this.t;
      this.cursor = (this.cursor + 1) % this.max;
      prev.set(x, y, z);
      wrote = true;
    });
    if (wrote) { pos.needsUpdate = true; uv.needsUpdate = true; }
  }

  /** Forget where a vehicle was (after a teleport), so the next print starts fresh. */
  reset(key) { this.vehicles.delete(key); }

  update(dt) {
    this.t += dt;
    const col = this.mesh.geometry.attributes.color;
    for (let q = 0; q < this.max; q++) {
      const b = this.birth[q];
      if (b < 0) continue;
      const age = this.t - b;
      // fresh prints are a touch darker, then they dry out and fade
      const a = this.opacity * Math.min(1, 1.25 - age / this.life * 1.25) * (age < 0.6 ? 1.15 : 1);
      const o = q * 4;
      if (a <= 0) {
        this.birth[q] = -1;
        for (let k = 0; k < 4; k++) col.setW(o + k, 0);
      } else {
        for (let k = 0; k < 4; k++) col.setW(o + k, a);
      }
    }
    col.needsUpdate = true;
  }
}

/** A chunky off-road tread: chevron blocks with soft edges, white on transparent (tinted by the material). */
function treadTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.35)';           // the pressed-down band
  g.fillRect(2, 0, 28, 64);
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let y = 0; y < 64; y += 16) {
    // a chevron: two angled blocks meeting in the middle
    g.beginPath(); g.moveTo(3, y + 2); g.lineTo(15, y + 8); g.lineTo(15, y + 14); g.lineTo(3, y + 8); g.fill();
    g.beginPath(); g.moveTo(29, y + 2); g.lineTo(17, y + 8); g.lineTo(17, y + 14); g.lineTo(29, y + 8); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
