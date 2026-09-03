import * as THREE from 'three';

// Tunable telegraph timing — pulled out so difficulty passes (step 7) don't
// mean hunting through the FSM body for magic numbers.
const HARASS_DURATION = 3.5;      // how long HANDLER stalks before committing
const TELEGRAPH_DURATION = 0.8;   // wind-up window the player has to dodge
const RECOVER_DURATION = 1.2;     // vulnerable/cooldown window after the ram
const RAM_HIT_WIDTH = 1.7;        // lateral gap (world units) that still counts as a hit
const FLASH_HZ = 9;               // headlight strobe rate during telegraph

/**
 * HandlerAI — Member 2A
 *
 * Pursuer state machine for Level 2: APPROACH -> HARASS -> TELEGRAPH -> RECOVER.
 * The ram is now a real, dodgeable attack: TELEGRAPH gives a visible cue
 * (strobing headlights + the Handler lunging to line up on the player's
 * current lane) and only actually lands if the player is still in that lane
 * when the wind-up ends. Steer away in time and onAttackMissed fires instead.
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
    this.bodyMat = body.material;

    // --- headlights: dim running lights normally, strobe bright on TELEGRAPH ---
    this.headlights = [];
    this.headlightLights = [];
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe8b0, emissiveIntensity: 0.15 })
      );
      lamp.position.set(side * 0.6, 0.5, 1.85); // local +z = front, matches heading convention below
      this.mesh.add(lamp);
      this.headlights.push(lamp);

      const light = new THREE.PointLight(0xffcf8a, 0, 6);
      light.position.copy(lamp.position);
      this.mesh.add(light);
      this.headlightLights.push(light);
    }

    scene.add(this.mesh);
    this.mesh.position.set(0, 0, 18);

    this.state = 'APPROACH';
    this.speed = 0;
    this.maxSpeed = 38;
    this.harassRange = 9;
    this.stateTimer = 0;
    this._telegraphStartX = 0;

    // fired when a TELEGRAPH resolves and the player was still in the lane — real hit.
    this.onAttackResolved = null;
    // fired when a TELEGRAPH resolves and the player dodged out of the lane in time.
    this.onAttackMissed = null;

    // event log for HUD feedback ('hit' | 'miss' | null), consumed by main.js
    this.lastEvent = null;
  }

  update(dt) {
    const toPlayer = new THREE.Vector3().subVectors(this.target.mesh.position, this.mesh.position);
    const dist = toPlayer.length();
    this.stateTimer += dt;
    this.lastEvent = null;

    if (this.state === 'APPROACH' && dist < this.harassRange) {
      this.state = 'HARASS';
      this.stateTimer = 0;
    } else if (this.state === 'HARASS' && dist > this.harassRange * 1.6) {
      this.state = 'APPROACH';
      this.stateTimer = 0;
    } else if (this.state === 'HARASS' && this.stateTimer > HARASS_DURATION) {
      this.state = 'TELEGRAPH';
      this.stateTimer = 0;
      this._telegraphStartX = this.mesh.position.x;
    } else if (this.state === 'TELEGRAPH' && this.stateTimer > TELEGRAPH_DURATION) {
      const lateralGap = Math.abs(this.mesh.position.x - this.target.mesh.position.x);
      if (lateralGap < RAM_HIT_WIDTH) {
        if (this.onAttackResolved) this.onAttackResolved();
        this.lastEvent = 'hit';
      } else {
        if (this.onAttackMissed) this.onAttackMissed();
        this.lastEvent = 'miss';
      }
      this.state = 'RECOVER';
      this.stateTimer = 0;
    } else if (this.state === 'RECOVER' && this.stateTimer > RECOVER_DURATION) {
      this.state = 'APPROACH';
      this.stateTimer = 0;
    }

    const dir = toPlayer.clone().setY(0).normalize();
    const targetHeading = Math.atan2(dir.x, dir.z);

    if (this.state === 'APPROACH') {
      this.speed = THREE.MathUtils.lerp(this.speed, this.maxSpeed, dt * 1.5);
    } else if (this.state === 'HARASS') {
      this.speed = THREE.MathUtils.lerp(this.speed, this.target.speed * 0.98, dt * 2);
    } else if (this.state === 'TELEGRAPH') {
      this.speed = THREE.MathUtils.lerp(this.speed, this.target.speed * 0.7, dt * 3);
    } else if (this.state === 'RECOVER') {
      this.speed = THREE.MathUtils.lerp(this.speed, this.target.speed * 0.85, dt * 2);
    }

    this.mesh.position.x += dir.x * this.speed * dt;
    this.mesh.position.z += dir.z * this.speed * dt;

    // --- the lunge: during TELEGRAPH, snap onto the player's exact lane over
    // the wind-up window, overriding the general homing drift above so the
    // "he's lining up on you" read is unmistakable rather than gradual.
    let telegraphT = 0;
    if (this.state === 'TELEGRAPH') {
      telegraphT = Math.min(1, this.stateTimer / TELEGRAPH_DURATION);
      const eased = telegraphT * telegraphT * (3 - 2 * telegraphT); // smoothstep
      const jitter = Math.sin(this.stateTimer * 40) * 0.04 * (1 - telegraphT); // engine-shudder, settles as he locks on
      this.mesh.position.x = THREE.MathUtils.lerp(this._telegraphStartX, this.target.mesh.position.x, eased) + jitter;
    }

    this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetHeading, dt * 3);

    // --- headlight strobe: fast on/off flicker only while telegraphing ---
    const flashOn = this.state === 'TELEGRAPH';
    const strobe = flashOn ? (Math.sin(this.stateTimer * FLASH_HZ * Math.PI * 2) > 0 ? 1 : 0) : 0;
    for (let i = 0; i < this.headlights.length; i++) {
      this.headlights[i].material.emissiveIntensity = flashOn ? 0.15 + strobe * 3.5 : 0.15;
      this.headlightLights[i].intensity = flashOn ? strobe * 4 : 0;
    }
    this.bodyMat.emissive.setHex(flashOn && strobe ? 0x552200 : 0x220000);

    return { dist, state: this.state, telegraphT };
  }
}
