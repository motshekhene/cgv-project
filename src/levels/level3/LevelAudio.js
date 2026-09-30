const clamp01 = (value) => Math.max(0, Math.min(1, value));

export class LevelAudio {
  constructor({ muted = false } = {}) {
    this.muted = !!muted;
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ambienceStarted = false;
    this.ambientNodes = [];
    this.unlockCleanups = [];
    this.steamTimer = 0;
    this.disposed = false;
  }

  attachUnlock(targets = []) {
    const unlock = () => this.unlock();
    for (const target of targets.filter(Boolean)) {
      target.addEventListener('pointerdown', unlock, { capture: true, once: true });
      target.addEventListener('keydown', unlock, { capture: true, once: true });
      this.unlockCleanups.push(() => {
        target.removeEventListener('pointerdown', unlock, true);
        target.removeEventListener('keydown', unlock, true);
      });
    }
  }

  unlock() {
    if (this.disposed) return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!this.context) {
      this.context = new AudioContextCtor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.38;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this._makeNoiseBuffer();
    }
    if (this.context.state === 'suspended') this.context.resume();
    this._startAmbience();
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (!this.context && !this.muted) this.unlock();
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.38, this.context.currentTime, 0.08);
    }
  }

  _makeNoiseBuffer() {
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = last * 0.985 + (Math.random() * 2 - 1) * 0.035;
      data[i] = last;
    }
    return buffer;
  }

  _startAmbience() {
    if (!this.context || this.ambienceStarted || this.disposed) return;
    this.ambienceStarted = true;
    const ctx = this.context;

    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noiseBuffer;
    rumble.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 145;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.19;
    rumble.connect(low);
    low.connect(rumbleGain);
    rumbleGain.connect(this.master);
    rumble.start();
    this.ambientNodes.push(rumble, low, rumbleGain);

    for (const [frequency, volume, type] of [[47, 0.025, 'sine'], [71, 0.012, 'triangle']]) {
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start();
      this.ambientNodes.push(oscillator, gain);
    }

    this._scheduleVent();
  }

  _scheduleVent() {
    if (this.disposed || !this.context) return;
    const delay = 4200 + Math.random() * 5200;
    this.steamTimer = window.setTimeout(() => {
      if (!this.muted) this._noiseBurst({ duration: 1.65, volume: 0.12, lowpass: 880, highpass: 120, attack: 0.28 });
      this._scheduleVent();
    }, delay);
  }

  _noiseBurst({ duration = 0.2, volume = 0.12, lowpass = 1000, highpass = 0, attack = 0.008 } = {}) {
    if (!this.context || this.muted || this.disposed) return;
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filters = [];
    let last = source;
    if (highpass > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;
      last.connect(filter);
      last = filter;
      filters.push(filter);
    }
    if (lowpass > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      last.connect(filter);
      last = filter;
      filters.push(filter);
    }
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + Math.max(0.003, attack));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    last.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      for (const filter of filters) filter.disconnect();
    };
  }

  _tone(frequency, duration, volume, type = 'sine', bend = 0) {
    if (!this.context || this.muted || this.disposed) return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * bend), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  play(event) {
    if (!this.context || this.muted || this.disposed) return;
    switch (event) {
      case 'swing':
        this._noiseBurst({ duration: 0.24, volume: 0.08, lowpass: 1200, highpass: 250, attack: 0.025 });
        break;
      case 'hit':
        this._noiseBurst({ duration: 0.16, volume: 0.2, lowpass: 420, highpass: 45, attack: 0.004 });
        this._tone(86, 0.14, 0.065, 'triangle', 0.68);
        break;
      case 'block':
        this._noiseBurst({ duration: 0.18, volume: 0.11, lowpass: 1650, highpass: 550, attack: 0.003 });
        this._tone(410, 0.16, 0.035, 'triangle', 0.74);
        break;
      case 'parry':
        this._noiseBurst({ duration: 0.22, volume: 0.08, lowpass: 2400, highpass: 800, attack: 0.002 });
        this._tone(920, 0.2, 0.08, 'sine', 0.82);
        this._tone(1380, 0.12, 0.035, 'sine', 0.92);
        break;
      case 'damage':
        this._noiseBurst({ duration: 0.28, volume: 0.22, lowpass: 520, highpass: 45, attack: 0.003 });
        this._tone(65, 0.22, 0.075, 'sine', 0.55);
        break;
      case 'valve':
        this._noiseBurst({ duration: 1.45, volume: 0.2, lowpass: 1250, highpass: 95, attack: 0.18 });
        this._tone(72, 0.6, 0.035, 'sine', 0.84);
        break;
      case 'tell':
        this._tone(68, 0.52, 0.065, 'sine', 0.74);
        this._noiseBurst({ duration: 0.32, volume: 0.04, lowpass: 480, highpass: 35, attack: 0.06 });
        break;
      case 'key':
        this._tone(176, 0.32, 0.055, 'sine', 1.8);
        this._tone(528, 0.2, 0.022, 'triangle', 0.72);
        this._noiseBurst({ duration: 0.28, volume: 0.025, lowpass: 1600, highpass: 480, attack: 0.035 });
        break;
      case 'phase':
        this._tone(54, 0.85, 0.12, 'triangle', 1.65);
        this._noiseBurst({ duration: 0.72, volume: 0.16, lowpass: 650, highpass: 40, attack: 0.025 });
        break;
      case 'collapse':
        this._tone(42, 1.1, 0.2, 'sine', 0.38);
        this._noiseBurst({ duration: 1.2, volume: 0.28, lowpass: 780, highpass: 28, attack: 0.008 });
        break;
      case 'victory':
        this._tone(196, 0.32, 0.07, 'sine', 0.95);
        this._tone(247, 0.5, 0.055, 'sine', 0.96);
        break;
      case 'defeat':
        this._tone(90, 0.75, 0.11, 'sine', 0.44);
        break;
    }
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.steamTimer);
    for (const cleanup of this.unlockCleanups) cleanup();
    this.unlockCleanups.length = 0;
    for (const node of this.ambientNodes) {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch (_) {}
    }
    this.ambientNodes.length = 0;
    if (this.context) {
      this.context.close();
      this.context = null;
      this.master = null;
    }
  }
}
