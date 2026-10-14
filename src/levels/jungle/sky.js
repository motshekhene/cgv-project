import * as THREE from 'three';
import { NOISE_GLSL } from '../../shaders/noise.js';

/**
 * Gradient sky dome with a sun glow and soft fbm clouds that drift with time.
 * Ported from sky() in tools/concepts/scene.js. Lives inside the camera's far
 * plane (radius 400 < far 500) and is always drawn behind everything.
 *
 * All colours are uniforms, so a level can blend between palettes at runtime:
 *   sky.material.uniforms.uTop.value.lerpColors(day.top, dusk.top, k);
 * Move it with the camera each frame (sky.position.copy(camera.position)).
 */
const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position; // the direction out from the dome's centre (the camera rides at its centre)
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // z = w: depth 1, so the sky is always behind everything
    gl_Position.z *= 0.99999; // stay just inside the far plane
  }
`;

const fragment = NOISE_GLSL + /* glsl */ `
  uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uCloudColor; // the palette: a level can blend it at runtime
  uniform float uSunSize, uClouds, uTime; // sun disc tightness, cloud cover 0..1, seconds
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y; // height above the horizon: -1 down .. 1 straight up
    // gradient: horizon to zenith above, horizon to ground below
    vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5))
                     : mix(uHorizon, uBottom, pow(clamp(-h * 3.0, 0.0, 1.0), 0.6));
    float s = max(dot(d, normalize(uSunDir)), 0.0); // 1 looking straight at the sun
    // the sun: a hard disc, a glow round it and a wide haze (three powers of the same angle)
    c += uSunColor * (pow(s, uSunSize) * 8.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.18);
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015); // project onto a cloud layer overhead, drifting
      float cl = smoothstep(0.5, 0.85, fbm(uv + vec2(3.1, 1.7))); // fbm noise, thresholded into clouds
      cl *= smoothstep(0.0, 0.25, h) * uClouds; // thinning out toward the horizon
      vec3 cc = mix(uCloudColor, uSunColor * 1.4 + uCloudColor * 0.4, pow(s, 6.0) * 0.8); // lit up near the sun
      c = mix(c, cc, cl * 0.75);
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky({ top, horizon, bottom, sunDir, sunColor, sunSize = 900, clouds = 0.5, cloudColor = 0xffffff, radius = 400 }) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uBottom: { value: new THREE.Color(bottom) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(sunColor) },
      uSunSize: { value: sunSize },
      uClouds: { value: clouds },
      uCloudColor: { value: new THREE.Color(cloudColor) },
      uTime: { value: 0 },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
