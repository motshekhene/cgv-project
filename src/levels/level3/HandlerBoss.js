import * as THREE from 'three';
import { Fighter } from './Fighter.js';

/**
 * HandlerBoss — the three-phase boss (Member 3A).
 *
 * Phases are health-gated. The Handler closes distance with readable jabs and
 * crosses, shifts to hooks/sweeps after the helmet comes off, and ends with
 * short combinations and heavy strikes while the mine floor gives way.
 * Windups are communicated through stance and sound, never a glowing body.
 *
 * He never touches the player: when a strike connects he calls onStrike() and
 * Level03 answers 'hit' | 'blocked' | 'parried' | 'dodged'.
 */
const PHASES = [
  { name: 'PURSUIT', speed: 3.55, attacks: ['jab', 'cross', 'rush'], pace: 1.0, rest: [1.1, 1.45] },
  { name: 'STAND', speed: 4.1, attacks: ['hook', 'sweep', 'combination', 'rush'], pace: 0.96, rest: [0.72, 1.0] },
  { name: 'DESPERATION', speed: 5.0, attacks: ['combination', 'hammer', 'hook', 'sweep'], pace: 0.9, rest: [0.52, 0.78] },
];

const ATTACKS = {
  jab: {
    telegraph: 0.82, recover: 1.0, engage: 3.7, clips: ['body-jab-cross'], clipSpeed: 1.14, lean: -0.16,
    hits: [{ dur: 0.22, move: 6.4, reach: 1.75, damage: 8 }],
  },
  cross: {
    telegraph: 0.92, recover: 1.05, engage: 4.5, clips: ['hook-punch'], clipSpeed: 1.02, lean: -0.2,
    hits: [{ dur: 0.24, move: 5.8, reach: 1.9, damage: 11 }],
  },
  rush: {
    telegraph: 1.0, recover: 1.15, engage: 6.2, clips: ['body-jab-cross'], clipSpeed: 1.1, lean: -0.27,
    hits: [{ dur: 0.31, move: 10.4, reach: 2.0, damage: 13 }],
  },
  hook: {
    telegraph: 0.82, recover: 1.0, engage: 3.5, clips: ['hook-punch'], clipSpeed: 0.96, lean: -0.22,
    hits: [{ dur: 0.34, move: 0.7, radius: 2.5, damage: 15 }],
  },
  sweep: {
    telegraph: 0.92, recover: 1.1, engage: 3.15, clips: ['standing-melee-punch'], clipSpeed: 1.04, lean: -0.2, blockMul: 0.58,
    hits: [{ dur: 0.38, move: 0, radius: 2.95, damage: 17 }],
  },
  combination: {
    telegraph: 0.84, recover: 1.1, engage: 3.7, clips: ['body-jab-cross', 'hook-punch'], clipSpeed: 1.08, lean: -0.16,
    hits: [
      { dur: 0.21, move: 5.2, reach: 1.85, damage: 10 },
      { gap: 0.2, dur: 0.3, move: 1.2, radius: 2.35, damage: 12 },
    ],
  },
  hammer: {
    telegraph: 1.04, recover: 1.2, engage: 3.55, clips: ['combo-punch'], clipSpeed: 0.95, lean: -0.3, blockMul: 0.7,
    hits: [{ dur: 0.42, move: 1.4, radius: 2.4, damage: 20 }],
  },
};

const STAGGER_TIME = 1.7;
const TRANSITION_TIME = 1.5;

export class HandlerBoss {
  constructor(parent, target, source, { extraClips = [], aliases = {}, modelHeightUnits = null } = {}) {
    this.target = target;
    this.levelRoot = parent;
    this.fighter = new Fighter(parent, { source, capsuleColor: 0xff5533, extraClips, aliases, modelHeightUnits });
    this.root = this.fighter.root;
    this.root.position.set(0, 0, -3.6);
    this.root.rotation.y = 0;

    this.maxHealth = 320;
    this.health = this.maxHealth;
    this.phaseIndex = 0;
    this.helmetOff = false;

    this.state = 'APPROACH';
    this.t = 0;
    this.attackName = null;
    this.hitIndex = 0;
    this.hitT = 0;
    this.hitResolved = false;
    // Give the player a moment to read the arena and the first encounter card.
    this.restFor = 2.05;
    this.strikeDir = new THREE.Vector3(0, 0, 1);
    this.heading = 0;
    this.staggered = false;
    this.staggerDuration = STAGGER_TIME;
    this.flying = null; // the helmet, once it comes off

    this.onStrike = null;
    this.onHelmetOff = null;
    this.onPhaseChange = null;
    this.onDefeated = null;

    this._pickAttack();
    this._attachHelmet();
    this._to = new THREE.Vector3();
  }

