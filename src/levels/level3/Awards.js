import * as THREE from 'three';
import { RU, place } from '../jungle/props.js';
import { GIFT_SPOTS } from './ShrineArena.js';

/**
 * The forest shrines: three one-time gifts out in the jungle ring around the
 * courtyard, so the fight has somewhere to go. Each is a stone pedestal with a
 * floating orb and a tall beam of its colour (visible over the canopy). Kai
 * takes a gift by walking into its shrine — with the Handler on his heels.
 *
 * Gifts are stored in state.awards, so like the letters they're given once:
 * they survive a restart, and a taken shrine stays dark.
 *
 *   awards.update(dt, time, kaiPos);   // bob, pulse, pick up -> onCollect(id, gift)
 */
export const GIFTS = {
  vitality: { icon: '♥', name: 'VITALITY', color: 0xff6b5a, css: '#ff6b5a', desc: 'Your life bar grows: +40 max health, fully healed.' },
  strategy: { icon: '◈', name: 'STRATEGY', color: 0x8fd0ff, css: '#8fd0ff', desc: 'Read your opponent: his next move is called out, and parries come easier.' },
  power: { icon: '✸', name: 'POWER', color: 0xffb347, css: '#ffb347', desc: 'Punches and kicks hit 40% harder and knock him further back.' },
};

const PICKUP_RADIUS = 1.5;

function gradientTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.75, 'rgba(255,255,255,.5)');
  grad.addColorStop(1, 'rgba(255,255,255,.95)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

export class ShrineGifts {
  constructor(arena, state, onCollect) {
    this.arena = arena;
    this.state = state;
    this.onCollect = onCollect;
    this.shrines = [];

    this.orbGeo = new THREE.IcosahedronGeometry(0.26, 1);
    this.beamGeo = new THREE.CylinderGeometry(0.34, 0.5, 9, 16, 1, true);
    this.beamGeo.translate(0, 4.5, 0);
    this.ringGeo = new THREE.RingGeometry(0.9, 1.15, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.beamTex = gradientTexture();
    this.mats = [];

    for (const [id, gift] of Object.entries(GIFTS)) this._build(id, gift, GIFT_SPOTS[id]);
  }

  _build(id, gift, at) {
    const root = this.arena.root;
    const y = this.arena.groundHeight(at.x, at.z);
    const group = new THREE.Group();
    group.position.set(at.x, y, at.z);
    root.add(group);
    const pedestal = this.arena.templates?.pedestal;
    if (pedestal) place(group, pedestal, 0, -0.05, 0, { s: RU * 0.42 });
    this.arena.obstacles.push({ x: at.x, z: at.z, r: 0.45 });

    const taken = this.state.awards.includes(id);
    const shrine = { id, gift, group, taken, fade: taken ? 0 : 1 };
    if (!taken) {
      const orbMat = new THREE.MeshStandardMaterial({ color: gift.color, emissive: gift.color, emissiveIntensity: 2.2, roughness: 0.3, flatShading: true });
      const glowMat = new THREE.SpriteMaterial({ map: this.arena.dot, color: gift.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
      const beamMat = new THREE.MeshBasicMaterial({ map: this.beamTex, color: gift.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const ringMat = new THREE.MeshBasicMaterial({ color: gift.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      this.mats.push(orbMat, glowMat, beamMat, ringMat);
      shrine.orb = new THREE.Mesh(this.orbGeo, orbMat);
      shrine.glow = new THREE.Sprite(glowMat);
      shrine.glow.scale.setScalar(1.6);
      shrine.beam = new THREE.Mesh(this.beamGeo, beamMat);
      shrine.ring = new THREE.Mesh(this.ringGeo, ringMat);
      shrine.ring.position.y = 0.06;
      group.add(shrine.orb, shrine.glow, shrine.beam, shrine.ring);
    }
    this.shrines.push(shrine);
  }

  /** How many gifts are still out there. */
  get remaining() {
    return this.shrines.filter((s) => !s.taken).length;
  }

  update(dt, time, kaiPos) {
    for (const s of this.shrines) {
      if (!s.orb) continue;
      if (s.taken) {
        // the light goes out of the shrine once its gift is taken
        s.fade = Math.max(0, s.fade - dt / 0.8);
        s.orb.scale.setScalar(s.fade);
        s.glow.material.opacity = 0.9 * s.fade;
        s.beam.material.opacity = 0.35 * s.fade;
        s.ring.material.opacity = 0.5 * s.fade;
        if (s.fade <= 0) {
          s.group.remove(s.orb, s.glow, s.beam, s.ring);
          s.orb = null;
        }
        continue;
      }
      const bob = Math.sin(time * 2 + s.group.position.x) * 0.12;
      s.orb.position.y = s.glow.position.y = 1.85 + bob;
      s.orb.rotation.set(time * 0.7, time * 1.3, 0);
      s.glow.scale.setScalar(1.5 + Math.sin(time * 3.1) * 0.15);
      s.beam.material.opacity = 0.3 + Math.sin(time * 1.7 + s.group.position.z) * 0.06;
      const k = (time * 0.6) % 1;
      s.ring.scale.setScalar(0.7 + k * 0.7);
      s.ring.material.opacity = 0.55 * (1 - k);

      if (kaiPos && Math.hypot(kaiPos.x - s.group.position.x, kaiPos.z - s.group.position.z) < PICKUP_RADIUS && this.state.collectAward(s.id)) {
        s.taken = true;
        const p = s.group.position;
        this.arena.burst(p.x, p.z, { color: s.gift.color, count: 40, speed: 3.2, size: 0.32, y: p.y + 1.4, lift: 2.5, additive: true });
        if (this.onCollect) this.onCollect(s.id, s.gift);
      }
    }
  }

  dispose() {
    this.orbGeo.dispose();
    this.beamGeo.dispose();
    this.ringGeo.dispose();
    this.beamTex.dispose();
    for (const m of this.mats) m.dispose();
  }
}
