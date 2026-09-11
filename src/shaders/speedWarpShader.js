import * as THREE from 'three';

/**
 * SHADER 1 — SPEED / WARP
 * Owner: Member 1B
 *
 * Applied to the tunnel wall/track geometry in Level 1. As Kai's speed
 * (0 -> 1, normalised) rises, horizontal bands stretch and streak along
 * the direction of travel and the emissive strips pulse faster.
 *
 * Usage from Level01.js:
 *   import { createSpeedWarpMaterial } from '../shaders/speedWarpShader.js';
 *   const wallMat = createSpeedWarpMaterial({
 *     map: tileTexture,
 *     mapRepeat: [150, 2.5], // how many times the map tiles across the wall UVs
 *   });
 *   ...
 *   wallMat.uniforms.uSpeed.value = normalizedSpeed; // 0..1, set every frame
 *   wallMat.uniforms.uTime.value += dt;
 */

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;

  varying vec2 vUv;
  varying float vSpeed;

  void main() {
    vUv = uv;
    vSpeed = uSpeed;

    vec3 pos = position;

    // Subtle vertex stretch along Z (direction of travel) at high speed —
    // cheap way to sell velocity without a full post-process pass.
    pos.z += sin(uTime * 8.0 + position.x * 4.0) * uSpeed * 0.05;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform bool uHasMap;
  uniform vec2 uMapRepeat;
  uniform vec3 uBaseColor;
  uniform vec3 uStreakColor;
  uniform float uTime;
  uniform float uSpeed;

  varying vec2 vUv;
  varying float vSpeed;

  void main() {
    // ShaderMaterial doesn't apply texture.repeat for us, so the map tiles
    // through this uniform instead — Level01 passes [150, 2.5] so one tile
    // patch covers 4 m of tunnel length × 2.8 m of wall height.
    vec3 base = uHasMap ? texture2D(uMap, vUv * uMapRepeat).rgb * uBaseColor : uBaseColor;

    // Streaks: bands that scroll faster and stretch thinner as speed rises.
    float bandFreq = mix(6.0, 40.0, uSpeed);
    float scroll = uTime * mix(0.5, 6.0, uSpeed);
    float band = sin((vUv.y * bandFreq) + scroll * 10.0);
    band = smoothstep(0.85, 1.0, band) * uSpeed;

    vec3 color = base + uStreakColor * band;

    // Cheap vignette-style darkening at the edges to push focus to the
    // center of the tunnel as speed increases.
    float edge = smoothstep(0.0, 0.5, abs(vUv.x - 0.5)) * uSpeed * 0.3;
    color -= edge;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * @param {Object} opts
 * @param {THREE.Texture} [opts.map] optional base texture (concrete/tile wall)
 * @param {Array<number>} [opts.mapRepeat] [x, y] UV tiling of the map — the
 *        raw ShaderMaterial can't use texture.repeat, so tiling is a uniform
 * @param {THREE.Color|number} [opts.baseColor] tint applied to the base map
 * @param {THREE.Color|number} [opts.streakColor] color of the speed streaks
 */
export function createSpeedWarpMaterial(opts = {}) {
  const {
    map = null,
    mapRepeat = [1, 1],
    baseColor = new THREE.Color(0x2a3b42), // cool cyan-grey concrete
    streakColor = new THREE.Color(0x6be2ff), // emergency-strip cyan
  } = opts;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uHasMap: { value: !!map },
      uMapRepeat: { value: new THREE.Vector2(mapRepeat[0], mapRepeat[1]) },
      uBaseColor: { value: new THREE.Color(baseColor) },
      uStreakColor: { value: new THREE.Color(streakColor) },
      uTime: { value: 0 },
      uSpeed: { value: 0 }, // set this every frame from GameState/player speed
    },
    vertexShader,
    fragmentShader,
  });

  return material;
}

/**
 * Helper so Level01.update() can just do:
 *   updateSpeedWarp(wallMat, dt, gameState.normalizedSpeed);
 */
export function updateSpeedWarp(material, dt, normalizedSpeed) {
  if (!material || !material.uniforms) return;
  material.uniforms.uTime.value += dt;
  material.uniforms.uSpeed.value = THREE.MathUtils.clamp(normalizedSpeed, 0, 1);
}