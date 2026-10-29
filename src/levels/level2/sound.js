/**
 * Level2Sound — Member 2A
 *
 * Every Level 2 sound comes from the shared jungle engine
 * (src/audio/jungleAudio.js) — synthesised live with the Web Audio API,
 * plus the recorded Pixabay assets (the traffic wreck,
 * peak-normalised on load; see public/assets/audio/CREDITS.md). Either way
 * the same buffers, the same headroom: Level 2 sounds like the same world,
 * at the same loudness, as the intro and Level 1.
 *
 *   music        the game's theme — the recorded loop, with the synthesised
 *                'drive' arrangement as the fallback — on the same music
 *                bus, so N and ducking work unchanged
 *   continuous   the car's engine: a recording of a real one (OpenGameArt, CC0)
 *                pitched with the revs through 5 gears, dipping on shifts,
 *                popping on the overrun, misfiring when damaged, turbo on boost
 *                (a four-cylinder written in code stands in until it decodes);
 *                the flames' roar when it burns
 *                with a strained, rattling layer as the car takes damage,
 *                Handler siren (wail when chasing, fast yelp while attacking)
 *                over his own diesel engine — deeper and lumpier than the
 *                player's, louder as he closes in — plus tyre screech, rail
 *                scrape, a mud squelch that rides the speed, wind, drone
 *                rotor buzz (pitch climbs on a dive), and the ambient bed —
 *                wind in the leaves, the river, the distant wildlife —
 *                shifting toward road and rain as the run goes on
 *   one-shots    crash / bump, the recorded traffic wreck (synthesised
 *                layers as the fallback), gunshot, tyre pop, explosion,
 *                laser-sight charge, spike-strip clatter, warning beeps, the
 *                Handler's diesel horn, dodge chime, plus the shared
 *                gameplay cues: health loss, pickups, win and defeat
 *
 * Browsers only allow audio after a click or key press, so the AudioContext
 * is created on the first one (the car picker needs one anyway). M mutes
 * everything, N toggles the soft piano music.
 *
 *   this.sound = new Level2Sound();
 *   this.sound.update(dt, { speed, maxSpeed, throttle, boosting, skid, scrape,
 *                           handler: { dist, dx, attacking }, drones: [{ dist, dx, dive }],
 *                           jungle, night, rain });
 *   this.sound.crash(0.8);  this.sound.gunshot(12);  this.sound.hurt(1);
 *   this.sound.win();  this.sound.dispose();   // in teardown
 */
import {
  AUDIO_LEVELS,
  JungleBed,
  createJungleCueBuffers,
  createJungleMusicBuffer,
  loadAudioFileBuffer,
} from "../../audio/jungleAudio.js";
import { musicVolumeNode } from "../../audio/masterMute.js";
import { renderScore } from "../../audio/chaseScore.js";

/** Where in a recording (s) its loudest 20 ms is: the impact in a crash. */
function loudestAt(buf) {
  const d = buf.getChannelData(0);
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.02));
  let best = 0, at = 0;
  for (let i = 0; i < d.length; i += win) {
    let e = 0;
    for (let j = i, n = Math.min(d.length, i + win); j < n; j++) e += d[j] * d[j];
    if (e > best) { best = e; at = i; }
  }
  return at / buf.sampleRate;
}

export class Level2Sound {
  constructor({ volume = 0.75 } = {}) {
    this.volume = volume;
    this.muted = false;
    this.musicOn = true;
    this.ctx = null;
    this._onGesture = () => this._start();
    this._onKey = (e) => {
      if (e.key === 'n' || e.key === 'N') this.setMusic(!this.musicOn);
      this._start();
    };
    window.addEventListener('pointerdown', this._onGesture);
    window.addEventListener('keydown', this._onKey);
  }

  /** Kai blows the horn: a deep call that swells and falls away, with an echo off the gorge. */
  hornCall() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [delay, amp] of [[0, 0.32], [0.42, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(98, t + delay);
      o.frequency.linearRampToValueAtTime(131, t + delay + 0.35);
      o.frequency.setValueAtTime(131, t + delay + 1.2);
      o.frequency.linearRampToValueAtTime(110, t + delay + 1.8);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(amp, t + delay + 0.25);
      g.gain.setValueAtTime(amp, t + delay + 1.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.9);
      o.connect(lp).connect(g).connect(this.master);
      o.start(t + delay); o.stop(t + delay + 2);
    }
  }

  /* ======================== setup ======================== */

