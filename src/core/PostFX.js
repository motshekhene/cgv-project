import * as THREE from "three";
import { settings } from "./settings.js";
import { displayToSceneColor } from "../shaders/display.js";

/**
 * PostFX — every level's frame goes through here on its way to the screen
 * (Game.renderScene). Hand-written GLSL, no EffectComposer:
 *
 *   1. the scene is drawn into an HDR (half-float) render target, multisampled
 *      on HIGH, so colours above 1.0 survive (lamps, the horn, headlights)
 *   2. BLOOM: a bright-pass keeps only what is brighter than the threshold
 *      (with a soft knee, so it fades in instead of popping), then a chain of
 *      half-size downsamples (13-tap filter) and tent-filtered upsamples added
 *      back together: a wide, smooth glow from a handful of cheap passes
 *   3. GOD RAYS (light scattering, GPU Gems 3 ch. 13): from every pixel, march
 *      toward the sun's position on screen, adding up the bright sky it
 *      passes and fading with each step; trees and ruins in the way leave
 *      gaps, so shafts of light fan out through the canopy
 *   4. COMPOSITE: scene + bloom + rays, ACES tone mapping, then a colour grade
 *      (white balance, lift/gain, contrast, saturation), a vignette, colour
 *      fringes toward the edges, the damage pulse, film grain and a dither
 *      so dark gradients don't band, then sRGB for the screen
 *
 * Each level has a look (PROFILES, picked by name in Game.setLevel); a level
 * can change it on the fly with game.postfx.setProfile({...}). LOW graphics
 * turns all of this off and renders straight to the screen.
 *
 *   game.postfx.hit(0.8);                 // red pulse + fringes when Kai is hurt
 *   game.postfx.flash(0.6, 0xffe2a0);     // a white/warm flash (an impact, the horn)
 *   game.postfx.kick(0.5);                // a short chromatic kick (a boost, a dodge)
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  // a full-screen quad: its corners are already at the screen's corners
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// bright pass: 4 taps (a 2x2 box) at half resolution, keep what's over the threshold
const PREFILTER = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;     // 1 / source size
  uniform float uThreshold; // linear HDR brightness where bloom starts
  uniform float uKnee;      // how softly it starts
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2( 0.5, -0.5)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(-0.5,  0.5)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2( 0.5,  0.5)).rgb;
    c *= 0.25;
    float br = max(c.r, max(c.g, c.b));
    // soft knee: a quadratic ramp around the threshold instead of a hard cut
    float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float w = max(soft, br - uThreshold) / max(br, 1e-4);
    // clamped so one hot pixel can't flicker a huge blob ("fireflies")
    gl_FragColor = vec4(min(c * w, vec3(32.0)), 1.0);
  }`;

// 13-tap downsample (Jimenez, "Next generation post processing in Call of Duty")
const DOWN = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 t(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
  void main() {
    vec3 a = t(vec2(-2.0, 2.0)), b = t(vec2(0.0, 2.0)), c = t(vec2(2.0, 2.0));
    vec3 d = t(vec2(-2.0, 0.0)), e = t(vec2(0.0, 0.0)), f = t(vec2(2.0, 0.0));
    vec3 g = t(vec2(-2.0, -2.0)), h = t(vec2(0.0, -2.0)), i = t(vec2(2.0, -2.0));
    vec3 j = t(vec2(-1.0, 1.0)), k = t(vec2(1.0, 1.0)), l = t(vec2(-1.0, -1.0)), m = t(vec2(1.0, -1.0));
    vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    gl_FragColor = vec4(col, 1.0);
  }`;

// 3x3 tent upsample, added onto the next mip up (additive blending)
const UP = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uRadius;
  varying vec2 vUv;
  vec3 t(vec2 o) { return texture2D(tSrc, vUv + o * uTexel * uRadius).rgb; }
  void main() {
    vec3 col = t(vec2(0.0)) * 4.0
      + (t(vec2(-1.0, 0.0)) + t(vec2(1.0, 0.0)) + t(vec2(0.0, -1.0)) + t(vec2(0.0, 1.0))) * 2.0
      + t(vec2(-1.0, -1.0)) + t(vec2(1.0, -1.0)) + t(vec2(-1.0, 1.0)) + t(vec2(1.0, 1.0));
    gl_FragColor = vec4(col / 16.0, 1.0);
  }`;

// radial light scattering toward the sun, at half resolution
const RAYS = /* glsl */ `
  uniform sampler2D tSrc;   // the HDR scene
  uniform vec2 uSun;        // the sun's position on screen, 0..1 (may be off screen)
  uniform float uThreshold; // only sky this bright scatters
  uniform float uDensity;   // how far toward the sun each pixel looks
  uniform float uDecay;     // how fast the light falls off along the march
  varying vec2 vUv;
  const int STEPS = 40;
  void main() {
    vec2 delta = (vUv - uSun) * uDensity / float(STEPS);
    vec2 uv = vUv;
    float illum = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < STEPS; i++) {
      uv -= delta;
      vec3 s = texture2D(tSrc, clamp(uv, 0.0, 1.0)).rgb;
      float l = max(s.r, max(s.g, s.b));
      acc += min(s, vec3(8.0)) * smoothstep(uThreshold, uThreshold * 1.8, l) * illum;
      illum *= uDecay;
    }
    gl_FragColor = vec4(acc / float(STEPS), 1.0);
  }`;

