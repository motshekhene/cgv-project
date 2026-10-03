/**
 * Level2Sound — Member 2A
 *
 * Every Level 2 sound is synthesised live with the Web Audio API — there are
 * no audio files, so nothing to download, license or 404.
 *
 *   continuous   engine (RPM through 5 gears + turbo whine on boost),
 *                Handler siren (wail when chasing, fast yelp while attacking,
 *                panned and faded by distance), tyre screech, rail scrape,
 *                wind, drone rotor buzz (pitch climbs on a dive),
 *                jungle ambience (insects + random bird calls)
 *   one-shots    crash / bump, gunshot, tyre pop, explosion, laser-sight
 *                charge, spike-strip clatter, warning beeps, dodge chime
 *
 * Browsers only allow audio after a click or key press, so the AudioContext
 * is created on the first one (the car picker needs one anyway). M mutes.
 *
 *   this.sound = new Level2Sound();
 *   this.sound.update(dt, { speed, maxSpeed, throttle, boosting, skid, scrape,
 *                           handler: { dist, dx, attacking }, drones: [{ dist, dx, dive }] });
 *   this.sound.crash(0.8);  this.sound.gunshot(12);  ...
 *   this.sound.dispose();   // in teardown
 */
export class Level2Sound {
  constructor({ volume = 0.55 } = {}) {
    this.volume = volume;
    this.muted = false;
    this.ctx = null;
    this._onGesture = () => this._start();
    this._onKey = (e) => {
      if (e.key === 'm' || e.key === 'M') this.setMuted(!this.muted);
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
    this.drones = [this._buildDrone(), this._buildDrone()];
    this._buildJungle();
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
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800; filter.Q.value = 2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.5); }
    shaper.curve = curve;
    const oscs = [['sawtooth', 0], ['square', 7], ['sine', -1200]].map(([type, detune]) => {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = detune; o.frequency.value = 50;
      const g = ctx.createGain(); g.gain.value = type === 'sine' ? 0.8 : 0.35;
      o.connect(g).connect(shaper); o.start();
      return o;
    });
    shaper.connect(filter).connect(out).connect(this.master);
    // turbo whine for boost
    const turbo = ctx.createOscillator(); turbo.type = 'sine'; turbo.frequency.value = 1800;
    const turboGain = ctx.createGain(); turboGain.gain.value = 0;
    turbo.connect(turboGain).connect(this.master); turbo.start();
    this.engine = { oscs, filter, out, turbo, turboGain };
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

  _buildJungle() {
    // insects: a faint shimmering whine
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4700;
    const trem = ctx.createOscillator(); trem.frequency.value = 23;
    const tremGain = ctx.createGain(); tremGain.gain.value = 0.006;
    const g = ctx.createGain(); g.gain.value = 0.006;
    trem.connect(tremGain).connect(g.gain);
    o.connect(g).connect(this.master); o.start(); trem.start();
    this._nextBird = 1.5;
  }

  /* ======================== per frame ======================== */

  update(dt, s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const smooth = (param, value, tc = 0.06) => param.setTargetAtTime(value, t, tc);

    // ---- engine: fake 5-speed gearbox, so you hear it shift ----
    const v = Math.max(0, Math.abs(s.speed) / Math.max(1, s.maxSpeed));
    const gears = [0, 0.18, 0.36, 0.56, 0.78, 1.25];
    let g = 0;
    while (g < gears.length - 2 && v > gears[g + 1]) g++;
    const inGear = Math.min(1, (v - gears[g]) / (gears[g + 1] - gears[g]));
    const rpm = 0.25 + inGear * 0.75;
    const base = 38 + rpm * 70 + g * 6 + (s.boosting ? 14 : 0);
    for (const o of this.engine.oscs) smooth(o.frequency, base, 0.04);
    smooth(this.engine.filter.frequency, 500 + rpm * 1600 + (s.throttle ? 600 : 0), 0.05);
    smooth(this.engine.out.gain, 0.05 + (s.throttle ? 0.1 : 0.04) + v * 0.05);
    smooth(this.engine.turbo.frequency, 1700 + v * 1400, 0.1);
    smooth(this.engine.turboGain.gain, s.boosting ? 0.03 : 0, 0.08);

    // ---- tyres, rails, wind ----
    smooth(this.screech.gain.gain, s.skid ? 0.14 : 0, s.skid ? 0.03 : 0.12);
    smooth(this.scrape.gain.gain, Math.min(0.3, s.scrape * 0.4), s.scrape ? 0.02 : 0.15);
    smooth(this.wind.gain.gain, 0.01 + v * 0.07, 0.3);

    // ---- siren: slow wail while chasing, fast yelp while attacking ----
    const h = s.handler;
    if (h) {
      this.siren.phase += dt * (h.attacking ? 6.5 : 0.65);
      const k = 0.5 + 0.5 * Math.sin(this.siren.phase * Math.PI * 2);
      smooth(this.siren.osc.frequency, h.attacking ? 900 + k * 500 : 620 + k * 560, 0.02);
      smooth(this.siren.gain.gain, 0.07 / (1 + Math.max(0, h.dist - 4) / 14), 0.1);
      smooth(this.siren.pan.pan, Math.max(-0.8, Math.min(0.8, -h.dx / 10)), 0.1);
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

    // ---- jungle: a bird call every few seconds, somewhere off the road ----
    this._nextBird -= dt;
    if (this._nextBird <= 0) {
      this._nextBird = 2 + Math.random() * 5;
      this._bird();
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

  /** Car-on-car or car-on-traffic hit, 0..1. */
  crash(impact = 0.6, pan = 0) {
    const k = Math.max(0.2, Math.min(1, impact));
    this._burst({ freq: 1400, peak: 0.25 + 0.35 * k, decay: 0.25 + 0.25 * k, sweepTo: 300, pan });
    this._tone({ freq: 90, to: 38, peak: 0.35 * k + 0.1, decay: 0.3 });
    this._tone({ type: 'square', freq: 180 + Math.random() * 120, to: 90, peak: 0.06 * k, decay: 0.12 });   // panel clank
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

  /** Rising chime: dodged it. */
  dodge() {
    this._tone({ freq: 660, peak: 0.08, decay: 0.12 });
    this._tone({ freq: 990, peak: 0.08, decay: 0.2, delay: 0.09 });
  }

  _bird() {
    const pan = Math.random() * 1.6 - 0.8;
    const f = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this._tone({ freq: f, to: f * (1.15 + Math.random() * 0.3), peak: 0.02, decay: 0.07, delay: i * 0.11, pan });
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
    this.screech.gain.gain.setTargetAtTime(0, t, 0.1);
  }

  dispose() {
    window.removeEventListener('pointerdown', this._onGesture);
    window.removeEventListener('keydown', this._onKey);
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.ready = false;
  }
}
