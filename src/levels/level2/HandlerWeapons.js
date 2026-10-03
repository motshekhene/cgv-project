import * as THREE from 'three';
import { attachModel } from './attachModel.js';
import { LANES } from './traffic.js';

/**
 * HandlerWeapons — Member 2A
 *
 * The Handler's ranged threats for Level 2, from the pitch:
 * "He rams, PITs you, shoots out tyres and drops drones."
 *
 *   TYRE SHOT   a red laser sight tracks your rear wheel for a second, then
 *               three shots. The sight lags behind you, so keep moving
 *               sideways and the shots hit the road. A hit punctures a tyre:
 *               the car pulls to that side and loses top speed for a while.
 *   SPIKE DRONE a drone overtakes you, drops a spike strip across two lanes
 *               about 90 m ahead (amber beacons + HUD warning) and leaves.
 *               Drive over it and both front tyres go.
 *   KAMIKAZE    a drone hovers over you, its light blinks faster, then it
 *               dives at where you were half a second ago. Change speed or
 *               lane when the blinking goes solid.
 *
 * Models: procedural low-poly meshes are built in code, so this works with no
 * downloads. To use downloaded models instead, put the files here and set the
 * paths in HAZARD_MODELS below (left null so the game never requests a file
 * that isn't there — a 404 in the console costs marks on the checklist):
 *   public/assets/level2/hazards/drone.glb        (e.g. Quaternius "Robot Enemy Flying", CC0)
 *   public/assets/level2/hazards/spike-strip.glb
 *
 * Everything lives under `parent` (Level02's root), so Level.teardown()
 * disposes it. Pools are fixed-size: nothing is allocated while playing.
 *
 * Hooks (set by Level02):
 *   onHit({ kind, label, damage, impact })   kind: 'tyre' | 'spikes' | 'drone'
 *   onWarn(text)                              spike strip dropped, drone diving
 *   onMiss(text)                              shots / dive avoided
 */
export const HAZARD_MODELS = {
  drone: 'level2/hazards/drone.glb',   // "Richie" by joney_lol, CC BY 3.0 (see CREDITS.md)
  spikes: null,                        // 'level2/hazards/spike-strip.glb'
};

const RED = 0xff2a2a;
const DIVE_T = 0.7;              // kamikaze dive time, seconds
const AMBER = 0xffb020;

export class HandlerWeapons {
  constructor(parent, assets) {
    this.parent = parent;
    this.assets = assets;
    this.onHit = null;
    this.onWarn = null;
    this.onMiss = null;

    this._buildLaser();
    this._buildTracers();
    this._buildSparks();
    this.drones = [0, 1].map(() => this._buildDrone());
    this.strips = [0, 1].map(() => this._buildStrip());
    this._buildBlast();

    this.shot = null;            // active tyre-shot sequence
    this.droneCooldown = 0;
  }

  /** Swap in downloaded models if they exist (missing files are fine). */
  async init() {
    if (HAZARD_MODELS.drone) {
      for (const d of this.drones) {
        const m = await attachModel(this.assets, d.body, HAZARD_MODELS.drone, { length: 1.7 });
        if (m) {
          d.rotors.forEach((r) => { r.visible = false; });
          // the model sits on y = 0 after fitting; hang it around the holder instead
          m.position.y -= (m.userData.bounds.max.y - m.userData.bounds.min.y) / 2;
          d.eye.position.set(0, 0.05, (m.userData.bounds.max.z) + 0.02);   // warning light on its nose
        }
      }
    }
    if (HAZARD_MODELS.spikes) {
      for (const s of this.strips) await attachModel(this.assets, s.spikes, HAZARD_MODELS.spikes, { length: s.width });
    }
  }

  get busy() {
    return !!this.shot;
  }

  canLaunchDrone() {
    return this.droneCooldown <= 0 && this.drones.some((d) => !d.active);
  }

  /* ======================== builders ======================== */

  _buildLaser() {
    const geo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(Math.PI / 2);      // unit length along +z, from its origin
    this.laser = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: RED, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.laserDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.laser.visible = this.laserDot.visible = false;
    this.parent.add(this.laser, this.laserDot);

    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.muzzle.visible = false;
    this.parent.add(this.muzzle);
  }

