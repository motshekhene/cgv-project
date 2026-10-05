import * as THREE from 'three';
import { Level } from '../core/Level.js';

/**
 * PROLOGUE — Kai's office, Noctis Field Station, 01:41.
 *
 * He is sitting at his own desk, finishing the last job of a night shift on
 * his own laptop. He finds something on it. He copies it. The door opens
 * behind him.
 *
 * Shape:
 *   cards    clicked through — who he is, where he is, what he is doing
 *   seated   no walking at all. The laptop is the whole interface.
 *   wide     he stands, and the camera pulls back so the player can see both
 *            the figure in the doorway and the way out at the same time
 *   flee     control returns, out through the fire door
 *
 * Pacing rule: the laptop finishes typing before Kai thinks anything, and he
 * finishes thinking before the laptop types again. Nothing here is on a timer
 * that can collide with something else the player is reading.
 *
 * Audio is synthesised with the Web Audio API — no sound files, so nothing to
 * download, credit or wait for. It is self-contained in this file on purpose,
 * so it does not collide with 1B's game-wide audio work.
 *
 * TWO PLANTS THAT PAY OFF IN LEVEL 03 — do not change without telling the team:
 *   1. B. INGRAM, on the work-order card. The prologue NEVER says he is the man
 *      in the doorway — that is level 03's reveal, and naming him here kills it.
 *   2. SITE 7, in the holding-site list. Level 03 depends on the player having
 *      read it here and not understood it.
 */

const HANDLER_NAME = 'B. INGRAM';

const ROOM = { w: 14, d: 11, h: 3.2 };
const SEAT = { x: 0, z: -2.9, eye: 1.18 };
const STAND_EYE = 1.7;
const WALK = 3.2;
const LOOK = 0.0022;

// the pull-back vantage: high in the north-east corner, where the lit doorway
// and the fire door are both inside one frame
const WIDE_POS = new THREE.Vector3(4.6, 2.85, -4.4);
const WIDE_LOOK = new THREE.Vector3(-1.8, 1.25, 0.9);

/* ==========================================================================
   Sfx — a very small synth. Every sound here is generated at runtime.
   ========================================================================== */
class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
  }

  /** Must be called from a click — browsers block audio until a gesture. */
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
      this.clickBuf = this._noise(0.05, 1);
      this.started = true;
    } catch (e) { this.ctx = null; }
  }

  _noise(seconds, rough) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (rough) { d[i] = white; }
      else { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.2; }
    }
    return buf;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  /** The room: a filtered rumble plus the hum of a building that never sleeps. */
  roomTone() {
    if (!this.ctx || this.tone) return;
    const ctx = this.ctx, t = this.t;

    const src = ctx.createBufferSource();
    src.buffer = this._noise(3, 0);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    g.gain.linearRampToValueAtTime(0.20, t + 2.5);
    this.tone = g; this.toneSrc = src;

    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 57;
    const og = ctx.createGain(); og.gain.value = 0;
    osc.connect(og); og.connect(this.master);
    osc.start();
    og.gain.linearRampToValueAtTime(0.055, t + 2.5);
    this.hum = og; this.humOsc = osc;
  }

  /** One keystroke. */
  click() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    const src = ctx.createBufferSource();
    src.buffer = this.clickBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 1100;
    bp.Q.value = 1.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035 + Math.random() * 0.02, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.07);
  }

  /** Two short blips — the check came back with something on it. */
  alert() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    [[740, 0], [590, 0.14]].forEach(([f, d]) => {
      const o = ctx.createOscillator();
      o.type = 'square'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.045, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.13);
      o.connect(g); g.connect(this.master);
      o.start(t + d); o.stop(t + d + 0.16);
    });
  }

  /** The manifest. Two detuned lows beating against each other. */
  sting() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    [[55, 3.2], [58.4, 3.2], [110, 2.0]].forEach(([f, dur]) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 240;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }

  /** The drive takes the copy. */
  confirm() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    [[880, 0], [1320, 0.12]].forEach(([f, d]) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.07, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(t + d); o.stop(t + d + 0.55);
    });
  }

  /** The door. The room tone dies, which is most of the effect. */
  doorOpen() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    if (this.tone) this.tone.gain.linearRampToValueAtTime(0.03, t + 0.4);
    if (this.hum) this.hum.gain.linearRampToValueAtTime(0.0, t + 0.4);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.0);
  }

  /** One heartbeat — two hits, not one. */
  thump() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    [[0, 0.17], [0.17, 0.12]].forEach(([d, amp]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(74, t + d);
      o.frequency.exponentialRampToValueAtTime(42, t + d + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, t + d);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g); g.connect(this.master);
      o.start(t + d); o.stop(t + d + 0.25);
    });
  }

  /** A slow pulsing low tone while he is running. */
  alarm() {
    if (!this.ctx || this.alarmGain) return;
    const ctx = this.ctx, t = this.t;
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = 68;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 1.5;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    o.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.05, t);
    o.start(t); lfo.start(t);
    this.alarmGain = g; this.alarmOsc = o; this.alarmLfo = lfo;
  }

  setMuted(v) {
    this.muted = v;
    if (this.master) this.master.gain.value = v ? 0 : 0.85;
  }

  stop() {
    if (!this.ctx) return;
    try {
      if (this.toneSrc) this.toneSrc.stop();
      if (this.humOsc) this.humOsc.stop();
      if (this.alarmOsc) this.alarmOsc.stop();
      if (this.alarmLfo) this.alarmLfo.stop();
      this.ctx.close();
    } catch (e) { /* already closed */ }
    this.ctx = null; this.master = null;
    this.tone = this.hum = this.alarmGain = null;
  }
}

