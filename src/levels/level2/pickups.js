import * as THREE from 'three';

/**
 * Pickups — Member 2A
 *
 * Rewards along the River Road, placed once along the finite course (they
 * don't respawn: the road is a journey now, not a loop).
 *
 *   REPAIR   green cross        +25 health
 *   HEART    gold shrine gem    +10 MAX health and heals 10 — rare
 *   NITRO    orange flame       engine cools instantly + 4 s of boost that
 *                               builds no heat
 *   SHIELD   cyan sphere        6 s: the Handler, drones, spikes and traffic
 *                               can't hurt you
 *
 * Each pickup is a floating, spinning emissive icon on a glowing ring with a
 * light beam above it so you can read it through the fog from far away.
 * Drive through one to collect it.
 *
 *   const pickups = new Pickups(root, { start: 150, end: 3900 });
 *   pickups.update(dt, car)  -> returns [{ kind, label, color }] collected this frame
 */
export const PICKUP_KINDS = {
  REPAIR: { label: 'REPAIR  +25', color: 0x5fe06b },
  HEART: { label: 'SHRINE HEART  +10 MAX', color: 0xe3bb62 },
  NITRO: { label: 'NITRO  ·  FREE BOOST', color: 0xff8a2a },
  SHIELD: { label: 'SHIELD  ·  6 s', color: 0x6fe3ff },
};

const LANES = [-9, -3, 3, 9];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iconFor(kind, mat) {
  const g = new THREE.Group();
  if (kind === 'REPAIR') {
    const a = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.34), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.34), mat);
    g.add(a, b);
  } else if (kind === 'HEART') {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), mat));
  } else if (kind === 'NITRO') {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.1, 6), mat);
    flame.position.y = 0.1;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 10), mat);
    tank.position.y = -0.45;
    g.add(flame, tank);
  } else {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), mat));
  }
  return g;
}

export class Pickups {
  constructor(parent, { start = 150, end = 3900, spacing = [250, 360], seed = 7, avoid = [] } = {}) {
    this.parent = parent;
    this.items = [];
    this.time = 0;
    const r = rng(seed);

    // a fixed, readable rhythm: a repair every third one (it was every other
    // one, and you could drive through anything), nitro and shields between,
    // a shrine heart every couple of kilometres
    const order = ['REPAIR', 'NITRO', 'SHIELD', 'REPAIR', 'NITRO', 'HEART'];
    const ringGeo = new THREE.TorusGeometry(1.25, 0.08, 8, 32);
    const beamGeo = new THREE.CylinderGeometry(0.35, 0.9, 14, 12, 1, true);
    beamGeo.translate(0, 7, 0);

    let z = start, k = 0;
    while (z < end) {
      // never on top of a roadblock (obstacles.js): it's the whole road's problem
      const block = avoid.find((b) => Math.abs(b.z - z) < 60);
      if (block) z = block.z + 60;
      const kind = order[k % order.length];
      const color = PICKUP_KINDS[kind].color;
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2 });
      const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

      const holder = new THREE.Group();
      const icon = iconFor(kind, mat);
      icon.position.y = 1.6;
      const ring = new THREE.Mesh(ringGeo, glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      const beam = new THREE.Mesh(beamGeo, beamMat);
      holder.add(icon, ring, beam);
      const x = LANES[Math.floor(r() * LANES.length)];
      holder.position.set(x, 0, z);
      parent.add(holder);
      this.items.push({ kind, holder, icon, ring, beam, x, z, taken: false, t: 0 });

      z += spacing[0] + r() * (spacing[1] - spacing[0]);
      k++;
    }
  }

  /** Collected pickups this frame: [{ kind, label, color }] */
  update(dt, car) {
    this.time += dt;
    const got = [];
    const p = car.mesh.position;
    for (const it of this.items) {
      if (it.taken) {
        // collected: shrink and fade upward, then hide
        it.t += dt;
        const k = Math.min(1, it.t / 0.5);
        it.holder.scale.setScalar(1 + k * 0.8);
        it.icon.position.y = 1.6 + k * 2;
        it.holder.traverse((o) => { if (o.material) o.material.opacity = (1 - k) * (o.material.userData.o ?? (o.material.userData.o = o.material.opacity ?? 1)); });
        if (k >= 1) it.holder.visible = false;
        continue;
      }
      if (Math.abs(it.z - p.z) > 220) { it.holder.visible = Math.abs(it.z - p.z) < 400; continue; }
      it.holder.visible = true;
      it.icon.rotation.y += dt * 2.2;
      it.icon.position.y = 1.6 + Math.sin(this.time * 2.4 + it.z) * 0.18;
      it.ring.scale.setScalar(1 + Math.sin(this.time * 3 + it.z) * 0.06);
      if (Math.abs(it.z - p.z) < 2.6 && Math.abs(it.x - p.x) < 2.4) {
        it.taken = true;
        it.holder.traverse((o) => { if (o.material) o.material.transparent = true; });
        got.push({ kind: it.kind, ...PICKUP_KINDS[it.kind] });
      }
    }
    return got;
  }
}
