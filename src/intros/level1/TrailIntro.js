import * as THREE from 'three';
import { RU, sign, scatter, rng } from '../../levels/jungle/props.js';
import { createLightShaft } from '../../shaders/lightshaft.js';
import { Cutscene, smooth, lerp } from '../Cutscene.js';
import { loadCast, makeKai, makeHandler, attachTorch, syncClip } from '../cast.js';
import { safePbr, box } from '../world.js';
import { buildTrail, trailSign } from './trail.js';
import {
  AUDIO_LEVELS,
  JungleBed,
  createJungleCueBuffers,
  createJungleMusicBuffer,
  loadJungleTheme,
} from '../../audio/jungleAudio.js';

/**
 * Level 1 intro, "Out of the dark" (~9.6 s). docs/LEVEL1_2_INTROS_AND_WINS.md
 *
 *   A  0.0  inside the data centre: the door slides open on the misty jungle, Kai steps out with the Key
 *   B  3.2  ahead of him on the trail, craning down as he runs at the camera       card: THE TRAIL
 *   C  6.4  over his shoulder, looking back: a torch beam in the doorway, the Handler coming
 *                                                                                    card: 15 METRES
 *   D  8.8  ease into the chase camera, letterbox down, "RUN" -> onDone()
 *
 * Kai runs toward -z. The door is at z = 2; the Handler hands over 15 m behind
 * Kai, the gap Level 1 starts on.
 */
const DOOR_Z = 2;
const KAI_Z0 = 5.6;
const HANDOFF = 9.6;
const GAP = 15;
const RUN = 6;
const HANDLER_OUT = 6.5;

/** Kai's speed over time: stands, walks out of the door, breaks into a run. */
function kaiSpeed(t) {
  if (t < 1.4) return 0;
  if (t < 1.8) return lerp(0, 1.6, (t - 1.4) / 0.4);
  if (t < 2.4) return 1.6;
  if (t < 3.4) return lerp(1.6, RUN, (t - 2.4) / 1.0);
  return RUN;
}

export class TrailIntro extends Cutscene {
  constructor(opts) {
    super('level01-intro', opts);
    this.length = HANDOFF;
    this.ending = 'handoff';
    this.popupWord = 'RUN';
    this.far = 170; // the mist has swallowed everything past ~150 m
    this.shots = [
      { id: 'A', at: 0 },
      { id: 'B', at: 3.2 },
      { id: 'C', at: 6.4 },
      { id: 'D', at: 8.8, blend: true },
    ];
    // Kai's distance from the start, integrated once so any moment can be looked up
    const step = 1 / 100;
    this._kz = new Float32Array(Math.ceil(90 / step) + 1);
    for (let i = 1; i < this._kz.length; i++) this._kz[i] = this._kz[i - 1] + kaiSpeed((i - 0.5) * step) * step;
    this._kzStep = step;
    this._handlerSpeed = (DOOR_Z + 3 - (this.kaiZ(HANDOFF) + GAP)) / (HANDOFF - HANDLER_OUT);
    // audio state — the rig itself is built in _startAudio(), torn down in teardown()
    this._actx = null;
    this._stride = 0;
    this._hStride = 0;
  }

  kaiZ(t) {
    const i = Math.min(this._kz.length - 2, Math.max(0, t / this._kzStep));
    const i0 = Math.floor(i);
    return KAI_Z0 - lerp(this._kz[i0], this._kz[i0 + 1], i - i0);
  }

  handlerZ(t) {
    if (t <= HANDOFF) return DOOR_Z + 3 - this._handlerSpeed * (t - HANDLER_OUT);
    return this.kaiZ(t) + GAP;
  }

