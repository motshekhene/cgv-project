import { hornBuffer } from '../levels/level1/hornCall.js';
import { createJungleCueBuffers } from '../audio/jungleAudio.js';
import { GRIP_AT } from './seq/prologue.js';
import { DRIVE_AT, FALL_AT } from './seq/drive.js';
import { TRUTH_AT, SNATCH_AT } from './seq/shrine.js';

/**
 * The trailer's score: written to the picture, and every note of it made
 * here. No recorded music: the voices are Web Audio oscillators and noise
 * (the game's way: level2/sound.js and audio/jungleAudio.js are synthesised
 * too), plus the game's own sounds — the kudu horn from Level 1's horn call
 * (level1/hornCall.js) and the shared palette's cues (jungleAudio.js: the
 * tree crash, the bridge cracking, the guardian's roar, the splash...).
 *
 * The whole score is rendered once, offline, into one buffer, as the page
 * loads (prepare). That buffer is what plays, so the sound is a single clock
 * the picture follows (main.js), and the same buffer is what the exporter
 * writes as WAV (renderWav), so a recording and the page sound the same.
 *
 * The shape of it, against the edit (edit.js):
 *
 *   0:00  the glade        a low A drone, the forest bed (birds, insects, wind), a swell on the horn
 *   0:10  the fire         the fire's crackle, a heartbeat coming up, a riser...
 *   0:18  the grip         ...cut to nothing: the bed, the drone, all of it. One sub hit, a glassy tone
 *   0:23  RUN              a braam, then the chase: toms and a driving low ostinato, building;
 *                          the tree crashing, the bridge cracking
 *   0:35  RUN.             a hard stop on the word
 *   0:36  the drive        faster, a pulse under it; the car going by; the roadblock hit
 *   0:47  over the falls   the music drops out from under it; the roar; the splash, and under the water
 *   0:51  the shrine       a cold piano-like pluck, slow heart; the line singing, his landing
 *   0:58  the mask off     a hit, then a grieving chord under the two of them
 *   1:04  the snatch       near silence, then the thunder; the storm; taiko and braams
 *                          building through the bolt, the killing blow, the stag
 *   1:14  the cuts         the horn's call, the stag's roar, the last thunder
 *   1:18  black            nothing
 *   1:19  THE SILENT HORN  one deep hit and the horn, alone, ringing out
 *   1:23  the glade        the forest comes back, softly, for THE FOREST REMEMBERS
 *
 * ?music=<file> adds a licensed track of your own (in public/assets/audio/)
 * under the score, ducked under the big hits; the score stands without it.
 */
const RATE = 44100;
const SEED = 7171;

// beats on the picture, measured from the edit (tools: the trailer's "marks" and the events probe)
const T = {
  hornClose: 6.4,
  fireIn: 10.2,
  grip: GRIP_AT,
  runIn: 23.4,
  kudu: 26.95,
  tree: 28.6,
  bridge: 33.5,
  runWord: 35.3,
  drive: DRIVE_AT,
  passBy: 42.05,
  roadblock: 45.15,
  fall: FALL_AT,
  splash: 49.77,
  truth: TRUTH_AT,
  zip: 53.6,
  land: 56.65,
  helmet: 58.17,
  snatchIn: SNATCH_AT,
  snatch: 64.37,
  bolt: 68.65,
  down: 69.32,
  rise: 71.22,
  cuts: SNATCH_AT + 9.6,
  hornCall: 75.0,
  thunder: SNATCH_AT + 12.9,
  black: 78.6,
  title: 79.05,
  remember: 82.9,
  enter: 86.6,
};

const A = 55; // A1: the score is in A minor, the game's own key (jungleAudio.js: Am–F–C–G)
const hz = (semis) => A * Math.pow(2, semis / 12);

export class Score {
  constructor({ AudioContext, length, music = null }) {
    this.AC = AudioContext;
    this.length = length;
    this.music = music;
    this.buffer = null;
    this.ctx = null;
    this.src = null;
    this.gain = null;
    this.muted = false;
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.now = () => this.offset; // main.js points this at the picture's clock
  }

  /** Render the score (once). */
  async prepare(assets) {
    if (this.buffer) return;
    const t0 = performance.now();
    this.buffer = await this._render(assets);
    this.renderMs = performance.now() - t0;
  }

  /* ------------------------------------------------------------ playing it */