/* ========================================================================== */
export class Prologue extends Level {
  constructor() {
    super('prologue');

    this.px = SEAT.x;
    this.pz = SEAT.z;
    this.eye = SEAT.eye;
    this.yaw = 0;                 // yaw 0 looks down -Z, which faces the desk
    this.pitch = -0.2;            // looking down at the laptop
    this.locked = false;
    this.standing = false;   // may he walk?
    this.seated = true;      // is he still in the chair? (clamps how far he can turn)
    this.cine = 0;                // 0 = first person, 1 = the wide shot

    this.phase = 'card';
    this.t = 0;
    this.leaving = false;
    this.beatT = 0;

    this.says = [];
    this.sayT = 0;

    this.lines = [];
    this.pending = null;
    this.pendingChars = 0;
    this.queue = [];

    this.blockers = [];
    this.sfx = new Sfx();

    this.cards = [
      '<div style="color:#7fd4ff;font-size:13px;letter-spacing:.34em">' +
        'NOCTIS FIELD STATION</div>' +
      '<div style="color:#5b6379;font-size:12px;letter-spacing:.28em;margin-top:10px">' +
        'SUBLEVEL 2 &nbsp;&middot;&nbsp; 01:41</div>',

      '<div style="color:#eef2fb;font-size:28px;letter-spacing:.18em">KAI NDLOVU</div>' +
      '<div style="color:#8f9bb0;font-size:12.5px;letter-spacing:.26em;margin-top:12px">' +
        'SYSTEMS ENGINEER &nbsp;&middot;&nbsp; NIGHT SHIFT</div>',

      '<div style="color:#5b6379;font-size:11.5px;letter-spacing:.3em">' +
        "TONIGHT'S LAST JOB</div>" +
      '<div style="color:#c6d2e4;font-size:18px;letter-spacing:.08em;margin-top:14px">' +
        'Sign off the decommission of Rack 14</div>' +
      '<div style="color:#8f9bb0;font-size:12.5px;letter-spacing:.2em;margin-top:16px">' +
        'ORDERED BY &nbsp;<span style="color:#eef2fb">' + HANDLER_NAME + '</span></div>',

      '<div style="color:#dfe7f5;font-size:21px;font-style:italic;line-height:1.7;' +
        'font-family:ui-sans-serif,system-ui,sans-serif">' +
        'Nine hours into a twelve-hour shift.<br>One signature and he can go home.</div>',
    ];
    this.cardIndex = 0;
    this.cardT = 0;
    this.introSaid = false;
  }

  /* ==================================================== build */
  init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(0x05070c, 0.03);

    this._buildOffice();
    this._buildDesk();
    this._buildServerHall();
    this._buildFigures();
    this._buildHud();

    this._onClick = () => {
      this.sfx.start();                       // audio needs a gesture
      if (this.phase === 'card') { this._nextCard(); return; }
      const el = this.game.renderer.domElement;
      if (!this.locked && el.requestPointerLock) el.requestPointerLock();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.game.renderer.domElement;
      this.hud.lock.style.opacity =
        (this.locked || this.phase === 'card' || this.cine > 0) ? '0' : '1';
    };
    this.game.renderer.domElement.addEventListener('click', this._onClick);
    document.addEventListener('pointerlockchange', this._onLockChange);

    this.game.camera.fov = 50;
    this.game.camera.updateProjectionMatrix();

