import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
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
 *   - a real animal: a red-brown coat with a pale belly, rump and eye rings,
 *     a darker face, hair (fine streaks of noise along its length, and a
 *     velvet sheen), a wet black nose, hard hooves, antlers pale at the tines,
 *     and eyes of black glass with a coal burning in each. Smoothed normals:
 *     no facets on it
 *   - cracks of light running through the coat: a ridged 3D noise on the
 *     body's own (bind-pose) coordinates, so they stay put on it as it moves,
 *     pulsing. Red while it's armoured; cyan when it's open to hits
 *   - it breathes: vapour from its nose, harder after a charge; its head
 *     follows Kai; a faint rim round its outline; wisps of smoke and embers
 *   - stone: it comes off the plinth grey stone and turns to flesh as it lands,
 *     and when it's beaten it goes down and turns back to cold stone where it
 *     falls: the cracks and the eyes go out, the smoke stops
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
 * hits do 2.2x. The veins say which. Open, Kai can leap onto its back
 * (Level03): it bucks to throw him (ride / seat / endRide).
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
const UP = new THREE.Vector3(0, 1, 0);

const ATTACKS = {
  charge: { tell: 0xb3122a, telegraph: [1.15, 0.92], damage: 22, blockMul: 0.5, speed: [15, 17], width: 2.2 },
  stomp: { tell: 0x8a2be2, telegraph: [1.0, 0.82], damage: 16, blockMul: 0.4, radius: 4.2 },
  thorns: { tell: 0xd23a10, telegraph: [1.25, 1.05], damage: 12, blockMul: 0.5, radius: 7.6, inner: 0.48 },
};

const NOISE = /* glsl */ `
  // 3D value noise (pseudo-random per lattice cell, smoothly blended): patterns fixed to the body, not the screen
  float sHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float sNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sHash(i), sHash(i + vec3(1, 0, 0)), f.x), mix(sHash(i + vec3(0, 1, 0)), sHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(sHash(i + vec3(0, 0, 1)), sHash(i + vec3(1, 0, 1)), f.x), mix(sHash(i + vec3(0, 1, 1)), sHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float sRidged(vec3 p) {
    float n = sNoise(p) * 0.65 + sNoise(p * 2.13 + 7.1) * 0.35;
    return 1.0 - abs(n * 2.0 - 1.0); // folded noise: sharp ridges where it crosses the middle = cracks
  }
`;

// each part of the model by its mesh (Quaternius' stag, one mesh per colour), and what it's made of
const PARTS = {
  Stag_2: { color: 0x5b3e25, sheen: 0xc8a070, rough: 0.9, kind: 'fur' }, // the coat: a deep red-brown
  Stag_1: { color: 0xc2a27a, sheen: 0xf2e0c0, rough: 0.92, kind: 'fur' }, // belly, rump, throat, the rings round its eyes
  Stag_3: { color: 0x3b2a1a, sheen: 0xa07a52, rough: 0.9, kind: 'fur' }, // its face, darker
  Stag_4: { color: 0x16120f, rough: 0.3, coat: 0.8, kind: 'hard' }, // the nose (wet) and the hooves
  Stag_5: { color: 0x020202, rough: 0.04, coat: 1, kind: 'eye' }, // the eyes: black glass, a coal burning in each
  Stag_Horns: { color: 0x4a3a28, rough: 0.62, kind: 'antler' }, // bone, pale at the tines
};

/**
 * One part of it (PARTS): a physical material with the coat, the cracks of
 * light, the rim, the eyes' coals, and the stone it turns to.
 */
