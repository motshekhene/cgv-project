import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { loadCast, makeKai, makeHandler } from '../intros/cast.js';
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
 *   2. The company wants to cut this forest down, but its men will not go
 *      past the old stone up the ridge: the last crew that did never came
 *      back. The horn on the stone is what keeps the forest safe and alive —
 *      the animals, and the springs every village in the valley drinks from —
 *      and the story goes that if it ever leaves the stone, the whole forest
 *      goes silent. Ingram calls that an old story, and pays Kai a year of
 *      the company's wages to bring it down before the sun is up. No horn,
 *      nothing left to scare the men off, and the cutting can start.
 *   3. The moment Kai lifts it off the stone, every sound in the forest stops
 *      at once. The story was true. He turns onto the old trail down the
 *      mountain and runs. Level 01 is that run.
 *
 * Shape:
 *   title    the title fades up over the live scene. The click that starts
 *            the conversation also starts the forest — browsers will not
 *            play audio until a gesture, and the whole scene depends on
 *            having sound to cut.
 *   talk     the conversation at the fire. One camera, two people, click to
 *            advance — the card mechanic pointed at faces instead of text.
 *   leave    Ingram whistles two notes and walks off into the dark.
 *   rise     Kai gets up; control returns — third person from here on, the
 *            camera behind him, so his whole body is always on screen.
 *   walk     round the fire, then one long straight path up to the stone,
 *            the stone lit at the far end of it the whole way: cairns both
 *            sides, three gates, ruins, the stag, an owl. The forest is as
 *            loud as it will ever be — the walk is what the silence takes.
 *   choice   the scene turns him to face the horn first — he cannot be asked
 *            to take what he has not seen — then E takes it and Q gives him
 *            a moment of doubt and puts the prompt back, so taking it is
 *            always deliberate.
 *   take     E lifts the horn on camera — it leaves the cap, the glow wakes
 *            as it comes up into his hand, and the forest stops at the
 *            moment his grip closes.
 *   taken    it is in his hand and every ambient sound has stopped. The horn
 *            glows — the only cyan in the game.
 *   wide     the pull-back holds him alone at the stone with the lit horn,
 *            and the way out in the same frame, so the player works out the
 *            problem by looking at it. No pursuer is shown here — whoever
 *            the silence woke first appears in level 01, mid-run.
 *   flee     control returns and he runs, the camera behind him so his
 *            whole body shows where he is going, down a straight trail lined
 *            with cairns, through another gate, the dawn turning into level
 *            01's morning around him.
 *
 * It is dawn the whole scene — the grey before sunrise, light enough to see
 * faces and the path — and it brightens into level 01's morning on the run.
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

// The geography: the camp at the south, a short bend round the fire, then
// one long straight path north up through the trees to the glade where the
// stone stands; and from the glade one straight trail east, down the
// mountain — the way out, and where level 01 starts.
// Everywhere Kai can stand is a circle or a strip of path (_clampWalk).
const SEAT = { x: 0, z: 10.8 };            // on the log, feet to the fire
const FIRE = { x: 0, z: 7.9 };
const INGRAM_AT = { x: -1.0, z: 6.3 };     // across the flames, off the fire line
const WALKOFF = { x: -9.6, z: 3.2 };       // where Ingram leaves the fire
const CAMP = { x: 0, z: 8.4, r: 6.0 };
// the old path to the stone: round the fire on the left, then dead straight
// for ~50 m, so from the first step the stone is at the end of it
const PATH_END_Z = -48;
const WALK_PTS = [[-1.6, 10.0], [-2.5, 7.6], [-1.3, 4.6], [0, 1.2], [0, -4], [0, PATH_END_Z + 4], [0, PATH_END_Z]];
const PATH_HW = 1.6;                       // half-width of the walkable path
const GLADE = { x: 0, z: PATH_END_Z - 4.6, r: 5.0 };
const STONE = { x: 0, z: GLADE.z - 2.0 };  // the low stone, horn on it
const STAG_AT = { x: 4.6, z: -27 };        // the stag statue, halfway up
const GATE_ZS = [-1.5, -24, PATH_END_Z];   // the three gates on the way up
// the way out: dead straight, east from the glade. Lined with cairns both
// sides and a gate near the start, so there is never a question where to run.
const RUN_Z = GLADE.z + 0.8;
const RUN_FROM = { x: 0, z: RUN_Z };
const RUN_TO = { x: 54, z: RUN_Z };
const RUN_HW = 2.3;
const RUN_EXIT_X = 46;                     // level 01 starts here
const RUN_YAW = -Math.PI / 2;              // facing +X, down the trail
const WALK = 2.6;         // the walk clip's own pace is 1.6 m/s; 1.6x reads as purposeful
const RUN = 5.2;          // once he has the horn — he is not strolling out
const LOOK = 0.0022;

// how light it is: the dawn the scene opens on, how far it has come by the
// time he reaches the stone, and level 01's morning (1) by the end of the run
const DAWN_START = 0.55;
const DAWN_AT_STONE = 0.68;

// the camera from the moment he stands up: behind him and a little above,
// so his whole body is in frame and the way ahead of him too. It is pulled
// in rather than pushed through the trees (_chaseBack).
const CHASE_BACK = 4.8;
const CHASE_HIGH = 2.3;
const CHASE_AHEAD = 4.0;
const CAM_CLEAR = 0.8;    // how far past the route's edge the camera may go
// at the stone: over his right shoulder, low and close, on the horn
const SHOULDER = { back: 2.8, side: 1.4, high: 2.4 };
const WIDE_TURN = 2.5;    // into the wide shot, when he turns to the trail

// the pull-back vantage: high to the south-west of the glade, looking east —
// Kai at the stone with the horn lit, the straight trail and its gate running
// away from him in the same frame. One frame, the whole problem.
const WIDE_POS = new THREE.Vector3(-6.0, 4.4, GLADE.z + 6.2);
const WIDE_LOOK = new THREE.Vector3(8.0, 0.6, GLADE.z + 0.2);

// the conversation two-shot: behind Kai's right shoulder at the log — him
// lower-centre, Ingram across the flames, the fire between. The title, the
// whole conversation and Ingram's exit play on this one locked-off camera,
// then rise cuts to behind him exactly when control comes back.
const SHOT_POS = new THREE.Vector3(0.9, 1.55, 13.4);
const SHOT_LOOK = new THREE.Vector3(-1.0, 1.25, 6.3);
const RISE_CUT = 1.0;  // rise holds the two-shot until here, then cuts

const HORN_CYAN = 0x4fd6e0;  // the horn — matches how the level 01 pickup glows
const CAIRN_GLOW = 0xb6e3a0; // the old markers: pale moss, never the horn's cyan
const HORN_HEX = '#4fd6e0';
const INGRAM_AMBER = '#ffb03a';  // the fire, then the lamp
const KAI_GREEN = '#9ed36a';
const CREAM = '#f2e8d5';

