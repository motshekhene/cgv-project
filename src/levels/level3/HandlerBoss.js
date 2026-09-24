import * as THREE from 'three';
import { Fighter } from './Fighter.js';

/**
 * HandlerBoss — the three-phase boss (Member 3A).
 *
 * Phases are health-gated and each fights differently:
 *   PURSUIT      lunge only
 *   STAND        lunge + sweep (helmet comes off on entry)
 *   DESPERATION  sweep + 2-hit combo + lunge, faster
 * Every attack telegraphs with its own colour: orange = lunge (dodge or block),
 * red = sweep (dodge — block only half-works), purple = combo (two hits).
 * A well-timed parry staggers him and opens a damage window.
 *
 * He never touches the player: when a strike connects he calls onStrike() and
 * Level03 answers 'hit' | 'blocked' | 'parried' | 'dodged'.
 */
const PHASES = [
  { name: 'PURSUIT', speed: 4.2, attacks: ['lunge'], pace: 1.0, rest: [0.5, 0.9] },
  { name: 'STAND', speed: 5.0, attacks: ['lunge', 'sweep'], pace: 0.82, rest: [0.35, 0.7] },
  { name: 'DESPERATION', speed: 6.0, attacks: ['sweep', 'combo', 'lunge'], pace: 0.64, rest: [0.2, 0.45] },
];

const ATTACKS = {
  lunge: {
    tell: 0xff7a1a, telegraph: 0.85, recover: 0.95, engage: 5.2, clip: 'punch', clipSpeed: 2.6,
    hits: [{ dur: 0.3, move: 14, reach: 1.9, damage: 14 }],
  },
  sweep: {
    tell: 0xff1133, telegraph: 1.0, recover: 1.05, engage: 2.6, clip: 'swordslash', clipSpeed: 2.8, blockMul: 0.65,
    hits: [{ dur: 0.36, move: 0, radius: 3.4, damage: 18 }],
  },
  combo: {
    tell: 0xb04dff, telegraph: 0.7, recover: 0.9, engage: 3.4, clip: 'punch', clipSpeed: 3.2,
    hits: [
      { dur: 0.26, move: 9, reach: 2.0, damage: 11 },
      { gap: 0.22, dur: 0.26, move: 9, reach: 2.0, damage: 11 },
    ],
  },
};

const STAGGER_TIME = 1.7;
const TRANSITION_TIME = 1.5;

export class HandlerBoss {
  constructor(parent, target, source) {
    this.target = target;
    this.levelRoot = parent;
    this.fighter = new Fighter(parent, { source, capsuleColor: 0xff5533 });
    for (const m of this.fighter.materials) if (m.emissive) m.userData.baseEmissive.set(0x2a0808);
    this.root = this.fighter.root;
    this.root.position.set(0, 0, -6.5);
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
    this.restFor = 0;
    this.strikeDir = new THREE.Vector3(0, 0, 1);
    this.heading = 0;
    this.staggered = false;
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
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.75, roughness: 0.28 }),
    );
    helmet.scale.set(1, 1.15, 1.05);
    helmet.castShadow = true;
    this.helmet = helmet;
    let head = null;
    this.fighter.pivot.traverse((o) => {
      if (o.isBone && o.name === 'Head') head = o;
    });
    if (head) {
      helmet.position.set(0, 0.28, 0.03);
      head.add(helmet);
    } else {
      helmet.scale.setScalar(0.22);
      helmet.position.y = 0.95;
      this.fighter.pivot.add(helmet);
    }
  }

  _popHelmet() {
    if (!this.helmet) return;
    this.levelRoot.attach(this.helmet);
    this.flying = {
      mesh: this.helmet,
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
      this.fighter.setGlow(0, 0);
      this.fighter.setLean(0);
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
  stagger() {
    this._enter('STAGGER');
    this.hitIndex = 0;
    this.fighter.setGlow(0xffd23a, 1.4);
    this.fighter.setLean(0.35);
    this.fighter.play('idle');
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
      f.setGlow(0, 0);
      f.setLean(0);
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
        f.setGlow(0, 0);
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
        f.play('idle', { speed: 1.5 });
        f.setLean(-0.3);
        const pulse = 1.1 + Math.sin(this.t * 18) * 0.5;
        f.setGlow(atk.tell, pulse);
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
            f.playOnce(atk.clip, { speed: atk.clipSpeed });
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
        f.setLean(0.1);
        f.setGlow(0, 0);
        if (this.t >= atk.recover * p.pace) {
          this._pickAttack();
          this.restFor = p.rest[0] + Math.random() * (p.rest[1] - p.rest[0]);
          this._enter('APPROACH');
        }
        break;
      }
      case 'STAGGER': {
        f.play('idle', { speed: 0.5 });
        if (this.t >= STAGGER_TIME) {
          f.setGlow(0, 0);
          this.restFor = 0.3;
          this._enter('APPROACH');
        }
        break;
      }
      case 'TRANSITION': {
        f.play('idle');
        f.setLean(-0.2);
        f.setGlow(0xff9a55, 0.8 + Math.sin(this.t * 14) * 0.3);
        if (this.t >= TRANSITION_TIME) {
          f.setGlow(0, 0);
          this.restFor = 0.4;
          this._enter('APPROACH');
        }
        break;
      }
    }

    const r = Math.hypot(this.root.position.x, this.root.position.z);
    if (r > 13.4) {
      const k = 13.4 / r;
      this.root.position.x *= k;
      this.root.position.z *= k;
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
    const inRange = hit.radius ? k > 0.1 && dist <= hit.radius : dist <= hit.reach;
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
