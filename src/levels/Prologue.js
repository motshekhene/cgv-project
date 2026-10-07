import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { attachCharacter } from '../core/Characters.js';
import {
  loadJungleKit,
  createJungleMaterials,
  createJungleSky,
  createSign,
  createLightShaft,
  cloneProp,
  placeProp,
} from './level1/jungleWorld.js';

/**
 * PROLOGUE — NOCTIS FIELD STATION, the survey camp on Site 7's perimeter. 05:12,
 * the last night of the dig season.
 *
 * JUNGLE SHRINE THEME, the whole way through. There is no interior here and
 * there never was: the game is a jungle, so the first thing the player sees is
 * the jungle — a canvas work tent, a generator, crate stacks, and Rack 14
 * lashed under a tarp against a ruin wall. Night, mist and fireflies; the
 * moment Kai runs, dawn breaks into level 01's exact morning palette. That
 * cut is the whole point of the scene.
 *
 * THE BACKSTORY THIS SCENE HAS TO DELIVER — Kai runs with the Key through all
 * of level 01, and none of it is explained anywhere else, so every beat below
 * exists to earn that run:
 *
 *   1. He is the night watch here. The company that runs the dig ordered him,
 *      on his last shift, to sign off "the decommission of Rack 14".
 *   2. Signing off is typing a check. The check comes back wrong: a rack that
 *      was pulled from service in March is still drawing power, and it is not
 *      on the asset register. Inside it: PROJECT BLACKOUT.
 *   3. BLACKOUT is a contracted kill switch for every network on the continent,
 *      nine days from going live. Site 7 — this basin — is holding site 07.
 *   4. He copies the data to his own drive. But the protocol needs the PHYSICAL
 *      AUTHORIZATION KEY, and the key is in the rack. So he has to walk across
 *      an open clearing, in the dark, to the thing he was told to sign away.
 *   5. The moment the Key is lit in his hand, there is a man with a torch in
 *      the trail mouth — the only way out. He runs. Level 01 is that run.
 *
 * Shape:
 *   cards    clicked through — who he is, where he is, what he is doing
 *   seated   no walking. The laptop is the whole interface.
 *   check    the decommission check: pulled in March, still drawing power
 *   manifest the readout: PROJECT BLACKOUT, holding sites, nine days
 *   choice   copy it to the drive (Q refuses, and asks again — the scene
 *            does not move until he copies it)
 *   brief    the copy lands — and asks for the PHYSICAL AUTHORIZATION KEY
 *   stand    he gets up; control returns
 *   toRack   the walk across the clearing, marker lamps to Rack 14
 *   atRack   amber terminal on his face. E takes the key, and it goes cyan.
 *   wide     the pull-back, from the tree line: Kai, the lit Key, and the
 *            figure standing in the trail mouth. One frame, the whole problem.
 *   flee     back across the clearing, past him, out onto the trail — and the
 *            night breaks to dawn as he goes
 *
 * Colour is doing the narrative work, so nothing else may use these:
 *   amber  Rack 14 (and the camp lamps, dim)   cyan  the Key
 *
 * Pacing rule: the laptop finishes typing before Kai thinks anything, and he
 * finishes thinking before the laptop types again. Nothing here is on a timer
 * that can collide with something else the player is reading.
 *
 * Audio is synthesised with the Web Audio API — no sound files, so nothing to
 * download, credit or wait for. It is self-contained in this file on purpose,
 * so it does not collide with the game-wide audio work.
 *
 * TWO PLANTS THAT PAY OFF IN LEVEL 03 — do not change without telling the team:
 *   1. B. INGRAM, on the work-order card. The prologue NEVER says he is the man
 *      in the trail mouth — that is level 03's reveal, and naming him here
 *      kills it.
 *   2. SITE 7, in the holding-site list. Level 03 depends on the player having
 *      read it here and not understood it.
 */

const HANDLER_NAME = 'B. INGRAM';

// The camp. The clearing is a disc the player can walk; the trail mouth is the
// gap in the tree line at the north edge, where level 01's trail begins.
const SEAT = { x: 0, z: 9.3, eye: 1.15 };
const BENCH = { x: 0, z: 8.6 };
const RACK14 = { x: 7.6, z: -1.5 };
const TRAIL = { x: 0, z: -16 };
const CLEARING_R = 15.5;  // walkable radius
const CORRIDOR_X = 2.3;   // half-width of the trail mouth gap
const STAND_EYE = 1.7;
const WALK = 3.0;
const RUN = 4.6;          // once he has the Key — he is not strolling out
const LOOK = 0.0022;

// the pull-back vantage: high in the south-east of the clearing, looking north
// over the rack — Kai foreground with the Key lit, the whole clearing, and the
// torch burning in the trail mouth at the far end. One frame, the whole problem.
const WIDE_POS = new THREE.Vector3(11.4, 5.4, 4.4);
const WIDE_LOOK = new THREE.Vector3(2.2, 0.9, -8.0);

const KEY_CYAN = 0x4fd6e0;  // the Key — matches how it glows in level 01
const KEY_HEX = '#4fd6e0';  // the same colour, for the HUD
const LAMP_AMBER = '#ffb03a';

// Night -> dawn. The dawn end of every pair below is level 01's exact morning
// palette (Level01.init: fog 0xcfd6a8/0.014, hemi 0xbfdcff/0x4a5a26, sun
// 0xffd29a), so the cut into the trail run is a continuation, not a jump.
const NIGHT = {
  fog: 0x0a1014, fogDensity: 0.026,
  top: 0x0a1526, horizon: 0x22303a, bottom: 0x090d08, sun: 0x9fb4cc,
  hemiSky: 0x27394d, hemiGround: 0x0a0f08, hemiIntensity: 0.4,
  sunColor: 0x8fa8c8, sunIntensity: 0.0,   // no key light until dawn
};
const DAWN = {
  fog: 0xcfd6a8, fogDensity: 0.014,
  top: 0x6aa6d8, horizon: 0xf0e2b0, bottom: 0x6f7d4a, sun: 0xffd59a,
  hemiSky: 0xbfdcff, hemiGround: 0x4a5a26, hemiIntensity: 0.6,
  sunColor: 0xffd29a, sunIntensity: 4.5,
};
const SUN_DIR = new THREE.Vector3(-0.35, 0.55, -0.75).normalize();

/* ==========================================================================
   Sfx — a very small synth. Every sound here is generated at runtime.
   ========================================================================== */
