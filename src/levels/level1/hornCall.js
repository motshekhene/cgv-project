import * as THREE from "three";
import { poseHorn, HORN_SLING } from "../../intros/cast.js";

/**
 * THE HORN CALL — Level 1's own move, and the first time the horn shows what
 * it is (Level 3 is where it bends time, and where the forest strikes the man
 * who takes it).
 *
 * The tokens Kai picks up along the trail fill the horn. Full, he can blow it
 * (V, or the HORN button) without breaking stride: his right hand brings it
 * up off his hip to his mouth, and the forest answers. A ring of the horn's
 * light rolls out across the ground, every obstacle on the trail ahead of him
 * shatters, and behind him roots tear up out of the earth round the Marshal's
 * legs, so he stumbles and loses ground.
 *
 * Level01 owns the rules (the charge, what gets cleared, the Marshal's gap);
 * this file owns how it looks and sounds:
 *
 *   hornBlowPose(kai, k)            his arm and head, the horn in his hand: k 0..1
 *   new Shockwave(root)             .fire(at) / .update(dt)   the ring across the ground
 *   new RootBurst(root)             .fire(at, seconds) / .update(dt)   roots round the Marshal
 *   new Shards(root)                .spawn(at, n, colour) / .update(dt)   what's left of an obstacle
 *   hornBuffer(ctx)                 the call itself, synthesised: an AudioBuffer
 */
const HORN_CYAN = 0x4fd6e0;

/* ------------------------------------------------------------ the pose */

// the horn in his fist with its mouthpiece at his lips, the curl up and out to his right
const HORN_BLOW_KAI = { bone: "PalmR", pos: [0.0, 0.07, 0.04], rot: [0.2, 0.5, Math.PI / 2 + 0.6] };

const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _h = new THREE.Vector3();
const _m = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _w = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _I = new THREE.Quaternion();

/** Turn `bone` so the line to `child` points at world point `target`, blended by k (as the slide does). */
function aimAt(kai, bone, child, target, k) {
  kai._stash(bone);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _d.copy(target).sub(_a);
  if (_d.lengthSq() < 1e-8) return;
  _q.setFromUnitVectors(_b.sub(_a).normalize(), _d.normalize());
  _q.slerp(_I, 1 - k);
  bone.getWorldQuaternion(_w).premultiply(_q);
  bone.parent.getWorldQuaternion(_r).invert();
  bone.quaternion.copy(_r.multiply(_w));
}

/**
 * Kai mid-stride with the horn at his lips: a two-bone reach (shoulder,
 * elbow, wrist) to just under his mouth, the elbow out to his right, and his
 * head tipped back a little into the call. His legs and his other arm keep
 * the run. k 0..1 blends it in and out; the horn goes into his hand from his
 * hip while k rises past HAND_AT and back to the sling as it falls.
 */
export function hornBlowPose(kai, k) {
  const b = (n) => kai.bones["mixamorig" + n];
  const sh = b("RightArm"), el = b("RightForeArm"), wr = b("RightHand"), head = b("Head"), neck = b("Neck");
  const horn = kai.horn;
  if (!sh || !el || !wr || !head) return;
  // his own frame: +z the way he faces, +x his left
  kai.root.getWorldQuaternion(_r);
  const fwd = _u.set(0, 0, 1).applyQuaternion(_r);
  const right = _v.set(-1, 0, 0).applyQuaternion(_r);

  if (k > 0.001) {
    // head back a touch, into the call
    if (neck) {
      kai._stash(neck);
      neck.quaternion.multiply(_q.setFromAxisAngle(_d.set(1, 0, 0), -0.32 * k));
    }
    head.getWorldPosition(_m);
    const s = kai.root.getWorldScale(_d).x || 1;
    // the fist goes just under and in front of his mouth, a little to his right
    _h.copy(_m).addScaledVector(fwd, 0.13 * s).addScaledVector(right, 0.05 * s).y -= 0.1 * s;
    sh.getWorldPosition(_s);
    el.getWorldPosition(_e);
    wr.getWorldPosition(_a);
    const upper = _s.distanceTo(_e), lower = _e.distanceTo(_a);
    // two-bone reach: where the elbow goes so the wrist lands on the target, bent out to his right and down
    const toH = _d.copy(_h).sub(_s);
    const dist = Math.min(toH.length(), (upper + lower) * 0.999);
    toH.normalize();
    const cosA = THREE.MathUtils.clamp((upper * upper + dist * dist - lower * lower) / (2 * upper * dist), -1, 1);
    const pole = _b.copy(right).multiplyScalar(1).add(_a.set(0, -0.7, 0)).addScaledVector(fwd, 0.2);
    pole.addScaledVector(toH, -pole.dot(toH)).normalize();
    const elbow = _e.copy(_s).addScaledVector(toH, upper * cosA).addScaledVector(pole, upper * Math.sqrt(1 - cosA * cosA));
    const hand = _h.copy(_s).addScaledVector(toH, dist);
    aimAt(kai, sh, el, elbow, k);
    aimAt(kai, el, wr, hand, k);
  }

  // the horn: into his fist on the way up, back on its sling on the way down
  if (!horn) return;
  const palm = kai.bone("PalmR"), hips = kai.bone(HORN_SLING.bone);
  if (!palm || !hips) return;
  if (k > 0.35) {
    if (horn.parent !== palm) palm.attach(horn);
    poseHorn(horn, palm, HORN_BLOW_KAI, Math.min(1, (k - 0.35) / 0.4));
  } else {
    if (horn.parent !== hips) hips.attach(horn);
    poseHorn(horn, hips, HORN_SLING, k > 0 ? 0.35 : 1);
  }
}

