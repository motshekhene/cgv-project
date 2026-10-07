import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { attachCharacter } from '../core/Characters.js';
import {
  loadJungleKit,
  createJungleMaterials,
  createJungleSky,
  createLightShaft,
  cloneProp,
  placeProp,
} from './level1/jungleWorld.js';

/**
 * PROLOGUE — THE FIRE, THE STONE, THE HORN.
 *
 * A completely different intro to the server-vault one this branch replaces.
 * There is no technology anywhere in this scene: no laptop, no rack, no key
 * card. Kai is not an engineer here. He is a forest guide, and the story is
 * the valley's own.
 *
 * THE STORY THIS SCENE HAS TO DELIVER — Kai runs with the horn through all of
 * level 01, and none of it is explained anywhere else:
 *
 *   1. Ingram taught Kai the forest and got him the company work. He is the
 *      closest thing Kai has to family, and he is sitting at the fire when
 *      the scene opens — lit properly, face showing, the one clear look the
 *      player ever gets until the last two minutes of the game.
 *   2. There is a horn on a stone deep in the forest. While it stays there,
 *      nobody cuts the trees. Ingram pays Kai one night's pay to take it.
 *   3. The moment Kai lifts it off the stone, every sound in the forest stops
 *      at once. He understands what he has done, turns around, and runs it
 *      back. Level 01 is that run.
 *
 * Shape:
 *   title    the title fades up over the live scene. The click that starts
 *            the conversation also starts the forest — browsers will not
 *            play audio until a gesture, and the whole scene depends on
 *            having sound to cut.
 *   talk     the conversation at the fire. One camera, two people, click to
 *            advance — the card mechanic pointed at faces instead of text.
 *   leave    Ingram whistles two notes and walks off into the dark.
 *   rise     Kai gets up; control returns.
 *   walk     the stone is a few metres away across open ground. No obstacles.
 *   choice   E takes the horn, Q gives him a moment of doubt and puts the
 *            prompt back, so taking it is always deliberate.
 *   taken    he lifts the horn. Every ambient sound cuts out at once. The
 *            horn glows — the only cyan in the game.
 *   wide     a lamp moves in the trees behind him. The pull-back holds the
 *            lamp and the way out in the same frame, so the player works out
 *            the problem by looking at it.
 *   flee     control returns and he runs, straight into level 01's run.
 *
 * HOW THE TEXT LOOKS — the old screens were monospace on black, which was
 * right for a server room and wrong for a forest:
 *   no black screens   every word sits over the live scene
 *   serif, not mono    one line from Google Fonts, Georgia behind it
 *   warm palette       cream body text, firelight amber, jungle green
 *   speaker names      above each line, in that character's colour —
 *                      KAI in green, INGRAM in amber. Amber is the fire he
 *                      sits at, then the lamp in the trees, then the lamp for
 *                      three levels. The player connects it before they know.
 *   no subtitle box    a soft dark gradient along the bottom, nothing more
 *
 * THE ONE RULE — Ingram's face is lit by the fire here and NOWHERE ELSE. From
 * the moment he walks off he is a long coat, a lamp and two whistled notes:
 * silhouette material, backlit, never close. If the player gets one clear
 * look at him during a chase, the ending stops working.
 *
 * Audio is synthesised with the Web Audio API — no sound files, so nothing to
 * download, credit or wait for. It is self-contained in this file on purpose.
 * The forest is insects, frogs and wind; the silence is all of it cut at
 * once, and the silence does not lift again inside this scene.
 */

// The clearing. Same geography idea as before: the fire is the south anchor,
// the stone sits off the line, and the trail mouth is the only way out.
const SEAT = { x: 0, z: 10.8, eye: 1.14 };  // on the log, feet to the fire
const FIRE = { x: 0, z: 7.9 };
const INGRAM_AT = { x: -1.0, z: 6.3 };     // across the flames, off the fire line
const WALKOFF = { x: -10.8, z: -4.5 };     // where Ingram leaves the fire
const STONE = { x: 4.2, z: -2.6 };         // the low stone, horn on it
const TRAIL = { x: 0, z: -16 };            // the way out; level 01 starts there
const LAMP_SPOT = { x: -8.8, z: -10.8 };   // where the lamp shows in the trees
const CLEARING_R = 15.5;  // walkable radius
const CORRIDOR_X = 2.3;   // half-width of the trail mouth gap
const STAND_EYE = 1.7;
const WALK = 3.0;
const RUN = 4.6;          // once he has the horn — he is not strolling out
const LOOK = 0.0022;

// the pull-back vantage: high in the south-east, looking north-west — Kai
// foreground at the stone with the horn lit, the lamp burning in the tree
// line at the left, and the trail mouth open behind it. One frame, the whole
// problem.
const WIDE_POS = new THREE.Vector3(12.2, 5.8, 5.2);
const WIDE_LOOK = new THREE.Vector3(-1.8, 0.8, -8.8);

const HORN_CYAN = 0x4fd6e0;  // the horn — matches how the level 01 pickup glows
const HORN_HEX = '#4fd6e0';
const INGRAM_AMBER = '#ffb03a';  // the fire, then the lamp
const KAI_GREEN = '#9ed36a';
const CREAM = '#f2e8d5';

// Night -> dawn. The dawn end of every pair below is level 01's exact morning
// palette (Level01.init: fog 0xcfd6a8/0.014, hemi 0xbfdcff/0x4a5a26, sun
// 0xffd29a), so the cut into the trail run is a continuation, not a jump.
// "Bring it to me before morning" — he is racing the sun, and loses.
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