function stagMaterial(part, u) {
  const p = PARTS[part] || PARTS.Stag_2;
  const m = new THREE.MeshPhysicalMaterial({
    color: p.color, roughness: p.rough, metalness: 0,
    sheen: p.sheen ? 1 : 0, sheenColor: p.sheen ?? 0, sheenRoughness: 0.5,
    clearcoat: p.coat || 0, clearcoatRoughness: 0.06,
  });
  const kind = p.kind.toUpperCase();
  m.defines = { ...m.defines, [kind]: '' }; // FUR / HARD / EYE / ANTLER: one shader, compiled per part
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj;
        #ifdef ANTLER
          attribute float aTip;
          varying float vTip;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObj = position; // bind-pose position: the patterns stay stuck to the body as it animates
        #ifdef ANTLER
          vTip = aTip;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${NOISE}
        uniform float uTime, uVein, uOpen, uScale, uLife, uStone, uEyeR; // uOpen: open to hits (game state); uLife 1 -> 0 as it dies; uStone 0..1
        uniform vec3 uCorrupt, uClean, uEyeA, uEyeB, uLong; // red armoured / cyan open; the eyes' centres; which way is its length
        varying vec3 vObj;
        #ifdef ANTLER
          varying float vTip;
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 q0 = vObj * uScale;
        #ifdef FUR
          // hair: fine streaks running along its length, and a little clumping
          vec3 qs = q0 * (vec3(1.0) - uLong * 0.86);
          float strand = sNoise(qs * 34.0) * 0.6 + sNoise(qs * 83.0 + 3.7) * 0.4;
          float clump = sNoise(q0 * 5.0);
          diffuseColor.rgb *= 0.72 + 0.42 * strand + 0.16 * (clump - 0.5);
        #endif
        #ifdef ANTLER
          // bone, darker and rougher at the base, pale and smooth at the tines
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.8, 0.68), smoothstep(0.35, 1.0, vTip));
          diffuseColor.rgb *= 0.82 + 0.3 * sNoise(q0 * 40.0);
        #endif
        // stone: what it was on the plinth, and what it goes back to
        vec3 stoneCol = vec3(0.43, 0.42, 0.4) * (0.78 + 0.34 * sNoise(q0 * 11.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, stoneCol, uStone);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef ANTLER
          roughnessFactor = mix(0.85, 0.45, smoothstep(0.3, 1.0, vTip));
        #endif
        roughnessFactor = mix(roughnessFactor, 0.95, uStone);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          material.sheenColor *= 1.0 - uStone;
        #endif
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1.0 - uStone;
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 q = vObj * uScale;
        vec3 veinCol = mix(uCorrupt, uClean, uOpen); // the light tells the player when to strike
        #ifdef EYE
          // a coal in each eye, round its pupil
          float dE = min(distance(vObj, uEyeA), distance(vObj, uEyeB)) / uEyeR;
          totalEmissiveRadiance += veinCol * ((1.0 - smoothstep(0.1, 0.8, dE)) * 2.4 + 0.06) * uLife;
        #else
          // cracks of light running through it, pulsing: thin lines (a warped ridged noise) with a soft glow either side
          vec3 qw = q * 1.75 + (vec3(sNoise(q * 1.3), sNoise(q * 1.3 + 4.1), sNoise(q * 1.3 + 8.3)) - 0.5) * 1.2;
          float ridge = sRidged(qw + vec3(0.0, uTime * 0.04, 0.0));
          float vein = smoothstep(0.955, 0.99, ridge) + 0.22 * smoothstep(0.88, 0.955, ridge);
          float pulse = 0.65 + 0.35 * sin(uTime * 4.0 + q.y * 3.0 + q.z * 2.0); // a heartbeat travelling through it
          totalEmissiveRadiance += veinCol * vein * uVein * pulse * uLife; // emissive: glows on top of the lighting
          float rim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0); // fresnel rim
          totalEmissiveRadiance += mix(vec3(0.14, 0.01, 0.02), vec3(0.03, 0.34, 0.4), uOpen) * rim * 0.5 * uLife * (1.0 - uStone);
        #endif`);
  };
  m.customProgramCacheKey = () => 'shadow-stag-' + p.kind;
  return m;
}

