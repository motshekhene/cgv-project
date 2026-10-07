import * as THREE from 'three';
import { Cutscene, smooth, lerp } from '../Cutscene.js';
import { loadCast, makeKai, syncClip } from '../cast.js';
import { Burst } from '../fx.js';
import {
  loadJungleKit, createJungleMaterials, createJungleSky, createPollen, createLightShaft, createSign,
} from '../../levels/level1/jungleWorld.js';
import { attachModel } from '../../levels/level2/attachModel.js';
import { CarLights, PoliceLights } from '../../levels/level2/carLights.js';
import { spinWheels } from '../../levels/level2/wheels.js';
import { TyreTracks } from '../../levels/level2/skids.js';
import { CARS, HANDLER_MODEL, HANDLER_OPTIONS, loadSavedCar, loadSavedPaint } from '../../levels/level2/carSelect.js';
import { PAINTS, applyPaint, detectPaint } from '../../levels/level2/paint.js';

/**
 * Between Level 1 and Level 2, "Out of the jungle" (~10.4 s).
 *
 * Level 1 ends with Kai reaching the car in the bay at the end of the trail;
 * Level 2 starts with him already driving down the River Road. This is the
 * bit in between, so the two levels read as one chase:
 *
 *   A   0.0  the bay at the end of the trail: Kai runs in and gets into the car        card: THE RIVER ROAD
 *   B   3.2  low on the logging track: headlights on, the car pulls out and roars past the camera
 *   C   5.6  across the River Road: the car bursts out of the treeline and swings onto the road
 *   C2  8.0  looking back down the track: the Handler's lights coming through the trees
 *                                                                                    card: HEADLIGHTS
 *   D   9.0  ease into Level 2's chase camera, letterbox down, "DRIVE" -> onDone()
 *
 * The car is the one Level 2 will hand you (the last one you picked, in its
 * paint), the Handler's Range Rover is his Level 2 car, and the jungle, mud
 * and light are Level 2's own (Level 1's kit and materials), so the cut into
 * the level is seamless. Its models land in the AssetRegistry cache here, so
 * Level 2 builds without downloading them again.
 *
 * Layout: the track runs north (+z) from the bay at the origin and meets the
 * River Road, which runs east (+x) along z = ROAD_Z. The car's route is one
 * curve through all of it, so any moment can be looked up by distance.
 */
const HANDOFF = 10.4;
const ROAD_Z = 82;
const ROAD_W = 24;
const TRACK_W = 6;
const BAY = new THREE.Vector3(0, 0, 2);
const BAY_R = 11;
const CAR_START = 44;                // where the car is parked, as a distance along the route
const CAR_GO = 3.7;                  // pulls away
const HANDLER_GO = 7.4;
const FOG = 0xcfd6a8;                // Level 2's fog

/** Distance along a route for something that waits, speeds up at `acc` and holds `v`. */
function driven(s, go, acc, v) {
  const u = s - go;
  if (u <= 0) return 0;
  const tAcc = v / acc;
  return u < tAcc ? 0.5 * acc * u * u : 0.5 * acc * tAcc * tAcc + v * (u - tAcc);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A kit prototype flattened to [{ geometry, material, local matrix }], for instancing. */
function partsOf(proto) {
  const root = proto.clone(true);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, local: o.matrixWorld.clone() }); });
  return parts;
}

export class DriveOutIntro extends Cutscene {
  constructor(opts) {
    super('level02-intro', opts);
    this.length = HANDOFF;
    this.ending = 'handoff';
    this.popupWord = 'DRIVE';
    this.far = 300;
    this.shots = [
      { id: 'A', at: 0 },
      { id: 'B', at: 3.2 },
      { id: 'C', at: 6.3 },
      { id: 'C2', at: 8.0 },
      { id: 'D', at: 9.0, blend: true },
    ];
    // one route: out of the trees behind the bay, through the bay, up the
    // track, a hard right onto the River Road and away east
    this.route = new THREE.CatmullRomCurve3([
      [0, 0, -40], [0, 0, -10], [0, 0, 4], [0, 0, 30], [0, 0, 56], [1.5, 0, 68], [8, 0, 78], [20, 0, ROAD_Z + 1],
      [45, 0, ROAD_Z + 2], [120, 0, ROAD_Z + 2], [600, 0, ROAD_Z + 2],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
    this.routeLength = this.route.getLength();
    this.kaiPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.2, 0, -16), new THREE.Vector3(0.6, 0, -6), new THREE.Vector3(-1.4, 0, 1), new THREE.Vector3(-1.75, 0, 3.6),
    ]);
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  /** Car distance along the route at scene time s. */
  carDist(s) {
    return CAR_START + driven(s, CAR_GO, 9, 27);
  }

