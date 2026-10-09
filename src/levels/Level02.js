import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { VehicleController } from './level2/VehicleController.js';
import { HandlerAI } from './level2/HandlerAI.js';
import { HandlerWeapons } from './level2/HandlerWeapons.js';
import { RoadSystem } from './level2/RoadSystem.js';
import { CarLights, PoliceLights } from './level2/carLights.js';
import { Traffic } from './level2/traffic.js';
import { Skids, Smoke } from './level2/skids.js';
import { CARS, HANDLER_MODEL, HANDLER_OPTIONS, createCarPicker, loadSavedCar, saveCar, loadSavedPaint, savePaint } from './level2/carSelect.js';
import { PAINTS, applyPaint, detectPaint } from './level2/paint.js';
import { createLevel2Hud } from './level2/hud.js';
import { createGameOverScreen } from './level2/gameOver.js';
import { showEndCard } from '../ui/EndCard.js';
import {
  loadJungleKit, createJungleMaterials, createJungleSky, createPollen, createLightShaft,
  createJungleWildlife, updateJungleWildlife, jungleCourseHeight,
} from './level1/jungleWorld.js';
import { Pickups } from './level2/pickups.js';
import { Course, COURSE_END, DROP } from './level2/course.js';
import { DriveControls } from './level2/controls.js';
import { spinWheels } from './level2/wheels.js';
import { populateJungleChunk } from './level2/JungleRoadside.js';
import { Level2Sound } from './level2/sound.js';
import { MudSplash } from './level2/MudSplash.js';
import { createRainMaterial } from '../shaders/rain.js';
import { kaiThinks, clearThoughts } from '../ui/dialogue.js';