// Night -> dawn. The dawn end of every pair below is level 01's exact morning
// palette (Level01.init: fog 0xcfd6a8/0.014, hemi 0xbfdcff/0x4a5a26, sun
// 0xffd29a), so the cut into the trail run is a continuation, not a jump.
// "Bring me the horn before the sun is up" — the scene opens at first
// light (DAWN_START), and the sun is up by the end of the run.
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
// Plain on purpose: the company wants the trees; its men won't pass the
// stone because the last crew that did never came back; the horn is what
// keeps the forest and the valley's water alive, which is why Kai should
// leave it; Ingram wants it gone so the cutting can start, and pays him.
const SCRIPT = [
  { who: 'INGRAM', text: 'Kai. You came.' },
  { who: 'INGRAM', text: 'You know the old stone, up past the ridge?' },
  { who: 'KAI', text: 'The one with the horn on it. Everyone knows it.' },
  { who: 'INGRAM', text: "The company wants to cut down this forest. But their men won't go past that stone." },
  { who: 'KAI', text: 'Can you blame them? The last crew that went past it never came back.' },
  { who: 'KAI', text: 'That horn is what keeps this forest alive. The animals, the springs every village in the valley drinks from.' },
  { who: 'KAI', text: 'They say if it ever leaves the stone, the whole forest goes silent.' },
  { who: 'INGRAM', text: 'Old stories. Bring me the horn before the sun is up. No horn, nothing left to scare the men — and the cutting can start.' },
  { who: 'KAI', text: 'You want them to cut it down?' },
  { who: 'INGRAM', text: "It's coming either way. This way, you get a year of the company's wages for one morning." },
  { who: 'KAI', text: 'Why me?' },
  { who: 'INGRAM', text: 'Because a guide out on the paths at dawn is a normal thing. Anyone else would be noticed.' },
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
    this.owlT = 2.0;
    this.owls = false;      // owls call once he is out on the path
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
    // Loud enough to matter. The silence is the scene's whole point, and a
    // whisper cutting out is not a silence — the forest has to fill the
    // valley before it can stop.
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.06;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.start(); lfo.start();
    g.gain.linearRampToValueAtTime(0.13, t + 2.5);
    this.tone = g; this.toneSrc = src;
  }

  /** Night life, called from update(): one insect chirp. */
  _insect() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2600 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // three fast pulses — a cricket, not a beep
    for (const [d, a] of [[0, 0.05], [0.055, 0.062], [0.11, 0.042]]) {
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
    o.frequency.setValueAtTime(142, t);
    o.frequency.exponentialRampToValueAtTime(94, t + 0.22);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0002, t + 0.3);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(lp); lp.connect(g);
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(this.master); }
    else g.connect(this.master);
    o.start(t); o.stop(t + 0.34);
  }

  /** An owl somewhere up in the trees: two soft falling hoots. */
  owl() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; lp.connect(pan); pan.connect(this.master); }
    else lp.connect(this.master);
    for (const [d, f, dur] of [[0, 410, 0.34], [0.52, 396, 0.56]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + d);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + d + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.06, t + d + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0004, t + d + dur);
      o.connect(g); g.connect(lp);
      o.start(t + d); o.stop(t + d + dur + 0.05);
    }
  }

  /** Called every frame from update() — schedules the night life. */
  tickNight(dt) {
    if (!this.ctx || this.muted || !this.alive) return;
    this.chirpT -= dt;
    if (this.chirpT <= 0) { this.chirpT = 0.4 + Math.random() * 1.9; this._insect(); }
    this.frogT -= dt;
    if (this.frogT <= 0) { this.frogT = 3.2 + Math.random() * 5.2; this._frog(); }
    if (this.owls) {
      this.owlT -= dt;
      if (this.owlT <= 0) { this.owlT = 7 + Math.random() * 6; this.owl(); }
    }
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
    const a = (0.014 + Math.random() * 0.03) * this.firePower;
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
    const ctx = this.ctx, t = this.t;
    if (this.tone) this.tone.gain.cancelScheduledValues(t);
    if (this.tone) this.tone.gain.setValueAtTime(this.tone.gain.value, t);
    if (this.tone) this.tone.gain.linearRampToValueAtTime(0, t + 0.06);
    // the bottom falling out of the night — one soft sub swell into
    // nothing, so the cut is something you feel and not just notice
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.2);
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

/* ==========================================================================
   The route. Every place Kai can stand is one of these: a strip of path
   (a segment with a half-width) or a circle (a segment of zero length).
   ========================================================================== */
const strip = (ax, az, bx, bz, r) => ({ ax, az, bx, bz, r });
const ring = (c) => strip(c.x, c.z, c.x, c.z, c.r);
const _near = { x: 0, z: 0, d: 0 };

/** Nearest point of a shape's spine to (x, z), and how far it is. */
function nearSpine(sh, x, z) {
  const ex = sh.bx - sh.ax, ez = sh.bz - sh.az;
  const L2 = ex * ex + ez * ez;
  const k = L2 > 0 ? THREE.MathUtils.clamp(((x - sh.ax) * ex + (z - sh.az) * ez) / L2, 0, 1) : 0;
  _near.x = sh.ax + ex * k;
  _near.z = sh.az + ez * k;
  _near.d = Math.hypot(x - _near.x, z - _near.z);
  return _near;
}

/** How far outside the nearest shape (x, z) is: ≤ 0 means inside one. */
function outside(shapes, x, z) {
  let best = Infinity;
  for (const sh of shapes) best = Math.min(best, nearSpine(sh, x, z).d - sh.r);
  return best;
}

/** An angle difference brought into -PI..PI, so turns go the short way round. */
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * A flat ribbon of path along a polyline, `hw` either side. The UVs keep the
 * mud texture at the same ~1.4 m tile the old straight path had.
 */
