import * as THREE from 'three';

/**
 * Rain — Member 2A (Level 2 improvements)
 *
 * A jungle shower over the River Road, all of it animated on the GPU so it
 * costs next to nothing per frame:
 *
 *   streaks   two layers: the drops round the car, and a heavier sheet further
 *             out that greys the jungle into depth. Each drop has its own size
 *             and speed, is anchored in the world (it doesn't slide with the
 *             camera), blurs along its fall, and leans towards you as you
 *             drive into it (it's drawn along its speed relative to the car).
 *   splashes  rings and tiny spray popping up on the road all round the car.
 *
 *   const rain = new Rain(root);
 *   rain.update(dt, camera, car.mesh.position, carVelocity);   // every frame
 *   rain.intensity = 0.8;                                        // 0..1, eased
 */

const STREAK_VERT = /* glsl */ `
attribute vec4 seed;                // x, y, z in the box (0..1), w: this drop's size and speed
uniform float uTime, uSpeed, uLength, uWidth, uPixel, uNear;
uniform vec3 uCenter, uBox, uWind, uViewVel;
varying vec2 vUv;
varying float vFade, vShade;
void main() {
  float spd = uSpeed * (0.8 + seed.w * 0.4);
  vec3 vel = vec3(uWind.x, -spd, uWind.z);
  // anchored in the world, falling, wrapped into a box round the camera
  vec3 p = seed.xyz * uBox + vel * uTime;
  p = uCenter + mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox;
  // the streak is what the eye sees in ~1/30 s: along the drop's speed
  // relative to the viewer, so driving into it slants the rain at you
  vec3 rel = vel - uViewVel;
  vec3 dir = normalize(rel);
  float len = uLength * (0.6 + seed.w * 0.8) * clamp(length(rel) / spd, 1.0, 2.5);
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam));
  // a real width, but never under about a pixel: far drops get fainter, not shimmery
  float w = uWidth * (0.6 + seed.x * 0.8);
  float ww = max(w, dist * uPixel);
  vec3 pos = p - dir * len * position.y + side * ww * position.x;
  vUv = vec2(position.x * 2.0, position.y);
  vFade = (w / ww)
    * smoothstep(uNear, uNear + 1.6, dist)                       // not smeared over the lens
    * (1.0 - smoothstep(0.32 * uBox.x, 0.5 * uBox.x, dist));     // no hard edge to the box
  vShade = 0.7 + seed.z * 0.6;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

const STREAK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vFade, vShade;
void main() {
  float across = 1.0 - abs(vUv.x);
  across *= across;
  // brightest at the drop itself, the blur trailing off behind it
  float along = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.2, 1.0, vUv.y));
  float a = uOpacity * across * along * vFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * vShade, min(a, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SPLASH_VERT = /* glsl */ `
attribute vec3 seed;                // x, z on the patch (0..1), phase
uniform float uTime, uRate, uY;
uniform vec3 uCenter, uBox;
varying vec2 vUv;
varying float vAge, vFade;
void main() {
  float t = uTime * uRate + seed.z;
  float age = fract(t);
  float cycle = floor(t);
  // each splash lands somewhere new every cycle, anchored in the world
  vec2 jitter = fract(vec2(sin(cycle * 12.9898 + seed.z * 78.233), cos(cycle * 39.425 + seed.x * 11.13)) * 43758.5453);
  vec2 xz = (seed.xy + jitter * 0.37) * uBox.xz;
  vec2 c = uCenter.xz;
  xz = c + mod(xz - c + 0.5 * uBox.xz, uBox.xz) - 0.5 * uBox.xz;
  float r = mix(0.05, 0.38, sqrt(age));
  vec3 pos = vec3(xz.x + position.x * r, uY, xz.y + position.y * r);
  vUv = position.xy;
  vAge = age;
  float dist = length(xz - c);
  vFade = 1.0 - smoothstep(0.3 * uBox.x, 0.5 * uBox.x, dist);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

const SPLASH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAge, vFade;
void main() {
  float d = length(vUv);
  float ring = smoothstep(0.62, 0.85, d) * (1.0 - smoothstep(0.85, 1.0, d));
  float a = uOpacity * ring * (1.0 - vAge) * (1.0 - vAge) * vFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _size = new THREE.Vector2();

/** One layer of falling streaks. */
class Streaks {
  constructor(parent, { count, box, speed, length, width, near = 0.5, wind, color, opacity, seed }) {
    this.opacity = opacity;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const r = rng(seed);
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count * 4 }, () => r()), 4));
    g.instanceCount = count;
    this.u = {
      uTime: { value: 0 }, uSpeed: { value: speed }, uLength: { value: length }, uWidth: { value: width },
      uPixel: { value: 0.002 }, uNear: { value: near },
      uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) },
      uWind: { value: new THREE.Vector3(...wind) }, uViewVel: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 },
    };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    // a pixel's width in metres per metre of distance, for this camera and screen
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      const h = renderer.getDrawingBufferSize(_size).y || 1;
      this.u.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 60) / 2) / h) * 1.3;
    };
    parent.add(this.mesh);
  }

  update(time, center, viewVel, k) {
    this.u.uTime.value = time;
    this.u.uCenter.value.copy(center);
    this.u.uViewVel.value.copy(viewVel);
    this.u.uOpacity.value = this.opacity * k;
    this.mesh.visible = k > 0.01;
  }
}

/** Rings popping on the road round the car. */
class Splashes {
  constructor(parent, { count = 700, box = [26, 0, 46], rate = 1.6, y = 0.04, color = 0xe2ecf4, opacity = 0.55, seed = 31 } = {}) {
    this.opacity = opacity;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const r = rng(seed);
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count * 3 }, () => r()), 3));
    g.instanceCount = count;
    this.u = {
      uTime: { value: 0 }, uRate: { value: rate }, uY: { value: y },
      uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 },
    };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  update(time, center, k) {
    this.u.uTime.value = time;
    this.u.uCenter.value.copy(center);
    this.u.uOpacity.value = this.opacity * k;
    this.mesh.visible = k > 0.01;
  }
}

export class Rain {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'level2-rain';
    parent.add(this.group);
    const wind = [1.6, 0, -0.8];
    this.near = new Streaks(this.group, {
      count: 3200, box: [36, 22, 36], speed: 22, length: 0.9, width: 0.011, wind,
      color: 0xc8d4e0, opacity: 0.75, seed: 5,
    });
    this.far = new Streaks(this.group, {
      count: 4500, box: [120, 46, 120], speed: 20, length: 2.0, width: 0.03, near: 14, wind,
      color: 0xb8c4d0, opacity: 0.4, seed: 11,
    });
    this.splashes = new Splashes(this.group);
    this.intensity = 1;      // where it's heading, 0..1
    this.level = 0;          // where it is: eased, so a shower comes and goes
    this.time = 0;
    this._center = new THREE.Vector3();
  }

  /** `focus`: the car's position; `viewVel`: the camera's velocity (m/s), for the slant. */
  update(dt, camera, focus, viewVel) {
    this.time += dt;
    this.level += (this.intensity - this.level) * Math.min(1, dt * 0.6);
    const k = this.level;
    this.near.update(this.time, camera.position, viewVel, k);
    this.far.update(this.time, camera.position, viewVel, k);
    this._center.set(focus.x, 0, focus.z + 10);       // a little ahead: where you're looking
    this.splashes.update(this.time, this._center, k);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.group.removeFromParent();
  }
}