  _ensureCtx() {
    if (this.ctx || !this.AC) return this.ctx;
    try {
      this.ctx = new this.AC({ latencyHint: 'playback' });
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.muted ? 0 : 1;
      this.gain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[trailer] no audio', e);
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Play from trailer time t. If the browser hasn't allowed sound yet it waits for unlock(). */
  play(t = 0) {
    this.offset = t;
    this.playing = true;
    const ctx = this._ensureCtx();
    if (!ctx || !this.buffer) return;
    this._stopSource();
    if (ctx.state !== 'running') return; // blocked: unlock() starts it at the picture's time
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    this.startedAt = ctx.currentTime + 0.03;
    src.start(this.startedAt, Math.min(t, this.buffer.duration));
    this.src = src;
  }

  pause() {
    if (this.playing) this.offset = this.time() ?? this.offset;
    this.playing = false;
    this._stopSource();
  }

  _stopSource() {
    if (!this.src) return;
    try { this.src.stop(); } catch { /* not started */ }
    this.src.disconnect();
    this.src = null;
  }

  /** Where the sound is, in trailer seconds — or null while there is no running sound to keep time by. */
  time() {
    if (!this.playing || !this.src || !this.ctx || this.ctx.state !== 'running') return null;
    return this.offset + Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  setMuted(m) {
    this.muted = m;
    if (this.gain) this.gain.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.04);
  }

  /** A click or a key: browsers let sound start now. */
  unlock() {
    const ctx = this._ensureCtx();
    if (!ctx || ctx.state === 'running') return;
    ctx.resume().then(() => {
      if (this.playing && !this.src) this.play(this.now());
    }).catch(() => {});
  }

  dispose() {
    this._stopSource();
    this.ctx?.close?.();
    this.ctx = null;
  }

  /* ------------------------------------------------------------ export */

  /** The score as a 16-bit stereo WAV, base64 (tools/render-trailer.mjs muxes it with the frames). */
  async renderWav(assets) {
    await this.prepare(assets);
    return toBase64(wav(this.buffer));
  }

  /* ------------------------------------------------------------ the score itself */

  async _render(assets) {
    const len = Math.ceil(this.length * RATE) + RATE;
    const ctx = new OfflineAudioContext(2, len, RATE);
    // its own random, so the score comes out the same however the levels used theirs
    const rnd = rng(SEED);
    const was = Math.random;
    Math.random = rnd;
    try {
      const w = new Writer(ctx, rnd);
      const cues = createJungleCueBuffers(ctx);
      const horn = hornBuffer(ctx);
      let music = null;
      if (this.music) music = await this._loadMusic(ctx, assets);
      write(w, cues, horn, music, this.length);
    } finally {
      Math.random = was;
    }
    return ctx.startRendering();
  }

  async _loadMusic(ctx, assets) {
    try {
      const url = new URL(`audio/${this.music}`, new URL(assets?.base || '../assets/', location.href));
      const data = await (await fetch(url)).arrayBuffer();
      return await ctx.decodeAudioData(data);
    } catch (e) {
      console.warn('[trailer] ?music could not be loaded; the score plays on its own', e);
      return null;
    }
  }
}

/* ================================================================ the writing desk */

/**
 * The graph the score is written into: everything goes to `bus` (dry) and
 * some of it to `verb` (a long, dark hall made of decaying noise), both
 * into a gentle compressor at the end. Each voice is a small function that
 * schedules nodes at a time; the score is calls to those.
 */
class Writer {
  constructor(ctx, rnd) {
    this.ctx = ctx;
    this.rnd = rnd;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = 0.72;
    // a brick wall last, so the big hits never clip the WAV
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.12;
    // and a gate the hard cuts close, reverb tails and all
    this.cut = ctx.createGain();
    comp.connect(this.master).connect(limit).connect(this.cut).connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.connect(comp);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._hall(4.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.verb.connect(wet).connect(comp);
    this.noise = this._noise(4);
    // the music bed (and its duck), when there is one
    this.musicBus = ctx.createGain();
    this.musicBus.connect(comp);
  }

  _noise(seconds) {
    const b = this.ctx.createBuffer(2, Math.floor(seconds * RATE), RATE);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = this.rnd() * 2 - 1;
    }
    return b;
  }

  _hall(seconds) {
    const b = this.ctx.createBuffer(2, Math.floor(seconds * RATE), RATE);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / RATE;
        lp = lp * 0.82 + (this.rnd() * 2 - 1) * 0.18; // darker as it goes
        d[i] = lp * Math.pow(1 - t / seconds, 2.4) * Math.exp(-t * 0.9) * 2.2;
      }
    }
    return b;
  }

