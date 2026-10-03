import * as THREE from 'three';
import { attachModel as attachVehicleModel } from './attachModel.js';

/**
 * VehicleController — Member 2A
 *
 * Simple arcade-style car controller (no full physics engine yet — that
 * lands once the team locks Rapier/cannon-es for real, per Day 1-3 plan).
 * Owns: acceleration, braking, steering, boost/heat.
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
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  /**
   * Sideways shove + speed loss, e.g. from the Handler's ram.
   * side: -1 pushes towards -x, +1 towards +x.
   */
  bump(side, strength = 1, speedLoss = 0.15) {
    this.lateralVel += side * 9 * strength;
    this.speed *= 1 - speedLoss;
    this.heading += side * 0.12 * strength;   // nose kicked sideways too
  }

  attachModel(assets, path, options = {}) {
    return attachVehicleModel(assets, this.mesh, path, { length: 3.6, ...options });
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
    this.boosting = input.boost && !this.overheated;
    if (this.boosting) {
      this.speed += this.accelRate * 1.8 * dt;
      this.heat = Math.min(this.maxHeat, this.heat + 55 * dt);
      this._coolDelay = 0.5;
    } else {
      this._coolDelay = Math.max(0, (this._coolDelay || 0) - dt);
      if (this._coolDelay === 0) this.heat = Math.max(0, this.heat - 25 * dt);
    }
    // boost lets you go past the normal limit; it bleeds back off afterwards
    const cap = this.boosting ? this.maxSpeed * 1.25 : this.maxSpeed;
    if (this.speed > cap) this.speed = Math.max(cap, Math.min(this.speed, before - this.brakeRate * 0.5 * dt));
    this.speed = Math.max(this.speed, -this.maxSpeed * 0.4);

    // ---- steering ----
    const want = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const rate = want !== 0 && Math.sign(want) === Math.sign(this.steer || want) ? this.steerIn : this.steerOut;
    this.steer += THREE.MathUtils.clamp(want - this.steer, -rate * dt, rate * dt);

    // authority: none when parked, best around 40-60% speed, a little
    // less at the top end so 150 km/h feels heavy instead of twitchy
    const v = Math.abs(this.speed) / this.maxSpeed;
    const authority = THREE.MathUtils.clamp(v * 3, 0, 1) * (1 - 0.35 * Math.max(0, v - 0.5) * 2);
    const dir = this.speed >= 0 ? 1 : -1;            // reversing flips the wheel
    this.heading += this.steer * this.steerRate * authority * dir * dt;

    // self-aligning: with the wheel centred the car straightens back onto the
    // road line, so a lane change ends pointing forward instead of into a rail
    const align = this.selfAlign * (1 - Math.abs(this.steer)) * Math.min(1, v * 4);
    this.heading -= this.heading * Math.min(1, align * dt);

    // spin from being hit: the tail steps out, then the car catches itself.
    // A hard hit can swing it a bit past the normal steering limit.
    this.heading += this.yawVel * dt;
    this.yawVel *= Math.exp(-3.5 * dt);
    const maxH = this.maxHeading + Math.min(0.35, Math.abs(this.yawVel) * 0.25);
    this.heading = THREE.MathUtils.clamp(this.heading, -maxH, maxH);

    // a hard swerve at speed counts as a drift (skids + smoke)
    this.drifting = (v > 0.45 && Math.abs(this.steer) > 0.75 && Math.abs(this.heading) > 0.18)
      || Math.abs(this.yawVel) > 0.5;

    // ---- integrate ----
    this.lateralVel *= Math.exp(-4 * dt);
    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt + this.lateralVel * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;

    // ---- guardrails: scrape and deflect instead of sticking to the wall ----
    this.wallHit = 0;
    const halfW = (this.bounds && this.bounds.halfW) || 0.9;
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
    }

    // ---- visuals: lean into the corner ----
    // body leans to the outside of the turn (and away from a shove)
    const targetRoll = this.steer * 0.07 * Math.min(1, v * 1.5) + this.lateralVel * 0.01;
    this.roll += (targetRoll - this.roll) * Math.min(1, 8 * dt);
    this.mesh.rotation.set(0, this.heading, this.roll);
  }
}