  handlerDist(s) {
    return 22 + driven(s, HANDLER_GO, 14, 34);
  }

  /** Puts a vehicle on the route at distance d: position, heading and a lean into the turn. */
  _place(holder, d) {
    const u = THREE.MathUtils.clamp(d / this.routeLength, 0, 1);
    this.route.getPointAt(u, this._p);
    this.route.getTangentAt(u, this._t);
    holder.position.copy(this._p);
    const heading = Math.atan2(this._t.x, this._t.z);
    // how hard it's turning: heading a couple of metres on
    const ahead = this.route.getTangentAt(Math.min(1, u + 3 / this.routeLength));
    const turn = THREE.MathUtils.clamp(Math.atan2(ahead.x, ahead.z) - heading, -0.5, 0.5);
    holder.rotation.set(0, heading, -turn * 0.35);
    return heading;
  }

  async build(assets) {
    const carDef = CARS[loadSavedCar()];
    const [cast, kit, mats] = await Promise.all([
      loadCast(assets),
      loadJungleKit(assets),
      createJungleMaterials(assets, 200),
      // Level 2's models: loaded once here, cached for the level
      ...[HANDLER_MODEL, ...CARS.map((c) => c.path)].map((p) => assets.model(p).catch(() => null)),
    ]);
    if (!this.scene) return;
    this.kit = kit;

    this._buildLight();
    this._buildGround(mats);
    this._buildBay(kit);
    this._buildRails();
    this._plant(kit);

    const sign = createSign('THE FALLS  4 KM', { width: 3.2, height: 1.0 });
    sign.position.set(-6, 0, ROAD_Z + ROAD_W / 2 + 2.5);
    sign.rotation.y = Math.PI + 0.25;
    this.root.add(sign);

    // the car Level 2 hands you, in its paint
    this.car = new THREE.Group();
    this.root.add(this.car);
    this.carModel = await attachModel(assets, this.car, carDef.path, {
      length: carDef.length, yaw: carDef.yaw || 0, ground: carDef.ground || null, wheels: carDef.wheels || null,
    });
    if (!this.scene) return;
    if (this.carModel) {
      const paint = PAINTS[loadSavedPaint()];
      if (carDef.paintable !== false && paint) applyPaint(this.carModel, paint.color, detectPaint(this.carModel));
      this.lights = new CarLights(this.car);
      this.lights.fit(this.carModel.userData.bounds, this.carModel);
    }

    // the Handler's Range Rover, lights flashing, out of the trees behind
    this.handlerCar = new THREE.Group();
    this.root.add(this.handlerCar);
    const hm = await attachModel(assets, this.handlerCar, HANDLER_MODEL, HANDLER_OPTIONS);
    if (!this.scene) return;
    this.handlerModel = hm;
    this.police = new PoliceLights(this.handlerCar);
    if (hm) this.police.fit(hm.userData.bounds, hm);

    this.kai = makeKai(this.root, cast.kai);
    this.tracks = new TyreTracks(this.root, { maxQuads: 1500, life: 30 });

    // mud thrown up by the back wheels as it pulls away, and on the turn
    this.spray = [
      new Burst(this.root, { at: new THREE.Vector3(0, 0.2, 2), start: CAR_GO, count: 30, color: 0x5a3e28, speed: 3.4, size: 0.34, lift: 2, dir: new THREE.Vector3(0, 0.3, -1), spread: 1.4, life: 0.9, seed: 31 }),
      new Burst(this.root, { at: new THREE.Vector3(10, 0.2, 79), start: 7.0, count: 40, color: 0x6a4a2e, speed: 5, size: 0.4, lift: 2.4, dir: new THREE.Vector3(-0.6, 0.3, -0.6), spread: 2, life: 1.1, seed: 32 }),
    ];

    this.at(0.4, () => this.story.showCard('THE RIVER ROAD', 'Out of the jungle. The falls are four kilometres east.'));
    this.at(3.4, () => this.story.hideCard());
    this.at(CAR_GO, () => this.shake(0.15), { fx: true });
    this.at(8.15, () => this.story.showCard('HEADLIGHTS', 'He found a car too.'));
    this.at(9.2, () => this.story.hideCard());
  }

  /* ------------------------------------------------------------ the set */

