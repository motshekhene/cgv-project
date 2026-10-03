import * as THREE from 'three';
import { attachModel as attachVehicleModel } from './attachModel.js';

/** States in which he is actively attacking (lights strobe, HUD goes red). */
export const ATTACK_STATES = ['TELEGRAPH', 'SLAM', 'PIT', 'SHUNT', 'PIN', 'SHOOT', 'DRONE'];

const MOVE_LABEL = {
  SLAM: 'SIDE SLAM',
  PIT: 'PIT MANOEUVRE',
  SHUNT: 'REAR SHUNT',
  PIN: 'WALL PIN',
  SHOOT: 'TYRE SHOT',
  DRONE: 'DRONE LAUNCH',
};

const _v = new THREE.Vector2();

/**
 * HandlerAI — Member 2A
 *
 * The pursuer for Level 2. Both cars are SOLID: every frame the two bodies
 * are tested as oriented boxes (separating axis test) and pushed apart, with
 * a momentum exchange, so he can bump, shove and spin you but never drive
 * through you. He is heavier than you (mass 1.6 vs 1), so his hits move you
 * more than yours move him.
 *
 *   APPROACH   closes in from behind
 *   HARASS     rides alongside on the side with more road and keeps jabbing
 *              his door into yours — real contact, small damage
 *   TELEGRAPH  lightbar strobes and the HUD names the move that's coming,
 *              while he lines up for it:
 *     SLAM       swings wide, locks where you are, slams into your side
 *     PIT        tucks in at your rear quarter and taps it — your tail kicks
 *                out and you lose speed
 *     SHUNT      drops in directly behind and rams your rear bumper
 *     PIN        only when you're near a rail: he gets on the inside and
 *                shoves you into the wall, grinding you along it
 *     SHOOT      (after ~18 s) drops back and shoots at your rear tyre —
 *                see HandlerWeapons.js
 *     DRONE      (after ~30 s) launches a spike-strip or kamikaze drone
 *   RECOVER    backs off after landing a hit
 *   DODGED     you avoided or escaped the move; he falls well back
 *
 * Counters (each move has its own):
 *   SLAM   swerve away, boost, or brake once he's locked on
 *   PIT    swerve away from him or boost — braking backs you into his nose
 *   SHUNT  change lane while he's lining up behind you, or boost
 *   PIN    brake or boost to break contact; steering alone won't beat his weight
 *   SHOOT  keep moving sideways: his laser sight lags behind your wheel
 *   DRONE  spikes: change lane before the strip; kamikaze: change speed or
 *          lane when its light goes solid
 *
 * He gets more aggressive over ~90 s (shorter harass, quicker wind-up,
 * harder hits) and rubber-bands back if you boost far ahead.
 *
 * Hooks (set by Level02):
 *   onAttackResolved(hit)  a move landed     hit = { move, label, damage, impact, side }
 *   onContact(hit)         a smaller bump    hit = { damage, impact, side }
 *   onDodge(move, label)   a move missed or you broke free
 */
export class HandlerAI {
  constructor(scene, target) {
    this.target = target;

    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.65, 3.8),
      new THREE.MeshStandardMaterial({ color: 0xff5533, metalness: 0.2, roughness: 0.5, emissive: 0x220000 })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    this.mesh.add(body);
    scene.add(this.mesh);

    // starts behind the player and has to close the gap
    this.mesh.position.set(0, 0, -28);

    this.state = 'APPROACH';
    this.stateTimer = 0;
    this.elapsed = 0;

    // motion (road space: x across, z along the highway)
    this.speed = 0;
    this.latVel = 0;
    this.heading = 0;
    this.maxSpeed = 46;          // floor; really max(46, your top speed + 4) — see update()
    this.railX = 11.7;
    this.halfW = 0.95;
    this.halfL = 1.9;
    this.mass = 1.6;             // player is 1

    // tactics
    this.side = 1;               // which side of the player he works (+x / -x)
    this.harassFor = 3;
    this.jabTimer = 1;
    this.nextMove = null;
    this.lastMove = null;
    this.locked = false;
    this.ramX = 0;
    this.ramSpeed = 0;
    this.moveLanded = false;
    this.pinContact = 0;         // seconds since he last touched you during a PIN

    // contact bookkeeping
    this.touching = false;
    this.damageCooldown = 0;
    this.harassRange = 9;        // kept for anything still reading it

