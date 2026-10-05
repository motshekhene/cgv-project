import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RU, TINT, place, scatter, rng } from '../../levels/jungle/props.js';
import { Cutscene, smooth, lerp } from '../Cutscene.js';
import { loadCast, makeKai, makeHandler, attachTorch, syncClip } from '../cast.js';
import { Burst } from '../fx.js';
import { safeProp, addShafts } from '../world.js';
import { buildTrail, trailSign } from './trail.js';

/**
 * Level 1 win, Interlude I "The Gate" (~9.5 s, then the ESCAPED card).
 * docs/LEVEL1_2_INTROS_AND_WINS.md
 *
 *   G1  0.0  from beyond the gate: Kai sprints at the arch, the portcullis starts grinding down
 *   G2  2.0  side-on at the threshold, slow motion: he slides under it with a hand's width to spare
 *   G3  4.2  behind him: it slams; one beat later the Handler hits the bars, torch on Kai
 *   G4  6.0  the camera rises over the wall: Kai gets up and runs for the light,
 *            the Handler starts to climb                         card: THE GATE
 *   G5  9.5  ESCAPED card (CONTINUE -> onContinue)
 *
 * The level hands its numbers over in opts.stats, read before setLevel() resets them:
 *   new GateWin({ stats: { distance: 1200, closest: 2.4, letters: 2 }, onContinue })
 *
 * The gate wall stands across the trail at z = 0; Kai comes from +z.
 */
const GS = RU * 1.5; // the gate kit at x1.5: a 9.6 m wall, the arch about 7 m wide
const BARS_W = 7.4;
const BARS_H = 6.4; // fills the arch to 6.4 m; the gap above is how he climbs over
const BARS_Z = -0.24; // inside the wall's thickness
const BARS_UP = 3.4; // raised, its top just tucks into the wall
const KAI_V = 7;
const SLIDE = 0.55; // scene seconds from the dive to stopping on his belly
const SLIDE_FROM = 2.6;
const SLIDE_TO = -1.8;
const REST_Z = -3.0; // where he sits up after the cut
const HANDLER_V = 7.4;
const HANDLER_AT_BARS = 0.95;

const easeOut = (u) => 1 - (1 - u) * (1 - u);

export class GateWin extends Cutscene {
  constructor(opts = {}) {
    super('level01-win', opts);
    this.length = 9.5;
    this.ending = 'win';
    this.far = 170;
    this.shots = [
      { id: 'G1', at: 0 },
      { id: 'G2', at: 2.0 },
      { id: 'G3', at: 4.2 },
      { id: 'G4', at: 6.0 },
    ];
    this.slowmo = [{ from: 2.0, to: 4.2, scale: 0.25, ramp: 0.25 }];
    this.stats = { distance: 1200, closest: 2.4, letters: 2, ...opts.stats };
  }

