import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

/**
 * Level 3's signature shader (replaces the old lava): a waterfall curtain.
 * fbm streaks scroll down the sheet, foam blooms where the streaks peak, the
 * edges and top fade out, and the base churns white where it hits the pool.
 * The sheet bows outward a little near the top so it doesn't read as a flat card.
 *
 * Drive it every frame:
 *   mat.uniforms.uTime.value += dt * flowSpeed;   // phase III speeds the flow up
 *   mat.uniforms.uTint.value = 0..1;              // phase III stains it red
 */
const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += pow(uv.y, 2.0) * 0.9;   // lip of the fall juts out from the cliff
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragment = NOISE_GLSL + /* glsl */ `
  uniform float uTime;
  uniform float uTint;
  uniform vec3 uWater;
  uniform vec3 uFoam;
  uniform vec3 uBlood;
  varying vec2 vUv;

  void main() {
    // two streak layers falling at different speeds, stretched vertically
    float s1 = fbm(vec2(vUv.x * 14.0, vUv.y * 2.2 + uTime * 2.4));
    float s2 = fbm(vec2(vUv.x * 23.0 + 3.7, vUv.y * 3.1 + uTime * 3.6));
    float streak = mix(s1, s2, 0.4);
    float foam = smoothstep(0.45, 0.8, streak);

    vec3 water = mix(uWater, uBlood, uTint);
    vec3 c = mix(water, uFoam, foam);

    // churn at the base, brightest where the sheet meets the pool
    float base = smoothstep(0.16, 0.0, vUv.y);
    float churn = noise(vec2(vUv.x * 30.0, uTime * 6.0)) * base;
    c += (base * 0.45 + churn * 0.35) * uFoam;

    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    float top = smoothstep(1.0, 0.94, vUv.y);
    float a = edge * top * (0.72 + foam * 0.28) * smoothstep(0.0, 0.05, vUv.y);
    gl_FragColor = vec4(c, a);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWaterfallMaterial({ water = 0x52a0a8, foam = 0xf2ffff, blood = 0x8a1a12 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uTint: { value: 0 },
      uWater: { value: new THREE.Color(water) },
      uFoam: { value: new THREE.Color(foam) },
      uBlood: { value: new THREE.Color(blood) },
    },
  });
}
