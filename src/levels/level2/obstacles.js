import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Obstacles — Member 2A (Level 2 improvements)
 *
 * A gravel road through the jungle shouldn't be a motorway, so most of the
 * traffic is gone and the jungle itself gets in the way instead:
 *
 *   TREE      a fallen tree across one side of the road, roots and all     solid, a big hit
 *   ROCKS     a small rockfall covering a lane or two                      solid
 *   BRANCHES  a pile of broken branches over one lane                     drive through: it slows you and scratches the paint
 *   BOAR      a warthog that trots across the road as you come up          knocked aside, a medium hit
 *   KUDU      an antelope that bolts across in a few bounds                knocked aside, a medium hit
 *   ROADBLOCK the company's barricade, every lane closed but one            solid, a big hit
 *
 * They come closer together the further down the road you get, and the
 * roadblocks (course.js ROADBLOCKS) stand where the company has the road.
 *
 * Laid out once along the finite course, like the pickups (it's a journey,
 * not a loop): a seeded rhythm, never closer than ~70 m, never blocking the
 * whole road, kept clear of the pickups, the start and the falls. Each one is
 * only shown (and animated) when it's within sight.
 *
 * Collisions are axis-aligned boxes against the car's rotated extents, the
 * same push-out-along-the-shallow-axis idea as traffic.js. `pool` lists the
 * solid ones in the shape HandlerAI already reads for traffic ({ x, z, halfW,
 * halfL, speed }), so the Handler steers round fallen trees and animals too.
 *
 *   const obstacles = new Obstacles(root, { start: 220, end: COURSE_END - 420, avoid: pickups.items });
 *   const animals = await loadAnimalModels(assets);   // real warthog / kudu models, if they're there
 *   obstacles.build(kit, barkTexture, animals);  // once the jungle kit has loaded
 *   for (const hit of obstacles.update(dt, car)) ...   // [{ kind, label, damage, impact, at }]
 *   obstacles.collideBody(handler);
 */

const LANES = [-9, -3, 3, 9];          // same lanes as traffic.js and pickups.js
const RAIL = 12;                       // the road is 24 wide
const SHOW = 320;                      // further than the fog lets you see

export const OBSTACLE_LABELS = {
  ROADBLOCK: 'ROADBLOCK',
  TREE: 'FALLEN TREE',
  ROCKS: 'ROCKFALL',
  BRANCHES: 'BRANCHES',
  BOAR: 'WARTHOG',
  KUDU: 'KUDU',
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ======================== the animals ======================== */

/**
 * Low-poly animals in the same matte, primitive style as Level 1's monkeys
 * and birds. Built facing +x (the way they walk across the road); legs are
 * pivots at the hip so the gait is a rotation.
 */
function makeLeg(mat, len, thick, x, z, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick * 0.7, len, 6), mat);
  leg.position.y = -len / 2;
  leg.castShadow = true;
  pivot.add(leg);
  return pivot;
}

function makeBoar() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x5b4a3c, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 1 });
  const tusk = new THREE.MeshStandardMaterial({ color: 0xeee4cc, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), hide);
  body.scale.set(1.45, 0.82, 0.78);
  body.position.y = 0.72;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), hide);
  head.scale.set(1.35, 0.95, 0.85);
  head.position.set(0.78, 0.6, 0);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.28, 8), dark);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(1.12, 0.52, 0);
  // the mane down its back
  const mane = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.08), dark);
  mane.position.set(0.1, 1.12, 0);
  mane.rotation.z = -0.12;
  g.add(body, head, snout, mane);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), tusk);
    t.position.set(1.08, 0.6, s * 0.14);
    t.rotation.z = -0.5;
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), dark);
    ear.position.set(0.66, 0.86, s * 0.15);
    g.add(t, ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), dark);
  tail.position.set(-0.78, 0.92, 0);
  tail.rotation.z = -0.3;
  g.add(tail);
  const legs = [];
  for (const [x, z] of [[0.45, 0.2], [0.45, -0.2], [-0.45, 0.2], [-0.45, -0.2]]) {
    const leg = makeLeg(dark, 0.5, 0.07, x, z, 0.5);
    legs.push(leg);
    g.add(leg);
  }
  g.userData = { legs, tail, stride: 9, swing: 0.6 };
  return g;
}