  async build(assets) {
    const [cast, trail, wallArch, wallO, col, stag] = await Promise.all([
      loadCast(assets),
      buildTrail(this.root, this.scene, assets, {
        z0: 130,
        z1: -90,
        archAt: 46,
        keep: (x, z) => {
          if (Math.abs(z) < 2.6 && Math.abs(x) < 26) return false; // the gate wall line
          if (z < -2 && z > -34 && Math.abs(x) < 10) return false; // the clearing beyond, where the light is
          return !(Math.abs(x) < 8 && z > 1 && z < 6); // the guardians' plinths
        },
        near: [{ x: 0, z: 10 }, { x: 0, z: -8 }],
        seed: 52,
      }),
      safeProp(assets, 'ruins/wall-arch-round-overgrown.fbx', TINT.stone),
      safeProp(assets, 'ruins/wall-overgrown.fbx', TINT.stone),
      safeProp(assets, 'ruins/column-round.fbx', TINT.stone),
      safeProp(assets, 'ruins/statue-stag.fbx', TINT.statue),
    ]);
    if (!this.scene) return;
    Object.assign(this, trail);

    // timings that depend on the slow-motion warp
    this.sSlide = this.sceneTime(2.15);
    const uCross = 1 - Math.sqrt(1 - (SLIDE_FROM - BARS_Z) / (SLIDE_FROM - SLIDE_TO)); // when his head passes the bars
    this.sCross = this.sSlide + uCross * SLIDE;
    this.sDrop = this.sceneTime(0.8);
    this.sSlam = this.sceneTime(4.25);
    this.sHit = this.sceneTime(4.75);

    // ---- the gate: an overgrown arch wall, wall runs either side, columns at the joins, two stag guardians
    if (wallArch) place(this.root, wallArch, 0, 0, 0, { s: GS });
    if (wallO) scatter(this.root, wallO, [7.2, 12.0, 16.8, 21.6].flatMap((x) => [-x, x]).map((x) => ({ x, y: 0, z: 0.1, s: GS })), { shadow: true });
    for (const x of [-9.6, 9.6, -19.2, 19.2]) if (col) place(this.root, col, x, 0, 0.2, { s: RU * 1.25 });
    if (stag) {
      place(this.root, stag, -5.8, 0, 3.2, { s: RU * 0.85, ry: 0.3 });
      place(this.root, stag, 5.8, 0, 3.2, { s: RU * 0.85, ry: -0.3 });
    }
    this._buildBars();
    // the jungle closes in behind the wall, so the gate is the only way through
    const r = rng(5);
    const [b1, , bL] = this.kit.bushes;
    const hedge = Array.from({ length: 26 }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (5.4 + r() * 20), y: -0.1, z: 1.4 + r() * 1.4, s: RU * (0.8 + r() * 0.6), ry: r() * 6.28 }));
    if (bL) scatter(this.root, bL, hedge, { shadow: true });
    if (b1) scatter(this.root, b1, hedge.map((h) => ({ ...h, z: -h.z - 0.5, s: 0.018 })));
    trailSign(this.root, 4.4, 14, -0.4);

    // gold light pouring through the arch onto the trail
    this.archShafts = addShafts(this.root, this.light.sunDir, [[0.6, 5.5, 2.4], [-1.4, 8.5, 1.8], [1.8, 3.2, 1.5]], { opacity: 0.2, color: 0xffd28a });
    this.grit = this._buildGrit();
    this.slamDust = new Burst(this.root, { at: new THREE.Vector3(0, 0, BARS_Z + 0.6), start: this.sSlam, count: 80, spread: 6.5, speed: 3.2, size: 0.7, life: 1.6, seed: 8 });
    this.diveDust = new Burst(this.root, { at: new THREE.Vector3(0, 0, 1.2), start: this.sSlide + 0.08, count: 34, spread: 1.4, speed: 2.2, size: 0.42, life: 1.0, color: 0xb89a74, seed: 6 });
    this.hitDust = new Burst(this.root, { at: new THREE.Vector3(0.4, 0.4, 0.8), start: this.sHit, count: 24, spread: 1, speed: 1.6, size: 0.35, life: 0.9, seed: 4 });

    this.kai = makeKai(this.root, cast.kai);
    this.handler = makeHandler(this.root, cast.handler);
    this.torch = attachTorch(this.handler, this.root);
    this._aim = new THREE.Vector3();

    this.at(4.27, () => this.shake(0.8), { fx: true });
    this.at(4.8, () => this.shake(0.35), { fx: true });
    this.at(6.4, () => this.story.showCard('THE GATE', 'You escaped the trail… but he’s still coming.'));
  }

  /** An iron portcullis, one merged mesh: bars, cross-bars and spikes along the bottom. Origin at the spike tips. */
  _buildBars() {
    const parts = [];
    const n = Math.round(BARS_W / 0.42);
    for (let i = 0; i <= n; i++) {
      const x = -BARS_W / 2 + (i * BARS_W) / n;
      parts.push(new THREE.CylinderGeometry(0.055, 0.055, BARS_H - 0.3, 6).translate(x, 0.3 + (BARS_H - 0.3) / 2, 0));
      parts.push(new THREE.ConeGeometry(0.085, 0.32, 6).rotateX(Math.PI).translate(x, 0.16, 0));
    }
    for (const y of [0.7, 2.5, 4.3, 6.1]) parts.push(new THREE.BoxGeometry(BARS_W, 0.12, 0.12).translate(0, y, 0));
    const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    this.bars = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.75, roughness: 0.45 }));
    this.bars.castShadow = this.bars.receiveShadow = true;
    this.bars.position.set(0, BARS_UP, BARS_Z);
    this.root.add(this.bars);
  }

  /** Grit and flakes of stone shaken loose from the arch while the portcullis grinds down. */
  _buildGrit() {
    const count = 90;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9a8f78, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
    pts.frustumCulled = false;
    this.root.add(pts);
    const r = rng(17);
    pts.userData.seed = Float32Array.from({ length: count * 3 }, () => r());
    return pts;
  }

  /** Bottom of the portcullis at scene time s: raised, grinding down, then dropping and slamming. */
  barsY(s) {
    if (s < this.sDrop) return BARS_UP;
    if (s < this.sCross) {
      const u = (s - this.sDrop) / (this.sCross - this.sDrop);
      const judder = Math.max(0, Math.sin(u * 40)) * 0.05 * (1 - u);
      return lerp(BARS_UP, 1.12, u * u * 0.55 + u * 0.45) + judder;
    }
    if (s < this.sSlam) {
      const u = (s - this.sCross) / (this.sSlam - this.sCross);
      return 1.12 * (1 - u * u);
    }
    return Math.max(0, Math.sin((s - this.sSlam) * 30) * 0.05 * Math.exp(-(s - this.sSlam) * 9)); // a small bounce
  }

  pose(t, s, ds, dt) {
    const kai = this.kai;
    const kp = kai.root.position;
    const h = this.handler;
    const hp = h.root.position;

    // ---- Kai: sprint, dive under the bars and slide on his belly; after the cut he's sitting up
    //      looking back at the gate, then gets up and runs for the light
    let clip = 'run';
    let heading = Math.PI;
    let y = 0;
    let diveU = 0;
    if (s < this.sSlide) {
      kp.z = SLIDE_FROM + KAI_V * (this.sSlide - s);
    } else if (t < 4.2) {
      diveU = Math.min(1, (s - this.sSlide) / SLIDE);
      kp.z = lerp(SLIDE_FROM, SLIDE_TO, easeOut(diveU));
      clip = 'dive';
    } else if (t < 6.1) {
      kp.z = REST_Z;
      clip = 'sitting';
      y = -0.45;
      heading = lerp(0.9, 0.3, smooth(4.2, 4.9, t)); // twisted round to watch the gate
    } else if (t < 7.4) {
      kp.z = REST_Z;
      clip = 'standing';
      y = -0.45 * (1 - smooth(6.15, 7.2, t));
      heading = lerp(0.3, Math.PI, smooth(6.9, 7.5, t));
    } else {
      const run = t - 7.4; // speeds up to 6.2 m/s over 1.4 s, then holds it
      const a = 6.2 / 1.4;
      kp.z = REST_Z - (run < 1.4 ? 0.5 * a * run * run : 0.5 * a * 1.96 + 6.2 * (run - 1.4));
      heading = Math.PI;
    }
    kp.x = 0;
    kp.y = y;
    kai.root.rotation.y = heading;
    if (this._kClip !== clip) {
      this._kClip = clip;
      if (clip === 'dive') {
        // the rig has no slide, so it's the head-first dive from the death clip, ending flat on the ground
        const d = kai.clipDuration('death');
        kai.playOnce('death', { fade: 0.06 });
        if (kai.current) {
          kai.current.time = d * (0.58 + 0.32 * diveU);
          kai.current.timeScale = (0.32 * d) / SLIDE;
        }
      } else if (clip === 'standing') kai.playOnce('standing', { fade: 0.2, speed: 0.75 });
      else {
        kai.play(clip, { fade: clip === 'sitting' ? 0 : 0.25 }); // sitting starts on a cut
        if (ds === 0) syncClip(kai, s);
      }
    }
    kai.update(ds);

    // ---- the Handler: a few metres behind, hits the bars one beat late, then climbs
    let hClip = 'run';
    if (s < this.sHit) {
      hp.set(0.4, 0, HANDLER_AT_BARS + HANDLER_V * (this.sHit - s));
    } else if (t < 6.6) {
      hp.set(0.4, 0, HANDLER_AT_BARS);
      hClip = 'punch';
    } else {
      hClip = 'climb';
      hp.set(0.4, Math.min(4.6, (t - 6.6) * 0.62), 0.72); // tops out with his hands on the last cross-bar
    }
    h.root.rotation.y = Math.PI;
    if (hClip !== this._hClip) {
      this._hClip = hClip;
      if (hClip === 'punch') h.playOnce('punch', { fade: 0.05 });
      else if (hClip === 'climb') {
        h.playOnce('punch', { fade: 0.2, speed: 0.55 }); // hand over hand up the bars, on a loop
        h.current.setLoop(THREE.LoopRepeat, Infinity);
        h.current.clampWhenFinished = false;
      } else {
        h.play('run', { fade: 0.15 });
        if (ds === 0) syncClip(h, s);
      }
    }
    h.setLean(hClip === 'climb' ? -0.12 : 0);
    h.update(ds);
    this._aim.set(kp.x, kp.y + 0.9, kp.z);
    this.torch.update(this._aim, t);

    // ---- the gate
    this.bars.position.y = this.barsY(s);
    this.slamDust.update(s);
    this.diveDust.update(s);
    this.hitDust.update(s);
    const gp = this.grit.geometry.attributes.position;
    const seed = this.grit.userData.seed;
    const falling = s > this.sDrop && s < this.sSlam + 0.4;
    this.grit.visible = falling;
    if (falling) {
      for (let i = 0; i < gp.count; i++) {
        const o = i * 3;
        const fall = ((s - this.sDrop) * 6 + seed[o + 1] * 9) % 9;
        gp.setXYZ(i, (seed[o] - 0.5) * 6.5, 9 - fall * (1 + seed[o + 2]) * 0.5 - fall * fall * 0.08, 0.3 + seed[o + 2] * 0.6);
      }
      gp.needsUpdate = true;
    }

    // ---- camera
    if (this.shot === 'G1') {
      const k = smooth(0, 2, t);
      this.frame(new THREE.Vector3(2.0 - k * 0.4, 2.6 - k * 0.4, -8.8 + k * 0.6), new THREE.Vector3(0, 2.0 - k * 0.3, 12), { fov: 45 });
    } else if (this.shot === 'G2') {
      // on the ground just past the gate, looking back under the bars as he dives at the camera
      this.frame(new THREE.Vector3(2.3, 0.42, -2.9), new THREE.Vector3(-0.3, 0.8, 2.6), { fov: 44 });
    } else if (this.shot === 'G3') {
      this.frame(new THREE.Vector3(-1.5, 1.25, -8.4), new THREE.Vector3(0.3, 1.5, 1.0), { fov: 42 });
    } else {
      const k = smooth(6.0, 9.5, t);
      const drift = Math.max(0, t - 9.5);
      this.frame(
        new THREE.Vector3(lerp(0.8, 0, k), lerp(1.6, 9.5, k) + drift * 0.15, lerp(-9.5, -21, k) - drift * 0.2),
        new THREE.Vector3(0, lerp(1.3, 4.0, k), lerp(0, 3, k)),
        { fov: 45, rate: 2.5 },
      );
    }

    for (const sh of this.shafts) sh.material.uniforms.uTime.value = t;
    for (const sh of this.archShafts) sh.material.uniforms.uTime.value = t;
    this.pollen.update(t, kp);
    this.light.follow(new THREE.Vector3(0, 0, kp.z * 0.5), this.game.camera, t);
  }

  winCard() {
    const { distance, closest, letters } = this.stats;
    const lines = [{ text: `${Math.round(distance)} M  ·  CLOSEST CALL ${Number(closest).toFixed(1)} M  ·  LETTERS ${letters} / 3`, cls: 'end-meta' }];
    if (letters >= 3) lines.push({ text: 'Every letter on the trail found. Six more to go.', cls: 'end-credits' });
    return { title: 'ESCAPED', sub: 'The gate held. He’s already climbing.', lines };
  }
}
