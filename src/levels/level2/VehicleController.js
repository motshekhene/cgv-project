import * as THREE from 'three';
import { attachModel as attachVehicleModel } from './attachModel.js';
import { spinWheels } from './wheels.js';

/**
 * VehicleController — Member 2A
 *
 * Simple arcade-style car controller (no full physics engine yet — that
 * lands once the team locks Rapier/cannon-es for real, per Day 1-3 plan).
 * Owns: acceleration, braking, steering, drift, boost/heat.
 * Reads: shared `input` object (stand-in for 1A's Input system).
 */
export class VehicleController {
  constructor(scene) {
    this.mesh = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.6, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x35c9ff, metalness: 0.3, roughness: 0.4 })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    this.mesh.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x0e1720 })
    );
    cabin.position.set(0, 0.9, -0.2);
    this.mesh.add(cabin);

    scene.add(this.mesh);

    // --- movement state ---
    this.speed = 0;          // forward speed, m/s
    this.heading = 0;        // 0 = straight down the highway (+z)
    this.maxSpeed = 42;
    this.accelRate = 22;
    this.brakeRate = 40;
    this.dragRate = 8;

    // --- handling ---
    // Steering is a value in -1..1 that eases towards the stick rather than
    // snapping, so a tap is a lane change and a hold is a hard swerve.
    this.steer = 0;
    this.steerIn = 7;            // how fast the wheel turns in (per s)
    this.steerOut = 9;           // how fast it centres when released
    this.steerRate = 1.6;        // peak yaw rate (rad/s) at the sweet-spot speed
    this.maxHeading = 0.55;      // can't turn more than ~31° off the road line
    this.selfAlign = 2.6;        // how hard the car straightens up with no input
    this.lateralVel = 0;         // sideways shove from hits, m/s (decays)
    this.yawVel = 0;             // spin from off-centre hits (PIT, shunts), rad/s (decays)
    this.roll = 0;               // body lean, purely visual
    this.drifting = false;       // read by Level02 for skids/smoke
    this.flat = null;            // { side, severity, t, total } while a tyre is punctured

    // --- drift (Q) ---
    // heading is the way the car travels; in a drift the body swings round
    // off it by `slip` (nose into the turn, tail out), so it slides sideways
    this.slip = 0;               // rad, + = nose to the left, like steer
    this.driftDir = 0;           // -1 / +1 while drifting, 0 when not
    this.driftTime = 0;          // seconds into the current drift: what it pays out
    this.onDriftEnd = null;      // (seconds, nitroSeconds) when a drift pays out — Level02 calls it out

    // road edges (the guardrails) — Level02 can overwrite from RoadSystem
    this.railX = 11.7;
    this.wallHit = 0;            // >0 for the frame the car scrapes a rail (impact 0..1)

    // --- boost / heat ---
    this.heat = 0;
    this.maxHeat = 100;
    this.boosting = false;
    this.overheated = false;

    // --- health (written here, read by UI/3B later) ---
    this.health = 100;
    this.maxHealth = 100;        // shrine hearts (pickups.js) raise it

    // --- rewards (pickups.js) ---
    this.shield = 0;             // seconds left: no damage at all while > 0
    this.freeBoost = 0;          // seconds left of nitro: boosts on its own, builds no heat

    // --- per-car qualities (see carSelect.js CARS[].stats) ---
    this.strength = 1;           // damage taken is divided by this
    this.mass = 1;               // heavier: shoved less by the Handler and traffic
  }

  /** Applies a car's stats: { speed, accel, handling, strength }. */
  applyStats(stats = {}) {
    this.maxSpeed = stats.speed ?? 42;
    this.accelRate = stats.accel ?? 22;
    this.steerRate = 1.6 * (stats.handling ?? 1);
    this.strength = stats.strength ?? 1;
    this.mass = this.strength;
  }

  takeDamage(amount) {
    if (this.shield > 0) return;
    this.health = Math.max(0, this.health - amount / this.strength);
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * Sideways shove + speed loss, e.g. from the Handler's ram.
   * side: -1 pushes towards -x, +1 towards +x.
   */
  /**
   * Flat tyre. side: -1 / +1 = that rear wheel (pulls the car that way),
   * 0 = both fronts (spike strip: no pull, heavy drag). Wears off after
   * `duration` seconds — the run-flats re-seal.
   */
  puncture(side, severity = 0.6, duration = 7) {
    this.flat = { side, severity, t: duration, total: duration };
  }

  bump(side, strength = 1, speedLoss = 0.15) {
    const k = strength / this.mass;            // heavy cars barely move
    this.lateralVel += side * 9 * k;
    this.speed *= 1 - speedLoss / Math.max(1, this.mass);
    this.heading += side * 0.12 * k;           // nose kicked sideways too
    this._endDrift(false);                     // a knock breaks the slide: no payout
  }

  /** Which way the body points (the travel heading plus the drift's slip). */
  get yaw() { return this.heading + this.slip; }

  /** Straight out of a slide at once, no payout (the car picker opening mid-drift). */
  cancelDrift() {
    this._endDrift(false);
    this.slip = 0;
  }

  /**
   * The drift is over. Let go cleanly after half a second or more and it
   * pays out free nitro, more the longer it was held (up to 2.5 s); broken
   * by a knock, a rail or running out of speed, it pays nothing.
   */
  _endDrift(pay) {
    if (!this.driftDir) return;
    const held = this.driftTime;
    this.driftDir = 0;
    this.driftTime = 0;
    if (!pay || held < 0.5 || this.health <= 0) return;   // nothing for a wreck
    const nitro = Math.min(2.5, 0.4 + held * 0.8);
    this.freeBoost = Math.max(this.freeBoost, nitro);
    this.onDriftEnd?.(held, nitro);
  }

  attachModel(assets, path, options = {}) {
    return attachVehicleModel(assets, this.mesh, path, { length: 3.6, ...options }).then((model) => {
      if (model) this.model = model;
      return model;
    });
  }

  update(dt, input) {
    // ---- longitudinal ----
    const before = this.speed;
    if (input.forward) this.speed += this.accelRate * dt;
    else if (input.backward) this.speed -= this.brakeRate * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), this.dragRate * dt);

    // boost builds heat; it only starts cooling half a second after you let go,
    // so feathering the button still overheats. Max heat locks boost out
    // until the engine has cooled to 35%.
    if (this.heat >= this.maxHeat) this.overheated = true;
    else if (this.heat <= 35) this.overheated = false;
    this.shield = Math.max(0, this.shield - dt);
    this.freeBoost = Math.max(0, this.freeBoost - dt);
    const nitro = this.freeBoost > 0;
    this.boosting = nitro || (input.boost && !this.overheated);
    if (nitro) {
      this.speed += this.accelRate * 1.8 * dt;          // free: no heat, and the engine keeps cooling
      this.heat = Math.max(0, this.heat - 40 * dt);
    } else if (this.boosting) {
      this.speed += this.accelRate * 1.8 * dt;
      this.heat = Math.min(this.maxHeat, this.heat + 55 * dt);
      this._coolDelay = 0.5;
    } else {
      this._coolDelay = Math.max(0, (this._coolDelay || 0) - dt);
      if (this._coolDelay === 0) this.heat = Math.max(0, this.heat - 25 * dt);
    }
    // a flat tyre costs top speed until it re-seals
    let flatK = 0;
    if (this.flat) {
      this.flat.t -= dt;
      flatK = this.flat.severity * Math.min(1, this.flat.t / 1.5);   // fades out at the end
      if (this.flat.t <= 0) this.flat = null;
    }
    // boost lets you go past the normal limit; it bleeds back off afterwards.
    // A drift holds you under 88% of it: the price of the nitro it pays out.
    const cap = (this.boosting ? this.maxSpeed * 1.25 : this.maxSpeed) * (1 - 0.3 * flatK) * (this.driftDir ? 0.88 : 1);
    if (this.speed > cap) this.speed = Math.max(cap, Math.min(this.speed, before - this.brakeRate * 0.5 * dt));
    this.speed = Math.max(this.speed, -this.maxSpeed * 0.4);
    // handbrake (Space): a hard stop, whatever the throttle, and never into reverse
    if (input.handbrake) {
      this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - this.brakeRate * 1.1 * dt);
    }

    // ---- steering ----
    // a flat rear tyre drags the car towards that side; you have to counter-steer
    const pull = this.flat && this.flat.side ? this.flat.side * 0.35 * flatK : 0;
    const want = THREE.MathUtils.clamp((input.left ? 1 : 0) - (input.right ? 1 : 0) + pull, -1, 1);
    const rate = want !== 0 && Math.sign(want) === Math.sign(this.steer || want) ? this.steerIn : this.steerOut;
    this.steer += THREE.MathUtils.clamp(want - this.steer, -rate * dt, rate * dt);

    // authority: none when parked, best around 40-60% speed, a little
    // less at the top end so 150 km/h feels heavy instead of twitchy
    const v = Math.abs(this.speed) / this.maxSpeed;
    const authority = THREE.MathUtils.clamp(v * 3, 0, 1) * (1 - 0.35 * Math.max(0, v - 0.5) * 2);
    const dir = this.speed >= 0 ? 1 : -1;            // reversing flips the wheel

    // ---- drift (Q) ----
    // Hold Q and steer at speed and the rear lets go: the body swings round
    // to as much as ~35° off the way the car is travelling, nose into the
    // turn and tail out, and the car slides with it. On a straight road a
    // slide that kept turning would be in the rail in half a second, so in a
    // drift the wheel sets the LINE instead — how fast the car crosses the
    // road (~6 m/s at any speed): into the slide, straight on with the wheel
    // centred, or back the other way counter-steering, which also flattens
    // the angle. Let go cleanly and it pays out nitro (_endDrift); a knock, a
    // rail or slowing right down breaks it.
    const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);   // the player's own wheel, not a flat's pull
    if (!this.driftDir && input.drift && v > 0.3 && steering !== 0 && dir > 0) {
      this.driftDir = steering;
      this.driftTime = 0;
    }
    if (this.driftDir && (!input.drift || v < 0.18)) this._endDrift(!input.drift); // let go: paid; too slow: not
    const drifting = this.driftDir !== 0;
    if (drifting) {
      this.driftTime += dt;
      const into = this.steer * this.driftDir;         // +1 steering into the slide .. -1 counter-steering
      const angle = this.driftDir * (0.42 + 0.2 * into);
      this.slip += (angle - this.slip) * Math.min(1, 7 * dt);
      this.speed -= 1.5 * dt;                          // the tyres scrub a little, nothing like braking
      const reach = Math.min(0.3, 6.5 / Math.max(10, Math.abs(this.speed)));
      this.heading += (this.steer * reach - this.heading) * Math.min(1, 2.5 * dt);
    } else {
      this.slip -= this.slip * Math.min(1, 6 * dt);    // grips again and straightens up
      this.heading += this.steer * this.steerRate * authority * dir * dt;
      // self-aligning: with the wheel centred the car straightens back onto the
      // road line, so a lane change ends pointing forward instead of into a rail
      const align = this.selfAlign * (1 - Math.abs(this.steer)) * Math.min(1, v * 4);
      this.heading -= this.heading * Math.min(1, align * dt);
    }

    // spin from being hit: the tail steps out, then the car catches itself.
    // A hard hit can swing it a bit past the normal steering limit.
    this.heading += this.yawVel * dt;
    this.yawVel *= Math.exp(-3.5 * dt);
    const maxH = this.maxHeading + Math.min(0.35, Math.abs(this.yawVel) * 0.25);
    this.heading = THREE.MathUtils.clamp(this.heading, -maxH, maxH);

    // skids + smoke: a drift, a hard swerve at speed, a spin, a flat
    this.drifting = (drifting && Math.abs(this.slip) > 0.12)
      || (v > 0.45 && Math.abs(this.steer) > 0.75 && Math.abs(this.heading) > 0.18)
      || Math.abs(this.yawVel) > 0.5
      || flatK > 0.2;                  // a flat grinds and smokes

    // ---- integrate ----
    this.lateralVel *= Math.exp(-4 * dt);
    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt + this.lateralVel * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;

    // ---- guardrails: scrape and deflect instead of sticking to the wall ----
    this.wallHit = 0;
    // a car slid sideways is wider across the road: its corners come out
    const halfW = ((this.bounds && this.bounds.halfW) || 0.9) * Math.cos(this.slip)
      + ((this.bounds && this.bounds.halfL) || 2) * Math.abs(Math.sin(this.slip));
    const limit = this.railX - halfW;
    if (Math.abs(this.mesh.position.x) > limit) {
      const side = Math.sign(this.mesh.position.x);
      const into = Math.max(0, side * Math.sin(this.heading) * this.speed + side * this.lateralVel);
      this.mesh.position.x = side * limit;
      this.wallHit = Math.min(1, into / 12);
      // nose bounces off the rail, speed is scrubbed off by how square the hit was
      if (side * this.heading > 0) this.heading *= -0.35;
      if (side * this.lateralVel > 0) this.lateralVel *= -0.3;
      this.speed *= 1 - Math.min(0.25, this.wallHit * 0.3 + 0.4 * dt);
      if (this.wallHit > 0.3) this._endDrift(false);   // slid into the rail: that's the end of it
    }

    // ---- visuals: lean into the corner ----
    // body leans to the outside of the turn (and away from a shove), harder in a drift
    const targetRoll = this.steer * 0.07 * Math.min(1, v * 1.5) + this.slip * 0.08 + this.lateralVel * 0.01;
    this.roll += (targetRoll - this.roll) * Math.min(1, 8 * dt);
    this.mesh.rotation.set(0, this.heading + this.slip, this.roll);
    // in a slide the front wheels point back along the way the car is going: opposite lock
    spinWheels(this.model, this.speed, THREE.MathUtils.clamp(this.steer - this.slip * 1.5, -1, 1), dt);
  }
}
