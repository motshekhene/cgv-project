import * as THREE from 'three';

/**
 * Level 3's three torn pages (ids l3-1..l3-3): the company's own papers,
 * the last of the six (Level 1's trail has the first three).
 * Each one is a floating envelope in a soft beam of light; Kai picks it up by
 * walking through it. Letters live in state.letters, which survives restarts,
 * so a letter that's already been read never spawns again.
 *
 *   letters.spawn('l3-2', at, { from: handlerChest });   // falls from `from` to `at`
 *   letters.update(dt, time, kai.root.position);         // bob, spin, pick up
 */
export const L3_LETTERS = {
  'l3-1': "Company memo: Issue our man the Marshal's coat and helmet. The guide must never see his face.",
  // this one falls from his coat as the mask comes off
  'l3-2': 'Contract, page 2: Payment to B. Zwane on delivery of the horn. The guide is not to be paid.',
  'l3-3': 'If the horn is back on its stone before the saws start, the forest wakes, and no crew will ever come back.',
};

const PICKUP_RADIUS = 1.3;

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,.9)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

export class LetterDrops {
  constructor(parent, state, onCollect) {
    this.parent = parent;
    this.state = state;
    this.onCollect = onCollect;
    this.active = [];

    this.envGeo = new THREE.BoxGeometry(0.42, 0.28, 0.025);
    this.sealGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12);
    this.beamGeo = new THREE.CylinderGeometry(0.2, 0.26, 2.6, 16, 1, true);
    this.beamGeo.translate(0, 1.3, 0);
    this.paperMat = new THREE.MeshStandardMaterial({ color: 0xf1e7d0, emissive: 0x8a7650, emissiveIntensity: 0.6, roughness: 0.9 });
    this.sealMat = new THREE.MeshStandardMaterial({ color: 0x9a1d16, roughness: 0.5 });
    this.beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture(), color: 0xffc46a, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
  }

  has(id) {
    return this.state.letters.includes(id);
  }

  spawn(id, at, { from = null } = {}) {
    if (this.has(id) || this.active.some((l) => l.id === id)) return;
    const group = new THREE.Group();
    const env = new THREE.Mesh(this.envGeo, this.paperMat);
    const seal = new THREE.Mesh(this.sealGeo, this.sealMat);
    seal.rotation.x = Math.PI / 2;
    seal.position.z = 0.016;
    env.add(seal);
    env.castShadow = true;
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    group.add(env, beam);
    group.position.set(at.x, 0, at.z);
    this.parent.add(group);
    this.active.push({
      id, group, env, beam,
      fall: from ? { y0: from.y, x0: from.x, z0: from.z, t: 0 } : null,
      phase: Math.random() * 6,
    });
  }

  update(dt, time, kaiPos) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const l = this.active[i];
      let y = 1.0 + Math.sin(time * 2.2 + l.phase) * 0.08;
      if (l.fall) {
        // tumble out of the Handler's coat and arc down to its resting spot
        const f = l.fall;
        f.t = Math.min(1, f.t + dt / 0.9);
        const k = f.t;
        l.env.position.x = (f.x0 - l.group.position.x) * (1 - k);
        l.env.position.z = (f.z0 - l.group.position.z) * (1 - k);
        y = f.y0 + (y - f.y0) * k + Math.sin(k * Math.PI) * 0.9;
        l.beam.visible = k >= 1;
        if (k >= 1) {
          l.fall = null;
          l.env.position.x = l.env.position.z = 0;
        }
      }
      l.env.position.y = y;
      l.env.rotation.y = time * 1.6 + l.phase;
      l.env.rotation.z = Math.sin(time * 1.3 + l.phase) * 0.15;
      l.beam.material.opacity = 0.26 + Math.sin(time * 3 + l.phase) * 0.06;

      if (!l.fall && kaiPos) {
        const d = Math.hypot(kaiPos.x - l.group.position.x, kaiPos.z - l.group.position.z);
        if (d < PICKUP_RADIUS && this.state.collectLetter(l.id)) {
          this.parent.remove(l.group);
          this.active.splice(i, 1);
          if (this.onCollect) this.onCollect(l.id, L3_LETTERS[l.id]);
        }
      }
    }
  }

  /** Shared geometry/materials outlive any one envelope, so they're freed here. */
  dispose() {
    for (const l of this.active) this.parent.remove(l.group);
    this.active.length = 0;
    this.envGeo.dispose();
    this.sealGeo.dispose();
    this.beamGeo.dispose();
    this.paperMat.dispose();
    this.sealMat.dispose();
    this.beamMat.map.dispose();
    this.beamMat.dispose();
  }
}
