import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { GameState } from '../core/GameState.js';

/**
 * Stage — one of the game's real levels, built and run inside the trailer.
 *
 * The trailer doesn't rebuild the game's worlds: it runs the levels
 * themselves (the prologue at the fire, Level 1's trail, the River Road, the
 * shrine) each in a scene of its own, and films them. Every level talks to
 * `this.game` for its camera, the renderer and the level switch, so each
 * stage hands it a stand-in game:
 *
 *   camera     the stage's own (the level poses it; the director may take it over)
 *   renderer   the real one, except for domElement, so a level's click and
 *              pointer-lock listeners land on a detached element, not the page
 *   setLevel   remembered (a level handing off to the next one), never acted on
 *   input      a real Input, never attached to the window: the director
 *              presses its actions with setVirtual(), as the touch buttons do
 *
 * The renderer settings a level changes (exposure, tone mapping) are kept per
 * stage and put back before it draws, so the levels can't leak into each other.
 */
export class Stage {
  constructor(name, factory, { renderer, assets, width, height }) {
    this.name = name;
    this.factory = factory;
    this.assets = assets;
    this.realRenderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 500);
    this.input = new Input(document.createElement('div'));
    this.state = new GameState();
    this.state.resetForLevel?.(name);
    this.handoff = null; // the level asked to move on to this one
    this.time = 0;
    this.level = null;
    this.ready = false;
    this._renderState = null;
    this._dummyCanvas = document.createElement('canvas');

    const stage = this;
    const dom = this._dummyCanvas;
    this.renderer = new Proxy(renderer, {
      get(t, k) {
        if (k === 'domElement') return dom;
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, k, v) {
        t[k] = v;
        return true;
      },
    });
    this.game = {
      renderer: this.renderer,
      camera: this.camera,
      scene: this.scene,
      assets,
      input: this.input,
      state: this.state,
      paused: false,
      loading: false,
      levels: new Map(),
      get levelName() { return stage.name; },
      get level() { return stage.level; },
      secondaryCameras: new Map(),
      overlays: new Map(),
      onPaused: null,
      onLevelChanged: null,
      setLevel(next) {
        stage.handoff = next;
        return Promise.resolve(stage.level);
      },
      setPaused(v) { this.paused = v; stage.state.paused = v; },
      restart() { return Promise.resolve(stage.level); },
      addSecondaryCamera() { return this; },
      removeSecondaryCamera() { return this; },
      addOverlay(n, scene, camera) { this.overlays.set(n, { scene, camera }); return this; },
      removeOverlay(n) { this.overlays.delete(n); return this; },
      applyQuality() {},
    };
  }

  async build() {
    const t0 = performance.now();
    this._applyRenderState();
    const level = this.factory();
    level.game = this.game;
    this.level = level;
    await level.init(this.scene, this.assets, this.input, this.state);
    this._saveRenderState();
    this.ready = true;
    this.buildMs = performance.now() - t0;
    return this;
  }

  /** Hold an action down (or let it go), as the on-screen buttons do. */
  hold(action, down = true) {
    this.input.setVirtual(action, down);
  }

  /** Press and release an action on this frame. */
  tap(action) {
    this.input.setVirtual(action, true);
    this._release = this._release || new Set();
    this._release.add(action);
  }

  /** One frame of the level. dt is real seconds; the level's own slow motion is applied as Game does. */
  step(dt) {
    if (!this.ready) return;
    this._applyRenderState();
    const scaled = dt * (this.state.timeScale ?? 1);
    this.time += scaled;
    this.level.update(scaled, this.state);
    this.input.endFrame();
    if (this._release) {
      for (const a of this._release) this.input.setVirtual(a, false);
      this._release.clear();
      this.input.virtualReleased.clear();
    }
    this._saveRenderState();
  }

  /** Draw the level through `camera`. opts.exposure scales the level's own exposure for this frame. */
  render(camera = this.camera, opts = {}) {
    const r = this.realRenderer;
    this._applyRenderState();
    const own = r.toneMappingExposure;
    if (opts.exposure) r.toneMappingExposure = own * opts.exposure;
    if (this.level.render) this.level.render(this.renderer, this.scene, camera);
    else r.render(this.scene, camera);
    if (this.game.overlays.size) {
      r.autoClear = false;
      for (const { scene, camera: c } of this.game.overlays.values()) r.render(scene, c);
      r.autoClear = true;
    }
    r.toneMappingExposure = own;
  }

  _saveRenderState() {
    const r = this.realRenderer;
    this._renderState = { exposure: r.toneMappingExposure, toneMapping: r.toneMapping };
  }

  _applyRenderState() {
    const r = this.realRenderer;
    const s = this._renderState;
    if (!s) {
      r.toneMappingExposure = 1.25; // what Game starts every level on
      r.toneMapping = THREE.ACESFilmicToneMapping;
      return;
    }
    r.toneMappingExposure = s.exposure;
    r.toneMapping = s.toneMapping;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    try {
      this.level?.teardown();
    } catch (e) {
      console.warn(`[trailer] ${this.name} teardown`, e);
    }
    this.level = null;
    this.ready = false;
  }
}
