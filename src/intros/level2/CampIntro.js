import * as THREE from 'three';
import { TINT, place, scatter, sign, rng } from '../../levels/jungle/props.js';
import { RIVER_SUNSET } from '../../levels/jungle/palette.js';
import { createWaterMaterial } from '../../shaders/water.js';
import { Cutscene, smooth, lerp } from '../Cutscene.js';
import { loadCast, makeKai, syncClip } from '../cast.js';
import { Burst, Pollen, dotTexture } from '../fx.js';
import { makeJeep, makeSuv, Route } from '../vehicles.js';
import { safeProp, safePbr, loadJungleKit, buildSkyAndLights, buildGround, plantJungle, addShafts, pathStrip, box } from '../world.js';

/**
 * Level 2 intro, "The logging camp" (~10 s). docs/LEVEL1_2_INTROS_AND_WINS.md
 *
 *   A   0.0  low over the log piles at sunset: Kai runs through the camp to the jeep   card: THE RIVER ROAD
 *   B   3.4  the jeep's front quarter: headlights on, wheels spin, it pulls out past the camera
 *   C1  6.0  roadside by the SITE 7 · 12 km sign: the jeep roars past toward the low sun, the river on the left
 *   C2  7.2  looking back over the jeep's tail: two headlights snap on in the trees behind the camp
 *                                                                                    card: HEADLIGHTS
 *   D   8.8  ease into the chase camera, letterbox down, "DRIVE" -> onDone()
 *
 * The road runs toward -z along x = 0 (8 m wide); the river is on the driver's
 * left (-x), the camp on the right (+x).
 */
const HANDOFF = 10;
const JEEP_GO = 4.5; // pulls out
const JEEP_ACC = 9;
const JEEP_V = 18;
const SUV_LIGHTS = 7.3;
const SUV_GO = 7.8;
const SUV_ACC = 8;
const SUV_V = 24;
const SUV_GAP = 18; // where it settles behind the jeep: Level 2's starting gap
const KAI_RUN = [[25, 0, -3], [18, 0, -1.2], [12, 0, 1.6], [7.5, 0, 3.4]];

const inCamp = (x, z) => x > 4.6 && x < 31 && z > -12 && z < 38; // the clearing, open toward the road so you can see back into it
const onSuvTrack = (x, z) => x > 12 && x < 24 && z > 30 && z < 52;

/** Flat road and camp; the bank drops to the river on the left and the jungle rolls up on the right. */
export function roadHeight(x, z) {
  if (x < -4.5) {
    const bank = smooth(-4.5, -8.5, x) * 1.25;
    const far = smooth(-31, -38, x) * 1.9;
    return -bank + far + (x < -36 ? Math.sin(x * 0.1) * Math.cos(z * 0.08) * 0.6 : 0);
  }
  if (inCamp(x, z) || x < 4.5) return 0;
  return smooth(4.5, 14, x) * (0.5 + Math.sin(x * 0.12) * Math.cos(z * 0.1) * 0.5 + Math.sin(x * 0.3 + z * 0.2) * 0.15);
}

/** Distance along a route for something that waits, speeds up at `acc` and holds `v`. */
function driven(s, go, acc, v) {
  const u = s - go;
  if (u <= 0) return 0;
  const tAcc = v / acc;
  return u < tAcc ? 0.5 * acc * u * u : 0.5 * acc * tAcc * tAcc + v * (u - tAcc);
}

export class CampIntro extends Cutscene {
  constructor(opts) {
    super('level02-intro', opts);
    this.length = HANDOFF;
    this.ending = 'handoff';
    this.popupWord = 'DRIVE';
    this.far = 240;
    this.shots = [
      { id: 'A', at: 0 },
      { id: 'B', at: 3.4 },
      { id: 'C1', at: 6.0 },
      { id: 'C2', at: 7.2 },
      { id: 'D', at: 8.8, blend: true },
    ];
    this.jeepRoute = new Route([[8.6, 0, 3.5], [7.9, 0, -2], [5.4, 0, -8], [2.6, 0, -14], [2, 0, -22], [2, 0, -60], [2, 0, -420]]);
    this.suvRoute = new Route([[19, 0, 46], [15, 0, 36], [8, 0, 24], [3, 0, 12], [2, 0, 0], [2, 0, -40], [2, 0, -420]]);
    this.kaiRoute = new Route(KAI_RUN);
  }

