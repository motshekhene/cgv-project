import * as THREE from 'three';

/**
 * Trails — the swoosh a fast strike leaves in the air, and the ring a heavy
 * one knocks across the ground.
 *
 * StrikeTrail is a ribbon swept by one limb: every frame it samples two
 * points on it (the knee and the toes for a kick, the elbow and the knuckles
 * for a punch) and joins them to the previous frame's pair, like a blade
 * trail, so the shape is exactly the arc the limb took. Each slice fades out
 * over `life` seconds, and across the ribbon from the joint (faint) to the
 * tip (bright). Additive, so it reads as light.
 *
 * Shockwaves are flat rings that race out across the ground and fade.
 *
 *   trail.update(dt, emitting ? [baseBone, tipBone] : null);
 *   waves.spawn(x, y, z);  waves.update(dt);
 */
const MAX = 28; // slices kept
const _a = new THREE.Vector3();

export class StrikeTrail {
  constructor(parent, { color = 0xffd88a, life = 0.22 } = {}) {
    this.life = life;
    this.samples = []; // { a, b, age }, newest last
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 2 * 3), 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(MAX * 2), 1));
    geo.setAttribute('aTip', new THREE.BufferAttribute(new Float32Array(MAX * 2).map((_, i) => i % 2), 1));
    const idx = [];
    for (let i = 0; i < MAX - 1; i++) {
      const o = i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `
        attribute float aFade;
        attribute float aTip;
        varying float vA;
        void main() {
          vA = aFade * (0.15 + 0.85 * aTip);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  setColor(hex) {
    this.material.uniforms.uColor.value.setHex(hex);
  }

  /** bones: [joint, tip] to sample this frame, or null while the limb isn't striking. */
  update(dt, bones) {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[0].age > this.life) this.samples.shift();
    if (bones) {
      const s = this.samples.length >= MAX ? this.samples.shift() : { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
      bones[0].getWorldPosition(s.a);
      bones[1].getWorldPosition(s.b);
      // reach a little past the tip bone: the toes and knuckles, not the joint they hang off
      s.b.addScaledVector(_a.subVectors(s.b, s.a).normalize(), 0.14);
      s.age = 0;
      this.samples.push(s);
    }
    const n = this.samples.length;
    const geo = this.mesh.geometry;
    if (n < 2) {
      geo.setDrawRange(0, 0);
      return;
    }
    const pos = geo.attributes.position, fade = geo.attributes.aFade;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const f = (1 - s.age / this.life) ** 1.5 * (i / (n - 1)) ** 0.6; // older slices and the tail end fade
      pos.setXYZ(i * 2, s.a.x, s.a.y, s.a.z);
      pos.setXYZ(i * 2 + 1, s.b.x, s.b.y, s.b.z);
      fade.setX(i * 2, f);
      fade.setX(i * 2 + 1, f);
    }
    pos.needsUpdate = true;
    fade.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  }
}

/** Flat rings that race out across the ground from a heavy blow. */
export class Shockwaves {
  constructor(parent, { color = 0xffe2b0, count = 4 } = {}) {
    const geo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      }));
      m.visible = false;
      m.renderOrder = 6;
      parent.add(m);
      this.rings.push({ m, age: 0, life: 0.45, size: 3 });
    }
    this.next = 0;
  }

  spawn(x, y, z, { size = 3.2, life = 0.45, color = null } = {}) {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % this.rings.length;
    r.m.position.set(x, y + 0.04, z);
    r.m.visible = true;
    if (color !== null) r.m.material.color.setHex(color);
    r.age = 0;
    r.life = life;
    r.size = size;
  }

  update(dt) {
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.m.visible = false;
        continue;
      }
      r.m.scale.setScalar(0.25 + r.size * (1 - (1 - t) ** 3));
      r.m.material.opacity = 0.85 * (1 - t) ** 1.4;
    }
  }
}