function makeKudu() {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0x9c7a55, roughness: 1 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 1 });
  const horn = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), coat);
  body.scale.set(1.6, 0.8, 0.62);
  body.position.y = 1.25;
  body.castShadow = true;
  g.add(body);
  // the kudu's thin white stripes
  for (let i = 0; i < 4; i++) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.012, 4, 16, Math.PI), pale);
    stripe.position.set(-0.35 + i * 0.22, 1.25, 0);
    stripe.scale.set(1, 1.03, 0.8);
    g.add(stripe);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.75, 7), coat);
  neck.position.set(0.82, 1.62, 0);
  neck.rotation.z = -0.65;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.48, 7), coat);
  head.position.set(1.12, 1.96, 0);
  head.rotation.z = -Math.PI / 2 - 0.5;
  g.add(neck, head);
  for (const s of [-1, 1]) {
    // spiral horns, a twisted cone each side
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 5, 12, Math.PI * 1.6), horn);
    h.position.set(1.0, 2.25, s * 0.12);
    h.rotation.set(s * 0.4, 0, 0.4);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), coat);
    ear.scale.set(0.5, 1, 0.3);
    ear.position.set(1.0, 2.08, s * 0.17);
    g.add(h, ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.35, 4), pale);
  tail.position.set(-0.85, 1.25, 0);
  tail.rotation.z = -0.4;
  g.add(tail);
  const legs = [];
  for (const [x, z] of [[0.55, 0.16], [0.55, -0.16], [-0.55, 0.16], [-0.55, -0.16]]) {
    const leg = makeLeg(coat, 0.95, 0.05, x, z, 1.0);
    legs.push(leg);
    g.add(leg);
  }
  g.userData = { legs, tail, stride: 7, swing: 0.75 };
  return g;
}

/* ---------------- real animal models ---------------- */

/**
 * The real animals, from public/assets/level2/animals/ (see CREDITS.md).
 * Any file that doesn't load just leaves that animal as the primitive one
 * above, so the level never breaks over a missing model.
 *
 *   length  world length (m) the animal ends up, nose to tail
 *   yaw     turn so the model faces +x (glTF models usually face +z: PI / 2)
 */
export const ANIMAL_MODELS = {
  BOAR: [{ path: 'level2/animals/boar.glb', length: 1.5, yaw: Math.PI / 2 }],
  KUDU: [
    { path: 'level2/animals/stag.glb', length: 2.2, yaw: Math.PI / 2 },
    { path: 'level2/animals/deer.glb', length: 1.9, yaw: Math.PI / 2 },
  ],
};

/** { BOAR: [{ gltf, ...spec }], KUDU: [...] } with only the files that loaded. */
export async function loadAnimalModels(assets) {
  const out = {};
  await Promise.all(Object.entries(ANIMAL_MODELS).map(async ([kind, specs]) => {
    const loaded = await Promise.all(specs.map((spec) => assets.model(spec.path)
      .then((gltf) => ({ ...spec, gltf }))
      .catch(() => { console.warn(`[obstacles] no ${spec.path}, using the built-in ${kind.toLowerCase()}`); return null; })));
    out[kind] = loaded.filter(Boolean);
  }));
  return out;
}

// clip names, with or without an "Armature|" prefix (Quaternius: Gallop, Walk, Idle, Eating, ...)
const RUN = /^(.*\|)?(gallop|run)$/i;
const WALK = /^(.*\|)?(walk|trot)$/i;
const IDLE = /^(.*\|)?(idle|eating)$/i;

/**
 * One animal from a loaded model, in the same shape as makeBoar()/makeKudu():
 * facing +x, feet on y = 0, centred. If the model is rigged its own run cycle
 * plays (userData.mixer); a static one just gets the bob and a rocking trot.
 */
