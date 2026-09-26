import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { VehicleController } from './level2/VehicleController.js';
import { HandlerAI } from './level2/HandlerAI.js';
import { RoadSystem } from './level2/RoadSystem.js';

/**
 * Level 02 — Redline.
 *
 * @2A: your VehicleController and HandlerAI are unchanged — this file just
 * wraps them so level 02 runs inside the shared engine instead of its own page.
 * What moved out of your main.js and why:
 *
 *   renderer, camera, resize handler   → Game.js owns these now (game.camera)
 *   requestAnimationFrame loop         → Game calls update(dt) for you
 *   THREE.Clock                        → deprecated in three 0.185, Game does timing
 *   window.addEventListener('keydown') → the shared Input, mapped below
 *   HUD element lookups                → written into `state` for 3B's HUD to read
 *   scene.add(...)                     → this.root.add(...) so teardown can clean up
 *
 * Everything else is your code, untouched.
 */
export class Level02 extends Level {
  constructor() {
    super('level02');
    // the shape VehicleController already expects — filled from shared Input each frame
    this._input = { forward: false, backward: false, left: false, right: false, boost: false };
  }

  init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x0a0e14);
    scene.fog = new THREE.Fog(0x0a0e14, 60, 220);

    this.root.add(new THREE.HemisphereLight(0x8fb3ff, 0x1a1008, 0.9));
    const sun = new THREE.DirectionalLight(0xffcf9e, 1.1);
    sun.position.set(-40, 60, -20);
    this.root.add(sun);

    // ---- infinite textured road — @2B ----
    this.road = new RoadSystem(this.root);

    // ---- 2A's systems, unchanged. They take a parent to add themselves to,
    //      and that parent is now this.root rather than the raw scene. ----
    this.car = new VehicleController(this.root);
    this.handler = new HandlerAI(this.root, this.car);
    this.handler.onAttackResolved = () => this.car.takeDamage(12);

    this._camOffset = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
  }

  update(dt, state) {
    // shared Input → the object VehicleController already expects
    const i = this._input;
    i.forward  = this.input.isDown('forward');
    i.backward = this.input.isDown('back');
    i.left     = this.input.isDown('left');
    i.right    = this.input.isDown('right');
    i.boost    = this.input.isDown('boost');

    this.car.update(dt, i);
    const { dist, state: handlerState } = this.handler.update(dt);

    this.road.update(this.car.mesh.position);

    // chase camera — same maths as before, using the shared camera
    const cam = this.game.camera;
    this._camOffset.set(
      Math.sin(this.car.heading) * -8, 4.2, Math.cos(this.car.heading) * -8
    );
    const desired = this.car.mesh.position.clone().add(this._camOffset);
    cam.position.lerp(desired, 0.12);
    this._lookAt.copy(this.car.mesh.position);
    this._lookAt.y += 1;
    cam.lookAt(this._lookAt);

    // publish to shared state so 3B's HUD can read it without touching this file
    state.health = this.car.health;
    state.boostHeat = this.car.heat;
    state.distance = dist;
    state.handlerState = handlerState;   // add this field to GameState.reset()

    if (this.car.health <= 0) this.finished = true;
  }
}