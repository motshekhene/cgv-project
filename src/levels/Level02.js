import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { VehicleController } from './level2/VehicleController.js';
import { HandlerAI } from './level2/HandlerAI.js';
import {
  CARS, HANDLER_MODEL, loadSavedCar, saveCar, createCarPicker,
} from './level2/carSelect.js';
import { createLevel2Hud } from './level2/hud.js';

// The picker opens the first time Level 2 loads, and again when the player
// presses V. A plain restart (R) keeps their car and goes straight back in.
let showPickerNext = true;

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
 * Car choice: CARS lives in level2/carSelect.js. The player's car is picked on
 * a rotating preview, remembered in localStorage, and can be changed with V.
 */
export class Level02 extends Level {
  constructor() {
    super('level02');
    // the shape VehicleController already expects — filled from shared Input each frame
    this._input = { forward: false, backward: false, left: false, right: false, boost: false };

    // update() can be called while init() is still awaiting (on restart), so it
    // waits for this flag rather than touching half-built objects
    this._ready = false;
    this._picking = false;
    this._orbit = 0;
    this._carIndex = 0;
    this._swap = Promise.resolve(); // car swaps run in order, so the last click wins
    this.picker = null;
    this.hud = null;
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x0a0e14);
    scene.fog = new THREE.Fog(0x0a0e14, 60, 220);

    this.root.add(new THREE.HemisphereLight(0x8fb3ff, 0x1a1008, 0.9));
    const sun = new THREE.DirectionalLight(0xffcf9e, 1.1);
    sun.position.set(-40, 60, -20);
    this.root.add(sun);

    // ---- placeholder road: @2B replaces this with real chunks ----
    const roadLength = 4000;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(24, roadLength),
      new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.9 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -roadLength / 2 + 50;
    this.root.add(road);

    // one geometry and one material shared by every stripe, instead of 400 copies
    const stripeGeo = new THREE.PlaneGeometry(0.3, 3);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x6fa8ff });
    for (let z = 30; z > -roadLength + 50; z -= 10) {
      const s = new THREE.Mesh(stripeGeo, stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(0, 0.01, z);
      this.root.add(s);
    }

    const railMat = new THREE.MeshStandardMaterial({ color: 0x2a3138 });
    const railGeo = new THREE.BoxGeometry(0.4, 0.8, roadLength);
    for (const side of [-12, 12]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side, 0.4, -roadLength / 2 + 50);
      this.root.add(rail);
    }

    // ---- 2A's systems, unchanged. They take a parent to add themselves to,
    //      and that parent is now this.root rather than the raw scene. ----
    this.car = new VehicleController(this.root);
    this.handler = new HandlerAI(this.root, this.car);
    this.handler.onAttackResolved = () => this.car.takeDamage(12);

    this._camOffset = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();

    // extra actions on the shared Input (no edit to Input.js needed)
    this.input.bindings.confirm ??= ['enter'];
    this.input.bindings.changeCar ??= ['v'];

    // ---- models. Files live in public/assets/level2/ (lowercase, no spaces).
    //      Preload everything so switching cars in the picker is instant; a
    //      file that fails to load just leaves the placeholder box. ----
    await Promise.allSettled([HANDLER_MODEL, ...CARS.map((c) => c.path)].map((p) => assets.model(p)));
    this._carIndex = loadSavedCar();
    await Promise.all([
      this._showCar(this._carIndex),
      this.handler.attachModel(assets, HANDLER_MODEL, { yaw: 0 }),
    ]);

    this.hud = createLevel2Hud();
    if (showPickerNext) {
      showPickerNext = false;
      this._openPicker();
    }
    this._ready = true;
  }

  /* ---------------- car picker ---------------- */

  _showCar(index) {
    const car = CARS[index];
    this._swap = this._swap.then(() => this.car.attachModel(this.assets, car.path, { yaw: 0 }));
    return this._swap;
  }

  _openPicker() {
    this._picking = true;
    this._orbit = 0;
    this.car.speed = 0;
    if (this.hud) this.hud.setVisible(false);
    this.picker = createCarPicker({
      startIndex: this._carIndex,
      onChange: (i) => this._choose(i),
      onConfirm: () => this._confirm(),
    });
  }

  _choose(index) {
    const n = CARS.length;
    this._carIndex = ((index % n) + n) % n;
    if (this.picker) this.picker.setIndex(this._carIndex);
    this._showCar(this._carIndex);
  }

  _confirm() {
    saveCar(this._carIndex);
    if (this.picker) this.picker.destroy();
    this.picker = null;
    this._picking = false;
    if (this.hud) this.hud.setVisible(true);
  }

  _updatePicker(dt) {
    if (this.input.pressed('left')) this._choose(this._carIndex - 1);
    if (this.input.pressed('right')) this._choose(this._carIndex + 1);
    if (this.input.pressed('confirm')) this._confirm();

    // slow orbit around the parked car
    this._orbit += dt * 0.7;
    const r = 6.5;
    const p = this.car.mesh.position;
    const cam = this.game.camera;
    cam.position.set(p.x + Math.sin(this._orbit) * r, 2.4, p.z + Math.cos(this._orbit) * r);
    cam.lookAt(p.x, 0.8, p.z);
  }

  /* ---------------- frame ---------------- */

  update(dt, state) {
    if (!this._ready) return;

    if (this._picking) {
      this._updatePicker(dt);
      return;
    }

    // V: back to the picker (rebuilds the level so the car is parked and ready)
    if (this.input.pressed('changeCar')) {
      showPickerNext = true;
      this.game.restart();
      return;
    }

    // shared Input → the object VehicleController already expects
    const i = this._input;
    i.forward  = this.input.isDown('forward');
    i.backward = this.input.isDown('back');
    i.left     = this.input.isDown('left');
    i.right    = this.input.isDown('right');
    i.boost    = this.input.isDown('boost');

    this.car.update(dt, i);
    const { dist, state: handlerState } = this.handler.update(dt);

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
    state.normalizedSpeed = Math.min(1, Math.abs(this.car.speed) / this.car.maxSpeed);

    this.hud.update({
      speed: this.car.speed, dist, heat: this.car.heat,
      health: this.car.health, handlerState,
    });

    if (this.car.health <= 0) this.finished = true;
  }

  teardown() {
    if (this.picker) this.picker.destroy();
    this.picker = null;
    if (this.hud) this.hud.destroy();
    this.hud = null;
    super.teardown();
  }
}
