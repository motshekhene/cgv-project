/**
 * Level2Sound — Member 2A
 *
 * Every Level 2 sound comes from the shared jungle engine
 * (src/audio/jungleAudio.js) — synthesised live with the Web Audio API,
 * plus the recorded Pixabay assets (the theme loop and the traffic wreck,
 * peak-normalised on load; see public/assets/audio/CREDITS.md). Either way
 * the same buffers, the same headroom: Level 2 sounds like the same world,
 * at the same loudness, as the intro and Level 1.
 *
 *   music        the game's theme — the recorded loop, with the synthesised
 *                'drive' arrangement as the fallback — on the same music
 *                bus, so N and ducking work unchanged
 *   continuous   smooth engine hum (RPM through 5 gears, soft turbo on boost)
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
  loadJungleTheme,
} from "../../audio/jungleAudio.js";

export class Level2Sound {
  constructor({ volume = 0.75 } = {}) {
    this.volume = volume;
    this.muted = false;
    this.musicOn = true;
    this.ctx = null;
    this._onGesture = () => this._start();
    this._onKey = (e) => {
      if (e.key === 'm' || e.key === 'M') this.setMuted(!this.muted);
      if (e.key === 'n' || e.key === 'N') this.setMusic(!this.musicOn);
      this._start();
    };
    window.addEventListener('pointerdown', this._onGesture);
    window.addEventListener('keydown', this._onKey);
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
    this._buildHandlerEngine();

    // the recorded traffic wreck (Pixabay, ~5 s of swerve and crunch) —
    // trafficCrash prefers it the moment it's decoded
    loadAudioFileBuffer(ctx, '/assets/audio/rsf_studios-car-crash-swerving-and-crash-592672.mp3', { peak: 0.9 })
      .then((b) => { if (b && this.ctx) this._crashBuffer = b; });

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

  _buildEngine() {
    // a smooth, deep hum instead of the old buzzy saw/square + distortion:
    // a sine fundamental, a soft triangle an octave up, and a little filtered
    // rumble, all through a gentle low-pass. A slow "firing" wobble keeps it
    // from sounding like a test tone.
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500; filter.Q.value = 0.5;
    const mk = (type, gain) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 50;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g).connect(filter); o.start();
      return o;
    };
    const oscs = [mk('sine', 0.9), mk('triangle', 0.22)];
    oscs[1].detune.value = 1200 + 4;            // an octave up, a hair sharp: warmth
    // firing wobble: tremolo on the engine at a rate tied to rpm
    const wobble = ctx.createOscillator(); wobble.frequency.value = 18;
    const wobbleDepth = ctx.createGain(); wobbleDepth.gain.value = 0.18;
    const body = ctx.createGain(); body.gain.value = 0.82;
    wobble.connect(wobbleDepth).connect(body.gain); wobble.start();
    filter.connect(body).connect(out).connect(this.master);
    // rumble: brown-ish noise, very low
    const rumble = this._noiseLoop('lowpass', 140, 0.7);
    // soft turbo whistle for boost
    const turbo = ctx.createOscillator(); turbo.type = 'sine'; turbo.frequency.value = 1400;
    const turboGain = ctx.createGain(); turboGain.gain.value = 0;
    turbo.connect(turboGain).connect(this.master); turbo.start();
    this.engine = { oscs, filter, out, turbo, turboGain, wobble, rumble };
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
    this.music.connect(this.master);
    this._musicSrc = ctx.createBufferSource();
    this._musicSrc.buffer = createJungleMusicBuffer(ctx, 'drive');
    this._musicSrc.loop = true;
    this._musicSrc.connect(this.music);
    this._musicSrc.start();
    // the recorded theme replaces the arrangement when it decodes; the
    // gain bus is untouched, so N and ducking keep working
    loadJungleTheme(ctx).then((buf) => {
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

    // ---- engine: fake 5-speed gearbox, so you hear it shift ----
    const v = Math.max(0, Math.abs(s.speed) / Math.max(1, s.maxSpeed));
    // 0..1 how wrecked the car is (s.health is 0..1)
    const dmg = s.health == null ? 0 : Math.max(0, Math.min(1, 1 - s.health));
    const gears = [0, 0.18, 0.36, 0.56, 0.78, 1.25];
    let g = 0;
    while (g < gears.length - 2 && v > gears[g + 1]) g++;
    const inGear = Math.min(1, (v - gears[g]) / (gears[g + 1] - gears[g]));
    const rpm = 0.25 + inGear * 0.75;
    const base = 42 + rpm * 55 + g * 5 + (s.boosting ? 10 : 0);
    for (const o of this.engine.oscs) smooth(o.frequency, base, 0.08);
    smooth(this.engine.wobble.frequency, base / 3 + dmg * 9, 0.1);   // strain: the firing goes lumpy
    smooth(this.engine.filter.frequency, 260 + rpm * 520 + (s.throttle ? 180 : 0), 0.1);
    smooth(this.engine.out.gain, 0.05 + (s.throttle ? 0.06 : 0.025) + v * 0.03, 0.12);
    smooth(this.engine.rumble.gain.gain, 0.02 + v * 0.03 + dmg * 0.045, 0.2);
    smooth(this.engine.turbo.frequency, 1300 + v * 700, 0.15);
    smooth(this.engine.turboGain.gain, s.boosting ? 0.012 : 0, 0.12);

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

  /** Car-on-car or car-on-traffic hit, 0..1. */
  crash(impact = 0.6, pan = 0) {
    const k = Math.max(0.2, Math.min(1, impact));
    this._burst({ freq: 1400, peak: 0.25 + 0.35 * k, decay: 0.25 + 0.25 * k, sweepTo: 300, pan });
    this._tone({ freq: 90, to: 38, peak: 0.35 * k + 0.1, decay: 0.3 });
    this._tone({ type: 'square', freq: 180 + Math.random() * 120, to: 90, peak: 0.06 * k, decay: 0.12 });   // panel clank
    if (k > 0.55) this._cue('glass', { volume: 0.22 * k + 0.08, rate: 0.96 + Math.random() * 0.08 });   // the glass goes
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

  explosion(dist = 5) {
    const k = 1 / (1 + dist / 18);
    this._burst({ freq: 3200, peak: 0.6 * k, attack: 0.004, decay: 1.1, sweepTo: 140 });
    this._tone({ freq: 60, to: 28, peak: 0.5 * k, decay: 0.9 });
    this._duck(0.45, 0.5);
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
    const t = this.ctx.currentTime;
    this.engine.out.gain.setTargetAtTime(0, t, 0.3);
    this.engine.turboGain.gain.setTargetAtTime(0, t, 0.1);
    this.engine.rumble.gain.gain.setTargetAtTime(0, t, 0.3);
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