  /** Level 2's sky, fog and light rig. */
  _buildLight() {
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.FogExp2(FOG, 0.012);
    this.sky = createJungleSky();
    this.sky.material.uniforms.uSunDir.value.set(0.55, 0.5, 0.65).normalize();
    this.root.add(this.sky);
    this.root.add(new THREE.HemisphereLight(0xbfdcff, 0x4a5a26, 0.6));
    const sun = new THREE.DirectionalLight(0xffd29a, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 170 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.root.add(sun, sun.target);
    this.sun = sun;
    this.pollen = createPollen(420);
    this.root.add(this.pollen);
    this.shafts = [];
    for (const [x, z, w] of [[-3, 8, 2.6], [4, 34, 3], [-2, 58, 2.4], [24, 84, 3.4]]) {
      const s = createLightShaft(w);
      s.position.set(x, 28, z);
      this.root.add(s);
      this.shafts.push(s);
    }
  }

  /** Forest floor everywhere, the mud track, the bay clearing and the River Road. */
  _buildGround(mats) {
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
    const plane = (w, d, mat, x, z, y = 0, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.set(-Math.PI / 2, 0, ry);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };
    plane(700, 320, tile(mats.forest, 140, 64), 150, 60, -0.01);
    // the track: same mud as Level 1's trail
    plane(TRACK_W, 110, tile(mats.trail, TRACK_W / 3.25, 110 / 3), 0, 18, 0.01);
    // the bay at its foot, where Level 1 left the car
    const bay = new THREE.Mesh(new THREE.CircleGeometry(BAY_R, 40), tile(mats.trail, 7, 7));
    bay.rotation.x = -Math.PI / 2;
    bay.position.set(BAY.x, 0.015, BAY.z);
    bay.receiveShadow = true;
    this.root.add(bay);
    // the River Road, Level 2's carriageway, running east
    plane(700, ROAD_W, tile(mats.trail, 700 / 3, ROAD_W / 3.25), 150, ROAD_Z, 0.02);
    // and the mouth of the track, flared where it meets the road
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(8, 24, Math.PI, Math.PI), tile(mats.trail, 4, 2));
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.set(3, 0.018, ROAD_Z - ROAD_W / 2 + 0.5);
    mouth.receiveShadow = true;
    this.root.add(mouth);
  }

  /** Level 1's bay: log piles, crates, a barrel, cut trees and a work light. */
  _buildBay(kit) {
    const put = (proto, x, z, s, ry) => {
      if (!proto) return;
      const o = proto.clone(true);
      o.position.set(BAY.x + x, 0, BAY.z + z);
      o.scale.setScalar(s);
      o.rotation.y = ry;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      this.root.add(o);
    };
    // all on the far side of the bay, so the way out up the track is clear
    put(kit.logs, -5.6, -5, 4, 0.4);
    put(kit.logs, 6, -6.5, 4, -0.25);
    put(kit.crates, -3.5, -9.5, 14, 0.6);
    put(kit.barrel, 5.2, -2.4, 14, -0.4);
    put(kit.barrel, 6, -1.4, 14, 0.9);
    put(kit.cutTrees, 9, -9, 8, 0.2);
    put(kit.cutTrees, -9.5, -8, 8, 2.1);
    const work = new THREE.PointLight(0xffd39b, 2.1, 22, 2);
    work.position.set(-3, 5, BAY.z + 2);
    this.root.add(work);
  }

