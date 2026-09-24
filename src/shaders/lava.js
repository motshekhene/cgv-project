import * as THREE from "three";

/**
 * Animated lava surface. Two scrolling, warped samples of the lava colour and
 * emission maps, a slow pulse, and a gentle vertex swell so the surface breathes.
 * Drive it with material.uniforms.uTime.value = elapsedSeconds every frame.
 */
const vertex = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vSwell;
  void main() {
    vUv = uv;
    vec3 p = position;
    vSwell = sin(p.x * 0.35 + uTime * 0.8) * cos(p.y * 0.35 + uTime * 0.6);
    p.z += vSwell * 0.12;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uColor;
  uniform sampler2D uEmission;
  uniform float uTime;
  uniform float uRepeat;
  uniform float uGlow;
  varying vec2 vUv;
  varying float vSwell;

  void main() {
    vec2 uv = vUv * uRepeat;
    vec2 warp = vec2(sin(uv.y * 2.3 + uTime * 0.35), cos(uv.x * 2.1 + uTime * 0.28)) * 0.035;
    vec3 colA = texture2D(uColor,    uv + warp + vec2(uTime * 0.012, 0.0)).rgb;
    vec3 colB = texture2D(uColor,    uv * 0.7 - warp + vec2(0.0, uTime * 0.009)).rgb;
    vec3 emA  = texture2D(uEmission, uv + warp + vec2(uTime * 0.012, 0.0)).rgb;
    vec3 emB  = texture2D(uEmission, uv * 0.7 - warp + vec2(0.0, uTime * 0.009)).rgb;

    float pulse = 0.85 + 0.25 * sin(uTime * 1.3 + vSwell * 3.0);
    vec3 col = mix(colA, colB, 0.5) * 0.55;
    vec3 glow = max(emA, emB) * uGlow * pulse;
    gl_FragColor = vec4(col + glow, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createLavaMaterial({ color, emission, repeat = 8, glow = 1.6 }) {
  for (const t of [color, emission]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uColor: { value: color },
      uEmission: { value: emission },
      uTime: { value: 0 },
      uRepeat: { value: repeat },
      uGlow: { value: glow },
    },
  });
}
