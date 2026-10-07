import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { StoryOverlay } from '../ui/StoryOverlay.js';
import { showEndScreen, hideEndScreen } from '../ui/theme.js';

/**
 * Cutscene — the base for the Level 1 / Level 2 intro and win scenes.
 *
 * A cutscene is a Level, so it runs inside the same Game as the real levels:
 *
 *   game.registerLevel('level01-intro', () => new TrailIntro({ onDone: () => game.setLevel('level01') }));
 *   game.registerLevel('level01-win', () => new GateWin({ stats, onContinue: () => game.setLevel('level02-intro') }));
 *
 * A subclass sets `length`, `ending`, `shots` and (optionally) `slowmo` in its
 * constructor, builds its set in build(assets), and poses everything in
 * pose(t, s, ds, dt) every frame:
 *
 *   t   real seconds since the scene started (cards, camera, fades)
 *   s   scene seconds: t with the slow-motion stretches applied (people, cars, debris)
 *
 * Positions are written as functions of t and s rather than integrated frame by
 * frame, so the timeline can start anywhere (?t=6.5 on the pages in intros/)
 * and a skip is just a jump to the end.
 *
 * Endings, picked with `ending`:
 *   'handoff'  intros: letterbox down, a one-word popup (RUN / DRIVE), then onDone()
 *   'win'      win scenes: the gold end card from ui/theme.js with CONTINUE, then onContinue()
 */
const CSS = `
.ic-fade { position:absolute; inset:0; opacity:0; background:#000; pointer-events:none; }
.ic-pop { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%); font-family:var(--serif); font-size:clamp(24px, 3.6vw, 38px);
  font-weight:700; letter-spacing:.2em; opacity:0; white-space:nowrap; color:#ffd9a8; -webkit-text-stroke:1px rgba(0,0,0,.45);
  text-shadow:0 3px 0 rgba(0,0,0,.65), 0 0 18px currentColor; }
.ic-pop.show { animation:icPop .9s ease-out forwards; }
@keyframes icPop { 0% { opacity:0; transform:translate(-50%,-30%) scale(.7); } 20% { opacity:1; transform:translate(-50%,-50%) scale(1.08); }
  100% { opacity:0; transform:translate(-50%,-85%) scale(1); } }
`;

const GAME_EXPOSURE = 1.25; // what Game sets; restored on teardown

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, k) => a + (b - a) * k;

export class Cutscene extends Level {
  /**
   * opts.onDone      intros: called once control should pass to the level
   * opts.onContinue  win scenes: called when the player presses CONTINUE
   * opts.start       start this many seconds in (the pages pass ?t=)
   * opts.hold        stop the clock at this time (the pages pass ?hold=), handy for reviewing one frame
   */
  constructor(name, opts = {}) {
    super(name);
    this.opts = opts;
    this.length = 10; // seconds until the hand-off / win card
    this.ending = 'handoff'; // 'handoff' | 'win'
    this.popupWord = 'GO';
    this.shots = []; // [{ id, at, blend? }]: a new shot cuts the camera unless blend is set
    this.slowmo = []; // [{ from, to, scale, ramp? }] in real seconds
    this.far = 500; // camera far plane; misty sets pull it in so whole jungle chunks get culled
    this.t = 0;
    this.s = 0;
    this.shot = null;
    this.shotT = 0;
    this.ready = false;
    this.ended = false;
    this._cues = [];
  }

  /* ------------------------------------------------------------ for subclasses */

  /** Load and build the set. Put everything under this.root. */
  async build(_assets) {}

  /** Place everything for this moment. Called every frame after the clock moves. */
  pose(_t, _s, _ds, _dt) {}

  /** Win scenes: { title, sub, lines: [{ text, cls }] } for the end card. */
  winCard() {
    return { title: 'VICTORY', sub: '', lines: [] };
  }