  async build(assets) {
    const [cast, trail, concrete, innerMat] = await Promise.all([
      loadCast(assets),
      buildTrail(this.root, this.scene, assets, {
        z0: 40,
        z1: -280,
        keep: (x, z) => !(Math.abs(x) < 10.8 && z > -1.2 && z < 18.8), // the building; the jungle grows right up to it
        near: [{ x: 0, z: 4 }, { x: 0, z: -20 }, { x: 0, z: -42 }],
      }),
      safePbr(assets, 'concrete', { repeat: 3, tint: 0x8a8d86 }),
      safePbr(assets, 'concrete', { repeat: 2, tint: 0x3a3e44 }),
    ]);
    if (!this.scene) return;
    Object.assign(this, trail);

    this._buildDataCentre(concrete, innerMat);
    this._overgrow();
    trailSign(this.root, 4.6, -13, -0.35);
    trailSign(this.root, -4.8, -70, 0.3);

    this.kai = makeKai(this.root, cast.kai);
    this.kai.root.rotation.y = Math.PI; // facing down the trail (-z)
    this.handler = makeHandler(this.root, cast.handler);
    this.handler.root.rotation.y = Math.PI;
    this.torch = attachTorch(this.handler, this.root);
    this._aim = new THREE.Vector3();

    this.at(0.5, () => this.story.showCard('THE TRAIL', 'Site 7 is somewhere past the ruins. Run.'));
    this.at(4.2, () => this.story.hideCard());
    this.at(6.75, () => this.shake(0.3), { fx: true });
    this.at(6.9, () => this.story.showCard('15 METRES', "That's your whole lead."));
    this.at(8.8, () => this.story.hideCard());

    // ---- audio: the same sound world both levels live in ----
    this._startAudio();
    this.at(0.42, () => this._play('doorSlide', { volume: 0.66 }), { fx: true });
    this.at(6.5, () => {
      // he shoulders out of the doorway — the chase is on
      this._play('impact', { volume: 0.4, rate: 0.8 });
      this._startHandlerBreath();
      this._duckMusic(0.35, 0.8);
    }, { fx: true });
    this.at(8.8, () => {
      // the handoff sting under the ease into the chase camera, ahead of "RUN"
      this._play('handoff', { volume: 0.72 });
      this._duckMusic(0.4, 1.2);
    }, { fx: true });
  }

  /* ------------------------------------------------------------ audio */