  /** A gain envelope: [[time, value], ...] (linear ramps; first point is set). */
  env(points, { exp = false } = {}) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const p = g.gain;
    points.forEach(([t, v], i) => {
      t = Math.max(0, t);
      if (i === 0) p.setValueAtTime(v, t);
      else if (exp && v > 0.0001) p.exponentialRampToValueAtTime(v, t);
      else p.linearRampToValueAtTime(v, t);
    });
    return g;
  }

  out(node, { verb = 0.2, pan = 0, dry = 1 } = {}) {
    let n = node;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      n.connect(p);
      n = p;
    }
    if (dry) {
      const d = this.ctx.createGain();
      d.gain.value = dry;
      n.connect(d).connect(this.bus);
    }
    if (verb) {
      const s = this.ctx.createGain();
      s.gain.value = verb;
      n.connect(s).connect(this.verb);
    }
    return node;
  }

  osc(type, f, t0, t1, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, Math.max(0, t0));
    o.detune.value = detune;
    o.start(Math.max(0, t0));
    o.stop(t1 + 0.05);
    return o;
  }

  noiseSrc(t0, t1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = this.rnd() * 3;
    s.start(Math.max(0, t0), this.rnd() * 3);
    s.stop(t1 + 0.05);
    return s;
  }

  filter(type, f, q = 0.7) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  sample(buf, t, { gain = 1, rate = 1, verb = 0.2, pan = 0, lowpass = 0 } = {}) {
    if (!buf) return;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    let n = s.connect(g);
    if (lowpass) n = n.connect(this.filter('lowpass', lowpass));
    this.out(n, { verb, pan });
    s.start(Math.max(0, t));
  }

  /* ---- voices ---- */

  /** A sustained chord of soft detuned saws through a low filter: strings, from a distance. */
  pad(t0, t1, freqs, { gain = 0.08, attack = 1.5, release = 1.5, cutoff = 900, verb = 0.5, cutoffTo = null } = {}) {
    const lp = this.filter('lowpass', cutoff, 0.4);
    if (cutoffTo) {
      lp.frequency.setValueAtTime(cutoff, t0);
      lp.frequency.linearRampToValueAtTime(cutoffTo, t1);
    }
    const e = this.env([[t0, 0], [t0 + attack, gain], [t1 - release, gain], [t1, 0]]);
    lp.connect(e);
    this.out(e, { verb });
    for (const f of freqs) {
      for (const d of [-7, 6]) this.osc('sawtooth', f, t0, t1, d).connect(lp);
    }
  }

  /** A pure, low drone: a sine and its octave, slowly breathing. */
  drone(t0, t1, f, { gain = 0.12, attack = 3, release = 2 } = {}) {
    const e = this.env([[t0, 0], [t0 + attack, gain], [t1 - release, gain], [t1, 0]]);
    this.out(e, { verb: 0.3 });
    this.osc('sine', f, t0, t1).connect(e);
    const o2 = this.ctx.createGain();
    o2.gain.value = 0.35;
    this.osc('triangle', f * 2, t0, t1, 4).connect(o2).connect(e);
  }

  /** The sub hit: a sine falling from 70 Hz into the floor, with a thud of noise. */
  boom(t, { gain = 0.9, decay = 2.2, verb = 0.35 } = {}) {
    const o = this.osc('sine', 72, t, t + decay);
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(26, t + decay * 0.8);
    const e = this.env([[t, 0], [t + 0.006, gain], [t + decay, 0.0001]], { exp: true });
    o.connect(e);
    this.out(e, { verb });
    const n = this.noiseSrc(t, t + 0.4);
    const lp = this.filter('lowpass', 260);
    const ne = this.env([[t, 0], [t + 0.004, gain * 0.7], [t + 0.35, 0.0001]], { exp: true });
    n.connect(lp).connect(ne);
    this.out(ne, { verb: verb * 1.4 });
  }

  /** The braam: a wall of low brass (stacked saws, a fifth and octaves), opening up and dying. */
  braam(t, { gain = 0.22, dur = 2.6, root = hz(0) } = {}) {
    const lp = this.filter('lowpass', 180, 1.2);
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(1400, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const e = this.env([[t, 0], [t + 0.05, gain], [t + dur * 0.5, gain * 0.6], [t + dur, 0]]);
    lp.connect(e);
    this.out(e, { verb: 0.45 });
    for (const [m, d] of [[1, -9], [1, 9], [1.5, 0], [2, -5], [0.5, 3]]) this.osc('sawtooth', root * m, t, t + dur, d).connect(lp);
    this.boom(t, { gain: gain * 2.2, decay: 1.6 });
  }

  /** A drum: tom or taiko (a pitched sine thump plus a skin of filtered noise). */
  drum(t, { f = 90, gain = 0.45, decay = 0.45, noise = 0.25, verb = 0.18, pan = 0 } = {}) {
    const o = this.osc('sine', f * 1.6, t, t + decay);
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const e = this.env([[t, 0], [t + 0.003, gain], [t + decay, 0.0001]], { exp: true });
    o.connect(e);
    this.out(e, { verb, pan });
    if (noise) {
      const n = this.noiseSrc(t, t + 0.2);
      const bp = this.filter('bandpass', f * 9, 0.9);
      const ne = this.env([[t, 0], [t + 0.002, gain * noise], [t + 0.12, 0.0001]], { exp: true });
      n.connect(bp).connect(ne);
      this.out(ne, { verb, pan });
    }
  }

  /** The kick, for the drive. */
  kick(t, gain = 0.5) {
    this.drum(t, { f: 48, gain, decay: 0.32, noise: 0.15, verb: 0.05 });
  }

  /** A heartbeat: lub-dub. */
  heart(t, gain = 0.4) {
    this.drum(t, { f: 44, gain, decay: 0.3, noise: 0, verb: 0.08 });
    this.drum(t + 0.2, { f: 40, gain: gain * 0.7, decay: 0.3, noise: 0, verb: 0.08 });
  }

  /** Low ostinato: a short, bitten saw note (the chase's engine). */
  stab(t, f, { gain = 0.1, dur = 0.16, cutoff = 900 } = {}) {
    const lp = this.filter('lowpass', cutoff, 2);
    lp.frequency.setValueAtTime(cutoff * 2, t);
    lp.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur);
    const e = this.env([[t, 0], [t + 0.004, gain], [t + dur, 0.0001]], { exp: true });
    lp.connect(e);
    this.out(e, { verb: 0.12 });
    this.osc('sawtooth', f, t, t + dur, -4).connect(lp);
    this.osc('square', f / 2, t, t + dur, 3).connect(lp);
  }

  /** A pluck: a sine with a little bell on top, ringing (the "piano" at the shrine). */
  pluck(t, f, { gain = 0.16, decay = 2.6, verb = 0.6, pan = 0 } = {}) {
    const e = this.env([[t, 0], [t + 0.004, gain], [t + decay, 0.0001]], { exp: true });
    this.out(e, { verb, pan });
    this.osc('sine', f, t, t + decay).connect(e);
    const b = this.ctx.createGain();
    b.gain.value = 0.25;
    this.osc('sine', f * 3.01, t, t + decay * 0.4).connect(b).connect(e);
  }

  /** A riser: noise through a bandpass sweeping up, with a tone bending up under it. */
  riser(t0, t1, { gain = 0.14, from = 300, to = 6000 } = {}) {
    const n = this.noiseSrc(t0, t1);
    const bp = this.filter('bandpass', from, 3);
    bp.frequency.setValueAtTime(from, t0);
    bp.frequency.exponentialRampToValueAtTime(to, t1);
    const e = this.env([[t0, 0], [t1 - 0.05, gain], [t1, 0]]);
    n.connect(bp).connect(e);
    this.out(e, { verb: 0.3 });
    const o = this.osc('sawtooth', 110, t0, t1);
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(440, t1);
    const lp = this.filter('lowpass', 1200);
    const oe = this.env([[t0, 0], [t1 - 0.05, gain * 0.35], [t1, 0]]);
    o.connect(lp).connect(oe);
    this.out(oe, { verb: 0.3 });
  }

  /** Filtered noise held as a bed: wind, rain, the falls' roar. */
  wash(t0, t1, { type = 'lowpass', f = 600, q = 0.5, gain = 0.06, attack = 1.5, release = 1.5, verb = 0, pan = 0 } = {}) {
    const n = this.noiseSrc(t0, t1);
    const fl = this.filter(type, f, q);
    const e = this.env([[t0, 0], [t0 + attack, gain], [t1 - release, gain], [t1, 0]]);
    n.connect(fl).connect(e);
    this.out(e, { verb, pan });
    return fl;
  }

  /** A bird: a quick falling or rising whistle. */
  chirp(t, { f = 3200, gain = 0.03, pan = 0 } = {}) {
    const r = this.rnd;
    const notes = 1 + Math.floor(r() * 3);
    for (let i = 0; i < notes; i++) {
      const s = t + i * (0.09 + r() * 0.05);
      const o = this.osc('sine', f, s, s + 0.12);
      o.frequency.setValueAtTime(f * (1 + r() * 0.3), s);
      o.frequency.exponentialRampToValueAtTime(f * (0.7 + r() * 0.2), s + 0.08);
      const e = this.env([[s, 0], [s + 0.01, gain], [s + 0.1, 0]]);
      o.connect(e);
      this.out(e, { verb: 0.25, pan });
    }
  }

  /** The forest, between two times: wind, insects, birds. */
  forest(t0, t1, { gain = 1 } = {}) {
    const r = this.rnd;
    this.wash(t0, t1, { f: 500, gain: 0.05 * gain, attack: 2, release: 0.02 });
    this.wash(t0, t1, { type: 'bandpass', f: 5200, q: 6, gain: 0.012 * gain, attack: 2.5, release: 0.02 }); // cicadas
    for (let t = t0 + 0.4 + r(); t < t1 - 0.3; t += 0.5 + r() * 1.4) this.chirp(t, { f: 2200 + r() * 2600, gain: (0.02 + r() * 0.02) * gain, pan: r() * 1.6 - 0.8 });
  }

  /** Fire: a bed of low hiss and crackles. */
  fire(t0, t1, gain = 1) {
    const r = this.rnd;
    this.wash(t0, t1, { f: 900, gain: 0.03 * gain, attack: 0.6, release: 0.5 });
    for (let t = t0; t < t1; t += 0.03 + r() * 0.12) {
      const n = this.noiseSrc(t, t + 0.03);
      const hp = this.filter('highpass', 1500 + r() * 3000);
      const e = this.env([[t, 0], [t + 0.001, (0.03 + r() * 0.05) * gain], [t + 0.02, 0]]);
      n.connect(hp).connect(e);
      this.out(e, { verb: 0.05, pan: r() * 0.6 - 0.3 });
    }
  }

  /** Thunder: a crack, then a long low roll. */
  thunder(t, gain = 0.6) {
    const n = this.noiseSrc(t, t + 0.25);
    const hp = this.filter('highpass', 900);
    const e = this.env([[t, 0], [t + 0.003, gain * 0.8], [t + 0.22, 0.0001]], { exp: true });
    n.connect(hp).connect(e);
    this.out(e, { verb: 0.6 });
    const roll = this.noiseSrc(t, t + 4.5);
    const lp = this.filter('lowpass', 420, 0.6);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 4);
    const re = this.env([[t, 0], [t + 0.12, gain], [t + 1.2, gain * 0.55], [t + 4.4, 0]]);
    roll.connect(lp).connect(re);
    this.out(re, { verb: 0.4 });
    this.boom(t + 0.05, { gain: gain * 0.8, decay: 2.5 });
  }

  /** A pass-by: a bright noise swell that drops in pitch as it goes (the car past the lens). */
  passBy(t, gain = 0.25) {
    const n = this.noiseSrc(t - 0.6, t + 0.8);
    const bp = this.filter('bandpass', 2400, 1.2);
    bp.frequency.setValueAtTime(3200, t - 0.6);
    bp.frequency.linearRampToValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.8);
    const e = this.env([[t - 0.6, 0], [t, gain], [t + 0.8, 0]]);
    n.connect(bp).connect(e);
    this.out(e, { verb: 0.15 });
    const o = this.osc('sawtooth', 160, t - 0.6, t + 0.8);
    o.frequency.setValueAtTime(175, t - 0.6);
    o.frequency.linearRampToValueAtTime(150, t + 0.1);
    o.frequency.linearRampToValueAtTime(105, t + 0.8);
    const lp = this.filter('lowpass', 700);
    const oe = this.env([[t - 0.6, 0], [t, gain * 0.35], [t + 0.8, 0]]);
    o.connect(lp).connect(oe);
    this.out(oe, { verb: 0.1 });
  }

  /** A glassy shimmer: high sines, slightly apart, beating (the horn waking). */
  shimmer(t0, t1, { gain = 0.03, f = hz(48) } = {}) {
    const e = this.env([[t0, 0], [t0 + 0.4, gain], [t1 - 1.2, gain * 0.8], [t1, 0]]);
    this.out(e, { verb: 0.8, dry: 0.6 });
    for (const m of [1, 1.003, 1.5, 2.002]) this.osc('sine', f * m, t0, t1).connect(e);
  }
}

