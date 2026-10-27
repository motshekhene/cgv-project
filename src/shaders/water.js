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
 *
 * Given an `envMap` (a cube map of the surroundings, e.g. from a CubeCamera
 * at the pool), the surface really REFLECTS and REFRACTS them: the view ray
 * is bent by the rippled normal with GLSL's reflect() (mirror) and refract()
 * (into water, index of refraction 1.33), each looked up in the cube map, and
 * the fresnel term decides how much of each you see.
 */
const vertex = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0); // object space -> world space
    vWorld = wp.xyz; // world position, handed on to the fragment stage
    vec4 mvPosition = viewMatrix * wp; // world -> camera space
    gl_Position = projectionMatrix * mvPosition; // camera -> clip space
    // three.js chunk: the distance the fog needs
    #include <fog_vertex>
  }
`;

const fragment = NOISE_GLSL + /* glsl */ `
  uniform float uTime; // seconds: scrolls the ripples
  uniform float uTint; // 0..1: the pool turns blood red (Level 3, game state)
  uniform vec2 uFlow; // which way, and how fast, the water flows
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uBlood;
  uniform vec3 uSunDir; // towards the sun, for the glint
  uniform vec3 uSunColor;
  uniform vec3 uFoamAt;   // xz = centre, z component = radius
  uniform float uOpacity;
  #ifdef USE_POOL_ENV
    uniform samplerCube uEnv; // the surroundings, captured from the pool
    uniform float uEnvAmt;
  #endif
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  // ripple height at a point: a large scrolling fbm layer plus a small faster noise layer
  float height(vec2 p) {
    return fbm(p * 0.55 + uFlow * uTime * 0.6) * 0.65
         + noise(p * 1.9 - uFlow.yx * uTime * 1.1 + uTime * 0.25) * 0.35;
  }

  void main() {
    vec2 p = vWorld.xz;
    float e = 0.15; // finite-difference step (m)
    float h = height(p);
    // normal from the height field's slope in x and z: no normal map needed
    vec3 n = normalize(vec3(height(p - vec2(e, 0.0)) - height(p + vec2(e, 0.0)),
                            0.55,
                            height(p - vec2(0.0, e)) - height(p + vec2(0.0, e))));
    vec3 v = normalize(cameraPosition - vWorld); // towards the camera
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0); // fresnel: 0 looking straight down, 1 at grazing angles

    vec3 deep = mix(uDeep, uBlood, uTint);
    vec3 shallow = mix(uShallow, uBlood * 1.6, uTint);
    vec3 c = mix(deep, shallow, smoothstep(0.35, 0.75, h)); // deep in the troughs, shallow on the crests
    #ifdef USE_POOL_ENV
      // real reflection and refraction of the surroundings, through the ripples
      vec3 rDir = reflect(-v, n);
      vec3 tDir = refract(-v, n, 1.0 / 1.33); // air -> water
      vec3 refl = textureCube(uEnv, rDir).rgb;
      vec3 refr = textureCube(uEnv, tDir).rgb * shallow * 2.2; // the pool bed, seen through tinted water
      vec3 body = mix(c, max(c * 0.5, refr), 0.55 * uEnvAmt);
      // what's mirrored: the surroundings, never darker than a hint of sky (the cliffs are dark)
      vec3 mirror = mix(uSky, max(refl, uSky * 0.25), uEnvAmt);
      c = mix(body, mirror, clamp(fres * 0.9 + 0.18, 0.0, 1.0));
    #else
      c = mix(c, uSky, fres * 0.65); // the sky reflected at grazing angles
    #endif

    vec3 r = reflect(-normalize(uSunDir), n); // sunlight bounced off the ripple
    float glint = pow(max(dot(r, v), 0.0), 90.0); // Phong specular: a tight sun glint
    c += uSunColor * glint * 1.6;

    float d = length(p - uFoamAt.xy) / max(uFoamAt.z, 0.001); // distance from the foam centre, in radii
    // foam where the waterfall lands: strongest at the centre, broken up by moving noise
    float ring = smoothstep(1.0, 0.0, d) * smoothstep(0.35, 0.7, noise(p * 2.4 + vec2(0.0, uTime * 1.8)));
    c = mix(c, vec3(0.93, 0.98, 0.98), ring * 0.75);

    gl_FragColor = vec4(c, mix(uOpacity, 1.0, fres * 0.5 + ring * 0.5)); // more opaque at grazing angles and in the foam

    // the same tone mapping, colour space and fog as three.js's own materials
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
  envMap = null,
} = {}) {
  const mat = new THREE.ShaderMaterial({
    defines: envMap ? { USE_POOL_ENV: '' } : {},
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
        uEnv: { value: null },
        uEnvAmt: { value: envMap ? 1 : 0 },
      },
    ]),
  });
  // set after the merge: mergeUniforms() won't copy a render target's texture (it would come out null)
  mat.uniforms.uEnv.value = envMap;
  return mat;
}