class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.chirpT = 1.2;
    this.frogT = 3.0;
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

  /** The camp at rest: wind through the trees, and the generator's hum. */
  campTone() {
    if (!this.ctx || this.tone) return;
    const ctx = this.ctx, t = this.t;

    // wind — filtered noise with a slow swell
    const src = ctx.createBufferSource();
    src.buffer = this._noise(3, 0);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.028;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.start(); lfo.start();
    g.gain.linearRampToValueAtTime(0.05, t + 2.5);
    this.tone = g; this.toneSrc = src;

    // the generator, two tenths of a beat off a perfect note, behind the tent
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 52;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 110;
    const og = ctx.createGain(); og.gain.value = 0;
    osc.connect(lp); lp.connect(og); og.connect(this.master);
    osc.start();
    og.gain.linearRampToValueAtTime(0.038, t + 2.5);
    this.hum = og; this.humOsc = osc;
  }

  /** Night life, called from update(): one insect chirp. */
  _insect() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 3600 + Math.random() * 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // three fast pulses — a cricket, not a beep
    for (const [d, a] of [[0, 0.014], [0.055, 0.017], [0.11, 0.011]]) {
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(a, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0004, t + d + 0.05);
    }
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  /** Night life: one frog, somewhere off to the side. */
  _frog() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(168, t);
    o.frequency.exponentialRampToValueAtTime(112, t + 0.22);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0002, t + 0.3);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(lp); lp.connect(g);
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(this.master); }
    else g.connect(this.master);
    o.start(t); o.stop(t + 0.34);
  }

  /** Called every frame from update() — schedules the night life. */
  tickNight(dt) {
    if (!this.ctx || this.muted) return;
    this.chirpT -= dt;
    if (this.chirpT <= 0) { this.chirpT = 0.4 + Math.random() * 1.9; this._insect(); }
    this.frogT -= dt;
    if (this.frogT <= 0) { this.frogT = 3.2 + Math.random() * 5.2; this._frog(); }
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

  /** Dawn. The night tone dies under it, which is most of the effect. */
  dawnBreak() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    if (this.tone) this.tone.gain.linearRampToValueAtTime(0.012, t + 1.6);
    if (this.hum) this.hum.gain.linearRampToValueAtTime(0.0, t + 1.2);
    if (this.alarmGain) this.alarmGain.gain.linearRampToValueAtTime(0.0, t + 1.0);

    // a low swell, the sun coming up over the trees
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 2.1);

    // and the birds, taking over from the insects
    [[0.35, 2500, 1900], [0.7, 3100, 2300], [1.25, 2800, 2050], [1.8, 3400, 2500]].forEach(
      ([d, f0, f1]) => {
        const b = ctx.createOscillator();
        b.type = 'sine';
        b.frequency.setValueAtTime(f0, t + d);
        b.frequency.exponentialRampToValueAtTime(f1, t + d + 0.16);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0, t + d);
        bg.gain.linearRampToValueAtTime(0.024, t + d + 0.03);
        bg.gain.exponentialRampToValueAtTime(0.0002, t + d + 0.18);
        b.connect(bg); bg.connect(this.master);
        b.start(t + d); b.stop(t + d + 0.2);
      });
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
    this.yaw = 0;                 // yaw 0 looks down -Z, which faces the laptop
    this.pitch = -0.24;           // looking down at the screen
    this.locked = false;
    this.standing = false;   // may he walk?
    this.seated = true;      // is he still on the crate? (clamps how far he can turn)
    this.cine = 0;                // 0 = first person, 1 = the wide shot

    this.phase = 'card';
    this.t = 0;
    this.leaving = false;
    this.briefSaid = false;       // has he reacted to the RACK 14 readout yet?
    this.introSaid = false;
    this.halfway = false;         // said the open-ground line yet?
    this.fleeT = 0;
    this.beatT = 0;               // counts down to the next heartbeat
    this._typeStarted = false;
    this._dawnApplied = -1;
    this._dawnTmp = new THREE.Color();  // scratch colour for _applyDawn()
    this.dawnK = 0;               // 0 = night, 1 = level 01's morning

    this.says = [];
    this.sayT = 0;

    this.lines = [];
    this.pending = null;
    this.pendingChars = 0;
    this.queue = [];

    this.blockers = [];
    this.sfx = new Sfx();

    this.cards = [
      '<div style="color:#9ed36a;font-size:13px;letter-spacing:.34em">' +
        'SITE 7 PERIMETER</div>' +
      '<div style="color:#8f9bb0;font-size:12px;letter-spacing:.28em;margin-top:10px">' +
        'NOCTIS FIELD STATION &nbsp;&middot;&nbsp; 05:12</div>' +
      // Where he is, in one line. The camp is open air, so this card also
      // carries the one fact the player needs: the whole game happens out here.
      '<div style="color:#3f4a56;font-size:11px;letter-spacing:.24em;margin-top:16px">' +
        'THE SURVEY CAMP AT THE JUNGLE\'S EDGE</div>',

      '<div style="color:#eef2fb;font-size:28px;letter-spacing:.18em">KAI NDLOVU</div>' +
      '<div style="color:#8f9bb0;font-size:12.5px;letter-spacing:.26em;margin-top:12px">' +
        'SYSTEMS ENGINEER &nbsp;&middot;&nbsp; NIGHT WATCH</div>',

      '<div style="color:#5b6379;font-size:11.5px;letter-spacing:.3em">' +
        "TONIGHT'S LAST JOB</div>" +
      '<div style="color:#c6d2e4;font-size:18px;letter-spacing:.08em;margin-top:14px">' +
        'Sign off the decommission of Rack 14</div>' +
      '<div style="color:#8f9bb0;font-size:12.5px;letter-spacing:.2em;margin-top:16px">' +
        'ORDERED BY &nbsp;<span style="color:#eef2fb">' + HANDLER_NAME + '</span></div>',

      '<div style="color:#dfe7f5;font-size:21px;font-style:italic;line-height:1.7;' +
        'font-family:ui-sans-serif,system-ui,sans-serif">' +
        'Eleven hours into a twelve-hour shift.<br>One signature and he can sleep.</div>',
    ];
    this.cardIndex = 0;
    this.cardT = 0;
  }

  /* ==================================================== build */
  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(NIGHT.fog, NIGHT.fogDensity);

    this._buildSky();
    const kit = await loadJungleKit(assets);
    if (!this.scene) return; // torn down while loading
    const mats = await createJungleMaterials(assets, 60);
    if (!this.scene) return;
    this.kit = kit;
    this.mats = mats;
    this._buildGround();
    this._buildCamp();
    this._buildJungle();
    this._buildFigures();
    this._buildHud();

    this._onClick = () => {
      this.sfx.start();                       // audio needs a gesture
      if (this.phase === 'card') { this._nextCard(); return; }
      const el = this.game.renderer.domElement;
      if (!this.locked && el.requestPointerLock) {
        // Sandboxed views (preview iframes) refuse pointer lock and would
        // otherwise throw on every click. Input still accumulates movementX/Y
        // on plain mousemoves, so on any refusal play on without the lock and
        // drop the click hint.
        try {
          const req = el.requestPointerLock();
          if (req && req.catch) req.catch(() => this._playUnlocked());
        } catch (e) {
          this._playUnlocked();
        }
      }
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.game.renderer.domElement;
      this.hud.lock.style.opacity =
        (this.locked || this.phase === 'card' || this.cine > 0) ? '0' : '1';
    };
    // Chrome reports some refusals through this event instead of the promise.
    this._onLockError = () => this._playUnlocked();
    this.game.renderer.domElement.addEventListener('click', this._onClick);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);

    this.game.camera.fov = 50;
    this.game.camera.updateProjectionMatrix();

    this._fp = new THREE.Vector3();
    this._look3 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  /* ---------------------------------------------------- sky and light */
  _buildSky() {
    this.sky = createJungleSky();
    this.root.add(this.sky);

    this.hemi = new THREE.HemisphereLight(
      NIGHT.hemiSky, NIGHT.hemiGround, NIGHT.hemiIntensity,
    );
    this.root.add(this.hemi);

    this.sun = new THREE.DirectionalLight(NIGHT.sunColor, NIGHT.sunIntensity);
    this.sun.position.copy(SUN_DIR).multiplyScalar(60);
    this.root.add(this.sun, this.sun.target);

    // the work lantern — the one warm thing on the site until the Key lights
    this.lantern = new THREE.PointLight(0xffc98a, 7.5, 7, 2);
    this.lantern.position.set(BENCH.x - 0.72, 1.18, BENCH.z + 0.1);
    this.lantern.castShadow = true;
    this.lantern.shadow.mapSize.set(512, 512);
    this.root.add(this.lantern);

    // ground mist, five soft cards drifting round the clearing. Without them
    // the torch beam in the wide shot has nothing to burn through.
    this.mist = [];
    const mistMat = () => new THREE.MeshBasicMaterial({
      color: 0x8fa4b4, transparent: true, opacity: 0.05, depthWrite: false,
    });
    for (const [x, z, w, rot] of [
      [-4, 2, 11, 0.4], [5, -6, 13, 1.2], [-7, -9, 10, 2.2],
      [2, 6, 9, 0.1], [-2, -12, 12, 1.8],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.32), mistMat());
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot;
      m.position.set(x, 0.55, z);
      this.root.add(m);
      this.mist.push(m);
    }

    // fireflies. Pollen's job, at night: green sparks that hold still until
    // they don't. One Points cloud, opacity pulsing in update().
    const n = 220;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 13;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.4 + Math.random() * 2.6;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflyMat = new THREE.PointsMaterial({
      color: 0xbfe08a, size: 0.07, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.fireflies = new THREE.Points(geo, this.fireflyMat);
    this.root.add(this.fireflies);

    // god rays arrive only with the dawn, so they start at zero
    this.shafts = [];
    for (const [x, z, w] of [[-3.5, -4, 2.2], [4.5, 2, 2.6], [-5.5, -12, 2.0]]) {
      const shaft = createLightShaft(w, 0xffe2b0, 0);
      shaft.position.set(x, 15, z);
      this.root.add(shaft);
      this.shafts.push(shaft);
    }
  }

  /* ---------------------------------------------------- ground */
  _buildGround() {
    // forest floor everywhere, and a dirt path worn from the tent to the
    // trail mouth — the line every phase of this scene walks
    const ground = new THREE.Mesh(new THREE.CircleGeometry(CLEARING_R + 14, 40), this.mats.forest);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.root.add(ground);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 28), this.mats.trail);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, -3.4); // tent (z 10) to trail mouth (z -17)
    path.receiveShadow = true;
    this.root.add(path);

    // the clearing's worn centre — trampled earth where the crates are stacked
    const apron = new THREE.Mesh(new THREE.CircleGeometry(4.4, 24), this.mats.trail);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, 0.02, 2.6);
    apron.receiveShadow = true;
    this.root.add(apron);
  }

  /* ---------------------------------------------------- the camp */
  _buildCamp() {
    this.geoBox = new THREE.BoxGeometry(1, 1, 1);
    const put = (mat, sx, sy, sz, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(this.geoBox, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };

    this.matCanvas = new THREE.MeshStandardMaterial({ color: 0x44523f, roughness: 0.95 });
    this.matCanvasDark = new THREE.MeshStandardMaterial({ color: 0x2c3629, roughness: 0.95 });
    this.matWood = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 });
    this.matMetal = new THREE.MeshStandardMaterial({ color: 0x3a434f, roughness: 0.4, metalness: 0.6 });
    this.matDark = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.95 });

    // ---- the work tent. Open at the front (north), so from the crate seat
    //      the whole clearing and the tree line are in view. ----
    const TX = BENCH.x, TZ = BENCH.z;
    for (const side of [-1, 1]) {
      const lean = put(this.matCanvas, 2.9, 0.06, 3.4, TX + side * 1.32, 1.62, TZ + 0.2);
      lean.rotation.z = side * -0.62;
      put(this.matCanvasDark, 0.08, 2.35, 0.08, TX + side * 2.35, 1.0, TZ + 1.75);
      put(this.matCanvasDark, 0.08, 2.35, 0.08, TX + side * 2.35, 1.0, TZ - 1.35);
    }
    put(this.matCanvas, 4.9, 0.06, 0.5, TX, 2.32, TZ - 1.6);          // ridge
    put(this.matCanvasDark, 4.9, 2.3, 0.07, TX, 1.15, TZ - 1.72);     // back wall

    // the bench: his desk for the last twelve hours
    put(this.matWood, 1.7, 0.07, 0.62, BENCH.x, 0.76, BENCH.z);
    for (const sx of [-0.72, 0.72]) {
      put(this.matWood, 0.09, 0.74, 0.5, BENCH.x + sx, 0.37, BENCH.z);
    }
    // the crate he sits on
    put(this.matWood, 0.46, 0.44, 0.46, SEAT.x, 0.22, SEAT.z);

    // ---- the laptop. The whole interface of the seated phases. ----
    const lap = new THREE.Group();
    lap.position.set(BENCH.x, 0.8, BENCH.z - 0.12);
    this.root.add(lap);
    const base = new THREE.Mesh(this.geoBox, this.matDark);
    base.scale.set(0.36, 0.025, 0.25);
    lap.add(base);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512; this.canvas.height = 320;
    this.ctx2d = this.canvas.getContext('2d');
    this.screenTex = new THREE.CanvasTexture(this.canvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.225),
      new THREE.MeshBasicMaterial({ map: this.screenTex }),
    );
    screen.position.set(0, 0.115, 0.105);
    screen.rotation.x = -0.32;
    lap.add(screen);
    this.screenMesh = screen;
    const lid = new THREE.Mesh(this.geoBox, this.matDark);
    lid.scale.set(0.36, 0.24, 0.012);
    lid.position.set(0, 0.12, 0.16);
    lid.rotation.x = -0.32;
    lap.add(lid);

    // the storm lantern — emissive body so it reads as the light source
    const lampBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.22, 10),
      new THREE.MeshStandardMaterial({
        color: 0x777c70, roughness: 0.6, metalness: 0.4,
        emissive: 0xffc98a, emissiveIntensity: 0.55,
      }),
    );
    lampBody.position.set(BENCH.x - 0.72, 0.9, BENCH.z + 0.1);
    this.root.add(lampBody);

    // ---- the generator, behind the tent. The hum in the dark. ----
    put(this.matMetal, 1.1, 0.72, 0.6, TX + 3.4, 0.36, TZ + 0.9);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 10), this.matMetal);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(TX + 3.4, 0.82, TZ + 0.9);
    this.root.add(tank);

    // ---- crate stacks and a barrel, west of the tent ----
    placeProp(this.root, cloneProp(this.kit.crates), -5.6, 0, 6.8, { s: 1 });
    placeProp(this.root, cloneProp(this.kit.barrel), -4.3, 0, 8.4, { s: 1 });
    placeProp(this.root, cloneProp(this.kit.logs), 6.4, 0, 8.8, { s: 0.9, ry: 0.5 });

    // ---- marker lamps: the line from the bench to Rack 14. Dim amber studs
    //      now; they take the Key's green and strobe him a runway in the flee.
    this.matMarker = new THREE.MeshStandardMaterial({
      color: 0x2a2013, emissive: 0x8a6420, emissiveIntensity: 0.9, roughness: 0.6,
    });
    this.markers = [];
    for (let i = 0; i < 6; i++) {
      const k = i / 5;
      const x = THREE.MathUtils.lerp(0.6, RACK14.x - 1.1, k);
      const z = THREE.MathUtils.lerp(7.4, RACK14.z + 1.3, k);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.5, 8), this.matDark);
      post.position.set(x, 0.25, z);
      this.root.add(post);
      // one material per bulb: the flee strobes them individually, and a
      // shared material would pulse them all as one
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8), this.matMarker.clone());
      bulb.position.set(x, 0.54, z);
      this.root.add(bulb);
      this.markers.push(bulb);
    }

    this._buildRack14();
    this._buildBlockers();
  }

  /**
   * RACK 14 — the focal point, and deliberately not another cabinet.
   *
   * It stands in the open, under a ripped tarp, against a piece of ruin wall —
   * the only machine on a site that is otherwise rope, canvas and stone, which
   * is exactly why it is wrong to be here. Black military casing, a locked
   * faceplate, and it is the only amber light in the camp. The player should
   * be able to pick it out from the bench without being told which thing it is.
   */
  _buildRack14() {
    const g = new THREE.Group();
    g.position.set(RACK14.x, 0, RACK14.z);
    g.rotation.y = -Math.PI / 2;       // faces back across the clearing
    this.root.add(g);
    this.rack14 = g;

    this.matCase = new THREE.MeshStandardMaterial({
      color: 0x0a0c0f, roughness: 0.62, metalness: 0.4,
    });
    this.matAcrylic = new THREE.MeshStandardMaterial({
      color: 0x11161c, roughness: 0.08, metalness: 0.1,
      transparent: true, opacity: 0.55,
    });

    const casing = new THREE.Mesh(this.geoBox, this.matCase);
    casing.scale.set(1.5, 2.34, 1.12);
    casing.position.y = 1.17;
    casing.castShadow = true;
    g.add(casing);

    for (const sy of [0.06, 2.28]) {             // plinth and cap, so it reads heavier
      const band = new THREE.Mesh(this.geoBox, this.matCase);
      band.scale.set(1.62, 0.12, 1.24);
      band.position.y = sy;
      g.add(band);
    }

    const faceplate = new THREE.Mesh(this.geoBox, this.matAcrylic);
    faceplate.scale.set(1.22, 1.5, 0.05);
    faceplate.position.set(0, 1.42, 0.58);
    g.add(faceplate);

    // ---- the terminal that folds out of its centre ----
    this.terminal = new THREE.Group();
    this.terminal.position.set(0, 0.98, 0.56);
    g.add(this.terminal);

    this.matKeyCap = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.95 });
    const tray = new THREE.Mesh(this.geoBox, this.matKeyCap);
    tray.scale.set(1.0, 0.04, 0.42);
    tray.position.z = 0.21;
    this.terminal.add(tray);

    const keys = new THREE.Mesh(this.geoBox, this.matKeyCap);
    keys.scale.set(0.86, 0.02, 0.3);
    keys.position.set(0, 0.03, 0.21);
    this.terminal.add(keys);

    const arm = new THREE.Mesh(this.geoBox, this.matCase);
    arm.scale.set(0.9, 0.5, 0.04);
    arm.position.set(0, 0.26, 0.04);
    this.terminal.add(arm);

    this.termTex = this._terminalTexture();
    this.matTerm = new THREE.MeshBasicMaterial({ map: this.termTex });
    this.termScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.44), this.matTerm);
    this.termScreen.position.set(0, 0.5, 0.1);
    this.termScreen.rotation.x = -0.22;
    this.termScreen.visible = false;              // dark until he wakes it
    this.terminal.add(this.termScreen);

    // ---- the physical key, sitting in its socket ----
    this.matKeyDrive = new THREE.MeshStandardMaterial({
      color: 0x20262f, emissive: 0x000000, roughness: 0.35, metalness: 0.6,
    });
    this.keyDrive = new THREE.Mesh(this.geoBox, this.matKeyDrive);
    this.keyDrive.scale.set(0.11, 0.05, 0.26);
    this.keyDrive.position.set(0.42, 1.44, 0.66);
    g.add(this.keyDrive);

    this.keyLight = new THREE.PointLight(KEY_CYAN, 0, 3.4, 2);
    this.keyLight.position.set(0.42, 1.44, 0.74);
    g.add(this.keyLight);

    // Once he pulls it, the drive and its light move into here, and this group
    // follows him for the rest of the scene. The cyan has to travel with Kai —
    // it is on him in the wide shot, and it is how he looks arriving in level 01.
    this.carried = new THREE.Group();
    this.root.add(this.carried);

    // amber wash on whoever is standing at it — off until he gets there
    this.termGlow = new THREE.PointLight(0xffa83a, 0, 5.0, 2);
    this.termGlow.position.set(0, 1.62, 1.25);
    g.add(this.termGlow);

    // the one thing visible from the bench: a single amber standby light, so
    // the rack is already picked out before the player knows why
    this.matStandby = new THREE.MeshBasicMaterial({ color: 0x3a2a10 });
    this.standby = new THREE.Mesh(this.geoBox, this.matStandby);
    this.standby.scale.set(0.34, 0.035, 0.03);
    this.standby.position.set(-0.45, 2.1, 0.6);
    g.add(this.standby);

    // ---- the tarp over it, propped on ruin stone ----
    const tarp = new THREE.Mesh(this.geoBox, this.matCanvasDark);
    tarp.scale.set(2.4, 0.06, 2.2);
    tarp.position.set(0, 2.62, -0.2);
    tarp.rotation.x = 0.16;
    g.add(tarp);

    // ruin wall behind it — the rack is leaning on the site's own stones
    placeProp(this.root, cloneProp(this.kit.wall), RACK14.x + 0.8, 0, RACK14.z - 1.6, {
      s: 0.017, ry: Math.PI - 0.35,
    });
    placeProp(this.root, cloneProp(this.kit.columnShort), RACK14.x - 1.3, 0, RACK14.z + 1.9, {
      s: 0.012, ry: 0.7,
    });
  }

  /** The kill-switch readout. Drawn once — it never changes after this. */
  _terminalTexture() {
    const c = document.createElement('canvas');
    c.width = 820; c.height = 440;
    const g = c.getContext('2d');
    g.fillStyle = '#140b02';
    g.fillRect(0, 0, 820, 440);
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < 440; y += 4) g.fillRect(0, y, 820, 1);

    g.font = '30px ui-monospace, Menlo, monospace';
    g.textBaseline = 'top';
    const lines = [
      ['#ffb03a', 'BLACKOUT PROTOCOL'],
      ['', ''],
      ['#d89a52', 'Remote shutdown authorization'],
      ['#d89a52', 'detected.'],
      ['', ''],
      ['#ff6b6b', 'Physical authorization key'],
      ['#ff6b6b', 'required.'],
      ['', ''],
      ['#d89a52', 'Location: RACK 14 — HOLDING'],
      ['#7fe08a', 'Retrieval status: READY'],
    ];
    let y = 26;
    for (const [col, text] of lines) {
      if (text) { g.fillStyle = col; g.fillText(text, 30, y); }
      y += 39;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Everything solid the player can bump into, plus the clearing's edge. */
  _buildBlockers() {
    const add = (x0, x1, z0, z1) => this.blockers.push({ x0, x1, z0, z1 });
    add(-2.7, 2.7, 7.2, 10.4);            // tent walls + bench line
    add(2.7, 4.2, 8.3, 9.5);              // generator
    add(-6.6, -4.6, 5.9, 9.3);            // crates + barrel
    add(5.6, 7.4, 8.0, 9.7);              // log stack
    add(RACK14.x - 1.6, RACK14.x + 1.6, RACK14.z - 1.5, RACK14.z + 1.5); // rack
    add(-9.5, -5.5, -14.5, -11.5);        // the stag and its stones
  }

  /* ---------------------------------------------------- the jungle round it */
  _buildJungle() {
    const trees = [this.kit.tree1, this.kit.tree2, this.kit.tree3, this.kit.tree4, this.kit.ruinTree];

    // The tree line, ringed round the clearing. The gap at the north end is
    // the trail mouth: the only way out, and exactly where level 01 starts.
    let seed = 4711;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const COUNT = 42;
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2 + rnd() * 0.12;
      const x = Math.cos(a), z = Math.sin(a);
      // leave the gap: north, within the corridor width
      if (z < -0.86 && Math.abs(x) < 3.2) continue;
      const r = CLEARING_R + 3.5 + rnd() * 11;
      const proto = trees[i % trees.length];
      placeProp(this.root, cloneProp(proto), Math.cos(a) * r, -0.05, Math.sin(a) * r, {
        s: 0.021 + rnd() * 0.014, ry: rnd() * Math.PI * 2, shadow: false,
      });
    }
    // two trunks framing the mouth, so the gap reads as a gap and not a hole
    placeProp(this.root, cloneProp(this.kit.tree2), -3.4, -0.05, -15.2, { s: 0.03, ry: 0.6 });
    placeProp(this.root, cloneProp(this.kit.tree3), 3.5, -0.05, -14.8, { s: 0.032, ry: 2.4 });

    // undergrowth between the ring and the clearing
    const bushes = [this.kit.bush1, this.kit.bush2, this.kit.bush3];
    const grasses = [this.kit.grass1, this.kit.grass2, this.kit.grass3];
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = CLEARING_R - 1.5 + rnd() * 6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z < -0.8 && Math.abs(x) < 3.0) continue;         // keep the mouth clear
      const set = i % 3 === 0 ? grasses : bushes;
      placeProp(this.root, cloneProp(set[i % set.length]), x, 0, z, {
        s: 0.01 + rnd() * 0.006, ry: rnd() * Math.PI * 2, shadow: false,
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const r = CLEARING_R + rnd() * 5;
      placeProp(this.root, cloneProp(this.kit['rock' + (1 + (i % 3))]),
        Math.cos(a) * r, -0.15, Math.sin(a) * r,
        { s: 0.011 + rnd() * 0.007, ry: rnd() * Math.PI * 2, shadow: false });
    }

    // relics the trail will keep meeting — the site does not start at the gate
    placeProp(this.root, cloneProp(this.kit.stag), -7.5, 0, -13, { s: 0.0105, ry: 0.55 });
    placeProp(this.root, cloneProp(this.kit.column), -6.2, 0, -11.4, { s: 0.014, ry: 0.2 });
    placeProp(this.root, cloneProp(this.kit.columnShort), -8.6, 0, -11.8, { s: 0.012, ry: 1.4 });
    placeProp(this.root, cloneProp(this.kit.deadTree), 8.8, 0, -9.6, { s: 0.02, ry: 1.1 });

    // the sign. Every level has one pointing to SITE 7; this is the first.
    const sign = createSign('SITE 7 \u2192', { width: 2.4, height: 0.85 });
    sign.position.set(-3.1, 0, -13.6);
    sign.rotation.y = 0.5;
    this.root.add(sign);

    // a rope-and-pole barrier across the mouth, half fallen: the camp's edge
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4b321f, roughness: 0.95 });
    for (const x of [-2.6, 2.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 8), poleMat);
      post.position.set(x, 0.55, -12.2);
      post.castShadow = true;
      this.root.add(post);
    }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.1, 6), poleMat);
    rope.rotation.z = Math.PI / 2;
    rope.position.set(0, 0.92, -12.2);
    this.root.add(rope);
  }

  /* ---------------------------------------------------- the two figures */
  _buildFigures() {
    // ---- the figure in the trail mouth. Never a face, never named here. ----
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

    // his torch. In mist he reads as a beam of light first and a man second —
    // which is exactly how level 01 asks the player to read him.
    this.torchLight = new THREE.SpotLight(0xffcf96, 0, 30, 0.4, 0.5, 1.1);
    this.torchLight.position.set(0, 1.5, 0.2);
    this.torchLight.target.position.set(0, 0.7, 9);
    this.handler.add(this.torchLight, this.torchLight.target);
    this.torchBeam = createLightShaft(1.05, 0xffd9a0, 0.15);
    this.torchBeam.position.set(0, 1.5, 0.15);
    this.torchBeam.rotation.x = -Math.PI / 2 + 0.055;
    this.torchBeam.visible = false;
    this.handler.add(this.torchBeam);

    this.handler.position.set(TRAIL.x, 0, TRAIL.z + 1.2);
    this.handler.rotation.y = 0;            // faces the camp
    this.handler.visible = false;
    this.root.add(this.handler);

    // ---- Kai himself. Only on screen during the pull-back, so the player
    //      can see where they are standing relative to the trail mouth. ----
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

    // Swap in the downloaded models if they have been committed. These return
    // immediately and load in the background, so the capsules above are what
    // the player sees until the rigs land — and forever if one never does.
    this.kaiModel = attachCharacter(this.assets, 'kai', this.kai);
    this.handlerModel = attachCharacter(this.assets, 'handler', this.handler, {
      onReady: (h) => {
        // whatever the model's materials are, he stays a silhouette in here:
        // his face is level 03's reveal, not this scene's
        if (h.root) h.root.traverse((o) => { if (o.isMesh) o.material = this.matSil; });
      },
    });
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
      'X — SKIP &nbsp;·&nbsp; M — MUTE'
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
      this.sfx.campTone();
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
    const c = this.ctx2d, W = this.canvas.width, H = this.canvas.height;
    c.fillStyle = '#070c14';
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.02)';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);

    // 18 px at a 20 px step: the manifest is 15 lines and the canvas is 320
    // tall — anything larger clips the holding sites off the bottom
    c.font = '18px ui-monospace, Menlo, monospace';
    c.textBaseline = 'top';
    let y = 14;
    const draw = (text) => {
      if (text.startsWith('!')) c.fillStyle = '#ffb03a';
      else if (text.startsWith('>')) c.fillStyle = '#ff6b6b';
      else c.fillStyle = '#8fd8ff';
      c.fillText(text.replace(/^[!>]/, ''), 22, y);
      y += 20;
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
    const sp = this.phase === 'flee' ? RUN : WALK;
    const dx = (-sin * f + cos * s) * sp * dt;
    const dz = (-cos * f - sin * s) * sp * dt;
    if (!this._blocked(this.px + dx, this.pz)) this.px += dx;
    if (!this._blocked(this.px, this.pz + dz)) this.pz += dz;

    // The clearing has an edge: tree line all the way round, open only where
    // the trail mouth cuts through it. That gap is the whole geography of the
    // scene — Rack 14 sits off the line between the tent and the gap, so the
    // flee has to cross the open ground the wide shot just showed you.
    if (this.pz < -14) {
      this.px = THREE.MathUtils.clamp(this.px, -CORRIDOR_X, CORRIDOR_X);
      this.pz = Math.max(this.pz, -21);
    } else if (this.phase !== 'flee' && this.pz < -11.5) {
      // the rope across the mouth: until he has the Key there is nowhere to go
      this.pz = -11.5;
    } else {
      const r = Math.hypot(this.px, this.pz);
      const rMax = CLEARING_R - 0.6;
      if (r > rMax) { this.px *= rMax / r; this.pz *= rMax / r; }
    }
  }

  _look() {
    this.yaw -= this.input.mouse.dx * LOOK;
    this.pitch -= this.input.mouse.dy * LOOK;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.1, 1.1);
    // on the crate he can glance around, but he cannot spin on the spot
    if (this.seated) this.yaw = THREE.MathUtils.clamp(this.yaw, -1.0, 1.0);
  }

  /** Pointer lock refused (sandboxed iframe etc.) — play on without it. */
  _playUnlocked() {
    if (this.locked) return;
    this.locked = true;
    if (this.hud && this.hud.lock) this.hud.lock.style.opacity = '0';
  }

  /** Screen-space arrow toward a point in the camp, relative to where he looks. */
  _arrowTo(tx, tz) {
    let d = this._yawTo(tx, tz) - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.55) return '&uarr;';
    return d > 0 ? '&larr;' : '&rarr;';
  }

  _trailArrow() { return this._arrowTo(TRAIL.x, TRAIL.z); }
  _rackArrow() { return this._arrowTo(RACK14.x, RACK14.z); }

  /** Yaw that points the camera at a place, from where he is standing. */
  _yawTo(tx, tz) {
    return Math.atan2(-(tx - this.px), -(tz - this.pz));
  }

  _yawToRack() { return this._yawTo(RACK14.x, RACK14.z); }
  _yawToTrail() { return this._yawTo(TRAIL.x, TRAIL.z); }

  /* ==================================================== night -> dawn */
  /** k = 0 is the camp at 05:12; k = 1 is level 01's exact morning. */
  _applyDawn(k) {
    if (Math.abs(k - this._dawnApplied) < 0.004) return;
    this._dawnApplied = k;
    const lerp = (a, b) => THREE.MathUtils.lerp(a, b, k);
    const mix = (target, hexA, hexB) =>
      target.setHex(hexA).lerp(this._dawnTmp.setHex(hexB), k);

    mix(this.scene.fog.color, NIGHT.fog, DAWN.fog);
    this.scene.fog.density = lerp(NIGHT.fogDensity, DAWN.fogDensity);

    const u = this.sky.material.uniforms;
    mix(u.uTop.value, NIGHT.top, DAWN.top);
    mix(u.uHorizon.value, NIGHT.horizon, DAWN.horizon);
    mix(u.uBottom.value, NIGHT.bottom, DAWN.bottom);
    mix(u.uSun.value, NIGHT.sun, DAWN.sun);

    mix(this.hemi.color, NIGHT.hemiSky, DAWN.hemiSky);
    mix(this.hemi.groundColor, NIGHT.hemiGround, DAWN.hemiGround);
    this.hemi.intensity = lerp(NIGHT.hemiIntensity, DAWN.hemiIntensity);

    mix(this.sun.color, NIGHT.sunColor, DAWN.sunColor);
    this.sun.intensity = lerp(NIGHT.sunIntensity, DAWN.sunIntensity);

    for (const s of this.shafts) {
      if (s.material.uniforms.uOpacity) s.material.uniforms.uOpacity.value = 0.11 * k;
    }
    for (const m of this.mist) m.material.opacity = 0.05 * (1 - k);
    this.fireflyMat.opacity = 0.8 * (1 - k);
    this.lantern.intensity = lerp(7.5, 2.6);
  }

  /* ==================================================== key moments */
  _copy(state) {
    this.phase = 'copied';
    this.t = 0;
    this._prompt('');
    this._hush();
    this.lines.push('');
    this.lines.push('!COPIED TO EXTERNAL VOLUME');
    this._drawScreen();
    this.sfx.confirm();
    // NOTE: hasKey is NOT set here. The desk copy gets him the data; the
    // physical authorization key is still in the rack. See _takeKey().
  }

  /** Rack 14, in the open. This is the moment he actually has the Key. */
  _takeKey(state) {
    this.phase = 'taken';
    this.t = 0;
    this._prompt('');
    this._hush();
    this.carried.add(this.keyDrive);              // out of the rack, into his hand
    this.carried.add(this.keyLight);
    this.keyDrive.position.set(0, 0, 0);
    this.keyDrive.rotation.y = 0.5;
    this.keyLight.position.set(0, 0.05, 0);
    this.matKeyDrive.emissive.setHex(KEY_CYAN);
    this.matKeyDrive.emissiveIntensity = 0.8;
    this.keyLight.intensity = 4.5;
    this.matStandby.color.setHex(0x3a2a10);       // the rack goes back to sleep
    this.sfx.confirm();
    state.hasKey = true;
  }

  _exit(state) {
    if (this.leaving) return;
    this.leaving = true;
    this.phase = 'done';
    this._prompt('');
    this.hud.thought.style.opacity = '0';
    this.hud.fade.style.opacity = '1';
    this.sfx.dawnBreak();
    this._applyDawn(1);      // the fade is black; the jump in light is free
    if (document.exitPointerLock) document.exitPointerLock();
    // This prologue IS the intro of record: it ends on Kai breaking onto the
    // trail at dawn, which is level 01's first frame, so go straight in. The
    // level-1 cutscene (TrailIntro) stays reachable on its own via
    // ?level=level01-intro, but playing both back to back is one intro too
    // many. Straight into the run.
    setTimeout(() => this.game.setLevel('level01'), 1250);
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
    } else {
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

    // the dome is centred on whoever is looking at it
    this.sky.position.copy(cam.position);
  }

  /* ==================================================== update */
  update(dt, state) {
    this.t += dt;

    if (this.input.pressed('mute')) this.sfx.setMuted(!this.sfx.muted);
    if (this.input.pressed('skipScene') && !this.leaving) { this._exit(state); return; }

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

    // the night is alive until the dawn takes it
    if (this.dawnK < 1) this.sfx.tickNight(dt);

    // fireflies hold still until they don't; mist crawls
    this.fireflyMat.opacity = (0.55 + Math.sin(this.t * 1.7) * 0.25) * (1 - this.dawnK);
    this.fireflies.rotation.y += dt * 0.006;
    for (const m of this.mist) m.rotation.z += dt * 0.012;

    if (this.kaiModel) this.kaiModel.update(dt);
    if (this.handlerModel) this.handlerModel.update(dt);

    // the Key rides just in front of him, at about the height he'd hold it
    if (this.carried && this.carried.children.length) {
      this.carried.position.set(
        this.px - Math.sin(this.yaw) * 0.42, 1.08, this.pz - Math.cos(this.yaw) * 0.42,
      );
    }

    // heartbeat, from the moment the Key is lit
    if (this.phase === 'taken' || this.phase === 'wide' || this.phase === 'flee') {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.sfx.thump(); this.beatT = 0.84; }
    }

    switch (this.phase) {
      case 'card': break;

      case 'seated': {
        if (this.kaiModel && !this._typeStarted) {
          this._typeStarted = true;
          this.kaiModel.play('type');      // ignored until the rig lands
        }
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
          '<b style="color:#4fd6e0">E</b> &nbsp; COPY IT TO THE DRIVE' +
          '<span style="opacity:.4"> &nbsp;&nbsp;|&nbsp;&nbsp; </span>' +
          '<b style="color:#8f9bb0">Q</b> &nbsp; CLOSE THE LAPTOP'
        );
        if (this.input.pressed('decline')) {
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

      // the data lands on his own drive — this is NOT the key yet
      case 'copied': {
        if (this.t > 2.0) {
          this.phase = 'brief';
          this.t = 0;
          this._type([
            '',
            '!BLACKOUT PROTOCOL',
            '',
            'Remote shutdown authorization detected.',
            '>Physical authorization key required.',
            '',
            'Location: RACK 14 — HOLDING',
            '!Retrieval status: READY',
          ]);
        }
        break;
      }

      // he reads what the copy actually got him, and what it didn't
      case 'brief': {
        if (!this._typing() && !this._talking() && !this.briefSaid) {
          this.briefSaid = true;
          this._say('So the data is mine.');
          this._say("The key isn't. It's in the rack they told me to sign away.");
          this.matStandby.color.setHex(0xffb03a);   // Rack 14 answers across the dark
          this.sfx.alert();
        }
        if (this.briefSaid && !this._talking()) { this.phase = 'stand'; this.t = 0; }
        break;
      }

      // he gets to his feet — the camera rises, and control comes back
      case 'stand': {
        const k = Math.min(1, this.t / 1.2);
        this.eye = THREE.MathUtils.lerp(SEAT.eye, STAND_EYE, k);
        this.pz = THREE.MathUtils.lerp(SEAT.z, SEAT.z + 0.8, k);
        if (this.t > 1.2) {
          this.phase = 'toRack';
          this.t = 0;
          this.seated = false;        // off the crate: he can turn freely
          this.standing = true;       // and he can walk
          if (this.kaiModel) this.kaiModel.play('walk');
          this.yaw = this._yawToRack();
          this._say('Across the clearing. In the open.');
        }
        break;
      }

      // THE WALK. No threat yet — this stretch is only the camp and the dark
      // under the trees, and the dark is the point. He has read what Rack 14
      // is holding and now has to cross open ground to get to it.
      case 'toRack': {
        this._prompt(
          '<b style="color:#ffb03a">RACK 14</b> &nbsp; ' +
          '<span style="font-size:18px;color:#ffb03a">' + this._rackArrow() + '</span>'
        );
        if (!this.halfway &&
            Math.hypot(this.px - RACK14.x, this.pz - RACK14.z) < 5.5) {
          this.halfway = true;
          this._say("No fence. No lock. They didn't even guard it.");
        }
        if (Math.hypot(this.px - RACK14.x, this.pz - RACK14.z) < 2.4) {
          this.phase = 'atRack';
          this.t = 0;
          this._hush();
          this.termScreen.visible = true;   // the terminal wakes as he arrives
          this.termGlow.intensity = 5.0;
          this.sfx.sting();
          this._say('There it is.');
        }
        break;
      }

      // amber on his face, the protocol in front of him, the key in the socket
      case 'atRack': {
        this.termGlow.intensity = 5.0 + Math.sin(this.t * 3.4) * 0.7;
        // if he wanders back off across the clearing, hand the walk prompt back
        if (Math.hypot(this.px - RACK14.x, this.pz - RACK14.z) > 3.2) {
          this.phase = 'toRack'; this.t = 0; this._prompt('');
          break;
        }
        if (this.t > 1.2) {
          this._prompt('<b style="color:' + KEY_HEX + '">E</b> &nbsp; TAKE THE KEY');
          if (this.input.pressed('interact')) this._takeKey(state);
        }
        break;
      }

      // he pulls it, it lights — and something is already in the camp
      case 'taken': {
        this.matKeyDrive.emissiveIntensity = 0.8 + Math.sin(this.t * 7) * 0.3;
        this.keyLight.intensity = 4.5 + Math.sin(this.t * 7) * 1.1;
        if (this.t > 1.5) {
          this.phase = 'wide';
          this.t = 0;
          this.standing = false;            // the shot takes the controls back
          this.yaw = this._yawToTrail();
          // He is at the rack, so the figure walking in is standing in the
          // only way out — which is what the wide shot is for.
          this.handler.visible = true;
          this.handler.position.set(TRAIL.x, 0, TRAIL.z + 1.2);
          this.handler.rotation.y = 0;
          if (this.handlerModel) this.handlerModel.play('idle');
          this.torchLight.intensity = 55;
          this.torchBeam.visible = true;
          this.sfx.alarm();
          this._say('Someone is in the mouth of the trail.', null, true);
          this._say("And it's the only way out.");
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
          this.fleeT = 0;
          this.t = 0;
          this.matMarker.emissive.setHex(0x39b54a);  // the lamps become a runway
          if (this.kaiModel) this.kaiModel.play('run');
        }
        break;
      }

      case 'flee': {
        this.fleeT += dt;
        // dawn starts coming up while he runs — level 01's morning is seconds away
        this.dawnK = Math.min(1, this.fleeT / 14);
        this._applyDawn(this.dawnK);

        // he comes up from the mouth, a little slower than Kai can run, so
        // getting past him is tight rather than impossible
        // He walks the centre of the gap and does not chase sideways. That is
        // the character — he is not worried — and it is also the rule the
        // player has to find: run straight at him and you are caught, go round
        // him and you are not. The gap is 4.6 m and he is 0.8, so there is room
        // on either side if you commit to a side early.
        if (this.handlerModel) this.handlerModel.play('walk');
        const toward = Math.sign(this.px - this.handler.position.x) || 1;
        this.handler.position.x = THREE.MathUtils.clamp(
          this.handler.position.x + toward * 2.0 * dt, -2.6, 2.6);
        this.handler.position.z = Math.min(-4.5, this.handler.position.z + 1.15 * dt);
        this.torchLight.intensity = 55 + Math.sin(this.t * 13) * 9;

        // the marker lamps strobe him a line back to the trail
        for (let i = 0; i < this.markers.length; i++) {
          const on = Math.sin(this.t * 6 - i * 0.9) > 0;
          this.markers[i].material.emissiveIntensity = on ? 2.4 : 0.15;
        }

        this._prompt(
          '<b style="color:#9ed36a">RUN</b> &nbsp; ' +
          '<span style="font-size:18px;color:#9ed36a">' + this._trailArrow() + '</span>'
        );
        const atTrail = this.pz < -17.4 && Math.abs(this.px) < CORRIDOR_X;
        const caught = Math.hypot(this.px - this.handler.position.x,
                                  this.pz - this.handler.position.z) < 0.75;
        if (atTrail || caught) this._exit(state);
        break;
      }
    }

    this._updateCamera();
  }

  /* ==================================================== teardown */
  teardown() {
    this.sfx.stop();
    this.game.renderer.domElement.removeEventListener('click', this._onClick);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    if (document.pointerLockElement) document.exitPointerLock();

    for (const el of Object.values(this.hud)) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    this.hud = {};

    if (this.kaiModel) this.kaiModel.dispose();
    if (this.handlerModel) this.handlerModel.dispose();
    this.mist = [];               // drop the references; super disposes the meshes
    this.scene.fog = null;
    this.game.camera.fov = 62;
    this.game.camera.rotation.set(0, 0, 0);
    this.game.camera.updateProjectionMatrix();
    super.teardown();
  }
}