// The conversation, word for word. It has to carry everything the old four
// cards carried: his name, the job, who is asking, and why he says yes.
const SCRIPT = [
  { who: 'INGRAM', text: 'Kai. Sit down.' },
  { who: 'INGRAM', text: 'You know the stone up past the ridge?' },
  { who: 'KAI', text: 'Everyone knows it.' },
  { who: 'INGRAM', text: "There's a horn on it. Bring it to me before morning." },
  { who: 'KAI', text: 'That horn is the only reason this valley is still standing.' },
  { who: 'INGRAM', text: 'I know what it is.' },
  { who: 'INGRAM', text: "One night's pay. Enough that you never cut another line for them." },
  { who: 'KAI', text: 'Why me?' },
  { who: 'INGRAM', text: 'Because I picked you.' },
  { who: 'INGRAM', text: "I've watched you walk that path since you were small." },
  { who: 'INGRAM', text: "One more thing. If anyone sees you out there — don't stop and explain. Just run." },
];
const SPEAK_COLOR = { INGRAM: INGRAM_AMBER, KAI: KAI_GREEN };

/* ==========================================================================
   Sfx — a very small synth. Every sound here is generated at runtime.

   The scene is built on one trick: the forest is loud, and then it is not.
   insects() and frog() are the valley alive; silence() cuts everything at
   once and nothing in this file brings it back. The whistle is two notes.
   ========================================================================== */
class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.chirpT = 1.2;
    this.frogT = 3.0;
    this.popT = 0.2;
    this.alive = true;      // is the forest still making sound?
    this.firePower = 1;     // the fire is dying all scene, 1 -> 0.45
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
      this.forestTone();
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

  /** Wind through the trees, with a slow swell. The valley's breath. */
  forestTone() {
    if (!this.ctx || this.tone) return;
    const ctx = this.ctx, t = this.t;
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
    if (!this.ctx || this.muted || !this.alive) return;
    this.chirpT -= dt;
    if (this.chirpT <= 0) { this.chirpT = 0.4 + Math.random() * 1.9; this._insect(); }
    this.frogT -= dt;
    if (this.frogT <= 0) { this.frogT = 3.2 + Math.random() * 5.2; this._frog(); }
  }

  /** One pop of the fire — a tiny filtered noise burst. */
  _pop() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    const src = ctx.createBufferSource();
    src.buffer = this._noise(0.03, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 + Math.random() * 1900;
    bp.Q.value = 2.2;
    const g = ctx.createGain();
    const a = (0.006 + Math.random() * 0.014) * this.firePower;
    g.gain.setValueAtTime(a, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.06);
  }

  /** The fire bed, scheduled from update(). Slows and quiets as it dies. */
  tickFire(dt) {
    if (!this.ctx || this.muted || !this.alive || this.firePower <= 0) return;
    this.popT -= dt;
    if (this.popT <= 0) {
      this.popT = (0.07 + Math.random() * 0.3) / this.firePower;
      this._pop();
    }
  }

  /** THE SILENCE. Everything cuts at once — wind, insects, frogs, fire. */
  silence() {
    if (!this.ctx) return;
    this.alive = false;
    const t = this.t;
    if (this.tone) this.tone.gain.cancelScheduledValues(t);
    if (this.tone) this.tone.gain.setValueAtTime(this.tone.gain.value, t);
    if (this.tone) this.tone.gain.linearRampToValueAtTime(0, t + 0.12);
  }

  /**
   * Ingram's whistle — two notes, higher then lower, falling off at the end
   * of each. A man calling across a valley at night. Two oscillators, no
   * files, and it comes back in level 02 over the engine.
   */
  whistle() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    [
      [0.0, 1318, 0.34],
      [0.52, 988, 0.46],
    ].forEach(([d, f, dur]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.04, t + d);
      o.frequency.exponentialRampToValueAtTime(f * 0.97, t + d + dur);
      // a little vibrato so it reads as a mouth, not a dial tone
      const vib = ctx.createOscillator();
      vib.type = 'sine'; vib.frequency.value = 5.6;
      const vibG = ctx.createGain(); vibG.gain.value = 9;
      vib.connect(vibG); vibG.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.075, t + d + 0.05);
      g.gain.setValueAtTime(0.07, t + d + dur - 0.09);
      g.gain.exponentialRampToValueAtTime(0.0004, t + d + dur);
      o.connect(g); g.connect(this.master);
      o.start(t + d); o.stop(t + d + dur + 0.05);
      vib.start(t + d); vib.stop(t + d + dur + 0.05);
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

  /** A slow pulsing low tone while he runs — dread, not music. */
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
      if (this.alarmOsc) this.alarmOsc.stop();
      if (this.alarmLfo) this.alarmLfo.stop();
      this.ctx.close();
    } catch (e) { /* already closed */ }
    this.ctx = null; this.master = null;
    this.tone = this.alarmGain = null;
  }
}

/* ========================================================================== */
export class Prologue extends Level {
  constructor() {
    super('prologue');

    this.px = SEAT.x;
    this.pz = SEAT.z;
    this.eye = SEAT.eye;
    this.yaw = 0;                 // yaw 0 looks down -Z, across the fire
    this.pitch = 0.06;            // eyes up, on the man across the flames
    this.locked = false;
    this.standing = false;        // may he walk?
    this.seated = true;           // still on the log (clamps how far he turns)
    this.cine = 0;                // 0 = first person, 1 = the wide shot

    this.phase = 'title';
    this.t = 0;
    this.leaving = false;
    this.scriptIndex = -1;        // which conversation line is up
    this.doubted = false;         // said the doubt line yet?
    this.halfway = false;         // said the open-ground line yet?
    this.beatT = 0;               // counts down to the next heartbeat
    this.dawnK = 0;               // 0 = night, 1 = level 01's morning
    this._dawnApplied = -1;
    this._dawnTmp = new THREE.Color();  // scratch colour for _applyDawn()

    this.says = [];
    this.sayT = 0;

    this.blockers = [];
    this.sfx = new Sfx();
  }

