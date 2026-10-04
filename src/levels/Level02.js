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
import { loadJungleKit, createJungleMaterials, createJungleSky, createPollen } from './level1/jungleWorld.js';
import { populateJungleChunk } from './level2/JungleRoadside.js';
import { Level2Sound } from './level2/sound.js';

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
    this._input = { forward: false, backward: false, left: false, right: false, boost: false, handbrake: false };
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    // ---- jungle at dusk (team guide, Level 2 "The River Road": sunset, low
    // sun ahead-left, warm fog) — same jungle as Levels 1 and 3 ----
    const FOG = 0xc99a6e;
    scene.background = new THREE.Color(FOG);
    scene.fog = new THREE.FogExp2(FOG, 0.0085);

    this._sky = createJungleSky();
    const u = this._sky.material.uniforms;
    u.uTop.value.set(0x2e3d6e);          // deep blue overhead
    u.uHorizon.value.set(0xf0a060);      // burnt-orange horizon
    u.uBottom.value.set(0x3a3a22);
    u.uSun.value.set(0xffb070);
    u.uSunDir.value.set(-0.45, 0.1, 0.9).normalize();   // low, ahead of you
    this.root.add(this._sky);

    this.root.add(new THREE.HemisphereLight(0xffd2a0, 0x2f3a1c, 0.85));
    const sun = new THREE.DirectionalLight(0xffc28a, 1.6);
    sun.position.set(-45, 12, 90);       // matches the sky's sun
    // a tight shadow box that follows the car: every car gets a contact
    // shadow on the tarmac for the cost of one small shadow map
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 160 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.root.add(sun, sun.target);
    this._sun = sun;
    this._sunOffset = new THREE.Vector3(-45, 28, 90).normalize().multiplyScalar(80);

    this._pollen = createPollen(260);
    this._pollen.material.color.set(0xffd08a);
    // soft round glow instead of hard square points
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const g = dot.getContext('2d').createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    const ctx2 = dot.getContext('2d'); ctx2.fillStyle = g; ctx2.fillRect(0, 0, 32, 32);
    this._pollen.material.map = new THREE.CanvasTexture(dot);
    this._pollen.material.size = 0.09;
    this._pollen.material.opacity = 0.55;
    this._pollen.material.needsUpdate = true;
    this.root.add(this._pollen);

    // ---- infinite textured road — @2B — now through the jungle ----
    this.road = new RoadSystem(this.root);
    this._jungleReady = this._buildJungle(assets);

    // ---- 2A's vehicle + handler ----
    this.car = new VehicleController(this.root);
    this.handler = new HandlerAI(this.root, this.car);
    // rails sit just outside the road edge — keep both cars inside them
    const railX = this.road.roadWidth / 2 - 0.3;
    this.car.railX = railX;
    this.handler.railX = railX;

    // the Handler's hits: a ram that connects hurts and shakes, a scrape
    // alongside nicks you, a dodged ram is called out on the HUD
    const between = () => this._mid.copy(this.car.mesh.position).add(this.handler.mesh.position).multiplyScalar(0.5).setY(0.6);
    this._mid = new THREE.Vector3();
    this.handler.onAttackResolved = (hit) => {
      this._impact(0.55 + hit.impact * 0.45, between());
      this.sound.crash(hit.impact, hit.side * -0.5);
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.5 + hit.impact * 0.8);
      this._flash(`${hit.label}  -${hit.damage}`, '#ff5555');
    };
    this.handler.onContact = (hit) => {
      this._impact(hit.impact * 0.45, between());
      this.sound.thump(hit.impact, hit.side * -0.5);
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, hit.impact);
    };
    this.handler.onDodge = (move, label) => { this._flash(label, '#7dffb0'); this.sound.dodge(); };

    // tyre shots, spike-strip drones, kamikaze drones
    this.weapons = new HandlerWeapons(this.root, assets);
    this.handler.weapons = this.weapons;
    this.weapons.onHit = (hit) => {
      this._impact(hit.kind === 'drone' ? 0.9 : 0.5, null);
      if (hit.kind === 'drone') this.sound.crash(0.9); else this.sound.tyrePop();
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.4 + hit.impact * 0.8);
      const extra = hit.kind === 'drone' ? '' : '  · TYRE DAMAGED';
      this._flash(`${hit.label}  -${hit.damage}${extra}`, '#ff5555');
    };
    this.weapons.onWarn = (text) => { this._flash(text, '#ffb020'); this.sound.warn(); };
    this.weapons.onMiss = (text) => { this._flash(text, '#7dffb0'); this.sound.dodge(); };

    // ---- sound: everything synthesised, no audio files (level2/sound.js) ----
    this.sound = new Level2Sound();
    const panOf = (pos) => Math.max(-0.8, Math.min(0.8, -(pos.x - this.car.mesh.position.x) / 10));
    const distTo = (pos) => pos.distanceTo(this.car.mesh.position);
    this.weapons.onShot = (gun) => this.sound.gunshot(distTo(gun), panOf(gun));
    this.weapons.onLaser = (t) => this.sound.laser(t);
    this.weapons.onExplode = (pos) => this.sound.explosion(distTo(pos));
    this.weapons.onStripDrop = () => this.sound.clatter();

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
    await this._jungleReady;
    await this.weapons.init();
    this._hud = createLevel2Hud();
    this._openCarPicker();
  }

  /** Loads the shared jungle kit and plants it along every road chunk. */
  async _buildJungle(assets) {
    const [kit, mats] = await Promise.all([loadJungleKit(assets), createJungleMaterials(assets, 200)]);
    const tile = (mat, rx, ry) => {
      const m = mat.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        if (!m[k]) continue;
        m[k] = m[k].clone();
        m[k].wrapS = m[k].wrapT = THREE.RepeatWrapping;
        m[k].repeat.set(rx, ry);
        m[k].needsUpdate = true;
      }
      return m;
    };
    const L = this.road.chunkLength;
    this.road.decorate(
      (chunk, seed) => populateJungleChunk(chunk, kit, { length: L, roadWidth: this.road.roadWidth, seed }),
      { verge: tile(mats.trail, 1.3, L / 3), ground: tile(mats.forest, 80, L / 5) },
    );
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
    // slide the view so the car sits to the right of the panel
    const w = window.innerWidth, h = window.innerHeight;
    this.game.camera.setViewOffset(w, h, -Math.min(200, w * 0.14), 0, w, h);
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
    this.game.camera.clearViewOffset();
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
    // its own binding: the shared 'jump' action also includes W and ↑
    this.input.bindings.handbrake ??= [' '];
    i.handbrake = this.input.isDown('handbrake');

    // open car picker
    if (this.input.pressed('changeCar')) {
      this._openCarPicker();
      return;
    }

    const previousHeading = this.car.heading;
    this.car.update(dt, i);
    const { dist, state: handlerState } = this.handler.update(dt);
    this.weapons.update(dt, this.car, this.handler.mesh);
    this._updateTelegraphArrow(handlerState);

    // skid detection
    const headingRate = dt > 0 ? (this.car.heading - previousHeading) / dt : 0;
    const skidding = this.car.drifting
      || (Math.abs(this.car.speed) > 16 && Math.abs(this.car.speed * headingRate) > 26)
      || (i.backward && this.car.speed > 14)
      || this.car.wallHit > 0;

    // scraping a guardrail: shake, sparks off the rail, and a real hit if you went in square
    this._sparkT = (this._sparkT || 0) - dt;
    if (this.car.wallHit > 0 && this._sparkT <= 0) {
      this._sparkT = 0.05;
      const p = this.car.mesh.position;
      this.weapons._burst(this._mid.set(Math.sign(p.x) * (this.car.railX - 0.1), 0.5, p.z), 3);
    }
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
      this._impact(hit.impact, this._mid.copy(this.car.mesh.position).setY(0.6));
      this.sound.crash(hit.impact);
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.35 + hit.impact * 0.9);
    }

    this.road.update(this.car.mesh.position);

    // sky dome and pollen travel with you
    this._sky.position.copy(this.game.camera.position);
    this._pollen.position.set(this.car.mesh.position.x, 0, this.car.mesh.position.z + 30);


    this._updateSecondaryCams();

    this._updateCamera(dt);

    // sun + shadow box follow the car
    this._sun.position.copy(this.car.mesh.position).add(this._sunOffset);
    this._sun.target.position.copy(this.car.mesh.position);

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

    // ---- sound ----
    if (handlerState === 'TELEGRAPH' && this._prevHState !== 'TELEGRAPH') this.sound.warn();
    this._prevHState = handlerState;
    const p = this.car.mesh.position;
    this.sound.update(dt, {
      speed: this.car.speed,
      maxSpeed: this.car.maxSpeed,
      throttle: i.forward || i.boost,
      boosting: this.car.boosting,
      skid: skidding,
      scrape: this.car.wallHit,
      handler: {
        dist,
        dx: this.handler.mesh.position.x - p.x,
        attacking: ['TELEGRAPH', 'SLAM', 'PIT', 'SHUNT', 'PIN', 'SHOOT'].includes(handlerState),
      },
      drones: this.weapons.drones.filter((d) => d.active).map((d) => ({
        dist: d.holder.position.distanceTo(p),
        dx: d.holder.position.x - p.x,
        dive: d.phase === 'dive' ? Math.min(1, d.t / 0.7) : 0,
      })),
    });

    // publish to shared state so 3B's HUD can read it
    state.health = this.car.health;
    state.boostHeat = this.car.heat;
    state.distance = dist;
    state.handlerState = handlerState;

    // game over
    if (this.car.health <= 0 && !this._gameOver) {
      this._gameOver = true;
      this.sound.crash(1);
      this.sound.silenceEngine();
      this._showGameOver();
    }
  }

  /**
   * Chase camera. Everything is exponential smoothing on dt, so it feels the
   * same at 30 fps and 144 fps (the old per-frame lerp did not):
   *   - pulls back and widens the FOV with speed, more on boost
   *   - looks ahead of the car, and into the turn
   *   - a touch of roll with the steering
   *   - smooth (not random-per-frame) shake, plus an FOV "punch" on big hits
   */
  _updateCamera(dt) {
    const cam = this.game.camera;
    const car = this.car;
    const v = Math.min(1.3, Math.abs(car.speed) / car.maxSpeed);
    const k = 1 - Math.exp(-dt * 6);            // position follow rate
    const kl = 1 - Math.exp(-dt * 9);           // aim follow rate
    const back = 7.4 + v * 1.8, up = 3.3 + v * 0.4;
    const sh = Math.sin(car.heading), ch = Math.cos(car.heading);
    this._camOffset.set(-sh * back, up, -ch * back);
    this._camDesired = (this._camDesired || new THREE.Vector3()).copy(car.mesh.position).add(this._camOffset);
    cam.position.lerp(this._camDesired, k);

    const ahead = 5 + v * 7;
    const into = car.steer * 2.2 * v;           // look into the corner
    const target = (this._camTarget || (this._camTarget = new THREE.Vector3()))
      .set(car.mesh.position.x + sh * ahead + ch * into, car.mesh.position.y + 1.1, car.mesh.position.z + ch * ahead - sh * into);
    if (!this._lookInit) { this._lookAt.copy(target); this._lookInit = true; }
    this._lookAt.lerp(target, kl);

    // shake: smooth noise from a few sines, decaying
    this._time2 = (this._time2 || 0) + dt;
    const t = this._time2;
    const s = this.shake;
    const look = (this._lookShaken || (this._lookShaken = new THREE.Vector3())).copy(this._lookAt);
    if (s > 0.005) {
      look.x += (Math.sin(t * 41) + Math.sin(t * 23.3)) * 0.5 * s;
      look.y += (Math.sin(t * 37.7) + Math.sin(t * 19.1)) * 0.4 * s;
      this.shake *= Math.exp(-6 * dt);
    }
    cam.lookAt(look);
    cam.rotateZ(-car.steer * 0.025 * v);

    // FOV: speed, boost, impact punch
    if (this._baseFov === undefined) this._baseFov = cam.fov;
    this._punch = (this._punch || 0) * Math.exp(-dt * 7);
    const fov = this._baseFov + v * 9 + (car.boosting ? 6 : 0) + this._punch * 7;
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4));
    cam.updateProjectionMatrix();
  }

  /**
   * Hit feedback: sparks where it happened, a red vignette, an FOV punch
   * and — for the big ones — a 70 ms hit-stop so the impact lands.
   */
  _impact(strength, at = null) {
    if (at) this.weapons._burst(at, Math.round(6 + strength * 12));
    this._punch = Math.max(this._punch || 0, strength);
    if (!this._vignette) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;opacity:0;'
        + 'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(200,20,20,.55) 100%);transition:opacity .45s ease-out';
      document.body.appendChild(el);
      this._vignette = el;
    }
    const el = this._vignette;
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(1, 0.35 + strength * 0.65));
    void el.offsetWidth;
    el.style.transition = 'opacity .5s ease-out';
    el.style.opacity = '0';
    if (strength > 0.65 && this.state) {
      this.state.timeScale = 0.15;
      clearTimeout(this._hitStop);
      this._hitStop = setTimeout(() => { if (this.state) this.state.timeScale = 1; }, 70);
    }
  }

  /** Arrow on the side the next move is coming from, during the wind-up. */
  _updateTelegraphArrow(handlerState) {
    if (!this._arrow) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;top:50%;z-index:16;pointer-events:none;font:800 22px system-ui,sans-serif;'
        + 'color:#ff4d4d;text-shadow:0 0 14px rgba(255,60,60,.9);letter-spacing:2px;opacity:0;transition:opacity .15s;white-space:nowrap';
      document.body.appendChild(el);
      this._arrow = el;
    }
    const el = this._arrow;
    const h = this.handler;
    const show = handlerState === 'TELEGRAPH' && h.nextMove;
    if (!show) { el.style.opacity = '0'; return; }
    const move = { SLAM: 'SIDE SLAM', PIT: 'PIT', SHUNT: 'REAR SHUNT', PIN: 'WALL PIN', SHOOT: 'TYRE SHOT', DRONE: 'DRONE' }[h.nextMove] || h.nextMove;
    const behind = h.nextMove === 'SHUNT' || h.nextMove === 'DRONE';
    // camera looks down +z, so world +x is the LEFT of the screen
    const onLeft = h.mesh.position.x > this.car.mesh.position.x;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 120));
    el.style.opacity = String(pulse);
    if (behind) {
      el.style.left = '50%'; el.style.right = ''; el.style.top = '78%';
      el.style.transform = 'translate(-50%,-50%)';
      el.textContent = `▼ ${move} ▼`;
    } else if (onLeft) {
      el.style.left = '24px'; el.style.right = ''; el.style.top = '50%';
      el.style.transform = 'translateY(-50%)';
      el.textContent = `◀ ${move}`;
    } else {
      el.style.left = ''; el.style.right = '24px'; el.style.top = '50%';
      el.style.transform = 'translateY(-50%)';
      el.textContent = `${move} ▶`;
    }
  }

  /** Rear-view mirror + minimap (2B) follow the car — also during the car picker. */
  _updateSecondaryCams() {
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
  }

  /* ======================== car picker camera ======================== */

  _updateCarPicker(dt) {
    this._updateSecondaryCams();
    if (this.input.pressed('left')) this._selectCar(this._carIndex - 1);
    if (this.input.pressed('right')) this._selectCar(this._carIndex + 1);
    if (this.input.pressed('ability')) this._setPaint(this._paintIndex - 1);    // Q
    if (this.input.pressed('interact')) this._setPaint(this._paintIndex + 1);   // E
    this.input.bindings.confirm ??= ['enter'];
    if (this.input.pressed('jump') || this.input.pressed('forward') || this.input.pressed('confirm')) this._confirmCar();

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
        // fixed: this used to leave _gameOver set and health at 0 — a softlock
        this._gameOver = false;
        this.car.health = 100;
        this.car.heat = 0;
        this.car.overheated = false;
        this.state.alive = true;
        this.state.failCause = null;
        // give you a head start: he drops back and waits before attacking
        this.handler.mesh.position.z = this.car.mesh.position.z - 35;
        this.handler.mesh.position.x = this.car.mesh.position.x;
        this.handler.speed = 0;
        this.handler.state = 'APPROACH';
        this.handler.nextAttackAt = this.handler.elapsed + 8;
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
    this._vignette?.remove();
    this.game?.camera?.clearViewOffset();
    this._arrow?.remove();
    clearTimeout(this._hitStop);
    if (this.state) this.state.timeScale = 1;
    if (this._baseFov !== undefined && this.game?.camera) {
      this.game.camera.fov = this._baseFov;        // the camera is shared with the other levels
      this.game.camera.updateProjectionMatrix();
    }
    this.sound?.dispose();
    this._flashEl = null;
    if (this.road) this.road.dispose();
    super.teardown();
  }
}