  async build(assets) {
    const P = (p, t) => safeProp(assets, p, t);
    const [cast, kit, mud, floorMat, planks, logs, stack1, stack2, stackBig, crate, barrel, stumps, boulder, stone1, stone2] = await Promise.all([
      loadCast(assets),
      loadJungleKit(assets),
      safePbr(assets, 'mud', { repeat: 1, tint: 0x8a6a4a, roughness: 0.75, normalScale: 0.9 }),
      safePbr(assets, 'forest-floor', { repeat: 70, tint: 0x9fb07a }),
      safePbr(assets, 'wood-planks', { repeat: 2, tint: 0xb08860 }),
      P('props/logs.gltf'), P('props/crate-stack-1.gltf'), P('props/crate-stack-2.gltf'), P('props/crate-stack-big.gltf'),
      P('props/crate.gltf'), P('props/barrel.gltf'), P('props/tree-cluster-cut.gltf'),
      P('props/boulder.gltf', { Stone: 0x7d8274 }), P('props/stone-1.gltf'), P('props/stone-2.gltf'),
    ]);
    if (!this.scene) return;
    this.kit = kit;

    this.light = buildSkyAndLights(this.root, this.scene, RIVER_SUNSET, { shadowSize: 30, sunSize: 900 });
    buildGround(this.root, floorMat, { w: 220, d: 520, cz: -150, seg: 140, heightFn: roadHeight });
    pathStrip(this.root, mud, { z0: 60, z1: -420, width: 10, soft: 0.16, repeat: [2.6, 150] });
    // the dirt track the SUV comes down, out of the trees behind the camp
    pathStrip(this.root, mud, { x: 12, z0: 50, z1: 4, width: 5, soft: 0.3, repeat: [1.3, 15] }).rotation.z = 0.42;

    // the river: water shader catching the sunset, flowing down toward Site 7
    this.water = createWaterMaterial({
      deep: 0x1b3836, shallow: 0x3d6658, sky: 0xb88e62, sunDir: RIVER_SUNSET.sunDir, sunColor: 0xffb070,
      flow: new THREE.Vector2(0.05, -0.6), opacity: 0.93,
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(30, 520), this.water);
    river.rotation.x = -Math.PI / 2;
    river.position.set(-20, -0.35, -150);
    this.root.add(river);

    this._buildCamp({ planks, logs, stack1, stack2, stackBig, crate, barrel, stumps, stone1, stone2 });
    this._buildBanks({ boulder, stone1, stone2 });

    plantJungle(this.root, kit, {
      area: [-80, 80, -260, 95],
      keep: (x, z, kind) => {
        if (onSuvTrack(x, z)) return false;
        if (kind === 'tree') return (x > 7.5 && !inCamp(x, z)) || x < -35;
        if (kind === 'bush') return (x > 5.6 && !inCamp(x, z)) || x < -34 || (x > -6.6 && x < -5.4 && (Math.floor(z) % 5 === 0));
        if (kind === 'grass') return (x > 4.9 && x < 45) || x < -34 || (x > -6.9 && x < -5.0);
        return x > 5 && x < 16 && !inCamp(x, z);
      },
      heightFn: roadHeight,
      trees: 520,
      bushes: 420,
      grass: 1300,
      rocks: 30,
      near: [{ x: 12, z: 8 }, { x: 2, z: -20 }],
      chunk: 80,
      seed: 61,
    });
    this.shafts = addShafts(this.root, this.light.sunDir, [[10, 8, 2.2], [20, 18, 2.6], [6, -6, 1.8]], { color: 0xffc27a, opacity: 0.1, height: 30 });
    this.motes = new Pollen(this.root, { count: 220, box: [30, 6, 40], color: 0xffcf8a });

    // SITE 7 · 12 km: the brown road sign on the river side, facing the drivers
    const sg = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 });
    // unlit, like a reflective road sign: it would be in its own shadow with the sun low behind it
    const face = sign(['SITE 7', { t: '12 km', size: 0.75 }], { w: 1.9, h: 1.15, bg: '#5a3a1e', fg: '#f1e3c0', border: '#f1e3c0', basic: true, glow: 0.85 });
    face.position.y = 1.95;
    face.castShadow = true;
    sg.add(face, box(0.12, 2.4, 0.12, wood, -0.75, 1.2, -0.06), box(0.12, 2.4, 0.12, wood, 0.75, 1.2, -0.06));
    sg.position.set(-5.7, 0, -18);
    sg.rotation.y = 0.25;
    this.root.add(sg);