  get phase() {
    return PHASES[this.phaseIndex];
  }

  get vulnerable() {
    return this.state === 'STAGGER';
  }

  _attachHelmet() {
    // The downloaded Vanguard rig has a separate skinned visor. Detach that
    // actual model part on phase two; keep a fallback for other rigs.
    const visor = this.fighter.findMesh(/visor|helmet/i);
    if (visor) {
      this.helmet = visor;
      return;
    }
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x15191d, metalness: 0.48, roughness: 0.42 }),
    );
    helmet.scale.set(1, 0.8, 1.05);
    helmet.castShadow = true;
    this.helmet = helmet;
    const head = this.fighter.findBone(/head$/i);
    if (head) {
      helmet.position.set(0, 0.14, 0.02);
      head.add(helmet);
    } else {
      helmet.position.y = 1.62;
      this.fighter.pivot.add(helmet);
    }
  }

  _popHelmet() {
    if (!this.helmet) return;
    let flyingMesh = this.helmet;
    if (flyingMesh.isSkinnedMesh) {
      // Bake the current posed visor into a static mesh before throwing it;
      // this prevents it from remaining bound to the Handler's moving skeleton.
      flyingMesh.updateMatrixWorld(true);
      const geometry = flyingMesh.geometry.clone();
      const positions = geometry.attributes.position;
      const vertex = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        flyingMesh.applyBoneTransform(i, vertex);
        flyingMesh.localToWorld(vertex);
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      const source = Array.isArray(flyingMesh.material) ? flyingMesh.material : [flyingMesh.material];
      const materials = source.map((material) => {
        const copy = material.clone();
        for (const key of Object.keys(copy)) {
          if (copy[key]?.isTexture) copy[key] = copy[key].clone();
        }
        return copy;
      });
      flyingMesh.visible = false;
      flyingMesh = new THREE.Mesh(
        geometry,
        Array.isArray(flyingMesh.material) ? materials : materials[0],
      );
      flyingMesh.castShadow = true;
      flyingMesh.receiveShadow = true;
      this.levelRoot.add(flyingMesh);
    } else {
      this.levelRoot.attach(flyingMesh);
    }

    this.flying = {
      mesh: flyingMesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 3, 5.5, (Math.random() - 0.5) * 3),
      spin: new THREE.Vector3(6, 4, 8),
      life: 2.2,
    };
    this.helmet = null;
  }

  _pickAttack() {
    const list = this.phase.attacks;
    let pick = list[Math.floor(Math.random() * list.length)];
    if (pick === this.attackName && list.length > 1 && Math.random() < 0.6) {
      pick = list[(list.indexOf(pick) + 1) % list.length];
    }
    this.attackName = pick;
  }

  _enter(state) {
    this.state = state;
    this.t = 0;
  }

  takeDamage(amount) {
    if (this.health <= 0 || this.state === 'TRANSITION') return 0;
    const dealt = amount * (this.vulnerable ? 1.6 : 1);
    this.health = Math.max(0, this.health - dealt);
    this.fighter.flinch();

    if (this.health <= 0) {
      this.state = 'DOWN';
      this.fighter.setLean(0);
      this.fighter.setGuard(false);
      this.fighter.playOnce('death', { fade: 0.1 });
      if (this.onDefeated) this.onDefeated();
      return dealt;
    }

    const frac = this.health / this.maxHealth;
    const wanted = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    if (wanted > this.phaseIndex) {
      this.phaseIndex = wanted;
      this._enter('TRANSITION');
      this.attackName = null;
      this._pickAttack();
      if (wanted === 1 && !this.helmetOff) {
        this.helmetOff = true;
        this._popHelmet();
        if (this.onHelmetOff) this.onHelmetOff();
      }
      if (this.onPhaseChange) this.onPhaseChange(wanted + 1);
    }
    return dealt;
  }

  /** Called by Level03 when a strike was parried. */
  stagger(duration = STAGGER_TIME) {
    this._enter('STAGGER');
    this.hitIndex = 0;
    this.staggerDuration = duration;
    this.fighter.setGuard(false);
    this.fighter.setLean(0.16);
    this.fighter.flinch();
  }

  update(dt) {
    const f = this.fighter;
    this._updateHelmet(dt);
    if (this.state === 'DOWN') {
      f.update(dt);
      return { dist: 0, state: 'DOWN', phase: this.phase.name };
    }

    if (this.target.dead) {
      f.play('idle');
      f.setLean(0);
      f.setGuard(false);
      f.update(dt);
      return { dist: 0, state: 'IDLE', phase: this.phase.name };
    }

    const p = this.phase;
    const tp = this.target.root.position;
    this._to.set(tp.x - this.root.position.x, 0, tp.z - this.root.position.z);
    const dist = this._to.length();
    const dir = dist > 0.001 ? this._to.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);
    this.t += dt;

    const atk = ATTACKS[this.attackName];
    const face = (rate) => {
      const want = Math.atan2(dir.x, dir.z);
      let d = (want - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * (1 - Math.exp(-rate * dt));
    };

    switch (this.state) {
      case 'APPROACH': {
        face(9);
        f.setLean(0);
        f.setGuard(false);
        if (this.restFor > 0) {
          this.restFor -= dt;
          f.play('idle');
        } else if (dist > atk.engage) {
          this.root.position.addScaledVector(dir, p.speed * dt);
          f.play('run', { speed: 0.9 + p.speed * 0.05 });
        } else {
          this._enter('TELEGRAPH');
        }
        break;
      }
      case 'TELEGRAPH': {
        const dur = atk.telegraph * p.pace;
        if (this.t < dur * 0.75) face(6);
        f.play('fight-idle', { speed: 0.92 });
        f.setLean(atk.lean ?? -0.16);
        f.setGuard(this.attackName === 'hook' || this.attackName === 'sweep' || this.attackName === 'hammer');
        if (this.t >= dur) {
          this.strikeDir.copy(dir);
          this.hitIndex = 0;
          this._beginHit(atk);
        }
        break;
      }
      case 'STRIKE': {
        const hit = atk.hits[this.hitIndex];
        this.hitT += dt;
        f.setLean(0.2);
        if (this.hitT >= (hit.gap || 0)) {
          if (!this.hitStarted) {
            this.hitStarted = true;
            const clip = atk.clips?.[this.hitIndex] || atk.clips?.[0] || 'punch';
            f.playOnce(f.hasClip(clip) ? clip : 'punch', { speed: atk.clipSpeed });
          }
          const k = this.hitT - (hit.gap || 0);
          if (hit.move) this.root.position.addScaledVector(this.strikeDir, hit.move * dt);
          this._resolve(hit, atk, dist, k);
          if (k >= hit.dur) {
            if (this.hitIndex + 1 < atk.hits.length) {
              this.hitIndex++;
              this._beginHit(atk);
            } else {
              this._enter('RECOVER');
            }
          }
        }
        break;
      }
      case 'RECOVER': {
        f.play('idle');
        f.setLean(0);
        f.setGuard(false);
        if (this.t >= atk.recover * p.pace) {
          this._pickAttack();
          this.restFor = p.rest[0] + Math.random() * (p.rest[1] - p.rest[0]);
          this._enter('APPROACH');
        }
        break;
      }
      case 'STAGGER': {
        if (this.t >= this.staggerDuration) {
          f.setLean(0);
          this.restFor = 0.3;
          this._enter('APPROACH');
        }
        break;
      }
      case 'TRANSITION': {
        f.play('idle');
        f.setLean(-0.12);
        f.setGuard(true);
        if (this.t >= TRANSITION_TIME) {
          f.setLean(0);
          f.setGuard(false);
          this.restFor = 0.4;
          this._enter('APPROACH');
        }
        break;
      }
    }

    this.root.rotation.y = this.heading;
    f.update(dt);
    return { dist, state: this.state, phase: p.name };
  }

  _beginHit(atk) {
    this._enter('STRIKE');
    this.hitT = 0;
    this.hitResolved = false;
    this.hitStarted = false;
  }

  _resolve(hit, atk, dist, k) {
    if (this.hitResolved) return;
    const target = this.target.root.position;
    const currentDistance = Math.hypot(target.x - this.root.position.x, target.z - this.root.position.z);
    const inRange = hit.radius ? k > 0.1 && currentDistance <= hit.radius : currentDistance <= hit.reach;
    if (!inRange) return;
    this.hitResolved = true;
    if (!this.onStrike) return;
    const outcome = this.onStrike({
      type: this.attackName,
      damage: hit.damage,
      blockMul: atk.blockMul ?? 0.25,
    });
    if (outcome === 'parried') this.stagger();
  }

  _updateHelmet(dt) {
    const h = this.flying;
    if (!h) return;
    h.life -= dt;
    h.vel.y -= 16 * dt;
    h.mesh.position.addScaledVector(h.vel, dt);
    h.mesh.rotation.x += h.spin.x * dt;
    h.mesh.rotation.y += h.spin.y * dt;
    h.mesh.rotation.z += h.spin.z * dt;
    if (h.mesh.position.y < 0.2 && h.vel.y < 0) {
      h.mesh.position.y = 0.2;
      h.vel.y *= -0.35;
      h.vel.x *= 0.6;
      h.vel.z *= 0.6;
      h.spin.multiplyScalar(0.5);
    }
    if (h.life <= 0) {
      h.mesh.visible = false;
      this.flying = null;
    }
  }
}
