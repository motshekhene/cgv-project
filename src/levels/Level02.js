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

    // ---- secondary cameras — @2B ----

    // rearview mirror: top-centre of screen, shows what's behind the car
    this._rearview = new THREE.PerspectiveCamera(50, 2.5, 0.5, 300);
    this._rearview.far = 300;
    this.game.addSecondaryCamera('rearview', this._rearview, {
      x: 0.35, y: 0.88, w: 0.30, h: 0.11,
    });

    // minimap: bottom-right corner, orthographic top-down view
    const mapRange = 50;
    this._minimap = new THREE.OrthographicCamera(
      -mapRange, mapRange, mapRange, -mapRange, 1, 500
    );
    this._minimap.up.set(0, 0, -1); // forward = behind the car on screen
    this.game.addSecondaryCamera('minimap', this._minimap, {
      x: 0.76, y: 0.02, w: 0.22, h: 0.28,
    });
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

    // rearview mirror — sits behind the car, looking forward
    const rvOffset = 14;
    this._rearview.position.set(
      this.car.mesh.position.x - Math.sin(this.car.heading) * rvOffset,
      this.car.mesh.position.y + 3.5,
      this.car.mesh.position.z - Math.cos(this.car.heading) * rvOffset,
    );
    this._rearview.lookAt(
      this.car.mesh.position.x + Math.sin(this.car.heading) * 30,
      this.car.mesh.position.y + 1,
      this.car.mesh.position.z + Math.cos(this.car.heading) * 30,
    );

    // minimap — directly above the car, looking down
    this._minimap.position.set(this.car.mesh.position.x, 120, this.car.mesh.position.z);
    this._minimap.lookAt(this.car.mesh.position);

    // publish to shared state so 3B's HUD can read it without touching this file
    state.health = this.car.health;
    state.boostHeat = this.car.heat;
    state.distance = dist;
    state.handlerState = handlerState;   // add this field to GameState.reset()

    if (this.car.health <= 0) this.finished = true;
  }

  teardown() {
    this.game.removeSecondaryCamera('rearview');
    this.game.removeSecondaryCamera('minimap');
    if (this.road) this.road.dispose();
    super.teardown();
  }
}