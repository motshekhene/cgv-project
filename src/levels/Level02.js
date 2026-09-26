import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { VehicleController } from './level2/VehicleController.js';
import { HandlerAI } from './level2/HandlerAI.js';
import { RoadSystem } from './level2/RoadSystem.js';
import { CarLights, PoliceLights } from './level2/carLights.js';
import { Traffic } from './level2/traffic.js';
import { Skids, Smoke } from './level2/skids.js';
import { CARS, HANDLER_MODEL, createCarPicker, loadSavedCar, saveCar } from './level2/carSelect.js';
import { createLevel2Hud } from './level2/hud.js';
import { createGameOverScreen } from './level2/gameOver.js';

/**
 * Level 02 — Redline.
 *
 * Integrates 2A's vehicle gameplay (car models, traffic, lights, skids,
 * smoke, HUD, car picker, game over) with 2B's infinite textured road
 * and secondary cameras (rearview mirror + minimap).
 *
 * What each member contributed:
 *   2A — VehicleController, HandlerAI, attachModel, carLights, traffic,
 *        skids, smoke, carSelect, hud, gameOver
 *   2B — RoadSystem, secondary camera support in Game.js, rearview + minimap
 */
export class Level02 extends Level {
  constructor() {
    super('level02');
    // the shape VehicleController already expects — filled from shared Input each frame
    this._input = { forward: false, backward: false, left: false, right: false, boost: false };
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x0a0e14);
    scene.fog = new THREE.Fog(0x0a0e14, 60, 220);

    this.root.add(new THREE.HemisphereLight(0x8fb3ff, 0x1a1008, 0.9));
    const sun = new THREE.DirectionalLight(0xffcf9e, 1.1);
    sun.position.set(-40, 60, -20);
    this.root.add(sun);

    // ---- infinite textured road — @2B ----
    this.road = new RoadSystem(this.root);

    // ---- 2A's vehicle + handler ----
    this.car = new VehicleController(this.root);
    this.handler = new HandlerAI(this.root, this.car);
    this.handler.onAttackResolved = () => this.car.takeDamage(12);

    // ---- 2A's visual systems ----
    this.carLights = new CarLights(this.car.mesh);
    this.policeLights = new PoliceLights(this.handler.mesh);
    this.skids = new Skids(this.root);
    this.smoke = new Smoke(this.root);
    this.traffic = new Traffic(this.root, assets);

    // ---- chase camera helpers ----
    this._camOffset = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this.shake = 0;

    // ---- game state ----
    this._hud = null;
    this._picker = null;
    this._gameOverScreen = null;
    this._carIndex = 0;
    this._selectingCar = false;
    this._gameOver = false;
    this._time = 0;
    this._topSpeed = 0;
    this._modelSwap = Promise.resolve();

    // ---- secondary cameras — @2B ----
    this._rearview = new THREE.PerspectiveCamera(50, 2.5, 0.5, 300);
    this._rearview.far = 300;
    this.game.addSecondaryCamera('rearview', this._rearview, {
      x: 0.02, y: 0.02, w: 0.25, h: 0.18,
    });

    const mapRange = 50;
    this._minimap = new THREE.OrthographicCamera(
      -mapRange, mapRange, mapRange, -mapRange, 1, 500
    );
    this._minimap.up.set(0, 0, -1);
    this.game.addSecondaryCamera('minimap', this._minimap, {
      x: 0.73, y: 0.02, w: 0.25, h: 0.25,
    });

    // ---- load models ----
    await Promise.allSettled(
      [HANDLER_MODEL, ...CARS.map((c) => c.path)].map((p) => assets.model(p))
    );

    this._carIndex = loadSavedCar();
    await this._selectCar(this._carIndex);
    const handlerModel = await this.handler.attachModel(assets, HANDLER_MODEL);
    if (handlerModel) this.policeLights.fit(handlerModel.userData.bounds);

