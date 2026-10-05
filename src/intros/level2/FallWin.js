import * as THREE from 'three';
import { RU, TINT, place, rng } from '../../levels/jungle/props.js';
import { RIVER_NIGHT } from '../../levels/jungle/palette.js';
import { createWaterMaterial } from '../../shaders/water.js';
import { createWaterfallMaterial } from '../../shaders/waterfall.js';
import { Cutscene, smooth, lerp } from '../Cutscene.js';
import { loadCast, makeKai } from '../cast.js';
import { Burst, Debris, Rain, dotTexture } from '../fx.js';
import { makeJeep, makeSuv } from '../vehicles.js';
import { safeProp, safePbr, loadJungleKit, buildSkyAndLights, plantJungle, pathStrip, box } from '../world.js';

/**
 * Level 2 win, Interlude II "The Fall" (~13 s, then the SURVIVED card).
 * docs/LEVEL1_2_INTROS_AND_WINS.md
 *
 *   F1  0.0  night, rain: wide from the gorge, two pairs of headlights crossing the old viaduct; lightning
 *   F2  2.4  the jeep's mirror: the SUV's grille and headlights fill it, swinging out for the PIT
 *   F3  4.4  side-on at deck height, slow motion: the ram, the parapet bursts, the jeep tips over the edge
 *   F4  6.6  from the river looking up: the jeep falls at the camera; cut to black on the splash
 *   F5       the current at night carries the Key's cyan glow downstream and over the falls,
 *            and the frame washes to Site 7's gold                     card: THE FALL
 *   F6       SURVIVED card (CONTINUE -> onContinue, straight into Level 3's opening in the pool)
 *
 * The level hands its numbers over in opts.stats, read before setLevel() resets them:
 *   new FallWin({ stats: { distance: 3000, integrity: 64, rams: 7, letters: 2 }, onContinue })
 *
 * The viaduct is three bridge.glb spans on stone piers, running toward -z with
 * its deck 48 m above a river that flows toward +x.
 */
const Y0 = 38; // base of the bridge spans
const DECK = Y0 + 10.76; // road surface (measured from bridge.glb)
const SPAN = 30.72;
const NORTH = SPAN / 2; // north cliff face (z)
const SOUTH = NORTH - SPAN * 3; // south cliff face
const RIVER_Z = (NORTH + SOUTH) / 2;
const LIP_X = 112; // where the river goes over the falls
const V = 16; // both cars on the bridge
const Z0 = 13; // the jeep comes onto the bridge as the scene opens
const LANE = 2.2;
const G = 20; // movie gravity: a 48 m fall that fits in a shot
const PUSH = 10; // sideways speed after the ram

export class FallWin extends Cutscene {
  constructor(opts = {}) {
    super('level02-win', opts);
    this.ending = 'win';
    this.far = 420;
    this.stats = { distance: 3000, integrity: 64, rams: 7, letters: 2, ...opts.stats };
    this.slowmo = [{ from: 4.55, to: 6.6, scale: 0.3, ramp: 0.2 }];

    // the timeline hangs off the physics: work out when the jeep leaves the deck and hits the water
    this.length = 14;
    this._buildWarp();
    this.sRam = this.sceneTime(4.85);
    this.zRam = Z0 - V * this.sRam;
    const uEdge = (6.6 - LANE) / PUSH;
    this.sEdge = this.sRam + uEdge;
    this.edgeAt = this._afterRam(uEdge);
    this.fallV = new THREE.Vector3(8, 1.2, -9);
    const tau = (this.fallV.y + Math.sqrt(this.fallV.y ** 2 + 2 * G * DECK)) / G; // time to the water
    this.sSplash = this.sEdge + tau;
    this.tSplash = this.realTime(this.sSplash);
    this.t5 = this.tSplash + 0.6; // F5 starts after a beat of black
    this.length = this.t5 + 3.7;
    this.shots = [
      { id: 'F1', at: 0 },
      { id: 'F2', at: 2.4 },
      { id: 'F3', at: 4.4 },
      { id: 'F4', at: 6.6 },
      { id: 'BLACK', at: this.tSplash },
      { id: 'F5', at: this.t5 },
    ];
  }