  _start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    // master: gain -> gentle compressor -> speakers
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    // two seconds of white noise, shared by every noisy sound
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this._buildEngine();
    this._buildSiren();
    this.screech = this._noiseLoop('bandpass', 2600, 6);
    this.scrape = this._noiseLoop('highpass', 3200, 0.8);
    this.wind = this._noiseLoop('lowpass', 420, 0.5);
    this.falls = this._noiseLoop('lowpass', 700, 0.3);      // the waterfall's roar, louder as you near the end
    this.drones = [this._buildDrone(), this._buildDrone()];
    // the road is mud the whole way: a squelch that rides the speed, and a
    // strained rattle under the engine as the damage mounts
    this.mud = this._noiseLoop('bandpass', 420, 1.4);
    const mudLfo = ctx.createOscillator(); mudLfo.frequency.value = 2.4;
    const mudDepth = ctx.createGain(); mudDepth.gain.value = 0.45;
    mudLfo.connect(mudDepth).connect(this.mud.gain.gain); mudLfo.start();
    this.rattle = this._noiseLoop('bandpass', 900, 2.5);
    this.flame = this._noiseLoop('bandpass', 480, 0.55);   // a burning engine's roar (fire())
    this._buildHandlerEngine();

    // the recorded traffic wreck (Pixabay, ~5 s of swerve and crunch) —
    // trafficCrash prefers it the moment it's decoded
    loadAudioFileBuffer(ctx, './assets/audio/rsf_studios-car-crash-swerving-and-crash-592672.mp3', { peak: 0.9 })
      .then((b) => {
        if (!b || !this.ctx) return;
        this._crashBuffer = b;
        this._crashHit = loudestAt(b); // where in it the cars meet: crash() plays from there
      });
    // a real engine (OpenGameArt, CC0) takes over from the synthesised one the moment it decodes,
    // and a real explosion for the wreck and the bombs
    loadAudioFileBuffer(ctx, './assets/audio/domasx2-racing-car-engine-loop.wav', { peak: 0.9 })
      .then((b) => { if (b && this.ctx && this.engine) this._useRecordedEngine(b); });
    loadAudioFileBuffer(ctx, './assets/audio/elnineo-big-explosion.ogg', { peak: 0.95 })
      .then((b) => { if (b && this.ctx) this._boomBuffer = b; });

