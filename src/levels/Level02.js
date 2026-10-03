import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { VehicleController } from './level2/VehicleController.js';
import { HandlerAI } from './level2/HandlerAI.js';
import { HandlerWeapons } from './level2/HandlerWeapons.js';
import { RoadSystem } from './level2/RoadSystem.js';
import { CarLights, PoliceLights } from './level2/carLights.js';
import { Traffic } from './level2/traffic.js';
import { Skids, Smoke } from './level2/skids.js';
import { CARS, HANDLER_MODEL, createCarPicker, loadSavedCar, saveCar, loadSavedPaint, savePaint } from './level2/carSelect.js';
import { PAINTS, applyPaint, detectPaint } from './level2/paint.js';
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
    // rails sit just outside the road edge — keep both cars inside them
    const railX = this.road.roadWidth / 2 - 0.3;
    this.car.railX = railX;
    this.handler.railX = railX;

    // the Handler's hits: a ram that connects hurts and shakes, a scrape
    // alongside nicks you, a dodged ram is called out on the HUD
    this.handler.onAttackResolved = (hit) => {
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.5 + hit.impact * 0.8);
      this._flash(`${hit.label}  -${hit.damage}`, '#ff5555');
    };
    this.handler.onContact = (hit) => {
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, hit.impact);
    };
    this.handler.onDodge = (move, label) => this._flash(label, '#7dffb0');

    // tyre shots, spike-strip drones, kamikaze drones
    this.weapons = new HandlerWeapons(this.root, assets);
    this.handler.weapons = this.weapons;
    this.weapons.onHit = (hit) => {
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.4 + hit.impact * 0.8);
      const extra = hit.kind === 'drone' ? '' : '  · TYRE DAMAGED';
      this._flash(`${hit.label}  -${hit.damage}${extra}`, '#ff5555');
    };
    this.weapons.onWarn = (text) => this._flash(text, '#ffb020');
    this.weapons.onMiss = (text) => this._flash(text, '#7dffb0');

    // ---- 2A's visual systems ----
    this.carLights = new CarLights(this.car.mesh);
    this.policeLights = new PoliceLights(this.handler.mesh);
    this.skids = new Skids(this.root);
    this.smoke = new Smoke(this.root);
    this.traffic = new Traffic(this.root, assets);
    this.handler.traffic = this.traffic;          // so he steers round it

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
    this._paintIndex = loadSavedPaint();
    this._paintInfo = new Map();                  // detected factory colour per model file
    await this._selectCar(this._carIndex);
    const handlerModel = await this.handler.attachModel(assets, HANDLER_MODEL);
    if (handlerModel) this.policeLights.fit(handlerModel.userData.bounds);

    await this.traffic.init(this.car.mesh.position.z);
    await this.weapons.init();
    this._hud = createLevel2Hud();
    this._openCarPicker();
  }

  /** Big centre-screen callout ("DODGED", "RAMMED -14"), fades by itself. */
  _flash(text, color) {
    if (!this._flashEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;top:28%;transform:translate(-50%,-50%);'
        + 'font:800 42px system-ui,sans-serif;letter-spacing:4px;pointer-events:none;'
        + 'text-shadow:0 0 18px currentColor;transition:opacity .5s,transform .5s;opacity:0;z-index:20';
      document.body.appendChild(el);
      this._flashEl = el;
    }
    const el = this._flashEl;
    el.textContent = text;
    el.style.color = color;
    el.style.transition = 'none';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.15)';
    void el.offsetWidth;
    el.style.transition = 'opacity .6s ease .5s, transform .6s ease';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%,-50%) scale(1)';
  }

  /* ======================== car picker ======================== */

  _selectCar(index) {
    this._carIndex = (index + CARS.length) % CARS.length;
    this._picker?.setIndex(this._carIndex);
    const selected = CARS[this._carIndex];
    this._modelSwap = this._modelSwap.then(async () => {
      const model = await this.car.attachModel(this.assets, selected.path, { length: selected.length });
      this.car.applyStats(selected.stats);
      if (!model) return;
      this._carModel = model;
      if (!this._paintInfo.has(selected.path)) this._paintInfo.set(selected.path, detectPaint(model));
      this._repaint();
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

  _setPaint(index) {
    this._paintIndex = (index + PAINTS.length) % PAINTS.length;
    this._picker?.setPaint(this._paintIndex);
    this._repaint();
  }

  _repaint() {
    if (!this._carModel) return;
    const info = this._paintInfo.get(CARS[this._carIndex].path);
    applyPaint(this._carModel, PAINTS[this._paintIndex].color, info);
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
      startPaint: this._paintIndex,
      onChange: (i) => this._selectCar(i),
      onPaint: (i) => this._setPaint(i),
      onConfirm: () => this._confirmCar(),
    });
  }

  async _confirmCar() {
    if (!this._selectingCar || this._confirmingCar) return;
    this._confirmingCar = true;
    await this._modelSwap;
    saveCar(this._carIndex);
    savePaint(this._paintIndex);
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
    this.weapons.update(dt, this.car, this.handler.mesh);

    // skid detection
    const headingRate = dt > 0 ? (this.car.heading - previousHeading) / dt : 0;
    const skidding = this.car.drifting
      || (Math.abs(this.car.speed) > 16 && Math.abs(this.car.speed * headingRate) > 26)
      || (i.backward && this.car.speed > 14)
      || this.car.wallHit > 0;

    // scraping a guardrail: shake, and a real hit if you went in square
    if (this.car.wallHit > 0) {
      this.shake = Math.max(this.shake, 0.15 + this.car.wallHit * 0.6);
      if (this.car.wallHit > 0.35 && this._wallCooldown <= 0) {
        this.car.takeDamage(Math.round(3 + this.car.wallHit * 6));
        this._wallCooldown = 0.6;
      }
    }
    this._wallCooldown = Math.max(0, (this._wallCooldown || 0) - dt);

    this.skids.update(dt, this.car, skidding);
    this.smoke.update(dt, this.skids.wheels(this.car), skidding);

    this.carLights.update(dt, { braking: i.backward && this.car.speed > 1 });
    this.policeLights.update(dt, handlerState);

    this.traffic.collideBody(this.handler);       // he can barge traffic, never drive inside it
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
      handlerState: this.handler.label,
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
    if (this.input.pressed('ability')) this._setPaint(this._paintIndex - 1);    // Q
    if (this.input.pressed('interact')) this._setPaint(this._paintIndex + 1);   // E
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
    this._flashEl?.remove();
    this._flashEl = null;
    if (this.road) this.road.dispose();
    super.teardown();
  }
}
