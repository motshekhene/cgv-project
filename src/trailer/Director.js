import * as THREE from 'three';
import { Stage } from './Stage.js';
import { applyCamera, newCam } from './camera.js';

/**
 * The director: the edit, played on the game's own levels.
 *
 * A shot is a stretch of trailer time filmed on one stage (one of the real
 * levels, see Stage.js):
 *
 *   {
 *     id: '3b', at: 25.4,          trailer seconds it starts (it ends where the next one starts)
 *     stage: 'level01',
 *     enter(st, ctx)                once, as the shot starts: put the level where the shot needs it
 *     prep: 0.8,                    seconds of the level run unseen before the first frame,
 *                                   so a cut can jump the action forward like an edit does
 *     rate: 1 | (k) => number,      level seconds per trailer second (0.4 = slow motion)
 *     drive(st, ctx)                every step, before the level runs: its inputs, its state
 *     camera(st, ctx, cam)          every frame, after the level ran: where the lens is
 *     native: true                  film through the level's own camera (camera() may still adjust it)
 *   }
 *
 * ctx carries t (trailer seconds), at (when the shot started), local (seconds into the shot), k (0..1
 * through it), dt, and frame. A level runs only while one of its shots is on
 * screen, so each one is a continuous take that picks up where its last shot
 * left it.
 *
 * The level poses its own camera every frame, and some ease it from where it
 * was; so the director keeps the level's camera as the level left it, and
 * only borrows it to draw the shot: the level never sees the trailer's lens.
 *
 * Math.random is seeded for the whole trailer, so with a fixed step (the
 * exporter, ?t=) every run of the edit is the same film.
 */
export class Director {
  constructor({ renderer, assets, stages, shots, overlay, width, height }) {
    this.renderer = renderer;
    this.assets = assets;
    this.stageDefs = stages; // { name: factory }
    this.shots = shots.slice().sort((a, b) => a.at - b.at);
    this.overlay = overlay;
    this.length = this.shots.length ? this.shots[this.shots.length - 1].at + (this.shots[this.shots.length - 1].dur ?? 0) : 0;
    this.width = width;
    this.height = height;
    this.stages = new Map();
    this.t = 0;
    this.frame = 0;
    this.shot = null;
    this.cam = newCam();
    this._levelCam = new Map();
    this._ctx = { t: 0, local: 0, k: 0, dt: 0, frame: 0, prepping: false, director: this };
    this.onShot = null;
  }

  /* ------------------------------------------------------------ building */

  async build(onProgress = () => {}) {
    seedRandom(20261015);
    const names = Object.keys(this.stageDefs);
    let done = 0;
    for (const name of names) {
      const stage = new Stage(name, this.stageDefs[name], {
        renderer: this.renderer, assets: this.assets, width: this.width, height: this.height,
      });
      onProgress(done / names.length, name);
      await stage.build();
      this.stages.set(name, stage);
      done++;
      onProgress(done / names.length, name);
    }
    // draw every stage once now, so no shader compiles in the middle of the edit
    for (const stage of this.stages.values()) {
      stage.step(1 / 60);
      stage.render();
    }
    this.renderer.clear();
  }

  dispose() {
    for (const s of this.stages.values()) s.dispose();
    this.stages.clear();
    restoreRandom();
  }

  /* ------------------------------------------------------------ the clock */

  shotAt(t) {
    let found = this.shots[0];
    for (const s of this.shots) {
      if (s.at <= t) found = s;
      else break;
    }
    return found;
  }

  shotEnd(shot) {
    const i = this.shots.indexOf(shot);
    const next = this.shots[i + 1];
    return next ? next.at : shot.at + (shot.dur ?? 1);
  }

  /** Advance the edit by dt seconds and draw the frame. */
  update(dt) {
    this.advance(dt);
    this.draw();
  }

  /** Move the clock (and the level on screen) by dt without drawing. */
  advance(dt) {
    this.t += dt;
    this.frame++;
    const shot = this.shotAt(this.t);
    if (!shot) return;
    const stage = this.stages.get(shot.stage);
    if (shot !== this.shot) this._enter(shot, stage);
    this._step(shot, stage, dt);
  }

  /**
   * Jump to trailer time t. Forward, every shot between here and there is
   * played unseen at a fixed step, so the levels arrive there as they would
   * have; `fast` skips that and only enters the target shot (the skip button,
   * whose title shots stand on their own).
   */
  seek(t, { fast = false, step = 1 / 30 } = {}) {
    if (fast) {
      this.t = t;
      const shot = this.shotAt(t);
      this._enter(shot, this.stages.get(shot.stage));
      return;
    }
    while (this.t + step < t) this.advance(step);
    if (t > this.t) this.advance(t - this.t);
  }

