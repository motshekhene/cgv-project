import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

/**
 * Water surface for the L3 pool (and the L2 river: pass a flow direction).
 * Normals come from two scrolling noise height-fields, so the surface ripples
 * without any normal-map texture; a fresnel term mixes the deep colour toward
 * the sky at grazing angles, the sun leaves a moving glint, and a foam ring
 * churns around `foamAt` (where the waterfall lands). Fog-aware.
 *
 *   mat.uniforms.uTime.value = seconds;
 *   mat.uniforms.uTint.value = 0..1;   // phase III: the pool runs red
 */
const vertex = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragment = NOISE_GLSL + /* glsl */ `
  uniform float uTime;
  uniform float uTint;
  uniform vec2 uFlow;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uBlood;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uFoamAt;   // xz = centre, z component = radius
  uniform float uOpacity;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float height(vec2 p) {
    return fbm(p * 0.55 + uFlow * uTime * 0.6) * 0.65
         + noise(p * 1.9 - uFlow.yx * uTime * 1.1 + uTime * 0.25) * 0.35;
  }

  void main() {
    vec2 p = vWorld.xz;
    float e = 0.15;
    float h = height(p);
    vec3 n = normalize(vec3(height(p - vec2(e, 0.0)) - height(p + vec2(e, 0.0)),
                            0.55,
                            height(p - vec2(0.0, e)) - height(p + vec2(0.0, e))));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    vec3 deep = mix(uDeep, uBlood, uTint);
    vec3 shallow = mix(uShallow, uBlood * 1.6, uTint);
    vec3 c = mix(deep, shallow, smoothstep(0.35, 0.75, h));
    c = mix(c, uSky, fres * 0.65);

    vec3 r = reflect(-normalize(uSunDir), n);
    float glint = pow(max(dot(r, v), 0.0), 90.0);
    c += uSunColor * glint * 1.6;

    float d = length(p - uFoamAt.xy) / max(uFoamAt.z, 0.001);
    float ring = smoothstep(1.0, 0.0, d) * smoothstep(0.35, 0.7, noise(p * 2.4 + vec2(0.0, uTime * 1.8)));
    c = mix(c, vec3(0.93, 0.98, 0.98), ring * 0.75);

    gl_FragColor = vec4(c, mix(uOpacity, 1.0, fres * 0.5 + ring * 0.5));

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createWaterMaterial({
  deep = 0x1f5e5c,
  shallow = 0x6cc4b6,
  sky = 0xcfe3e8,
  blood = 0x5a0d0a,
  sunDir = new THREE.Vector3(-0.62, 0.62, -0.45),
  sunColor = 0xffd59a,
  flow = new THREE.Vector2(0.15, 0.1),
  foamAt = new THREE.Vector3(0, 0, 0),
  opacity = 0.88,
} = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uTint: { value: 0 },
        uFlow: { value: flow.clone() },
        uDeep: { value: new THREE.Color(deep) },
        uShallow: { value: new THREE.Color(shallow) },
        uSky: { value: new THREE.Color(sky) },
        uBlood: { value: new THREE.Color(blood) },
        uSunDir: { value: sunDir.clone().normalize() },
        uSunColor: { value: new THREE.Color(sunColor) },
        uFoamAt: { value: foamAt.clone() },
        uOpacity: { value: opacity },
      },
    ]),
  });
}