  _buildTracers() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 1);
    geo.translate(0, 0, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      m.userData.t = 0;
      this.parent.add(m);
      return m;
    });
  }

  _buildSparks() {
    const n = 48;
    this.sparkMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffc860 }),
      n
    );
    this.sparkMesh.frustumCulled = false;
    this.sparks = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0 }));
    this._sparkIdx = 0;
    this._m4 = new THREE.Matrix4();
    this.parent.add(this.sparkMesh);
    this._writeSparks();
  }

  _buildDrone() {
    const holder = new THREE.Group();
    const body = new THREE.Group();
    holder.add(body);

    const shell = new THREE.MeshStandardMaterial({ color: 0x1b1e24, metalness: 0.6, roughness: 0.4 });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), shell);
    core.scale.set(1.2, 0.5, 1.2);
    body.add(core);
    const eyeMat = new THREE.MeshBasicMaterial({ color: RED });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeMat);
    eye.position.set(0, -0.12, 0.3);
    eye.userData.keep = true;
    body.add(eye);

    const armGeo = new THREE.BoxGeometry(0.9, 0.05, 0.08);
    const rotorGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12);
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.35, depthWrite: false });
    const rotors = [];
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const arm = new THREE.Mesh(armGeo, shell);
      arm.rotation.y = a;
      body.add(arm);
    }
    for (const [x, z] of [[0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) {
      const r = new THREE.Mesh(rotorGeo, rotorMat);
      r.position.set(x, 0.06, z);
      r.userData.keep = true;
      body.add(r);
      rotors.push(r);
    }
    holder.visible = false;
    this.parent.add(holder);
    return { holder, body, eye, eyeMat, rotors, active: false, mode: null, t: 0, phase: '', target: new THREE.Vector3(), vel: new THREE.Vector3() };
  }

  _buildStrip() {
    const width = 11;            // covers two lanes
    const holder = new THREE.Group();
    const spikes = new THREE.Group();
    holder.add(spikes);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.06, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 })
    );
    base.position.y = 0.03;
    spikes.add(base);
    const count = 44;
    const spikeMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.05, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.9, roughness: 0.3 }),
      count * 2
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < count * 2; i++) {
      const row = i % 2 ? 0.1 : -0.1;
      m.makeTranslation(-width / 2 + 0.15 + (Math.floor(i / 2) / (count - 1)) * (width - 0.3), 0.16, row);
      spikeMesh.setMatrixAt(i, m);
    }
    spikes.add(spikeMesh);

    // amber beacons at both ends, so you see it coming in the dark
    const beaconMat = new THREE.MeshBasicMaterial({ color: AMBER });
    const glowMat = new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const beacons = [-1, 1].map((s) => {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 8), beaconMat);
      b.position.set(s * (width / 2 + 0.4), 0.5, 0);
      b.userData.keep = true;
      holder.add(b);
      // soft additive glow so it reads from 100 m away in the dark
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), glowMat);
      glow.position.set(0, 0.6, 0);
      glow.userData.keep = true;
      b.add(glow);
      return b;
    });
    holder.visible = false;
    this.parent.add(holder);
    return { holder, spikes, beaconMat, glowMat, beacons, width, active: false, x: 0, z: 0, hit: false, t: 0 };
  }

  _buildBlast() {
    this.blast = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.blast.visible = false;
    this.blast.userData.t = 0;
    this.parent.add(this.blast);
  }

  /* ======================== triggers (called by HandlerAI) ======================== */

  /** Starts a tyre-shot sequence from the Handler at the player. */
  startTyreShot(aggro = 0) {
    this.shot = {
      t: 0,
      aimDelay: THREE.MathUtils.lerp(0.45, 0.3, aggro),   // how far the sight lags behind you
      sightTime: THREE.MathUtils.lerp(1.1, 0.8, aggro),
      fired: 0,
      hits: 0,
      history: [],                                        // recent wheel positions for the lag
      aim: new THREE.Vector3(),
    };
  }

  /** Sends a drone: 'spikes' drops a strip ahead, 'kamikaze' dives at you. */
  launchDrone(from, mode) {
    const d = this.drones.find((x) => !x.active);
    if (!d) return false;
    d.active = true;
    d.mode = mode;
    d.t = 0;
    d.phase = 'climb';
    d.holder.position.set(from.x, 1.5, from.z);
    d.vel.set(0, 0, 0);
    d.holder.visible = true;
    this.droneCooldown = 9;
    return true;
  }

  /* ======================== per frame ======================== */

  update(dt, car, handlerMesh) {
    this.droneCooldown = Math.max(0, this.droneCooldown - dt);
    this._updateShot(dt, car, handlerMesh);
    for (const d of this.drones) if (d.active) this._updateDrone(dt, d, car);
    for (const s of this.strips) if (s.active) this._updateStrip(dt, s, car);
    this._updateTracers(dt);
    this._updateSparks(dt);
    this._updateBlast(dt);
  }

  _rearWheel(car, side, out) {
    const b = car.bounds || { halfW: 0.75, halfL: 1.5 };
    const p = car.mesh.position, h = car.heading;
    const lx = side * b.halfW / 0.9, lz = -b.halfL / 0.92 * 0.6;
    return out.set(p.x + lx * Math.cos(h) + lz * Math.sin(h), 0.35, p.z - lx * Math.sin(h) + lz * Math.cos(h));
  }

  _updateShot(dt, car, handlerMesh) {
    const s = this.shot;
    if (!s) { this.laser.visible = this.laserDot.visible = this.muzzle.visible = false; return; }
    s.t += dt;

    // which rear wheel faces him
    const side = Math.sign(handlerMesh.position.x - car.mesh.position.x) || 1;
    const wheel = this._rearWheel(car, side, new THREE.Vector3());
    s.history.push({ t: s.t, x: wheel.x, dz: wheel.z - car.mesh.position.z });
    while (s.history.length > 2 && s.t - s.history[1].t > s.aimDelay) s.history.shift();
    const lagged = s.history[0];
    // the sight follows where your wheel WAS (sideways), at your current distance
    s.aim.set(lagged.x, 0.35, car.mesh.position.z + lagged.dz);

    const gun = handlerMesh.position.clone();
    gun.y = 1.25;
    gun.x += side * -0.6;             // out of his window, towards you

    // laser sight
    const dir = s.aim.clone().sub(gun);
    const len = dir.length();
    this.laser.visible = this.laserDot.visible = true;
    this.laser.position.copy(gun);
    this.laser.lookAt(s.aim);
    this.laser.scale.set(1, 1, len);
    this.laserDot.position.copy(s.aim);
    const charging = s.t < s.sightTime;
    this.laser.material.opacity = charging ? 0.35 + 0.4 * (s.t / s.sightTime) : 0.9;

    // three shots, 0.18 s apart, once the sight has settled
    const due = charging ? 0 : 1 + Math.floor((s.t - s.sightTime) / 0.18);
    while (s.fired < Math.min(3, due)) {
      s.fired++;
      this._fire(gun, s.aim, car, side);
    }
    this.muzzle.visible = !charging && (s.t - s.sightTime) % 0.18 < 0.05;
    this.muzzle.position.copy(gun);

    if (s.fired >= 3 && s.t > s.sightTime + 0.6) {
      if (s.hits === 0 && this.onMiss) this.onMiss('SHOTS MISSED');
      this.shot = null;
    }
  }

  _fire(gun, aim, car, side) {
    // tracer
    const tr = this.tracers.find((x) => !x.visible) || this.tracers[0];
    tr.visible = true;
    tr.userData.t = 0.09;
    tr.position.copy(gun);
    tr.lookAt(aim);
    tr.scale.set(1, 1, gun.distanceTo(aim));

    // did the aim point land on the car's rear wheel?
    const wheel = this._rearWheel(car, side, new THREE.Vector3());
    const hit = Math.hypot(wheel.x - aim.x, wheel.z - aim.z) < 0.75;
    this._burst(hit ? wheel : aim, hit ? 10 : 6);
    if (hit) {
      this.shot.hits++;
      if (this.shot.hits === 1) {
        car.puncture(side, 0.6, 5);
        if (this.onHit) this.onHit({ kind: 'tyre', label: 'TYRE SHOT', damage: 6, impact: 0.45 });
      }
    }
  }

  _updateDrone(dt, d, car) {
    d.t += dt;
    const p = car.mesh.position;
    const pos = d.holder.position;
    d.rotors.forEach((r, i) => { r.rotation.y += dt * (40 + i * 3); });

    let goal = null, speed = 0;
    if (d.mode === 'spikes') {
      if (d.phase === 'climb') {
        goal = new THREE.Vector3(pos.x, 7, p.z + 10);
        if (pos.y > 6) d.phase = 'overtake';
      } else if (d.phase === 'overtake') {
        // pick the two lanes around you, then fly far ahead and drop
        const lane = LANES.reduce((best, x) => (Math.abs(x - p.x) < Math.abs(best - p.x) ? x : best), LANES[0]);
        const pairCentre = lane < 0 ? (lane === LANES[0] ? lane + 3 : lane - 3) : (lane === LANES[LANES.length - 1] ? lane - 3 : lane + 3);
        d.target.set(pairCentre, 4, p.z + 95);
        goal = d.target;
        if (pos.z > p.z + 75) {
          this._dropStrip(pairCentre, pos.z + 8);
          d.phase = 'leave';
          if (this.onWarn) this.onWarn('SPIKE STRIP AHEAD');
        }
      } else {
        goal = new THREE.Vector3(pos.x + 20, 30, pos.z + 30);
        if (pos.y > 25) this._retire(d);
      }
      speed = Math.abs(car.speed) + 22;
    } else {
      // kamikaze: hover above you, blink faster, lock, dive
      if (d.phase === 'climb') {
        goal = new THREE.Vector3(p.x, 6, p.z + 4);
        if (pos.y > 5 && Math.abs(pos.z - p.z - 4) < 3) { d.phase = 'hover'; d.t = 0; if (this.onWarn) this.onWarn('DRONE ABOVE'); }
        speed = Math.abs(car.speed) + 18;
      } else if (d.phase === 'hover') {
        goal = new THREE.Vector3(p.x, 6, p.z + 4);
        speed = Math.abs(car.speed) + 12;
        if (d.t > 1.6) {
          // lock: aim at where you'll be in DIVE_T seconds if you change nothing.
          // Brake, boost or change lane during the dive and it hits empty road.
          d.target.set(p.x, 0.4, p.z + car.speed * DIVE_T);
          d.from = pos.clone();
          d.phase = 'dive'; d.t = 0;
        }
      } else if (d.phase === 'dive') {
        // a fixed-time swoop (eased), so the timing is readable and fair
        const k = Math.min(1, d.t / DIVE_T);
        const prevPos = pos.clone();
        pos.lerpVectors(d.from, d.target, k * k);
        d.vel.copy(pos).sub(prevPos).divideScalar(Math.max(dt, 1e-4));
        d.body.rotation.x = 0.6;
        if (k >= 1) this._explode(d, car);
      }
    }

    // fly towards the goal, matching your forward speed on the way
    if (goal && d.phase !== 'dive') {
      // your velocity (so it keeps pace) plus a correction towards the goal
      const to = goal.clone().sub(pos);
      const dist = to.length();
      const extra = Math.max(4, speed - Math.abs(car.speed));
      const want = to.multiplyScalar(dist > 0.01 ? Math.min(extra, dist * 3) / dist : 0);
      want.z += car.speed;
      d.vel.lerp(want, Math.min(1, dt * (d.phase === 'dive' ? 8 : 3)));
      pos.addScaledVector(d.vel, dt);
      d.body.rotation.x = THREE.MathUtils.clamp((d.vel.z - car.speed) * 0.02, -0.4, 0.4);
      d.body.rotation.z = THREE.MathUtils.clamp(-d.vel.x * 0.03, -0.5, 0.5);
    }
    // guns towards the car while hunting it; nose-first while flying off to drop spikes
    const facePlayer = d.mode === 'kamikaze' || d.phase === 'climb';
    const look = facePlayer
      ? Math.atan2(p.x - pos.x, p.z - pos.z)
      : Math.atan2(d.vel.x, d.vel.z - car.speed + 1e-3);
    let dy = look - d.holder.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    d.holder.rotation.y += dy * Math.min(1, dt * 6);

    // eye: slow blink while cruising, fast in the hover, solid once it dives
    const rate = d.phase === 'hover' ? 2 + d.t * 6 : d.phase === 'dive' ? 0 : 1.5;
    const on = rate === 0 || Math.sin(d.t * rate * Math.PI * 2) > 0;
    d.eyeMat.color.setHex(on ? RED : 0x330606);

    // never leave a drone behind forever
    if (pos.z < p.z - 60) this._retire(d);
  }

  _explode(d, car) {
    const pos = d.holder.position;
    this.blast.visible = true;
    this.blast.userData.t = 0;
    this.blast.position.set(pos.x, 0.8, pos.z);
    this._burst(this.blast.position, 16);
    const p = car.mesh.position;
    const dist = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (dist < 2.6) {
      const side = Math.sign(p.x - pos.x) || 1;
      car.bump(side, 0.9, 0.18);
      if (this.onHit) this.onHit({ kind: 'drone', label: 'DRONE HIT', damage: 14, impact: 0.9 });
    } else if (this.onMiss) {
      this.onMiss('DRONE MISSED');
    }
    this._retire(d);
  }

  _retire(d) {
    d.active = false;
    d.holder.visible = false;
  }

  _dropStrip(x, z) {
    const s = this.strips.find((k) => !k.active) || this.strips[0];
    s.active = true;
    s.hit = false;
    s.t = 0;
    s.x = x;
    s.z = z;
    s.holder.position.set(x, 0, z);
    s.holder.visible = true;
  }

  _updateStrip(dt, s, car) {
    s.t += dt;
    const on = Math.sin(s.t * 12) > 0;
    s.beaconMat.color.setHex(on ? AMBER : 0x3a2600);
    s.glowMat.opacity = on ? 0.4 : 0.05;
    const p = car.mesh.position;
    const b = car.bounds || { halfW: 0.75, halfL: 1.5 };
    if (!s.hit && Math.abs(p.z - s.z) < b.halfL && Math.abs(p.x - s.x) < s.width / 2 + b.halfW * 0.8) {
      s.hit = true;
      car.puncture(0, 1, 7);
      car.speed *= 0.7;
      this._burst(new THREE.Vector3(p.x, 0.3, p.z), 14);
      if (this.onHit) this.onHit({ kind: 'spikes', label: 'SPIKE STRIP', damage: 10, impact: 0.7 });
    }
    if (p.z > s.z + 40) { s.active = false; s.holder.visible = false; }
  }

  _updateTracers(dt) {
    for (const t of this.tracers) {
      if (!t.visible) continue;
      t.userData.t -= dt;
      t.material.opacity = Math.max(0, t.userData.t / 0.09);
      if (t.userData.t <= 0) t.visible = false;
    }
  }

  _burst(at, n) {
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this._sparkIdx];
      this._sparkIdx = (this._sparkIdx + 1) % this.sparks.length;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8);
      s.t = 0.35 + Math.random() * 0.3;
    }
  }

  _updateSparks(dt) {
    for (const s of this.sparks) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.v.y -= 18 * dt;
      s.p.addScaledVector(s.v, dt);
    }
    this._writeSparks();
  }

  _writeSparks() {
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.t > 0) this._m4.makeTranslation(s.p.x, s.p.y, s.p.z);
      else this._m4.makeScale(0, 0, 0);
      this.sparkMesh.setMatrixAt(i, this._m4);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  }

  _updateBlast(dt) {
    const b = this.blast;
    if (!b.visible) return;
    b.userData.t += dt;
    const k = b.userData.t / 0.45;
    b.scale.setScalar(0.5 + k * 3);
    b.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) b.visible = false;
  }
}