function makeAnimalFromModel({ gltf, length, yaw }, stride) {
  const model = cloneSkinned(gltf.scene);
  const inner = new THREE.Group();
  inner.add(model);
  inner.rotation.y = yaw;
  inner.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  inner.scale.setScalar(length / (Math.max(size.x, size.z) || 1));
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;      // skinned bounds don't follow the run cycle
  });

  const g = new THREE.Group();
  g.add(inner);
  const ud = { stride, swing: 0.75, rock: inner };
  const clips = gltf.animations || [];
  if (clips.length) {
    const mixer = new THREE.AnimationMixer(model);
    const pick = (re) => clips.find((a) => re.test(a.name));
    const run = pick(RUN) || pick(WALK) || clips[0];
    const idle = pick(IDLE);
    ud.mixer = mixer;
    ud.run = mixer.clipAction(run);
    ud.idle = idle ? mixer.clipAction(idle) : null;
    (ud.idle || ud.run).play();
    if (!ud.idle) ud.run.timeScale = 0;     // frozen mid-stride until it moves
  }
  g.userData = ud;
  return g;
}

/* ======================== the obstacles ======================== */

export class Obstacles {
  constructor(parent, { start = 220, end = 3700, spacing = [70, 135], seed = 23, avoid = [], roadblocks = [] } = {}) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'level2-obstacles';
    parent.add(this.group);
    this.items = [];
    this.pool = [];          // the solid ones, for the Handler to steer round
    this.time = 0;
    this._r = rng(seed);

    // the layout: a seeded rhythm, weighted toward the things that make the
    // jungle feel alive (fallen trees and animals), never two of a kind in a row
    const weights = [['TREE', 3], ['BRANCHES', 3], ['BOAR', 2], ['KUDU', 2], ['ROCKS', 2]];
    const total = weights.reduce((a, [, w]) => a + w, 0);
    const pickKind = (prev) => {
      for (let tries = 0; tries < 6; tries++) {
        let x = this._r() * total;
        for (const [k, w] of weights) { if ((x -= w) <= 0) { if (k !== prev) return k; break; } }
      }
      return prev === 'TREE' ? 'BOAR' : 'TREE';
    };
    const clearOfPickups = (z) => !avoid.some((p) => Math.abs(p.z - z) < 18);
    // a roadblock is the whole road's problem: nothing else within 80 m of one
    const nearBlock = (z) => roadblocks.find((b) => Math.abs(b.z - z) < 80);
    this._roadblocks = roadblocks;

    this._slots = [];
    let prev = null;
    // closer together the further you get: the spacing comes down to 60% by the end
    const step = (z) => (spacing[0] + this._r() * (spacing[1] - spacing[0])) * (1 - 0.4 * THREE.MathUtils.clamp((z - start) / (end - start), 0, 1));
    for (let z = start; z < end; z += step(z)) {
      if (!clearOfPickups(z)) z += 25;
      const block = nearBlock(z);
      if (block) z = block.z + 80;
      if (z >= end) break;
      const kind = pickKind(prev);
      prev = kind;
      this._slots.push({ kind, z, side: this._r() < 0.5 ? -1 : 1 });
    }

