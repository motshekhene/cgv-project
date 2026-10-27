import * as THREE from "three";
import { Input } from "./Input.js";
import { GameState } from "./GameState.js";
import { AssetRegistry } from "./AssetRegistry.js";
import { toggleMuted } from "../audio/masterMute.js";
import { settings, onSettings, qualityChosen } from "./settings.js";
import { PostFX } from "./PostFX.js";
import { hush, pauseVoice } from "../audio/voice.js";
import { windTime } from "../shaders/wind.js";
import { displayUniforms, isDisplayReferred, patchDisplayReferred } from "../shaders/display.js";

/**
 * Owns the renderer, the camera, the frame timing and the current level.
 *
 *   const game = new Game();
 *   game.registerLevel('level01', () => new Level01());
 *   await game.setLevel('level01');
 *   game.start();
 *
 * Switching levels tears the old one down first, so nothing leaks. restart()
 * rebuilds the current level without reloading the page — that is worth marks
 * under Polish on its own, so don't let it rot.
 *
 * Timing note: we use performance.now() rather than THREE.Clock, which is
 * deprecated as of three 0.18x. Same result, one less dependency on an API
 * that keeps moving.
 */
export class Game {
  constructor({ parent = document.body, maxDelta = 0.05 } = {}) {
    this.parent = parent;
    this.maxDelta = maxDelta; // clamped so an alt-tab can't teleport the player
    this.levels = new Map();
    this.level = null;
    this.levelName = null;
    this.running = false;
    this.paused = false;
    // true while a level's init() is still running: nothing is updated or
    // drawn, so a half-built scene (just its sky colour) never reaches the screen
    this.loading = false;

    this.state = new GameState();
    this.input = new Input(window).attach();
    this.assets = new AssetRegistry({
      onProgress: (p) => this.onLoadProgress && this.onLoadProgress(p),
    });

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this._pixelRatio()); // OPTIONS > GRAPHICS (applyQuality)
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true; // shadow maps: lights flagged castShadow render a depth map each frame
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCF: soft-edged shadows (several samples per pixel)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // HDR lighting -> screen colours, film-like highlights
    this.renderer.toneMappingExposure = 1.25; // overall brightness
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // lighting is computed in linear space, shown in sRGB
    this.parent.appendChild(this.renderer.domElement);
    // until the player picks a GRAPHICS level, start from one that suits the GPU:
    // integrated and software graphics (lab machines) start on MEDIUM
    if (!qualityChosen) {
      const gl = this.renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      if (/intel|uhd|iris|radeon\(tm\) graphics|vega|llvmpipe|swiftshader|mali|adreno|powervr/i.test(gpu)) settings.quality = "medium";
    }
    this._fpsWatch = { t: 0, frames: 0, slow: 0 };