  _enter(shot, stage) {
    this.shot = shot;
    const ctx = this._ctxFor(shot, 0);
    ctx.prepping = true;
    // enter() works on the level as the level left it, its own camera included
    this._restoreLevelCam(stage);
    if (shot.enter) shot.enter(stage, ctx);
    this._saveLevelCam(stage);
    // the edit's jump: run the level on unseen, so the action has moved on at the cut
    const prep = shot.prep || 0;
    const step = 1 / 30;
    for (let p = 0; p < prep - 1e-6; p += step) {
      const d = Math.min(step, prep - p);
      this._restoreLevelCam(stage);
      if (shot.drive) shot.drive(stage, ctx);
      stage.step(d);
      this._saveLevelCam(stage);
    }
    ctx.prepping = false;
    if (this.onShot) this.onShot(shot);
  }

  _ctxFor(shot, dt) {
    const ctx = this._ctx;
    const end = this.shotEnd(shot);
    ctx.t = this.t;
    ctx.at = shot.at;
    ctx.local = this.t - shot.at;
    ctx.dur = end - shot.at;
    ctx.k = Math.min(1, Math.max(0, ctx.local / ctx.dur));
    ctx.dt = dt;
    ctx.frame = this.frame;
    return ctx;
  }

  _step(shot, stage, dt) {
    const ctx = this._ctxFor(shot, dt);
    const rate = typeof shot.rate === 'function' ? shot.rate(ctx.k, ctx) : shot.rate ?? 1;
    this._restoreLevelCam(stage);
    if (shot.drive) shot.drive(stage, ctx);
    if (rate > 0) stage.step(dt * rate);
    this._saveLevelCam(stage);
  }

  draw() {
    const shot = this.shot;
    if (!shot) return;
    const stage = this.stages.get(shot.stage);
    const ctx = this._ctxFor(shot, 0);
    const cam = this.cam;
    const lens = stage.camera;
    if (shot.native) {
      cam.pos.copy(lens.position);
      lens.getWorldDirection(cam.look).multiplyScalar(10).add(lens.position);
      cam.fov = lens.fov;
      cam.roll = 0;
      if (shot.camera) shot.camera(stage, ctx, cam);
    } else {
      cam.roll = 0;
      shot.camera(stage, ctx, cam);
    }
    applyCamera(lens, cam);
    stage.render(lens, { exposure: cam.exposure });
    cam.exposure = undefined;
    if (this.overlay) this.overlay.draw(this.t, this.frame);
  }

  /**
   * A beat the score is cut to (the grip on the horn, a crash). The score's
   * times are fixed, so in development this says if the picture has drifted
   * off one of them.
   */
  mark(name, t, expected) {
    this.marks = this.marks || {};
    this.marks[name] = t;
    if (expected !== undefined && Math.abs(t - expected) > 0.05) {
      console.warn(`[trailer] beat "${name}" landed at ${t.toFixed(3)} s, the score expects ${expected} s`);
    }
  }

  /* ------------------------------------------------------------ the level's own camera */

  _saveLevelCam(stage) {
    const c = stage.camera;
    let s = this._levelCam.get(stage);
    if (!s) this._levelCam.set(stage, (s = { p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 0, near: 0, far: 0 }));
    s.p.copy(c.position);
    s.q.copy(c.quaternion);
    s.fov = c.fov;
    s.near = c.near;
    s.far = c.far;
    s.saved = true;
  }

  _restoreLevelCam(stage) {
    const s = this._levelCam.get(stage);
    if (!s || !s.saved) return;
    const c = stage.camera;
    c.position.copy(s.p);
    c.quaternion.copy(s.q);
    c.fov = s.fov;
    c.near = s.near;
    c.far = s.far;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  /** Where the level itself last put its camera (for shots that start from it). */
  levelCamera(stage) {
    return this._levelCam.get(stage);
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    for (const s of this.stages.values()) s.resize(w, h);
  }
}

/* ------------------------------------------------------------ one random for the whole film */

let nativeRandom = null;

/** Replace Math.random with a seeded generator (mulberry32), so the edit plays the same every time. */
export function seedRandom(seed) {
  if (!nativeRandom) nativeRandom = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function restoreRandom() {
  if (nativeRandom) Math.random = nativeRandom;
  nativeRandom = null;
}
