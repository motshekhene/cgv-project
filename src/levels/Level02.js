import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { VehicleController } from './level2/VehicleController.js';
import { HandlerAI } from './level2/HandlerAI.js';
import {
  CARS, HANDLER_MODEL, loadSavedCar, saveCar, createCarPicker,
} from './level2/carSelect.js';
import { createLevel2Hud } from './level2/hud.js';
import { CarLights, PoliceLights } from './level2/carLights.js';
import { Traffic } from './level2/traffic.js';
import { Skids, Smoke } from './level2/skids.js';
import { AudioSystem } from '../audio/audioSystem.js';
import { createGameOverScreen } from './level2/gameOver.js';

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
    this._shake = 0;
    this._carBounds = null;

    // audio — same pattern as Level01._ensureAudio(): the camera the
    // AudioListener attaches to is owned by Game.js, so this waits for it
    // rather than assuming it exists yet.
    this._audio = null;
    this._audioReady = false;
    this._engineSound = null;
    this._sirenSound = null;
    this._wasSkidding = false;
    this._prevHandlerState = null;

    // game over
    this._gameOver = false;
    this._survivalTime = 0;
    this._topSpeedKmh = 0;
    this.gameOverScreen = null;
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
    // The car drives towards +Z, so the road runs from just behind the start
    // line out to +Z (it used to run the other way and ended 50 m into the drive).
    const roadLength = 4000;
    const roadMid = roadLength / 2 - 50;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(24, roadLength),
      new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.9 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = roadMid;
    road.receiveShadow = true;          // headlight shadows land here
    this.root.add(road);

    // one geometry and one material shared by every stripe, instead of 400 copies
    const stripeGeo = new THREE.PlaneGeometry(0.3, 3);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x6fa8ff });
    for (let z = -30; z < roadLength - 50; z += 10) {
      const s = new THREE.Mesh(stripeGeo, stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(0, 0.01, z);
      this.root.add(s);
    }

    const railMat = new THREE.MeshStandardMaterial({ color: 0x2a3138 });
    const railGeo = new THREE.BoxGeometry(0.4, 0.8, roadLength);
    for (const side of [-12, 12]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side, 0.4, roadMid);
      this.root.add(rail);
    }

    // ---- 2A's systems, unchanged. They take a parent to add themselves to,
    //      and that parent is now this.root rather than the raw scene. ----
    this.car = new VehicleController(this.root);
    this.handler = new HandlerAI(this.root, this.car);
    this.handler.onAttackResolved = () => this.car.takeDamage(12);

    this._camOffset = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();

    // lights, tyre marks, smoke, traffic
    this.carLights = new CarLights(this.car.mesh);
    this.policeLights = new PoliceLights(this.handler.mesh);
    this.skids = new Skids(this.root);
    this.smoke = new Smoke(this.root);
    this._prevHeading = 0;
    this.traffic = new Traffic(this.root, assets);

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
      this.handler.attachModel(assets, HANDLER_MODEL, { yaw: 0 }).then((m) => {
        if (m) this.policeLights.fit(m.userData.bounds);
      }),
    ]);
    await this.traffic.init(this.car.mesh.position.z);

    this.hud = createLevel2Hud();
    if (showPickerNext) {
      showPickerNext = false;
      this._openPicker();
    }
    this._ready = true;
  }

  /** Grabs the game camera for the AudioListener once it exists — mirrors Level01._ensureAudio(). */
  _ensureAudio() {
    if (this._audioReady) return;
    const camera = this.game && this.game.camera;
    if (!camera) return;

    this._audio = new AudioSystem(camera);
    this._audioReady = true;

    // Files to add under public/assets/audio/level2/ (lowercase, no spaces).
    // A missing file just logs a warning — the level keeps running silently
    // for that one sound, same as loadAll()'s built-in behaviour.
    this._audio
      .loadAll({
        ambience: 'assets/audio/level2/highway_wind.mp3',
        engine: 'assets/audio/shared/engine_loop.mp3',
        siren: 'assets/audio/level2/siren_loop.mp3',
        skid: 'assets/audio/shared/tire_screech.mp3',
        impact: 'assets/audio/shared/impact_thud.mp3',
        telegraph: 'assets/audio/level2/handler_telegraph.mp3',
        music_l2: 'assets/audio/level2/music_redline.mp3',
      })
      .then(() => {
        this._audio.playAmbience('ambience', { volume: 0.3 });
        // fades music_l2 in from silence; also how Interlude I would hand off from music_l1
        this._audio.crossfadeMusic('music_l1', 'music_l2', 2.5);

        this._engineSound = this._audio.attachPositional(this.car.mesh, 'engine', {
          volume: 0.5, refDistance: 4, maxDistance: 40,
        });
        this._sirenSound = this._audio.attachPositional(this.handler.mesh, 'siren', {
          volume: 0.7, refDistance: 10, maxDistance: 90,
        });
      });
  }

  /* ---------------- car picker ---------------- */

  _showCar(index) {
    const car = CARS[index];
    this._swap = this._swap.then(async () => {
      const model = await this.car.attachModel(this.assets, car.path, { yaw: 0 });
      if (!model) return;
      const b = model.userData.bounds;
      this.carLights.fit(b);
      this.skids.setDims(b);
      // slightly forgiving hit box for the traffic collisions
      this.car.bounds = { halfW: (b.max.x - b.min.x) / 2 * 0.9, halfL: (b.max.z - b.min.z) / 2 * 0.92 };
    });
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

    if (this._gameOver) return;   // frozen — the overlay owns the screen now

    if (!this._audioReady) this._ensureAudio();

    if (this._picking) {
      this._updatePicker(dt);
      return;
    }

    this._survivalTime += dt;

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

    const prevHeading = this.car.heading;
    this.car.update(dt, i);
    const { dist, state: handlerState } = this.handler.update(dt);

    // skid marks + smoke: hard braking, or high-speed cornering.
    // If VehicleController exposes a drift/handbrake flag as car.drifting, that wins.
    const sp = this.car.speed;
    this._topSpeedKmh = Math.max(this._topSpeedKmh, Math.abs(sp) * 3.6);
    const headingRate = dt > 0 ? (this.car.heading - prevHeading) / dt : 0;
    const skidding = this.car.drifting ??
      ((Math.abs(sp) > 16 && Math.abs(sp * headingRate) > 26) || (i.backward && sp > 14));
    this.skids.update(dt, this.car, skidding);
    this.smoke.update(dt, this.skids.wheels(this.car), skidding);

    // lights
    this.carLights.update(dt, { braking: i.backward && sp > 1 });
    this.policeLights.update(dt, handlerState);

    // engine pitch/volume ride the same speed value the HUD shows
    if (this._engineSound && this._engineSound.buffer) {
      const norm = Math.min(1, Math.abs(sp) / this.car.maxSpeed);
      this._engineSound.setPlaybackRate(0.75 + norm * 0.9 + (i.boost ? 0.25 : 0));
      this._engineSound.setVolume(0.35 + norm * 0.45);
    }

    // one-shots on state changes, not every frame
    if (skidding && !this._wasSkidding && this._audio) this._audio.playOneShot('skid', { volume: 0.5 });
    this._wasSkidding = skidding;

    if (handlerState === 'TELEGRAPH' && this._prevHandlerState !== 'TELEGRAPH' && this._audio) {
      this._audio.playOneShot('telegraph', { volume: 0.8 });
    }
    this._prevHandlerState = handlerState;

    // traffic: crashes cost health and speed, and shake the camera
    for (const hit of this.traffic.update(dt, this.car)) {
      this.car.takeDamage(hit.damage);
      this._shake = Math.max(this._shake, 0.35 + hit.impact * 0.9);
      if (this._audio) this._audio.playOneShot('impact', { volume: 0.4 + hit.impact * 0.4 });
    }

    // chase camera — same maths as before, using the shared camera
    const cam = this.game.camera;
    this._camOffset.set(
      Math.sin(this.car.heading) * -8, 4.2, Math.cos(this.car.heading) * -8
    );
    const desired = this.car.mesh.position.clone().add(this._camOffset);
    cam.position.lerp(desired, 0.12);
    this._lookAt.copy(this.car.mesh.position);
    this._lookAt.y += 1;
    if (this._shake > 0.01) {
      this._lookAt.x += (Math.random() - 0.5) * this._shake;
      this._lookAt.y += (Math.random() - 0.5) * this._shake;
      this._shake *= Math.exp(-6 * dt);
    }
    cam.lookAt(this._lookAt);

    // publish to shared state so 3B's HUD can read it without touching this file
    state.health = this.car.health;
    state.boostHeat = this.car.heat;
    state.distance = dist;
    state.handlerState = handlerState;   // add this field to GameState.reset()
    state.normalizedSpeed = Math.min(1, Math.abs(this.car.speed) / this.car.maxSpeed);

    this.hud.update({
      speed: this.car.speed, dist, heat: this.car.heat,
      health: this.car.health, handlerState, maxSpeed: this.car.maxSpeed,
    });

    if (this.car.health <= 0) this._triggerGameOver();
  }

  _triggerGameOver() {
    if (this._gameOver) return;
    this._gameOver = true;
    this.finished = true;              // set for whenever Game.js grows a reader for it
    this.state.alive = false;
    this.state.failCause = 'crash';
    this.car.speed = 0;

    if (this.hud) this.hud.setVisible(false);
    if (this._engineSound) this._engineSound.setVolume(0);
    if (this._audio) this._audio.playOneShot('impact', { volume: 0.9 });

    this.gameOverScreen = createGameOverScreen({
      health: this.car.health,
      topSpeedKmh: this._topSpeedKmh,
      distance: this.state.distance,
      time: this._survivalTime,
      onRestart: () => this.game.restart(),
      onContinue: () => this._continueAfterGameOver(),
      onQuit: () => this._quitToMenu(),
    });
  }

  /**
   * CONTINUE — there's no level03 to hand off to yet, so "continue to the
   * next stage or resume the game if applicable" resolves to the applicable
   * half: patch the car back up and pick the run back up right where it
   * ended (same position, same distance), rather than restarting the level
   * from the top the way RETRY does.
   */
  _continueAfterGameOver() {
    if (!this._gameOver) return;
    this._gameOver = false;
    this.finished = false;
    this.state.alive = true;
    this.state.failCause = null;

    this.car.health = this.state.maxHealth;
    this.car.heat = 0;

    if (this.gameOverScreen) { this.gameOverScreen.destroy(); this.gameOverScreen = null; }
    if (this.hud) this.hud.setVisible(true);
    if (this._engineSound) this._engineSound.setVolume(0.35);
  }

  /**
   * QUIT — this build has no standalone title/menu screen yet, so the closest
   * equivalent is dropping the player back at Level 1, the game's entry point.
   */
  _quitToMenu() {
    if (this.gameOverScreen) { this.gameOverScreen.destroy(); this.gameOverScreen = null; }
    this.game.setLevel('level01');
  }

  teardown() {
    if (this.picker) this.picker.destroy();
    this.picker = null;
    if (this.hud) this.hud.destroy();
    this.hud = null;
    if (this._audio) this._audio.teardown();
    this._audio = null;
    if (this.gameOverScreen) this.gameOverScreen.destroy();
    this.gameOverScreen = null;
    super.teardown();
  }
}