  /** Level 2's wooden rails along both sides of the road, open where the track comes out. */
  _buildRails() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b4127, roughness: 0.95 });
    const spots = [];
    for (const side of [-1, 1]) {
      const z = ROAD_Z + side * (ROAD_W / 2 + 0.3);
      for (let x = -150; x < 450; x += 3) {
        if (side < 0 && x > -7 && x < 13) continue;              // the track's mouth
        spots.push([x, z]);
      }
    }
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), wood, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => post.setMatrixAt(i, m.makeTranslation(x, 0.55, z)));
    post.castShadow = true;
    this.root.add(post);
    for (const side of [-1, 1]) {
      const z = ROAD_Z + side * (ROAD_W / 2 + 0.3);
      const spans = side < 0 ? [[-150, -7], [13, 450]] : [[-150, 450]];
      for (const [a, b] of spans) {
        for (const y of [0.55, 0.95]) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.1, 0.08), wood);
          beam.position.set((a + b) / 2, y, z);
          this.root.add(beam);
        }
      }
    }
  }

  /**
   * The jungle: dense either side of the track so it reads as a tunnel,
   * then a wall of trees along both sides of the road. Instanced per model,
   * the same way JungleRoadside plants Level 2.
   */
  _plant(kit) {
    const r = rng(41);
    const clear = (x, z, pad) => {
      if (Math.hypot(x - BAY.x, z - BAY.z) < BAY_R + pad) return false;            // the bay
      if (Math.abs(x) < TRACK_W / 2 + pad && z > -45 && z < ROAD_Z) return false;   // the track
      if (Math.abs(z - ROAD_Z) < ROAD_W / 2 + pad) return false;                     // the road
      if (z > ROAD_Z - 24 && z < ROAD_Z && x > -4 - pad && x < 14 + pad) return false; // where it turns
      return true;
    };
    const placements = new Map();
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const put = (proto, x, z, scale, y = 0) => {
      if (!proto) return;
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      if (!placements.has(proto)) placements.set(proto, []);
      placements.get(proto).push(new THREE.Matrix4().compose(p.set(x, y, z), q, s.setScalar(scale)));
    };
    const pick = (list) => list[Math.floor(r() * list.length)];
    const trees = [kit.tree1, kit.tree2, kit.tree3, kit.tree4, kit.ruinTree].filter(Boolean);
    const bushes = [kit.bush1, kit.bush2, kit.bush3].filter(Boolean);
    const grass = [kit.grass1, kit.grass2, kit.grass3].filter(Boolean);
    const small = [kit.treeSmall1, kit.treeSmall2, kit.treeCluster].filter(Boolean);

    // along the track and round the bay: close and thick
    for (let z = -45; z < ROAD_Z - 10; z += 3 + r() * 3) {
      for (const sd of [-1, 1]) {
        const tx = sd * (TRACK_W / 2 + 3 + r() * 6), tx2 = sd * (TRACK_W / 2 + 11 + r() * 22);
        if (clear(tx, z, 2)) put(pick(trees), tx, z, 0.02 + r() * 0.012);
        if (clear(tx2, z, 2)) put(pick(trees), tx2, z, 0.024 + r() * 0.01);
        const bx = sd * (TRACK_W / 2 + 0.8 + r() * 4);
        if (clear(bx, z, 0.5)) put(pick(bushes), bx, z, 0.012 + r() * 0.008);
        const gx = sd * (TRACK_W / 2 + 0.3 + r() * 2.5);
        if (clear(gx, z, 0.1)) put(pick(grass), gx, z, 0.011 + r() * 0.008);
        if (r() < 0.25) { const sx = sd * (TRACK_W / 2 + 6 + r() * 10); if (clear(sx, z, 2)) put(pick(small), sx, z, 6 + r() * 3); }
      }
    }
    // the River Road's tree walls, east and west, out into the fog
    for (let x = -150; x < 450; x += 4 + r() * 4) {
      for (const sd of [-1, 1]) {
        const z1 = ROAD_Z + sd * (ROAD_W / 2 + 6 + r() * 9), z2 = ROAD_Z + sd * (ROAD_W / 2 + 18 + r() * 40);
        if (clear(x, z1, 2)) put(pick(trees), x, z1, 0.02 + r() * 0.012);
        if (clear(x, z2, 2)) put(pick(trees), x, z2, 0.024 + r() * 0.01);
        const bz = ROAD_Z + sd * (ROAD_W / 2 + 2.5 + r() * 6);
        if (clear(x, bz, 0.5)) put(pick(bushes), x, bz, 0.012 + r() * 0.008);
        const gz = ROAD_Z + sd * (ROAD_W / 2 + 1.4 + r() * 3);
        if (clear(x, gz, 0.1)) put(pick(grass), x + r() * 2, gz, 0.011 + r() * 0.008);
      }
    }
    // the jungle filling everything in between
    for (let i = 0; i < 900; i++) {
      const x = -120 + r() * 300, z = -60 + r() * 200;
      if (clear(x, z, 6)) put(pick(trees), x, z, 0.022 + r() * 0.012);
    }

    for (const [proto, list] of placements) {
      for (const part of partsOf(proto)) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        const tmp = new THREE.Matrix4();
        list.forEach((pm, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(pm, part.local)));
        inst.computeBoundingSphere();
        this.root.add(inst);
      }
    }
  }

  /* ------------------------------------------------------------ every frame */

  pose(t, s, ds, dt) {
    // ---- the car: parked, lights on, away up the track and onto the road
    const cd = this.carDist(s);
    const heading = this._place(this.car, cd);
    const cp = this.car.position;
    const speed = (this.carDist(s + 0.05) - cd) / 0.05;
    const idling = s > 3.0 && s < CAR_GO + 0.3;
    this.car.position.y = idling ? Math.sin(t * 60) * 0.01 : 0;          // the engine catching
    this.car.rotation.x = -smooth(CAR_GO, CAR_GO + 0.3, s) * 0.035 * (1 - smooth(CAR_GO + 0.6, CAR_GO + 1.5, s)); // squats as it pulls away
    if (this.carModel) spinWheels(this.carModel, speed, THREE.MathUtils.clamp(this.car.rotation.z * -4, -1, 1), ds);
    if (this.lights) {
      const on = s > 3.0;
      for (const l of this.lights.spots || []) l.visible = on;
      this.lights.update(dt, { braking: s > 6.6 && s < 7.3 });                 // a dab of brake for the turn
    }

    // ---- Kai: across the bay to the driver's door, then he's in
    const kai = this.kai;
    const inCar = t >= 3.0;
    kai.root.visible = !inCar;
    if (!inCar) {
      const run = smooth(0, 0.35, t);
      const u = Math.min(1, (t * 6.4 * run + 0.4) / this.kaiPath.getLength());
      this.kaiPath.getPointAt(u, kai.root.position);
      const tan = this.kaiPath.getTangentAt(u);
      kai.root.rotation.y = Math.atan2(tan.x, tan.z);
      const want = u >= 1 ? 'idle' : 'run';
      if (kai.currentName !== want) {
        kai.play(want, { fade: 0.15 });
        if (want === 'run') syncClip(kai, s);
      }
      kai.update(ds);
    }

    // ---- the Handler, out of the trees behind the bay
    const hd = this.handlerDist(s);
    this._place(this.handlerCar, hd);
    this.handlerCar.visible = s > HANDLER_GO - 0.2;
    if (this.handlerModel) spinWheels(this.handlerModel, (this.handlerDist(s + 0.05) - hd) / 0.05, 0, ds);
    this.police?.update(dt, s > 8.4 ? 'TELEGRAPH' : 'APPROACH');
    const hp = this.handlerCar.position;

    // tread prints up the track and onto the road, like Level 2's
    this.tracks.follow('car', this.car, heading, this.carModel?.userData.bounds);
    if (this.handlerCar.visible) this.tracks.follow('handler', this.handlerCar, this.handlerCar.rotation.y, this.handlerModel?.userData.bounds);
    this.tracks.update(ds);

    // mud follows the wheels
    this.spray[0].at.set(cp.x, 0.2, cp.z - 2.2);
    for (const b of this.spray) b.update(s);

    // ---- camera
    const sh = Math.sin(heading), ch = Math.cos(heading);
    if (this.shot === 'A') {
      // in front of the car, Kai running in across the bay toward it
      const k = smooth(0, 3.2, t);
      this.frame(new THREE.Vector3(lerp(-5.2, -4.4, k), lerp(1.45, 1.3, k), lerp(11, 10, k)),
        new THREE.Vector3(lerp(kai.root.position.x, -1.2, 0.35), 1.05, lerp(kai.root.position.z, 3, 0.35)), { fov: 46, rate: 5 });
    } else if (this.shot === 'B') {
      // on the track ahead: the headlights, then it fills the frame and goes by
      this.frame(new THREE.Vector3(-2.3, 0.75, 17), new THREE.Vector3(cp.x, 0.9, cp.z + 1), { fov: 40, rate: 7 });
    } else if (this.shot === 'C') {
      // over the road from the track's mouth: it bursts out and swings away east
      this.frame(new THREE.Vector3(-9, 1.5, ROAD_Z + 11), new THREE.Vector3(cp.x, 1.1, cp.z), { fov: 48, rate: this.shotT < 0.05 ? Infinity : 3.2 });
    } else if (this.shot === 'C2') {
      // standing in the road, looking back down the track at what's coming
      this.frame(new THREE.Vector3(2.5, 2.4, ROAD_Z - 4), new THREE.Vector3(hp.x, 1.2, hp.z), { fov: 30, rate: 6 });
    } else {
      // Level 2's chase camera (Level02._updateCamera at speed): behind, up, looking ahead
      const v = Math.min(1, speed / 43);
      const back = 7.4 + v * 1.8, up = 3.3 + v * 0.4;
      this.frame(new THREE.Vector3(cp.x - sh * back, up, cp.z - ch * back),
        new THREE.Vector3(cp.x + sh * (5 + v * 7), 1.1, cp.z + ch * (5 + v * 7)), { fov: 62 + v * 9, rate: t > HANDOFF ? 8 : 3 });
    }

    // ---- the world round the camera
    const cam = this.game.camera;
    this.sky.position.copy(cam.position);
    this.pollen.position.set(cam.position.x, 0, cam.position.z + 20);
    for (const sh2 of this.shafts) sh2.material.uniforms.uOpacity.value = 0.11 + Math.sin(t * 0.7 + sh2.position.z) * 0.03;
    const focus = t < 3.2 ? BAY : cp;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(new THREE.Vector3(45, 55, 60));
  }
}
