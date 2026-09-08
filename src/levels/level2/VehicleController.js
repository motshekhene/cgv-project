import * as THREE from 'three';

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
    this.speed = 0;
    this.heading = 0;
    this.maxSpeed = 42;
    this.accelRate = 22;
    this.brakeRate = 40;
    this.dragRate = 8;
    this.steerRate = 1.6;

    // --- boost / heat ---
    this.heat = 0;
    this.maxHeat = 100;
    this.boosting = false;

    // --- health (written here, read by UI/3B later) ---
    this.health = 100;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  update(dt, input) {
    if (input.forward) this.speed += this.accelRate * dt;
    else if (input.backward) this.speed -= this.brakeRate * dt;
    else this.speed -= Math.sign(this.speed) * this.dragRate * dt;

    this.boosting = input.boost && this.heat < this.maxHeat;
    if (this.boosting) {
      this.speed += this.accelRate * 1.8 * dt;
      this.heat = Math.min(this.maxHeat, this.heat + 55 * dt);
    } else {
      this.heat = Math.max(0, this.heat - 25 * dt);
    }

    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed * 0.4, this.maxSpeed);

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / this.maxSpeed, 0.15, 1);
    if (input.left) this.heading += this.steerRate * speedFactor * dt;
    if (input.right) this.heading -= this.steerRate * speedFactor * dt;

    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;

    // temporary road-width clamp until real highway chunks exist
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -10, 10);
  }
}