    // the debris that flies when you go through something
    this._debris = this._makeDebris(70);
  }

  /** Builds every obstacle once the jungle kit is in. */
  build(kit, bark, animals = {}) {
    this.kit = kit;
    this._animals = animals;
    this._bark = new THREE.MeshStandardMaterial({ color: 0xa08a70, roughness: 0.95, map: bark || null });
    if (this._bark.map) {
      this._bark.map = bark.clone();
      this._bark.map.wrapS = this._bark.map.wrapT = THREE.RepeatWrapping;
      this._bark.map.repeat.set(2, 6);
      this._bark.map.needsUpdate = true;
    }
    this._wood = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 1 });
    this._raw = new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.9 });
    for (const slot of this._slots) {
      const it = this[`_make${slot.kind[0]}${slot.kind.slice(1).toLowerCase()}`](slot);
      it.kind = slot.kind;
      it.label = OBSTACLE_LABELS[slot.kind];
      it.holder.visible = false;
      this.group.add(it.holder);
      this.items.push(it);
      if (it.solid) this.pool.push(it);
    }
    for (const block of this._roadblocks) {
      for (const it of this._makeRoadblock(block)) {
        it.kind = 'ROADBLOCK';
        it.label = OBSTACLE_LABELS.ROADBLOCK;
        it.holder.visible = false;
        this.group.add(it.holder);
        this.items.push(it);
        this.pool.push(it);
      }
    }
  }

  /**
   * One of the company's roadblocks: every lane but the gap closed with a
   * stack of cut logs behind a striped barrier, an amber lamp flashing on
   * each. Each run of closed lanes is its own solid piece, so the gap between
   * them is a real opening, for the car and for the Handler.
   */
  _makeRoadblock({ z, gap }) {
    const stripes = this._stripes || (this._stripes = (() => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 32;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f2ece0'; ctx.fillRect(0, 0, 128, 32);
      ctx.fillStyle = '#b8261d';
      for (let x = -32; x < 160; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x + 16, 32); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 0); ctx.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      return t;
    })());
    const post = this._post || (this._post = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.8 }));
    const runs = [];
    for (let i = 0; i < LANES.length; i++) {
      if (i === gap) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]);
    }
    return runs.map(([a, b]) => {
      const x0 = Math.max(-RAIL + 0.3, LANES[a] - 3), x1 = Math.min(RAIL - 0.3, LANES[b] + 3);
      const w = x1 - x0, cx = (x0 + x1) / 2;
      const holder = new THREE.Group();
      holder.position.set(cx, 0, z);
      // the logs: a stack three high, so it reads from a long way off in the rain
      for (const [y, dz] of [[0.42, -0.86], [0.42, 0], [0.42, 0.86], [1.16, -0.43], [1.16, 0.43], [1.9, 0]]) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, w - 0.3, 10), this._bark);
        log.rotation.z = Math.PI / 2;
        log.position.set(0, y, dz);
        log.castShadow = true;
        log.receiveShadow = true;
        holder.add(log);
      }
      // the barrier on the side you come from, and its posts
      const tex = stripes.clone();
      tex.repeat.set(w / 2.4, 1);
      tex.needsUpdate = true;
      const board = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.42, 0.12),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      board.position.set(0, 1.0, -1.25);
      board.castShadow = true;
      holder.add(board);
      // Tall posts at its ends with a lamp on each, so the gap is between two
      // flashing lights. The River Road's fog swallows anything past ~70 m,
      // so the lamps and their halos ignore it: you see the lights long
      // before the logs, and steer for the dark between them.
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xffb03a, emissive: 0xff9a1f, emissiveIntensity: 2, toneMapped: false, fog: false });
      const haloMat = this._halo || (this._halo = new THREE.SpriteMaterial({
        map: this._haloTex || (this._haloTex = (() => {
          const c = document.createElement('canvas');
          c.width = c.height = 64;
          const ctx = c.getContext('2d');
          const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
          g.addColorStop(0, 'rgba(255,190,90,1)'); g.addColorStop(0.3, 'rgba(255,150,40,.45)'); g.addColorStop(1, 'rgba(255,120,0,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
          return new THREE.CanvasTexture(c);
        })()),
        color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      const halos = [];
      for (const px of [-(w / 2 - 0.25), w / 2 - 0.25]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), post);
        p.position.set(px, 1.6, -1.25);
        p.castShadow = true;
        holder.add(p);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), lampMat);
        lamp.position.set(px, 3.35, -1.25);
        holder.add(lamp);
        const halo = new THREE.Sprite(haloMat.clone());
        halo.scale.setScalar(3.2);
        halo.position.copy(lamp.position);
        holder.add(halo);
        halos.push(halo);
      }
      return {
        holder, lamp: { material: lampMat }, halos, solid: true, damage: 18, slow: 0.2,
        x: cx, z: z - 0.2, halfW: w / 2, halfL: 1.4, speed: 0,
      };
    });
  }

  /** A clone of a kit prototype, or nothing if that model didn't load. */
  _prop(proto, x, y, z, s, ry = 0, extra = {}) {
    if (!proto) return null;
    const o = proto.clone(true);
    o.position.set(x, y, z);
    o.rotation.set(extra.rx || 0, ry, extra.rz || 0);
    o.scale.setScalar(s);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = !!extra.shadow; m.receiveShadow = true; } });
    return o;
  }

  /* ---------------- builders: one per kind ---------------- */

  /** A big tree down across one side of the road: trunk, root plate, broken crown. */
  _makeTree({ z, side }) {
    const r = this._r;
    const holder = new THREE.Group();
    // covers the outside lane and most of the next: one side is always open
    const reach = 6.5 + r() * 2.5;                    // how far it lies into the road
    const len = reach + 6;                            // the rest is off in the trees
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, len, 12), this._bark);
    trunk.rotation.z = Math.PI / 2;
    trunk.rotation.y = (r() - 0.5) * 0.25;
    trunk.position.set(side * (RAIL - reach + len / 2), 0.62, 0);
    trunk.castShadow = trunk.receiveShadow = true;
    holder.add(trunk);
    // the snapped end, pale wood, pointing into the road
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.06, 12), this._raw);
    stump.rotation.z = Math.PI / 2;
    stump.position.set(side * (RAIL - reach), 0.62, 0);
    holder.add(stump);
    // a couple of broken limbs sticking up off the trunk
    for (let i = 0; i < 3; i++) {
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.8 + r(), 6), this._bark);
      limb.position.set(side * (RAIL - reach + 1.5 + i * 2), 1.2, (r() - 0.5) * 0.6);
      limb.rotation.set((r() - 0.5) * 0.9, 0, side * (0.4 + r() * 0.5));
      limb.castShadow = true;
      holder.add(limb);
    }
    // leaves still on it where it came down, and the verge it tore up
    const leafy = this.kit ? [this.kit.bush1, this.kit.bush2, this.kit.bush3].filter(Boolean) : [];
    for (let i = 0; i < 3 && leafy.length; i++) {
      const b = this._prop(leafy[i % leafy.length], side * (RAIL - reach + 0.8 + i * 1.8), 0.2, (r() - 0.5) * 2.2, 0.016 + r() * 0.008, r() * 6);
      if (b) holder.add(b);
    }
    const rock = this._prop(this.kit?.rock2, side * (RAIL + 1.5), -0.1, 0.8, 0.012, r() * 6);
    if (rock) holder.add(rock);
    holder.position.z = z;
    // collision: the part across the road
    const x0 = side * (RAIL - reach), x1 = side * RAIL;
    return {
      holder, solid: true, damage: 15, slow: 0.25,
      x: (x0 + x1) / 2, z, halfW: Math.abs(x1 - x0) / 2, halfL: 0.85, speed: 0,
    };
  }

  /** A rockfall: two or three boulders over one or two lanes. */
  _makeRocks({ z, side }) {
    const r = this._r;
    const holder = new THREE.Group();
    const lanes = r() < 0.5 ? 1 : 2;
    const first = side < 0 ? 0 : LANES.length - lanes;      // starts from that verge
    const xs = LANES.slice(first, first + lanes);
    const rocks = this.kit ? [this.kit.rock1, this.kit.rock2, this.kit.rock3].filter(Boolean) : [];
    for (const x of xs) {
      for (let i = 0; i < 3; i++) {
        const proto = rocks[Math.floor(r() * rocks.length)];
        const o = this._prop(proto, x + (i - 1) * 1.5 + (r() - 0.5), -0.2, (r() - 0.5) * 2, (i === 1 ? 0.026 : 0.017) + r() * 0.008, r() * 6, { shadow: true });
        if (o) holder.add(o);
      }
    }
    if (!rocks.length) {
      // the kit didn't load: plain stones keep the hazard (and its collision) there
      const mat = new THREE.MeshStandardMaterial({ color: 0x737a6a, roughness: 1 });
      for (const x of xs) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), mat);
        m.position.set(x, 0.8, 0);
        holder.add(m);
      }
    }
    // gravel spilled round them
    const grit = new THREE.Mesh(new THREE.CircleGeometry(1, 10), new THREE.MeshStandardMaterial({ color: 0x5b5446, roughness: 1 }));
    grit.rotation.x = -Math.PI / 2;
    grit.scale.set(lanes * 3.6, 3, 1);
    grit.position.set((xs[0] + xs[xs.length - 1]) / 2, 0.03, 0);
    holder.add(grit);
    holder.position.z = z;
    const x0 = Math.min(...xs) - 2.2, x1 = Math.max(...xs) + 2.2;
    return {
      holder, solid: true, damage: 14, slow: 0.35,
      x: (x0 + x1) / 2, z, halfW: (x1 - x0) / 2, halfL: 1.3, speed: 0,
    };
  }

  /** Broken branches over a lane: not solid, but they grab the car. */
  _makeBranches({ z }) {
    const r = this._r;
    const holder = new THREE.Group();
    const x = LANES[Math.floor(r() * LANES.length)];
    for (let i = 0; i < 11; i++) {
      const len = 2.6 + r() * 2.4;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, len, 6), i % 2 ? this._bark : this._wood);
      b.rotation.set(Math.PI / 2, 0, 0);
      b.rotation.y = r() * Math.PI;
      b.rotation.order = 'YXZ';
      b.position.set(x + (r() - 0.5) * 3.4, 0.15 + r() * 0.25, (r() - 0.5) * 2.8);
      b.castShadow = true;
      holder.add(b);
    }
    const leafy = this.kit ? [this.kit.bush1, this.kit.bush2, this.kit.grass1].filter(Boolean) : [];
    for (let i = 0; i < 4 && leafy.length; i++) {
      const o = this._prop(leafy[i % leafy.length], x + (r() - 0.5) * 3.4, 0, (r() - 0.5) * 2.4, 0.012 + r() * 0.006, r() * 6);
      if (o) holder.add(o);
    }
    holder.position.z = z;
    return {
      holder, solid: false, damage: 4, slow: 0.72,
      x, z, halfW: 2.4, halfL: 1.6, speed: 0, broken: false,
    };
  }

  /** The animals start in the trees on one side and cross when you get close. */
  _animal(mesh, { z, side }, { speed, damage, slow, halfW, halfL, trigger, scale = 1 }) {
    const holder = new THREE.Group();
    mesh.scale.setScalar(scale);
    holder.add(mesh);
    holder.position.set(side * (RAIL + 4), 0, z);
    mesh.rotation.y = side > 0 ? Math.PI : 0;     // built facing +x: turn to face the road
    return {
      holder, mesh, solid: true, damage, slow,
      x: side * (RAIL + 4), z, halfW, halfL, speed: 0,
      dir: -side, walk: speed, trigger, state: 'wait', t: 0, gait: 0,
      vx: 0, vy: 0, spin: 0,
    };
  }

  /** A real model for this kind if one loaded (taking turns between them), else null. */
  _realAnimal(kind, stride) {
    const list = this._animals?.[kind];
    if (!list || !list.length) return null;
    this._turns = this._turns || {};
    const n = this._turns[kind] = (this._turns[kind] || 0) + 1;
    return makeAnimalFromModel(list[n % list.length], stride);
  }

  _makeBoar(slot) {
    const real = this._realAnimal('BOAR', 9);
    return this._animal(real || makeBoar(), slot, { speed: 4.5, damage: 10, slow: 0.6, halfW: 0.95, halfL: 0.55, trigger: 70, scale: real ? 1 : 1.3 });
  }

  _makeKudu(slot) {
    const real = this._realAnimal('KUDU', 7);
    return this._animal(real || makeKudu(), slot, { speed: 9, damage: 12, slow: 0.55, halfW: 1.05, halfL: 0.45, trigger: 85, scale: real ? 1 : 1.15 });
  }

  /* ---------------- debris ---------------- */

  _makeDebris(n) {
    const geo = new THREE.BoxGeometry(0.12, 0.05, 0.32);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const colors = [new THREE.Color(0x6b5236), new THREE.Color(0x4f6b2a), new THREE.Color(0x7a8a3a), new THREE.Color(0x5b5446)];
    const parts = [];
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      mesh.setMatrixAt(i, hidden);
      mesh.setColorAt(i, colors[i % colors.length]);
      parts.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
    }
    this.group.add(mesh);
    return { mesh, parts, next: 0, hidden, m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) };
  }

  /** Splinters and leaves thrown up at `at`, carried forward with the car. */
  _burst(at, count, forward = 0) {
    const d = this._debris;
    for (let i = 0; i < count; i++) {
      const pt = d.parts[d.next];
      d.next = (d.next + 1) % d.parts.length;
      pt.p.copy(at);
      pt.v.set((Math.random() - 0.5) * 7, 2.5 + Math.random() * 4, forward * 0.6 + (Math.random() - 0.3) * 5);
      pt.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      pt.life = 0.9 + Math.random() * 0.6;
    }
  }

  _updateDebris(dt) {
    const d = this._debris;
    let any = false;
    d.parts.forEach((pt, i) => {
      if (pt.life <= 0) return;
      pt.life -= dt;
      if (pt.life <= 0) { d.mesh.setMatrixAt(i, d.hidden); any = true; return; }
      pt.v.y -= 14 * dt;
      pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.03) { pt.p.y = 0.03; pt.v.set(pt.v.x * 0.4, -pt.v.y * 0.25, pt.v.z * 0.4); pt.w.multiplyScalar(0.5); }
      pt.r.x += pt.w.x * dt; pt.r.y += pt.w.y * dt; pt.r.z += pt.w.z * dt;
      d.q.setFromEuler(pt.r);
      d.mesh.setMatrixAt(i, d.m.compose(pt.p, d.q, d.s));
      any = true;
    });
    if (any) d.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- per frame ---------------- */

  /** Hits this frame: [{ kind, label, damage, impact, at }] */
  update(dt, car) {
    this.time += dt;
    const hits = [];
    const p = car.mesh.position;
    for (const it of this.items) {
      if (it.cool > 0) it.cool -= dt;
      const dz = it.z - p.z;
      it.holder.visible = dz > -60 && dz < SHOW;
      if (!it.holder.visible) continue;
      if (it.walk) this._updateAnimal(it, dt, dz);
      if (it.lamp) {
        const on = Math.sin(this.time * 9 + it.x) > 0;
        it.lamp.material.emissiveIntensity = on ? 3.2 : 0.25;
        for (const h of it.halos) h.material.opacity = on ? 0.95 : 0.15;
      }
      const hit = this._collide(it, car);
      if (hit) hits.push(hit);
    }
    this._updateDebris(dt);
    return hits;
  }

  _updateAnimal(a, dt, dz) {
    const ud = a.mesh.userData;
    if (a.state === 'wait') {
      // it hears you coming and breaks cover
      if (dz < a.trigger) { a.state = 'cross'; a.t = 0; }
    } else if (a.state === 'cross') {
      a.t += dt;
      a.x += a.dir * a.walk * dt;
      a.gait += dt * ud.stride;
      if (Math.abs(a.x) > RAIL + 5 && Math.sign(a.x) === a.dir) a.state = 'gone';
    } else if (a.state === 'knocked') {
      // bowled aside: it tumbles, gets up and runs for the trees
      a.t += dt;
      a.vy -= 16 * dt;
      a.x += a.vx * dt;
      a.holder.position.y = Math.max(0, a.holder.position.y + a.vy * dt);
      a.mesh.rotation.x += a.spin * dt;
      if (a.holder.position.y <= 0 && a.t > 0.3) {
        a.mesh.rotation.x = 0;
        a.state = 'flee';
        a.dir = Math.sign(a.vx) || a.dir;
        a.mesh.rotation.y = a.dir > 0 ? 0 : Math.PI;
      }
    } else if (a.state === 'flee') {
      a.x += a.dir * a.walk * 1.5 * dt;
      a.gait += dt * ud.stride * 1.5;
      if (Math.abs(a.x) > RAIL + 6) a.state = 'gone';
    }
    if (a.state === 'gone') { a.holder.visible = false; a.x = 1e6; return; }
    a.holder.position.x = a.x;
    const moving = a.state === 'cross' || a.state === 'flee';
    if (ud.mixer) {
      // a rigged model: its own run cycle, quicker when it's fleeing
      if (moving && !ud.running) {
        ud.running = true;
        ud.run.play();
        if (ud.idle) ud.run.crossFadeFrom(ud.idle, 0.2, false);
      }
      if (moving) ud.run.timeScale = a.state === 'flee' ? 1.4 : 1;
      ud.mixer.update(dt);
      if (a.state !== 'knocked') a.holder.position.y = 0;
      return;
    }
    if (ud.rock) {
      // a static model: it rocks nose-to-tail and bobs as it trots
      ud.rock.rotation.z = moving ? Math.sin(a.gait) * 0.08 : 0;
    } else {
      // the gait: legs swing in diagonal pairs, the tail flicks
      const sw = moving ? Math.sin(a.gait) * ud.swing : 0;
      ud.legs[0].rotation.z = sw; ud.legs[3].rotation.z = sw;
      ud.legs[1].rotation.z = -sw; ud.legs[2].rotation.z = -sw;
      ud.tail.rotation.x = Math.sin(this.time * 9 + a.z) * 0.4;
    }
    if (a.state !== 'knocked') a.holder.position.y = moving ? Math.abs(Math.sin(a.gait)) * 0.08 * ud.swing * 2 : 0;
  }

  _collide(it, car) {
    if (it.state === 'knocked' || it.state === 'gone' || it.broken) return null;
    const b = car.bounds || { halfW: 0.9, halfL: 1.8 };
    const p = car.mesh.position;
    const ch = Math.abs(Math.cos(car.heading)), sh = Math.abs(Math.sin(car.heading));
    const ex = b.halfW * ch + b.halfL * sh, ez = b.halfL * ch + b.halfW * sh;
    const dx = it.x - p.x, dz = it.z - p.z;
    const ox = ex + it.halfW - Math.abs(dx);
    const oz = ez + it.halfL - Math.abs(dz);
    if (ox <= 0 || oz <= 0) return null;

    const speed = Math.abs(car.speed);
    const at = new THREE.Vector3(p.x + THREE.MathUtils.clamp(dx, -ex, ex), 0.6, p.z + THREE.MathUtils.clamp(dz, -ez, ez));

    if (!it.solid) {
      // through the branches: they snap, the car bogs down, a little damage
      it.broken = true;
      this._burst(at, 26, car.speed);
      for (const c of it.holder.children) { c.rotation.z += (Math.random() - 0.5) * 0.8; c.position.y = 0.05; c.scale.multiplyScalar(0.8); }
      car.speed *= it.slow;
      return { kind: it.kind, label: it.label, damage: Math.round(it.damage + speed * 0.05), impact: 0.25, at };
    }

    if (it.walk) {
      // an animal: it's bowled out of the way, the car loses a lot of speed
      const side = Math.sign(dx) || (Math.random() < 0.5 ? -1 : 1);
      it.state = 'knocked'; it.t = 0;
      it.vx = side * (5 + speed * 0.15);
      it.vy = 3 + speed * 0.05;
      it.spin = side * 6;
      this._burst(at, 10, car.speed);
      car.speed *= it.slow;
      return { kind: it.kind, label: it.label, damage: Math.round(it.damage + speed * 0.1), impact: Math.min(1, 0.35 + speed / 60), at };
    }

    // a tree or rocks: solid. Pushed back out along the shallow axis
    if (oz < ox) {
      p.z -= Math.sign(dz) * oz;
      const rel = Math.max(0, car.speed);
      car.speed *= it.slow;
      if (it.cool > 0 || rel < 8) return null;        // nosing into it slowly just stops you
      it.cool = 0.8;
      this._burst(at, 18, 0);
      return { kind: it.kind, label: it.label, damage: Math.round(it.damage * Math.min(1.4, 0.4 + rel / 30)), impact: Math.min(1, 0.4 + rel / 40), at };
    }
    p.x -= Math.sign(dx) * ox;
    car.speed *= 0.9;                                   // scraped along it
    return null;
  }

  /** Keeps the Handler out of solid obstacles: no damage, he just has to brake. */
  collideBody(body) {
    const bx = body.mesh.position;
    for (const it of this.pool) {
      if (!it.holder.visible || it.state === 'gone' || it.state === 'knocked') continue;
      const dx = it.x - bx.x, dz = it.z - bx.z;
      const ox = body.halfW + it.halfW - Math.abs(dx);
      const oz = body.halfL + it.halfL - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      if (oz < ox) { bx.z -= Math.sign(dz) * oz; body.speed *= 0.4; }
      else { bx.x -= Math.sign(dx) * ox; body.latVel = 0; }
    }
  }

  /** Is the stretch of `x` lane between z0 and z1 blocked? Traffic uses it to change lanes. */
  blocks(x, halfW, z0, z1) {
    for (const it of this.pool) {
      if (it.state === 'gone' || it.z < z0 || it.z > z1) continue;
      if (Math.abs(it.x - x) < it.halfW + halfW + 0.6) return true;
    }
    return false;
  }
}
