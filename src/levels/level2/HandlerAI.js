import * as THREE from 'three';
import { attachModel } from './attachModel.js';

/**
 * HandlerAI — Member 2A
 *
 * Pursuer state machine for Level 2: APPROACH -> HARASS -> TELEGRAPH -> RECOVER.
 *
 * HARASS used to steer straight at the player's position at roughly the
 * player's own speed — a pure-pursuit setup that (at matching speed) settles
 * directly behind/inside the car and can never actually pull level with it.
 * He now runs two independent catch-up terms, one along the player's heading
 * and one across it, so closing a side gap doesn't cost him his forward
 * position the way a single "drive at the target point" vector does. That's
 * what lets him hold a real line beside the player, swap sides, lean in, and
 * then commit a ram from the side he's on instead of ramming from directly
 * behind — matching the pitch ("no more warning shots — he rams you at speed").
 */
const LANE_GAP = 3.4;       // resting lateral distance while harassing
const LEAN_GAP = 1.9;       // how close a "lean" pulls in before easing back out
const BEHIND_GAP = 1.6;     // sits slightly behind the player's shoulder, not level with the door
const MIN_SEPARATION = 2.3; // hard floor — never let a state's target put him inside the player

const LONG_GAIN = 1.8, LONG_MAX = 14;   // longitudinal catch-up (closing a following gap)
const LAT_GAIN = 1.6, LAT_MAX = 9;      // lateral catch-up (pulling level / peeling off)
const LAT_MAX_TELEGRAPH = 13;           // the ram itself is allowed to cut across faster

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

    this.mesh.position.set(0, 0, 18);
    this.heading = 0;
    this.speed = 0;          // forward speed, kept for HUD/audio hooks

    this.state = 'APPROACH';
    this.harassRange = 9;
    this.stateTimer = 0;

    // side harassment
    this.side = Math.random() < 0.5 ? -1 : 1;   // -1 = player's left, 1 = player's right
    this.sideSwapTimer = rand(2.6, 4.2);
    this.leanTimer = rand(1.4, 2.6);
    this.leaning = false;

    // fired once when TELEGRAPH -> RECOVER transition happens, i.e. "attack lands".
    this.onAttackResolved = null;
  }

  /** Swap the placeholder box for a real model. Safe to call after construction. */
  attachModel(assets, path, opts) {
    return attachModel(assets, this.mesh, path, { length: 3.8, ...opts });
  }

  update(dt) {
    const player = this.target.mesh.position;
    const playerHeading = this.target.heading ?? 0;
    const fwd = new THREE.Vector3(Math.sin(playerHeading), 0, Math.cos(playerHeading));
    const right = new THREE.Vector3(Math.cos(playerHeading), 0, -Math.sin(playerHeading));

    const rel = new THREE.Vector3().subVectors(this.mesh.position, player);
    const longOffset = rel.dot(fwd);     // + ahead of the player, - behind
    const latOffset = rel.dot(right);    // + on the player's right, - on the left
    const dist = rel.length();

    this.stateTimer += dt;

    if (this.state === 'APPROACH' && dist < this.harassRange) {
      this.state = 'HARASS';
      this.stateTimer = 0;
    } else if (this.state === 'HARASS' && dist > this.harassRange * 1.8) {
      this.state = 'APPROACH';
      this.stateTimer = 0;
    } else if (this.state === 'HARASS' && this.stateTimer > 3.5) {
      this.state = 'TELEGRAPH';
      this.stateTimer = 0;
    } else if (this.state === 'TELEGRAPH' && this.stateTimer > 0.8) {
      if (this.onAttackResolved) this.onAttackResolved();
      this.state = 'RECOVER';
      this.stateTimer = 0;
      this.side *= -1;   // peel off to the other side than the one he just hit from
    } else if (this.state === 'RECOVER' && this.stateTimer > 1.2) {
      this.state = 'APPROACH';
      this.stateTimer = 0;
    }

    // --- side switching + leaning, only while genuinely harassing ---
    if (this.state === 'HARASS') {
      this.sideSwapTimer -= dt;
      if (this.sideSwapTimer <= 0) {
        this.side *= -1;
        this.sideSwapTimer = rand(2.8, 4.6);
      }
      this.leanTimer -= dt;
      if (this.leanTimer <= 0) {
        this.leaning = !this.leaning;
        this.leanTimer = this.leaning ? rand(0.4, 0.7) : rand(1.6, 3.0);
      }
    } else {
      this.leaning = false;
    }

    // --- desired position relative to the player, by state ---
    let desiredLat, desiredLong, latMax = LAT_MAX;
    if (this.state === 'APPROACH') {
      desiredLat = this.side * LANE_GAP;
      desiredLong = -6;
    } else if (this.state === 'HARASS') {
      desiredLat = this.side * (this.leaning ? LEAN_GAP : LANE_GAP);
      desiredLong = -BEHIND_GAP;
    } else if (this.state === 'TELEGRAPH') {
      desiredLat = this.side * 0.6;   // commits across, almost onto the player's line
      desiredLong = 1.2;
      latMax = LAT_MAX_TELEGRAPH;
    } else { // RECOVER
      desiredLat = this.side * (LANE_GAP * 1.6);
      desiredLong = -4;
    }

    // two independent catch-up terms: closing a side gap no longer eats into
    // the forward speed budget, so the lateral move actually completes
    const longCatch = THREE.MathUtils.clamp(LONG_GAIN * (desiredLong - longOffset), -LONG_MAX, LONG_MAX);
    const latCatch = THREE.MathUtils.clamp(LAT_GAIN * (desiredLat - latOffset), -latMax, latMax);

    const forwardSpeed = this.target.speed + longCatch;
    const velocity = new THREE.Vector3()
      .addScaledVector(fwd, forwardSpeed)
      .addScaledVector(right, latCatch);

    this.mesh.position.addScaledVector(velocity, dt);
    this.speed = velocity.length();

    // face the way he's actually travelling, bounded turn rate so a side/lean
    // swap doesn't snap the model instead of steering into it
    if (this.speed > 0.4) {
      const desiredHeading = Math.atan2(velocity.x, velocity.z);
      let turn = THREE.MathUtils.euclideanModulo(desiredHeading - this.heading + Math.PI, Math.PI * 2) - Math.PI;
      const maxTurn = 3.2 * dt;
      this.heading += THREE.MathUtils.clamp(turn, -maxTurn, maxTurn);
      this.mesh.rotation.y = this.heading;
    }

    // hard floor: never let him end up geometrically inside the player,
    // whatever the target math above asked for (a caught-out swap, a sharp
    // player turn) — TELEGRAPH is exempt, that overlap IS the ram landing
    if (this.state !== 'TELEGRAPH') {
      const flat = new THREE.Vector3(rel.x + velocity.x * dt, 0, rel.z + velocity.z * dt);
      const sep = flat.length();
      if (sep < MIN_SEPARATION) {
        const push = sep > 1e-4 ? flat.normalize() : right.clone();
        this.mesh.position.addScaledVector(push, MIN_SEPARATION - sep);
      }
    }

    return { dist, state: this.state, side: this.side };
  }
}

function rand(a, b) { return a + Math.random() * (b - a); }