  /**
   * The intro's own audio rig: one AudioContext, the shared cue palette, the
   * living jungle bed and the sparse intro loop — the same voices, style and
   * levels as both levels, so the run starts in one continuous sound world.
   * Torn down with the cutscene.
   */
  _startAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this._actx = new AC());

    this._amaster = ctx.createGain();
    this._amaster.gain.value = AUDIO_LEVELS.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this._amaster.connect(comp).connect(ctx.destination);

    this._acues = createJungleCueBuffers(ctx);

    // inside the data centre: rack hum, dead air and a faint LED whine
    const room = (this._roomGain = ctx.createGain());
    room.gain.value = 0.5;
    room.connect(this._amaster);
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 55;
    const humG = ctx.createGain(); humG.gain.value = 0.06;
    hum.connect(humG).connect(room); hum.start();
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource(); air.buffer = nb; air.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'lowpass'; airF.frequency.value = 240;
    const airG = ctx.createGain(); airG.gain.value = 0.05;
    air.connect(airF).connect(airG).connect(room); air.start();
    const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 5230;
    const whineG = ctx.createGain(); whineG.gain.value = 0.004;
    whine.connect(whineG).connect(room); whine.start();
    this._roomSources = [hum, air, whine];

    // the bed and music levels in the volume contract are post-master; undo
    // this bus's master so they land where they do in the levels
    const norm = 1 / AUDIO_LEVELS.master;
    this._bed = new JungleBed(ctx, this._amaster, { level: AUDIO_LEVELS.bed * norm });
    this._musicLevel = AUDIO_LEVELS.music * norm;

    // the game's theme: the sparse intro arrangement covers the moment
    // before the recorded loop decodes, then hands straight over
    this._amusic = ctx.createGain();
    this._amusic.gain.value = 0;
    this._amusic.gain.setTargetAtTime(this._musicLevel, ctx.currentTime + 0.8, 1.2);
    this._amusic.connect(this._amaster);
    const music = ctx.createBufferSource();
    music.buffer = createJungleMusicBuffer(ctx, 'intro');
    music.loop = true;
    music.connect(this._amusic);
    music.start();
    loadJungleTheme(ctx).then((buf) => {
      if (!buf || !this._actx) return; // already torn down
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this._amusic);
      src.start();
      try { music.stop(); } catch { /* already stopped */ }
    });

    // browsers keep the context suspended until the first gesture
    const resume = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
    this._resumeAudio = resume;
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  /** One of the shared cues, at the shared headroom. */
  _play(name, { volume = 0.7, rate = 1 } = {}) {
    if (!this._actx) return;
    const buffer = this._acues && this._acues[name];
    if (!buffer) return;
    const src = this._actx.createBufferSource();
    src.buffer = buffer;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = this._actx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this._amaster);
    src.start();
  }

  /** The Handler's breathing, from the moment he comes through the door. */
  _startHandlerBreath() {
    if (!this._actx || !this._acues.handlerBreath || this._breathSrc) return;
    const src = this._actx.createBufferSource();
    src.buffer = this._acues.handlerBreath;
    src.loop = true;
    const g = this._actx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.8, this._actx.currentTime, 0.4);
    src.connect(g).connect(this._amaster);
    src.start();
    this._breathSrc = src;
  }

  /** Dips the intro loop under a cue, then eases it back. */
  _duckMusic(depth = 0.4, hold = 0.6) {
    if (!this._amusic) return;
    const t = this._actx.currentTime;
    const g = this._amusic.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0.02, this._musicLevel * (1 - depth)), t, 0.06);
    g.setTargetAtTime(this._musicLevel, t + hold, 0.5);
  }

  /** The building at the jungle's edge Kai has just robbed: concrete shell, a corridor of racks, a sliding door. */
  _buildDataCentre(concrete, inner) {
    const g = new THREE.Group();
    this.root.add(g);
    const W = 20, H = 6, D = 16, T = 0.4;
    const z = DOOR_Z;
    const dw = 1.8, dh = 2.6;
    // facade with a doorway, side walls, back, roof
    g.add(box((W - dw) / 2, H, T, concrete, -(W + dw) / 4, H / 2, z + T / 2));
    g.add(box((W - dw) / 2, H, T, concrete, (W + dw) / 4, H / 2, z + T / 2));
    g.add(box(dw, H - dh, T, concrete, 0, dh + (H - dh) / 2, z + T / 2));
    g.add(box(T, H, D, concrete, -W / 2, H / 2, z + D / 2));
    g.add(box(T, H, D, concrete, W / 2, H / 2, z + D / 2));
    g.add(box(W, H, T, concrete, 0, H / 2, z + D));
    g.add(box(W + 0.6, 0.35, D + 0.6, concrete, 0, H, z + D / 2));
    // the corridor: dark walls, ceiling, floor, racks with blinking LEDs either side
    const cw = 4.2, ch = 3.2;
    g.add(box(0.2, ch, D - T, inner, -cw / 2, ch / 2, z + D / 2));
    g.add(box(0.2, ch, D - T, inner, cw / 2, ch / 2, z + D / 2));
    g.add(box(cw, 0.2, D - T, inner, 0, ch, z + D / 2));
    g.add(box(cw, 0.05, D - T, inner, 0, 0.02, z + D / 2));
    this._buildRacks(g, cw, z + T + 0.6, z + D - 0.6);
    // ceiling strips, cold and dim
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.62, 0.7) });
    for (let k = z + 3; k < z + D - 1; k += 3.2) g.add(box(1.2, 0.04, 0.18, strip, 0, ch - 0.12, k));

    // the door slides sideways into the wall
    this.door = box(dw + 0.1, dh + 0.05, 0.12, new THREE.MeshStandardMaterial({ color: 0x4d555d, metalness: 0.6, roughness: 0.5 }), 0, dh / 2, z + T + 0.08);
    g.add(this.door);
    const exit = sign(['EXIT'], { w: 0.7, h: 0.24, bg: '#06200e', fg: '#3dff7a', basic: true, glow: 2.2 });
    exit.position.set(0, dh + 0.3, z + T + 0.02);
    g.add(exit);
    // outside: a status lamp over the door (red, then green as it opens) and the warning plate
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }));
    this.lamp.position.set(0, dh + 0.35, z - 0.06);
    g.add(this.lamp);
    const plate = sign(['AUTHORISED', { t: 'PERSONNEL ONLY', size: 0.8 }], { w: 1.2, h: 0.62, bg: '#e8e2d2', fg: '#a3231c', border: '#a3231c' });
    plate.position.set(-2.1, 1.75, z - 0.02);
    plate.rotation.y = Math.PI;
    g.add(plate);
    // morning light through the open door, falling on the corridor floor
    const to = new THREE.Vector3(0.7, 0, z + 2.6);
    this.doorShaft = createLightShaft(to.clone().addScaledVector(this.light.sunDir, 7), to, 1.3, 0xffe2b0, 0.2, 5);
    g.add(this.doorShaft);
  }

  /** Undergrowth banked against the facade and on the roof: the jungle is taking the building back. */
  _overgrow() {
    const r = rng(7);
    const [b1, b2, bL] = this.kit.bushes;
    const front = [];
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      front.push({ x: side * (1.7 + r() * 8.3), y: -0.1, z: DOOR_Z - 0.6 - r() * 1.4, s: RU * (0.7 + r() * 0.6), ry: r() * 6.28 });
    }
    const roof = Array.from({ length: 9 }, () => ({ x: (r() - 0.5) * 18, y: 6.1, z: DOOR_Z + 1 + r() * 14, s: 0.012 + r() * 0.008, ry: r() * 6.28 }));
    if (bL) scatter(this.root, bL, front.slice(0, 8), { shadow: true });
    if (b1) scatter(this.root, b1, front.slice(8).map((p) => ({ ...p, s: p.s * 1.1 })), { shadow: true });
    if (b2) scatter(this.root, b2, roof);
  }

  _buildRacks(g, cw, za, zb) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 124; y += 7) {
      for (let k = 6; k < 60; k += 9) {
        if (Math.random() < 0.45) continue;
        x.fillStyle = ['#3dff8a', '#3dff8a', '#5ff2ff', '#ffb547'][Math.floor(Math.random() * 4)];
        x.fillRect(k, y, 3, 2);
      }
    }
    const led = new THREE.CanvasTexture(c);
    led.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.MeshStandardMaterial({ color: 0x15181c, emissive: 0xffffff, emissiveMap: led, emissiveIntensity: 2, roughness: 0.6 });
    const shell = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.6, metalness: 0.3 });
    this.ledMat = front;
    const geo = new THREE.BoxGeometry(0.8, 2.1, 0.62);
    const n = Math.floor((zb - za) / 0.68);
    for (const side of [-1, 1]) {
      // BoxGeometry faces: +x, -x, +y, -y, +z, -z. The LED face looks into the corridor.
      const mats = side < 0 ? [front, shell, shell, shell, shell, shell] : [shell, front, shell, shell, shell, shell];
      const racks = new THREE.InstancedMesh(geo, mats, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) racks.setMatrixAt(i, m.makeTranslation(side * (cw / 2 - 0.5), 1.05, za + i * 0.68));
      racks.castShadow = racks.receiveShadow = true;
      g.add(racks);
    }
  }

  pose(t, s, ds, dt) {
    const kai = this.kai;
    const kp = kai.root.position;
    const kz = this.kaiZ(t);
    kp.set(Math.sin(t * 0.4) * 0.25 * smooth(3, 5, t), 0, kz);
    const v = kaiSpeed(t);
    const clip = t < 1.4 ? 'idle' : v < 2 ? 'walk' : 'run';
    if (kai.currentName !== clip) {
      kai.play(clip, { fade: 0.25 });
      if (ds === 0) syncClip(kai, s);
    }
    if (clip === 'run') kai.current.timeScale = 0.75 + (v / RUN) * 0.35;
    kai.update(ds);

    // the Handler: inside until 6.5 s, then out of the door and down the trail, torch first
    const h = this.handler;
    const out = t >= HANDLER_OUT;
    h.root.visible = out;
    this.torch.setOn(out);
    if (out) {
      h.root.position.set(Math.sin(t * 0.7) * 0.6, 0, this.handlerZ(t));
      if (h.currentName !== 'run') {
        h.play('run', { fade: 0.15 });
        syncClip(h, s);
      }
      h.current.timeScale = 1.15;
      h.update(ds);
      // the beam sweeps the trail, finds Kai, and stays on his back
      const find = smooth(6.6, 7.7, t);
      this._aim.set(lerp(-6, kp.x, find), lerp(0.2, 1.15, find), lerp(this.handlerZ(t) - 14, kz + 0.3, find));
      this.torch.update(this._aim, t);
    }

    // the door, its lamp, the light coming in, and Kai's eyes adjusting to it
    const open = smooth(0.4, 1.4, t);
    this.door.position.x = open * 1.9;
    this.lamp.material.color.setRGB(t < 0.45 ? 4 : 0.3, t < 0.45 ? 0.3 : 4, t < 0.45 ? 0.2 : 0.8);
    this.doorShaft.material.uniforms.uStrength.value = smooth(0.6, 1.6, t);
    this.doorShaft.material.uniforms.uTime.value = t;
    this.ledMat.emissiveIntensity = 1.6 + Math.sin(t * 9) * 0.4;
    this.game.renderer.toneMappingExposure = lerp(0.32, 1.25, smooth(0.5, 2.3, t));

    // ---- camera
    if (this.shot === 'A') {
      const k = smooth(0, 3.2, t);
      this.frame(new THREE.Vector3(0.45, 1.55, 9.6 - k * 0.9), new THREE.Vector3(-0.1, 1.35 + k * 0.1, -8), { fov: 50, rate: Infinity });
    } else if (this.shot === 'B') {
      const k = smooth(3.2, 6.2, t);
      this.frame(new THREE.Vector3(3.1, lerp(5.6, 2.3, k), kz - 9.2), new THREE.Vector3(kp.x * 0.4, 1.15 + k * 0.1, kz + 1.5), { fov: 45 });
    } else if (this.shot === 'C') {
      this.frame(new THREE.Vector3(kp.x - 1.05, 1.42, kz - 2.5), new THREE.Vector3(kp.x + 0.6, 1.55, kz + 16), { fov: 40 });
    } else {
      this.frame(new THREE.Vector3(kp.x * 0.5, 2.5, kz + 7.4), new THREE.Vector3(kp.x * 0.7, 1.5, kz - 9), { fov: 62, rate: t > HANDOFF ? 12 : 3 });
    }

    // world
    for (const sh of this.shafts) sh.material.uniforms.uTime.value = t;
    this.pollen.update(t, kp);
    this.light.follow(kp, this.game.camera, t);

    // ---- sound: the data centre hands over to the living jungle ----
    if (this._actx) {
      this._roomGain?.gain.setTargetAtTime(0.5 * (1 - smooth(2.5, 4.5, t)), this._actx.currentTime, 0.15);
      // the distant wildlife swells in with the rest of the jungle
      this._bed?.update(dt, { birds: 0.4 * smooth(1.0, 2.6, t) });

      // Kai's footsteps, on stride distance — walking out, then running
      if (v > 0.05) {
        this._stride += v * ds;
        const strideLen = v < 2.5 ? 0.95 : 1.55;
        if (this._stride >= strideLen) {
          this._stride = 0;
          this._play('footstep', { volume: v < 2.5 ? 0.4 : 0.56, rate: 0.96 + Math.random() * 0.08 });
        }
      }

      // the Handler's, heavier, once he is out
      if (out && this._prevHandlerZ !== undefined) {
        this._hStride += Math.abs(this.handlerZ(t) - this._prevHandlerZ);
        if (this._hStride >= 1.7) {
          this._hStride = 0;
          this._play('footstep', { volume: 0.4, rate: 0.78 + Math.random() * 0.05 });
        }
      }
      this._prevHandlerZ = out ? this.handlerZ(t) : undefined;
    }
  }

  teardown() {
    if (this._resumeAudio) {
      window.removeEventListener('pointerdown', this._resumeAudio);
      window.removeEventListener('keydown', this._resumeAudio);
      this._resumeAudio = null;
    }
    if (this._bed) { this._bed.dispose(); this._bed = null; }
    for (const s of this._roomSources || []) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this._roomSources = null;
    try { this._breathSrc?.stop(); } catch { /* already stopped */ }
    this._breathSrc = null;
    if (this._actx) { this._actx.close().catch(() => {}); this._actx = null; }
    super.teardown();
  }
}
