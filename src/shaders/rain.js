import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

/**
 * Rain shader — full-screen streak overlay for Level 2.
 *
 * Two pieces:
 *   1. A screen-space rain streak pass (additive-blended plane in front of
 *      the camera) — thin bright lines falling at an angle, modulated by
 *      noise so the density varies naturally.
 *   2. A `wetness` uniform (0‥1) that the road material reads to drop its
 *      roughness and boost its reflectivity once the rain starts (~60% into
 *      the level per the implementation guide).
 *
 *   mat.uniforms.uTime.value  = seconds
 *   mat.uniforms.uIntensity.value = 0‥1  (ramp up from 0 at rain start)
 */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = NOISE_GLSL + /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec2 uResolution;
  varying vec2 vUv;

  void main() {
    if (uIntensity < 0.01) discard;

    // Stretch UV so streaks are tall and thin
    vec2 uv = vUv;
    uv.x *= uResolution.x / uResolution.y;

    // Multiple layers of streaks at different speeds and scales
    float rain = 0.0;

    // Layer 1 — fast, fine streaks
    vec2 p1 = uv * vec2(80.0, 12.0);
    p1.y += uTime * 6.0;
    float streak1 = smoothstep(0.55, 0.75, noise(p1));
    streak1 *= smoothstep(0.0, 0.15, fract(p1.y * 0.5));
    rain += streak1 * 0.5;

    // Layer 2 — slower, wider streaks (bigger drops)
    vec2 p2 = uv * vec2(40.0, 8.0) + vec2(1.7, 0.3);
    p2.y += uTime * 3.5;
    float streak2 = smoothstep(0.5, 0.7, noise(p2));
    streak2 *= smoothstep(0.0, 0.2, fract(p2.y * 0.3));
    rain += streak2 * 0.3;

    // Layer 3 — very fine mist
    vec2 p3 = uv * vec2(120.0, 20.0) + vec2(3.1, 1.1);
    p3.y += uTime * 9.0;
    float streak3 = smoothstep(0.6, 0.8, noise(p3));
    rain += streak3 * 0.2;

    // Tilt the rain (wind from the left)
    float wind = uv.x * 0.15;
    rain *= 0.6 + 0.4 * smoothstep(-0.3, 0.3, uv.x - wind);

    // Density variation via large-scale noise
    float density = 0.6 + 0.4 * noise(vUv * 3.0 + uTime * 0.1);
    rain *= density;

    // Final colour — cool blue-white streaks
    vec3 col = vec3(0.75, 0.82, 0.92) * rain * uIntensity;
    float alpha = rain * uIntensity * 0.45;

    gl_FragColor = vec4(col, alpha);
  }
`;

export function createRainMaterial({
  intensity = 0,
  resolution = new THREE.Vector2(1, 1),
} = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uResolution: { value: resolution.clone() },
    },
  });
}

/**
 * Returns the wet-road roughness multiplier for a given wetness (0‥1).
 * Dry = 1.0 (normal roughness), fully wet = 0.15 (very reflective).
 * Use: material.roughness = baseRoughness * wetRoughness(wetness)
 */
export function wetRoughness(wetness) {
  return THREE.MathUtils.lerp(1.0, 0.15, THREE.MathUtils.clamp(wetness, 0, 1));
}