    // The shared jungle world: cue palette, living bed and drive music, at
    // contract levels that land on the same loudness as Level 1 (the levels
    // in jungleAudio.js are post-master, so undo this bus's master here).
    const norm = 1 / Math.max(0.05, this.volume);
    this._cues = createJungleCueBuffers(ctx);
    this.bed = new JungleBed(ctx, this.master, { level: AUDIO_LEVELS.bed * norm });
    this._musicBase = AUDIO_LEVELS.music * norm;
    this._startMusicLoop();
    this.ready = true;
  }

  _noiseLoop(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return { src, filter, gain };
  }

  /**
   * The car's engine: a four-cylinder, written sample by sample once
   * (_engineCycle) and looped, played faster for higher revs. Through a soft
   * clip (grit when the throttle is down), an exhaust resonance and a low-pass
   * that opens with load, with the intake's hiss on top, a low rumble under
   * it, a gear whine, and the turbo's whistle on boost. update() drives the
   * revs through a 5-speed box, dips it on each shift, crackles on the
   * overrun, and makes a damaged engine misfire.
   */
  _buildEngine() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._engineCycle();
    src.loop = true;
    src.playbackRate.value = 0.9;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this._clipCurve(2.2);
    shaper.oversample = '2x';
    const exhaust = ctx.createBiquadFilter(); exhaust.type = 'peaking'; exhaust.frequency.value = 150; exhaust.Q.value = 1.1; exhaust.gain.value = 6;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 0.6;
    const shift = ctx.createGain(); shift.gain.value = 1;     // dips: gear changes and misfires
    const out = ctx.createGain(); out.gain.value = 0;
    src.connect(shaper).connect(exhaust).connect(filter).connect(shift).connect(out).connect(this.master);
    src.start();
    const intake = this._noiseLoop('bandpass', 1100, 0.9);      // air rushing in, with the throttle
    const rumble = this._noiseLoop('lowpass', 120, 0.7);        // the body of it, under everything
    const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 600;
    const whineGain = ctx.createGain(); whineGain.gain.value = 0;
    whine.connect(whineGain).connect(this.master); whine.start();
    const turbo = ctx.createOscillator(); turbo.type = 'sine'; turbo.frequency.value = 1400;
    const turboGain = ctx.createGain(); turboGain.gain.value = 0;
    turbo.connect(turboGain).connect(this.master); turbo.start();
    this.engine = { src, shaper, exhaust, filter, shift, out, intake, rumble, whine, whineGain, turbo, turboGain, gear: 0, lastThrottle: false };
  }

  /**
   * The recorded engine (domasx2's loop, a real car) in place of the written
   * one: the same chain after it, so the revs, shifts, misfires and overrun
   * all still work, with a lighter clip and less colour from the exhaust
   * filter, since the recording has its own.
   */
  _useRecordedEngine(buf) {
    const E = this.engine, ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.8;
    src.connect(E.shaper);
    src.start();
    try { E.src.stop(); } catch { /* already stopped */ }
    E.src.disconnect();
    E.src = src;
    E.recorded = true;
    E.shaper.curve = this._clipCurve(1.1);
    E.exhaust.gain.value = 2;
  }

  /**
   * One second of a four-cylinder engine at 1000 rpm: a firing every 30 ms
   * (four to two turns of the crank), each a sharp crack that rings down
   * through the exhaust's few resonances, every cylinder a little different
   * and every cycle a little off the last, so looped it rumbles, not buzzes.
   */
  _engineCycle() {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const cycle = 0.12, cycles = 8;
    const buf = ctx.createBuffer(1, Math.round(sr * cycle * cycles), sr);
    const d = buf.getChannelData(0);
    const cyl = [1, 0.84, 0.95, 0.78];
    const modes = [[92, 0.032, 1], [186, 0.018, 0.55], [415, 0.008, 0.3], [1240, 0.0028, 0.14]]; // Hz, decay s, level
    const ring = Math.floor(0.07 * sr);
    for (let c = 0; c < cycles; c++) {
      for (let k = 0; k < 4; k++) {
        const t0 = c * cycle + k * (cycle / 4) + (Math.random() - 0.5) * 0.0016;
        const amp = cyl[k] * (0.82 + Math.random() * 0.36);
        const start = Math.floor(t0 * sr);
        for (let i = 0; i < ring; i++) {
          const t = i / sr;
          let v = (Math.random() * 2 - 1) * 0.3 * Math.exp(-t / 0.0035); // the crack of the firing
          for (const [f, dec, lvl] of modes) v += lvl * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / dec);
          d[(start + i) % d.length] += v * amp; // wraps, so the loop has no seam
        }
      }
    }
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < d.length; i++) d[i] *= 0.8 / (peak || 1);
    return buf;
  }

  /** A soft-clipping curve: more `drive`, more grit. */
  _clipCurve(drive) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return curve;
  }

  _buildSiren() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 800;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2200;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    osc.connect(filter).connect(gain).connect(pan).connect(this.master); osc.start();
    this.siren = { osc, gain, pan, phase: 0 };
  }

  _buildHandlerEngine() {
    // The Handler's ranger: a diesel — deeper and lumpier than the player's
    // engine, with an uneven firing thump under it. update() fades it by
    // his distance, so you hear him gaining on you.
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 240; filter.Q.value = 0.7;
    const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 34;
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = 68;
    const body = ctx.createGain(); body.gain.value = 0.7;
    const thump = ctx.createOscillator(); thump.frequency.value = 8.5;
    const thumpDepth = ctx.createGain(); thumpDepth.gain.value = 0.35;
    thump.connect(thumpDepth).connect(body.gain);
    a.connect(filter); b.connect(filter);
    filter.connect(body).connect(out).connect(this.master);
    a.start(); b.start(); thump.start();
    this.handlerEngine = { a, b, thump, filter, out };
  }

  _buildDrone() {
    const ctx = this.ctx;
    const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 150;
    const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 151.5;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 0.9;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    a.connect(filter); b.connect(filter);
    filter.connect(gain).connect(pan).connect(this.master);
    a.start(); b.start();
    return { a, b, gain, pan };
  }

  /* ======================== the drive loop ======================== */

  /**
   * The 'drive' arrangement of the adventure theme, from the shared jungle
   * engine — the same chords and melody as the intro's, Level 1's and
   * Level 3's music, moving faster for the road. A looping buffer rather
   * than a scheduler, so it also plays in the car picker and on the end
   * cards with no per-frame help. N toggles the music on its own.
   */
  _startMusicLoop() {
    const ctx = this.ctx;
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.gain.setTargetAtTime(this.musicOn ? this._musicBase : 0, ctx.currentTime + 0.5, 1.5);   // fade in
    this.music.connect(musicVolumeNode(ctx)).connect(this.master); // through the OPTIONS music volume
    this._musicSrc = ctx.createBufferSource();
    this._musicSrc.buffer = createJungleMusicBuffer(ctx, 'drive');
    this._musicSrc.loop = true;
    this._musicSrc.connect(this.music);
    this._musicSrc.start();
    // Level 2's own score (audio/chaseScore.js 'drive') replaces the
    // arrangement once it has rendered; the gain bus is untouched, so N and
    // ducking keep working. (The menu's stock track used to play here.)
    renderScore('drive', ctx.sampleRate).then((buf) => {
      if (!buf || !this.ctx || !this.music) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.music);
      src.start();
      try { this._musicSrc.stop(); } catch { /* already stopped */ }
      this._musicSrc = src;
    });
  }

  /** Dips the drive loop under a cue, then eases it back — effects first. */
  _duck(depth = 0.5, hold = 0.6) {
    if (!this.music || !this.ready) return;
    const t = this.ctx.currentTime;
    const g = this.music.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0.02, this._musicBase * (1 - depth)), t, 0.06);
    g.setTargetAtTime(this.musicOn ? this._musicBase : 0, t + hold, 0.5);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? this._musicBase : 0, this.ctx.currentTime, 0.4);
  }

  /* ======================== per frame ======================== */

  update(dt, s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const smooth = (param, value, tc = 0.06) => param.setTargetAtTime(value, t, tc);

    // ---- engine: a 5-speed box, so you hear it rev, shift and come off the throttle ----
    const v = Math.max(0, Math.abs(s.speed) / Math.max(1, s.maxSpeed));
    // 0..1 how wrecked the car is (s.health is 0..1)
    const dmg = s.health == null ? 0 : Math.max(0, Math.min(1, 1 - s.health));
    const gears = [0, 0.18, 0.36, 0.56, 0.78, 1.25];
    let g = 0;
    while (g < gears.length - 2 && v > gears[g + 1]) g++;
    const inGear = Math.min(1, (v - gears[g]) / (gears[g + 1] - gears[g]));
    const rpm = 0.25 + inGear * 0.75;
    const E = this.engine;
    if (!this._engineOff) {
      const revs = v < 0.02 ? 850 + (s.throttle ? 900 : 0) : 1500 + rpm * 5000 + (s.boosting ? 600 : 0);
      // the recording is pitched up with the revs (idle at 0.8x, the limiter at ~2.5x); the written one is at 1000 rpm
      const revN = Math.max(0, Math.min(1, (revs - 850) / 6250));
      smooth(E.src.playbackRate, E.recorded ? 0.8 + revN * 1.75 : revs / 1000, 0.07);
      smooth(E.filter.frequency, E.recorded ? 1600 + rpm * 2600 + (s.throttle ? 2600 : 0) : 500 + rpm * 1400 + (s.throttle ? 1500 : 0), 0.08);
      smooth(E.out.gain, 0.06 + (s.throttle ? 0.07 : 0.03) + v * 0.04, 0.1);
      smooth(E.intake.gain.gain, s.throttle ? 0.012 + rpm * 0.03 : 0.004, 0.08);
      smooth(E.intake.filter.frequency, 700 + rpm * 1800, 0.1);
      smooth(E.rumble.gain.gain, 0.025 + v * 0.03 + dmg * 0.04, 0.2);
      smooth(E.whine.frequency, 300 + v * 1500, 0.1);
      smooth(E.whineGain.gain, 0.004 + v * 0.01, 0.2);
      smooth(E.turbo.frequency, 1300 + v * 700, 0.15);
      smooth(E.turboGain.gain, s.boosting ? 0.012 : 0, 0.12);
      if (g > E.gear && s.throttle) {
        // up a gear: the drive cuts for a beat (and on boost the turbo dumps)
        E.shift.gain.cancelScheduledValues(t);
        E.shift.gain.setTargetAtTime(0.3, t, 0.012);
        E.shift.gain.setTargetAtTime(1, t + 0.09, 0.03);
        if (s.boosting) this._burst({ type: 'highpass', freq: 2600, peak: 0.05, attack: 0.005, decay: 0.28 });
      }
      E.gear = g;
      if (E.lastThrottle && !s.throttle && rpm > 0.55 && v > 0.2) this._overrun();
      E.lastThrottle = !!s.throttle;
      // a damaged engine misfires: the odd firing goes missing, more often the worse it is
      if (dmg > 0.35 && Math.random() < dt * (dmg - 0.3) * 6) {
        E.shift.gain.setTargetAtTime(0.15, t, 0.005);
        E.shift.gain.setTargetAtTime(1, t + 0.04 + Math.random() * 0.05, 0.02);
      }
    }
    // the flames: a roar while it burns, fading once it stops being told it's burning
    this._burnHold = Math.max(0, (this._burnHold || 0) - dt);
    if (this.flame) smooth(this.flame.gain.gain, this._burnHold > 0 ? 0.07 : 0, this._burnHold > 0 ? 0.3 : 0.8);

    // ---- mud squelch riding the speed; the rattle with the damage ----
    smooth(this.mud.gain.gain, v > 0.03 ? 0.02 + v * 0.1 : 0, 0.25);
    smooth(this.rattle.gain.gain, dmg * (0.05 + v * 0.09), 0.25);

    // ---- tyres, rails, wind ----
    smooth(this.screech.gain.gain, s.skid ? 0.14 : 0, s.skid ? 0.03 : 0.12);
    smooth(this.scrape.gain.gain, Math.min(0.3, s.scrape * 0.4), s.scrape ? 0.02 : 0.15);
    smooth(this.wind.gain.gain, 0.01 + v * 0.07 + (s.falling ? 0.12 : 0), 0.3);
    smooth(this.falls.gain.gain, Math.min(0.35, s.falls || 0), 0.4);

    // ---- siren: slow wail while chasing, fast yelp while attacking ----
    const h = s.handler;
    if (h) {
      this.siren.phase += dt * (h.attacking ? 6.5 : 0.65);
      const k = 0.5 + 0.5 * Math.sin(this.siren.phase * Math.PI * 2);
      smooth(this.siren.osc.frequency, h.attacking ? 900 + k * 500 : 620 + k * 560, 0.02);
      smooth(this.siren.gain.gain, 0.07 / (1 + Math.max(0, h.dist - 4) / 14), 0.1);
      smooth(this.siren.pan.pan, Math.max(-0.8, Math.min(0.8, -h.dx / 10)), 0.1);
      // his diesel: revs up when he attacks, louder as he closes in
      const he = this.handlerEngine;
      if (he) {
        const near = 1 / (1 + Math.max(0, h.dist - 3) / 15);
        smooth(he.a.frequency, 34 + (h.attacking ? 12 : 0), 0.15);
        smooth(he.b.frequency, 68 + (h.attacking ? 24 : 0), 0.15);
        smooth(he.thump.frequency, h.attacking ? 12 : 8.5, 0.25);
        smooth(he.filter.frequency, h.attacking ? 380 : 220, 0.2);
        smooth(he.out.gain, 0.4 * near, 0.15);
      }
    }

    // ---- drone rotors ----
    for (let i = 0; i < this.drones.length; i++) {
      const voice = this.drones[i];
      const d = s.drones && s.drones[i];
      if (!d) { smooth(voice.gain.gain, 0, 0.15); continue; }
      const pitch = d.dive ? 260 + d.dive * 420 : 150 + Math.sin(t * 7 + i) * 6;
      smooth(voice.a.frequency, pitch, 0.03);
      smooth(voice.b.frequency, pitch * 1.01, 0.03);
      smooth(voice.gain.gain, 0.09 / (1 + d.dist / 9), 0.08);
      smooth(voice.pan.pan, Math.max(-0.8, Math.min(0.8, -d.dx / 8)), 0.1);
    }

    // ---- the living bed: the same jungle as Level 1 and the intro, sliding
    // toward road, rain and night as the run goes on. Level02 feeds the
    // jungle/night/rain params; the road bed swells with the speed. ----
    if (this.bed) {
      this.bed.update(dt, {
        night: s.night ?? 0,
        rain: s.rain ?? 0,
        river: 0.5,
        road: v,
        birds: (s.jungle ?? 1) * 0.45,   // the wildlife thins with the jungle
      });
    }
  }

  /* ======================== one-shots ======================== */

  _env(gainNode, peak, attack, decay, at) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  _burst({ type = 'lowpass', freq = 1000, q = 0.7, peak = 0.3, attack = 0.003, decay = 0.3, sweepTo = null, pan = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx, at = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + attack + decay);
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    this._env(g, peak, attack, decay, at);
    src.start(at, Math.random() * 1.5);
    src.stop(at + attack + decay + 0.05);
  }

  _tone({ type = 'sine', freq = 440, to = null, peak = 0.2, attack = 0.005, decay = 0.2, delay = 0, pan = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx, at = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    this._env(g, peak, attack, decay, at);
    o.start(at); o.stop(at + attack + decay + 0.05);
  }

  /** Fires one of the shared jungle cues (jungleAudio.js) through the bus. */
  _cue(name, { volume = 0.8, rate = 1 } = {}) {
    if (!this.ready) return;
    const buffer = this._cues && this._cues[name];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  /**
   * Car-on-car or car-on-traffic hit, 0..1: the thud of the bodies meeting,
   * the panels crumpling (noise rung through a few metal resonances, in quick
   * fits), the glass on a hard one, and bits of trim pinging off after.
   */
  crash(impact = 0.6, pan = 0) {
    if (!this.ready) return;
    const k = Math.max(0.2, Math.min(1, impact));
    if (this._crashBuffer && this._crashHit != null) {
      // the real thing: the recorded wreck from the moment the cars meet, cut short (longer the
      // harder the hit), with a thud under it for the weight, and the glass on a hard one
      const ctx = this.ctx, at = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._crashBuffer;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = ctx.createGain();
      const len = 0.6 + 0.6 * k;
      g.gain.setValueAtTime(0.24 + 0.38 * k, at);
      g.gain.setTargetAtTime(0, at + len - 0.15, 0.06);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      src.connect(g).connect(p).connect(this.master);
      src.start(at, Math.max(0, this._crashHit - 0.06), len);
      this._tone({ freq: 110, to: 36, peak: 0.3 * k + 0.08, attack: 0.002, decay: 0.32, pan });
      if (k > 0.6) this._cue('glass', { volume: 0.2 * k + 0.06, rate: 0.96 + Math.random() * 0.08 });
      if (k > 0.7) this._duck(0.3, 0.4);
      return;
    }
    this._tone({ freq: 120, to: 34, peak: 0.42 * k + 0.1, attack: 0.002, decay: 0.38, pan });       // the bodies meeting
    this._burst({ freq: 420, peak: 0.3 * k + 0.08, attack: 0.002, decay: 0.22, pan });               // ...and the air in them
    for (let i = 0; i < 3 + Math.round(k * 3); i++) {
      const f = [520, 980, 1650, 2900][i % 4] * (0.9 + Math.random() * 0.2);
      this._burstAt(i * 0.028 + Math.random() * 0.02, { type: 'bandpass', freq: f, q: 7, peak: 0.12 * k + 0.03, attack: 0.002, decay: 0.09 + Math.random() * 0.08, pan });
    }
    this._burst({ type: 'highpass', freq: 2200, peak: 0.08 * k, attack: 0.01, decay: 0.35 + 0.3 * k, sweepTo: 900, pan }); // the scrape
    if (k > 0.55) this._cue('glass', { volume: 0.24 * k + 0.08, rate: 0.96 + Math.random() * 0.08 });
    for (let i = 0; i < Math.round(k * 4); i++) {                                                    // trim pinging off
      const f = 2200 + Math.random() * 2600;
      this._tone({ type: 'triangle', freq: f, to: f * 0.96, peak: 0.025 * k, attack: 0.001, decay: 0.05, delay: 0.12 + i * 0.09 + Math.random() * 0.12, pan });
    }
    if (k > 0.7) this._duck(0.3, 0.4);
  }

  /** _burst, `delay` s from now. */
  _burstAt(delay, opts) {
    if (delay <= 0) return this._burst(opts);
    setTimeout(() => this._burst(opts), delay * 1000);
  }

  /** Off the throttle at high revs: the exhaust pops and crackles for a moment. */
  _overrun() {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const at = 0.05 + i * (0.07 + Math.random() * 0.1);
      this._burstAt(at, { type: 'lowpass', freq: 1500 + Math.random() * 900, q: 0.8, peak: 0.07 + Math.random() * 0.05, attack: 0.001, decay: 0.04 });
      this._tone({ freq: 95 + Math.random() * 30, to: 50, peak: 0.06, attack: 0.001, decay: 0.07, delay: at });
    }
  }

  /**
   * Hitting a traffic car: the recorded wreck — ~5 s of swerve and crunch,
   * restarted (never stacked) if one is already going. Falls back to the
   * synthesised wreck below until the file decodes.
   */
  trafficCrash(impact = 0.7) {
    const k = Math.max(0.25, Math.min(1, impact));
    if (this._crashBuffer && this.ctx) {
      if (this._crashSrc) { try { this._crashSrc.stop(); } catch { /* already stopped */ } }
      const src = this.ctx.createBufferSource();
      src.buffer = this._crashBuffer;
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
      const g = this.ctx.createGain();
      g.gain.value = 0.55 + 0.4 * k;
      src.connect(g).connect(this.master);
      src.start();
      this._crashSrc = src;
      this._duck(0.4, 0.7);
      return;
    }
    // the fallback body: a deep thud under a long crunch
    this._tone({ freq: 72, to: 30, peak: 0.42 * k + 0.08, decay: 0.5 });
    this._burst({ freq: 2400, peak: 0.42 * k, attack: 0.002, decay: 0.32, sweepTo: 380 });
    this._burst({ type: 'bandpass', freq: 850, q: 0.9, peak: 0.34 * k, attack: 0.002, decay: 0.5 });
    // crumpling panels: a scatter of heavy, detuned clangs
    for (let i = 0; i < 4; i++) {
      const f = 130 + Math.random() * 240;
      this._tone({ type: 'square', freq: f, to: f * 0.8, peak: 0.07 * k, decay: 0.16 + i * 0.02, delay: i * 0.035 + Math.random() * 0.02 });
    }
    // the glass goes
    this._cue('glass', { volume: 0.3 * k + 0.12, rate: 0.96 + Math.random() * 0.08 });
    // something metallic rings out of the wreck
    const rf = 1700 + Math.random() * 900;
    this._tone({ freq: rf, to: rf * 0.92, peak: 0.05 * k, decay: 0.8, delay: 0.06 });
    this._duck(0.35, 0.5);
  }

  /** Light door-to-door bump. */
  thump(impact = 0.3, pan = 0) {
    this._burst({ freq: 700, peak: 0.12 + 0.15 * impact, decay: 0.12, pan });
    this._tone({ freq: 75, to: 45, peak: 0.15 * impact + 0.05, decay: 0.15 });
  }

  gunshot(dist = 10, pan = 0) {
    const k = 1 / (1 + dist / 25);
    this._burst({ type: 'highpass', freq: 900, peak: 0.45 * k, attack: 0.001, decay: 0.09, pan });
    this._tone({ type: 'triangle', freq: 240, to: 70, peak: 0.25 * k, attack: 0.001, decay: 0.12 });
  }

  /** Laser sight charging up before the shots. */
  laser(duration = 1) {
    this._tone({ type: 'sine', freq: 500, to: 1600, peak: 0.035, attack: duration * 0.8, decay: 0.15 });
  }

  tyrePop() {
    this._burst({ freq: 2500, peak: 0.45, attack: 0.001, decay: 0.06 });
    this._burst({ type: 'bandpass', freq: 4200, q: 1.5, peak: 0.12, attack: 0.02, decay: 0.9, sweepTo: 1500 });   // hiss
  }

  /**
   * An explosion `dist` m away: the crack, a deep boom that falls away (noise
   * swept down through a low-pass, a sub-bass drop under it), the fireball's
   * roar after, and wreckage coming down for a second or two.
   */
  explosion(dist = 5) {
    if (!this.ready) return;
    const k = 1 / (1 + dist / 18);
    if (this._boomBuffer) {
      // the real thing (elnineo's, CC0), with a sub-bass drop under it you feel more than hear
      const src = this.ctx.createBufferSource();
      src.buffer = this._boomBuffer;
      src.playbackRate.value = 0.92 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = 1.1 * k;
      src.connect(g).connect(this.master);
      src.start();
      this._tone({ freq: 62, to: 24, peak: 0.45 * k, attack: 0.005, decay: 1.3 });
      this._duck(0.6, 1.2);
      return;
    }
    this._burst({ type: 'highpass', freq: 1800, peak: 0.5 * k, attack: 0.001, decay: 0.05 });               // the crack
    this._burst({ freq: 2600, q: 0.8, peak: 0.75 * k, attack: 0.004, decay: 1.5, sweepTo: 70 });            // the boom
    this._tone({ freq: 70, to: 24, peak: 0.6 * k, attack: 0.005, decay: 1.4 });                             // felt more than heard
    this._tone({ type: 'triangle', freq: 45, to: 30, peak: 0.25 * k, attack: 0.02, decay: 1.0, delay: 0.05 });
    this._burstAt(0.15, { type: 'bandpass', freq: 380, q: 0.6, peak: 0.28 * k, attack: 0.15, decay: 2.2, sweepTo: 160 }); // the fireball
    for (let i = 0; i < Math.round(3 + k * 6); i++) {                                                       // wreckage coming down
      const at = 0.35 + Math.random() * 1.6;
      const f = 300 + Math.random() * 1400;
      this._tone({ type: 'square', freq: f, to: f * 0.7, peak: 0.04 * k, attack: 0.001, decay: 0.08 + Math.random() * 0.1, delay: at });
      this._burstAt(at, { type: 'bandpass', freq: 900 + Math.random() * 1600, q: 3, peak: 0.05 * k, attack: 0.001, decay: 0.06 });
    }
    this._duck(0.6, 1.2);
  }

  /**
   * A car on fire: called every frame while it burns. The flames roar (a
   * loop that update() fades in and out), crackle, and now and then the fuel
   * catches with a whump, or a small blast.
   */
  fire(dt) {
    this._burnHold = 0.3;
    this._fireT = (this._fireT || 0) - dt;
    if (this._fireT > 0) return;
    this._fireT = 0.04 + Math.random() * 0.16;
    this._burst({ type: 'bandpass', freq: 1800 + Math.random() * 2600, q: 1.4, peak: 0.035 + Math.random() * 0.05, attack: 0.002, decay: 0.03 + Math.random() * 0.05 });
    if (Math.random() < 0.12) this._tone({ freq: 70 + Math.random() * 40, to: 40, peak: 0.07, decay: 0.2 }); // a whump
    if (Math.random() < 0.025) {                                                                              // a fuel pop
      this._burst({ freq: 1400, peak: 0.16, attack: 0.002, decay: 0.35, sweepTo: 120 });
      this._tone({ freq: 60, to: 30, peak: 0.14, attack: 0.003, decay: 0.4 });
    }
  }

  /** Spike strip hitting the tarmac. */
  clatter() {
    for (let i = 0; i < 5; i++) this._tone({ type: 'square', freq: 1400 + Math.random() * 1600, peak: 0.03, decay: 0.06, delay: i * 0.05 });
  }

  /** Two short beeps: something's coming. */
  warn() {
    this._tone({ type: 'square', freq: 880, peak: 0.07, decay: 0.08 });
    this._tone({ type: 'square', freq: 880, peak: 0.07, decay: 0.08, delay: 0.14 });
  }

  /** The Handler's diesel horn — his telegraph, in his voice. */
  horn() {
    this._tone({ type: 'square', freq: 185, peak: 0.13, attack: 0.03, decay: 0.55 });
    this._tone({ type: 'square', freq: 247, peak: 0.13, attack: 0.03, decay: 0.55 });
    this._duck(0.25, 0.4);
  }

  /**
   * Reward cue — the shared pickup voices, one per kind: the life-saver
   * reads as a warm kit snapping open, the heart as a golden sparkle,
   * nitro as a rush of air, the shield as a glassy bubble going up. Same
   * buffers and headroom as Level 1's coins.
   */
  pickup(kind = 'REPAIR') {
    const name = {
      REPAIR: 'pickupRepair', HEART: 'pickupHeart', NITRO: 'pickupNitro', SHIELD: 'pickupShield',
    }[kind] || 'pickupRepair';
    this._cue(name, { volume: 0.65, rate: 0.97 + Math.random() * 0.06 });
    this._duck(0.5, 0.35);
  }

  /** Health loss: the shared "that cost you" cue, scaled by how bad it was. */
  hurt(severity = 1) {
    const k = Math.max(0, Math.min(1, severity));
    this._cue('hurt', { volume: 0.5 + 0.4 * k, rate: 0.94 + Math.random() * 0.08 });
    this._duck(0.6, 0.4);
  }

  /** Reaching the end of the road: the same fanfare Level 1 plays on its win. */
  win() {
    this._cue('win', { volume: 0.85 });
    this._duck(0.55, 2.2);
  }

  /** Game over: the shared dark falling stab. */
  defeat() {
    this._cue('defeat', { volume: 0.8 });
    this._duck(0.6, 1.5);
  }

  /** The car hitting the pool at the bottom of the falls. */
  splash() {
    this._burst({ type: 'lowpass', freq: 2400, peak: 0.7, attack: 0.005, decay: 1.6, sweepTo: 300 });
    this._burst({ type: 'highpass', freq: 3000, peak: 0.25, attack: 0.02, decay: 1.2 });
    this._tone({ freq: 70, to: 30, peak: 0.45, decay: 0.8 });
  }

  dodge() {
    this._tone({ freq: 660, peak: 0.08, decay: 0.12 });
    this._tone({ freq: 990, peak: 0.08, decay: 0.2, delay: 0.09 });
  }

  /* ======================== control ======================== */

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** Fades the engine out (game over). */
  silenceEngine() {
    if (!this.ready) return;
    this._engineOff = true; // update() stops driving it, so it stays quiet
    const t = this.ctx.currentTime;
    this.engine.out.gain.setTargetAtTime(0, t, 0.3);
    this.engine.turboGain.gain.setTargetAtTime(0, t, 0.1);
    this.engine.rumble.gain.gain.setTargetAtTime(0, t, 0.3);
    this.engine.intake.gain.gain.setTargetAtTime(0, t, 0.2);
    this.engine.whineGain.gain.setTargetAtTime(0, t, 0.2);
    this.screech.gain.gain.setTargetAtTime(0, t, 0.1);
    if (this.mud) this.mud.gain.gain.setTargetAtTime(0, t, 0.2);
    if (this.rattle) this.rattle.gain.gain.setTargetAtTime(0, t, 0.2);
    if (this.handlerEngine) this.handlerEngine.out.gain.setTargetAtTime(0, t, 0.2);
  }

  dispose() {
    window.removeEventListener('pointerdown', this._onGesture);
    window.removeEventListener('keydown', this._onKey);
    if (this.bed) { this.bed.dispose(); this.bed = null; }
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.ready = false;
  }
}
