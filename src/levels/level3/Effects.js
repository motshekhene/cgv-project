import * as THREE from "three";

/**
 * Level 03 effect systems — embers over the pool, impact sparks,
 * expanding shockwave rings and trauma-based camera shake.
 *
 * Everything is pooled or single-draw, so update() cost stays flat no
 * matter how violent the fight gets.
 */

/* ---------------- embers: one Points draw, animated in the shader ---------------- */

const EMBER_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uSize;
  varying float vFade;
  varying vec3 vSeed;
  void main() {
    vSeed = aSeed;
    float h = 7.0;
    float y = mod(aSeed.y * h + uTime * (0.35 + aSeed.z * 0.75), h);
    vec3 p = position;
    p.y = y;
    p.x += sin(uTime * (0.6 + aSeed.x) + aSeed.z * 40.0) * 0.5;
    p.z += cos(uTime * (0.5 + aSeed.z) + aSeed.x * 40.0) * 0.5;
    vFade = smoothstep(0.0, 0.8, y) * smoothstep(h, h - 1.6, y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (140.0 / -mv.z) * (0.5 + aSeed.x * 0.8);
    gl_Position = projectionMatrix * mv;
  }
`;

const EMBER_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uTime;
  varying float vFade;
  varying vec3 vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float flicker = 0.55 + 0.45 * sin(uTime * (2.0 + vSeed.x * 3.0) + vSeed.y * 20.0);
    float a = smoothstep(0.5, 0.05, d) * vFade * flicker;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uColorA, uColorB, vSeed.z), a);
  }
`;

/* ---------------- sparks: CPU-simulated pool of points ---------------- */

const SPARK_VERT = /* glsl */ `
  attribute vec3 aVel;
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aColor;
  varying float vLife;
  varying vec3 vColor;
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (240.0 / -mv.z) * clamp(aLife * 3.0, 0.2, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FRAG = /* glsl */ `
  varying float vLife;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * clamp(vLife * 2.5, 0.0, 1.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/* ---------------- shockwave rings ---------------- */

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float rad = length(vUv - 0.5) * 2.0;
    float a = uOpacity * (0.35 + 0.65 * rad) * smoothstep(1.0, 0.86, rad);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/* ---------------- camera shake: trauma model ---------------- */

export class CameraShake {
  constructor() {
    this.trauma = 0;
    this._t = Math.random() * 100;
    this._offset = new THREE.Vector3();
  }
  add(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  update(dt) {
    this._t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
  }
  /** Positional offset to add to the camera AFTER it has been placed. */
  getOffset(out) {
    const amp = this.trauma * this.trauma * 0.45;
    const t = this._t;
    out.set(
      (Math.sin(t * 37.3) + Math.sin(t * 19.7)) * 0.5 * amp,
      (Math.sin(t * 41.1) + Math.sin(t * 23.3)) * 0.5 * amp,
      (Math.sin(t * 29.9) + Math.sin(t * 17.3)) * 0.5 * amp,
    );
    return out;
  }
}

/* ---------------- the bundle ---------------- */

export class Effects {
  constructor(root) {
    this.root = root;
    this.shake = new CameraShake();
    this.time = 0;

    this._buildEmbers();
    this._buildSparks();
    this._buildRings();
  }

  /* -------- embers -------- */
  _buildEmbers() {
    const COUNT = 420;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // annulus over the lava pool: r 6.5..15 around (0, 0, -38)
      const a = Math.random() * Math.PI * 2;
      const r = 6.5 + Math.random() * 8.5;
      positions[i * 3] = Math.sin(a) * r;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = -38 + Math.cos(a) * r;
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    this.emberMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 9 },
        uColorA: { value: new THREE.Color(0xff5a1e) },
        uColorB: { value: new THREE.Color(0xffd08a) },
      },
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
    });
    this.embers = new THREE.Points(geo, this.emberMat);
    this.embers.frustumCulled = false;
    this.root.add(this.embers);
  }

  /* -------- sparks -------- */
  _buildSparks() {
    const COUNT = 260;
    this.sparkCount = COUNT;
    this.sparkPos = new Float32Array(COUNT * 3);
    this.sparkVel = new Float32Array(COUNT * 3);
    this.sparkLife = new Float32Array(COUNT);
    this.sparkColor = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.sparkPos[i * 3 + 1] = -999;
      sizes[i] = 2.5 + Math.random() * 3.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3));
    geo.setAttribute("aVel", new THREE.BufferAttribute(this.sparkVel, 3));
    geo.setAttribute("aLife", new THREE.BufferAttribute(this.sparkLife, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.sparkColor, 3));
    this.sparkGeo = geo;
    this.sparkMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
    });
    this.sparks = new THREE.Points(geo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);
    this._sparkCursor = 0;
  }

  /** Burst of molten sparks — every hit, parry, vent blast and collapse. */
  burstSparks(pos, count = 24, color = 0xffa03a, speed = 6) {
    const col = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this._sparkCursor;
      this._sparkCursor = (this._sparkCursor + 1) % this.sparkCount;
      this.sparkPos[i * 3] = pos.x + (Math.random() - 0.5) * 0.3;
      this.sparkPos[i * 3 + 1] = pos.y + Math.random() * 0.5;
      this.sparkPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.8;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.sparkVel[i * 3] = Math.cos(a) * sp;
      this.sparkVel[i * 3 + 1] = up * sp;
      this.sparkVel[i * 3 + 2] = Math.sin(a) * sp;
      this.sparkLife[i] = 0.3 + Math.random() * 0.45;
      this.sparkColor[i * 3] = col.r;
      this.sparkColor[i * 3 + 1] = col.g;
      this.sparkColor[i * 3 + 2] = col.b;
    }
  }

  /* -------- rings -------- */
  _buildRings() {
    this.rings = [];
    const geo = new THREE.RingGeometry(0.86, 1.0, 48);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color(0xff7a2a) },
          uOpacity: { value: 0 },
        },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.rings.push({ mesh, mat, t: 0, dur: 1, maxR: 8 });
    }
    this._ringCursor = 0;
  }

  /** Expanding ground ring — telegraphs, shockwaves, vents. */
  spawnRing(pos, { maxR = 8, dur = 0.8, color = 0xff7a2a, opacity = 0.9 } = {}) {
    const r = this.rings[this._ringCursor];
    this._ringCursor = (this._ringCursor + 1) % this.rings.length;
    r.t = 0;
    r.dur = dur;
    r.maxR = maxR;
    r.mesh.position.set(pos.x, pos.y + 0.06, pos.z);
    r.mesh.scale.setScalar(0.4);
    r.mesh.visible = true;
    r.mat.uniforms.uColor.value.set(color);
    r.mat.uniforms.uOpacity.value = opacity;
    return r;
  }

  addTrauma(amount) {
    this.shake.add(amount);
  }

  update(dt) {
    this.time += dt;
    this.shake.update(dt);
    this.emberMat.uniforms.uTime.value = this.time;

    // sparks
    for (let i = 0; i < this.sparkCount; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) {
        this.sparkPos[i * 3 + 1] = -999;
        continue;
      }
      this.sparkVel[i * 3 + 1] -= 14 * dt; // gravity, softened
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.aLife.needsUpdate = true;
    this.sparkGeo.attributes.aColor.needsUpdate = true;

    // rings
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const p = Math.min(1, r.t / r.dur);
      const eased = 1 - Math.pow(1 - p, 2);
      r.mesh.scale.setScalar(THREE.MathUtils.lerp(0.4, r.maxR, eased));
      r.mat.uniforms.uOpacity.value = Math.pow(1 - p, 1.6) * 0.9;
      if (p >= 1) r.mesh.visible = false;
    }
  }
}