/* ================================================================ the score */

function write(w, cue, horn, music, length) {
  const Am = [hz(12), hz(19), hz(24)]; // A2 E3 A3
  const F = [hz(8), hz(15), hz(20)]; // F2 C3 F3
  const E = [hz(7), hz(14), hz(19)];

  /* ---- 1. the glade (0–10) ---- */
  w.forest(0.2, T.fireIn + 0.6, { gain: 1 });
  w.drone(0.0, T.fireIn + 0.4, hz(0), { gain: 0.11, attack: 3.5, release: 1.2 });
  w.pad(1.5, T.fireIn + 0.4, Am, { gain: 0.035, attack: 3, release: 1.4, cutoff: 500, cutoffTo: 1100 });
  w.sample(cue.shrinePulse, T.hornClose - 0.1, { gain: 0.55, verb: 0.7 });
  w.shimmer(T.hornClose, T.fireIn + 0.4, { gain: 0.018 });
  w.pluck(3.6, hz(36), { gain: 0.06, decay: 4 }); // under EVERY LEGEND BEGINS SOMEWHERE
  w.pluck(4.4, hz(31), { gain: 0.05, decay: 4 });

  /* ---- 2. the fire and the stone (10–23) ---- */
  w.fire(T.fireIn, 13.95, 1);
  w.forest(13.9, T.grip, { gain: 0.8 });
  w.drone(T.fireIn - 0.2, T.grip, hz(-3), { gain: 0.1, attack: 1.2, release: 0.01 }); // F#: darker under the fire
  w.pad(T.fireIn, T.grip, [hz(9), hz(16), hz(21)], { gain: 0.035, attack: 2, release: 0.01, cutoff: 600, cutoffTo: 1600 });
  for (let t = 14.4, gap = 0.95; t < T.grip - 0.25; t += gap, gap = Math.max(0.42, gap * 0.9)) w.heart(t, 0.22 + 0.25 * (t - 14.4) / (T.grip - 14.4));
  w.riser(T.grip - 2.4, T.grip, { gain: 0.12 });
  // the grip: everything stops. One sub, and the horn's glass
  w.boom(T.grip, { gain: 0.85, decay: 3.4, verb: 0.6 });
  w.shimmer(T.grip, 22.9, { gain: 0.03 });
  w.drone(T.grip + 1.2, 23.0, hz(-12) * 2, { gain: 0.07, attack: 2.4, release: 0.6 });
  w.pluck(20.1, hz(27), { gain: 0.05, decay: 3.5 }); // under SOME THINGS WERE NEVER...

  /* ---- 3. RUN (23–36) ---- */
  w.riser(21.9, T.runIn, { gain: 0.14, to: 8000 });
  w.braam(T.runIn, { gain: 0.2, dur: 2.8 });
  const bpm1 = 124, beat1 = 60 / bpm1;
  const runEnd = T.runWord - 0.05;
  const prog = [hz(0), hz(0), hz(-4), hz(-2)]; // A A F G, a bar each
  for (let i = 0, t = T.runIn; t < runEnd; i++, t = T.runIn + i * beat1 / 2) {
    const bar = Math.floor(i / 8) % 4;
    const build = Math.min(1, (t - T.runIn) / (runEnd - T.runIn));
    w.stab(t, prog[bar] * 2, { gain: 0.05 + 0.05 * build, cutoff: 500 + 900 * build });
    const b = i % 8;
    if (b === 0 || b === 3 || b === 6) w.drum(t, { f: 70, gain: 0.32 + 0.2 * build, decay: 0.5 });
    if (b === 4) w.drum(t, { f: 120, gain: 0.25 + 0.15 * build, decay: 0.3, noise: 0.5, pan: 0.3 });
    if (build > 0.5 && (b === 2 || b === 7)) w.drum(t, { f: 160, gain: 0.12 * build, decay: 0.2, noise: 0.6, pan: -0.35 });
  }
  w.pad(T.runIn + 3.2, runEnd, [hz(12), hz(16), hz(19)], { gain: 0.03, attack: 3, release: 0.02, cutoff: 800, cutoffTo: 2400 });
  w.sample(cue.whoosh, T.kudu - 0.25, { gain: 0.6, pan: -0.4 });
  w.sample(cue.treeCrash, T.tree - 0.05, { gain: 0.75, verb: 0.3 });
  w.sample(cue.bridgeCrack, T.bridge + 0.3, { gain: 0.7, verb: 0.3 });
  w.sample(cue.bridgeCrack, T.bridge + 1.25, { gain: 0.55, verb: 0.3, rate: 0.85 });
  w.sample(cue.guardianRoar, 30.0, { gain: 0.25, rate: 0.6, verb: 0.5, lowpass: 900 }); // the shrine's dark
  w.riser(T.runWord - 1.6, T.runWord - 0.05, { gain: 0.15, to: 9000 });
  // RUN.
  w.boom(T.runWord, { gain: 1, decay: 1.4 });
  w.drum(T.runWord, { f: 60, gain: 0.7, decay: 0.8, noise: 0.6 });
  w.braam(T.runWord, { gain: 0.14, dur: 1.1, root: hz(-2) });

  /* ---- 4. the drive and the falls (36.6–51) ---- */
  const bpm2 = 138, beat2 = 60 / bpm2;
  const driveEnd = T.fall;
  w.sample(cue.handoff, T.drive - 0.1, { gain: 0.35 });
  for (let i = 0, t = T.drive + 0.2; t < driveEnd - 0.02; i++, t = T.drive + 0.2 + i * beat2 / 2) {
    const build = Math.min(1, (t - T.drive) / (driveEnd - T.drive));
    const bar = Math.floor(i / 8) % 4;
    const root = [hz(0), hz(-4), hz(3) / 2 * 2, hz(-2)][bar] * 2;
    w.stab(t, root, { gain: 0.06 + 0.04 * build, cutoff: 700 + 1300 * build, dur: 0.12 });
    if (i % 2 === 0 && t > T.drive + 4.0) w.kick(t, 0.38 + 0.2 * build);
    if (i % 8 === 4) w.drum(t, { f: 130, gain: 0.28, decay: 0.25, noise: 0.7 });
    if (t > T.drive + 4.0 && i % 2 === 1) {
      const n = w.noiseSrc(t, t + 0.05); // a hat
      const hp = w.filter('highpass', 7000);
      const e = w.env([[t, 0], [t + 0.002, 0.04 + 0.03 * build], [t + 0.045, 0]]);
      n.connect(hp).connect(e);
      w.out(e, { verb: 0.05, pan: 0.2 });
    }
  }
  w.pad(T.drive + 1, driveEnd, [hz(12), hz(19), hz(24), hz(28)], { gain: 0.028, attack: 3, release: 0.02, cutoff: 900, cutoffTo: 3000 });
  w.wash(T.drive + 4.4, T.fall + 3.0, { type: 'highpass', f: 2500, gain: 0.03, attack: 0.3, release: 1 }); // rain
  w.passBy(T.passBy, 0.3);
  w.sample(cue.impact, T.roadblock, { gain: 0.6 });
  w.passBy(T.roadblock + 0.15, 0.2);
  w.wash(T.fall - 1.6, T.splash + 0.2, { f: 1400, q: 0.3, gain: 0.07, attack: 1.5, release: 0.3 }); // the falls' roar
  // over the lip: the music falls away under it
  w.boom(T.fall, { gain: 0.6, decay: 2.5 });
  w.shimmer(T.fall, T.splash, { gain: 0.03, f: hz(43) });
  w.pad(T.fall, T.splash, [hz(24), hz(31), hz(36)], { gain: 0.03, attack: 0.6, release: 0.2, cutoff: 1800, cutoffTo: 600 });
  w.riser(T.splash - 1.4, T.splash - 0.02, { gain: 0.09, from: 2000, to: 300 });
  w.sample(cue.splash, T.splash, { gain: 0.9, verb: 0.4 });
  w.boom(T.splash, { gain: 0.8, decay: 2.5 });
  // under the water: muffled, a low hum, out into the dark
  w.wash(T.splash + 0.1, T.truth + 0.6, { f: 180, gain: 0.06, attack: 0.1, release: 0.6, verb: 0.3 });

  /* ---- 5. the truth (51–64) ---- */
  w.wash(T.truth, SNATCH_AT - 0.5, { f: 1200, q: 0.2, gain: 0.03, attack: 1.4, release: 0.6 }); // the falls behind the shrine
  w.drone(T.truth, T.helmet, hz(0), { gain: 0.08, attack: 2, release: 0.1 });
  const shrineNotes = [hz(24), hz(27), hz(31), hz(26), hz(24), hz(22), hz(19)];
  shrineNotes.forEach((f, i) => w.pluck(T.truth + 0.6 + i * 0.95, f, { gain: 0.09, decay: 3, pan: i % 2 ? 0.25 : -0.25 }));
  for (let t = T.truth + 1.2; t < T.helmet - 0.4; t += 1.05) w.heart(t, 0.2);
  w.sample(cue.whoosh, T.zip, { gain: 0.35, rate: 0.6, verb: 0.4 });
  w.wash(T.zip, T.land - 1.0, { type: 'bandpass', f: 3500, q: 8, gain: 0.025, attack: 1.2, release: 0.3 }); // the line singing
  w.sample(cue.impact, T.land, { gain: 0.8 });
  w.boom(T.land, { gain: 0.7, decay: 1.6 });
  w.pad(T.land, T.helmet, [hz(12), hz(15), hz(19)], { gain: 0.035, attack: 0.8, release: 0.05, cutoff: 500 }); // the mask
  w.riser(T.helmet - 1.2, T.helmet, { gain: 0.08, to: 5000 });
  // the mask off
  w.braam(T.helmet, { gain: 0.16, dur: 2.0, root: hz(-4) });
  w.sample(cue.guardianRoar, T.helmet, { gain: 0.45, rate: 0.8, verb: 0.5 });
  // the face: a grieving chord, F to E, under the two of them
  w.pad(T.helmet + 1.1, 61.6, F, { gain: 0.05, attack: 1.2, release: 0.8, cutoff: 1300 });
  w.pad(61.2, SNATCH_AT - 0.35, E, { gain: 0.05, attack: 0.8, release: 1.3, cutoff: 1100 });
  w.pluck(59.75, hz(32), { gain: 0.08, decay: 4 });
  w.pluck(61.45, hz(31), { gain: 0.08, decay: 4 });
  w.pluck(62.4, hz(28), { gain: 0.07, decay: 4 });

  /* ---- 6. the power awakens (64–78.6) ---- */
  // the breath before it: almost nothing, then the sky
  w.wash(SNATCH_AT, T.black, { type: 'bandpass', f: 1800, q: 0.35, gain: 0.055, attack: 0.6, release: 0.02 }); // the rain
  w.wash(SNATCH_AT, T.black, { f: 220, gain: 0.04, attack: 1, release: 0.02 }); // the wind under it
  w.sample(cue.whoosh, T.snatch - 0.25, { gain: 0.5 });
  w.thunder(T.snatch, 0.7);
  w.sample(cue.hurt, T.snatch + 0.02, { gain: 0.3 });
  w.drone(T.snatch, T.black, hz(-12) * 2, { gain: 0.09, attack: 1.5, release: 0.02 });
  // taiko, building from the horn in his fist to the end
  const bpm3 = 132, beat3 = 60 / bpm3;
  const tStart = SNATCH_AT + 2.1;
  for (let i = 0, t = tStart; t < T.black - 0.05; i++, t = tStart + i * beat3 / 2) {
    const build = (t - tStart) / (T.black - tStart);
    const b = i % 16;
    const fast = t > T.cuts;
    if (b === 0 || b === 8 || (build > 0.35 && b === 11) || (fast && i % 2 === 0)) w.drum(t, { f: 58, gain: 0.35 + 0.35 * build, decay: 0.7, noise: 0.35, verb: 0.3 });
    if (build > 0.15 && (b === 4 || b === 12)) w.drum(t, { f: 140, gain: 0.2 + 0.15 * build, decay: 0.25, noise: 0.6, pan: -0.3 });
    if (build > 0.5 && i % 2 === 1) w.drum(t, { f: 220, gain: 0.07 + 0.1 * build, decay: 0.12, noise: 0.8, pan: 0.35 });
    if (i % 4 === 0) w.stab(t, [hz(0), hz(0), hz(-4), hz(-5)][Math.floor(i / 16) % 4] * 2, { gain: 0.05 + 0.06 * build, dur: 0.35, cutoff: 600 + 1500 * build });
  }
  w.pad(tStart, T.black - 0.02, [hz(12), hz(19), hz(24), hz(27)], { gain: 0.04, attack: 4, release: 0.02, cutoff: 700, cutoffTo: 3200 });
  w.thunder(T.bolt, 0.75);
  w.braam(T.bolt, { gain: 0.16, dur: 2.2 });
  w.braam(T.down, { gain: 0.14, dur: 1.8, root: hz(-4) });
  w.sample(cue.bodyFall, T.down + 0.5, { gain: 0.5 });
  w.sample(cue.stoneGrind, T.rise, { gain: 0.6, rate: 0.7, verb: 0.4 });
  w.sample(cue.guardianRoar, T.rise + 1.2, { gain: 0.8, rate: 0.7, verb: 0.5 });
  w.braam(T.cuts, { gain: 0.2, dur: 1.4, root: hz(-2) });
  w.sample(cue.guardianRoar, T.cuts + 0.1, { gain: 0.7, rate: 0.85, verb: 0.4 });
  w.sample(horn, T.hornCall - 0.3, { gain: 0.9, verb: 0.6 });
  w.boom(T.hornCall, { gain: 0.8, decay: 2 });
  w.sample(cue.impact, SNATCH_AT + 11.8 + 0.6, { gain: 0.6 });
  w.thunder(T.thunder, 0.85);
  w.riser(T.black - 2.4, T.black - 0.02, { gain: 0.2, to: 11000 });
  w.braam(T.black - 1.0, { gain: 0.14, dur: 1.0, root: hz(0) });
  // ...and the hard cut: nothing at all
  w.cut.gain.setValueAtTime(1, T.black - 0.01);
  w.cut.gain.linearRampToValueAtTime(0, T.black + 0.01);
  w.cut.gain.setValueAtTime(0, T.title - 0.02);
  w.cut.gain.linearRampToValueAtTime(1, T.title);

  /* ---- 7. the title (78.6–) ---- */
  w.boom(T.title, { gain: 1, decay: 4, verb: 0.8 });
  w.sample(horn, T.title + 0.05, { gain: 1, verb: 1.0 });
  w.drone(T.title, T.enter + 1.6, hz(0), { gain: 0.08, attack: 2.5, release: 2.5 });
  w.shimmer(T.title + 0.6, T.remember + 2, { gain: 0.016 });
  w.forest(T.remember - 0.6, T.enter - 0.2, { gain: 0.6 });
  w.pad(T.remember - 0.3, T.enter + 1.0, [hz(12), hz(19), hz(24), hz(28)], { gain: 0.04, attack: 2.2, release: 2.4, cutoff: 1300 });
  w.pluck(T.remember + 0.2, hz(31), { gain: 0.08, decay: 4.5 });
  w.pluck(T.remember + 1.2, hz(36), { gain: 0.07, decay: 4.5 });
  w.pluck(T.enter, hz(43), { gain: 0.07, decay: 4.5 }); // ENTER THE WORLD.

  /* ---- a licensed track under it, if one was given ---- */
  if (music) {
    const s = w.ctx.createBufferSource();
    s.buffer = music;
    const g = w.env([[0, 0], [1.5, 0.5], [length - 3, 0.5], [length, 0]]);
    s.connect(g).connect(w.musicBus);
    // ducked under the big hits
    for (const t of [T.grip, T.runWord, T.splash, T.helmet, T.snatch, T.black]) {
      w.musicBus.gain.setTargetAtTime(0.25, t, 0.02);
      w.musicBus.gain.setTargetAtTime(1, t + 0.6, 0.4);
    }
    s.start(0);
  }
}

/* ================================================================ files */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An AudioBuffer as a 16-bit PCM WAV. */
function wav(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
