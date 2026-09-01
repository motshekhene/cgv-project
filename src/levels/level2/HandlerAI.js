import * as THREE from 'three';

/**
 * HandlerAI — Member 2A
 *
 * Pursuer state machine for Level 2: APPROACH -> HARASS -> TELEGRAPH -> RECOVER.
 * Alpha scope: APPROACH/HARASS working end to end, TELEGRAPH/RECOVER as the
 * hook the real ram attack (with damage) gets wired into next.
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

    this.mesh.position.set(0, 0, 18);

    this.state = 'APPROACH';
    this.speed = 0;
    this.maxSpeed = 38;
    this.harassRange = 9;
    this.stateTimer = 0;

    // fired once when TELEGRAPH -> RECOVER transition happens, i.e. "attack lands".
    // Level2 wires this to VehicleController.takeDamage() once the real attack exists.
    this.onAttackResolved = null;
  }

  update(dt) {
    const toPlayer = new THREE.Vector3().subVectors(this.target.mesh.position, this.mesh.position);
    const dist = toPlayer.length();
    this.stateTimer += dt;

    if (this.state === 'APPROACH' && dist < this.harassRange) {
      this.state = 'HARASS';
      this.stateTimer = 0;
    } else if (this.state === 'HARASS' && dist > this.harassRange * 1.6) {
      this.state = 'APPROACH';
      this.stateTimer = 0;
    } else if (this.state === 'HARASS' && this.stateTimer > 3.5) {
      this.state = 'TELEGRAPH';
      this.stateTimer = 0;
    } else if (this.state === 'TELEGRAPH' && this.stateTimer > 0.8) {
      if (this.onAttackResolved) this.onAttackResolved();
      this.state = 'RECOVER';
      this.stateTimer = 0;
    } else if (this.state === 'RECOVER' && this.stateTimer > 1.2) {
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
    this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetHeading, dt * 3);

    return { dist, state: this.state };
  }
}