function ribbon(points, hw) {
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    if (i > 0) s += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    pos.push(p.x + nx * hw, 0, p.z + nz * hw, p.x - nx * hw, 0, p.z - nz * hw);
    uv.push(0, s / 28, (hw * 2) / 3.36, s / 28);
    if (i > 0) {
      const j = i * 2;
      idx.push(j - 2, j, j - 1, j - 1, j, j + 1);   // wound to face up
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ========================================================================== */
export class Prologue extends Level {
  constructor() {
    super('prologue');

    this.px = SEAT.x;
    this.pz = SEAT.z;
    this.yaw = 0;                 // yaw 0 looks down -Z, across the fire
    this.pitch = 0.06;            // the camera's tilt, from the mouse
    this.locked = false;
    this.standing = false;        // may he walk?
    this.seated = true;           // still on the log (clamps how far he turns)
    this.cine = 0;                // 0 = behind him, 1 = the wide shot
    this._camBack = CHASE_BACK;   // how far behind him the camera is, after the trees
    this._shoulder = 0;           // 0 = behind him, 1 = over his shoulder at the stone

    this.phase = 'title';
    this.t = 0;
    this.leaving = false;
    this.scriptIndex = -1;        // which conversation line is up
    this.doubted = false;         // said the doubt line yet?
    this._aimed = false;          // has the scene turned him to the horn yet?
    this._aimSaid = false;
    this._skySaid = false;        // said the sky-is-turning line yet?
    this._aimFromYaw = 0;
    this._aimFromHeading = 0;
    this.walkS = 0;               // furthest he has got along the path, metres
    this.beats = {};              // the walk's thoughts, each said once
    this.heading = 0;             // which way his body faces (yaw convention)
    this._fled = false;           // has the run started? (the chase camera)
    this._moving = false;
    this._moveYaw = 0;
    this.beatT = 0;               // counts down to the next heartbeat
    this.dawnK = DAWN_START;      // 0 = night, 1 = level 01's morning
    this._dawnApplied = -1;
    this._dawnTmp = new THREE.Color();  // scratch colour for _applyDawn()

    this.says = [];
    this.sayT = 0;
    this._shotT = 0;              // the two-shot's own clock, for the drift
    this._kaiSeated = false;      // told the rig to sit to the fire
    this._kaiRose = false;        // told the rig to stand at the cut

    // the take: where the horn leaves, and where it lands in his hand
    this._takeFromPos = new THREE.Vector3();
    this._takeFromQuat = new THREE.Quaternion();
    this._takeLightPos = new THREE.Vector3();
    this._carryQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.3, 0.2));
    this._takeTo = new THREE.Vector3();
    this._takeToQuat = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);

    this.blockers = [];
    this.sfx = new Sfx();
    this._buildRoute();
  }

  /**
   * The walk path as ~65 short strips along a smoothed curve through
   * WALK_PTS, and the shape lists the movement clamp and the tree placement
   * use. During the run only the glade and the straight trail are open, so
   * there is nowhere to go but the right way.
   */
  _buildRoute() {
    const curve = new THREE.CatmullRomCurve3(
      WALK_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal',
    );
    const N = 80;
    this.walkLen = curve.getLength();
    this.walkPath = curve.getSpacedPoints(N).map((p, i) => ({ x: p.x, z: p.z, s: (i / N) * this.walkLen }));
    const strips = [];
    for (let i = 1; i < this.walkPath.length; i++) {
      const a = this.walkPath[i - 1], b = this.walkPath[i];
      strips.push(strip(a.x, a.z, b.x, b.z, PATH_HW));
    }
    const run = strip(RUN_FROM.x, RUN_FROM.z, RUN_TO.x, RUN_TO.z, RUN_HW);
    this.walkShapes = [ring(CAMP), ring(GLADE), ...strips];
    this.fleeShapes = [ring(GLADE), run];
    // what the forest keeps clear of: the route, the trail running on out
    // of sight past the exit, Ingram's way out of the camp, the space behind
    // the log where the camera starts, and the wide shot's camera and its
    // line to the stone
    this.clearShapes = [
      ...this.walkShapes,
      strip(RUN_FROM.x, RUN_FROM.z, RUN_TO.x + 40, RUN_TO.z, RUN_HW),
      strip(INGRAM_AT.x, INGRAM_AT.z, WALKOFF.x * 1.4, WALKOFF.z * 0.6, 1.1),
      strip(SEAT.x, SEAT.z, SEAT.x + 2, SEAT.z + 5, 1.8),
      strip(WIDE_POS.x, WIDE_POS.z, GLADE.x, GLADE.z + 0.6, 1.9),
    ];
  }

  /** Where he is along the walk path: the nearest sample's distance, metres. */
  _pathS(x, z) {
    let best = Infinity, s = 0;
    for (const p of this.walkPath) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) { best = d; s = p.s; }
    }
    return s;
  }

  /** A point on the walk path `ahead` metres past where he is (the prompt arrow aims at it). */
  _pathAhead(ahead) {
    const want = Math.max(this.walkS, this._pathS(this.px, this.pz)) + ahead;
    for (const p of this.walkPath) if (p.s >= want) return p;
    return STONE;
  }

  /* ==================================================== build */
  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(NIGHT.fog, NIGHT.fogDensity);

    this._ensureSerif();
    this._buildSky();
    const [kit, cast] = await Promise.all([loadJungleKit(assets), loadCast(assets)]);
    if (!this.scene) return; // torn down while loading
    const mats = await createJungleMaterials(assets, 60);
    if (!this.scene) return;
    this.kit = kit;
    this.mats = mats;
    this._buildGround();
    this._buildFire();
    this._buildStone();
    this._buildJungle();
    this._buildMarkers();
    this._buildFigures(cast);
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

    // the whole scene is at first light: grey-gold, and enough to see by
    this._applyDawn(this.dawnK);
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
    // the click-hint pulse is one tiny stylesheet, shared by every visit
    if (!document.getElementById('prologue-pulse')) {
      const st = document.createElement('style');
      st.id = 'prologue-pulse';
      st.textContent = '@keyframes prologuePulse{0%,100%{opacity:1}50%{opacity:.4}}';
      document.head.appendChild(st);
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

    // ground mist, soft cards lying in the hollows along the route
    this.mist = [];
    const mistMat = () => new THREE.MeshBasicMaterial({
      color: 0x8fa4b4, transparent: true, opacity: 0.05, depthWrite: false,
    });
    for (const [x, z, w, rot] of [
      [-2.5, 2, 10, 0.4], [2, -12, 11, 1.2], [-1.5, -26, 9, 2.2], [2, 9, 9, 0.1],
      [1, -38, 10, 1.6], [0, GLADE.z, 12, 1.8], [17, RUN_Z, 13, 0.1], [33, RUN_Z + 0.4, 12, 1.7],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.32), mistMat());
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot;
      m.position.set(x, 0.55, z);
      this.root.add(m);
      this.mist.push(m);
    }

    // fireflies, thickest along the path and in the glade. One Points cloud,
    // opacity pulsing in update(). They keep going after the silence — the
    // valley is not dead, it is holding still.
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = i % 4 === 0
        ? { x: GLADE.x, z: GLADE.z }
        : this.walkPath[Math.floor(Math.random() * this.walkPath.length)];
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 5;
      pos[i * 3] = p.x + Math.cos(a) * r;
      pos[i * 3 + 1] = 0.4 + Math.random() * 2.6;
      pos[i * 3 + 2] = p.z + Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflyMat = new THREE.PointsMaterial({
      color: 0xbfe08a, size: 0.07, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.fireflies = new THREE.Points(geo, this.fireflyMat);
    this.root.add(this.fireflies);

    // god rays through the canopy, growing with the dawn: down the straight
    // path, stepping him up it, and on the run trail, so the morning is
    // where he is going
    this.shafts = [];
    for (const [x, z, w] of [
      [-1.4, -8, 2.2], [1.8, -20, 2.2], [-1.2, -32, 2.2], [1.6, -42, 2.2],
      [12, RUN_Z + 2.2, 2.4], [24, RUN_Z - 2, 2.6], [36, RUN_Z + 1.8, 2.2], [46, RUN_Z - 1.2, 2.8],
    ]) {
      const shaft = createLightShaft(w, 0xffe2b0, 0);
      shaft.position.set(x, 15, z);
      this.root.add(shaft);
      this.shafts.push(shaft);
    }

    // the first sun down through a gap in the canopy, onto the stone: the
    // one bright thing at the end of the path, there from the first step
    this.moonShaft = createLightShaft(3.4, 0xe8e0c8, 0.09);
    this.moonShaft.position.set(STONE.x, 15, STONE.z + 0.6);
    this.root.add(this.moonShaft);
  }

  /* ---------------------------------------------------- ground */
  _buildGround() {
    // forest floor under the whole route. The circle is far bigger than the
    // old clearing's, so its UVs are scaled to keep the same tile size.
    const groundGeo = new THREE.CircleGeometry(110, 56);
    const uv = groundGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3.7, uv.getY(i) * 3.7);
    const ground = new THREE.Mesh(groundGeo, this.mats.forest);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(20, -0.05, -24);
    ground.receiveShadow = true;
    this.root.add(ground);

    // the old path, worn into the floor from the camp up to the glade
    const walk = new THREE.Mesh(ribbon(this.walkPath, PATH_HW - 0.15), this.mats.trail);
    walk.position.y = 0.012;
    walk.receiveShadow = true;
    this.root.add(walk);

    // the trail down the mountain: one straight road out of the glade that
    // keeps going past the exit, so it reads as a way and not a dead end
    const run = new THREE.Mesh(
      ribbon([{ x: RUN_FROM.x, z: RUN_FROM.z }, { x: RUN_TO.x + 40, z: RUN_TO.z }], RUN_HW - 0.2),
      this.mats.trail,
    );
    run.position.y = 0.014;
    run.receiveShadow = true;
    this.root.add(run);

    // the trampled ground around the fire, where the ground is just earth
    const apron = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), this.mats.trail);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(FIRE.x, 0.02, FIRE.z);
    apron.receiveShadow = true;
    this.root.add(apron);

    // and round the stone, where the valley has walked up to look at it
    const worn = new THREE.Mesh(new THREE.CircleGeometry(3.6, 24), this.mats.trail);
    worn.rotation.x = -Math.PI / 2;
    worn.position.set(GLADE.x, 0.016, GLADE.z);
    worn.receiveShadow = true;
    this.root.add(worn);

    // the far end of the trail: the first warm light of the morning, where
    // the forest opens. It grows with the dawn — the run is toward it.
    this.exitLight = new THREE.PointLight(0xffd29a, 0, 20, 2);
    this.exitLight.position.set(RUN_EXIT_X + 2, 3.2, RUN_TO.z);
    this.root.add(this.exitLight);
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

    // ---- the horn. One clean curl of pale keratin lying on the cap the
    //      way a tool is laid down: resting on its belly, both ends arcing
    //      up. The old one was a torus and a cone, and it looked like
    //      exactly that. Ivory with a soft sheen, so the light finds it.
    this.matHorn = new THREE.MeshStandardMaterial({
      color: 0xb3a488, roughness: 0.32, metalness: 0.05, emissive: 0x000000,
      side: THREE.DoubleSide,
    });
    const horn = new THREE.Mesh(this._hornGeometry(), this.matHorn);
    horn.position.set(0.1, 0.95, -0.04);
    horn.rotation.set(-1.5, 0.2, 0);
    g.add(horn);
    this.horn = horn;

    this.hornLight = new THREE.PointLight(HORN_CYAN, 0, 5.5, 2);
    this.hornLight.position.set(0.05, 1.05, -0.08);
    g.add(this.hornLight);

    // a soft fill, parked over the stone. The fire is far behind him by now
    // — without this the horn is a shadow under the trees, and the choice
    // at the stone would be about something the player never saw.
    this.stoneLight = new THREE.PointLight(0x9fb4cc, 1.6, 8, 2);
    this.stoneLight.position.set(0, 2.4, 0);
    g.add(this.stoneLight);

    // Once he lifts it, the horn and its light move into here, and this group
    // follows him for the rest of the scene. The cyan has to travel with Kai
    // — it is on him in the wide shot, and it is how he looks arriving in
    // level 01.
    this.carried = new THREE.Group();
    this.root.add(this.carried);
  }

  /**
   * The horn's shape: a round tube swept along a bending spine, fat at the
   * base and tapering to a fine point — a kudu curl in one piece, resting
   * on its belly (the geometry is shifted so its lowest point is y 0).
   */
  _hornGeometry() {
    const RINGS = 30, SIDES = 12, SWEEP = 0.28, A0 = -2.3, A1 = 1.6;
    const baseY = SWEEP * (1 - Math.cos(A0));
    const pos = [], nor = [], idx = [];
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const a = A0 + (A1 - A0) * t;
      const px = SWEEP * Math.sin(a);
      const py = SWEEP * (1 - Math.cos(a)) - baseY;
      const r = 0.045 * Math.pow(1 - t, 1.15) + 0.003;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let s = 0; s <= SIDES; s++) {
        const b = (s / SIDES) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
        pos.push(px + ca * cb * r, py + sa * cb * r, sb * r);
        nor.push(ca * cb, sa * cb, sb);
      }
    }
    for (let i = 0; i < RINGS; i++) {
      for (let s = 0; s < SIDES; s++) {
        const a0 = i * (SIDES + 1) + s, b0 = a0 + SIDES + 1;
        idx.push(a0, a0 + 1, b0, b0 + 1, b0, a0 + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.min.y, 0);   // rest on the belly
    return geo;
  }

  /* ---------------------------------------------------- everything solid */
  _buildBlockers() {
    const add = (x0, x1, z0, z1) => this.blockers.push({ x0, x1, z0, z1 });
    add(FIRE.x - 0.8, FIRE.x + 0.8, FIRE.z - 0.8, FIRE.z + 0.8);          // the fire
    add(STONE.x - 1.1, STONE.x + 1.1, STONE.z - 1.0, STONE.z + 1.0);      // the stone
  }

  /* ---------------------------------------------------- the jungle round it */
  /**
   * The forest closes in on the route from both sides: trees on a jittered
   * grid wherever they are a little way off the route (never on it), a band
   * of undergrowth right at its edges, and rocks between. So the way is
   * always the open ground, and everything else is trees.
   */
  _buildJungle() {
    const trees = [this.kit.tree1, this.kit.tree2, this.kit.tree3, this.kit.tree4, this.kit.ruinTree];
    const bushes = [this.kit.bush1, this.kit.bush2, this.kit.bush3];
    const grasses = [this.kit.grass1, this.kit.grass2, this.kit.grass3];
    const clear = this.clearShapes;
    let seed = 4711;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // the forest is a few hundred copies of a dozen models: collected here
    // and drawn instanced at the end (_scatter), not one clone apiece
    const plant = new Map();
    const put = (proto, x, y, z, s, ry) => {
      if (!plant.has(proto)) plant.set(proto, []);
      plant.get(proto).push([x, y, z, s, ry]);
    };

    let n = 0;
    for (let gx = -24; gx <= 72; gx += 4.8) {
      for (let gz = -72; gz <= 28; gz += 4.8) {
        const x = gx + (rnd() - 0.5) * 3.2, z = gz + (rnd() - 0.5) * 3.2;
        const out = outside(clear, x, z);
        if (out < 1.5 || out > 9.5) continue;
        put(trees[n++ % trees.length], x, -0.05, z, 0.021 + rnd() * 0.014, rnd() * Math.PI * 2);
      }
    }

    // undergrowth right along the edges, so the line of the path is drawn
    // in leaves as well as in mud
    let b = 0;
    for (let gx = -16; gx <= 64; gx += 2.7) {
      for (let gz = -64; gz <= 20; gz += 2.7) {
        const x = gx + (rnd() - 0.5) * 2, z = gz + (rnd() - 0.5) * 2;
        const out = outside(clear, x, z);
        if (out < 0.3 || out > 2.4 || rnd() < 0.3) continue;
        const set = b++ % 3 === 0 ? grasses : bushes;
        put(set[b % set.length], x, 0, z, 0.01 + rnd() * 0.006, rnd() * Math.PI * 2);
      }
    }
    for (let i = 0, tries = 0; i < 30 && tries < 500; tries++) {
      const x = -14 + rnd() * 76, z = -62 + rnd() * 78;
      const out = outside(clear, x, z);
      if (out < 0.6 || out > 4) continue;
      put(this.kit['rock' + (1 + (i % 3))], x, -0.15, z, 0.011 + rnd() * 0.007, rnd() * Math.PI * 2);
      i++;
    }
    for (const [proto, list] of plant) this._scatter(proto, list);

    // relics the path keeps meeting — the valley was lived in long before
    // anyone cut a line through it: a pair of columns either side of the
    // way, a dead tree, the stag watching the halfway gate, a second pair
    // of columns, and the fox watching the stone
    placeProp(this.root, cloneProp(this.kit.column), -4.2, 0, -9, { s: 0.014, ry: 0.2 });
    placeProp(this.root, cloneProp(this.kit.columnShort), 4.2, 0, -11.5, { s: 0.012, ry: 1.4 });
    placeProp(this.root, cloneProp(this.kit.deadTree), 4.6, 0, -17, { s: 0.02, ry: 1.1 });
    placeProp(this.root, cloneProp(this.kit.stag), STAG_AT.x, 0, STAG_AT.z, { s: 0.0105, ry: -1.3 });
    placeProp(this.root, cloneProp(this.kit.column), -4.2, 0, -36, { s: 0.014, ry: 2.3 });
    placeProp(this.root, cloneProp(this.kit.columnShort), 4.2, 0, -38.5, { s: 0.012, ry: 0.6 });
    placeProp(this.root, cloneProp(this.kit.fox), -4.6, 0, GLADE.z - 2.6, { s: 0.0105, ry: 0.9 });
  }

  /**
   * Every copy of one model as instanced meshes — one per mesh inside the
   * model, so a tree costs its few materials once for the whole forest
   * instead of once per tree. `list` is [x, y, z, scale, yaw] per copy.
   */
  _scatter(proto, list) {
    if (!proto || !list.length) return;
    proto.updateMatrixWorld(true);
    const toProto = new THREE.Matrix4().copy(proto.matrixWorld).invert();
    const place = new THREE.Matrix4(), rel = new THREE.Matrix4(), m = new THREE.Matrix4();
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), sc = new THREE.Vector3();
    proto.traverse((o) => {
      if (!o.isMesh) return;
      rel.multiplyMatrices(toProto, o.matrixWorld);
      const inst = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      list.forEach(([x, y, z, s, ry], i) => {
        place.compose(p.set(x, y, z), q.setFromAxisAngle(up, ry), sc.set(s, s, s));
        inst.setMatrixAt(i, m.multiplyMatrices(place, rel));
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = o.castShadow;
      inst.receiveShadow = o.receiveShadow;
      this.root.add(inst);
    });
  }

  /**
   * The old markers: knee-high stacks of stones with a pale moss glow on top,
   * in pairs both sides of the straight path and both sides of the run
   * trail, so the way reads from any distance. And gates: three on the way
   * up, the last into the glade, and one on the trail out — run through it.
   */
  _buildMarkers() {
    const spots = [];
    // the walk: a pair every 5 m up the straight, a stride outside its edges
    for (let s = 9; s < this.walkLen - 2; s += 5) {
      const i = Math.min(this.walkPath.length - 2, Math.round((s / this.walkLen) * (this.walkPath.length - 1)));
      const a = this.walkPath[i], b = this.walkPath[i + 1];
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / tl, nz = (b.x - a.x) / tl;
      for (const side of [1, -1]) {
        spots.push([a.x + nx * (PATH_HW + 0.35) * side, a.z + nz * (PATH_HW + 0.35) * side]);
      }
    }
    // the run: both sides, all the way to the light
    for (let x = 6; x <= RUN_TO.x; x += 5) {
      spots.push([x, RUN_TO.z - RUN_HW - 0.35], [x, RUN_TO.z + RUN_HW + 0.35]);
    }

    const stoneGeo = new THREE.DodecahedronGeometry(1, 0);
    const stones = new THREE.InstancedMesh(stoneGeo, this.matRock, spots.length * 3);
    this.matCairn = new THREE.MeshStandardMaterial({
      color: 0x3d4a36, roughness: 0.8, emissive: CAIRN_GLOW, emissiveIntensity: 0.9,
    });
    const caps = new THREE.InstancedMesh(stoneGeo, this.matCairn, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const p = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    spots.forEach(([x, z], i) => {
      let y = 0;
      for (const r of [0.26, 0.2, 0.15]) {
        q.setFromEuler(e.set(i * 0.7, i * 1.3 + r * 9, 0));
        m.compose(p.set(x, y + r * 0.75, z), q, sc.set(r, r * 0.8, r));
        stones.setMatrixAt(k++, m);
        y += r * 1.35;
      }
      q.setFromEuler(e.set(0, i * 2.1, 0));
      m.compose(p.set(x, y + 0.06, z), q, sc.set(0.11, 0.09, 0.11));
      caps.setMatrixAt(i, m);
    });
    stones.castShadow = true;
    this.root.add(stones, caps);

    // the gates: the arch model sized to span the way, turned across it
    const proto = this.kit.gateArch;
    const size = new THREE.Box3().setFromObject(proto).getSize(new THREE.Vector3());
    const across = Math.max(size.x, size.z) || 1;
    const spanAlongX = size.x >= size.z;   // which way the model's opening faces
    for (const [x, z, yaw, width] of [
      ...GATE_ZS.map((z) => [0, z, Math.PI, PATH_HW * 2 + 2.4]),
      [9, RUN_Z, Math.PI / 2, RUN_HW * 2 + 2.6],
    ]) {
      const gate = cloneProp(proto);
      gate.scale.setScalar(width / across);
      gate.position.set(x, -0.05, z);
      gate.rotation.y = yaw + (spanAlongX ? 0 : Math.PI / 2);
      this.root.add(gate);
    }
  }

  /* ---------------------------------------------------- the two figures */
  /**
   * The game's own two characters (intros/cast.js): the Mixamo Kai, and the
   * Handler's build as Ingram — bare-faced, because this is the one time the
   * player sees him. Each stands in an outer group that the scene moves and
   * turns with the same yaw convention as the camera (0 = facing -Z).
   */
  _buildFigures(cast) {
    // ---- Ingram, across the fire. Lit by the flames — this is the one
    //      clear look the player gets, so he is NOT a silhouette here. ----
    this.ingram = new THREE.Group();
    this.ingram.position.set(INGRAM_AT.x, 0, INGRAM_AT.z);
    this.ingram.rotation.y = Math.PI;       // faces Kai across the flames
    this.root.add(this.ingram);
    const ing = this.ingramF = makeHandler(this.ingram, cast.handler, { helmet: false });
    ing.root.rotation.y = Math.PI;          // the rig faces +Z; the group's 0 is -Z
    // the boss's ember undertone belongs to the fight, not to a man at a fire
    for (const m of ing.materials) if (m.userData.baseEmissive) m.userData.baseEmissive.setHex(0x000000);

    // his lamp, hanging from one hand. Amber, like the fire, then the chase,
    // then the helmet coming off.
    this.matLamp = new THREE.MeshStandardMaterial({
      color: 0x777c70, roughness: 0.6, metalness: 0.4,
      emissive: 0xffb03a, emissiveIntensity: 0.6,
    });
    const lamp = new THREE.Group();
    lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 10), this.matLamp));
    this.ingramLampLight = new THREE.PointLight(0xffb03a, 2.2, 8, 2);
    this.ingramLampLight.position.y = 0.06;
    lamp.add(this.ingramLampLight);
    this._hang(ing, 'PalmL', lamp, 0.14, [0.42, 0.62, -0.1]);

    // ---- Kai himself. On screen in the fire two-shot, the wide pull-back
    //      and the whole run; hidden whenever the camera is his own eyes. ----
    this.kai = new THREE.Group();
    this.kai.visible = false;
    this.root.add(this.kai);
    const kai = this.kaiF = makeKai(this.kai, cast.kai);
    kai.root.rotation.y = Math.PI;
    if (kai.key) kai.key.visible = false;   // no Key in this story: no technology at all
    // the monk build has only a fighter's guard for an idle — a man talking
    // at a fire stands easy, so he borrows Kai's relaxed stance, and his walk
    this._lend(kai, ing, 'walk');
    this._lend(kai, ing, 'idle', true);
    ing.play('idle', { fade: 0 });

    // He sits to the fire, and the log goes where he sits: measured off his
    // hips in the sitting clip, so he is on it and not floating over it.
    this.kai.position.set(SEAT.x, 0, SEAT.z + 0.3);
    let seatY = 0.44, seatZ = SEAT.z + 0.35, seatX = SEAT.x;
    if (kai.actions.sitting) {
      kai.play('sitting', { fade: 0 });
      kai.update(0.01);
      this.kai.updateMatrixWorld(true);
      const hips = kai.bone('Hips');
      if (hips) {
        const h = hips.getWorldPosition(new THREE.Vector3());
        seatY = h.y - 0.1;
        seatX = h.x;
        seatZ = h.z + 0.04;
      }
    }
    const R = 0.2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.1, 1.5, 9), this.matWood);
    log.rotation.z = Math.PI / 2;
    log.position.set(seatX, Math.max(R, seatY - R), seatZ);
    log.castShadow = true;
    log.receiveShadow = true;
    this.root.add(log);
    this._buildBlockers();
  }

  /**
   * Parent a prop to a bone so it moves with the hand, undoing the rig's
   * scale so the prop keeps its size. `reach` sets it out along the bone
   * (a Mixamo hand's +Y runs down the fingers); with no bone (the capsule
   * stand-in) it sits at `fallback` on the body.
   */
  _hang(fighter, boneName, obj, reach, fallback) {
    const b = fighter.bone(boneName);
    if (b) {
      fighter.root.updateMatrixWorld(true);
      const s = b.getWorldScale(new THREE.Vector3()).x || 1;
      obj.scale.setScalar(1 / s);
      obj.position.set(0, reach / s, 0);
      b.add(obj);
    } else {
      obj.position.set(...fallback);
      fighter.pivot.add(obj);
    }
  }

  /**
   * Ingram borrows clips from Kai. Both are on the same Mixamo skeleton,
   * so he takes the rotations (not the hip travel — the two builds are not
   * the same size): the walk the monk build lacks, and with `replace` the
   * relaxed idle in place of his fighting guard.
   */
  _lend(from, to, name, replace = false) {
    if ((to.actions[name] && !replace) || !from.actions[name] || !to.mixer) return;
    const clip = from.actions[name].getClip();
    const tracks = clip.tracks.filter((t) =>
      t.name.endsWith('.quaternion') && to.bones[t.name.slice(0, -'.quaternion'.length)]);
    if (!tracks.length) return;
    const old = to.actions[name];
    if (old) {
      old.stop();
      if (to.current === old) { to.current = null; to.currentName = null; }
    }
    to.actions[name] = to.mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
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

    // the title, over the live fire. Warm serif letters, nothing else. It
    // sits high in the frame so it never lands on either face in the
    // two-shot, and the click hint pulses — it is the door into the scene.
    this.hud.title = mk(
      base + ';left:0;right:0;top:18%;text-align:center;opacity:0;' +
      'transition:opacity 2.4s',
      `<div style="${SERIF};color:${CREAM};font-size:46px;font-weight:600;` +
      'letter-spacing:.3em;text-shadow:0 0 28px rgba(255,176,58,.4), 0 2px 18px rgba(0,0,0,.9)">' +
      'BLACKOUT PROTOCOL</div>' +
      `<div style="color:#cfd6c4;font-size:14px;letter-spacing:.34em;margin-top:24px;${SERIF};` +
      'text-shadow:0 2px 12px rgba(0,0,0,.95);animation:prologuePulse 2.2s ease-in-out infinite">' +
      'CLICK TO BEGIN</div>',
    );

    // the conversation. The text stands on whoever is speaking — in the
    // two-shot, Ingram's lines float at his head across the fire, Kai's sit
    // on him at the log — so the speaker is never in doubt. The name is in
    // that character's colour; the line in cream serif; no box, just shadows.
    this.hud.sub = mk(
      base + ';left:50%;top:33%;transform:translate(-50%,-50%);width:min(560px,80vw);' +
      'text-align:center;opacity:0;transition:left .45s ease, top .45s ease, opacity .3s',
    );
    this.hud.subName = document.createElement('div');
    this.hud.subName.style.cssText =
      `${SERIF};font-size:16px;font-weight:600;letter-spacing:.5em;margin-bottom:8px;` +
      'text-shadow:0 1px 10px rgba(0,0,0,.95), 0 0 26px rgba(0,0,0,.8)';
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
    if (line.who === 'INGRAM') {
      // his words, at his head across the fire
      this.hud.sub.style.left = '50%';
      this.hud.sub.style.top = '33%';
      this.hud.shade.style.opacity = '0';   // no bottom band needed up there
    } else {
      // Kai's words, on Kai — measured on his back in the two-shot, where
      // he sits at the left of frame (his head stays clear above the text)
      this.hud.sub.style.left = '30%';
      this.hud.sub.style.top = '80%';
      this.hud.shade.style.opacity = '1';
    }
    this.hud.sub.style.opacity = '1';
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
    this._moving = len > 0;
    if (this._moving) this._moveYaw = Math.atan2(-dx, -dz);
    this._clampWalk();
  }

  /**
   * Keep him on the route: inside the camp, the path, or the glade — and
   * during the run only the glade and the straight trail. Off it, he is
   * put back on the nearest edge, so he slides along it instead of sticking.
   */
  _clampWalk() {
    const shapes = this.phase === 'flee' ? this.fleeShapes : this.walkShapes;
    let best = Infinity, bx = 0, bz = 0, bd = 1, br = 0;
    for (const sh of shapes) {
      const n = nearSpine(sh, this.px, this.pz);
      const out = n.d - sh.r;
      if (out <= 0) return;
      if (out < best) { best = out; bx = n.x; bz = n.z; bd = n.d; br = sh.r; }
    }
    const k = (br - 0.001) / bd;
    this.px = bx + (this.px - bx) * k;
    this.pz = bz + (this.pz - bz) * k;
  }

  _look() {
    this.yaw -= this.input.mouse.dx * LOOK;
    this.pitch -= this.input.mouse.dy * LOOK;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.35, 0.5);
    // on the log he can glance around, but he cannot spin on the spot
    if (this.seated) this.yaw = THREE.MathUtils.clamp(this.yaw, -1.0, 1.0);
  }

  /** Pointer lock refused (sandboxed iframe etc.) — play on without it. */
  _playUnlocked() {
    if (this.locked) return;
    this.locked = true;
    if (this.hud && this.hud.lock) this.hud.lock.style.opacity = '0';
  }

  /** Screen-space arrow toward a point, relative to where he (or the chase camera) looks. */
  _arrowTo(tx, tz) {
    let d = this._yawTo(tx, tz) - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.55) return '&uarr;';
    if (Math.abs(d) > 2.6) return '&darr;';
    return d > 0 ? '&larr;' : '&rarr;';
  }

  /** Down the trail: aim a few metres ahead of him along it, never back at the glade. */
  _trailArrow() { return this._arrowTo(Math.max(this.px + 6, RUN_FROM.x + 8), RUN_TO.z); }
  _pathArrow() {
    const p = this._pathAhead(4);
    return this._arrowTo(p.x, p.z);
  }

  /** Yaw that points the camera at a place, from where he is standing. */
  _yawTo(tx, tz) {
    return Math.atan2(-(tx - this.px), -(tz - this.pz));
  }

  _yawToStone() { return this._yawTo(STONE.x, STONE.z); }

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
    if (this.moonShaft) this.moonShaft.material.uniforms.uOpacity.value = 0.09;
    if (this.exitLight) this.exitLight.intensity = 2 + 10 * k;
    if (this.matCairn) this.matCairn.emissiveIntensity = 0.9 * (1 - k * 0.6);
  }

  /* ==================================================== key moments */
  /**
   * THE HORN, taken on camera. E starts the lift: the horn leaves the cap
   * and comes up into his hand over about a second, the glow waking as it
   * goes. The silence lands when the take lands — the last full second of
   * forest sound is under his reaching for it.
   */
  _takeHorn(state) {
    this.phase = 'take';
    this.t = 0;
    this.standing = false;                    // the take has the controls
    this._moving = false;
    this.kaiF.play('idle', { fade: 0.25 });
    this._prompt('');
    this._hush();
    this.horn.getWorldPosition(this._takeFromPos);
    this.horn.getWorldQuaternion(this._takeFromQuat);
    this.hornLight.getWorldPosition(this._takeLightPos);
    this.root.attach(this.horn);              // off the stone; world pose kept
    this.root.attach(this.hornLight);
    this.matHorn.emissive.setHex(HORN_CYAN);
    this.matHorn.emissiveIntensity = 0;
    this.hornLight.intensity = 0;
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

  /** The conversation two-shot: title, talk, leave, and rise up to the cut. */
  _inFireShot() {
    return this.phase === 'title' || this.phase === 'talk' || this.phase === 'leave' ||
      (this.phase === 'rise' && this.t <= RISE_CUT);
  }

  /** At the stone: the camera comes in over his shoulder, onto the horn. */
  _atStone() {
    return this.phase === 'choice' || this.phase === 'take' || this.phase === 'taken';
  }

  _updateCamera(dt) {
    const cam = this.game.camera;
    const shot = this._inFireShot();

    // From the cut on, the camera is behind him and a little above: his
    // whole body, which way it is going, and the way ahead of it. The mouse
    // turns it and tilts it. Wherever a tree would come between, it is
    // pulled in toward him rather than pushed through the trunk.
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let back = CHASE_BACK;
    while (back > 1.5 && outside(this.clearShapes, this.px + s * back, this.pz + c * back) > CAM_CLEAR) {
      back -= 0.3;
    }
    // in fast (never sit inside a trunk), out slowly (no lurch past it)
    const rate = back < this._camBack ? 12 : 3;
    this._camBack += (back - this._camBack) * (1 - Math.exp(-rate * dt));
    this._fp.set(this.px + s * this._camBack, CHASE_HIGH - this.pitch * 1.2, this.pz + c * this._camBack);
    this._look3.set(this.px - s * CHASE_AHEAD, 1.0 + this.pitch * 2.5, this.pz - c * CHASE_AHEAD);

    // at the stone it comes in close over his right shoulder, on the horn
    const toShoulder = this._atStone() ? 1 : 0;
    this._shoulder += (toShoulder - this._shoulder) * (1 - Math.exp(-2.5 * dt));
    if (this._shoulder > 0.001) {
      const k = THREE.MathUtils.smoothstep(this._shoulder, 0, 1);
      this._dir.set(
        this.px + s * SHOULDER.back + c * SHOULDER.side,
        SHOULDER.high,
        this.pz + c * SHOULDER.back - s * SHOULDER.side,
      );
      this._fp.lerp(this._dir, k);
      this._look3.lerp(this._dir.set(STONE.x, 0.95, STONE.z), k);
    }

    // Kai is always on screen: at his log in the two-shot, and from the
    // cut on wherever he walks
    this.kai.visible = true;
    if (!shot) {
      this.kai.position.set(this.px, 0, this.pz);
      this.kai.rotation.y = this.heading;
    }

    let want;
    if (this.cine > 0) {
      const k = THREE.MathUtils.smoothstep(this.cine, 0, 1);
      cam.position.lerpVectors(this._fp, WIDE_POS, k);
      this._look3.lerp(WIDE_LOOK, k);
      cam.lookAt(this._look3);
      want = 62 + (68 - 62) * k;
      if (Math.abs(cam.fov - want) > 0.05) { cam.fov = want; cam.updateProjectionMatrix(); }
    } else if (shot) {
      // THE TWO-SHOT — one camera, two people. Locked off on its sticks,
      // breathing so slightly it reads as wind on the lens.
      cam.position.set(
        SHOT_POS.x + Math.sin(this._shotT * 0.11) * 0.05,
        SHOT_POS.y + Math.sin(this._shotT * 0.07) * 0.028,
        SHOT_POS.z,
      );
      this._look3.copy(SHOT_LOOK);
      if (this.phase === 'leave' && this.t > 1.4) {
        // let the camera follow Ingram a little way into the trees
        this._look3.lerp(this.ingram.position, 0.25);
      }
      cam.lookAt(this._look3);
      want = 46;
    } else {
      cam.position.copy(this._fp);
      cam.lookAt(this._look3);
      want = 62;
    }
    if (this.cine <= 0 && Math.abs(cam.fov - want) > 0.05) {
      cam.fov += (want - cam.fov) * 0.08;
      cam.updateProjectionMatrix();
    }

    // the dome is centred on whoever is looking at it
    this.sky.position.copy(cam.position);
  }

  /* ==================================================== update */
  update(dt, state) {
    this.t += dt;
    if (this._inFireShot()) this._shotT += dt;

    if (this.input.pressed('mute')) this.sfx.setMuted(!this.sfx.muted);
    if (this.input.pressed('skipScene') && !this.leaving) { this._exit(state); return; }

    if (!this._inFireShot() && this.cine <= 0 && this.phase !== 'take') this._look();
    this._tickSay(dt);
    if (this.standing && this.phase !== 'done') this._move(dt);

    // the forest is alive until the horn comes off the stone
    this.sfx.tickNight(dt);
    this.sfx.tickFire(dt);

    // fireflies pulse along the route; mist crawls
    this.fireflyMat.opacity = (0.55 + Math.sin(this.t * 1.7) * 0.25) * (1 - this.dawnK);
    for (const m of this.mist) m.rotation.z += dt * 0.012;

    this.kaiF.update(dt);
    this.ingramF.update(dt);

    // heartbeat, from the first touch of the horn
    if (this.phase === 'take' || this.phase === 'taken' || this.phase === 'wide' || this.phase === 'flee') {
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
      // The scene plays itself: fire, mist, the two-shot breathing. One click
      // starts the forest and hands the scene to Ingram.
      case 'title': {
        // the figures settle into the shot while the title holds
        if (!this._ingramIdled) { this._ingramIdled = true; this.ingramF.play('idle'); }
        if (!this._kaiSeated) { this._kaiSeated = true; this.kaiF.play('sitting'); }
        break;
      }

      // One camera, two people, click to advance — the card mechanic pointed
      // at faces instead of text. The locked two-shot holds them both: fire
      // centre, Kai at his log, Ingram across it, barely breathing so it
      // stays alive.
      case 'talk': {
        // the fire is dying all through the conversation
        this.sfx.firePower = Math.max(0.45, 1 - this.t * 0.012);
        // Ingram is alive at the fire: breathing weight, the lamp swinging
        if (!this._ingramIdled) { this._ingramIdled = true; this.ingramF.play('idle'); }
        this.ingram.rotation.y = Math.PI + Math.sin(this.t * 0.4) * 0.03;
        // ...and so is Kai, on his log across the flames
        if (!this._kaiSeated) { this._kaiSeated = true; this.kaiF.play('sitting'); }
        break;
      }

      // He whistles two notes and walks off into the dark.
      case 'leave': {
        if (!this._whistled && this.t > 0.6) { this._whistled = true; this.sfx.whistle(); }
        if (this.t > 1.4) {
          // out along the west tree line, unhurried — a man with nowhere to be
          const k = Math.min(1, (this.t - 1.4) / 4.6);
          this.ingramF.play(k < 1 ? 'walk' : 'idle', { fade: 0.4, speed: 1.3 });
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

      // He gets to his feet — the two-shot holds on him standing up (the
      // sitting clip blending out into his stance), then cuts to behind him
      // exactly when control comes back.
      case 'rise': {
        if (!this._kaiRose) { this._kaiRose = true; this.kaiF.play('idle', { fade: 0.9 }); }
        if (this.t > RISE_CUT) {
          this.phase = 'walk';
          this.t = 0;
          this.seated = false;        // off the log: he can turn freely
          this.standing = true;       // and he can walk
          this.px = this.kai.position.x;   // he stands where he sat
          this.pz = this.kai.position.z;
          const p = this._pathAhead(3);    // past the fire, up the path
          this.yaw = this.heading = this._yawTo(p.x, p.z);
          this.pitch = 0.06;
          this.sfx.owls = true;
          this._onLockChange();
        }
        break;
      }

      // THE WALK. Round the fire, then the old path dead straight up through
      // the trees: cairns glowing both sides, three gates, ruins, the stag,
      // the sun coming down through the canopy ahead. The forest is as loud
      // as it will ever be — this is what the silence is going to take.
      case 'walk': {
        this._prompt(
          '<span style="color:' + INGRAM_AMBER + '">THE STONE</span> &nbsp; ' +
          '<span style="font-size:24px;color:' + INGRAM_AMBER + '">' + this._pathArrow() + '</span>',
        );
        this.walkS = Math.max(this.walkS, this._pathS(this.px, this.pz));
        // the light comes up the further he gets
        this.dawnK = Math.max(
          this.dawnK, DAWN_START + (DAWN_AT_STONE - DAWN_START) * Math.min(1, this.walkS / this.walkLen),
        );
        this._applyDawn(this.dawnK);
        this._steer(dt);
        this._walkBeats();
        if (Math.hypot(this.px - STONE.x, this.pz - STONE.z) < 2.35) {
          this.phase = 'choice';
          this.t = 0;
          this._hush();
          this._prompt('');
          // he stops here; the aim beat below holds the controls until he
          // has actually seen the thing he is being asked to take
          this.standing = false;
          this._moving = false;
          this.kaiF.play('idle', { fade: 0.3 });
          this._aimed = false;
          this._aimSaid = false;
          this._aimFromYaw = this.yaw;
          this._aimFromHeading = this.heading;
        }
        break;
      }

      case 'choice': {
        if (this.doubted) {
          // the doubt line has the screen; when it is done, the prompt comes
          // back — so taking the horn is always something chosen twice
          if (!this._talking()) this.doubted = false;
        } else if (!this._aimed) {
          // FIRST, THE HORN ITSELF. Before anyone asks him to take it, the
          // scene turns him (and the camera with him) to face it, and holds
          // until he has looked.
          const wantYaw = this._yawTo(STONE.x, STONE.z);
          const k = Math.min(1, this.t / 1.2);
          const ease = k * k * (3 - 2 * k);
          this.yaw = this._aimFromYaw + wrapAngle(wantYaw - this._aimFromYaw) * ease;
          this.heading = this._aimFromHeading + wrapAngle(wantYaw - this._aimFromHeading) * ease;
          this.pitch *= 1 - ease;
          if (!this._aimSaid && this.t > 0.3) {
            this._aimSaid = true;
            this._say('There it is.', null, true);
          }
          if (k >= 1) {
            this._aimed = true;
            this.standing = true;      // controls return with the prompt
          }
        } else {
          this._steer(dt);
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

      // THE TAKE, ON CAMERA. The horn leaves the cap and comes up into his
      // hand, over his shoulder — and at the moment his grip closes, every
      // sound in the forest stops.
      case 'take': {
        const k = Math.min(1, this.t / 1.3);
        const ease = k * k * (3 - 2 * k);
        // where it is going: his right hand, wherever the stance has it
        const palm = this.kaiF.bone('PalmR');
        if (palm) {
          this.kai.updateMatrixWorld(true);
          palm.getWorldPosition(this._takeTo);
        } else {
          this._takeTo.set(this.px - Math.sin(this.yaw) * 0.42, 1.08, this.pz - Math.cos(this.yaw) * 0.42);
        }
        const to = this._takeTo;
        this.horn.position.set(
          this._takeFromPos.x + (to.x - this._takeFromPos.x) * ease,
          this._takeFromPos.y + (to.y - this._takeFromPos.y) * ease +
            Math.sin(ease * Math.PI) * 0.16,       // lifted, not slid
          this._takeFromPos.z + (to.z - this._takeFromPos.z) * ease,
        );
        this._takeToQuat.setFromAxisAngle(this._up, this.heading).multiply(this._carryQuat);
        this.horn.quaternion.slerpQuaternions(this._takeFromQuat, this._takeToQuat, ease);
        this.hornLight.position.set(
          this._takeLightPos.x + (to.x - this._takeLightPos.x) * ease,
          this._takeLightPos.y + (to.y + 0.12 - this._takeLightPos.y) * ease,
          this._takeLightPos.z + (to.z - this._takeLightPos.z) * ease,
        );
        // the glow wakes as it leaves the stone
        this.matHorn.emissiveIntensity = 0.85 * Math.min(1, k / 0.6);
        this.hornLight.intensity = 4.5 * Math.min(1, k / 0.6);
        if (k >= 1) {
          this.carried.add(this.horn, this.hornLight);
          this.horn.position.set(0, 0, 0);
          this.horn.quaternion.copy(this._carryQuat);
          this.hornLight.position.set(0, 0.12, 0);
          this.carried.position.copy(to);
          // THE SILENCE. Wind, insects, frogs, fire — all of it, at once.
          this.sfx.silence();
          state.hasKey = true;                    // what he carries through the game
          this.phase = 'taken';
          this.t = 0;
        }
        break;
      }

      // It is in his hand. The valley holds its breath.
      case 'taken': {
        this.matHorn.emissiveIntensity = 0.85 + Math.sin(this.t * 7) * 0.3;
        this.hornLight.intensity = 4.5 + Math.sin(this.t * 7) * 1.1;
        if (this.t > 1.5 && !this._quietSaid) {
          this._quietSaid = true;
          this._say('Everything just went quiet.', null, true);
          this._say('The stories were true.');
        }
        if (this._quietSaid && !this._talking() && this.t > 4.2) {
          this.phase = 'wide';
          this.t = 0;
          this._wideFrom = this.yaw;        // he turns from the stone to the trail
          this.standing = false;            // the shot takes the controls back
          // the last of the fire settles to embers behind him
          this.sfx.firePower = 0.3;
        }
        break;
      }

      // THE PULL-BACK — him alone at the stone with the lit horn, and the
      // way out in the same frame, one held breath. Nobody is shown coming;
      // whatever the silence woke is level 01's opening image.
      case 'wide': {
        if (this.t < 1.1) this.cine = this.t / 1.1;
        else if (this.t < 4.4) this.cine = 1;
        else if (this.t < 5.5) this.cine = 1 - (this.t - 4.4) / 1.1;
        else {
          this.cine = 0;
          this.standing = true;
          this._fled = true;                // the chase camera, from here to the end
          this.phase = 'flee';
          this.t = 0;
          this.sfx.alarm();
          this._onLockChange();
        }
        // in the held frame he turns from the stone to face the trail; the
        // camera that comes back down is behind him, looking where he'll run
        if (this.phase === 'wide') {
          const k = THREE.MathUtils.smoothstep(this.t, 2.2, 3.4);
          this.heading = this._wideFrom + wrapAngle(RUN_YAW - this._wideFrom) * k;
          if (this.t > WIDE_TURN) { this.yaw = RUN_YAW; this.pitch = 0; }
          this.kaiF.play(k > 0 && k < 1 ? 'walk' : 'idle', { fade: 0.3, speed: 0.6 });
        }
        // the morning keeps coming while he stands there — Ingram said
        // "before the sun is up", and it nearly is
        this.dawnK = Math.max(this.dawnK, Math.min(DAWN_AT_STONE + 0.07, DAWN_AT_STONE + this.t * 0.02));
        this._applyDawn(this.dawnK);
        if (!this._wideSaid && this.t > 1.9) {
          this._wideSaid = true;
          this._say('The whole valley is holding its breath.', null, true);
        }
        break;
      }

      case 'flee': {
        // he runs the only line there is: out of the glade and dead straight
        // down the cairn-lined trail, through the second gate. Nothing is
        // shown behind him — whoever the silence woke does not appear until
        // level 01, mid-run. The camera is behind him: his body turns to
        // where he is going, and the trail is always ahead of it.
        this._steer(dt);

        // the sun comes up while he runs — by the end of the trail it is
        // level 01's morning already
        const along = (this.px - 2) / (RUN_EXIT_X - 2);
        const from = DAWN_AT_STONE + 0.07;
        this.dawnK = Math.max(this.dawnK, Math.min(1, from + (1 - from) * Math.max(this.t / 11, along)));
        this._applyDawn(this.dawnK);
        if (!this._skySaid && this.t > 3) {
          this._skySaid = true;
          this._say('The sun\u2019s coming up.', null, true);
        }

        this._prompt(
          '<b style="color:' + KAI_GREEN + '">RUN</b> &nbsp; ' +
          '<span style="font-size:24px;color:' + KAI_GREEN + '">' + this._trailArrow() + '</span>',
        );
        if (this.px > RUN_EXIT_X) this._exit(state);
        break;
      }

      // the fade to level 01: if he was running, he keeps running into it
      case 'done': {
        if (this._fled) {
          this.px -= Math.sin(this.heading) * RUN * dt;
          this.pz -= Math.cos(this.heading) * RUN * dt;
          this.kaiF.play('run', { fade: 0.2, speed: RUN / 5.18 });
        }
        break;
      }
    }

    this._updateCamera(dt);
    this._carry();
  }

  /**
   * His body under the controls: it turns to the way he is going and walks
   * (or, with the horn, runs) there, and stands easy when he stops.
   */
  _steer(dt) {
    if (this._moving) {
      this.heading += wrapAngle(this._moveYaw - this.heading) * (1 - Math.exp(-10 * dt));
      if (this.phase === 'flee') this.kaiF.play('run', { fade: 0.2, speed: RUN / 5.18 });
      else this.kaiF.play('walk', { fade: 0.2, speed: WALK / 1.6 });
    } else {
      this.kaiF.play('idle', { fade: 0.25 });
    }
  }

  /**
   * Where the horn rides once it is his: in his right hand, or (with no
   * hand bone, the capsule stand-in) just in front of him, chest height.
   */
  _carry() {
    if (!this.carried || !this.carried.children.length) return;
    const palm = this.kai.visible ? this.kaiF.bone('PalmR') : null;
    if (palm) {
      this.kai.updateMatrixWorld(true);
      palm.getWorldPosition(this.carried.position);
      this.carried.rotation.y = this.heading;
    } else {
      this.carried.position.set(
        this.px - Math.sin(this.yaw) * 0.42, 1.08, this.pz - Math.cos(this.yaw) * 0.42,
      );
      this.carried.rotation.y = 0;
    }
  }

  /**
   * The walk's thoughts, in order, each once. One waits for the last to
   * finish, so a fast walker gets them late rather than piled up.
   */
  _walkBeats() {
    const s = this.walkS;
    if (s > 17 && !this.beats.owl) { this.beats.owl = true; this.sfx.owl(); }
    if (this._talking()) return;
    const list = [
      ['markers', s > 3, "The old markers. Stay between them and you can't get lost."],
      ['ruins', s > 11, "People lived up here once. They're the ones who put the horn on the stone."],
      ['loud', s > 21, 'Listen to it. The whole forest is awake.'],
      ['springs', s > 33, 'The springs start just behind the stone. Every village in the valley drinks from them.'],
    ];
    for (const [key, ready, line] of list) {
      if (this.beats[key]) continue;
      if (ready) { this.beats[key] = true; this._say(line); }
      return;                       // strictly in order
    }
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

    // the rigs' meshes go with this.root; their skeletons' bone textures do not
    for (const f of [this.kaiF, this.ingramF]) {
      f?.root?.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    }
    this.mist = [];               // drop the references; super disposes the meshes
    this.scene.fog = null;
    this.game.camera.fov = 62;
    this.game.camera.rotation.set(0, 0, 0);
    this.game.camera.updateProjectionMatrix();
    super.teardown();
  }
}