    // vehicles and Kai
    this.jeep = makeJeep();
    this.suv = makeSuv();
    this.root.add(this.jeep.group, this.suv.group);
    this.kai = makeKai(this.root, cast.kai);
    this.splash = [0, 0.25, 0.5].map((dt, i) =>
      new Burst(this.root, { at: new THREE.Vector3(8.6, 0.2, 5.2), start: JEEP_GO + dt, count: 26, color: 0x5a3e28, speed: 3.2, size: 0.32, lift: 2.2, dir: new THREE.Vector3(0, 0.3, 1), spread: 1.2, life: 0.9, seed: 20 + i }));

    this.at(0.5, () => this.story.showCard('THE RIVER ROAD', 'A jeep, a mud road, and the river all the way to Site 7.'));
    this.at(4.4, () => this.story.hideCard());
    this.at(7.5, () => this.story.showCard('HEADLIGHTS', 'He found a car too.'));
    this.at(8.8, () => this.story.hideCard());
  }

  /** Stacked logs, crates and barrels, cut stumps, a plank platform and a dying campfire. */
  _buildCamp({ planks, logs, stack1, stack2, stackBig, crate, barrel, stumps, stone1, stone2 }) {
    const add = (prop, x, y, z, opts) => prop && place(this.root, prop, x, y, z, opts);
    add(logs, 14, 0, 11.5, { s: 4, ry: 0.3 });
    add(logs, 19.5, 0, 3.5, { s: 4, ry: 1.25 });
    add(logs, 12.5, 0, 19, { s: 3.5, ry: -0.2 });
    add(logs, 25, 0, 15, { s: 4.2, ry: -0.5 });
    add(stack1, 11.3, 0, 8.6, { s: 14, ry: 0.2 });
    add(stack2, 12.9, 0, 7.1, { s: 14, ry: -0.3 });
    add(crate, 10.4, 0, 7.6, { s: 14, ry: 0.5 });
    add(barrel, 10.1, 0, 10.4, { s: 9 });
    add(barrel, 10.9, 0, 11.3, { s: 9, ry: 1 });
    this.root.add(box(6, 0.3, 4.2, planks, 22, 0.15, 9));
    add(stackBig, 22.5, 0.3, 9.3, { s: 12, ry: 0.1 });
    add(crate, 20.4, 0.3, 8.2, { s: 12, ry: -0.4 });
    add(stumps, 26.5, 0, 25, { s: 8, ry: 0.5 });
    add(stumps, 28, 0, 1, { s: 8, ry: 2 });
    // campfire: a ring of stones, embers, a warm glow
    const fire = new THREE.Vector3(17, 0, -0.5);
    const ring = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ring.push({ x: fire.x + Math.cos(a) * 0.75, y: 0, z: fire.z + Math.sin(a) * 0.75, s: 2.4, ry: a * 3 });
    }
    if (stone1) scatter(this.root, stone1, ring.filter((_, i) => i % 2), { shadow: true });
    if (stone2) scatter(this.root, stone2, ring.filter((_, i) => !(i % 2)), { shadow: true });
    const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.9, 0.25) });
    for (let i = 0; i < 6; i++) {
      const e = box(0.5, 0.08, 0.1, ember, fire.x + (i - 2.5) * 0.08, 0.06, fire.z);
      e.rotation.y = i * 0.9;
      e.castShadow = false;
      this.root.add(e);
    }
    this.fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xff8a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    this.fireGlow.position.copy(fire).setY(0.45);
    this.fireGlow.scale.setScalar(2.2);
    this.root.add(this.fireGlow);
  }

  /** Boulders and stones along the river's edge. */
  _buildBanks({ boulder, stone1, stone2 }) {
    const r = rng(33);
    const spots = [[], [], []];
    for (let z = 50; z > -260; z -= 2.2 + r() * 3) {
      const k = Math.floor(r() * 3);
      spots[k].push({ x: -6.2 - r() * 2.4, y: roadHeight(-7, z) - 0.15, z, s: k === 0 ? 6 + r() * 8 : 2.5 + r() * 2.5, ry: r() * 6.28 });
    }
    [boulder, stone1, stone2].forEach((src, k) => src && scatter(this.root, src, spots[k], { shadow: false }));
  }

  /** Where the jeep is at scene time s (distance along its route). */
  jeepDist(s) {
    return driven(s, JEEP_GO, JEEP_ACC, JEEP_V);
  }

  pose(t, s, ds, dt) {
    const jeep = this.jeep;
    const jd = this.jeepDist(s);
    this.jeepRoute.place(jeep.group, jd);
    jeep.spin(jd);
    const jp = jeep.group.position;
    const idling = s > 3.7 && s < JEEP_GO + 0.4;
    jeep.body.position.y = idling ? Math.sin(t * 60) * 0.008 : 0; // the engine catching
    jeep.body.rotation.x = -smooth(JEEP_GO, JEEP_GO + 0.3, s) * 0.03 * (1 - smooth(JEEP_GO + 0.6, JEEP_GO + 1.4, s)); // squats as it pulls away
    jeep.setLights(smooth(3.7, 3.8, s) * (0.6 + 0.4 * smooth(3.8, 4.1, s)));

    // ---- Kai: across the camp to the jeep, then in the driver's seat
    const kai = this.kai;
    const inJeep = t >= 3.4;
    if (inJeep && kai.root.parent !== jeep.body) {
      jeep.body.add(kai.root);
      kai.root.position.copy(jeep.driverSeat).add(new THREE.Vector3(0, -0.45, 0));
      kai.root.rotation.set(0, Math.PI, 0);
      kai.play('sitting', { fade: 0 });
      syncClip(kai, s);
    } else if (!inJeep) {
      if (kai.root.parent !== this.root) this.root.add(kai.root);
      const kd = Math.min(this.kaiRoute.length, t * 5.6);
      this.kaiRoute.place(kai.root, kd);
      kai.root.rotation.y += Math.PI; // Route faces things down -z; Kai's model faces +z
      if (kai.currentName !== 'run') {
        kai.play('run', { fade: 0.1 });
        syncClip(kai, s);
      }
    }
    kai.update(ds);

    // ---- the SUV: dark in the trees, lights on, out onto the road, settles 18 m behind the jeep
    const suv = this.suv;
    const sd = driven(s, SUV_GO, SUV_ACC, SUV_V);
    this.suvRoute.place(suv.group, sd);
    if (suv.group.position.z < jp.z + SUV_GAP && jp.z < -20) {
      suv.group.position.set(jp.x, 0, jp.z + SUV_GAP);
      suv.group.rotation.set(0, 0, 0);
    }
    suv.spin(sd);
    suv.setLights(smooth(SUV_LIGHTS, SUV_LIGHTS + 0.06, s) * (0.7 + 0.3 * smooth(SUV_LIGHTS + 0.1, SUV_LIGHTS + 0.4, s)));

    for (const b of this.splash) {
      b.at.set(jp.x, 0.25, jp.z + 2.2);
      b.update(s);
    }

    // ---- camera
    const behind = new THREE.Vector3();
    if (this.shot === 'A') {
      const k = smooth(0, 3.4, t);
      // low over the log pile, Kai crossing right to left toward the jeep
      this.frame(new THREE.Vector3(lerp(22.5, 19.5, k), 1.05, lerp(5.2, 6.4, k)), new THREE.Vector3(lerp(11, 8.6, k), 1.0, lerp(1.5, 3.5, k)), { fov: 45 });
    } else if (this.shot === 'B') {
      this.frame(new THREE.Vector3(3.0, 0.9, -5.0), new THREE.Vector3(jp.x, 1.0, jp.z), { fov: 42, rate: 5 });
    } else if (this.shot === 'C1') {
      this.frame(new THREE.Vector3(-7.4, 1.05, -8.5), new THREE.Vector3(lerp(-1, jp.x, 0.5), 1.1, -40), { fov: 46 });
    } else if (this.shot === 'C2') {
      // just ahead of the jeep, looking back over Kai at the wheel to the camp
      behind.set(jp.x - 1.1, 2.5, jp.z - 4.2);
      this.frame(behind, new THREE.Vector3(15, 1.4, 42), { fov: 26 });
    } else {
      behind.set(jp.x, 4.2, jp.z + 8);
      this.frame(behind, new THREE.Vector3(jp.x, 1.0, jp.z - 6), { fov: 62, rate: t > HANDOFF ? 8 : 3 });
    }

    // ---- world
    this.water.uniforms.uTime.value = t;
    for (const sh of this.shafts) sh.material.uniforms.uTime.value = t;
    this.fireGlow.scale.setScalar(2.0 + Math.sin(t * 13) * 0.2 + Math.sin(t * 31) * 0.1);
    this.motes.update(t, this.game.camera.position);
    this.suv.flaresFor(this.game.camera);
    this.jeep.flaresFor(this.game.camera);
    this.light.follow(t < 6 ? new THREE.Vector3(10, 0, 4) : jp, this.game.camera, t);
  }
}