/**
 * Level 02 — The River Road. Kai drives off the trail with the horn, the
 * Marshal's company ranger behind him, lights going.
 *
 * Integrates 2A's vehicle gameplay (car models, traffic, lights, skids,
 * smoke, HUD, car picker, game over) with 2B's road and secondary cameras
 * (rearview mirror + minimap).
 *
 * The River Road is a journey: Level 1's jungle and mud trail, ~4 km long,
 * rewards along the way (pickups.js), and at the end the road goes over a
 * waterfall (course.js). The car goes with it — a short fall cinematic and
 * the splash in the pool, where Level 2 ends (Level 3 opens in that pool).
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

    // Level 01 -> Level 02 cinematic hand-off. This lives entirely in Level 02
    // so Level 01 never needs to know about vehicle models or car-selection UI.
    this._fromLevel1 = false;
    this._handoff = null;
    this._handoffUi = null;
    this._handoffCheckpoint = null;
    this._handoffBarrier = null;
    this._secondaryCamsSuppressed = false;
    this._normalDriveStarted = false;
    this._transitionPoliceGap = 12;
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    // A direct Level 02 launch still opens the picker immediately. Coming from
    // Level 01 instead plays a short in-world chase reveal first.
    this._fromLevel1 = !!state?.transitionFromLevel1;
    this._transitionPoliceGap = Math.max(8, Number(state?.transitionPoliceGap) || 12);
    if (this._fromLevel1) state.transitionFromLevel1 = false;

    // ---- Level 1's jungle, exactly: same fog, sky, light rig, pollen and
    // light shafts (Level 1 runs toward -z, this road toward +z, so the sun
    // and the shafts are mirrored to stay in front of you) ----
    const FOG = 0xcfd6a8;
    scene.background = new THREE.Color(FOG);
    scene.fog = new THREE.FogExp2(FOG, 0.014);

    this._sky = createJungleSky();
    this._sky.material.uniforms.uSunDir.value.set(-0.35, 0.55, 0.75).normalize();
    this.root.add(this._sky);

    this.root.add(new THREE.HemisphereLight(0xbfdcff, 0x4a5a26, 0.6));
    const sun = new THREE.DirectionalLight(0xffd29a, 4.5);
    // a tight shadow box that follows the car: every car gets a contact
    // shadow on the trail for the cost of one small shadow map
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 160 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.root.add(sun, sun.target);
    this._sun = sun;
    this._sunOffset = new THREE.Vector3(-35, 55, 75);     // Level 1: (x - 35, 55, z - 75)

    this._pollen = createPollen(500);
    this._pollen.scale.x = 2.2;                            // the road is wider than Kai's trail
    this.root.add(this._pollen);

    this._shafts = new THREE.Group();
    for (const [x, z, width] of [[-4, 15, 2.6], [7, 52, 3.4], [-7.5, 92, 2.9]]) {
      const shaft = createLightShaft(width);
      shaft.position.set(x, 28, z);
      this._shafts.add(shaft);
    }
    this.root.add(this._shafts);

    // birds and butterflies from Level 1, mirrored to fly toward you down +z
    this._wildlife = createJungleWildlife(this.root);
    this._wildlife.group.scale.z = -1;
    for (const m of this._wildlife.monkeys) m.visible = false;   // placed for Level 1's course

    // ---- the road — @2B — now Level 1's mud trail, and it ends at the falls ----
    this.road = new RoadSystem(this.root, { endZ: COURSE_END });
    this.course = new Course(this.root, { endZ: COURSE_END, roadWidth: this.road.roadWidth });
    this.pickups = new Pickups(this.root, { start: 150, end: COURSE_END - 300 });
    this._rewards = 0;
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
      this._rams = (this._rams || 0) + 1; // for the win scene's card
      this._impact(0.55 + hit.impact * 0.45, between());
      this.sound.crash(hit.impact, hit.side * -0.5);
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.5 + hit.impact * 0.8);
      this._flash(`${hit.label}  -${hit.damage}`, '#f2934f');
    };
    this.handler.onContact = (hit) => {
      this._impact(hit.impact * 0.45, between());
      this.sound.thump(hit.impact, hit.side * -0.5);
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, hit.impact);
    };
    this.handler.onDodge = (move, label) => { this._flash(label, '#bcd96a'); this.sound.dodge(); };

    // tyre shots, spike-strip drones, kamikaze drones
    this.weapons = new HandlerWeapons(this.root, assets);
    this.handler.weapons = this.weapons;
    this.weapons.onHit = (hit) => {
      this._impact(hit.kind === 'drone' ? 0.9 : 0.5, null);
      if (hit.kind === 'drone') this.sound.crash(0.9); else this.sound.tyrePop();
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.4 + hit.impact * 0.8);
      const extra = hit.kind === 'drone' ? '' : '  · TYRE DAMAGED';
      this._flash(`${hit.label}  -${hit.damage}${extra}`, '#f2934f');
    };
    this.weapons.onWarn = (text) => { this._flash(text, '#e3bb62'); this.sound.warn(); };
    this.weapons.onMiss = (text) => { this._flash(text, '#bcd96a'); this.sound.dodge(); };

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
    this.mudSplash = new MudSplash(this.root);
    this.traffic = new Traffic(this.root, assets, { endZ: COURSE_END });
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

    // ---- rain overlay — @2B ----
    // Uses a dedicated scene + orthographic camera rendered as a post-process overlay
    this._rainScene = new THREE.Scene();
    this._rainCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._rainMat = createRainMaterial({
      intensity: 0,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });
    const rainQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._rainMat);
    this._rainScene.add(rainQuad);
    this.game.addOverlay('rain', this._rainScene, this._rainCamera);

    // ---- load models ----
    await Promise.allSettled(
      [HANDLER_MODEL, ...CARS.map((c) => c.path)].map((p) => assets.model(p))
    );

    this._carIndex = loadSavedCar();
    this._paintIndex = loadSavedPaint();
    this._paintInfo = new Map();                  // detected factory colour per model file
    await this._selectCar(this._carIndex);
    const handlerModel = await this.handler.attachModel(assets, HANDLER_MODEL, HANDLER_OPTIONS);
    if (handlerModel) this.policeLights.fit(handlerModel.userData.bounds, handlerModel);

    await this.traffic.init(this.car.mesh.position.z);
    await this._jungleReady;
    await this.weapons.init();
    this._hud = createLevel2Hud();
    this._controls = new DriveControls({
      onCar: () => { if (!this._finale && !this._gameOver) this._openCarPicker(); },
      onMusic: () => this.sound.setMusic(!this.sound.musicOn),
      onMute: () => this.sound.setMuted(!this.sound.muted),
    });
    this._buildShield();

    if (this._fromLevel1) {
      // Level 01 already handled the gate slam and police-car chase. Arrive at
      // the blue service car and open the existing picker immediately — no
      // second reveal, no depot replay, no extra cinematic.
      this._prepareContinuousStartFromLevel1();
      this._openCarPicker();
    } else {
      this._openCarPicker();
    }
  }

  _prepareContinuousStartFromLevel1() {
    this._hud?.setVisible(false);
    this._controls?.setVisible(false);

    // Keep secondary camera UI out of the car picker. It comes back the moment
    // the player confirms the chosen car.
    this.game.removeSecondaryCamera('rearview');
    this.game.removeSecondaryCamera('minimap');
    this._secondaryCamsSuppressed = true;

    this.car.speed = 0;
    this.car.heading = 0;
    this.car.mesh.position.set(3.3, 0, 0);

    // This is the same police Ranger that was on Kai's heels in Level 01. Put
    // it at the transferred gap and keep its lights alive while the picker is
    // open so the chase still feels present rather than reset.
    this.handler.mesh.position.set(4.0, 0, -this._transitionPoliceGap);
    this.handler.heading = 0;
    this.handler.speed = 0;
    this.handler.state = 'APPROACH';
    this.handler.passive = true;
    this.policeLights.update(0, 'APPROACH');

    if (this._baseFov === undefined) this._baseFov = this.game.camera.fov;
  }

  /**
   * Level 01 -> Level 02: no loading card, no black cut. The player arrives in
   * the same jungle, hears the ranger before seeing it, then the police-lit
   * pursuit vehicle tears through a wooden checkpoint. The camera pans to the
   * parked escape car and only then opens the existing car picker.
   *
   * There is deliberately no Kai character implementation here. The camera
   * implies his final sprint and later "entry" into the chosen car, which keeps
   * ownership of the player model/controller with Level 1A.
   */
  _startLevel1Handoff() {
    this._hud?.setVisible(false);
    this._controls?.setVisible(false);

    // The mirror/minimap would look like UI clutter during the cinematic.
    this.game.removeSecondaryCamera('rearview');
    this.game.removeSecondaryCamera('minimap');
    this._secondaryCamsSuppressed = true;

    this.car.speed = 0;
    this.car.mesh.position.set(0, 0, 14);
    this.car.heading = 0;

    this.handler.mesh.position.set(1.8, 0, -72);
    this.handler.heading = 0;
    this.handler.speed = 0;
    this.handler.state = 'APPROACH';

    this._buildHandoffCheckpoint();
    this._buildHandoffUi();

    this._handoff = {
      phase: 'silence',
      t: 0,
      barrierHit: false,
      pickerOpened: false,
    };

    const cam = this.game.camera;
    cam.position.set(8.5, 3.2, -18);
    cam.lookAt(0, 1.1, -42);
    if (this._baseFov === undefined) this._baseFov = cam.fov;
    cam.fov = Math.max(55, this._baseFov - 4);
    cam.updateProjectionMatrix();
  }

  _buildHandoffCheckpoint() {
    const group = new THREE.Group();
    group.position.set(0, 0, -7);

    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3b22, roughness: 0.92 });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xb58b3b, roughness: 0.66, emissive: 0x2b1d06, emissiveIntensity: 0.18,
    });

    const postGeo = new THREE.BoxGeometry(0.42, 3.4, 0.42);
    for (const x of [-5.1, 5.1]) {
      const p = new THREE.Mesh(postGeo, wood);
      p.position.set(x, 1.7, 0);
      p.castShadow = p.receiveShadow = true;
      group.add(p);
    }

    const cross = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.42, 0.5), wood);
    beam.castShadow = true;
    cross.add(beam);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.8, 0.16), gold);
    plate.position.set(0, 0.72, 0.04);
    cross.add(plate);
    cross.position.set(0, 2.45, 0);
    group.add(cross);

    // A few side crates make the spot read as an abandoned expedition depot.
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x78603d, roughness: 0.9 });
    for (const [x,z,s] of [[-6.4,2.2,1],[6.2,1.4,.85],[-6.0,-2.1,.7]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.1*s, 1.1*s, 1.1*s), crateMat);
      c.position.set(x, 0.55*s, z);
      c.rotation.y = x * 0.17;
      c.castShadow = c.receiveShadow = true;
      group.add(c);
    }

    this._handoffCheckpoint = group;
    this._handoffBarrier = cross;
    this.root.add(group);
  }

  _buildHandoffUi() {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;inset:0;z-index:19;pointer-events:none;color:#f4ecd6;
      font-family:'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif;
    `;
    el.innerHTML = `
      <div class="bp-letterbox top" style="position:absolute;left:0;right:0;top:0;height:7vh;background:rgba(0,0,0,.72);transition:height .45s ease"></div>
      <div class="bp-letterbox bottom" style="position:absolute;left:0;right:0;bottom:0;height:7vh;background:rgba(0,0,0,.72);transition:height .45s ease"></div>
      <div class="bp-kicker" style="position:absolute;left:50%;top:17%;transform:translate(-50%,-50%);
        font-size:11px;letter-spacing:.38em;color:#d9b45a;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .3s"></div>
      <div class="bp-title" style="position:absolute;left:50%;top:23%;transform:translate(-50%,-50%);
        font-size:clamp(20px,3.4vw,38px);font-weight:800;letter-spacing:.18em;text-shadow:0 3px 14px #000;opacity:0;transition:opacity .3s"></div>
      <div class="bp-sub" style="position:absolute;left:50%;top:29%;transform:translate(-50%,-50%);
        font:600 11px system-ui;letter-spacing:.15em;color:#f1e7c6;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .3s"></div>`;
    document.body.appendChild(el);
    this._handoffUi = el;
  }

  _handoffText(kicker = '', title = '', sub = '') {
    if (!this._handoffUi) return;
    const k = this._handoffUi.querySelector('.bp-kicker');
    const t = this._handoffUi.querySelector('.bp-title');
    const s = this._handoffUi.querySelector('.bp-sub');
    k.textContent = kicker; t.textContent = title; s.textContent = sub;
    k.style.opacity = kicker ? '1' : '0';
    t.style.opacity = title ? '1' : '0';
    s.style.opacity = sub ? '1' : '0';
  }

  _finishHandoffUi() {
    if (!this._handoffUi) return;
    const el = this._handoffUi;
    for (const b of el.querySelectorAll('.bp-letterbox')) b.style.height = '0';
    this._handoffText();
    setTimeout(() => el.remove(), 500);
    this._handoffUi = null;
  }

  _restoreSecondaryCameras() {
    if (!this._secondaryCamsSuppressed) return;
    this.game.addSecondaryCamera('rearview', this._rearview, { x: 0.02, y: 0.02, w: 0.25, h: 0.18 });
    this.game.addSecondaryCamera('minimap', this._minimap, { x: 0.73, y: 0.02, w: 0.25, h: 0.25 });
    this._secondaryCamsSuppressed = false;
  }

  _updateLevel1Handoff(dt) {
    const h = this._handoff;
    if (!h) return false;

    h.t += dt;
    this._time += dt;
    this._updateWorld(dt);
    this.policeLights.update(dt, h.phase === 'escape' ? 'TELEGRAPH' : 'APPROACH');

    const cam = this.game.camera;
    const hp = this.handler.mesh.position;
    const cp = this.car.mesh.position;

    if (h.phase === 'silence') {
      // A breath after the gate. Then the lights arrive before the vehicle.
      this._handoffText('THE GATE', 'SEALED BEHIND YOU', 'IT WON\u2019T HOLD HIM LONG');
      hp.z = -72 + Math.min(1, h.t / 1.0) * 10;
      cam.position.lerp(new THREE.Vector3(8.5, 3.2, -18), 1 - Math.exp(-dt * 5));
      cam.lookAt(0, 1.0, hp.z + 8);
      if (h.t > 1.05) { h.phase = 'reveal'; h.t = 0; }
      return true;
    }

    if (h.phase === 'reveal') {
      this._handoffText('THE MARSHAL', 'RUN \u2014 FIND A VEHICLE', 'HE IS THROUGH THE GATE');
      hp.z += (18 + 16 * Math.min(1, h.t / 1.6)) * dt;
      hp.x = 1.8 + Math.sin(h.t * 2.3) * 0.45;

      // First watch the police-lit ranger barrel toward the checkpoint.
      const targetCam = new THREE.Vector3(7.5, 2.8, -11);
      cam.position.lerp(targetCam, 1 - Math.exp(-dt * 3.5));
      const lookZ = THREE.MathUtils.lerp(hp.z, -7, THREE.MathUtils.smoothstep(h.t, 0.9, 2.0));
      cam.lookAt(0, 1.0, lookZ);

      if (!h.barrierHit && hp.z >= -9.5) {
        h.barrierHit = true;
        this.sound.crash(0.7);
        this.shake = Math.max(this.shake, 0.75);
      }
      if (h.barrierHit && this._handoffBarrier) {
        const u = Math.min(1, (hp.z + 9.5) / 7.5);
        this._handoffBarrier.rotation.z = -u * 0.62;
        this._handoffBarrier.position.y = -u * 1.6;
        this._handoffBarrier.position.z = u * 1.1;
      }

      if (h.t > 2.65) { h.phase = 'depot'; h.t = 0; }
      return true;
    }

    if (h.phase === 'depot') {
      this._handoffText('THE LOGGING CAMP', 'CHOOSE YOUR ESCAPE CAR', 'HIS LIGHTS ARE GETTING CLOSER');
      // Pan off the pursuer and land on the parked player vehicle.
      const targetCam = new THREE.Vector3(-6.5, 2.7, 19);
      cam.position.lerp(targetCam, 1 - Math.exp(-dt * 2.5));
      cam.lookAt(cp.x, 0.9, cp.z);

      // Hold the ranger just beyond the smashed checkpoint, lights flashing.
      hp.z += (-13 - hp.z) * (1 - Math.exp(-dt * 2.5));

      if (h.t > 1.15 && !h.pickerOpened) {
        h.pickerOpened = true;
        this._handoff = null;
        this._finishHandoffUi();
        this._openCarPicker();
      }
      return true;
    }

    if (h.phase === 'enter') {
      // The picker has already closed. Without owning Kai's model we sell the
      // entry through camera motion, suspension dip and sound.
      this._handoffText('THE LOGGING CAMP', 'GET IN.', '');
      const u = THREE.MathUtils.clamp(h.t / 0.9, 0, 1);
      const doorSide = cp.x - 1.7;
      cam.position.lerp(new THREE.Vector3(doorSide, 1.65, cp.z + 1.1), 1 - Math.exp(-dt * 8));
      cam.lookAt(cp.x, 0.85, cp.z);
      this.car.mesh.position.y = -Math.sin(u * Math.PI) * 0.07;

      if (!h.doorHit && h.t > 0.56) {
        h.doorHit = true;
        this.sound.thump(0.28, -0.3);
      }
      if (h.t > 0.95) { h.phase = 'launch'; h.t = 0; this.car.mesh.position.y = 0; }
      return true;
    }

    if (h.phase === 'launch') {
      this._handoffText('LEVEL 02', 'THE RIVER ROAD', 'DRIVE');
      const launchT = Math.min(1, h.t / 1.25);
      this.car.speed = THREE.MathUtils.lerp(0, 12, launchT);
      cp.z += this.car.speed * dt;

      // The pursuer comes through the broken checkpoint as the player launches.
      hp.z += Math.max(10, this.car.speed * 0.82) * dt;
      this.policeLights.update(dt, 'TELEGRAPH');

      const desired = new THREE.Vector3(cp.x, 3.0, cp.z - 7.2);
      cam.position.lerp(desired, 1 - Math.exp(-dt * 5.5));
      cam.lookAt(cp.x, 1.0, cp.z + 6);

      this.sound.update(dt, {
        speed: this.car.speed, maxSpeed: this.car.maxSpeed, throttle: true, boosting: false,
        skid: false, scrape: 0, falls: 0,
        handler: { dist: Math.max(1, cp.z - hp.z), dx: hp.x - cp.x, attacking: false },
        drones: [],
      });

      if (h.t > 1.55) {
        this._handoff = null;
        this._finishHandoffUi();
        this._restoreSecondaryCameras();
        this._hud?.setVisible(true);
        this._hud?.setCar(CARS[this._carIndex].name);
        this._controls?.setVisible(true);

        // Start the actual chase with a readable gap instead of immediately
        // ramming the player out of the cinematic.
        this.handler.mesh.position.set(cp.x, 0, cp.z - 32);
        this.handler.speed = 0;
        this.handler.state = 'APPROACH';
        this.handler.nextAttackAt = this.handler.elapsed + 8;
        this._normalDriveStarted = true;
      }
      return true;
    }

    return false;
  }

  /** The SHIELD reward's bubble round the car. */
  _buildShield() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x6fe3ff) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal);
          vV = normalize(cameraPosition - w.xyz); vP = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
          float bands = 0.5 + 0.5 * sin(vP.y * 9.0 - uTime * 4.0);
          gl_FragColor = vec4(uColor * (0.6 + f * 1.6), (f * 0.85 + bands * 0.08) * uAlpha); }`,
    });
    this._shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this._shield.userData.keep = true;      // survives car swaps (attachModel)
    this._shield.visible = false;
    this.car.mesh.add(this._shield);
  }

  /** Loads the shared jungle kit and plants it along every road chunk. */
  async _buildJungle(assets) {
    const [kit, mats] = await Promise.all([loadJungleKit(assets), createJungleMaterials(assets, 200)]);
    this._kit = kit;
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
    const L = this.road.chunkLength, W = this.road.roadWidth;
    // Level 1's mud trail at Level 1's texel size (a 3.25 m tile across, ~3 m
    // along), now spanning the whole carriageway; forest floor right up to it
    this.road.useTrail({ surface: tile(mats.trail, W / 3.25, L / 3), shoulder: tile(mats.forest, 0.8, L / 5) });
    this.road.decorate(
      (chunk, seed) => populateJungleChunk(chunk, kit, { length: L, roadWidth: W, seed }),
      { ground: tile(mats.forest, 80, L / 5) },
    );
    this.course.build(kit, mats);
  }

  /** Big centre-screen callout ("DODGED", "RAMMED -14"), fades by itself. */
  _flash(text, color) {
    if (!this._flashEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;top:28%;transform:translate(-50%,-50%);'
        + "font:700 clamp(24px,3.6vw,40px) 'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif;letter-spacing:.2em;"
        + 'pointer-events:none;white-space:nowrap;-webkit-text-stroke:1px rgba(0,0,0,.45);'
        + 'text-shadow:0 3px 0 rgba(0,0,0,.65),0 0 18px currentColor;transition:opacity .5s,transform .5s;opacity:0;z-index:20';
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
      const model = await this.car.attachModel(this.assets, selected.path, {
        length: selected.length, yaw: selected.yaw || 0, ground: selected.ground || null, wheels: selected.wheels || null,
      });
      this.car.applyStats(selected.stats);
      if (!model) return;
      this._carModel = model;
      if (!this._paintInfo.has(selected.path)) this._paintInfo.set(selected.path, detectPaint(model));
      this._repaint();
      const bounds = model.userData.bounds;
      this.carLights.fit(bounds, model);
      this.skids.setDims(bounds);
      this.mudSplash.setDims(bounds);
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
    const car = CARS[this._carIndex];
    const info = this._paintInfo.get(car.path);
    const color = car.paintable === false ? null : PAINTS[this._paintIndex].color;
    applyPaint(this._carModel, color, info);
  }

  _openCarPicker() {
    if (this._picker) return;
    this._selectingCar = true;
    this._orbit = 0;
    this.car.speed = 0;
    Object.keys(this._input).forEach((k) => { this._input[k] = false; });
    this._hud?.setVisible(false);
    this._controls?.setVisible(false);
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

    if (this._fromLevel1 && !this._normalDriveStarted) {
      // Selection is the only pause between running and driving. Once DRIVE is
      // pressed, return control immediately; the normal chase camera eases out
      // of the picker orbit instead of cutting through another cinematic.
      this._normalDriveStarted = true;
      this.handler.passive = false;
      this.handler.state = 'APPROACH';
      this.handler.mesh.position.z = this.car.mesh.position.z - this._transitionPoliceGap;
      this.handler.mesh.position.x = this.car.mesh.position.x + 0.7;
      this.handler.speed = Math.max(8, Math.min(14, this.car.maxSpeed * 0.28));
      this._restoreSecondaryCameras();
      this._hud?.setVisible(true);
      this._hud?.setCar(CARS[this._carIndex].name);
      this._controls?.setVisible(true);
      this._flash('LEVEL 02 \u2014 THE RIVER ROAD', '#e3bb62');
      kaiThinks('Down the river road. Lose him, then get this horn to Baba Zwane.');
      this._fromLevel1 = false;
      return;
    }

    this._restoreSecondaryCameras();
    this._hud?.setVisible(true);
    this._hud?.setCar(CARS[this._carIndex].name);
    this._controls?.setVisible(true);
  }

  /* ======================== per frame ======================== */

  update(dt, state) {
    // Legacy hand-off support. The continuous Level 01 path no longer creates
    // this state; it reaches the blue car first and opens the picker directly.
    if (this._handoff) {
      this._updateLevel1Handoff(dt);
      return;
    }

    // car picker orbit camera
    if (this._selectingCar) {
      this._updateCarPicker(dt);
      return;
    }

    // game over — freeze gameplay
    if (this._gameOver) return;

    // over the edge: the fall and the splash — the end of Level 2
    if (this._finale) { this._updateFinale(dt); return; }

    // shared Input (keyboard) + the on-screen buttons (mouse / touch) → the
    // object VehicleController already expects
    const i = this._input;
    const c = this._controls ? this._controls.state : {};
    i.forward  = this.input.isDown('forward') || !!c.forward;
    i.backward = this.input.isDown('back') || !!c.backward;
    i.left     = this.input.isDown('left') || !!c.left;
    i.right    = this.input.isDown('right') || !!c.right;
    i.boost    = this.input.isDown('boost') || !!c.boost;
    // its own binding: the shared 'jump' action also includes W and ↑
    this.input.bindings.handbrake ??= [' '];
    i.handbrake = this.input.isDown('handbrake') || !!c.handbrake;
    this._controls?.reflect(i);
    this._controls?.setFlags({ music: this.sound.musicOn, muted: this.sound.muted });

    // open car picker
    if (this.input.pressed('changeCar')) {
      this._openCarPicker();
      return;
    }

    const previousHeading = this.car.heading;
    this.car.update(dt, i);
    // the last stretch: the Handler knows what's ahead and lets you go
    this.handler.passive = this.car.mesh.position.z > COURSE_END - 450;
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
    // Mud splash from wheels — always when moving, not just when skidding
    this.mudSplash.update(dt, this.car, this.car.speed);

    this.carLights.update(dt, { braking: i.backward && this.car.speed > 1 });
    this.policeLights.update(dt, handlerState);

    this.traffic.collideBody(this.handler);       // he can barge traffic, never drive inside it
    for (const hit of this.traffic.update(dt, this.car)) {
      this._impact(hit.impact, this._mid.copy(this.car.mesh.position).setY(0.6));
      this.sound.trafficCrash(hit.impact);
      this.car.takeDamage(hit.damage);
      this.shake = Math.max(this.shake, 0.35 + hit.impact * 0.9);
    }

    this.road.update(this.car.mesh.position);

    // rewards along the road
    for (const got of this.pickups.update(dt, this.car)) this._reward(got);
    this._updateShield(dt);

    this._updateWorld(dt);


    this._updateSecondaryCams();

    this._updateCamera(dt);


    // HUD
    this._time += dt;
    this._topSpeed = Math.max(this._topSpeed, Math.abs(this.car.speed));
    const route = this.course.progress(this.car.mesh.position.z);
    this._hud?.update({
      speed: this.car.speed,
      dist,
      heat: this.car.heat,
      health: this.car.health,
      maxHealth: this.car.maxHealth,
      overheated: this.car.overheated,
      handlerState: this.handler.label,
      toEnd: route.left,
      progress: route.t,
      buffs: [
        { label: 'SHIELD', t: this.car.shield, color: '#6fe3ff' },
        { label: 'NITRO', t: this.car.freeBoost, color: '#ff8a2a' },
      ].filter((b) => b.t > 0),
    });

    // ---- sound ----
    // his telegraph is his horn — the ranger bearing down, in his voice
    if (handlerState === 'TELEGRAPH' && this._prevHState !== 'TELEGRAPH') this.sound.horn();
    this._prevHState = handlerState;
    const p = this.car.mesh.position;
    // the living bed's world: the jungle thins out along the route, the storm
    // darkens toward night insects, and the rain ramp matches 2B's overlay
    const alongJungle = 1 - 0.65 * THREE.MathUtils.smoothstep(route.t, 0.1, 0.5);
    const alongNight = THREE.MathUtils.smoothstep(route.t, 0.35, 0.75);
    this.sound.update(dt, {
      speed: this.car.speed,
      maxSpeed: this.car.maxSpeed,
      throttle: i.forward || i.boost,
      boosting: this.car.boosting,
      health: this.car.maxHealth ? this.car.health / this.car.maxHealth : 1,
      skid: skidding,
      scrape: this.car.wallHit,
      falls: this.course.roar(p.z) * 0.35,
      jungle: alongJungle,
      night: alongNight,
      rain: this._rainLevel || 0,
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

    // health-loss cue: fires on real drops only — heals and restarts jump up,
    // and the drop to zero is the defeat sting's job
    if (
      this._lastHealth !== undefined &&
      this.car.health > 0 &&
      this.car.health < this._lastHealth - 0.5 &&
      !this._finale
    ) {
      this.sound.hurt(Math.min(1, (this._lastHealth - this.car.health) / 22));
    }
    this._lastHealth = this.car.health;

    // drove off the end of the road: over the falls
    if (this.car.mesh.position.z > COURSE_END + 0.3 && !this._finale) this._startFall();

    // game over
    if (this.car.health <= 0 && !this._gameOver && !this._finale) {
      this._gameOver = true;
      this.sound.crash(1);
      this.sound.silenceEngine();
      this._showGameOver();
    }
  }

  /** Sky, sun, pollen, shafts, wildlife, water — the world that travels with you. */
  _updateWorld(dt) {
    const p = this.car.mesh.position;
    this._sky.position.copy(this.game.camera.position);
    this._pollen.position.set(p.x, 0, p.z + 30);
    this._shafts.position.set(p.x * 0.3, 0, p.z + 18);
    for (const sh of this._shafts.children) {
      sh.material.uniforms.uOpacity.value = 0.11 + Math.sin(this._time * 0.7 + sh.position.z) * 0.03;
    }
    // Level 1's wildlife update, in its mirrored frame (it runs toward -z);
    // then pushed out past our wider road and down to our flat ground
    const w = this._wildlife;
    updateJungleWildlife(w, dt, -p.z, p.x);
    for (const b of w.birds) b.position.y -= jungleCourseHeight(b.position.z);
    for (const b of w.butterflies) {
      b.position.x = p.x + (b.position.x - p.x) * 1.9;
      b.position.y -= jungleCourseHeight(b.position.z);
    }
    // the gorge opens up ahead: thinner haze, so you can see the drop
    const roar = this.course.roar(p.z);
    this.scene.fog.density = 0.014 - 0.0095 * roar;
    this.course.update(dt);
    this._sun.position.copy(p).add(this._sunOffset);
    this._sun.target.position.copy(p);

    // ---- rain overlay — @2B ----
    // Rain starts at ~60% progress, full by ~80%
    const progress = THREE.MathUtils.clamp(this.handler.dist / COURSE_END, 0, 1);
    const rainT = THREE.MathUtils.smoothstep(progress, 0.55, 0.8);
    this._rainMat.uniforms.uIntensity.value = rainT;
    this._rainMat.uniforms.uTime.value += dt;
    this._rainLevel = rainT; // the sound bed rains with the overlay
  }

  /** A pickup was driven through. */
  _reward(got) {
    const car = this.car;
    this._rewards++;
    if (got.kind === 'REPAIR') car.heal(25);
    else if (got.kind === 'HEART') { car.maxHealth = Math.min(150, car.maxHealth + 10); car.heal(10); }
    else if (got.kind === 'NITRO') { car.heat = 0; car.overheated = false; car.freeBoost = 4; }
    else if (got.kind === 'SHIELD') car.shield = 6;
    this.sound.pickup(got.kind);
    this._flash(got.label, '#' + got.color.toString(16).padStart(6, '0'));
    this._punch = Math.max(this._punch || 0, 0.25);
  }

  _updateShield(dt) {
    const sh = this._shield;
    const t = this.car.shield;
    sh.visible = t > 0;
    if (!sh.visible) return;
    const b = this.car.bounds || { halfW: 0.9, halfL: 2 };
    sh.scale.set(b.halfW / 0.45 * 0.62, 1.25, b.halfL / 0.46 * 0.62);
    sh.position.y = 0.7;
    sh.material.uniforms.uTime.value += dt;
    // fades in, and flickers in its last second and a half
    const flicker = t < 1.5 ? (Math.sin(t * 30) > 0 ? 1 : 0.25) : 1;
    sh.material.uniforms.uAlpha.value = Math.min(1, (6 - t) * 4) * flicker;
  }

  /* ======================== the falls ======================== */

  _startFall() {
    const car = this.car;
    const v = Math.max(car.speed, 14);
    const p = car.mesh.position;
    const side = p.x > 0 ? -1 : 1;
    this._finale = {
      phase: 'fall', t: 0, pitch: 0,
      vx: Math.sin(car.heading) * v, vz: Math.cos(car.heading) * v, vy: 1.2,
      // the shot: the camera flies out into the gorge, off to one side, and
      // watches the car go down past the falls
      cam: new THREE.Vector3(p.x + side * 34, -14, COURSE_END + 36),
      look: p.clone(),
    };
    car.mesh.rotation.order = 'YXZ';
    this._hud?.setVisible(false);
    this._controls?.setVisible(false);
    if (this._arrow) this._arrow.style.opacity = '0';
    this.game.removeSecondaryCamera('rearview');
    this.game.removeSecondaryCamera('minimap');
    this._flash('OVER THE FALLS', '#e3bb62');
  }

  _updateFinale(dt) {
    const f = this._finale;
    const car = this.car;
    const p = car.mesh.position;
    f.t += dt;
    this._time += dt;

    if (f.phase === 'fall') {
      f.vy -= 18 * dt;
      const drag = Math.exp(-0.45 * dt);
      f.vx *= drag; f.vz *= drag;
      p.x += f.vx * dt; p.y += f.vy * dt; p.z += f.vz * dt;
      f.pitch = Math.min(1.15, f.pitch + dt * 0.6);          // nose drops as it goes over
      car.mesh.rotation.set(f.pitch, car.heading, Math.sin(f.t * 1.8) * 0.08);
      spinWheels(car.model, car.speed, 0, dt);
      if (p.y <= -DROP + 0.3) {
        f.phase = 'splash'; f.t = 0;
        p.y = -DROP + 0.3;
        this.course.splash(p);
        // hold the last shot on the splash and the falls behind it
        f.splashAt = p.clone();
        // from the downstream side, looking back: the splash with the falls behind it
        f.cam.set(p.x + Math.sign(f.cam.x - p.x) * 16, -DROP + 9, p.z + 42);
        f.splashAt.y = -DROP + 6;
        this.sound.splash();
        this.sound.silenceEngine();
        this.shake = 1.2;
        this._impact(0.5, null);
        // the level ends in the water: flag it for whoever picks up from here
        this.finished = true;
        this.state.level2Complete = true;
      }
    } else {
      p.y = Math.max(-DROP - 3, p.y - dt * 1.4);              // it sinks into the pool
      // hold on the splash for a few seconds, then the win card
      if (f.t > 3.5 && !this._survivedCard) this._showSurvivedCard();
      car.mesh.rotation.x = Math.min(1.4, car.mesh.rotation.x + dt * 0.2);
    }

    // the Handler brakes hard and stops short of the edge
    const h = this.handler;
    h.speed *= Math.exp(-1.6 * dt);
    h.mesh.position.z = Math.min(h.mesh.position.z + h.speed * dt, COURSE_END - 7);
    this.policeLights.update(dt, 'APPROACH');

    // camera: glide to the lip of the falls and follow the car down
    const cam = this.game.camera;
    // out over the edge first, then down (so it never dips into the cliff top)
    const kxz = 1 - Math.exp(-dt * 2.2), ky = 1 - Math.exp(-dt * (cam.position.z > COURSE_END + 4 ? 2.2 : 0.6));
    cam.position.x += (f.cam.x - cam.position.x) * kxz;
    cam.position.z += (f.cam.z - cam.position.z) * kxz;
    cam.position.y += (f.cam.y - cam.position.y) * ky;
    f.look.lerp(f.splashAt || p, 1 - Math.exp(-dt * (f.splashAt ? 2 : 6)));
    const look = f.look.clone();
    if (this.shake > 0.005) {
      look.x += Math.sin(f.t * 41) * 0.5 * this.shake;
      look.y += Math.sin(f.t * 37.7) * 0.4 * this.shake;
      this.shake *= Math.exp(-4 * dt);
    }
    cam.lookAt(look);
    if (this._baseFov !== undefined) {
      cam.fov += (this._baseFov + 6 - cam.fov) * (1 - Math.exp(-dt * 2));
      cam.updateProjectionMatrix();
    }

    this._updateWorld(dt);
    this.sound.update(dt, {
      speed: f.phase === 'fall' ? car.speed : 0, maxSpeed: car.maxSpeed, throttle: false, boosting: false,
      health: car.maxHealth ? car.health / car.maxHealth : 1,
      skid: false, scrape: 0, falls: 0.4, falling: f.phase === 'fall',
      jungle: 0.15, night: 0.8, rain: this._rainLevel || 0,
      handler: { dist: 60, dx: 0, attacking: false }, drones: [],
    });
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
    // when he's tailgating, he'd sit between the camera and your car: lift
    // the camera and tilt down so you see over him
    const hz = car.mesh.position.z - this.handler.mesh.position.z;
    const hx = Math.abs(this.handler.mesh.position.x - car.mesh.position.x);
    const close = hz > 0 && hz < 12 && hx < 2.5 ? THREE.MathUtils.clamp((12 - hz) / 6, 0, 1) : 0;
    this._lift = (this._lift || 0) + (close - (this._lift || 0)) * (1 - Math.exp(-dt * 3));
    const back = 7.4 + v * 1.8 - this._lift * 0.8, up = 3.3 + v * 0.4 + this._lift * 2.6;
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
      el.style.cssText = "position:fixed;top:50%;z-index:16;pointer-events:none;font:700 22px 'Palatino Linotype',Palatino,Georgia,serif;"
        + 'color:#f2934f;text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 14px rgba(201,68,43,.9);letter-spacing:.2em;opacity:0;transition:opacity .15s;white-space:nowrap';
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
    // low enough that Level 1's thicker fog doesn't white it out
    this._minimap.position.set(this.car.mesh.position.x, 40, this.car.mesh.position.z);
    this._minimap.lookAt(this.car.mesh.position);
  }

  /* ======================== car picker camera ======================== */

  _updateCarPicker(dt) {
    this._updateSecondaryCams();
    this._updateWorld(dt);
    if (this._fromLevel1 && !this._normalDriveStarted) {
      // The menu is a pause in gameplay, not a pause in the world: police
      // lights keep flashing behind the selected car and the ranger idles at
      // the smashed checkpoint so the chase still feels present.
      this.policeLights.update(dt, 'APPROACH');
      this.sound.update(dt, {
        speed: 0, maxSpeed: this.car.maxSpeed, throttle: false, boosting: false,
        skid: false, scrape: 0, falls: 0,
        handler: { dist: this._transitionPoliceGap, dx: this.handler.mesh.position.x - this.car.mesh.position.x, attacking: false },
        drones: [],
      });
    }
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

  /** After the splash: the team's win card; CONTINUE goes on to level 03. */
  _showSurvivedCard() {
    this.sound.win(); // the same fanfare Level 1 plays on its win
    const integrity = Math.round((100 * this.car.health) / this.car.maxHealth);
    this._survivedCard = showEndCard({
      kind: 'win',
      title: 'SURVIVED',
      sub: 'You went over the falls. He stopped at the edge.',
      lines: [{ text: `${Math.round(this.state.distance)} M  ·  INTEGRITY ${integrity}%  ·  RAMS TAKEN ${this._rams || 0}` }],
      action: { label: 'CONTINUE', key: 'SPACE', onClick: () => this._handOff() },
    });
  }

  /**
   * On to level 03. Deferred to a microtask, as in Level01._startLevel02, so
   * this level is not torn down from inside its own update().
   */
  _handOff() {
    if (this._handedOff) return;
    this._handedOff = true;
    const game = this.game;
    if (!game.levels.has('level03')) return;
    game.setPaused(true);
    Promise.resolve().then(async () => {
      try {
        await game.setLevel('level03');
      } catch (err) {
        console.error('[level02] handoff failed', err);
      } finally {
        game.setPaused(false);
      }
    });
  }

  /* ======================== game over ======================== */

  _showGameOver() {
    this.sound.defeat(); // the shared losing sting
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
        this.car.health = this.car.maxHealth;
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
    clearThoughts();
    this.game.removeSecondaryCamera('rearview');
    this.game.removeSecondaryCamera('minimap');
    this.game.removeOverlay('rain');
    if (this._rainMat) this._rainMat.dispose();
    this._hud?.destroy();
    this._picker?.destroy();
    this._survivedCard?.destroy();
    this._gameOverScreen?.destroy();
    this._flashEl?.remove();
    this._vignette?.remove();
    this.game?.camera?.clearViewOffset();
    this._arrow?.remove();
    this._controls?.destroy();
    this._handoffUi?.remove();
    this._handoffUi = null;
    this.course?.dispose();
    clearTimeout(this._hitStop);
    if (this.state) this.state.timeScale = 1;
    if (this._baseFov !== undefined && this.game?.camera) {
      this.game.camera.fov = this._baseFov;        // the camera is shared with the other levels
      this.game.camera.updateProjectionMatrix();
    }
    this.sound?.dispose();
    this._flashEl = null;
    if (this.road) this.road.dispose();
    if (this.mudSplash) this.mudSplash.dispose();
    super.teardown();
  }
}