    this.weapons = null;         // HandlerWeapons, set by Level02 (optional)
    this.traffic = null;         // Traffic, set by Level02 — he drives round it

    // fairness
    this.nextAttackAt = 8;       // grace period before the first move
    this.avoiding = null;        // traffic car he's currently steering round

    this.onAttackResolved = null;
    this.onContact = null;
    this.onDodge = null;
  }

  /**
   * 0 at the start of the chase → 1 after ~90 s. Halved while you're badly
   * hurt, so a low health bar is a comeback window, not a death spiral.
   */
  get aggro() {
    const a = Math.min(1, this.elapsed / 90);
    return this._hurt ? a * 0.5 : a;
  }

  get _hurt() {
    return (this.target.health ?? 100) < 35;
  }

  /** Called whenever a move finishes (hit or miss): guaranteed breathing room. */
  _cooldown() {
    const gap = THREE.MathUtils.lerp(6, 3.5, this.aggro) * (this._hurt ? 1.6 : 1);
    this.nextAttackAt = this.elapsed + gap;
  }

  /** Is there traffic on that side of you, close enough to box you in? */
  _boxedIn(dir) {
    if (!this.traffic) return false;
    const p = this.target.mesh.position;
    return this.traffic.pool.some((v) => Math.abs(v.z - p.z) < 9 && (v.x - p.x) * dir > 0 && (v.x - p.x) * dir < 6);
  }

  /** Only start a move when it can be read and answered. */
  _fairToAttack() {
    if (this.elapsed < this.nextAttackAt) return false;
    if (this.weapons && this.weapons.threatActive) return false;   // one threat at a time
    return true;
  }

  /** Bumps only cost health while he's actually on the attack. */
  get hostile() {
    return this.state === 'HARASS' || ATTACK_STATES.includes(this.state);
  }

  /** Text for the HUD: names the incoming move during the wind-up. */
  get label() {
    if (this.state === 'TELEGRAPH' && this.nextMove) return MOVE_LABEL[this.nextMove] + ' !';
    return MOVE_LABEL[this.state] || this.state;
  }

  attachModel(assets, path, options = {}) {
    return attachVehicleModel(assets, this.mesh, path, { length: 3.8, ...options }).then((model) => {
      const b = model && model.userData.bounds;
      if (b) {
        this.halfW = (b.max.x - b.min.x) / 2;
        this.halfL = (b.max.z - b.min.z) / 2;
      }
      return model;
    });
  }

  _enter(state) {
    if (['RECOVER', 'DODGED'].includes(state) || (['SHOOT', 'DRONE'].includes(this.state) && state === 'APPROACH')) {
      this._cooldown();
    }
    this.state = state;
    this.stateTimer = 0;
  }

  _carHalf() {
    const b = this.target.bounds;
    // Level02 stores slightly shrunk bounds for traffic; use the full body here
    return b ? { w: b.halfW / 0.9, l: b.halfL / 0.92 } : { w: 0.9, l: 1.8 };
  }

  _chooseMove() {
    const p = this.target.mesh.position;
    const awayBlocked = this._boxedIn(-this.side);   // your escape route from him
    const nearWall = Math.abs(p.x) > this.railX - 5.5 && Math.sign(p.x) === -this.side;
    if (nearWall && this.lastMove !== 'PIN' && !this._hurt && Math.random() < 0.5) return 'PIN';
    // a SLAM you can't swerve away from isn't a dodge, it's a tax
    const options = awayBlocked ? ['PIT', 'SHUNT'] : ['SLAM', 'PIT', 'SHUNT'];
    // ranged attacks unlock as the chase goes on, and come up more often later
    if (this.weapons && this.elapsed > 18) options.push('SHOOT');
    if (this.weapons && this.elapsed > 30 && this.weapons.canLaunchDrone()) options.push('DRONE');
    const pool = options.filter((m) => m !== this.lastMove);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  update(dt) {
    const car = this.target;
    const p = car.mesh.position;
    const m = this.mesh.position;
    this.elapsed += dt;
    this.stateTimer += dt;

    // a drone or spike strip finishing counts as a move finishing: breathing room after it too
    const threat = !!(this.weapons && this.weapons.threatActive);
    if (this._threatWas && !threat) this._cooldown();
    this._threatWas = threat;
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);

    const a = this.aggro;
    const half = this._carHalf();
    const GAP = half.w + this.halfW;      // centre-to-centre when doors touch
    const LEN = half.l + this.halfL;      // centre-to-centre when bumpers touch
    const dz = p.z - m.z;                 // >0: player is ahead of him
    const dist = Math.hypot(p.x - m.x, dz);

    // ---------- where he wants to be ----------
    let tx = p.x + this.side * (GAP + 1.5);
    let tz = p.z - LEN - 4;
    let maxLat = 6;
    let fixedSpeed = null;                // set when he commits to a speed
    let accel = 18;
    let decel = 30;
    let keepClear = true;                 // don't aim through the player unless attacking

    switch (this.state) {
      case 'APPROACH': {
        // only swap sides while safely behind, never through the player
        if (dz > LEN + 2) {
          if (p.x > 3) this.side = -1;
          else if (p.x < -3) this.side = 1;
        }
        tx = p.x + this.side * (GAP + 0.8);
        tz = p.z - LEN - 1;
        // in the slot behind you, or already alongside (you came to him)
        const alongside = Math.abs(dz) < LEN && Math.abs(p.x - m.x) < GAP + 2;
        if (Math.abs(tz - m.z) < 3 || alongside) {
          this.harassFor = THREE.MathUtils.lerp(4, 2.2, a) + Math.random() * 1.2;
          this.jabTimer = 0.6 + Math.random() * 0.6;
          this._enter('HARASS');
        }
        break;
      }

      case 'HARASS': {
        // door to door, surging forward and back, jabbing in every second or so
        const t = this.stateTimer;
        this.jabTimer -= dt;
        const jabbing = this.jabTimer < 0;
        if (this.jabTimer < -0.3) this.jabTimer = THREE.MathUtils.lerp(1.5, 0.9, a) + Math.random() * 0.5;
        const jabIn = this._hurt ? 0.4 : 0.9;
        tx = p.x + this.side * (jabbing ? GAP - jabIn : GAP + 0.45);
        tz = p.z - 0.6 + Math.sin(t * 1.3) * 1.4;
        maxLat = jabbing ? 7 : 5;
        keepClear = !jabbing;
        if (dz > 25) this._enter('APPROACH');
        else if (t > this.harassFor && this._fairToAttack()) {
          this.nextMove = this._chooseMove();
          this.locked = false;
          this.moveLanded = false;
          this._enter('TELEGRAPH');
        }
        break;
      }

      case 'TELEGRAPH': {
        const windUp = THREE.MathUtils.lerp(1.1, 0.85, a);   // never less than 0.85 s of warning
        const tell = 0.35;                // he holds still for this long before going
        const move = this.nextMove;
        if (move === 'SLAM') {
          tx = p.x + this.side * (GAP + 2.4);
          tz = p.z;
          if (!this.locked && this.stateTimer > windUp - tell) {
            this.locked = true;
            this.ramX = p.x;              // commits to where you are...
            this.ramSpeed = car.speed;    // ...and how fast you're going
          }
          if (this.locked) { tx = m.x; fixedSpeed = this.ramSpeed; this.latVel *= Math.exp(-12 * dt); }
        } else if (move === 'PIT') {
          tx = p.x + this.side * (GAP + 0.5);
          tz = p.z - LEN * 0.75;          // tucked in at your rear quarter
        } else if (move === 'SHUNT') {
          // drop back first, only then slide in behind you
          tz = p.z - LEN - 7;
          tx = dz > LEN + 1.5 ? p.x : p.x + this.side * (GAP + 0.6);
        } else if (move === 'PIN') {
          tx = p.x + this.side * (GAP + 0.3);
          tz = p.z;
        } else if (move === 'SHOOT' || move === 'DRONE') {
          // falls back to a firing position off your rear quarter
          tx = p.x + this.side * (GAP + 2.5);
          tz = p.z - 9;
        }
        maxLat = 5;
        if (this.stateTimer > windUp) {
          this.locked = false;
          this.moveLanded = false;
          this.pinContact = 0;
          this.lastMove = move;
          this._enter(move);
          if (move === 'SHOOT') this.weapons.startTyreShot(a);
          if (move === 'DRONE') {
            this.weapons.launchDrone(m, Math.random() < 0.5 ? 'spikes' : 'kamikaze');
          }
        }
        break;
      }

      case 'SLAM':
        tx = this.ramX - this.side * 0.6;     // aim through the locked spot
        tz = m.z;
        fixedSpeed = this.ramSpeed;
        maxLat = 11 + 4 * a;
        keepClear = false;
        if (this.moveLanded) this._enter('RECOVER');
        else if (this.stateTimer > 0.6) this._miss();
        break;

      case 'PIT':
        tx = p.x + this.side * (GAP - 1.1);   // nose into the rear corner
        tz = p.z - LEN * 0.6;
        maxLat = 8;
        accel = 14;
        decel = 14;                           // brake hard and he overshoots
        keepClear = false;
        if (this.moveLanded) this._enter('RECOVER');
        else if (this.stateTimer > 0.8) this._miss();
        break;

      case 'SHUNT':
        tx = p.x;
        fixedSpeed = car.speed + 9 + 3 * a;   // closes on your bumper
        maxLat = 3.5;
        accel = 22;
        keepClear = false;
        if (this.moveLanded) this._enter('RECOVER');
        else if (this.stateTimer > 1.4 || (dz < -LEN && Math.abs(p.x - m.x) > GAP)) this._miss();
        break;

      case 'PIN':
        // keep shoving towards the rail; you break free by braking or boosting
        tx = p.x - this.side * 1.2;
        tz = p.z;
        maxLat = 4.5;
        accel = 10 + 4 * a;                   // slow to match speed: that's your way out
        keepClear = false;
        this.pinContact = this.touching ? 0 : this.pinContact + dt;
        if (this.stateTimer > 2.2 + a) this._enter('RECOVER');
        else if (this.stateTimer > 0.5 && this.pinContact > 0.5) this._miss();
        break;

      case 'SHOOT':
        // holds his firing position while the sight tracks you
        tx = p.x + this.side * (GAP + 2.5);
        tz = p.z - 9;
        if (!this.weapons.busy) this._enter('APPROACH');
        break;

      case 'DRONE':
        tx = p.x + this.side * (GAP + 2.5);
        tz = p.z - 12;
        if (this.stateTimer > 1) this._enter('APPROACH');
        break;

      case 'DODGED':
        tx = p.x + this.side * (GAP + 3);
        tz = p.z - 18;
        if (this.stateTimer > 2.0) this._enter('APPROACH');
        break;

      case 'RECOVER':
        tx = p.x + this.side * (GAP + 2.5);
        tz = p.z - LEN - 5;
        if (this.stateTimer > 1.3) this._enter('APPROACH');
        break;
    }

    // never plan a path through the car while level with it
    if (keepClear && Math.abs(dz) < LEN + 0.5) {
      tx = this.side > 0 ? Math.max(tx, p.x + GAP + 0.25) : Math.min(tx, p.x - GAP - 0.25);
    }

    // ---------- weave through traffic ----------
    let trafficCap = Infinity;
    const avoid = this._avoidTraffic(tx);
    if (avoid) {
      if (avoid.x !== null) { tx = avoid.x; maxLat = Math.max(maxLat, 7); }
      else trafficCap = avoid.speed;                     // both sides shut: tuck in behind it
      // an attack that would have to go through a car is called off
      if (avoid.close && ['SLAM', 'PIT', 'SHUNT', 'PIN'].includes(this.state) && !this.moveLanded) this._miss();
    }

    // ---------- drive there ----------
    // rubber band: boosting buys you a gap, not a permanent escape (but a real one)
    // his top speed follows your car: a bit above your normal top speed (so he
    // can always close in) but below your boosted speed (so boost escapes him)
    const baseTop = Math.max(this.maxSpeed, (car.maxSpeed || 42) + 4);
    const topSpeed = baseTop + THREE.MathUtils.clamp((dz - 20) * 0.3, 0, 6);
    const desired = fixedSpeed !== null
      ? fixedSpeed
      : THREE.MathUtils.clamp(car.speed + THREE.MathUtils.clamp((tz - m.z) * 1.6, -14, 14), 0, topSpeed);
    this.speed += THREE.MathUtils.clamp(Math.min(desired, trafficCap) - this.speed, -decel * dt, accel * dt);

    const wantLat = THREE.MathUtils.clamp((tx - m.x) * 3, -maxLat, maxLat);
    const latAccel = this.state === 'SLAM' ? 60 : 24;
    this.latVel += THREE.MathUtils.clamp(wantLat - this.latVel, -latAccel * dt, latAccel * dt);

    m.z += this.speed * dt;
    m.x += this.latVel * dt;
    const lim = this.railX - this.halfW;
    if (Math.abs(m.x) > lim) { m.x = Math.sign(m.x) * lim; this.latVel = 0; }

    // body follows his actual direction of travel
    const h = THREE.MathUtils.clamp(Math.atan2(this.latVel, Math.max(4, this.speed)), -0.45, 0.45);
    this.heading += (h - this.heading) * Math.min(1, 10 * dt);
    this.mesh.rotation.y = this.heading;

    // ---------- solid contact ----------
    this.touching = false;
    for (let k = 0; k < 2; k++) {
      const c = this._solve(car, half);
      if (!c) break;
      this.touching = true;
      if (k === 0) this._react(car, c);
    }

    return { dist, state: this.state };
  }

  /**
   * Looks down the road for traffic in the corridor he's about to drive
   * through. Returns null (clear), { x } (steer to this x to pass it), or
   * { x: null, speed } (no gap either side — slow to its speed).
   */
  _avoidTraffic(tx) {
    if (!this.traffic) return null;
    const m = this.mesh.position;
    const look = 8 + Math.max(0, this.speed) * 0.6;
    const pad = 0.5;
    let blocker = null, bestDz = Infinity;
    for (const v of this.traffic.pool) {
      const vz = v.z - m.z;
      if (vz < -1 || vz > look) continue;
      const reach = this.halfW + v.halfW + pad;
      const lo = Math.min(m.x, tx) - reach, hi = Math.max(m.x, tx) + reach;
      if (v.x > lo && v.x < hi && vz < bestDz) { blocker = v; bestDz = vz; }
    }
    this.avoiding = blocker;
    if (!blocker) return null;

    const clear = this.halfW + blocker.halfW + 0.9;
    const lim = this.railX - this.halfW - 0.2;
    const free = (x) => Math.abs(x) < lim && !this.traffic.pool.some((w) => w !== blocker
      && Math.abs(w.z - blocker.z) < w.halfL + this.halfL + 4
      && Math.abs(w.x - x) < w.halfW + this.halfW + pad);
    const options = [blocker.x - clear, blocker.x + clear].filter(free);
    const close = bestDz < blocker.halfL + this.halfL + 4;
    if (!options.length) return { x: null, speed: blocker.speed, close };
    options.sort((a, b) => Math.abs(a - tx) - Math.abs(b - tx));
    return { x: options[0], close };
  }

  _miss() {
    const move = this.state;
    this.speed *= move === 'SLAM' ? 0.6 : 0.8;
    this.latVel *= 0.3;
    this._enter('DODGED');
    if (this.onDodge) this.onDodge(move, move === 'PIN' ? 'BROKE FREE' : 'DODGED');
  }

  /**
   * Oriented-box contact between the player (A) and the Handler (B).
   * Separates them completely, exchanges momentum and returns the contact,
   * or null when they don't touch.
   */
  _solve(car, half) {
    const p = car.mesh.position, m = this.mesh.position;
    const hA = car.heading, hB = this.heading;
    const axes = [
      [Math.cos(hA), -Math.sin(hA)], [Math.sin(hA), Math.cos(hA)],   // A right, A forward
      [Math.cos(hB), -Math.sin(hB)], [Math.sin(hB), Math.cos(hB)],   // B right, B forward
    ];
    const dx = m.x - p.x, dz = m.z - p.z;

    let depth = Infinity, nx = 0, nz = 0;
    for (const [ax, az] of axes) {
      const rA = half.w * Math.abs(axes[0][0] * ax + axes[0][1] * az) + half.l * Math.abs(axes[1][0] * ax + axes[1][1] * az);
      const rB = this.halfW * Math.abs(axes[2][0] * ax + axes[2][1] * az) + this.halfL * Math.abs(axes[3][0] * ax + axes[3][1] * az);
      const d = dx * ax + dz * az;
      const o = rA + rB - Math.abs(d);
      if (o <= 0) return null;                 // a separating axis: not touching
      if (o < depth) { depth = o; const s = d >= 0 ? 1 : -1; nx = ax * s; nz = az * s; }
    }
    // n points from the player towards the Handler

    // --- push apart, heavier car moves less ---
    const carMass = car.mass || 1;
    const share = this.mass / (carMass + this.mass);   // the player's share
    p.x -= nx * depth * share;  p.z -= nz * depth * share;
    m.x += nx * depth * (1 - share);  m.z += nz * depth * (1 - share);

    // the rail doesn't move: if you're squeezed against it, he gets pushed back instead
    const limA = car.railX - half.w;
    if (Math.abs(p.x) > limA) {
      const over = Math.abs(p.x) - limA;
      p.x = Math.sign(p.x) * limA;
      m.x -= Math.sign(p.x) * over;
      car.wallHit = Math.max(car.wallHit || 0, 0.38);   // grinding along the rail
    }

    // --- momentum exchange along the normal ---
    const vAx = Math.sin(hA) * car.speed + (car.lateralVel || 0);
    const vAz = Math.cos(hA) * car.speed;
    const vBx = this.latVel, vBz = this.speed;
    const vn = (vBx - vAx) * nx + (vBz - vAz) * nz;   // < 0: closing
    let j = 0;
    if (vn < 0) {
      const e = 0.25;                                  // a little bounce
      j = -(1 + e) * vn / (1 / carMass + 1 / this.mass);
      const dAx = -j * nx / carMass, dAz = -j * nz / carMass;   // player Δv
      car.lateralVel = (car.lateralVel || 0) + dAx;
      car.speed += dAz;
      this.latVel += (j / this.mass) * nx;
      this.speed += (j / this.mass) * nz;

      // spin: a push off the car's centre turns it (hit the back, the tail swings)
      const lx = Math.max(-half.w, Math.min(half.w, dx * Math.cos(hA) - dz * Math.sin(hA)));
      const lz = Math.max(-half.l, Math.min(half.l, dx * Math.sin(hA) + dz * Math.cos(hA)));
      car.yawVel = (car.yawVel || 0) + 0.11 * (lz * dAx - lx * dAz);
    }

    _v.set(dx * Math.cos(hA) - dz * Math.sin(hA), dx * Math.sin(hA) + dz * Math.cos(hA));
    return { depth, nx, nz, impulse: j, localX: _v.x, localZ: _v.y, half };
  }

  /** Turns a contact into gameplay: damage, move resolution, callbacks. */
  _react(car, c) {
    const side = Math.sign(this.mesh.position.x - car.mesh.position.x) || this.side;
    const move = this.state;
    const attacking = ['SLAM', 'PIT', 'SHUNT', 'PIN'].includes(move);

    if (attacking && !this.moveLanded) {
      // the move connects
      const rear = c.localZ < -c.half.l * 0.3;
      const ok = move === 'SLAM' || move === 'PIN'
        || (move === 'PIT' && rear)
        || (move === 'SHUNT' && c.localZ < 0);
      if (!ok) return;
      this.moveLanded = true;
      const a = this.aggro;
      let damage = 8, impact = 0.6;
      if (move === 'SLAM') {
        car.bump(-side, 0.6, 0.1);
        damage = Math.round(9 + 5 * a + Math.min(3, c.impulse * 0.3));
        impact = Math.min(1, 0.55 + c.impulse / 12);
      } else if (move === 'PIT') {
        // rear tapped sideways: the tail steps out and the car fishtails
        car.yawVel = (car.yawVel || 0) + side * (1.4 + 0.6 * a);
        car.speed *= 0.82;
        damage = Math.round(7 + 4 * a);
        impact = 0.7;
      } else if (move === 'SHUNT') {
        car.yawVel = (car.yawVel || 0) + (Math.random() < 0.5 ? -1 : 1) * 0.7;
        damage = Math.round(7 + 4 * a + Math.min(2, c.impulse * 0.2));
        impact = Math.min(1, 0.5 + c.impulse / 15);
      } else if (move === 'PIN') {
        damage = Math.round(5 + 3 * a);
        impact = 0.5;
      }
      this.damageCooldown = 0.5;
      if (this.onAttackResolved) {
        this.onAttackResolved({ move, label: MOVE_LABEL[move], damage, impact, side });
      }
      return;
    }

    // smaller bumps: harass jabs, brake-checks, the shove during a PIN
    if (this.damageCooldown === 0 && this.hostile && c.impulse > 1.2 && !this._hurt) {
      this.damageCooldown = 0.9;
      const damage = Math.min(3, Math.round(c.impulse * 0.4));
      if (this.onContact) this.onContact({ damage, impact: Math.min(0.6, 0.15 + c.impulse / 12), side });
    }
  }
}