  /** Run fn once when the clock passes `time`. fx cues are skipped when the clock jumps past them. */
  at(time, fn, { fx = false } = {}) {
    this._cues.push({ time, fn, fx, done: false });
    this._cues.sort((a, b) => a.time - b.time);
  }

  /** Where the camera should be this frame. rate = how fast it eases there (Infinity = locked on). */
  frame(pos, look, { fov = 50, rate = Infinity } = {}) {
    this.cam.pos.copy(pos);
    this.cam.look.copy(look);
    this.cam.fov = fov;
    this.cam.rate = rate;
  }

  shake(v) {
    this._shake = Math.min(1, Math.max(this._shake, v));
  }

  /** Full-screen colour over the scene (under the cards): cut to black, wash to gold. */
  fade(color, alpha) {
    if (color !== this._fadeColor) {
      this._fadeColor = color;
      this.fadeEl.style.background = color;
    }
    this.fadeEl.style.opacity = String(Math.min(1, Math.max(0, alpha)));
  }

  /** Scene time at real time t (slow motion stretches it). */
  sceneTime(t) {
    if (t <= 0) return t;
    const i = t / this._warpStep;
    const n = this._warp.length - 1;
    if (i >= n) return this._warp[n] + (t - n * this._warpStep);
    const i0 = Math.floor(i);
    return lerp(this._warp[i0], this._warp[i0 + 1], i - i0);
  }

  /** Real time at scene time s (the inverse of sceneTime). */
  realTime(s) {
    let lo = 0;
    let hi = this.length + 120;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (this.sceneTime(mid) < s) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ------------------------------------------------------------ Level contract */

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);
    this._buildWarp();
    this.cam = { pos: new THREE.Vector3(0, 2, 6), look: new THREE.Vector3(), fov: 50, rate: Infinity };
    this._look = new THREE.Vector3();
    this._shake = 0;
    this._shakeOff = new THREE.Vector3();
    this._cut = true;
    this.game.camera.far = this.far;
    this.game.camera.updateProjectionMatrix();

    this.story = new StoryOverlay();
    this.story.onSkip = () => this.skip();
    this._style = document.createElement('style');
    this._style.textContent = CSS;
    document.head.appendChild(this._style);
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'ic-fade';
    this.story.el.prepend(this.fadeEl); // under the letterbox, the cards and the end card
    this.popEl = document.createElement('div');
    this.popEl.className = 'ic-pop';
    this.story.el.appendChild(this.popEl);

    await this.build(assets);
    if (!this.scene) return; // torn down while loading