  /* ==================================================== build */
  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(NIGHT.fog, NIGHT.fogDensity);

    this._ensureSerif();
    this._buildSky();
    const kit = await loadJungleKit(assets);
    if (!this.scene) return; // torn down while loading
    const mats = await createJungleMaterials(assets, 60);
    if (!this.scene) return;
    this.kit = kit;
    this.mats = mats;
    this._buildGround();
    this._buildFire();
    this._buildStone();
    this._buildJungle();
    this._buildFigures();
    this._buildHud();

    this._onClick = () => {
      this.sfx.start();                       // audio needs a gesture
      if (this.phase === 'title') { this._begin(); return; }
      if (this.phase === 'talk') { this._nextLine(); return; }
      if (!this.standing) return;
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
      if (this.hud.lock) {
        this.hud.lock.style.opacity =
          (this.locked || !this.standing || this.cine > 0) ? '0' : '1';
      }
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

  /** One line from Google Fonts; Georgia carries it if the network is gone. */
  _ensureSerif() {
    if (!document.getElementById('prologue-serif')) {
      const link = document.createElement('link');
      link.id = 'prologue-serif';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,500;0,600;1,500&display=swap';
      document.head.appendChild(link);
    }
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

    // ground mist, five soft cards drifting round the clearing
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

    // fireflies. One Points cloud, opacity pulsing in update(). They keep
    // going after the silence — the valley is not dead, it is holding still.
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
    // forest floor everywhere, and a dirt path worn from the fire to the
    // trail mouth — the line every phase of this scene walks
    const ground = new THREE.Mesh(new THREE.CircleGeometry(CLEARING_R + 14, 40), this.mats.forest);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.root.add(ground);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 28), this.mats.trail);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, -3.4); // fire (z 8) to trail mouth (z -17)
    path.receiveShadow = true;
    this.root.add(path);

    // the trampled ground around the fire, where the ground is just earth
    const apron = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), this.mats.trail);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(FIRE.x, 0.02, FIRE.z);
    apron.receiveShadow = true;
    this.root.add(apron);
  }

  /* ---------------------------------------------------- the fire */
  /**
   * The fire is the scene's key light and its clock. It burns for Ingram,
   * dies across the night while they talk, and is embers by the time Kai
   * runs — which is why nobody at the camp below sees either of them.
   */
  _buildFire() {
    this.geoBox = new THREE.BoxGeometry(1, 1, 1);
    this.matWood = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 });
    this.matChar = new THREE.MeshStandardMaterial({ color: 0x191512, roughness: 0.95 });
    this.matRock = new THREE.MeshStandardMaterial({ color: 0x565b52, roughness: 0.95 });
    this.matDark = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.95 });

    // stone ring
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + (i % 3) * 0.035, 0), this.matRock);
      s.position.set(FIRE.x + Math.cos(a) * 0.55, 0.09, FIRE.z + Math.sin(a) * 0.55);
      s.rotation.set(Math.random(), Math.random() * 3, Math.random());
      s.castShadow = true;
      this.root.add(s);
    }

    // crossed logs
    for (const [dx, dz, ry] of [[0.14, 0.05, 0.5], [-0.12, 0.02, 2.1], [0, -0.14, -0.9]]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.85, 8), this.matChar);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = ry;
      log.position.set(FIRE.x + dx, 0.14, FIRE.z + dz);
      log.castShadow = true;
      this.root.add(log);
    }

    // the ember bed — a warm disc under the flames
    this.ember = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      new THREE.MeshBasicMaterial({ color: 0xff7a26, transparent: true, opacity: 0.85 }),
    );
    this.ember.rotation.x = -Math.PI / 2;
    this.ember.position.set(FIRE.x, 0.06, FIRE.z);
    this.root.add(this.ember);

    // flames — two crossed additive cards with a soft canvas gradient, then a
    // third behind for body. Scale and opacity flicker in update().
    const flameCanvas = document.createElement('canvas');
    flameCanvas.width = 64; flameCanvas.height = 96;
    const fc = flameCanvas.getContext('2d');
    const grad = fc.createLinearGradient(0, 96, 0, 0);
    grad.addColorStop(0, 'rgba(255,236,170,0.95)');
    grad.addColorStop(0.45, 'rgba(255,140,40,0.55)');
    grad.addColorStop(1, 'rgba(255,60,10,0)');
    fc.fillStyle = grad;
    fc.beginPath();
    fc.moveTo(32, 96); fc.quadraticCurveTo(2, 52, 32, 0); fc.quadraticCurveTo(62, 52, 32, 96);
    fc.fill();
    const flameTex = new THREE.CanvasTexture(flameCanvas);
    this.flames = [];
    for (const [dx, dz, w, h, ry] of [
      [0, 0, 0.5, 0.85, 0], [0, 0, 0.5, 0.85, Math.PI / 2], [0.05, -0.05, 0.34, 0.6, 0.7],
    ]) {
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          map: flameTex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }),
      );
      f.position.set(FIRE.x + dx, 0.42 + h / 2, FIRE.z + dz);
      f.rotation.y = ry;
      this.root.add(f);
      this.flames.push(f);
    }

    // the light itself. Flickers with its own noise so nothing loops.
    this.fireLight = new THREE.PointLight(0xff9a3a, 7, 14, 2);
    this.fireLight.position.set(FIRE.x, 0.85, FIRE.z);
    this.fireLight.castShadow = true;
    this.fireLight.shadow.mapSize.set(512, 512);
    this.root.add(this.fireLight);
  }

  /* ---------------------------------------------------- the stone */
  /**
   * THE STONE. Low, old, and the only worked thing in the clearing — one
   * pale horn lying on it, the way a tool is laid down. From the fire it is
   * picked out by the flames and nothing else, which is how the valley
   * meant it to be found.
   */
  _buildStone() {
    const g = new THREE.Group();
    g.position.set(STONE.x, 0, STONE.z);
    g.rotation.y = -0.5;                    // canted to the path, not square
    this.root.add(g);
    this.stone = g;

    const base = new THREE.Mesh(this.geoBox, this.matRock);
    base.scale.set(1.5, 0.72, 1.05);
    base.position.y = 0.36;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const cap = new THREE.Mesh(this.geoBox, this.matRock);
    cap.scale.set(1.62, 0.16, 1.16);
    cap.position.y = 0.78;
    cap.rotation.y = 0.06;
    cap.castShadow = true;
    g.add(cap);

    // a second slab fallen behind it, so it reads as old rather than placed
    const fallen = new THREE.Mesh(this.geoBox, this.matRock);
    fallen.scale.set(0.9, 0.4, 0.7);
    fallen.position.set(-0.95, 0.2, 0.55);
    fallen.rotation.set(0.2, 0.5, 0.12);
    fallen.castShadow = true;
    g.add(fallen);

    // ---- the horn. A swept curve of pale keratin, lying across the cap. ----
    // Torus arc for the sweep, a cone at the tip for the taper — low-poly on
    // purpose, like everything else in the valley.
    this.matHorn = new THREE.MeshStandardMaterial({
      color: 0x9a8a66, roughness: 0.5, metalness: 0.05, emissive: 0x000000,
    });
    const horn = new THREE.Group();
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.045, 8, 14, 2.1),
      this.matHorn,
    );
    arc.rotation.x = Math.PI / 2;           // lie the sweep flat
    horn.add(arc);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.048, 0.22, 8),
      this.matHorn,
    );
    // the arc ends at angle 2.1 rad; stand the tip on the end and point it on
    const tipAng = 2.1;
    tip.position.set(Math.cos(tipAng) * 0.3, 0, Math.sin(tipAng) * 0.3);
    tip.rotation.z = tipAng - Math.PI / 2 + Math.PI;
    horn.add(tip);
    horn.position.set(0.05, 0.9, -0.08);
    horn.rotation.y = 0.7;
    g.add(horn);
    this.horn = horn;

    this.hornLight = new THREE.PointLight(HORN_CYAN, 0, 5.5, 2);
    this.hornLight.position.set(0.05, 1.05, -0.08);
    g.add(this.hornLight);

    // Once he lifts it, the horn and its light move into here, and this group
    // follows him for the rest of the scene. The cyan has to travel with Kai
    // — it is on him in the wide shot, and it is how he looks arriving in
    // level 01.
    this.carried = new THREE.Group();
    this.root.add(this.carried);
  }

  /* ---------------------------------------------------- everything solid */
  _buildBlockers() {
    const add = (x0, x1, z0, z1) => this.blockers.push({ x0, x1, z0, z1 });
    add(FIRE.x - 0.8, FIRE.x + 0.8, FIRE.z - 0.8, FIRE.z + 0.8);          // the fire
    add(STONE.x - 1.1, STONE.x + 1.1, STONE.z - 1.0, STONE.z + 1.0);      // the stone
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

    // relics the trail will keep meeting — the valley was lived in long
    // before anyone cut a line through it
    placeProp(this.root, cloneProp(this.kit.stag), -7.5, 0, -13, { s: 0.0105, ry: 0.55 });
    placeProp(this.root, cloneProp(this.kit.column), -6.2, 0, -11.4, { s: 0.014, ry: 0.2 });
    placeProp(this.root, cloneProp(this.kit.columnShort), -8.6, 0, -11.8, { s: 0.012, ry: 1.4 });
    placeProp(this.root, cloneProp(this.kit.deadTree), 8.8, 0, -9.6, { s: 0.02, ry: 1.1 });
  }

  /* ---------------------------------------------------- the two figures */
  _buildFigures() {
    // ---- Ingram, across the fire. Lit by the flames — this is the one
    //      clear look the player gets, so he is NOT a silhouette here. ----
    this.ingram = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 0.9, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.85 }),
    );
    torso.position.y = 1.08;
    torso.castShadow = true;
    this.ingram.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x6e5a48, roughness: 0.8 }),
    );
    head.position.y = 1.8;
    head.castShadow = true;
    this.ingram.add(head);
    // the long coat — the same one the player will spend three levels
    // learning to dread, seen here in firelight for the only time
    const coat = new THREE.Mesh(this.geoBox, this.matWood);
    coat.scale.set(0.82, 1.4, 0.4);
    coat.position.y = 0.74;
    coat.castShadow = true;
    this.ingram.add(coat);

    this.ingram.position.set(INGRAM_AT.x, 0, INGRAM_AT.z);
    this.ingram.rotation.y = Math.PI;       // faces Kai across the flames
    this.root.add(this.ingram);

    // his lamp, hanging from one hand. Amber, like the fire, then the chase,
    // then the helmet coming off.
    this.matLamp = new THREE.MeshStandardMaterial({
      color: 0x777c70, roughness: 0.6, metalness: 0.4,
      emissive: 0xffb03a, emissiveIntensity: 0.6,
    });
    this.ingramLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 10), this.matLamp);
    this.ingramLamp.position.set(0.42, 0.62, 0.1);
    this.ingram.add(this.ingramLamp);
    this.ingramLampLight = new THREE.PointLight(0xffb03a, 2.2, 8, 2);
    this.ingramLampLight.position.set(0.42, 0.68, 0.1);
    this.ingram.add(this.ingramLampLight);

    // whatever the downloaded rig looks like, it steps into this group. It
    // loads in the background, so the blocky figure above is what the player
    // sees until it lands — and forever if it never does.
    this.ingramModel = attachCharacter(this.assets, 'handler', this.ingram, {
      onReady: (h) => {
        // after he walks off, the model must never show a face again
        if (this.phase !== 'title' && this.phase !== 'talk' && this.phase !== 'leave') {
          this._silenceIngram();
        }
      },
    });

    // ---- the pursuer's lamp, for after. The same amber, moving in the
    //      trees, with a beam that reads through the mist. ----
    this.lamp = new THREE.Group();
    this.lampMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 10), this.matLamp.clone());
    this.lamp.add(this.lampMesh);
    this.lampLight = new THREE.PointLight(0xffb03a, 0, 22, 1.6);
    this.lamp.add(this.lampLight);
    this.lampBeam = createLightShaft(0.9, 0xffd9a0, 0.14);
    this.lampBeam.position.y = -0.9;
    this.lampBeam.rotation.x = Math.PI;     // points down through the mist
    this.lampBeam.visible = false;
    this.lamp.add(this.lampBeam);
    this.lamp.position.set(LAMP_SPOT.x, 1.5, LAMP_SPOT.z);
    this.lamp.visible = false;
    this.root.add(this.lamp);

    // ---- Kai himself. Only on screen once the camera pulls back, so the
    //      player can see where they are standing relative to the mouth. ----
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

    // Same swap-in pattern as Ingram: blocky Kai until the rig lands.
    this.kaiModel = attachCharacter(this.assets, 'kai', this.kai);

    // the log Kai sits on, and one stump for his heels
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 8), this.matWood);
    log.rotation.z = Math.PI / 2;
    log.position.set(SEAT.x, 0.16, SEAT.z + 0.35);
    log.castShadow = true;
    this.root.add(log);
    this._buildBlockers();
  }

  /** Swap every material on Ingram for the matte-black one. One way. */
  _silenceIngram() {
    if (!this.ingramModel || !this.ingramModel.root) return;
    this.ingramModel.root.traverse((o) => {
      if (o.isMesh) o.material = this.matDark;
    });
    // his lamp stays lit — the lamp IS him, from here to the shrine
  }

  /* ==================================================== hud */
  /**
   * Everything here sits over the live scene — there is no black card and no
   * full-screen surface anywhere in the file. The one big element is the
   * gradient at the bottom that keeps the subtitles readable over the fire.
   */
  _buildHud() {
    const host = document.getElementById('hud') || document.body;
    const mk = (css, html = '') => {
      const el = document.createElement('div');
      el.style.cssText = css;
      el.innerHTML = html;
      host.appendChild(el);
      return el;
    };
    const SERIF = "font-family:'Crimson Pro',Georgia,'Times New Roman',serif";
    const base = 'position:absolute;pointer-events:none;';
    this.hud = {};

    // the reading gradient — soft dark at the bottom of the screen, nothing
    // more. On whenever words are on screen, off when the forest talks.
    this.hud.shade = mk(
      base + ';left:0;right:0;bottom:0;height:42%;pointer-events:none;' +
      'background:linear-gradient(to top, rgba(3,6,4,.78) 0%, rgba(3,6,4,.42) 55%, rgba(3,6,4,0) 100%);' +
      'opacity:0;transition:opacity 1.2s',
    );

    // the title, over the live fire. Warm serif letters, nothing else.
    this.hud.title = mk(
      base + ';left:0;right:0;top:34%;text-align:center;opacity:0;' +
      'transition:opacity 2.4s',
      `<div style="${SERIF};color:${CREAM};font-size:46px;font-weight:600;` +
      'letter-spacing:.3em;text-shadow:0 0 28px rgba(255,176,58,.4), 0 2px 18px rgba(0,0,0,.9)">' +
      'BLACKOUT PROTOCOL</div>' +
      `<div style="color:#8f9bb0;font-size:12px;letter-spacing:.34em;margin-top:18px;${SERIF}">' +
      'CLICK TO BEGIN</div>`,
    );

    // the conversation. Speaker name above the line, in that character's
    // colour; the line in cream serif with a soft shadow. No box.
    this.hud.sub = mk(
      base + ';left:50%;bottom:9%;transform:translateX(-50%);width:min(720px,86vw);' +
      'text-align:center;opacity:0;transition:opacity .3s',
    );
    this.hud.subName = document.createElement('div');
    this.hud.subName.style.cssText =
      `${SERIF};font-size:13px;font-weight:600;letter-spacing:.42em;margin-bottom:7px;` +
      'text-shadow:0 1px 8px rgba(0,0,0,.9)';
    this.hud.sub.appendChild(this.hud.subName);
    this.hud.subLine = document.createElement('div');
    this.hud.subLine.style.cssText =
      `${SERIF};color:${CREAM};font-size:23px;line-height:1.45;` +
      'text-shadow:0 2px 12px rgba(0,0,0,.95), 0 0 30px rgba(0,0,0,.6)';
    this.hud.sub.appendChild(this.hud.subLine);
    this.hud.subHint = mk(
      base + ';left:50%;bottom:4.5%;transform:translateX(-50%);color:#8f9bb0;' +
      `font-size:11px;letter-spacing:.3em;${SERIF};opacity:0;transition:opacity .4s`,
      'CLICK',
    );

    this.hud.prompt = mk(
      base + SERIF + ';left:50%;bottom:19%;transform:translateX(-50%);color:' + CREAM + ';' +
      'font-size:20px;letter-spacing:.08em;text-align:center;opacity:0;transition:opacity .25s;' +
      'text-shadow:0 2px 12px rgba(0,0,0,.95)',
    );

    this.hud.lock = mk(
      base + ';left:50%;top:58%;transform:translate(-50%,-50%);color:#8f9bb0;' +
      `font-size:13px;letter-spacing:.24em;${SERIF};transition:opacity .3s;opacity:0`,
      'CLICK TO LOOK AROUND',
    );

    this.hud.skip = mk(
      base + ';right:26px;bottom:20px;color:#5b6379;font-size:12px;letter-spacing:.24em;' + SERIF,
      'X — SKIP &nbsp;·&nbsp; M — MUTE',
    );

    // Kai's own head — italic, no speaker colour, a shade above the subs
    this.hud.thought = mk(
      base + ';left:50%;bottom:24%;transform:translateX(-50%);max-width:680px;' +
      `text-align:center;color:#e8ddc8;font-size:21px;font-style:italic;line-height:1.5;${SERIF};` +
      'text-shadow:0 2px 14px rgba(0,0,0,.95);opacity:0;transition:opacity .5s',
    );

    this.hud.fade = mk(
      'position:absolute;inset:0;background:#04060a;pointer-events:none;opacity:0;' +
      'transition:opacity .9s',
    );

    // the title drifts up once the scene is on screen
    setTimeout(() => { if (this.hud.title) this.hud.title.style.opacity = '1'; }, 700);
  }

  /* ---------------------------------------------------- the conversation */
  _begin() {
    this.phase = 'talk';
    this.t = 0;
    // the click that starts Ingram also starts the forest
    this.hud.title.style.opacity = '0';
    this._nextLine();
  }

  _showLine(i) {
    const line = SCRIPT[i];
    this.hud.subName.textContent = line.who;
    this.hud.subName.style.color = SPEAK_COLOR[line.who];
    this.hud.subLine.textContent = line.text;
    this.hud.sub.style.opacity = '1';
    this.hud.shade.style.opacity = '1';
    this.hud.subHint.style.opacity = '1';
  }

  _nextLine() {
    this.scriptIndex++;
    if (this.scriptIndex >= SCRIPT.length) {
      // the conversation is over — the title has long faded, the fire is
      // lower, and Ingram has one thing left to do before he goes
      this.hud.sub.style.opacity = '0';
      this.hud.subHint.style.opacity = '0';
      this.phase = 'leave';
      this.t = 0;
      this._leaveTold = false;
      this._whistled = false;
      return;
    }
    this._showLine(this.scriptIndex);
    if (this.scriptIndex === 0) {
      // the title fades out underneath his first line, not before it
      this.hud.title.style.opacity = '0';
    }
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

  /** The gates that stop text colliding with text. */
  _talking() { return this.says.length > 0 || this.sayT > 0; }

  /** Clear the text channel. */
  _hush() {
    this.says.length = 0;
    this.sayT = 0;
    this.hud.thought.style.opacity = '0';
  }

  _prompt(html) {
    this.hud.prompt.innerHTML = html;
    this.hud.prompt.style.opacity = html ? '1' : '0';
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
    // the trail mouth cuts through it. Until he has the horn there is nothing
    // out there but the dark, so the rope of shadow at the mouth holds him.
    if (this.pz < -14) {
      this.px = THREE.MathUtils.clamp(this.px, -CORRIDOR_X, CORRIDOR_X);
      this.pz = Math.max(this.pz, -21);
    } else if (this.phase !== 'flee' && this.pz < -11.5) {
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
    // on the log he can glance around, but he cannot spin on the spot
    if (this.seated) this.yaw = THREE.MathUtils.clamp(this.yaw, -1.0, 1.0);
  }

  /** Pointer lock refused (sandboxed iframe etc.) — play on without it. */
  _playUnlocked() {
    if (this.locked) return;
    this.locked = true;
    if (this.hud && this.hud.lock) this.hud.lock.style.opacity = '0';
  }

  /** Screen-space arrow toward a point in the clearing, relative to where he looks. */
  _arrowTo(tx, tz) {
    let d = this._yawTo(tx, tz) - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.55) return '&uarr;';
    return d > 0 ? '&larr;' : '&rarr;';
  }

  _trailArrow() { return this._arrowTo(TRAIL.x, TRAIL.z); }
  _stoneArrow() { return this._arrowTo(STONE.x, STONE.z); }

  /** Yaw that points the camera at a place, from where he is standing. */
  _yawTo(tx, tz) {
    return Math.atan2(-(tx - this.px), -(tz - this.pz));
  }

  _yawToStone() { return this._yawTo(STONE.x, STONE.z); }
  _yawToTrail() { return this._yawTo(TRAIL.x, TRAIL.z); }

  /* ==================================================== night -> dawn */
  /** k = 0 is the clearing at night; k = 1 is level 01's exact morning. */
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
  }

  /* ==================================================== key moments */
  /** THE HORN, off the stone and into his hand. */
  _takeHorn(state) {
    this.phase = 'taken';
    this.t = 0;
    this._prompt('');
    this._hush();
    this.carried.add(this.horn);              // off the stone, into his hand
    this.carried.add(this.hornLight);
    this.horn.position.set(0, 0, 0);
    this.horn.rotation.set(0.5, 0.3, 0.2);
    this.hornLight.position.set(0, 0.12, 0);
    this.matHorn.emissive.setHex(HORN_CYAN);
    this.matHorn.emissiveIntensity = 0.85;
    this.hornLight.intensity = 4.5;
    // THE SILENCE. Wind, insects, frogs, fire — all of it, at once.
    this.sfx.silence();
    state.hasKey = true;                      // what he carries through the game
  }

  /** The lamp, in the trees behind him. */
  _showLamp() {
    this.lamp.visible = true;
    this.lampLight.intensity = 3.6;
    this.lampBeam.visible = true;
    // the man under it: the same one who sat at the fire, face gone now.
    // Whatever load state the model is in, it must not show a face.
    this.ingram.position.set(LAMP_SPOT.x - 0.6, 0, LAMP_SPOT.z + 0.8);
    this.ingram.rotation.y = Math.PI * 0.12;
    this.ingramLamp.visible = false;          // the hand lamp IS the tree lamp now
    this.ingramLampLight.intensity = 0;
    this.ingram.visible = true;
    this._silenceIngram();
    if (this.ingramModel) this.ingramModel.play('idle');
  }

  _exit(state) {
    if (this.leaving) return;
    this.leaving = true;
    this.phase = 'done';
    this._prompt('');
    this.hud.thought.style.opacity = '0';
    this.hud.sub.style.opacity = '0';
    this.hud.shade.style.opacity = '0';
    this.hud.fade.style.opacity = '1';
    this._applyDawn(1);      // the fade is dark; the jump in light is free
    if (document.exitPointerLock) document.exitPointerLock();
    // This prologue is the intro of record: it ends on Kai breaking onto the
    // trail at dawn with the horn, which is level 01's first frame. The old
    // level-1 cutscene (TrailIntro) is still built around a data-centre door,
    // so playing it here would break the valley story — go straight into the
    // run. Reachable on its own via ?level=level01-intro.
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

      // tighter while he listens at the fire, wide once he is on his feet
      const intimate = ['title', 'talk', 'leave', 'rise'].includes(this.phase);
      const want = intimate ? 44 : 58;
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

    if (this.phase !== 'title' && this.phase !== 'talk' && this.cine <= 0) this._look();
    this._tickSay(dt);
    if (this.standing && this.phase !== 'done') this._move(dt);

    // the forest is alive until the horn comes off the stone
    this.sfx.tickNight(dt);
    this.sfx.tickFire(dt);

    // fireflies hold still until they don't; mist crawls
    this.fireflyMat.opacity = (0.55 + Math.sin(this.t * 1.7) * 0.25) * (1 - this.dawnK);
    this.fireflies.rotation.y += dt * 0.006;
    for (const m of this.mist) m.rotation.z += dt * 0.012;

    if (this.kaiModel) this.kaiModel.update(dt);
    if (this.ingramModel) this.ingramModel.update(dt);

    // the horn rides just in front of him, at about the height he'd carry it
    if (this.carried && this.carried.children.length) {
      this.carried.position.set(
        this.px - Math.sin(this.yaw) * 0.42, 1.08, this.pz - Math.cos(this.yaw) * 0.42,
      );
    }

    // heartbeat, from the moment the horn is lit
    if (this.phase === 'taken' || this.phase === 'wide' || this.phase === 'flee') {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.sfx.thump(); this.beatT = 0.84; }
    }

    // fire flicker — its own noise, never a loop you can hear
    const power = this.sfx.firePower;
    this.fireLight.intensity = (5.6 + Math.sin(this.t * 11) * 0.9 + Math.sin(this.t * 23.7) * 0.6) * power;
    this.ember.material.opacity = 0.85 * power;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const w = 0.9 + Math.sin(this.t * (9 + i * 3.1) + i * 2) * 0.14;
      f.scale.set(w, (0.92 + Math.sin(this.t * 7.3 + i) * 0.1) * power, 1);
      f.material.opacity = Math.min(1, 0.85 * power + 0.1);
    }

    switch (this.phase) {
      // The scene plays itself: fire, mist, the camera breathing. One click
      // starts the forest and hands the scene to Ingram.
      case 'title': {
        this.yaw = Math.sin(this.t * 0.11) * 0.05;
        this.pitch = 0.06 + Math.sin(this.t * 0.07) * 0.012;
        break;
      }

      // One camera, two people, click to advance — the card mechanic pointed
      // at faces instead of text. The camera holds the two-shot: fire
      // centre, Ingram left of it, barely breathing so it stays alive.
      case 'talk': {
        this.yaw = Math.sin(this.t * 0.09) * 0.02;
        // the fire is dying all through the conversation
        this.sfx.firePower = Math.max(0.45, 1 - this.t * 0.012);
        // Ingram is alive at the fire: breathing weight, the lamp swinging
        if (this.ingramModel) {
          if (!this._ingramIdled) { this._ingramIdled = true; this.ingramModel.play('idle'); }
        }
        this.ingram.rotation.y = Math.PI + Math.sin(this.t * 0.4) * 0.03;
        break;
      }

      // He whistles two notes and walks off into the dark.
      case 'leave': {
        if (!this._whistled && this.t > 0.6) { this._whistled = true; this.sfx.whistle(); }
        if (this.t > 1.4) {
          if (this.ingramModel) this.ingramModel.play('walk');
          // out along the west tree line, unhurried — a man with nowhere to be
          const k = Math.min(1, (this.t - 1.4) / 4.6);
          const ease = k * k * (3 - 2 * k);
          this.ingram.position.set(
            THREE.MathUtils.lerp(INGRAM_AT.x, WALKOFF.x, ease),
            0,
            THREE.MathUtils.lerp(INGRAM_AT.z, WALKOFF.z, ease),
          );
          this.ingram.rotation.y = Math.atan2(
            -(WALKOFF.x - INGRAM_AT.x), -(WALKOFF.z - INGRAM_AT.z),
          );
          // the lamp's glow goes with him and thins into the dark
          this.ingramLampLight.intensity = 2.2 * (1 - ease * 0.55);
          if (k >= 1 && !this._leaveTold) {
            this._leaveTold = true;
            this.ingram.visible = false;
            this.ingramLampLight.intensity = 0;
          }
        }
        if (this.t > 7.4) {
          this.phase = 'rise';
          this.t = 0;
        }
        break;
      }

      // He gets to his feet — the camera rises, and control comes back.
      case 'rise': {
        const k = Math.min(1, this.t / 1.2);
        this.eye = THREE.MathUtils.lerp(SEAT.eye, STAND_EYE, k);
        this.pz = THREE.MathUtils.lerp(SEAT.z, SEAT.z + 0.75, k);
        if (this.t > 1.2) {
          this.phase = 'walk';
          this.t = 0;
          this.seated = false;        // off the log: he can turn freely
          this.standing = true;       // and he can walk
          if (this.kaiModel) this.kaiModel.play('walk');
          this.yaw = this._yawToStone();
          this._say('A few metres. Then back in bed before he changes his mind.');
          this._onLockChange();
        }
        break;
      }

      // THE WALK. No threat yet — this stretch is only the fire behind him
      // and the dark under the trees ahead. About five seconds of open grass.
      case 'walk': {
        this._prompt(
          '<span style="color:' + INGRAM_AMBER + '">THE STONE</span> &nbsp; ' +
          '<span style="font-size:24px;color:' + INGRAM_AMBER + '">' + this._stoneArrow() + '</span>',
        );
        if (!this.halfway &&
            Math.hypot(this.px - STONE.x, this.pz - STONE.z) < 6) {
          this.halfway = true;
          this._say('Everyone in the valley could tell you what this stone means.');
        }
        if (Math.hypot(this.px - STONE.x, this.pz - STONE.z) < 2.35) {
          this.phase = 'choice';
          this.t = 0;
          this._hush();
          this._prompt('');
        }
        break;
      }

      case 'choice': {
        if (this.doubted) {
          // the doubt line has the screen; when it is done, the prompt comes
          // back — so taking the horn is always something chosen twice
          if (!this._talking()) this.doubted = false;
        } else {
          this._prompt(
            '<b style="color:' + HORN_HEX + '">E</b> — TAKE THE HORN' +
            '<span style="opacity:.45"> &nbsp;&nbsp;|&nbsp;&nbsp; </span>' +
            '<b style="color:#8f9bb0">Q</b> — LEAVE IT',
          );
          if (this.input.pressed('decline')) {
            // a moment of doubt, in his own head
            this.doubted = true;
            this._prompt('');
            this._say('Walk away. Tell him it wouldn\u2019t come loose.', null, true);
          }
          if (this.input.pressed('interact')) this._takeHorn(state);
        }
        break;
      }

      // He lifts it. The valley holds its breath.
      case 'taken': {
        this.matHorn.emissiveIntensity = 0.85 + Math.sin(this.t * 7) * 0.3;
        this.hornLight.intensity = 4.5 + Math.sin(this.t * 7) * 1.1;
        if (this.t > 1.5 && !this._quietSaid) {
          this._quietSaid = true;
          this._say('Everything just went quiet.', null, true);
          this._say("That's not supposed to happen.");
        }
        if (this._quietSaid && !this._talking() && this.t > 4.2) {
          this.phase = 'wide';
          this.t = 0;
          this.standing = false;            // the shot takes the controls back
          this._showLamp();
          // the last of the fire settles to embers behind him
          this.sfx.firePower = 0.3;
        }
        break;
      }

      // THE PULL-BACK — the lamp in the trees and the way out, one frame
      case 'wide': {
        if (this.t < 1.1) this.cine = this.t / 1.1;
        else if (this.t < 4.4) this.cine = 1;
        else if (this.t < 5.5) this.cine = 1 - (this.t - 4.4) / 1.1;
        else {
          this.cine = 0;
          this.standing = true;
          this.phase = 'flee';
          this.t = 0;
          this.sfx.alarm();
          if (this.kaiModel) this.kaiModel.play('run');
          this._onLockChange();
        }
        // the lamp drifts through the trunks while the shot holds
        if (this.lamp.visible) {
          this.lamp.position.x = LAMP_SPOT.x + Math.sin(this.t * 0.5) * 1.3;
          this.lamp.position.y = 1.5 + Math.sin(this.t * 1.7) * 0.14;
          this.lampLight.intensity = 3.4 + Math.sin(this.t * 9) * 0.7;
        }
        if (!this._lampSaid && this.t > 1.9) {
          this._lampSaid = true;
          this._say("Someone's out there.", null, true);
        }
        break;
      }

      case 'flee': {
        // he runs the only line there is: across the open ground, through the
        // mouth, out onto the trail. The lamp comes through the trees behind
        // him, slower than him, and never once in a hurry.
        if (this.ingramModel) this.ingramModel.play('walk');
        const toward = Math.sign(this.px - this.ingram.position.x) || 1;
        this.ingram.position.x = THREE.MathUtils.clamp(
          this.ingram.position.x + toward * 1.7 * dt, -2.6, 2.6);
        this.ingram.position.z = Math.min(-4.2, this.ingram.position.z + 1.05 * dt);
        // the lamp detaches from the man and haunts the gap between trunks
        this.lamp.position.set(
          this.ingram.position.x, 1.5 + Math.sin(this.t * 2.1) * 0.13, this.ingram.position.z + 0.6,
        );
        this.lampLight.intensity = 3.4 + Math.sin(this.t * 13) * 0.9;

        // dawn starts coming up while he runs — level 01's morning is seconds
        // away, and Ingram said "before morning"
        this.dawnK = Math.min(1, this.t / 16);
        this._applyDawn(this.dawnK);

        this._prompt(
          '<b style="color:' + KAI_GREEN + '">RUN</b> &nbsp; ' +
          '<span style="font-size:24px;color:' + KAI_GREEN + '">' + this._trailArrow() + '</span>',
        );
        const atTrail = this.pz < -17.4 && Math.abs(this.px) < CORRIDOR_X;
        const caught = Math.hypot(this.px - this.ingram.position.x,
                                  this.pz - this.ingram.position.z) < 0.8;
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
    if (this.ingramModel) this.ingramModel.dispose();
    this.mist = [];               // drop the references; super disposes the meshes
    this.scene.fog = null;
    this.game.camera.fov = 62;
    this.game.camera.rotation.set(0, 0, 0);
    this.game.camera.updateProjectionMatrix();
    super.teardown();
  }
}