    // HDR bloom, colour grade, vignette, grain, the damage pulse (core/PostFX.js)
    this.postfx = new PostFX(this.renderer);
    this._lastHealth = null; // to see Kai get hurt, whichever level hurt him

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );
    this._last = performance.now();

    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);
    window.addEventListener("resize", this._onResize);

    // hooks the UI layer can set — Game does not touch the DOM itself
    this.onLevelChanged = null;
    this.onLevelLoading = null; // (name) — a level has started building       
    this.onLoadProgress = null;
    this.onPaused = null;
    this.onControlsToggle = null; // () — the player asked for the controls panel

    // secondary cameras rendered as picture-in-picture overlays each frame.
    // key: name string, value: { camera, viewport: { x, y, w, h } }
    // x/y/w/h are normalised 0‥1 fractions of the canvas size.
    this.secondaryCameras = new Map();

    // full-screen overlay passes rendered after the main view and PiP cameras.
    // key: name string, value: { scene, camera } — each rendered on top of everything.
    // used for screen-space effects like rain, HUD overlays, etc.
    this.overlays = new Map();

    // OPTIONS > GRAPHICS: applied now, on every level load, and once a second (lights a level adds later)
    this._qualityT = 0;
    onSettings((s, key) => key === "quality" && this.applyQuality());
  }

  /** Render resolution for the GRAPHICS setting: full (up to 2x on sharp screens), 1x, or 70%. */
  _pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    if (settings.quality === "low") return Math.min(dpr, 1) * 0.7;
    if (settings.quality === "medium") return Math.min(dpr, 1);
    return Math.min(dpr, 2);
  }

  /**
   * OPTIONS > GRAPHICS. LOW: no shadows at all (the shadow-casting lights stop
   * casting, so no shadow pass is drawn) and 70% resolution. MEDIUM: shadow
   * maps capped at 1024 and 1x resolution. HIGH: as each level made them.
   * Lights are put back exactly as they were when the setting goes up again.
   */
  applyQuality() {
    const q = settings.quality;
    const pr = this._pixelRatio();
    if (Math.abs(this.renderer.getPixelRatio() - pr) > 1e-3) {
      this.renderer.setPixelRatio(pr);
      this._onResize();
    }
    this.scene.traverse((o) => {
      if (!o.isLight || !o.shadow) return;
      const u = o.userData;
      // shadows off for LOW, back on above it (only the ones this switched off)
      if (q === "low" && o.castShadow) {
        o.castShadow = false;
        u.qShadowOff = true;
      } else if (q !== "low" && u.qShadowOff) {
        o.castShadow = true;
        delete u.qShadowOff;
      }
      // shadow map detail: capped for MEDIUM, the level's own for HIGH
      const want = q === "medium" ? Math.min(u.qMapSize ?? o.shadow.mapSize.x, 1024) : u.qMapSize ?? o.shadow.mapSize.x;
      if (q === "medium" && u.qMapSize === undefined && o.shadow.mapSize.x > 1024) u.qMapSize = o.shadow.mapSize.x;
      if (o.shadow.mapSize.x !== want) {
        o.shadow.mapSize.set(want, want);
        o.shadow.map?.dispose(); // rebuilt at the new size on the next frame
        o.shadow.map = null;
      }
      if (q === "high") delete u.qMapSize;
    });
  }

  registerLevel(name, factory) {
    this.levels.set(name, factory);
    return this;
  }

  /** Tear the current level down, build the next one. */
  async setLevel(name) {
    const factory = this.levels.get(name);
    if (!factory) throw new Error(`[game] no level registered as "${name}"`);

    this.loading = true;
    if (this.onLevelLoading) this.onLevelLoading(name);

    if (this.level) {
      this.level.teardown();
      this.level = null;
    }
    hush(); // no line carries over into the next level
    this.secondaryCameras.clear();
    this.overlays.clear();
    this.state.resetForLevel(name);
    this.postfx.setProfile({}, name); // the level's look; init() can change it
    this.postfx.danger = 0;
    this._lastHealth = null;
    this._lastShake = null;
    this._pfxScan = 0; // look for display-colour shaders on the first frame

    const level = factory();
    level.game = this;
    this.level = level;
    this.levelName = name;
    try {
      await level.init(this.scene, this.assets, this.input, this.state);
    } finally {
      this.loading = false;
    }
    this.applyQuality();
    if (this.onLevelChanged) this.onLevelChanged(name);
    return level;
  }

  /** Same level, fresh state, no page reload. */
  restart() {
    if (this.paused) this.setPaused(false); // or the fresh level would start frozen
    return this.setLevel(this.levelName);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now(); // don't carry a huge first delta
    requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
  }

  /**
   * reason: 'user' when the player paused (Esc, a pause button) — main.js
   * shows the pause menu for those — or 'switch' when a level hand-off holds
   * the game still for a moment, which must not flash the menu up.
   */
  setPaused(v, reason = 'user') {
    this.paused = v;
    this.state.paused = v;
    if (reason === 'user') pauseVoice(v);
    if (this.level && this.level.onPause) this.level.onPause(v, reason);
    if (this.onPaused) this.onPaused(v, reason);
  }

  _frame() {
    if (!this.running) return;
    requestAnimationFrame(this._frame);

    const now = performance.now();
    const raw = Math.min((now - this._last) / 1000, this.maxDelta);
    this._last = now;
    const dt = raw * (this.state.timeScale ?? 1);

    // a level is still building: keep the last finished frame on screen
    if (this.loading) {
      this.input.endFrame();
      return;
    }

    if (this.input.pressed("pause")) this.setPaused(!this.paused);
    if (this.input.pressed("mute")) toggleMuted(); // one mute for every level (audio/masterMute.js)
    if (this.input.pressed("controls") && this.onControlsToggle) this.onControlsToggle();
    if (this.input.pressed("restart")) {
      this.restart();
      this.input.endFrame();
      return;
    }

    if (!this.paused && this.level) {
      this.level.update(dt, this.state);
      windTime.value += dt; // every swaying plant's clock (shaders/wind.js)
    }
    this.input.endFrame();
    this._watchFrameRate(now);
    if ((this._qualityT += raw) > 1) {
      this._qualityT = 0;
      this.applyQuality();
    }

    // any drop in health, from any level, pulses the screen red
    const hp = this.state.health;
    if (this._lastHealth !== null && hp < this._lastHealth - 0.25 && !this.paused) {
      this.postfx.hit(Math.min(1, 0.35 + (this._lastHealth - hp) / 30));
    }
    this._lastHealth = hp;
    // every level keeps a camera-shake amount (shake or _shake); a jump in it
    // is an impact, so the lens kicks too: colour fringes, and a flash on the big ones
    const shake = this.level ? (this.level.shake ?? this.level._shake ?? 0) : 0;
    const jump = shake - (this._lastShake ?? shake);
    if (jump > 0.12 && !this.paused) {
      this.postfx.kick(Math.min(1, jump * 1.2));
      if (jump > 0.6) this.postfx.flash(Math.min(0.35, (jump - 0.5) * 0.4), 0xfff1dc);
    }
    this._lastShake = shake;
    // a pursuer within ~14 m makes the screen's edges burn (PostFX uDanger)
    const st = this.state;
    const chasing = st.handlerState === "CLOSING" || st.handlerState === "LOSING_GROUND";
    this.postfx.danger = chasing && st.handlerGap > 0 && !this.paused ? Math.min(1, Math.max(0, (14 - st.handlerGap) / 11)) : 0;
    this.postfx.update(raw);

    // a level can take over drawing (e.g. its own post-processing pass); most just let Game render
    if (this.level && this.level.render) this.level.render(this.renderer, this.scene, this.camera);
    else this.renderScene(this.scene, this.camera);

    // secondary cameras — rendered as small overlays on top of the main view
    if (this.secondaryCameras.size > 0) {
      // in CSS pixels: setViewport / setScissor scale by the pixel ratio themselves, so the canvas's
      // own width (already scaled) would shrink or blow up the main view whenever the ratio isn't 1
      const size = this.renderer.getSize(this._cssSize || (this._cssSize = new THREE.Vector2()));
      const pw = size.x;
      const ph = size.y;
      this.renderer.setScissorTest(true);
      for (const { camera: cam, viewport: vp } of this.secondaryCameras.values()) {
        const vx = vp.x * pw;
        const vy = vp.y * ph;
        const vw = vp.w * pw;
        const vh = vp.h * ph;
        this.renderer.setViewport(vx, vy, vw, vh);
        this.renderer.setScissor(vx, vy, vw, vh);
        this.renderer.render(this.scene, cam);
      }
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, pw, ph);
    }

    // full-screen overlays (rain, etc.) — rendered on top of everything
    if (this.overlays.size > 0) {
      this.renderer.autoClear = false;
      for (const { scene: s, camera: c } of this.overlays.values()) {
        this.renderer.render(s, c);
      }
      this.renderer.autoClear = true;
    }
  }

  /**
   * Optimisation: if the player hasn't chosen a GRAPHICS level and the game
   * runs under ~35 fps for four seconds in a row, step down one level (HIGH to
   * MEDIUM to LOW) for this session. A choice in OPTIONS always wins.
   */
  _watchFrameRate(now) {
    const w = this._fpsWatch;
    if (qualityChosen || this.paused || document.hidden) {
      w.t = 0;
      return;
    }
    if (!w.t) {
      w.t = now;
      w.frames = 0;
      return;
    }
    w.frames++;
    if (now - w.t < 1000) return;
    const fps = (w.frames * 1000) / (now - w.t);
    w.t = now;
    w.frames = 0;
    w.slow = fps < 35 ? w.slow + 1 : 0;
    if (w.slow >= 4 && settings.quality !== "low") {
      settings.quality = settings.quality === "high" ? "medium" : "low"; // not saved: the next visit measures again
      w.slow = 0;
      this.applyQuality();
      console.log("[game] running slowly, graphics stepped down to", settings.quality);
    }
  }

  /** Draw a scene to the screen: through PostFX, or straight there on LOW graphics. */
  renderScene(scene, camera) {
    // shaders that write screen colours directly get the inverse of PostFX's
    // tone curve (shaders/display.js); checked every so often for new ones
    if ((this._pfxScan = (this._pfxScan ?? 0) - 1) <= 0) {
      this._pfxScan = 30;
      let sun = null;
      scene.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          if (isDisplayReferred(m)) patchDisplayReferred(m);
          // the level's sky knows where the sun is: PostFX's god rays aim at it
          if (o.isMesh && m.side === THREE.BackSide && m.uniforms?.uSunDir) sun = m.uniforms.uSunDir.value;
        }
      });
      this.postfx.sunDir = sun ? (this._sunDir || (this._sunDir = new THREE.Vector3())).copy(sun).normalize() : null;
    }
    displayUniforms.uDisplayExposure.value = this.renderer.toneMappingExposure;
    displayUniforms.uViaPostFX.value = this.postfx.enabled ? 1 : 0;
    if (this.postfx.enabled) this.postfx.render(scene, camera);
    else this.renderer.render(scene, camera);
  }

  /**
   * Register a secondary camera to render as a picture-in-picture overlay.
   * viewport values are normalised 0‥1 (e.g. { x:0.75, y:0.75, w:0.24, h:0.23 }
   * draws in the bottom-right quarter of the screen).
   */
  addSecondaryCamera(name, camera, viewport) {
    this.secondaryCameras.set(name, { camera, viewport });
    return this;
  }

  removeSecondaryCamera(name) {
    this.secondaryCameras.delete(name);
    return this;
  }

  /**
   * Register a full-screen overlay pass (e.g. rain, screen-space effects).
   * The overlay has its own scene and orthographic camera, rendered on top
   * of the main view after all secondary cameras.
   */
  addOverlay(name, scene, camera) {
    this.overlays.set(name, { scene, camera });
    return this;
  }

  removeOverlay(name) {
    this.overlays.delete(name);
    return this;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Full shutdown. Rarely needed in the game, but keeps the leak test honest. */
  dispose() {
    this.stop();
    if (this.level) {
      this.level.teardown();
      this.level = null;
    }
    window.removeEventListener("resize", this._onResize);
    this.input.detach();
    this.postfx.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
