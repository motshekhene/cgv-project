import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Telegraphs } from './Telegraphs.js';
import { Nav } from './Nav.js';

/**
 * ShadowStag — Level 3's last fight (act III).
 *
 * Baba Zwane falls with the horn out of his hand, and the horn, tainted by
 * the hand that took it, is angry: the stone stag at the shrine gate cracks
 * open and comes down off its plinth as a spirit of the forest gone wrong. It
 * fights for the horn until Kai has beaten it, and only then is the horn clean
 * again (Level03 runs the ending from there).
 *
 * Its look is the showpiece (all in the material, one shader on the model):
 *   - black stone, with veins of light running through it: a ridged 3D noise
 *     on the body's own (bind-pose) coordinates, so they stay put on it as it
 *     moves, pulsing. Red while it's armoured; cyan when it's open to hits
 *   - a smouldering rim round its outline (fresnel)
 *   - burning eyes, smoke pouring off it, embers rising
 *   - when it dies it burns away: a noise dissolve with a white-hot edge
 *
 * How it fights (every attack lights its ground first, level3/Telegraphs.js):
 *   CHARGE   head down, a long lane at Kai, then a gallop down it. Get out of
 *            the lane. If it runs into a tree, a column or a wall, it's stuck
 *            there, dazed: lure it into things
 *   STOMP    rears its head and brings it down: a wide disc round it
 *   THORNS   (once it's enraged, below half health) thorns burst up in a ring
 *            round it: the middle is safe, and so is well outside
 * It's ARMOURED (hits do 40%) except while it's OPEN: stuck after a charge,
 * skidding to a stop, getting over a stomp, or reeling from a parry. Open,
 * hits do 2.2x. The veins say which.
 *
 *   const stag = new ShadowStag(root, arena, kai, gltf);
 *   stag.rise(from, to);                  // off its plinth into the fight
 *   stag.update(dt);                      // -> onStrike(info), onImpact(kind, pos), onEnrage(), onDown()
 */
const HEALTH = 420;
const WALK = 2.8;
const RAD = 1.1; // m, its body for collisions and the way round trees
const ARMOUR = 0.4;
const OPEN = 2.2;
const LENGTH = 4.2; // m nose to tail

const ATTACKS = {
  charge: { tell: 0xb3122a, telegraph: [1.15, 0.92], damage: 22, blockMul: 0.5, speed: [15, 17], width: 2.2 },
  stomp: { tell: 0x8a2be2, telegraph: [1.0, 0.82], damage: 16, blockMul: 0.4, radius: 4.2 },
  thorns: { tell: 0xd23a10, telegraph: [1.25, 1.05], damage: 12, blockMul: 0.5, radius: 7.6, inner: 0.48 },
};

const NOISE = /* glsl */ `
  float sHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float sNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sHash(i), sHash(i + vec3(1, 0, 0)), f.x), mix(sHash(i + vec3(0, 1, 0)), sHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(sHash(i + vec3(0, 0, 1)), sHash(i + vec3(1, 0, 1)), f.x), mix(sHash(i + vec3(0, 1, 1)), sHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float sRidged(vec3 p) {
    float n = sNoise(p) * 0.65 + sNoise(p * 2.13 + 7.1) * 0.35;
    return 1.0 - abs(n * 2.0 - 1.0);
  }
`;