    await this.traffic.init(this.car.mesh.position.z);
    this._hud = createLevel2Hud();
    this._openCarPicker();
  }

  /* ======================== car picker ======================== */

  _selectCar(index) {
    this._carIndex = (index + CARS.length) % CARS.length;
    this._picker?.setIndex(this._carIndex);
    const selected = CARS[this._carIndex];
    this._modelSwap = this._modelSwap.then(async () => {
      const model = await this.car.attachModel(this.assets, selected.path);
      if (!model) return;
      const bounds = model.userData.bounds;
      this.carLights.fit(bounds);
      this.skids.setDims(bounds);
      this.car.bounds = {
        halfW: (bounds.max.x - bounds.min.x) * 0.45,
        halfL: (bounds.max.z - bounds.min.z) * 0.46,
      };
    });
    return this._modelSwap;
  }

  _openCarPicker() {
    if (this._picker) return;
    this._selectingCar = true;
    this._orbit = 0;
    this.car.speed = 0;
    Object.keys(this._input).forEach((k) => { this._input[k] = false; });
    this._hud?.setVisible(false);
    this._picker = createCarPicker({
      startIndex: this._carIndex,
      onChange: (i) => this._selectCar(i),
      onConfirm: () => this._confirmCar(),
    });
  }

  async _confirmCar() {
    if (!this._selectingCar || this._confirmingCar) return;
    this._confirmingCar = true;
    await this._modelSwap;
    saveCar(this._carIndex);
    this._picker?.destroy();
    this._picker = null;
    this._selectingCar = false;
    this._confirmingCar = false;
    Object.keys(this._input).forEach((k) => { this._input[k] = false; });
    this._hud?.setVisible(true);
  }

  /* ======================== per frame ======================== */

  update(dt, state) {
    // car picker orbit camera
    if (this._selectingCar) {
      this._updateCarPicker(dt);
      return;
    }

    // game over — freeze gameplay
    if (this._gameOver) return;

    // shared Input → the object VehicleController already expects
    const i = this._input;
    i.forward  = this.input.isDown('forward');
    i.backward = this.input.isDown('back');
    i.left     = this.input.isDown('left');
    i.right    = this.input.isDown('right');
    i.boost    = this.input.isDown('boost');

    // open car picker
    if (this.input.pressed('changeCar')) {
      this._openCarPicker();
      return;
    }

    const previousHeading = this.car.heading;
    this.car.update(dt, i);
    const { dist, state: handlerState } = this.handler.update(dt);

    // skid detection
    const headingRate = dt > 0 ? (this.car.heading - previousHeading) / dt : 0;
    const skidding =
      (Math.abs(this.car.speed) > 16 && Math.abs(this.car.speed * headingRate) > 26)
      || (i.backward && this.car.speed > 14);

    this.skids.update(dt, this.car, skidding);
    this.smoke.update(dt, this.skids.wheels(this.car), skidding);

    this.carLights.update(dt, { braking: i.backward && this.car.speed > 1 });
    this.policeLights.update(dt, handlerState);

    for (const hit of this.traffic.update(dt, this.car)) {
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.35 + hit.impact * 0.9);
    }

    this.road.update(this.car.mesh.position);

    // rearview mirror — behind the car, looking forward
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

    // chase camera with shake
    const cam = this.game.camera;
    this._camOffset.set(
      Math.sin(this.car.heading) * -8, 4.2, Math.cos(this.car.heading) * -8
    );
    const desired = this.car.mesh.position.clone().add(this._camOffset);
    cam.position.lerp(desired, 0.12);
    this._lookAt.copy(this.car.mesh.position);
    this._lookAt.y += 1;
    if (this.shake > 0.01) {
      this._lookAt.x += (Math.random() - 0.5) * this.shake;
      this._lookAt.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-6 * dt);
    }
    cam.lookAt(this._lookAt);

    // HUD
    this._time += dt;
    this._topSpeed = Math.max(this._topSpeed, Math.abs(this.car.speed));
    this._hud?.update({
      speed: this.car.speed,
      dist,
      heat: this.car.heat,
      health: this.car.health,
      handlerState,
    });

    // publish to shared state so 3B's HUD can read it
    state.health = this.car.health;
    state.boostHeat = this.car.heat;
    state.distance = dist;
    state.handlerState = handlerState;

    // game over
    if (this.car.health <= 0 && !this._gameOver) {
      this._gameOver = true;
      this._showGameOver();
    }
  }

  /* ======================== car picker camera ======================== */

  _updateCarPicker(dt) {
    if (this.input.pressed('left')) this._selectCar(this._carIndex - 1);
    if (this.input.pressed('right')) this._selectCar(this._carIndex + 1);
    if (this.input.pressed('jump') || this.input.pressed('forward')) this._confirmCar();

    this._orbit += dt * 0.7;
    const radius = 6.5;
    const position = this.car.mesh.position;
    const cam = this.game.camera;
    cam.position.set(
      position.x + Math.sin(this._orbit) * radius,
      2.4,
      position.z + Math.cos(this._orbit) * radius,
    );
    cam.lookAt(position.x, 0.8, position.z);
  }

  /* ======================== game over ======================== */

  _showGameOver() {
    const dist = this.state.distance;
    const time = this._time;
    const topSpeedKmh = this._topSpeed * 3.6;
    this._gameOverScreen = createGameOverScreen({
      health: 0,
      topSpeedKmh,
      distance: dist,
      time,
      onRestart: () => {
        this._gameOverScreen?.destroy();
        this._gameOverScreen = null;
        this.game.restart();
      },
      onContinue: () => {
        this._gameOverScreen?.destroy();
        this._gameOverScreen = null;
        this._openCarPicker();
      },
      onQuit: () => {
        this._gameOverScreen?.destroy();
        this._gameOverScreen = null;
        this.game.setLevel('level01');
      },
    });
  }

  /* ======================== cleanup ======================== */

  teardown() {
    this.game.removeSecondaryCamera('rearview');
    this.game.removeSecondaryCamera('minimap');
    this._hud?.destroy();
    this._picker?.destroy();
    this._gameOverScreen?.destroy();
    if (this.road) this.road.dispose();
    super.teardown();
  }
}