  /** The jeep's place u scene-seconds after the ram: shoved sideways, still rolling forward, slewing round. */
  _afterRam(u) {
    return new THREE.Vector3(LANE + PUSH * u, DECK, this.zRam - (V * u - 4 * u * u));
  }

  async build(assets) {
    const P = (p, t) => safeProp(assets, p, t);
    const [cast, kit, bridge, cliffMat, pierMat, mud, col, colShort] = await Promise.all([
      loadCast(assets),
      loadJungleKit(assets),
      P('props/bridge.glb', { '*': 0x8d897a }),
      safePbr(assets, 'cliff-rock', { repeat: 1, tint: 0x6a6e78, normalScale: 1.2 }),
      safePbr(assets, 'mossy-rock', { repeat: 4, tint: 0x7c7f74 }),
      safePbr(assets, 'mud', { repeat: 1, tint: 0x5a4636, roughness: 0.45 }),
      P('ruins/column-round.fbx', TINT.stone),
      P('ruins/column-round-short.fbx', TINT.stone),
    ]);
    if (!this.scene) return;

    this.light = buildSkyAndLights(this.root, this.scene, RIVER_NIGHT, { shadowSize: 30, sunSize: 9000 });
    this.baseHemi = this.light.hemi.intensity;
    this._skyTop = new THREE.Color(RIVER_NIGHT.sky.top);
    this._skyHorizon = new THREE.Color(RIVER_NIGHT.sky.horizon);
    this._flash = new THREE.Color(0x9aa8d8);

    // ---- the viaduct: three stone spans on piers rising out of the river, the deck wet with rain
    if (bridge) {
      bridge.traverse((o) => {
        if (o.isMesh) for (const m of [].concat(o.material)) m.roughness = 0.38;
      });
      for (let i = 0; i < 3; i++) place(this.root, bridge, 0, Y0, NORTH - SPAN / 2 - i * SPAN, { s: 1, ry: Math.PI / 2 });
    }
    for (const z of [NORTH - SPAN, NORTH - SPAN * 2]) {
      this.root.add(box(12.6, Y0 + 3, 10.5, pierMat, 0, (Y0 - 3) / 2, z));
      this.root.add(box(14, 2.4, 12, pierMat, 0, 0.6, z)); // cutwater at the waterline
    }
    // old guardian columns at both ends of the bridge
    for (const z of [NORTH + 3, SOUTH - 3]) {
      for (const x of [-6.6, 6.6]) if (col) place(this.root, z > 0 ? col : colShort, x, DECK - 0.15, z, { s: RU * 0.9 });
    }

    // ---- the gorge: two cliff walls with the river between, jungle along the tops
    this._cliff(cliffMat, NORTH, 1);
    this._cliff(cliffMat, SOUTH, -1);
    pathStrip(this.root, mud, { z0: NORTH, z1: NORTH + 160, width: 10, y: DECK - 0.12, soft: 0.15, repeat: [2.5, 50] });
    pathStrip(this.root, mud, { z0: SOUTH, z1: SOUTH - 160, width: 10, y: DECK - 0.12, soft: 0.15, repeat: [2.5, 50] });
    const top = (x, z) => DECK - 0.12;
    plantJungle(this.root, kit, {
      area: [-160, 160, NORTH + 2, NORTH + 140],
      keep: (x, z, kind) => (kind === 'tree' ? Math.abs(x) > 8 : Math.abs(x) > 5.5),
      heightFn: top, trees: 260, bushes: 160, grass: 300, chunk: 140, seed: 71,
    });
    plantJungle(this.root, kit, {
      area: [-160, 160, SOUTH - 140, SOUTH - 2],
      keep: (x, z, kind) => (kind === 'tree' ? Math.abs(x) > 8 : Math.abs(x) > 5.5),
      heightFn: top, trees: 200, bushes: 120, grass: 200, chunk: 140, seed: 72,
    });

    // ---- the river, the falls downstream, the rain
    this.water = createWaterMaterial({
      deep: 0x08151c, shallow: 0x1c3644, sky: 0x2a3a60, sunDir: RIVER_NIGHT.sunDir, sunColor: 0xcfe0ff,
      flow: new THREE.Vector2(0.9, 0.05), opacity: 0.95,
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(LIP_X + 300, NORTH - SOUTH + 6), this.water);
    river.rotation.x = -Math.PI / 2;
    river.position.set((LIP_X - 300) / 2, 0, RIVER_Z);
    this.root.add(river);
    this.fall = createWaterfallMaterial({ water: 0x2d5060, foam: 0xbfd2dc });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(NORTH - SOUTH, 46, 1, 24), this.fall);
    sheet.rotation.y = Math.PI / 2;
    sheet.position.set(LIP_X + 0.3, -23, RIVER_Z);
    this.root.add(sheet);
    this.rain = new Rain(this.root);

    // ---- the cars, and Kai at the wheel
    this.jeep = makeJeep();
    this.suv = makeSuv();
    this.root.add(this.jeep.group, this.suv.group);
    this.jeep.setLights(1);
    this.suv.setLights(1);
    this.kai = makeKai(this.jeep.body, cast.kai);
    this.kai.root.position.copy(this.jeep.driverSeat).add(new THREE.Vector3(0, -0.45, 0));
    this.kai.root.rotation.y = Math.PI;
    this.kai.play('sitting', { fade: 0 });

    // ---- what breaks: the parapet where the jeep goes through, and the splash
    const stone = new THREE.MeshStandardMaterial({ color: 0x7a7a6c, roughness: 0.8 });
    const at = this.edgeAt.clone().setX(5.6).setY(DECK + 0.3);
    this.rubble = new Debris(this.root, { at, start: this.sEdge - 0.12, count: 18, material: stone, dir: new THREE.Vector3(1, 0.35, -0.4), speed: 8, gravity: G, floor: 0, seed: 21 });
    this.breakDust = new Burst(this.root, { at, start: this.sEdge - 0.12, count: 50, color: 0x8c8a80, speed: 4, size: 0.8, spread: 2, life: 1.4, gravity: 0.4, seed: 9 });
    this.splashAt = this._fallPos(this.sSplash).setY(0);
    this.splash = new Burst(this.root, { at: this.splashAt, start: this.sSplash, count: 90, color: 0xdfe8f0, speed: 7, size: 1.1, lift: 10, gravity: 9, life: 1.2, spread: 3, seed: 30 });

    // ---- F5: the Key, still glowing, carried on the current with what's left of the jeep
    this.floatKey = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0x6fe3ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    glow.scale.setScalar(1.8);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.24), new THREE.MeshStandardMaterial({ color: 0x141c26, emissive: 0x2fd8ff, emissiveIntensity: 2.4 }));
    this.floatKey.add(glow, slab);
    this.root.add(this.floatKey);
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.7 });
    const r = rng(4);
    this.flotsam = Array.from({ length: 7 }, (_, i) => {
      const m = box(0.5 + r() * 1.2, 0.08, 0.2 + r() * 0.4, i % 3 ? wood : this.jeep.body.children[0].material, 0, 0, 0);
      this.root.add(m);
      return { m, dx: (r() - 0.5) * 9, dz: (r() - 0.5) * 6, spin: (r() - 0.5) * 0.8, phase: r() * 6 };
    });

    this.mirror = document.createElement('div');
    this.mirror.style.cssText = 'position:absolute; inset:15vh 18vw; border-radius:48px; border:7px solid #15171b; box-shadow:0 0 0 100vmax rgba(4,5,8,.94), inset 0 0 40px rgba(0,0,0,.6); opacity:0; pointer-events:none;';
    this.fadeEl.after(this.mirror);

    this.at(1.15, () => this.shake(0.15), { fx: true });
    this.at(this.realTime(this.sRam), () => this.shake(0.7), { fx: true });
    this.at(this.t5 + 0.3, () => this.story.showCard('THE FALL', 'You got off the road. Now there’s only the river.'));
  }

  /** A gorge wall: a big displaced block whose face is at z = face, extending away on side `dir`. */
  _cliff(mat, face, dir) {
    const W = 700, H = DECK + 24, D = 170;
    const g = new THREE.BoxGeometry(W, H, D, 90, 16, 6);
    // the face is 700 x 72 m: tile the rock about every 11 m both ways instead of stretching one repeat over it
    for (const k of ['map', 'normalMap', 'roughnessMap']) if (mat[k]) mat[k].repeat.set(W / 11, H / 11);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (z * dir < 0 && y < H / 2 - 0.5) {
        // the gorge face: ledges and buttresses, so the moon catches it
        const n = Math.sin(x * 0.09) * 3 + Math.sin(x * 0.23 + y * 0.11) * 1.6 + Math.sin(y * 0.31 + x * 0.05) * 1.2;
        p.setZ(i, z + n * dir * -1);
      }
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.position.set(LIP_X - 250, DECK - 0.12 - H / 2, face + dir * D / 2);
    m.receiveShadow = true;
    this.root.add(m);
  }

  /** The jeep in free fall s scene-seconds in (after it leaves the deck). */
  _fallPos(s) {
    const tau = s - this.sEdge;
    return this.edgeAt.clone().add(new THREE.Vector3(this.fallV.x * tau, this.fallV.y * tau - 0.5 * G * tau * tau, this.fallV.z * tau));
  }

  pose(t, s, ds, dt) {
    const jeep = this.jeep.group;
    const suv = this.suv.group;

    // ---- the jeep: down the bridge, rammed, through the parapet, falling
    if (s < this.sRam) {
      jeep.position.set(LANE, DECK, Z0 - V * s);
      jeep.rotation.set(0, 0, 0);
    } else if (s < this.sEdge) {
      const u = s - this.sRam;
      jeep.position.copy(this._afterRam(u));
      jeep.rotation.set(0, -u * 1.4, -smooth(0.25, 0.44, u) * 0.25); // slews round, starts to tip at the edge
    } else {
      const tau = s - this.sEdge;
      jeep.position.copy(this._fallPos(s));
      jeep.rotation.set(-tau * 1.1, -0.62 - tau * 0.5, -0.25 - tau * 0.9);
    }
    this.jeep.spin(V * Math.min(s, this.sEdge));
    jeep.visible = s < this.sSplash + 0.05;
    this.jeep.key.scale.setScalar(s > this.sRam ? 0.9 : 0.5);

    // ---- the SUV: closing in, swinging out for the PIT, the hit, skidding to a stop facing the void
    if (s < this.sRam) {
      const gap = lerp(9, 4.2, smooth(1.0, this.sRam, s));
      suv.position.set(lerp(-1.6, 0.9, smooth(this.sRam - 1.7, this.sRam, s)), DECK, Z0 - V * s + gap);
      suv.rotation.set(0, smooth(this.sRam - 1.7, this.sRam - 0.6, s) * -0.12 + smooth(this.sRam - 0.6, this.sRam, s) * 0.2, 0);
    } else {
      const u = Math.min(1.3, s - this.sRam);
      suv.position.set(lerp(0.9, 3.1, smooth(0, 1.3, u)), DECK, this.zRam + 4.2 - (V * u - 6 * u * u));
      suv.rotation.set(0, 0.08 - smooth(0, 1.3, u) * 0.58, 0);
    }
    this.suv.body.position.y = s > this.sRam && s < this.sRam + 0.3 ? Math.sin(s * 80) * 0.03 : 0;

    this.kai.update(ds);
    this.rubble.update(s);
    this.breakDust.update(s);
    this.splash.update(s);

    // ---- lightning: two flickers, the second right before the ram
    let flash = 0;
    for (const tb of [1.1, 4.3]) {
      const a = t - tb;
      if (a > 0 && a < 0.6) flash = Math.max(flash, Math.exp(-a * 9) * (0.7 + 0.3 * Math.sin(a * 70)));
    }
    this.light.hemi.intensity = this.baseHemi + flash * 4;
    const u = this.light.sky.material.uniforms;
    u.uTop.value.copy(this._skyTop).lerp(this._flash, flash * 0.6);
    u.uHorizon.value.copy(this._skyHorizon).lerp(this._flash, flash * 0.8);

    // ---- F5: the Key on the current
    const t5 = t - this.t5;
    const KEY_V = 7.2;
    const tLip = 22 / KEY_V; // seconds into F5 when it reaches the lip
    const kx = LIP_X - 22 + Math.max(0, t5) * KEY_V;
    const kz = RIVER_Z + 1 + Math.sin(t * 0.7) * 0.6;
    const drop = Math.max(0, t5 - tLip);
    this.floatKey.position.set(kx, 0.06 + Math.sin(t * 2.3) * 0.04 * (drop ? 0 : 1) - 0.5 * 9.8 * drop * drop, kz);
    this.floatKey.visible = t5 > -0.1;
    for (const f of this.flotsam) {
      f.m.visible = this.floatKey.visible;
      f.m.position.set(kx + f.dx + Math.sin(t * 0.5 + f.phase), 0.04 + Math.sin(t * 1.9 + f.phase) * 0.04, kz + f.dz);
      f.m.rotation.set(Math.sin(t + f.phase) * 0.12, f.phase + t * f.spin, 0);
    }

    // ---- camera, black, gold
    const jp = jeep.position;
    this.mirror.style.opacity = this.shot === 'F2' ? '1' : '0';
    if (this.shot === 'F1') {
      const k = smooth(0, 2.4, t);
      this.frame(new THREE.Vector3(78, 16 + k * 2, -26), new THREE.Vector3(0, DECK - 4, lerp(-12, -26, k)), { fov: 52 });
    } else if (this.shot === 'F2') {
      this.frame(new THREE.Vector3(jp.x - 1.05, DECK + 1.45, jp.z - 0.55), new THREE.Vector3(suv.position.x - 0.2, DECK + 1.0, suv.position.z), { fov: 40 });
    } else if (this.shot === 'F3') {
      this.frame(new THREE.Vector3(18, DECK + 2.8, this.zRam - 1.5), new THREE.Vector3(4, DECK + 0.3, this.zRam - 4), { fov: 42 });
    } else if (this.shot === 'F4' || this.shot === 'BLACK') {
      this.frame(new THREE.Vector3(this.splashAt.x + 5, 2.2, this.splashAt.z + 9), new THREE.Vector3(jp.x, jp.y + 1, jp.z), { fov: 58, rate: 8 });
    } else {
      // ride the current behind the Key, stop at the lip, and look down after it as it goes over
      const cx = Math.min(kx - 4.6, LIP_X - 1.2);
      const kp = this.floatKey.position;
      this.frame(
        new THREE.Vector3(cx, 1.25 + smooth(tLip - 0.6, tLip + 0.4, t5) * 0.8, kz + 1.3),
        new THREE.Vector3(Math.max(kp.x + 6 - drop * 4, cx + 2), Math.min(0.25, kp.y), kp.z - 0.3),
        { fov: 50, rate: t5 < 0.05 ? Infinity : 5 },
      );
    }
    if (this.shot === 'BLACK') this.fade('#000', 1);
    else if (this.shot === 'F5') {
      const gold = smooth(tLip, tLip + 0.7, t5);
      if (gold > 0) this.fade('#ffe7b4', gold * 0.93);
      else this.fade('#000', 1 - smooth(0, 0.7, t5));
    } else this.fade('#000', 0);

    // ---- world
    const cam = this.game.camera;
    this.water.uniforms.uTime.value = t;
    this.fall.uniforms.uTime.value = t * 1.3;
    this.rain.update(t, cam.position);
    this.jeep.flaresFor(cam);
    this.suv.flaresFor(cam);
    this.light.follow(t < this.t5 ? new THREE.Vector3(2, DECK, Math.min(jp.z, 0)) : this.floatKey.position, cam, t);
  }

  winCard() {
    const { distance, integrity, rams, letters } = this.stats;
    const lines = [{ text: `${(distance / 1000).toFixed(1)} KM  ·  INTEGRITY ${Math.round(integrity)}%  ·  RAMS SURVIVED ${rams}  ·  LETTERS ${letters} / 3`, cls: 'end-meta' }];
    if (letters >= 3) lines.push({ text: 'Every letter on the road found. Three more wait at Site 7.', cls: 'end-credits' });
    return { title: 'SURVIVED', sub: 'The jeep is gone. The Key isn’t.', lines };
  }
}
