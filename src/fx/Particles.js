import * as THREE from "three";

/**
 * Particles — one pool of point sprites for puffs of dust, sparks, embers and
 * spray. The motion is simulated on the CPU (a few hundred points is nothing),
 * the look is a small custom shader:
 *
 *   - each point is a screen-facing sprite whose size shrinks with distance
 *     the way a real object would (projection matrix, viewport height)
 *   - the fragment shader draws a soft disc and breaks its edge up with value
 *     noise, so dust reads as a puff, not a dot; sparks keep a hot core
 *   - colours above 1.0 are fine: PostFX's bloom picks them up, so sparks and
 *     embers glow without any light in the scene
 *
 *   const dust = new Particles({ max: 400, blending: THREE.NormalBlending });
 *   root.add(dust.points);
 *   dust.emit(position, { count: 8, speed: 1.2, up: 0.8, color: 0xb08a62, size: 0.35, life: 0.7 });
 *   dust.update(dt);   // every frame
 */

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uViewportH;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // world-space size -> pixels: what the projection does to an object aSize metres wide at this depth
    gl_PointSize = aSize * projectionMatrix[1][1] * uViewportH * 0.5 / max(-mvPosition.z, 0.05);
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  uniform float uSoft;  // 1: a dusty, noisy puff; 0: a clean hot spark
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSeed;
  #include <fog_pars_fragment>

  // value noise, the same idea as the labs: random values on a grid, smoothly interpolated
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0; // 0 at the centre, 1 at the edge
    float n = vnoise(p * 5.0 + vSeed * 17.0) * 0.6 + vnoise(p * 11.0 - vSeed * 9.0) * 0.4;
    float edge = mix(1.0, 0.55 + 0.9 * n, uSoft); // a ragged edge for dust
    float a = smoothstep(edge, edge * 0.25, d) * vAlpha;
    if (a < 0.004) discard;
    // sparks: a white-hot core
    vec3 col = vColor + (1.0 - uSoft) * vec3(1.0) * smoothstep(0.45, 0.0, d) * 2.0;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _size = new THREE.Vector2();

export class Particles {
  constructor({ max = 300, blending = THREE.NormalBlending, soft = 1, fog = true } = {}) {
    this.max = max;
    this.next = 0;
    // per particle state: position, velocity, age, life, sizes, colours, alpha, gravity, drag
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1);
    this.life = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.col0 = new Float32Array(max * 3);
    this.col1 = new Float32Array(max * 3);
    this.alpha0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.alive = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const seeds = new Float32Array(max);
    for (let i = 0; i < max; i++) seeds[i] = Math.random();
    g.setAttribute("aSize", this.aSize);
    g.setAttribute("aAlpha", this.aAlpha);
    g.setAttribute("aColor", this.aColor);
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uViewportH: { value: 800 }, uSoft: { value: soft } }]),
      transparent: true,
      depthWrite: false,
      blending,
      fog,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false; // the points move anywhere; the bounding sphere would go stale
    this.points.renderOrder = 5;
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(_size);
      this.material.uniforms.uViewportH.value = _size.y;
    };
  }

  /**
   * Spawn `count` particles at `at` (a Vector3, world space if the points sit
   * at the scene's origin). speed: how fast they burst out; up: extra upward
   * speed; dir: an optional push (Vector3); color → colorEnd over the life.
   */
  emit(at, {
    count = 6, speed = 1, up = 0.5, dir = null, spread = 0.15,
    color = 0xffffff, colorEnd = null, intensity = 1, size = 0.3, sizeEnd = null,
    life = 0.8, alpha = 0.8, gravity = -1, drag = 2,
  } = {}) {
    _c.set(color).multiplyScalar(intensity);
    _c2.set(colorEnd ?? color).multiplyScalar(intensity);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const i3 = i * 3;
      // a random direction, flattened a bit so a puff spreads along the ground
      _v.set(Math.random() * 2 - 1, Math.random() * 0.6, Math.random() * 2 - 1).normalize();
      const s = speed * (0.4 + Math.random() * 0.8);
      this.pos[i3] = at.x + (Math.random() - 0.5) * spread;
      this.pos[i3 + 1] = at.y + Math.random() * spread * 0.5;
      this.pos[i3 + 2] = at.z + (Math.random() - 0.5) * spread;
      this.vel[i3] = _v.x * s + (dir ? dir.x : 0);
      this.vel[i3 + 1] = _v.y * s + up * (0.6 + Math.random() * 0.8) + (dir ? dir.y : 0);
      this.vel[i3 + 2] = _v.z * s + (dir ? dir.z : 0);
      this.age[i] = 0;
      this.life[i] = life * (0.7 + Math.random() * 0.6);
      this.size0[i] = size * (0.7 + Math.random() * 0.6);
      this.size1[i] = (sizeEnd ?? size * 2.2) * (0.7 + Math.random() * 0.6);
      this.col0[i3] = _c.r; this.col0[i3 + 1] = _c.g; this.col0[i3 + 2] = _c.b;
      this.col1[i3] = _c2.r; this.col1[i3 + 1] = _c2.g; this.col1[i3 + 2] = _c2.b;
      this.alpha0[i] = alpha;
      this.grav[i] = gravity;
      this.drag[i] = drag;
    }
    this.alive = this.max; // simulate until everything has died out again
  }

  update(dt) {
    if (this.alive <= 0) return;
    let live = 0;
    const size = this.aSize.array, alpha = this.aAlpha.array, col = this.aColor.array;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) {
        alpha[i] = 0;
        size[i] = 0;
        continue;
      }
      live++;
      const i3 = i * 3;
      this.age[i] += dt;
      const k = Math.min(1, this.age[i] / this.life[i]); // 0 → 1 over its life
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp + this.grav[i] * dt;
      this.vel[i3 + 2] *= damp;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      // fade in fast, out slow
      alpha[i] = this.alpha0[i] * Math.min(1, k * 8) * (1 - k) * (1 - k);
      col[i3] = this.col0[i3] + (this.col1[i3] - this.col0[i3]) * k;
      col[i3 + 1] = this.col0[i3 + 1] + (this.col1[i3 + 1] - this.col0[i3 + 1]) * k;
      col[i3 + 2] = this.col0[i3 + 2] + (this.col1[i3 + 2] - this.col0[i3 + 2]) * k;
    }
    this.alive = live;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
    this.aColor.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