/** Its stone: the model's own shading, darkened to black rock, with the veins, the rim and the burn in it. */
function shadowMaterial(src, u) {
  const c = src.color ? src.color : new THREE.Color(0x888888);
  const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setScalar(0.035 + lum * 0.1),
    roughness: 0.48, metalness: 0.3, flatShading: true,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${NOISE}
        uniform float uTime, uVein, uOpen, uDissolve, uScale;
        uniform vec3 uCorrupt, uClean;
        varying vec3 vObj;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float burnN = sNoise(vObj * uScale * 2.6);
        if (burnN < uDissolve) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 q = vObj * uScale;
        float vein = smoothstep(0.8, 0.95, sRidged(q * 1.6 + vec3(0.0, uTime * 0.06, 0.0)));
        float pulse = 0.65 + 0.35 * sin(uTime * 4.0 + q.y * 3.0 + q.z * 2.0);
        vec3 veinCol = mix(uCorrupt, uClean, uOpen);
        totalEmissiveRadiance += veinCol * vein * uVein * pulse;
        float rim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.4);
        totalEmissiveRadiance += mix(vec3(0.32, 0.02, 0.05), vec3(0.04, 0.42, 0.5), uOpen) * rim * 0.55;
        if (uDissolve > 0.0) totalEmissiveRadiance += vec3(1.0, 0.55, 0.2) * (1.0 - smoothstep(uDissolve, uDissolve + 0.07, burnN)) * 6.0;`);
  };
  m.customProgramCacheKey = () => 'shadow-stag';
  return m;
}

/** A soft round dot, for the smoke, the embers and the eyes. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Particles that live a while and fade, each with its own alpha (RGBA vertex colours). */
class Puffs {
  constructor(parent, n, { color, size, blending, opacity }) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.base = new THREE.Color(color);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.mat = new THREE.PointsMaterial({
      map: dotTexture(), size, vertexColors: true, transparent: true, opacity, depthWrite: false, blending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.next = 0;
  }

  emit(p, v, life) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.max[i] = life;
  }

  update(dt, rise = 0) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] += rise * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      const a = Math.max(0, this.life[i] / this.max[i]);
      this.col[i * 4] = this.base.r;
      this.col[i * 4 + 1] = this.base.g;
      this.col[i * 4 + 2] = this.base.b;
      this.col[i * 4 + 3] = a * Math.min(1, (this.max[i] - this.life[i]) / 0.2);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.map.dispose();
    this.mat.dispose();
  }
}

export class ShadowStag {
  constructor(parent, arena, kai, gltf) {
    this.arena = arena;
    this.kai = kai;
    this.parent = parent;
    this.root = new THREE.Group();
    this.root.visible = false;
    parent.add(this.root);

    this.u = {
      uTime: { value: 0 }, uVein: { value: 3.2 }, uOpen: { value: 0 }, uDissolve: { value: 0 }, uScale: { value: 1 },
      uCorrupt: { value: new THREE.Color(0xff3a14) }, uClean: { value: new THREE.Color(0x4fe6f0) },
    };
    const model = cloneSkinned(gltf.scene);
    const inner = new THREE.Group();
    inner.add(model);
    inner.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const s = LENGTH / (Math.max(size.x, size.z) || 1);
    inner.scale.setScalar(s);
    inner.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    this.u.uScale.value = 1.6; // the model's own units are ~5 long: a few veins across it
    this.height = box.max.y - box.min.y;
    this.mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => shadowMaterial(m, this.u)) : shadowMaterial(o.material, this.u);
      this.mats.push(...[].concat(o.material));
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds don't follow the gallop
    });
    this.root.add(inner);
    this.inner = inner;
    this.model = model;

    // its clips, by name (the glTF has each twice, with and without its armature's prefix)
    this.mixer = new THREE.AnimationMixer(model);
    const clip = (re) => (gltf.animations || []).find((a) => re.test(a.name.replace(/^.*\|/, '')));
    this.actions = {};
    for (const [key, re] of Object.entries({
      walk: /^Walk$/, gallop: /^Gallop$/, idle: /^Idle$/, low: /^Idle_Headlow$/, butt: /^Attack_Headbutt$/,
      hitL: /^Idle_HitReact_Left$/, hitR: /^Idle_HitReact_Right$/, death: /^Death$/, jump: /^Jump_toIdle$/,
    })) {
      const a = clip(re);
      if (a) this.actions[key] = this.mixer.clipAction(a);
    }
    this.current = null;

    // burning eyes on its head
    let head = null;
    model.traverse((o) => { if (o.isBone && /^head$/i.test(o.name)) head = o; });
    this.dot = dotTexture();
    const eyeMat = new THREE.SpriteMaterial({ map: this.dot, color: 0xff4a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.eyeMat = eyeMat;
    this.eyes = [];
    if (head) {
      inner.updateMatrixWorld(true);
      const hp = head.getWorldPosition(new THREE.Vector3());
      for (const side of [-1, 1]) {
        const eye = new THREE.Sprite(eyeMat);
        const w = new THREE.Vector3(hp.x + side * 0.16, hp.y + 0.05, hp.z + 0.32);
        eye.position.copy(head.worldToLocal(w));
        eye.scale.setScalar(0.32 / (head.getWorldScale(new THREE.Vector3()).x || 1));
        head.add(eye);
        this.eyes.push(eye);
      }
    }

    this.smoke = new Puffs(parent, 90, { color: 0x0b0a0d, size: 1.3, blending: THREE.NormalBlending, opacity: 0.55 });
    this.embers = new Puffs(parent, 60, { color: 0xff5a1a, size: 0.16, blending: THREE.AdditiveBlending, opacity: 1 });
    this._buildThorns(parent);

    this.zones = new Telegraphs(parent, arena);
    this.nav = new Nav(arena, RAD);
    this.maxHealth = this.health = HEALTH;
    this.state = 'OFF';
    this.t = 0;
    this.heading = 0;
    this.attackName = 'charge';
    this.enraged = false;
    this.restFor = 0;
    this.strikeDir = new THREE.Vector3(0, 0, 1);
    this.chargeFrom = new THREE.Vector3();
    this.lastArmoured = false;
    this.onStrike = null;
    this.onImpact = null;
    this.onEnrage = null;
    this.onDown = null;
    this._dir = new THREE.Vector3();
    this._move = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._before = new THREE.Vector3();
    this._emitT = 0;
    this.dissolve = 0;
  }

  /** Thorns: dark spikes, red at the tips, that burst up out of the ground in the ring round it. */
  _buildThorns(parent) {
    const n = 46;
    const geo = new THREE.ConeGeometry(0.17, 1.5, 5);
    geo.translate(0, 0.75, 0);
    this.thornMat = new THREE.MeshStandardMaterial({ color: 0x140c0a, emissive: 0x5a0a04, emissiveIntensity: 0.8, roughness: 0.7, flatShading: true });
    this.thorns = new THREE.InstancedMesh(geo, this.thornMat, n);
    this.thorns.frustumCulled = false;
    this.thorns.count = 0;
    parent.add(this.thorns);
    this.thornSpots = [];
    this._o = new THREE.Object3D();
    this.thornT = -1;
  }

  _spawnThorns() {
    const A = ATTACKS.thorns;
    const p = this.root.position;
    this.thornSpots.length = 0;
    const n = this.thorns.instanceMatrix.count;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const r = A.radius * (A.inner + (1 - A.inner) * (0.15 + Math.random() * 0.75));
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      this.thornSpots.push({ x, z, y: this.arena.fighterY(x, z), tilt: (Math.random() - 0.5) * 0.5, s: 0.7 + Math.random() * 0.7, ry: Math.random() * 6 });
    }
    this.thornT = 0;
    this.thorns.count = n;
  }

  _updateThorns(dt) {
    if (this.thornT < 0) return;
    this.thornT += dt;
    const up = THREE.MathUtils.clamp(this.thornT / 0.12, 0, 1);
    const down = THREE.MathUtils.clamp((this.thornT - 0.75) / 0.45, 0, 1);
    const k = (1 - Math.pow(1 - up, 3)) * (1 - down);
    const o = this._o;
    this.thornSpots.forEach((t, i) => {
      o.position.set(t.x, t.y - 0.1, t.z);
      o.rotation.set(t.tilt, t.ry, t.tilt * 0.6);
      o.scale.set(t.s, Math.max(0.001, k * t.s), t.s);
      o.updateMatrix();
      this.thorns.setMatrixAt(i, o.matrix);
    });
    this.thorns.instanceMatrix.needsUpdate = true;
    if (this.thornT > 1.25) { this.thornT = -1; this.thorns.count = 0; }
  }

  get alive() {
    return this.state !== 'DOWN' && this.state !== 'OFF';
  }

  /** Open to hits: stuck after a charge, skidding, getting over a stomp, or reeling. */
  get vulnerable() {
    return this.state === 'STUCK' || this.state === 'SKID' || this.state === 'STAGGER' || (this.state === 'RECOVER' && this.openRecover);
  }

  /** The attack it's winding up or making, for its ground telegraph. */
  get threat() {
    const A = ATTACKS[this.attackName];
    const winding = this.state === 'TELL';
    const going = this.state === 'CHARGE' || this.state === 'STRIKE';
    if (!A || (!winding && !going)) return null;
    const dur = A.telegraph[this.enraged ? 1 : 0];
    const base = {
      name: this.attackName, color: A.tell, striking: going, k: going ? 1 : Math.min(1, this.t / dur),
      heading: going ? Math.atan2(this.strikeDir.x, this.strikeDir.z) : this.heading,
    };
    if (this.attackName === 'charge') return { ...base, radius: 0, length: this.chargeLen, width: A.width };
    return { ...base, radius: A.radius, inner: A.inner || 0, length: 0 };
  }

  _play(name, { fade = 0.25, speed = 1, once = false } = {}) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === a && !once) { a.timeScale = speed; return; }
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = speed;
    a.fadeIn(fade).play();
    if (this.current && this.current !== a) this.current.fadeOut(fade);
    this.current = a;
  }

  _enter(state) {
    this.state = state;
    this.t = 0;
  }

  /** Off its plinth at `from`, down into the fight at `to`. */
  rise(from, to) {
    this.root.visible = true;
    this.root.position.copy(from);
    this.riseFrom = from.clone();
    this.riseTo = to.clone();
    this.heading = Math.atan2(to.x - from.x, to.z - from.z);
    this._enter('RISE');
    this._play('jump', { fade: 0, once: true, speed: 0.9 });
  }

  /** The fight starts: it comes for him (down off the plinth at once, if its leap was skipped). */
  begin() {
    if (this.state === 'RISE' || this.state === 'OFF') {
      this.root.visible = true;
      this.root.position.copy(this.riseTo || this.root.position);
      this.root.position.y = this.arena.fighterY(this.root.position.x, this.root.position.z);
    }
    this._enter('STALK');
    this.restFor = 0.6;
  }

  takeDamage(amount) {
    if (!this.alive || this.state === 'RISE') return 0;
    const open = this.vulnerable;
    this.lastArmoured = !open;
    const dealt = amount * (open ? OPEN : ARMOUR);
    this.health = Math.max(0, this.health - dealt);
    this.u.uVein.value = open ? 5 : 3.4; // the hit lights it up
    if (this.health <= 0) {
      this._enter('DOWN');
      this.zones.hide();
      this._play('death', { fade: 0.1, once: true });
      this.onDown?.();
      return dealt;
    }
    if (!this.enraged && this.health <= this.maxHealth / 2) {
      this.enraged = true;
      this.onEnrage?.();
    }
    if (this.state === 'STALK' || this.state === 'RECOVER') this._play(Math.random() < 0.5 ? 'hitL' : 'hitR', { fade: 0.08, once: true, speed: 1.3 });
    return dealt;
  }

  /** Parried (its head turned aside): open, reeling. */
  stagger(time = 1.6) {
    this._enter('STAGGER');
    this.staggerFor = time;
    this.zones.hide();
    this._play('hitL', { fade: 0.08, once: true, speed: 0.7 });
  }

  _pick(dist, clear) {
    const A = ATTACKS;
    if (this.enraged && dist > 3.8 && dist < A.thorns.radius * 0.95 && Math.random() < 0.45) return 'thorns';
    if (dist < 4.6) return 'stomp';
    if (clear && dist > 6) return 'charge';
    return null;
  }

  update(dt) {
    this.u.uTime.value += dt;
    this.u.uVein.value += (3.2 - this.u.uVein.value) * (1 - Math.exp(-4 * dt));
    const open = this.vulnerable;
    this.u.uOpen.value += ((open ? 1 : 0) - this.u.uOpen.value) * (1 - Math.exp(-10 * dt));
    this.eyeMat.color.setHex(open ? 0x7ff4ff : 0xff4a1a);
    this.mixer.update(dt);
    this._updateThorns(dt);
    this._updateParticles(dt);
    if (this.state === 'OFF') return;
    if (this.state === 'DOWN') {
      // it goes down, then burns away
      if (this.t > 0.9) {
        this.dissolve = Math.min(1, this.dissolve + dt / 2.2);
        this.u.uDissolve.value = this.dissolve;
        if (this.dissolve >= 1) this.root.visible = false;
      }
      this.t += dt;
      return;
    }
    this.t += dt;
    const pos = this.root.position;
    const kp = this.kai.root.position;
    const dir = this._dir.set(kp.x - pos.x, 0, kp.z - pos.z);
    const dist = dir.length();
    if (dist > 1e-4) dir.divideScalar(dist);
    const face = (rate, towards = dir) => {
      const want = Math.atan2(towards.x, towards.z);
      let d = (want - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * (1 - Math.exp(-rate * dt));
    };
    const A = ATTACKS[this.attackName];
    const tell = A ? A.telegraph[this.enraged ? 1 : 0] : 1;

    switch (this.state) {
      case 'RISE': {
        // off the plinth, down into the courtyard
        const k = THREE.MathUtils.smoothstep(this.t, 0.15, 1.1);
        pos.lerpVectors(this.riseFrom, this.riseTo, k);
        pos.y = this.arena.fighterY(pos.x, pos.z) + Math.sin(k * Math.PI) * 1.4 * (1 - k * 0.3) + (1 - k) * (this.riseFrom.y - this.arena.fighterY(this.riseFrom.x, this.riseFrom.z));
        if (this.t > 1.3) {
          pos.y = this.arena.fighterY(pos.x, pos.z);
          this._play('idle', { fade: 0.4 });
          this._enter('READY');
          this.onImpact?.('land', pos);
        }
        break;
      }
      case 'READY':
        face(3);
        break;
      case 'STALK': {
        if (this.restFor > 0) {
          this.restFor -= dt;
          face(5);
          this._play('idle', { fade: 0.3 });
          break;
        }
        const clear = this.nav.clear(pos, kp);
        const pick = this._pick(dist, clear) || (this.t > 3.5 ? (dist < 6 ? 'stomp' : clear ? 'charge' : null) : null);
        if (pick) {
          this.attackName = pick;
          this.chargeLen = Math.min(18, dist + 5);
          this._enter('TELL');
          break;
        }
        const move = this.nav.steer(pos, kp, this._move);
        pos.addScaledVector(move, WALK * (this.enraged ? 1.25 : 1) * dt);
        face(5, move);
        this._play('walk', { fade: 0.3, speed: this.enraged ? 1.5 : 1.2 });
        break;
      }
      case 'TELL': {
        if (this.t < tell * 0.85) face(this.attackName === 'charge' ? 6 : 4);
        if (this.attackName === 'charge') {
          this.chargeLen = Math.min(18, dist + 5);
          this._play('low', { fade: 0.2 });
        } else this._play('low', { fade: 0.25, speed: 0.6 });
        if (this.t >= tell) {
          this.strikeDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
          this.hitDone = false;
          if (this.attackName === 'charge') {
            this.chargeFrom.copy(pos);
            this._enter('CHARGE');
            this._play('gallop', { fade: 0.1, speed: 1.5 });
          } else {
            this._enter('STRIKE');
            this._play('butt', { fade: 0.08, once: true, speed: 1.3 });
            if (this.attackName === 'thorns') this._spawnThorns();
          }
        }
        break;
      }
      case 'CHARGE': {
        const speed = A.speed[this.enraged ? 1 : 0];
        this._before.copy(pos);
        pos.addScaledVector(this.strikeDir, speed * dt);
        // into Kai: the one hit of the charge
        if (!this.hitDone) {
          const rx = kp.x - pos.x, rz = kp.z - pos.z;
          const along = rx * this.strikeDir.x + rz * this.strikeDir.z;
          const across = Math.abs(rx * this.strikeDir.z - rz * this.strikeDir.x);
          if (along > -1.2 && along < LENGTH * 0.55 && across < A.width / 2 + 0.3) {
            this.hitDone = true;
            const out = this.onStrike?.({ type: 'charge', damage: A.damage, blockMul: A.blockMul }, this);
            if (out === 'parried') { this.stagger(); break; }
          }
        }
        // into a tree, a column or a wall: stuck there, dazed
        const at = this._v.copy(pos);
        this.arena.collide(at, RAD);
        if (at.distanceTo(pos) > 0.05) {
          pos.copy(at);
          this._enter('STUCK');
          this._play('hitR', { fade: 0.08, once: true, speed: 0.6 });
          this.onImpact?.('stuck', pos);
          break;
        }
        if (pos.distanceTo(this.chargeFrom) >= this.chargeLen) {
          this._enter('SKID');
          this._play('low', { fade: 0.2 });
        }
        break;
      }
      case 'STRIKE': {
        const at = this.attackName === 'thorns' ? 0.2 : 0.32; // the head comes down
        if (!this.hitDone && this.t >= at) {
          this.hitDone = true;
          this.onImpact?.(this.attackName, pos);
          const inside = this.attackName === 'thorns'
            ? dist > A.radius * A.inner && dist < A.radius
            : dist < A.radius;
          if (inside) {
            const out = this.onStrike?.({ type: this.attackName, damage: A.damage, blockMul: A.blockMul }, this);
            if (out === 'parried' && this.attackName === 'stomp') { this.stagger(); break; }
          }
        }
        if (this.t >= 0.7) {
          this._enter('RECOVER');
          this.openRecover = this.attackName === 'stomp';
          this.recoverFor = this.attackName === 'stomp' ? 1.1 : 0.6;
          this._play('idle', { fade: 0.35 });
        }
        break;
      }
      case 'SKID':
        if (this.t >= 0.9) this._back(0.3);
        break;
      case 'STUCK':
        if (this.t >= 1.8) this._back(0.2);
        break;
      case 'STAGGER':
        if (this.t >= this.staggerFor) this._back(0.3);
        break;
      case 'RECOVER':
        if (this.t >= this.recoverFor) this._back(0.35);
        break;
    }
    if (this.state !== 'RISE') pos.y = this.arena.fighterY(pos.x, pos.z);
    this.root.rotation.y = this.heading;
    this.zones.update(dt, this.threat, pos);
  }

  _back(rest) {
    this._enter('STALK');
    this.restFor = rest;
    this.openRecover = false;
  }

  /** Smoke off its back and flanks, embers rising, more of both when it's enraged or burning away. */
  _updateParticles(dt) {
    if (this.root.visible && this.state !== 'OFF') {
      this._emitT += dt * (this.enraged ? 34 : 22) * (this.state === 'DOWN' ? 3 : 1);
      const p = this.root.position;
      while (this._emitT > 1) {
        this._emitT -= 1;
        const a = Math.random() * Math.PI * 2;
        const along = (Math.random() - 0.5) * LENGTH * 0.7;
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        const x = p.x + fx * along + Math.cos(a) * 0.5, z = p.z + fz * along + Math.sin(a) * 0.5;
        const y = p.y + this.height * (0.35 + Math.random() * 0.3);
        this.smoke.emit(this._p.set(x, y, z), this._v.set((Math.random() - 0.5) * 0.6 - fx * 0.8, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6 - fz * 0.8), 1.4 + Math.random() * 0.8);
        if (Math.random() < 0.6) this.embers.emit(this._p.set(x, y, z), this._v.set((Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2), 0.9 + Math.random() * 0.6);
      }
    }
    this.smoke.update(dt, 0.2);
    this.embers.update(dt, 0.5);
  }

  dispose() {
    this.zones.dispose();
    this.smoke.dispose();
    this.embers.dispose();
    this.thorns.geometry.dispose();
    this.thornMat.dispose();
    this.eyeMat.dispose();
    this.dot.dispose();
    for (const m of this.mats) m.dispose();
    this.model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
  }
}