const COMPOSITE = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uBloom;      // how much glow is added back
  uniform sampler2D tRays;
  uniform float uRays;       // god-ray strength (0 when the sun is behind the camera)
  uniform vec3 uRayColor;
  uniform vec3 uWhite;       // white balance: multiplies the HDR colour (warm dawn, cold storm)
  uniform vec3 uLift;        // added to the shadows
  uniform vec3 uGain;        // multiplies the highlights
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uVignette;
  uniform vec3 uVignetteColor;
  uniform float uFringe;     // chromatic aberration toward the edges, always on (a lens)
  uniform float uKick;       // extra fringe for a moment (boost, dodge)
  uniform float uHit;        // 0..1 damage pulse
  uniform float uDanger;     // 0..1 how close the pursuer is: the edges glow ember and beat like a heart
  uniform float uSilence;    // 0..1 the colour draining out of the world (the prologue's other ending)
  uniform vec3 uFlashColor;
  uniform float uFlash;      // 0..1 full-screen flash
  uniform float uGrain;
  uniform float uTime;
  uniform vec2 uAspect;
  varying vec2 vUv;

  // cheap hash noise for grain and dither, different every frame
  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423) + uTime * 17.13);
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c * uAspect);
    // colour fringes: red read a little further out, blue a little further in
    vec2 ca = c * r * (uFringe + uKick * 0.02 + uHit * 0.012);
    vec3 col;
    col.r = texture2D(tScene, vUv + ca).r;
    col.g = texture2D(tScene, vUv).g;
    col.b = texture2D(tScene, vUv - ca).b;
    col += texture2D(tBloom, vUv).rgb * uBloom;
    col += texture2D(tRays, vUv).rgb * uRays * uRayColor;
    col *= uWhite;
    col = mix(col, uFlashColor * 2.0, uFlash);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    col = gl_FragColor.rgb;

    // grade (display-referred, still linear): lift the blacks, scale the whites,
    // and contrast as a power curve pivoting on 18% mid-grey, so mid-tones stay put
    col = col * uGain + uLift * (1.0 - col);
    col = clamp(0.18 * pow(max(col, vec3(0.0)) / 0.18, vec3(uContrast)), 0.0, 1.0);
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, uSaturation);
    // the silence: the world goes grey, but anything cyan (the horn, its
    // light, the Forest Lights) keeps its colour
    float cyanKeep = clamp((min(col.g, col.b) - col.r) * 3.0, 0.0, 1.0);
    float grey = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(grey) * vec3(0.96, 0.99, 1.04), uSilence * (1.0 - cyanKeep));

    // vignette: darker (and tinted) toward the corners
    float v = smoothstep(0.25, 0.85, r);
    col = mix(col, col * uVignetteColor, v * uVignette);
    // danger: the edges burn ember, beating faster the closer he is, so it can be
    // felt out of the corner of the eye without reading a number
    float beat = pow(0.5 + 0.5 * sin(uTime * mix(5.0, 13.0, uDanger)), 3.0);
    col = mix(col, vec3(0.75, 0.12, 0.03), uDanger * smoothstep(0.32, 0.95, r) * (0.3 + 0.45 * beat));
    // damage: the edges bleed red and the whole frame drains a little
    col = mix(col, vec3(lum) * vec3(1.0, 0.35, 0.3), uHit * 0.25);
    col = mix(col, vec3(0.55, 0.02, 0.02), uHit * smoothstep(0.3, 0.9, r) * 0.75);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    // grain after sRGB so it sits evenly across the brightness range, plus a
    // 1/255 dither that hides banding in the fog and the sky
    float n = hash(gl_FragCoord.xy) - 0.5;
    gl_FragColor.rgb += n * (uGrain * (1.0 - 0.6 * lum) + 1.0 / 255.0);
  }`;

/** Each level's look. Anything not given falls back to DEFAULT. */
const DEFAULT = {
  bloom: 0.35, threshold: 3.0, knee: 1.0, radius: 1.0,
  white: [1, 1, 1], lift: [0, 0, 0], gain: [1, 1, 1],
  contrast: 1.05, saturation: 1.06,
  vignette: 0.38, vignetteColor: [0.15, 0.12, 0.1],
  fringe: 0.0025, grain: 0.03,
  rays: 0, rayThreshold: 1.2, rayDensity: 0.9, rayDecay: 0.96, rayColor: [1.0, 0.86, 0.62],
};

export const PROFILES = {
  // the glade at dawn: warm, soft glow
  title: { rays: 0.9, bloom: 0.6, white: [1.05, 1.0, 0.93], lift: [0.015, 0.01, 0.0] },
  // the fire, the night, the horn: the hot things glow
  prologue: { bloom: 0.75, threshold: 1.5, white: [1.04, 0.99, 0.94], lift: [0.0, 0.005, 0.02], vignette: 0.6, contrast: 1.1 },
  // misty green jungle morning: rich greens and earth, the sun shafts glow
  level01: { rays: 1.2, bloom: 0.35, threshold: 2.5, contrast: 1.1, saturation: 1.12, vignette: 0.42 },
  "level02-intro": { rays: 0.8, bloom: 0.6, threshold: 1.8, white: [1.05, 0.99, 0.92], gain: [1.03, 0.99, 0.94] },
  // sunset into the storm: warm highlights, cooler shadows, headlights and lamps bloom
  level02: { rays: 0.7, bloom: 0.5, threshold: 2.0, white: [1.03, 0.99, 0.95], gain: [1.03, 0.99, 0.94], contrast: 1.1, saturation: 1.12 },
  // the falls: cold water, golden Key light
  level03: { rays: 0.6, rayThreshold: 1.6, bloom: 0.6, threshold: 1.4, white: [1.04, 1.0, 0.94], contrast: 1.15, saturation: 1.18, vignette: 0.55 },
  epilogue: { rays: 0.8, bloom: 0.7, threshold: 1.6, white: [1.06, 1.0, 0.92], lift: [0.015, 0.01, 0.0] },
};

const _size = new THREE.Vector2();

function pass(fragmentShader, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader,
    depthTest: false, depthWrite: false, toneMapped: false, ...extra,
  });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.time = 0;
    this._hit = 0;
    this._flash = 0;
    this._kick = 0;
    this.danger = 0; // 0..1, set by Game from how close the pursuer is
    this._danger = 0;
    this.silence = 0; // 0..1, set by a level: the colour draining away (eases there at silenceRate)
    this._silence = 0;
    this.silenceRate = 0.6;
    this.profile = { ...DEFAULT };
    this._bgKeep = new THREE.Color();
    this._clearKeep = new THREE.Color();
    this._clearTmp = new THREE.Color();

    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.mips = []; // bloom chain, built on the first frame at the screen's size

    this.prefilter = pass(PREFILTER, {
      tSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1 }, uKnee: { value: 0.5 },
    });
    this.raysRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rays = pass(RAYS, {
      tSrc: { value: null }, uSun: { value: new THREE.Vector2() },
      uThreshold: { value: 1 }, uDensity: { value: 1 }, uDecay: { value: 0.96 },
    });
    this.sunDir = null; // world direction to the sun; Game finds it on the level's sky (uniforms.uSunDir)
    this._sunV = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this.down = pass(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = pass(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } }, {
      blending: THREE.AdditiveBlending, transparent: true,
    });
    this.composite = pass(COMPOSITE, {
      tScene: { value: this.sceneRT.texture }, tBloom: { value: null },
      uBloom: { value: 0 }, tRays: { value: this.raysRT.texture }, uRays: { value: 0 }, uRayColor: { value: new THREE.Vector3() },
      uWhite: { value: new THREE.Vector3() },
      uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3() },
      uContrast: { value: 1 }, uSaturation: { value: 1 },
      uVignette: { value: 0 }, uVignetteColor: { value: new THREE.Vector3() },
      uFringe: { value: 0 }, uKick: { value: 0 }, uHit: { value: 0 }, uDanger: { value: 0 }, uSilence: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: 0 },
      uGrain: { value: 0 }, uTime: { value: 0 }, uAspect: { value: new THREE.Vector2(1, 1) },
    }, { toneMapped: true }); // the one pass that tone maps (and converts to sRGB)

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.prefilter);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * On for MEDIUM and HIGH; LOW draws straight to the screen. By the quality
   * Game has settled on (`shaderQuality`, Game.applyQuality): every shader is
   * built for where it draws to, so switching mid-level would rebuild them all.
   */
  get enabled() {
    return (this.shaderQuality ?? settings.quality) !== "low";
  }

  /** A level's look: the level's PROFILES entry, plus anything given here. */
  setProfile(p = {}, name = null) {
    this.profile = { ...DEFAULT, ...(name ? PROFILES[name] : null), ...p };
    // every chapter starts in full colour: only the scene that drains it keeps it drained
    this.silence = this._silence = 0;
    this.silenceRate = 0.6;
  }

  /** Kai is hurt: a red pulse that fades over about half a second. */
  hit(amount = 1) {
    this._hit = Math.min(1, Math.max(this._hit, amount));
  }

  /** A full-screen flash of colour (an impact, a lightning strike, the horn). */
  flash(amount = 0.6, color = 0xffffff) {
    this._flash = Math.min(1, Math.max(this._flash, amount));
    this.composite.uniforms.uFlashColor.value.set(color);
  }

  /** A short burst of colour fringing (a boost, a perfect dodge). */
  kick(amount = 0.5) {
    this._kick = Math.min(1, Math.max(this._kick, amount));
  }

  /** dt in real seconds (so the pulses still fade during slow-motion). */
  update(dt) {
    this.time += dt;
    this._hit *= Math.exp(-4 * dt);
    this._flash *= Math.exp(-7 * dt);
    this._kick *= Math.exp(-5 * dt);
    this._danger += (this.danger - this._danger) * (1 - Math.exp(-4 * dt));
    this._silence += (this.silence - this._silence) * (1 - Math.exp(-this.silenceRate * dt));
  }

  _resize(w, h) {
    if (this.sceneRT.width === w && this.sceneRT.height === h && this._mipCount === this._wantMips() && this._rq === settings.quality) return;
    this._rq = settings.quality;
    this.sceneRT.setSize(w, h);
    // god rays are soft: half resolution on HIGH, a quarter on MEDIUM
    const rs = settings.quality === "high" ? 1 : 2;
    this.raysRT.setSize(Math.max(1, w >> rs), Math.max(1, h >> rs));
    for (const m of this.mips) m.dispose();
    this.mips = [];
    this._mipCount = this._wantMips();
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < this._mipCount && mw >= 2 && mh >= 2; i++) {
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false }));
      mw >>= 1;
      mh >>= 1;
    }
  }

  _wantMips() {
    return settings.quality === "high" ? 6 : 4;
  }

  _draw(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  /**
   * The god rays are only drawn while the sun is ahead of the camera, so their
   * shader was built the first time it came into view (a hitch, mid-level):
   * drawn once here, behind the loading screen (Game.precompile).
   */
  warm() {
    if (this._warmed) return;
    this._warmed = true;
    this.rays.uniforms.tSrc.value = this.sceneRT.texture;
    this._draw(this.rays, this.raysRT);
  }

  /** Draw the scene through the whole chain onto the screen. */
  render(scene, camera) {
    const r = this.renderer;
    r.getDrawingBufferSize(_size);
    const samples = settings.quality === "high" ? 4 : 0;
    if (this.sceneRT.samples !== samples) {
      this.sceneRT.dispose();
      this.sceneRT.samples = samples;
    }
    this._resize(_size.x, _size.y);
    const p = this.profile;

    // a plain background colour is a screen colour in a direct render (it's
    // cleared, never tone mapped): give it the scene colour that comes out the
    // same after the composite, and put it back after. (Fog: shaders/display.js.)
    const bg = scene.background?.isColor ? scene.background : null;
    if (bg) { this._bgKeep.copy(bg); displayToSceneColor(bg, r.toneMappingExposure, bg); }
    r.getClearColor(this._clearKeep);
    const clearAlpha = r.getClearAlpha();
    r.setClearColor(displayToSceneColor(this._clearKeep, r.toneMappingExposure, this._clearTmp), clearAlpha);
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    if (bg) bg.copy(this._bgKeep);
    r.setClearColor(this._clearKeep, clearAlpha);

    // bloom: bright pass into the first mip, down the chain, back up adding as it goes
    const pu = this.prefilter.uniforms;
    pu.tSrc.value = this.sceneRT.texture;
    pu.uTexel.value.set(1 / _size.x, 1 / _size.y);
    pu.uThreshold.value = p.threshold;
    pu.uKnee.value = p.knee;
    this._draw(this.prefilter, this.mips[0]);
    for (let i = 1; i < this.mips.length; i++) {
      const src = this.mips[i - 1];
      this.down.uniforms.tSrc.value = src.texture;
      this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this._draw(this.down, this.mips[i]);
    }
    const autoClear = r.autoClear;
    r.autoClear = false; // upsamples are added onto what the downsample left there
    for (let i = this.mips.length - 1; i > 0; i--) {
      const src = this.mips[i];
      this.up.uniforms.tSrc.value = src.texture;
      this.up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.up.uniforms.uRadius.value = p.radius;
      this._draw(this.up, this.mips[i - 1]);
    }
    r.autoClear = autoClear;

    // god rays: only while the sun is somewhere ahead of the camera
    let rays = 0;
    if (p.rays > 0 && this.sunDir) {
      camera.getWorldDirection(this._camDir);
      const facing = this._camDir.dot(this.sunDir);
      rays = p.rays * THREE.MathUtils.smoothstep(facing, 0.1, 0.6);
      if (rays > 0.001) {
        this._sunV.copy(camera.getWorldPosition(this._sunV)).addScaledVector(this.sunDir, 1000).project(camera);
        const ru = this.rays.uniforms;
        ru.tSrc.value = this.sceneRT.texture;
        ru.uSun.value.set(this._sunV.x * 0.5 + 0.5, this._sunV.y * 0.5 + 0.5);
        ru.uThreshold.value = p.rayThreshold;
        ru.uDensity.value = p.rayDensity;
        ru.uDecay.value = p.rayDecay;
        this._draw(this.rays, this.raysRT);
      }
    }

    const u = this.composite.uniforms;
    u.uRays.value = rays;
    u.uRayColor.value.fromArray(p.rayColor);
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = this.mips[0].texture;
    // the chain sums every level, so normalise by its length
    u.uBloom.value = p.bloom / Math.max(1, this.mips.length - 1);
    u.uWhite.value.fromArray(p.white);
    u.uLift.value.fromArray(p.lift);
    u.uGain.value.fromArray(p.gain);
    u.uContrast.value = p.contrast;
    u.uSaturation.value = p.saturation;
    u.uVignette.value = p.vignette;
    u.uVignetteColor.value.fromArray(p.vignetteColor);
    u.uFringe.value = p.fringe;
    u.uKick.value = this._kick;
    u.uHit.value = this._hit;
    u.uDanger.value = this._danger;
    u.uSilence.value = this._silence;
    u.uFlash.value = this._flash;
    u.uGrain.value = p.grain;
    u.uTime.value = this.time % 100;
    u.uAspect.value.set(_size.x / Math.max(1, _size.y), 1);
    this._draw(this.composite, null);
  }

  dispose() {
    this.sceneRT.dispose();
    this.raysRT.dispose();
    for (const m of this.mips) m.dispose();
    for (const m of [this.rays, this.prefilter, this.down, this.up, this.composite]) m.dispose();
    this.quad.geometry.dispose();
  }
}