    this.story.setCinematic(true, true);
    this._seek(Math.max(0, this.opts.start || 0));
    this.ready = true;
  }

  update(dt) {
    if (!this.ready) return;
    const hold = this.opts.hold;
    if (hold === undefined || this.t < hold) this.t = hold === undefined ? this.t + dt : Math.min(hold, this.t + dt);
    this.held = hold !== undefined && this.t >= hold;

    if (this.input.pressed('skip')) this.skip();
    this._tick(dt);

    if (!this.ended && this.t >= this.length) this._end();
    if (this._doneAt !== undefined && this.t >= this._doneAt) {
      this._doneAt = undefined;
      if (this.opts.onDone) this.opts.onDone();
    }
  }

  teardown() {
    this.root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    });
    if (this.story) this.story.dispose();
    if (this._style) this._style.remove();
    if (this.game) {
      this.game.renderer.toneMappingExposure = GAME_EXPOSURE;
      this.game.camera.fov = 62;
      this.game.camera.far = 500;
      this.game.camera.updateProjectionMatrix();
    }
    if (this.scene) this.scene.fog = null;
    super.teardown();
  }

  /* ------------------------------------------------------------ internals */

  /** Space / Enter / click: jump to the end of the scene, or press CONTINUE once the card is up. */
  skip() {
    if (!this.ready) return;
    if (!this.ended) {
      this._seek(this.length);
      return;
    }
    if (this.ending === 'win' && this._continueAt !== undefined && this.t >= this._continueAt) this._continue();
  }

  _seek(t) {
    this.t = t;
    for (const c of this._cues) {
      if (c.done || c.time > t) continue;
      c.done = true;
      if (!c.fx || t - c.time < 0.25) c.fn();
    }
    this.s = this.sceneTime(t);
    this._cut = true;
    this._shake = 0;
    this._tick(0, true);
  }

  _tick(dt, seeking = false) {
    for (const c of this._cues) {
      if (c.done || c.time > this.t) continue;
      c.done = true;
      c.fn();
    }
    const s = this.sceneTime(this.t);
    const ds = seeking ? 0 : Math.max(0, s - this.s);
    this.s = s;

    let shot = this.shots[0];
    for (const sh of this.shots) if (this.t >= sh.at) shot = sh;
    if (shot && shot.id !== this.shot) {
      if (this.shot !== null && !shot.blend) this._cut = true;
      this.shot = shot.id;
    }
    this.shotT = shot ? this.t - shot.at : this.t;

    this.pose(this.t, s, ds, dt);
    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    const cam = this.game.camera;
    const c = this.cam;
    cam.position.sub(this._shakeOff);
    if (this._cut) {
      this._cut = false;
      cam.position.copy(c.pos);
      this._look.copy(c.look);
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
    } else {
      const k = c.rate === Infinity ? 1 : 1 - Math.exp(-c.rate * dt);
      cam.position.lerp(c.pos, k);
      this._look.lerp(c.look, k);
      if (Math.abs(cam.fov - c.fov) > 0.01) {
        cam.fov += (c.fov - cam.fov) * (c.rate === Infinity ? 1 : 1 - Math.exp(-6 * dt));
        cam.updateProjectionMatrix();
      }
    }
    cam.lookAt(this._look);

    this._shake *= Math.exp(-7 * dt);
    if (this._shake < 0.002) this._shake = 0;
    this._shakeOff.set(
      (Math.random() - 0.5) * this._shake * 0.5,
      (Math.random() - 0.5) * this._shake * 0.4,
      (Math.random() - 0.5) * this._shake * 0.5,
    );
    cam.position.add(this._shakeOff);
  }

  _end() {
    this.ended = true;
    this.story.hideCard();
    this.story.setCinematic(false);
    if (this.ending === 'handoff') {
      this.popEl.textContent = this.popupWord;
      this.popEl.classList.remove('show');
      void this.popEl.offsetWidth;
      this.popEl.classList.add('show');
      this._doneAt = this.t + 0.6;
      return;
    }
    const card = this.winCard();
    const lines = card.lines || [];
    showEndScreen(this.story.end, {
      kind: 'win',
      title: card.title,
      sub: card.sub,
      lines,
      action: { label: 'CONTINUE', key: 'SPACE', onClick: () => this._continue() },
    });
    // showEndScreen fades the button in after the title, the sub and each line; keys only count once it's there
    const n = (card.sub ? 1 : 0) + lines.length;
    this._continueAt = this.t + 0.8 + card.title.length * 0.065 + n * 0.3;
  }

  _continue() {
    if (this._continued) return;
    this._continued = true;
    hideEndScreen(this.story.end);
    if (this.opts.onContinue) this.opts.onContinue();
    else this.game.restart();
  }

  _buildWarp() {
    const step = 1 / 200;
    const n = Math.ceil((this.length + 120) / step);
    const warp = new Float32Array(n + 1);
    let s = 0;
    for (let i = 1; i <= n; i++) {
      const t = (i - 0.5) * step;
      let k = 1;
      for (const m of this.slowmo) {
        const r = m.ramp ?? 0.2;
        const w = smooth(m.from, m.from + r, t) * (1 - smooth(m.to - r, m.to, t));
        k *= 1 + (m.scale - 1) * w;
      }
      s += k * step;
      warp[i] = s;
    }
    this._warp = warp;
    this._warpStep = step;
  }
}