/** A skinned part's geometry with its facets smoothed away (shared corners welded, normals recomputed). */
function smoothed(geo) {
  const g = geo.clone();
  g.deleteAttribute('normal');
  const out = mergeVertices(g, 1e-6);
  out.computeVertexNormals();
  return out;
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
      uTime: { value: 0 }, uVein: { value: 3.2 }, uOpen: { value: 0 }, uScale: { value: 1 }, uLife: { value: 1 },
      uStone: { value: 0 }, uEyeR: { value: 1 }, uEyeA: { value: new THREE.Vector3() }, uEyeB: { value: new THREE.Vector3() },
      uLong: { value: new THREE.Vector3(0, 1, 0) },
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
    this.height = box.max.y - box.min.y;
    this.mats = [];
    this.geos = [];
    const parts = {};
    model.traverse((o) => {
      if (!o.isMesh) return;
      parts[o.name] = o;
      if (o.isSkinnedMesh && o.name !== 'Stag_5') {
        o.geometry = smoothed(o.geometry); // no facets: a coat, not a carving
        this.geos.push(o.geometry);
      }
      o.material = stagMaterial(o.name, this.u);
      this.mats.push(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds don't follow the gallop
    });
    this.root.add(inner);
    this.inner = inner;
    this.model = model;
    inner.updateMatrixWorld(true);
    // its own (bind-pose) units: the noise scaled so it's ~4 across nose to tail, and which way is its length
    const body = parts.Stag_2;
    if (body) {
      body.geometry.computeBoundingBox();
      const sz = body.geometry.boundingBox.getSize(new THREE.Vector3());
      this.u.uScale.value = 4 / Math.max(sz.x, sz.y, sz.z);
      const long = sz.x > sz.y && sz.x > sz.z ? 'x' : sz.y > sz.z ? 'y' : 'z';
      this.u.uLong.value.set(long === 'x' ? 1 : 0, long === 'y' ? 1 : 0, long === 'z' ? 1 : 0);
    }
    // the antlers: how far out along them each point is (pale tines), from where they leave the head
    const horns = parts.Stag_Horns;
    if (horns) {
      const g = (horns.geometry = horns.geometry.clone());
      this.geos.push(g);
      const pos = g.attributes.position;
      const w = new THREE.Vector3();
      let lo = Infinity, hi = -Infinity;
      const ys = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        ys[i] = w.fromBufferAttribute(pos, i).applyMatrix4(horns.matrixWorld).y;
        lo = Math.min(lo, ys[i]);
        hi = Math.max(hi, ys[i]);
      }
      const tip = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) tip[i] = (ys[i] - lo) / Math.max(hi - lo, 1e-6);
      g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    }

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

    let head = null;
    model.traverse((o) => { if (o.isBone && /^head$/i.test(o.name)) head = o; });
    this.head = head;
    this.neck = model.getObjectByName('Neck2');
    this._look = 0;
    // where things are on its head, at rest, in the world: a skinned part's points
    const restPoints = (mesh, keep = () => true) => {
      const out = [];
      if (!mesh) return out;
      const v = new THREE.Vector3();
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, v);
        const w = v.clone().applyMatrix4(mesh.matrixWorld);
        if (keep(w)) out.push({ w, raw: new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i) });
      }
      return out;
    };
    const avg = (pts, key) => pts.reduce((a, p) => a.add(p[key]), new THREE.Vector3()).divideScalar(Math.max(1, pts.length));
    // the eyes: one each side; the coal sits on the outside of each (its pupil)
    this.dot = dotTexture();
    const eyeMat = new THREE.SpriteMaterial({ map: this.dot, color: 0xff4a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.eyeMat = eyeMat;
    this.eyes = [];
    const eyePts = restPoints(parts.Stag_5);
    if (eyePts.length && head) {
      const mid = avg(eyePts, 'w');
      const midRaw = avg(eyePts, 'raw');
      const sides = [eyePts.filter((p) => p.w.x < mid.x), eyePts.filter((p) => p.w.x >= mid.x)];
      sides.forEach((pts, i) => {
        const c = avg(pts, 'w');
        const cRaw = avg(pts, 'raw');
        const rRaw = Math.max(...pts.map((p) => p.raw.distanceTo(cRaw)));
        const rW = Math.max(...pts.map((p) => p.w.distanceTo(c)));
        // outward: away from the other eye, and a little forward
        const outRaw = cRaw.clone().sub(midRaw).normalize();
        this.u[i ? 'uEyeB' : 'uEyeA'].value.copy(cRaw).addScaledVector(outRaw, rRaw * 0.85);
        this.u.uEyeR.value = rRaw;
        const outW = c.clone().sub(mid).normalize();
        const eye = new THREE.Sprite(eyeMat);
        eye.position.copy(head.worldToLocal(c.clone().addScaledVector(outW, rW * 1.6)));
        eye.scale.setScalar(Math.max(0.1, rW * 2.2) / (head.getWorldScale(new THREE.Vector3()).x || 1));
        head.add(eye);
        this.eyes.push(eye);
      });
    }
    // the nose: the front of the dark part up at head height (the rest of it is hooves), for its breath
    const nosePts = restPoints(parts.Stag_4, (w) => w.y > this.height * 0.55);
    this.nose = new THREE.Object3D();
    if (nosePts.length && head) {
      const front = Math.max(...nosePts.map((p) => p.w.z));
      const tip = avg(nosePts.filter((p) => p.w.z > front - 0.04), 'w');
      this.nose.position.copy(head.worldToLocal(tip));
      head.add(this.nose);
    }
    // where a rider sits (Level03: Kai can get up on its back): the dip of its back behind the
    // withers, riding the spine bone there, and how broad it is at each depth below that
    this.rider = this._measureBack([parts.Stag_2, parts.Stag_1].filter(Boolean), model.getObjectByName('Torso2'));
    this._breathT = 1;
    this._breathOut = 0;
    this._hard = 0; // how hard it's breathing (a charge, a stomp, a ride)
    this.breath = new Puffs(parent, 60, { color: 0xdfe4ea, size: 0.38, blending: THREE.NormalBlending, opacity: 0.32 });

    this.smoke = new Puffs(parent, 70, { color: 0x0b0a0d, size: 1.0, blending: THREE.NormalBlending, opacity: 0.3 });
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
    this._fwd = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._q3 = new THREE.Quaternion();
    this._before = new THREE.Vector3();
    this._emitT = 0;
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
    return this.state === 'STUCK' || this.state === 'SKID' || this.state === 'STAGGER' || this.state === 'RIDDEN'
      || (this.state === 'RECOVER' && this.openRecover);
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

  /** Its head follows Kai while it sizes him up (a turn of the neck on top of whatever it's playing). */
  _lookAtKai(dt) {
    const watching = this.state === 'STALK' || this.state === 'READY' || this.state === 'RECOVER' || (this.state === 'TELL' && this.attackName !== 'charge');
    let want = 0;
    if (watching && this.root.visible) {
      const p = this.root.position, k = this.kai.root.position;
      let d = (Math.atan2(k.x - p.x, k.z - p.z) - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      want = THREE.MathUtils.clamp(d, -0.7, 0.7);
    }
    this._look += (want - this._look) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this._look) < 1e-3) return;
    for (const [bone, share] of [[this.neck, 0.45], [this.head, 0.55]]) {
      if (!bone?.parent) continue;
      // a turn about the world's up, in the bone's own frame
      const pq = bone.parent.getWorldQuaternion(this._q);
      this._q2.setFromAxisAngle(UP, this._look * share);
      this._q3.copy(pq).invert().multiply(this._q2).multiply(pq);
      bone.quaternion.premultiply(this._q3);
    }
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
    this.u.uStone.value = 1; // still the statue as it leaves the plinth
    this._enter('RISE');
    this._play('jump', { fade: 0, once: true, speed: 0.9 });
  }

  /** The fight starts: it comes for him (down off the plinth at once, if its leap was skipped). */
  begin() {
    this.u.uStone.value = 0;
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

  /** Kai is on its back: it bucks to throw him for up to `seconds` (Level03 ends it). */
  ride(seconds) {
    this._enter('RIDDEN');
    this.rideFor = seconds;
    this.zones.hide();
    this._play('hitL', { fade: 0.1, once: true, speed: 1.6 });
  }

  /** Off its back (thrown, or he jumped clear): it reels a moment, then comes for him again. */
  endRide() {
    this.buckX = this.buckZ = this.buckY = 0;
    this.stagger(0.8);
  }

  /** Where a rider sits, in the world (out): on top of its back, moving with its spine as it bucks. */
  seat(out) {
    this.root.updateMatrixWorld(true);
    if (this.rider) return this.rider.bone.localToWorld(out.copy(this.rider.local));
    return out.set(0, this.height * 0.57, -0.4).applyMatrix4(this.root.matrixWorld);
  }

  /** Its half-width `depth` m below the top of its back, where a rider sits. */
  girth(depth) {
    const r = this.rider;
    if (!r) return 0.5;
    const f = THREE.MathUtils.clamp(depth / r.step, 0, r.half.length - 1);
    const i = Math.floor(f), j = Math.min(i + 1, r.half.length - 1);
    return r.half[i] + (r.half[j] - r.half[i]) * (f - i);
  }

  /**
   * Its back, from the rest pose: slices across the body every 0.1 m along
   * it, the lowest top among them (the dip behind the withers a rider sits
   * in), and there its half-width at each depth below the top. Measured where
   * the slice's edges cross each height, not from the points: a low-poly
   * body has too few of them to measure a width by.
   */
  _measureBack(meshes, bone) {
    if (!meshes.length || !bone) return null;
    this.root.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const v = new THREE.Vector3();
    const tris = [];
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, idx = m.geometry.index;
      const P = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(toLocal);
        P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      }
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t < n; t += 3) tris.push([P, idx ? idx.getX(t) : t, idx ? idx.getX(t + 1) : t + 1, idx ? idx.getX(t + 2) : t + 2]);
    }
    // a slice across it at z: its outline, as segments [x0, y0, x1, y1]
    const slice = (z) => {
      const segs = [];
      for (const [P, a, b, c] of tris) {
        const pts = [];
        for (const [i, j] of [[a, b], [b, c], [c, a]]) {
          const zi = P[i * 3 + 2] - z, zj = P[j * 3 + 2] - z;
          if ((zi < 0) === (zj < 0)) continue;
          const t = zi / (zi - zj);
          pts.push(P[i * 3] + (P[j * 3] - P[i * 3]) * t, P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * t);
        }
        if (pts.length === 4) segs.push(pts);
      }
      return segs;
    };
    // the top of a slice, along its middle
    const topOf = (segs) => {
      let top = -Infinity;
      for (const [x0, y0, x1, y1] of segs) {
        if ((x0 < 0) !== (x1 < 0)) top = Math.max(top, y0 + (y1 - y0) * (-x0 / (x1 - x0)));
      }
      return top;
    };
    let best = null;
    for (let z = -1.0; z <= 0.05; z += 0.1) {
      const segs = slice(z);
      const top = topOf(segs);
      if (top > -Infinity && (!best || top < best.top)) best = { z, top, segs };
    }
    if (!best) return null;
    const step = 0.05;
    const half = new Float32Array(30);
    for (let i = 0; i < half.length; i++) {
      const y = best.top - i * step;
      let w = 0;
      for (const [x0, y0, x1, y1] of best.segs) {
        if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
        w = Math.max(w, Math.abs(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)));
      }
      half[i] = Math.max(w, i ? half[i - 1] : 0); // the barrel of it only widens, this near the top
    }
    const seat = new THREE.Vector3(0, best.top, best.z).applyMatrix4(this.root.matrixWorld);
    return { bone, local: bone.worldToLocal(seat), half, step, top: best.top, z: best.z };
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
    this._lookAtKai(dt);
    this._updateThorns(dt);
    this._updateParticles(dt);
    if (this.state === 'OFF') return;
    if (this.state === 'DOWN') {
      // it goes down and stays down, and the light goes out of it: cold stone where it fell
      this.t += dt;
      const k = THREE.MathUtils.smoothstep(this.t, 0.6, 3.2);
      this.u.uLife.value = 1 - k;
      this.u.uStone.value = k; // back to the stone it was
      this.eyeMat.opacity = 1 - k;
      this.root.rotation.set(0, this.heading, 0, 'YXZ');
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
        // off the plinth, down into the courtyard, stone turning to flesh as it goes
        const k = THREE.MathUtils.smoothstep(this.t, 0.15, 1.1);
        this.u.uStone.value = 1 - THREE.MathUtils.smoothstep(this.t, 0.05, 1.0);
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
          this.recoverFor = this.attackName === 'stomp' ? 1.5 : 0.6;
          this._play('idle', { fade: 0.35 });
        }
        break;
      }
      case 'SKID':
        if (this.t >= 1.3) this._back(0.3);
        break;
      case 'STUCK':
        if (this.t >= 2.4) this._back(0.2);
        break;
      case 'RIDDEN':
        // it bucks: rears, kicks out, twists, trying to get him off
        this.buckX = Math.sin(this.t * 9) * 0.2;
        this.buckZ = Math.sin(this.t * 6.3 + 1) * 0.13;
        this.buckY = Math.abs(Math.sin(this.t * 9)) * 0.22;
        if (!this.current?.isRunning()) this._play(Math.random() < 0.5 ? 'hitL' : 'hitR', { fade: 0.1, once: true, speed: 1.4 + Math.random() * 0.4 });
        if (this.t >= this.rideFor + 0.6) this.endRide(); // never stuck bucking
        break;
      case 'STAGGER':
        if (this.t >= this.staggerFor) this._back(0.3);
        break;
      case 'RECOVER':
        if (this.t >= this.recoverFor) this._back(0.35);
        break;
    }
    if (this.state !== 'RISE') pos.y = this.arena.fighterY(pos.x, pos.z) + (this.state === 'RIDDEN' ? this.buckY || 0 : 0);
    this.root.rotation.set(this.state === 'RIDDEN' ? this.buckX || 0 : 0, this.heading, this.state === 'RIDDEN' ? this.buckZ || 0 : 0, 'YXZ');
    this.zones.update(dt, this.threat, pos);
  }

  _back(rest) {
    this._enter('STALK');
    this.restFor = rest;
    this.openRecover = false;
  }

  /** Smoke off its back and flanks, embers rising, more of both when it's enraged or burning away. */
  _updateParticles(dt) {
    const smoking = this.root.visible && this.state !== 'OFF' && !(this.state === 'DOWN' && this.t > 1.6);
    if (smoking) {
      this._emitT += dt * (this.enraged ? 20 : 11) * (this.state === 'DOWN' ? 2 : 1);
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
    // its breath: a plume from the nose every few seconds, quicker and bigger when it's been running
    const breathing = this.root.visible && this.state !== 'OFF' && this.state !== 'DOWN' && this.state !== 'RISE' && this.u.uStone.value < 0.5;
    this._hard = Math.max(0, this._hard - dt * 0.12);
    if (this.state === 'CHARGE' || this.state === 'RIDDEN' || this.state === 'STRIKE') this._hard = 1;
    if (breathing && (this._breathT -= dt) <= 0) {
      this._breathT = THREE.MathUtils.lerp(2.6, 0.9, this._hard) + Math.random() * 0.4;
      this._breathOut = 0.42;
    }
    if (this._breathOut > 0 && this.nose.parent) {
      this._breathOut -= dt;
      this._breathAcc = (this._breathAcc || 0) + dt * (22 + this._hard * 18);
      const n = this.nose.getWorldPosition(this._p);
      const f = this._fwd.set(0, 0, 1).applyQuaternion(this.head.getWorldQuaternion(this._q)).normalize();
      // the nose points down the head's length: blow out along it, and a bit down
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const sp = 0.9 + this._hard * 0.8;
      while (this._breathAcc > 1) {
        this._breathAcc -= 1;
        this.breath.emit(n, this._v.set(fx * sp + (Math.random() - 0.5) * 0.3 + f.x * 0.1, -0.2 + Math.random() * 0.25, fz * sp + (Math.random() - 0.5) * 0.3 + f.z * 0.1), 0.8 + Math.random() * 0.5);
      }
    }
    this.breath.update(dt, 0.25);
  }

  dispose() {
    this.zones.dispose();
    this.smoke.dispose();
    this.embers.dispose();
    this.breath.dispose();
    for (const g of this.geos) g.dispose();
    this.thorns.geometry.dispose();
    this.thornMat.dispose();
    this.eyeMat.dispose();
    this.dot.dispose();
    for (const m of this.mats) m.dispose();
    this.model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
  }
}