/* ------------------------------------------------------------ the ring across the ground */

const ringVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uT, uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    // a bright front at the rim, a fading wake behind it, and spokes of light in the wake
    float front = smoothstep(0.82, 0.985, r) * (1.0 - smoothstep(0.985, 1.0, r));
    float wake = smoothstep(0.2, 0.95, r) * 0.32;
    float ang = atan(p.y, p.x);
    float spokes = pow(abs(sin(ang * 14.0 + uT * 3.0)), 18.0) * smoothstep(0.3, 0.9, r) * 0.5;
    float a = (front + wake + spokes) * uOpacity;
    gl_FragColor = vec4(uColor * (1.0 + front * 1.5), a);
  }
`;

export class Shockwave {
  constructor(root) {
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: { uColor: { value: new THREE.Color(HORN_CYAN) }, uT: { value: 0 }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ring = new THREE.Mesh(geo, this.mat);
    this.ring.renderOrder = 4;
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    // a wall of the same light rising off the rim
    const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true);
    wallGeo.translate(0, 0.5, 0);
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    this.wallTex = new THREE.CanvasTexture(c);
    this.wallMat = new THREE.MeshBasicMaterial({
      map: this.wallTex, color: HORN_CYAN, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.wall = new THREE.Mesh(wallGeo, this.wallMat);
    this.wall.visible = false;
    this.wall.frustumCulled = false;
    root.add(this.ring, this.wall);
    this.t = -1;
    this.reach = 45;
    this.time = 0.75;
  }

  fire(at, reach = 45) {
    this.t = 0;
    this.reach = reach;
    this.ring.position.copy(at).y += 0.06;
    this.wall.position.copy(at);
    this.ring.visible = this.wall.visible = true;
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.time);
    const e = 1 - Math.pow(1 - k, 3); // fast out of the horn, slowing as it spreads
    const r = 1 + (this.reach - 1) * e;
    this.ring.scale.set(r, 1, r);
    this.wall.scale.set(r, 1.8 * (1 - k) + 0.3, r);
    this.mat.uniforms.uT.value = this.t;
    this.mat.uniforms.uOpacity.value = 1 - k * k;
    this.wallMat.opacity = 0.45 * (1 - k);
    if (k >= 1) {
      this.t = -1;
      this.ring.visible = this.wall.visible = false;
    }
  }

  dispose() {
    this.ring.geometry.dispose();
    this.mat.dispose();
    this.wall.geometry.dispose();
    this.wallMat.dispose();
    this.wallTex.dispose();
  }
}

/* ------------------------------------------------------------ roots round the Marshal */

const ROOTS = 9;

export class RootBurst {
  constructor(root) {
    this.group = new THREE.Group();
    this.group.visible = false;
    root.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95, flatShading: true, emissive: 0x0b3a3a, emissiveIntensity: 0.6 });
    this.roots = [];
    // each root a tapering tube along a curve that rises out of the ground, arches and hooks back down
    for (let i = 0; i < ROOTS; i++) {
      const a = (i / ROOTS) * Math.PI * 2 + Math.random() * 0.4;
      const r0 = 1.4 + Math.random() * 0.9;
      const h = 1.1 + Math.random() * 1.0;
      const pts = [
        new THREE.Vector3(Math.cos(a) * r0, -0.6, Math.sin(a) * r0),
        new THREE.Vector3(Math.cos(a) * r0 * 0.85, h * 0.6, Math.sin(a) * r0 * 0.85),
        new THREE.Vector3(Math.cos(a) * r0 * 0.45, h, Math.sin(a) * r0 * 0.45),
        new THREE.Vector3(Math.cos(a + 0.5) * r0 * 0.2, h * 0.7, Math.sin(a + 0.5) * r0 * 0.2),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 16, 0.11 + Math.random() * 0.05, 6, false);
      // taper towards the tip
      const pos = geo.attributes.position;
      const center = new THREE.Vector3();
      for (let s = 0; s <= 16; s++) {
        curve.getPointAt(s / 16, center);
        const taper = 1 - (s / 16) * 0.85;
        for (let j = 0; j <= 6; j++) {
          const idx = s * 7 + j;
          _a.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(taper).add(center);
          pos.setXYZ(idx, _a.x, _a.y, _a.z);
        }
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.roots.push({ mesh, delay: Math.random() * 0.25 });
    }
    this.t = -1;
    this.hold = 2.5;
  }

  fire(at, seconds = 2.5) {
    this.t = 0;
    this.hold = seconds;
    this.group.position.copy(at);
    this.group.rotation.y = Math.random() * Math.PI;
    this.group.visible = true;
  }

  /** Follow whoever they've caught (he's still sliding a little as they take him). */
  follow(at) {
    if (this.t >= 0) this.group.position.lerp(at, 0.2);
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const out = this.hold + 0.6;
    for (const r of this.roots) {
      const t = this.t - r.delay;
      // up out of the ground fast, hold, and back down
      const up = THREE.MathUtils.clamp(t / 0.22, 0, 1);
      const down = THREE.MathUtils.clamp((this.t - this.hold) / 0.6, 0, 1);
      const k = (1 - Math.pow(1 - up, 3)) * (1 - down);
      r.mesh.scale.set(1, Math.max(0.001, k), 1);
      r.mesh.position.y = -0.4 * (1 - k);
    }
    this.mat.emissiveIntensity = 0.6 * (1 - THREE.MathUtils.clamp(this.t / 1.5, 0, 1)) + 0.05;
    if (this.t > out) {
      this.t = -1;
      this.group.visible = false;
    }
  }

  dispose() {
    for (const r of this.roots) r.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------ what's left of an obstacle */

const SHARDS = 220;

export class Shards {
  constructor(root) {
    const geo = new THREE.TetrahedronGeometry(0.16, 0);
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, SHARDS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    root.add(this.mesh);
    this.p = Array.from({ length: SHARDS }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(), s: 1, life: 0 }));
    this.next = 0;
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
    // seed every slot's colour once, so instanceColor exists before the first frame
    for (let i = 0; i < SHARDS; i++) this.mesh.setColorAt(i, this._c.setHex(0x8a8a76));
  }

  /** `n` pieces of an obstacle at `at`, flung up and out, the horn's light on them. */
  spawn(at, n = 18, colour = 0x8a8a76) {
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % SHARDS;
      const p = this.p[k];
      p.pos.set(at.x + (Math.random() - 0.5) * 1.2, at.y + 0.3 + Math.random() * 1.0, at.z + (Math.random() - 0.5) * 0.8);
      const a = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 5;
      p.vel.set(Math.cos(a) * sp, 3.5 + Math.random() * 5, Math.sin(a) * sp - 3);
      p.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      p.s = 0.6 + Math.random() * 1.4;
      p.life = 1.4 + Math.random() * 0.6;
      this.mesh.setColorAt(k, this._c.setHex(colour).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const o = this._o;
    let any = false;
    for (let i = 0; i < SHARDS; i++) {
      const p = this.p[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 14 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        any = true;
      }
      o.position.copy(p.pos);
      o.rotation.copy(p.rot);
      o.scale.setScalar(p.life > 0 ? p.s * Math.min(1, p.life / 0.4) : 0);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.count = any ? SHARDS : 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

/* ------------------------------------------------------------ the sound */

/**
 * A kudu horn, synthesised: a low, slightly rough tone that bends up into its
 * note as the breath catches, a fifth over it, a slow waver, breath noise on
 * top, and a long fall-off. About 1.8 s.
 */
export function hornBuffer(ctx) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 1.9);
  const buf = ctx.createBuffer(1, len, rate);
  const out = buf.getChannelData(0);
  const f0 = 92; // a low F#
  let ph1 = 0, ph2 = 0, noise = 0;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    const bend = 0.9 + 0.1 * Math.min(1, t / 0.14);
    const waver = 1 + 0.006 * Math.sin(t * 2 * Math.PI * 5.2);
    const f = f0 * bend * waver;
    ph1 += (2 * Math.PI * f) / rate;
    ph2 += (2 * Math.PI * f * 1.5) / rate;
    // a rich, reedy tone: odd and even harmonics falling off
    let s = 0;
    for (let h = 1; h <= 9; h++) s += Math.sin(ph1 * h) / (h * (h % 2 ? 1 : 1.6));
    s += 0.35 * Math.sin(ph2) + 0.12 * Math.sin(ph2 * 2);
    noise = noise * 0.96 + (Math.random() * 2 - 1) * 0.04;
    const attack = Math.min(1, t / 0.09);
    const release = t > 1.25 ? Math.max(0, 1 - (t - 1.25) / 0.6) : 1;
    const swell = 0.85 + 0.15 * Math.min(1, t / 0.6);
    out[i] = (s * 0.22 + noise * 0.9) * attack * release * swell;
  }
  return buf;
}
