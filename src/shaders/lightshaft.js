import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

/**
 * God-ray cone from `from` down to `to`: additive, brightest along its axis
 * (fresnel falloff to the rim), fading in at the top and out at the ground.
 * Dust drifts down through the beam and the whole shaft breathes slowly, so
 * it's time-driven rather than a static cone.
 *
 *   shaft.material.uniforms.uTime.value = seconds;
 *   shaft.material.uniforms.uStrength.value = 0..1;  // fades out at dusk
 */
const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragment = NOISE_GLSL + /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uStrength;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float edge = pow(abs(dot(normalize(vN), vV)), 1.5);
    float len = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
    float dust = 0.7 + 0.3 * noise(vec2(vUv.x * 7.0 + uSeed, vUv.y * 5.0 + uTime * 0.35));
    float breathe = 0.85 + 0.15 * sin(uTime * 0.6 + uSeed * 4.0);
    float a = edge * len * dust * breathe * uOpacity * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function createLightShaft(from, to, width, color = 0xffd9a0, opacity = 0.13, seed = 0) {
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(width * 0.35, width, len, 24, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uStrength: { value: 1 },
      uTime: { value: 0 },
      uSeed: { value: seed },
    },
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  return m;
}
