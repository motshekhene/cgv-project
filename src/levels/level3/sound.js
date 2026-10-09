/**
 * Level3Sound — the fight at Site 7.
 *
 * The same sound world as the rest of the game (src/audio/jungleAudio.js):
 * the shared cue palette, the ambient bed — the waterfall's roar is the
 * loudest thing at Site 7, the birds a faint way behind it — and the game's
 * theme: the recorded loop (the 'battle' arrangement as the fallback),
 * started under the cutscene that opens the level and running under the
 * victory lap. Everything runs on this class's own AudioContext at the
 * volume contract's master level, through the same compressor Level 2 uses,
 * so the fight sits at the same loudness as the run and the drive.
 *
 *   this.sound = new Level3Sound();
 *   this.sound.setVariant('battle');          // starts the theme
 *   this.sound.play('punch', { volume: 0.7 }); // any shared cue
 *   this.sound.duck(0.5, 0.6);                // effects first
 *   this.sound.update(dt);   this.sound.dispose(); // per frame / teardown
 */
import {
  AUDIO_LEVELS,
  JungleBed,
  createJungleCueBuffers,
  createJungleMusicBuffer,
  loadJungleTheme,
} from '../../audio/jungleAudio.js';

export class Level3Sound {
  constructor() {
    this.ctx = null;
    // browsers keep the context suspended until the first gesture
    this._onGesture = () => this._start();
    window.addEventListener('pointerdown', this._onGesture);
    window.addEventListener('keydown', this._onGesture);
    this._start();
  }

  _start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    // master: gain -> gentle compressor -> speakers
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO_LEVELS.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    this._cues = createJungleCueBuffers(ctx);

    // the courtyard by the waterfall: soft leaves and the river's hush. The
    // contract's levels are post-master, so undo this bus's master first.
    const norm = 1 / AUDIO_LEVELS.master;
    this.bed = new JungleBed(ctx, this.master, { level: AUDIO_LEVELS.bed * norm });

    this._musicBase = AUDIO_LEVELS.music * norm;
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    this._variant = '';
  }

  /** One of the shared cues (jungleAudio.js), at the shared headroom. */
  play(name, { volume = 0.7, rate = 1 } = {}) {
    if (!this.ctx) return;
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
   * Starts the theme — the one recorded loop everywhere now, so the kind is
   * kept only for the call sites. The music bus fades in from nothing, once.
   */
  setVariant(kind = 'battle') {
    if (!this.ctx || this._variant) return;
    this._variant = kind || 'battle';
    const ctx = this.ctx;
    const up = (buffer) => {
      if (!buffer || !this.ctx) return; // disposed mid-load
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.music);
      src.start();
      this._musicSrc = src;
      this.music.gain.setTargetAtTime(this._musicBase, ctx.currentTime + 0.2, 1.2);
    };
    loadJungleTheme(ctx).then((buf) => up(buf || createJungleMusicBuffer(ctx, 'battle')));
  }

  /** Dips the music under a cue, then eases it back — effects first. */
  duck(depth = 0.5, hold = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.music.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0.02, this._musicBase * (1 - depth)), t, 0.06);
    g.setTargetAtTime(this._musicBase, t + hold, 0.5);
  }

  update(dt) {
    // the waterfall dominates; the birds are barely there
    if (this.bed) this.bed.update(dt, { river: 0.85, wind: 0.1, birds: 0.15 });
  }

  dispose() {
    window.removeEventListener('pointerdown', this._onGesture);
    window.removeEventListener('keydown', this._onGesture);
    if (this.bed) { this.bed.dispose(); this.bed = null; }
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }
}