    this._fp = new THREE.Vector3();
    this._look3 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  _buildOffice() {
    const { w, d, h } = ROOM;
    this.geoBox = new THREE.BoxGeometry(1, 1, 1);

    this.matFloor = new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.9 });
    this.matWall = new THREE.MeshStandardMaterial({ color: 0x232a35, roughness: 0.95 });
    this.matDark = new THREE.MeshStandardMaterial({ color: 0x141922, roughness: 0.9 });

    const put = (mat, sx, sy, sz, x, y, z) => {
      const m = new THREE.Mesh(this.geoBox, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };

    put(this.matFloor, w, 0.3, d, 0, -0.15, 0);
    put(this.matDark, w, 0.3, d, 0, h + 0.15, 0);
    put(this.matWall, 0.4, h, d, -w / 2, h / 2, 0);
    put(this.matWall, w, h, 0.4, 0, h / 2, -d / 2);
    put(this.matWall, w / 2 - 1, h, 0.4, -(w / 4 + 0.5), h / 2, d / 2);
    put(this.matWall, w / 2 - 1, h, 0.4, (w / 4 + 0.5), h / 2, d / 2);

    // ---- the fire door, west wall. Dead until he takes the key. ----
    this.matDoorPanel = new THREE.MeshStandardMaterial({ color: 0x2b3a28, roughness: 0.8 });
    const door = new THREE.Mesh(this.geoBox, this.matDoorPanel);
    door.scale.set(0.12, 2.2, 1.3);
    door.position.set(-w / 2 + 0.3, 1.1, 0);
    this.root.add(door);

    this.matExit = new THREE.MeshBasicMaterial({ color: 0x24331f });
    const frame = [
      [0.08, 2.3, 0.1, -w / 2 + 0.38, 1.15, -0.72],
      [0.08, 2.3, 0.1, -w / 2 + 0.38, 1.15, 0.72],
      [0.08, 0.1, 1.54, -w / 2 + 0.38, 2.3, 0],
    ];
    for (const [sx, sy, sz, x, y, z] of frame) {
      const m = new THREE.Mesh(this.geoBox, this.matExit);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      this.root.add(m);
    }
    const sign = new THREE.Mesh(this.geoBox, this.matExit);
    sign.scale.set(0.09, 0.3, 0.9);
    sign.position.set(-w / 2 + 0.42, 2.66, 0);
    this.root.add(sign);

    // floor guides from the desk to the door — a light source and a direction
    this.matGuide = new THREE.MeshBasicMaterial({ color: 0x1d2a1a });
    this.guides = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Mesh(this.geoBox, this.matGuide);
      g.scale.set(0.5, 0.03, 0.12);
      g.position.set(-0.9 - i * 0.82, 0.03, THREE.MathUtils.lerp(-1.6, 0, i / 6));
      this.root.add(g);
      this.guides.push(g);
    }

    this.exitLight = new THREE.PointLight(0x9ed36a, 0, 7.5, 2);
    this.exitLight.position.set(-w / 2 + 1.5, 1.9, 0);
    this.root.add(this.exitLight);

    this.pathLight = new THREE.PointLight(0x8fc47a, 0, 7, 2);
    this.pathLight.position.set(-3.2, 2.2, -0.6);
    this.root.add(this.pathLight);

    // ---- the doorway he came in through ----
    // A lit panel in the gap of the south wall. Without something bright behind
    // him the figure is black on black, and the whole beat is invisible.
    this.matDoorway = new THREE.MeshBasicMaterial({ color: 0x0b0d12 });
    const doorway = new THREE.Mesh(this.geoBox, this.matDoorway);
    doorway.scale.set(2.0, 2.45, 0.08);
    doorway.position.set(0, 1.22, d / 2 - 0.22);
    this.root.add(doorway);

    this.doorLight = new THREE.SpotLight(0xffd9a8, 0, 16, 0.8, 0.6, 1.2);
    this.doorLight.position.set(0, 2.6, d / 2 + 1.0);
    this.doorLight.target.position.set(0, 1, 0);
    this.root.add(this.doorLight, this.doorLight.target);

    this.hemi = new THREE.HemisphereLight(0x2c3a4e, 0x080a0f, 0.5);
    this.root.add(this.hemi);

    this.deskLight = new THREE.SpotLight(0xcfe4ff, 26, 11, 0.9, 0.55, 1.4);
    this.deskLight.position.set(0, h - 0.25, -3.0);
    this.deskLight.target.position.set(0, 0.8, -4.4);
    this.deskLight.castShadow = true;
    this.deskLight.shadow.mapSize.set(1024, 1024);
    this.root.add(this.deskLight, this.deskLight.target);

    const strip = new THREE.Mesh(this.geoBox, new THREE.MeshBasicMaterial({ color: 0xbcd6f0 }));
    strip.scale.set(2.6, 0.06, 0.3);
    strip.position.set(0, h - 0.18, -3.0);
    this.matStrip = strip.material;
    this.root.add(strip);

    const t = 0.7;
    this.blockers.push({ x0: -w / 2, x1: -w / 2 + t, z0: -d / 2, z1: d / 2 });
    this.blockers.push({ x0: w / 2 - t, x1: w / 2, z0: -d / 2, z1: d / 2 });
    this.blockers.push({ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: -d / 2 + t });
    this.blockers.push({ x0: -w / 2, x1: w / 2, z0: d / 2 - t, z1: d / 2 });
  }

  _buildDesk() {
    this.matDesk = new THREE.MeshStandardMaterial({ color: 0x2a3240, roughness: 0.75 });
    this.matMetal = new THREE.MeshStandardMaterial({
      color: 0x3a434f, roughness: 0.4, metalness: 0.6,
    });

    const top = new THREE.Mesh(this.geoBox, this.matDesk);
    top.scale.set(3.4, 0.08, 1.3);
    top.position.set(0, 0.74, -4.3);
    top.castShadow = true; top.receiveShadow = true;
    this.root.add(top);

    for (const sx of [-1.5, 1.5]) {
      const leg = new THREE.Mesh(this.geoBox, this.matDesk);
      leg.scale.set(0.1, 0.74, 1.1);
      leg.position.set(sx, 0.37, -4.3);
      this.root.add(leg);
    }
    this.blockers.push({ x0: -1.8, x1: 1.8, z0: -5.0, z1: -3.6 });

    const seat = new THREE.Mesh(this.geoBox, this.matDark);
    seat.scale.set(0.62, 0.09, 0.6);
    seat.position.set(0, 0.46, -2.85);
    seat.castShadow = true;
    this.root.add(seat);
    const back = new THREE.Mesh(this.geoBox, this.matDark);
    back.scale.set(0.62, 0.72, 0.09);
    back.position.set(0, 0.84, -2.56);
    this.root.add(back);

    // ---- the laptop ----
    const base = new THREE.Mesh(this.geoBox, this.matMetal);
    base.scale.set(0.74, 0.03, 0.52);
    base.position.set(0, 0.795, -4.24);
    base.castShadow = true;
    this.root.add(base);

    const keys = new THREE.Mesh(this.geoBox, this.matDark);
    keys.scale.set(0.64, 0.012, 0.34);
    keys.position.set(0, 0.812, -4.2);
    this.root.add(keys);

    this.lid = new THREE.Group();
    this.lid.position.set(0, 0.81, -4.5);
    this.lid.rotation.x = -0.3;
    this.root.add(this.lid);

    const shell = new THREE.Mesh(this.geoBox, this.matMetal);
    shell.scale.set(0.74, 0.46, 0.022);
    shell.position.set(0, 0.23, -0.014);
    shell.castShadow = true;
    this.lid.add(shell);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d');
    this.screenTex = new THREE.CanvasTexture(this.canvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.matScreen = new THREE.MeshBasicMaterial({ map: this.screenTex });

    this.geoScreen = new THREE.PlaneGeometry(0.68, 0.425);
    const screen = new THREE.Mesh(this.geoScreen, this.matScreen);
    screen.position.set(0, 0.23, 0.002);
    this.lid.add(screen);

    this.screenGlow = new THREE.PointLight(0x7fd4ff, 5, 3.4, 2);
    this.screenGlow.position.set(0, 1.1, -4.1);
    this.root.add(this.screenGlow);

    this.matDrive = new THREE.MeshStandardMaterial({
      color: 0x2a2f3a, emissive: 0x000000, roughness: 0.4, metalness: 0.5,
    });
    this.drive = new THREE.Mesh(this.geoBox, this.matDrive);
    this.drive.scale.set(0.2, 0.05, 0.3);
    this.drive.position.set(0.62, 0.805, -4.18);
    this.drive.castShadow = true;
    this.root.add(this.drive);

    this.lines = [
      'NOCTIS  ·  WORK ORDER 4471',
      '',
      'RACK 14 — DECOMMISSION',
      'AWAITING YOUR SIGN-OFF',
    ];
    this._drawScreen();
  }

  /** Glass wall on the east side with the dark server hall beyond it. */
  _buildServerHall() {
    const { w, d, h } = ROOM;

    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0x8fc8e0, roughness: 0.1, metalness: 0.3,
      transparent: true, opacity: 0.12,
    });
    const glass = new THREE.Mesh(this.geoBox, this.matGlass);
    glass.scale.set(0.08, h - 0.5, d - 1.4);
    glass.position.set(w / 2 - 0.4, (h - 0.5) / 2, 0);
    this.root.add(glass);
    this.blockers.push({ x0: w / 2 - 0.9, x1: w / 2 - 0.1, z0: -d / 2, z1: d / 2 });

    this.geoRack = new THREE.BoxGeometry(1.3, 2.4, 0.9);
    this.geoLed = new THREE.BoxGeometry(0.9, 0.04, 0.04);
    this.matRack = new THREE.MeshStandardMaterial({
      color: 0x1a2029, roughness: 0.7, metalness: 0.3,
    });
    this.matLedOn = new THREE.MeshBasicMaterial({ color: 0x4fd6e0 });
    this.matLedOff = new THREE.MeshBasicMaterial({ color: 0x16222c });

    this.rack14 = null;
    for (let i = 0; i < 4; i++) {
      const z = -3.3 + i * 2.2;
      const rack = new THREE.Mesh(this.geoRack, this.matRack);
      rack.position.set(w / 2 + 1.6, 1.2, z);
      this.root.add(rack);

      const leds = [];
      for (let k = 0; k < 6; k++) {
        const led = new THREE.Mesh(this.geoLed, this.matLedOn);
        led.position.set(w / 2 + 1.0, 0.45 + k * 0.33, z);
        led.rotation.y = Math.PI / 2;
        this.root.add(led);
        leds.push(led);
      }
      if (i === 1) this.rack14 = leds;
    }

    const hallGlow = new THREE.PointLight(0x2f7f9a, 7, 12, 2);
    hallGlow.position.set(w / 2 + 2.2, 2.2, 0);
    this.root.add(hallGlow);
  }

  _buildFigures() {
    // ---- the figure in the doorway. Never a face, never named here. ----
    this.matSil = new THREE.MeshBasicMaterial({ color: 0x05070b });
    this.handler = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 10), this.matSil);
    torso.position.y = 1.08;
    this.handler.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), this.matSil);
    head.position.y = 1.8;
    this.handler.add(head);

    const coat = new THREE.Mesh(this.geoBox, this.matSil);
    coat.scale.set(0.82, 1.4, 0.4);
    coat.position.y = 0.74;
    this.handler.add(coat);

    this.handlerGlow = new THREE.PointLight(0xffcf96, 0, 6.5, 2);
    this.handlerGlow.position.set(0, 1.5, 1.3);
    this.handler.add(this.handlerGlow);

    this.handler.position.set(0, 0, ROOM.d / 2 + 0.4);
    this.handler.visible = false;
    this.root.add(this.handler);

    // ---- Kai himself. Only on screen during the pull-back, so the player can
    //      see where they are standing relative to both doors. ----
    this.matKai = new THREE.MeshStandardMaterial({ color: 0x45566e, roughness: 0.7 });
    this.kai = new THREE.Group();

    const kTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.82, 4, 10), this.matKai);
    kTorso.position.y = 1.02; kTorso.castShadow = true;
    this.kai.add(kTorso);

    const kHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), this.matKai);
    kHead.position.y = 1.64; kHead.castShadow = true;
    this.kai.add(kHead);

    for (const sx of [-0.19, 0.19]) {
      const leg = new THREE.Mesh(this.geoBox, this.matKai);
      leg.scale.set(0.17, 0.62, 0.17);
      leg.position.set(sx, 0.31, 0);
      this.kai.add(leg);
    }
    this.kai.visible = false;
    this.root.add(this.kai);
  }

  /* ==================================================== hud */
  _buildHud() {
    const host = document.getElementById('hud') || document.body;
    const mk = (css, html = '') => {
      const el = document.createElement('div');
      el.style.cssText = css;
      el.innerHTML = html;
      host.appendChild(el);
      return el;
    };
    const mono = "font-family:ui-monospace,'JetBrains Mono',Menlo,monospace";
    const base = 'position:absolute;pointer-events:none;';
    this.hud = {};

    this.hud.prompt = mk(
      base + mono + ';left:50%;bottom:110px;transform:translateX(-50%);color:#eef2fb;' +
      'font-size:14px;letter-spacing:.14em;text-align:center;opacity:0;transition:opacity .2s;' +
      'background:rgba(5,8,14,.6);border:1px solid rgba(79,214,224,.45);border-radius:6px;' +
      'padding:10px 18px'
    );

    this.hud.lock = mk(
      base + mono + ';left:50%;top:60%;transform:translate(-50%,-50%);color:#8f9bb0;' +
      'font-size:12.5px;letter-spacing:.2em;transition:opacity .3s;opacity:0',
      'CLICK TO LOOK AROUND'
    );

    this.hud.skip = mk(
      base + mono + ';right:34px;bottom:34px;color:#5b6379;font-size:11.5px;letter-spacing:.2em',
      'K — SKIP &nbsp;·&nbsp; M — MUTE'
    );

    this.hud.thought = mk(
      base + ';left:50%;bottom:160px;transform:translateX(-50%);max-width:680px;' +
      'text-align:center;color:#dfe7f5;font-size:19px;font-style:italic;line-height:1.5;' +
      'text-shadow:0 2px 14px rgba(0,0,0,.9);opacity:0;transition:opacity .5s'
    );

    this.hud.fade = mk(
      'position:absolute;inset:0;background:#04060a;pointer-events:none;opacity:0;' +
      'transition:opacity .9s'
    );

    this.hud.card = mk(
      'position:absolute;inset:0;background:#04060a;pointer-events:none;opacity:1;' +
      'transition:opacity 1.1s;display:flex;align-items:center;justify-content:center;' +
      'text-align:center;' + mono
    );
    this.hud.cardBody = document.createElement('div');
    this.hud.cardBody.style.cssText = 'transition:opacity .35s';
    this.hud.card.appendChild(this.hud.cardBody);
    this.hud.cardBody.innerHTML = this.cards[0];

    this.hud.cardHint = mk(
      base + mono + ';left:50%;bottom:70px;transform:translateX(-50%);color:#5b6379;' +
      'font-size:11.5px;letter-spacing:.28em;transition:opacity .4s',
      'CLICK TO CONTINUE'
    );
  }

  _nextCard() {
    if (this.cardT > 0) return;
    this.cardIndex++;
    if (this.cardIndex >= this.cards.length) {
      this.hud.card.style.opacity = '0';
      this.hud.cardHint.style.opacity = '0';
      this.phase = 'seated';
      this.t = 0;
      this.sfx.roomTone();
      return;
    }
    this.hud.cardBody.style.opacity = '0';
    this.cardT = 0.35;
  }

  /* ==================================================== one text channel */
  _say(text, secs = null, flush = false) {
    const words = text.replace(/<[^>]+>/g, '').trim().split(/\s+/).length;
    const dwell = secs ?? Math.max(3.4, 1.8 + words * 0.4);
    if (flush) { this.says.length = 0; this.sayT = Math.min(this.sayT, 0.4); }
    this.says.push({ text, secs: dwell });
  }

  _tickSay(dt) {
    if (this.sayT > 0) {
      this.sayT -= dt;
      if (this.sayT <= 0) { this.hud.thought.style.opacity = '0'; this.sayT = -0.5; }
      return;
    }
    if (this.sayT < 0) { this.sayT = Math.min(0, this.sayT + dt); return; }
    if (this.says.length) {
      const n = this.says.shift();
      this.hud.thought.innerHTML = n.text;
      this.hud.thought.style.opacity = '1';
      this.sayT = n.secs;
    }
  }

  /** The two gates that stop text colliding with text. */
  _typing() { return this.pending !== null || this.queue.length > 0; }
  _talking() { return this.says.length > 0 || this.sayT > 0; }

  /** Clear the text channel. Acting dismisses whatever he was thinking —
   *  otherwise a leftover thought sits over the laptop while it types. */
  _hush() {
    this.says.length = 0;
    this.sayT = 0;
    this.hud.thought.style.opacity = '0';
  }

  _prompt(html) {
    this.hud.prompt.innerHTML = html;
    this.hud.prompt.style.opacity = html ? '1' : '0';
  }

  /* ==================================================== laptop screen */
  _drawScreen() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.fillStyle = '#070c14';
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.02)';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);

    c.font = '30px ui-monospace, Menlo, monospace';
    c.textBaseline = 'top';
    let y = 24;
    const draw = (text) => {
      if (text.startsWith('!')) c.fillStyle = '#ffb03a';
      else if (text.startsWith('>')) c.fillStyle = '#ff6b6b';
      else c.fillStyle = '#8fd8ff';
      c.fillText(text.replace(/^[!>]/, ''), 32, y);
      y += 37;
    };
    for (const line of this.lines) draw(line);
    if (this.pending !== null) draw(this.pending.slice(0, this.pendingChars) + '█');
    this.screenTex.needsUpdate = true;
  }

  _type(lines) { this.queue = lines.slice(); this._next(); }

  _next() {
    if (this.queue.length === 0) { this.pending = null; return false; }
    this.pending = this.queue.shift();
    this.pendingChars = 0;
    return true;
  }

  /* ==================================================== movement */
  _blocked(x, z) {
    const r = 0.4;
    for (const b of this.blockers) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    return false;
  }

  _move(dt) {
    const i = this.input;
    let f = (i.isDown('forward') ? 1 : 0) - (i.isDown('back') ? 1 : 0);
    let s = (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0);
    const len = Math.hypot(f, s);
    if (len > 0) { f /= len; s /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (-sin * f + cos * s) * WALK * dt;
    const dz = (-cos * f - sin * s) * WALK * dt;
    if (!this._blocked(this.px + dx, this.pz)) this.px += dx;
    if (!this._blocked(this.px, this.pz + dz)) this.pz += dz;
  }

  _look() {
    this.yaw -= this.input.mouse.dx * LOOK;
    this.pitch -= this.input.mouse.dy * LOOK;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.1, 1.1);
    // in the chair he can glance around, but he cannot spin on the spot
    if (this.seated) this.yaw = THREE.MathUtils.clamp(this.yaw, -1.0, 1.0);
  }

  _exitArrow() {
    const dx = (-ROOM.w / 2) - this.px;
    const dz = 0 - this.pz;
    let d = Math.atan2(-dx, -dz) - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.55) return '&uarr;';
    return d > 0 ? '&larr;' : '&rarr;';
  }

  /** Yaw that points the camera at the fire door, from where he is standing. */
  _yawToExit() {
    return Math.atan2(-((-ROOM.w / 2) - this.px), -(0 - this.pz));
  }

  /* ==================================================== update */
  update(dt, state) {
    this.t += dt;

    if (this.input.pressed('mute')) this.sfx.setMuted(!this.sfx.muted);
    if (this.input.isDown('skip') && !this.leaving) { this._exit(state); return; }

    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) {
        this.hud.cardBody.innerHTML = this.cards[this.cardIndex];
        this.hud.cardBody.style.opacity = '1';
      }
    }

    if (this.phase !== 'card' && this.cine <= 0) this._look();
    this._tickSay(dt);
    if (this.standing && this.phase !== 'done') this._move(dt);

    // laptop typing, with a keystroke every few characters
    if (this.pending !== null) {
      const before = Math.floor(this.pendingChars);
      this.pendingChars += dt * 58;
      const after = Math.floor(this.pendingChars);
      if (after > before && after % 3 === 0) this.sfx.click();
      if (this.pendingChars >= this.pending.length) {
        this.lines.push(this.pending);
        this.pendingChars = 0;
        if (!this._next()) this.pending = null;
      }
      this._drawScreen();
    }

    // heartbeat, from the moment the door opens
    if (this.phase === 'wide' || this.phase === 'flee') {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.sfx.thump(); this.beatT = 0.84; }
    }

    switch (this.phase) {
      case 'card': break;

      case 'seated': {
        if (!this.introSaid && this.t > 1.0) {
          this.introSaid = true;
          this.hud.lock.style.opacity = this.locked ? '0' : '1';
          this._say('Sign it off and go home.');
        }
        if (this.t > 2.0) {
          this._prompt('<b style="color:#4fd6e0">E</b> &nbsp; RUN THE CHECK');
          if (this.input.pressed('interact')) {
            this._prompt('');
            this._hush();
            this.phase = 'check';
            this.t = 0;
            this.lines = [];
            this._type([
              'RACK 14 — DECOMMISSION CHECK',
              '',
              'VERIFYING ......................... 98%',
              'VERIFYING ........................ 100%',
              '',
              'COMPLETE',
              '!PULLED FROM SERVICE 14 MARCH',
              '!STILL DRAWING POWER',
            ]);
          }
        }
        break;
      }

      // the laptop finishes before he thinks anything
      case 'check': {
        if (!this._typing()) {
          this.phase = 'checkRead';
          this.t = 0;
          this.sfx.alert();
          this._say('This rack was switched off in March.');
          this._say('So why is it still running?');
        }
        break;
      }

      // and he finishes thinking before the laptop types again
      case 'checkRead': {
        if (!this._talking()) {
          this.phase = 'manifest';
          this.t = 0;
          this.lines = [];
          this.sfx.sting();
          this._type([
            '> VOLUME FOUND — NOT ON THE ASSET REGISTER',
            '',
            'PROJECT BLACKOUT',
            'DEPLOYMENT MANIFEST',
            '',
            'EFFECT   : CONTINENTAL NETWORK SHUTDOWN',
            'STATUS   : CONTRACTED',
            '!GOES LIVE: 9 DAYS',
            '',
            'HOLDING SITES',
            '  02  NORTHGATE SUBSTATION',
            '  07  SITE 7 — INTERIOR BASIN',
            '  11  CAPE LANDING',
            '',
            '!MASTER KEY HELD ON THIS VOLUME',
          ]);
        }
        break;
      }

      case 'manifest': {
        if (!this._typing()) {
          this.phase = 'read';
          this.t = 0;
          this._say("This isn't a maintenance log.");
          this._say('A kill switch. Every network on the continent. Nine days.');
        }
        break;
      }

      case 'read': {
        if (!this._talking()) { this.phase = 'choice'; this.t = 0; }
        break;
      }

      case 'choice': {
        this._prompt(
          '<b style="color:#ffc857">E</b> &nbsp; COPY IT TO THE DRIVE' +
          '<span style="opacity:.4"> &nbsp;&nbsp;|&nbsp;&nbsp; </span>' +
          '<b style="color:#8f9bb0">Q</b> &nbsp; CLOSE THE LAPTOP'
        );
        if (this.input.pressed('ability')) {
          this.lines.push('');
          this.lines.push('!9 DAYS');
          this._drawScreen();
          this.phase = 'refused';
          this.t = 0;
          this._prompt('');
          this._say("I can't close this and walk out.", null, true);
        }
        if (this.input.pressed('interact')) this._copy(state);
        break;
      }

      case 'refused': {
        if (!this._talking()) this.phase = 'choice';
        break;
      }

      case 'copied': {
        this.matDrive.emissive.setHex(0xffc857);
        this.matDrive.emissiveIntensity = 0.55 + Math.sin(this.t * 6) * 0.25;
        if (this.t > 2.4) {
          this.phase = 'stand';
          this.t = 0;
          this.handler.visible = true;
          this.handler.position.z = 4.3;        // already inside the room
          this.handlerGlow.intensity = 9;
          this.doorLight.intensity = 46;
          this.matDoorway.color.setHex(0xffcf96);
          this.deskLight.intensity = 14;
          this.matStrip.color.setHex(0x3c4a5a);
          this.sfx.doorOpen();
          this._say('Someone just opened the door behind me.', null, true);
        }
        break;
      }

      // he gets to his feet — the camera rises
      case 'stand': {
        const k = Math.min(1, this.t / 1.2);
        this.eye = THREE.MathUtils.lerp(SEAT.eye, STAND_EYE, k);
        this.pz = THREE.MathUtils.lerp(SEAT.z, SEAT.z + 0.7, k);
        if (this.t > 1.2) {
          this.phase = 'wide';
          this.t = 0;
          this.seated = false;            // out of the chair: he can turn freely
          this.yaw = this._yawToExit();   // the shot lands him facing the way out
          // emergency lighting, so the exit is visible in the wide shot
          this.exitLight.intensity = 11;
          this.pathLight.intensity = 5;
          this.hemi.intensity = 0.78;
          this.matExit.color.setHex(0x9ed36a);
          this.matGuide.color.setHex(0x6fbf52);
          this.sfx.alarm();
          this._say('Nobody else is on this floor tonight.');
          this._say('Fire door. West wall.');
        }
        break;
      }

      // THE PULL-BACK — both the figure and the way out in one frame
      case 'wide': {
        if (this.t < 1.1) this.cine = this.t / 1.1;
        else if (this.t < 4.4) this.cine = 1;
        else if (this.t < 5.5) this.cine = 1 - (this.t - 4.4) / 1.1;
        else {
          this.cine = 0;
          this.standing = true;
          this.phase = 'flee';
          this.t = 0;
        }
        break;
      }

      case 'flee': {
        this.handler.position.z = THREE.MathUtils.lerp(
          this.handler.position.z, 2.0, 1 - Math.exp(-0.85 * dt)
        );
        for (let i = 0; i < this.guides.length; i++) {
          const k = (this.t * 2.6 - i * 0.22) % 2.2;
          this.guides[i].scale.y = (k > 0 && k < 0.5) ? 0.08 : 0.03;
        }
        this.exitLight.intensity = 11 + Math.sin(this.t * 5) * 1.6;
        this._prompt(
          '<b style="color:#9ed36a">RUN</b> &nbsp; ' +
          '<span style="font-size:18px;color:#9ed36a">' + this._exitArrow() + '</span>'
        );
        const atExit = this.px < -ROOM.w / 2 + 2.0 && Math.abs(this.pz) < 2.0;
        const caught = Math.hypot(this.px - this.handler.position.x,
                                  this.pz - this.handler.position.z) < 1.1;
        if (atExit || caught) this._exit(state);
        break;
      }
    }

    this._updateCamera();
  }

  _copy(state) {
    this.phase = 'copied';
    this.t = 0;
    this._prompt('');
    this._hush();
    this.lines.push('');
    this.lines.push('!COPIED TO EXTERNAL VOLUME');
    this._drawScreen();
    this.sfx.confirm();
    state.hasKey = true;
    if (this.rack14) for (const led of this.rack14) led.material = this.matLedOff;
  }

  _exit(state) {
    if (this.leaving) return;
    this.leaving = true;
    this.phase = 'done';
    this._prompt('');
    this.hud.thought.style.opacity = '0';
    this.hud.fade.style.opacity = '1';
    this.sfx.stop();
    if (document.exitPointerLock) document.exitPointerLock();
    setTimeout(() => this.game.setLevel('level01'), 950);
  }

  _updateCamera() {
    const cam = this.game.camera;
    this._fp.set(this.px, this.eye, this.pz);

    // where first-person is looking, as a point in the world
    const cp = Math.cos(this.pitch);
    this._dir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this._look3.copy(this._fp).addScaledVector(this._dir, 6);

    // Kai is only drawn once the camera is far enough out that it is not
    // sitting inside his head.
    this.kai.visible = this.cine > 0.34;
    if (this.kai.visible) {
      this.kai.position.set(this.px, 0, this.pz);
      this.kai.rotation.y = this.yaw;
    }

    if (this.cine > 0) {
      const k = THREE.MathUtils.smoothstep(this.cine, 0, 1);
      cam.position.lerpVectors(this._fp, WIDE_POS, k);
      this._look3.lerp(WIDE_LOOK, k);
      cam.lookAt(this._look3);
      const want = 58 + 10 * k;
      if (Math.abs(cam.fov - want) > 0.05) { cam.fov = want; cam.updateProjectionMatrix(); }
      return;
    }

    cam.position.copy(this._fp);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, 0);

    // leaning in while he reads, back out once he is on his feet
    const reading = ['card', 'seated', 'check', 'checkRead', 'manifest', 'read',
                     'choice', 'refused'].includes(this.phase);
    const want = reading ? 42 : 58;
    if (Math.abs(cam.fov - want) > 0.05) {
      cam.fov += (want - cam.fov) * 0.06;
      cam.updateProjectionMatrix();
    }
  }

  /* ==================================================== teardown */
  teardown() {
    this.sfx.stop();
    this.game.renderer.domElement.removeEventListener('click', this._onClick);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (document.pointerLockElement) document.exitPointerLock();

    for (const el of Object.values(this.hud)) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    this.hud = {};

    this.scene.fog = null;
    this.game.camera.fov = 62;
    this.game.camera.rotation.set(0, 0, 0);
    this.game.camera.updateProjectionMatrix();
    super.teardown();
  }
}
  