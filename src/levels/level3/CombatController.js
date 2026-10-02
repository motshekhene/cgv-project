import * as THREE from 'three';
import { Fighter } from './Fighter.js';

/**
 * CombatController — Kai in the arena (Member 3A).
 *
 * Owns movement, lock-on strafing, the punch and kick combo chains, dodge roll, block and the
 * parry timing. Never touches the boss: Level03 is the only file that knows
 * both fighters exist, and it resolves who hits whom. Health and stamina live
 * in the shared GameState (state.health / state.stamina), not here.
 *
 * Controls (shared Input actions): forward/back/left/right move, attack =
 * ATTACK = punch chain, KICK = kick chain; dodge = roll; block (hold) / parry (tap just
 * before impact); ability = the Key slow-mo; lockOn toggles camera + strafing.
 */
// Two separate chains: ATTACK = punch, punch, heavy hook; KICK = right, left, heavy kick.
const MOVES = {
  attack: [
    { type: 'punch', clip: 'punch', speed: 2.3, windup: 0.07, active: 0.1, total: 0.36, damage: 12, stamina: 6, lunge: 3.2 },
    { type: 'punch', clip: 'punch', speed: 2.5, windup: 0.07, active: 0.1, total: 0.34, damage: 12, stamina: 6, lunge: 3.2 },
    { type: 'punch', clip: 'swordslash', speed: 1.5, windup: 0.14, active: 0.12, total: 0.55, damage: 26, stamina: 14, lunge: 4.5, finisher: true },
  ],
  kick: [
    { type: 'kick', side: 'R', windup: 0.09, active: 0.1, total: 0.42, damage: 16, stamina: 9, lunge: 3.6 },
    { type: 'kick', side: 'L', windup: 0.09, active: 0.1, total: 0.42, damage: 16, stamina: 9, lunge: 3.6 },
    { type: 'kick', side: 'R', windup: 0.14, active: 0.12, total: 0.62, damage: 32, stamina: 18, lunge: 5.2, lean: 0.35, finisher: true },
  ],
};
const PARRY_WINDOW = 0.28;
const ARENA_LIMIT = 12.6;

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class CombatController {
  constructor(parent, source) {
    this.fighter = new Fighter(parent, {
      source,
      capsuleColor: 0xdfe8ee,
      // the pack's own Kai colours are near-black; these read clearly on the arena
      palette: { Skin: 0x9a6538, Hair: 0x1c1512, Shirt: 0x2f8fb5, Pants: 0x8a7658, Socks: 0xe6dfd6, Shoes: 0x2a2320 },
    });
    this.root = this.fighter.root;
    this.root.position.set(0, 0, 4);

    this.heading = Math.PI; // faces the boss at the start (boss spawns at -z)
    this.moveSpeed = 5.6;

    this.dead = false;
    this.dodging = false;
    this.dodgeT = 0;
    this.dodgeCD = 0;
    this.dodgeDuration = 0.34;
    this.dodgeSpeed = 11;
    this.dodgeDir = new THREE.Vector3();

    this.blocking = false;
    this.blockAge = 99;

    this.attackDef = null; // the move being performed, null when free
    this.attackT = 0;
    this.attackActive = false;
    this._hitConsumed = false;
    this.comboWindow = 0;
    this.combo = { attack: 0, kick: 0 };
    this.queued = null; // 'attack' | 'kick' pressed early, fires when the current move ends
    this.attackDamage = 0;
    this.attackRange = 2.7;

    this.abilityCD = 0;
    this.abilityT = 0;
    this.abilityActive = false;

    this._move = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  get attacking() {
    return this.attackDef !== null;
  }

  parryReady() {
    return this.blocking && this.blockAge <= PARRY_WINDOW;
  }

  update(dt, input, state, { camYaw, lockOn, targetPos }) {
    const f = this.fighter;
    if (this.dead) {
      f.update(dt);
      return;
    }

    state.regenStamina(this.blocking || this.attacking ? 4 : 16, dt);

    // ---- move basis relative to the camera ----
    this._fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    this._right.set(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const ix = input.axis('left', 'right');
    const iz = input.axis('back', 'forward');
    this._move.set(0, 0, 0).addScaledVector(this._fwd, iz).addScaledVector(this._right, ix);
    const moving = this._move.lengthSq() > 0.0001;
    if (moving) this._move.normalize();

    // ---- block / parry ----
    const recovering = this.attacking && this.attackT >= this.attackDef.windup + this.attackDef.active;
    if (recovering && (input.isDown('block') || input.pressed('dodge'))) this._cancelAttack();
    const wantsBlock = input.isDown('block') && !this.dodging && !this.attacking;
    if (wantsBlock && !this.blocking) this.blockAge = 0;
    this.blocking = wantsBlock && state.stamina > 1;
    if (this.blocking) {
      this.blockAge += dt;
      state.spendStamina(5 * dt);
    } else {
      this.blockAge = 99;
    }

    // ---- dodge roll ----
    if (this.dodgeCD > 0) this.dodgeCD -= dt;
    if (input.pressed('dodge') && !this.dodging && this.dodgeCD <= 0 && !this.attacking && state.spendStamina(20)) {
      this.dodging = true;
      this.dodgeT = this.dodgeDuration;
      this.dodgeCD = this.dodgeDuration + 0.25;
      this.dodgeDir.copy(moving ? this._move : this._fwd);
      f.roll(this.dodgeDuration);
    }
    if (this.dodging) {
      this.dodgeT -= dt;
      this.root.position.addScaledVector(this.dodgeDir, this.dodgeSpeed * dt);
      if (this.dodgeT <= 0) this.dodging = false;
    }

    // ---- attacks: light, light, heavy ----
    if (!this.attacking && this.comboWindow > 0) {
      this.comboWindow -= dt;
      if (this.comboWindow <= 0) this.combo.attack = this.combo.kick = 0;
    }
    const pressed = input.pressed('kick') ? 'kick' : input.pressed('attack') ? 'attack' : null;
    if (pressed && !this.dodging && !this.blocking) {
      if (!this.attacking) this._startAttack(state, pressed);
      else if (this.attackT > this.attackDef.total * 0.2) this.queued = pressed;
    }
    if (this.attacking) {
      const a = this.attackDef;
      this.attackT += dt;
      this.attackActive = this.attackT >= a.windup && this.attackT <= a.windup + a.active;
      if (this.attackT < a.windup + a.active) {
        const dirX = Math.sin(this.heading), dirZ = Math.cos(this.heading);
        this.root.position.x += dirX * a.lunge * dt;
        this.root.position.z += dirZ * a.lunge * dt;
      }
      if (this.attackT >= a.total) {
        this.attackDef = null;
        this.attackActive = false;
        this.comboWindow = 0.55;
        if (this.queued) {
          const next = this.queued;
          this.queued = null;
          this._startAttack(state, next);
        }
      }
    }

    // ---- walking ----
    if (moving && !this.dodging && !this.attacking) {
      const speed = this.moveSpeed * (this.blocking ? 0.45 : 1);
      this.root.position.addScaledVector(this._move, speed * dt);
    }

    // ---- facing ----
    let wantHeading = this.heading;
    if (lockOn && targetPos && !this.dodging) {
      wantHeading = Math.atan2(targetPos.x - this.root.position.x, targetPos.z - this.root.position.z);
    } else if (moving && !this.attacking) {
      wantHeading = Math.atan2(this._move.x, this._move.z);
    }
    this.heading += shortestAngle(this.heading, wantHeading) * (1 - Math.exp(-16 * dt));
    this.root.rotation.y = this.heading;

    // ---- keep inside the platform ----
    const r = Math.hypot(this.root.position.x, this.root.position.z);
    if (r > ARENA_LIMIT) {
      const k = ARENA_LIMIT / r;
      this.root.position.x *= k;
      this.root.position.z *= k;
    }

    // ---- the Key: slow-mo pulse ----
    if (this.abilityCD > 0) this.abilityCD -= dt;
    if (input.pressed('ability') && this.abilityCD <= 0) {
      this.abilityCD = 9;
      this.abilityT = 1.1;
    }
    this.abilityActive = this.abilityT > 0;
    if (this.abilityActive) this.abilityT -= dt;

    // ---- animation ----
    const a = this.attackDef;
    const kicking = a && a.type === 'kick';
    f.setGuard(this.blocking || kicking, kicking ? 0.65 : 1);
    if (kicking) {
      const t = this.attackT;
      const rise = Math.min(1, t / a.windup);
      const fall = Math.max(0, (t - a.windup - a.active) / (a.total - a.windup - a.active));
      const w = t < a.windup + a.active ? rise * rise * (3 - 2 * rise) : 1 - fall * fall * (3 - 2 * fall);
      f.setKick(a.side, w);
      f.setLean(-(a.lean || 0.18) * w);
    } else {
      f.setKick(null, 0);
      f.setLean(this.blocking ? 0.1 : 0);
    }
    if (!this.attacking) {
      if (this.dodging) f.play('run', { speed: 1.6 });
      else if (moving) f.play('run', { speed: this.blocking ? 0.6 : 1 });
      else f.play('idle');
    }
    f.update(dt);
  }

  _startAttack(state, kind) {
    const chain = MOVES[kind];
    const a = chain[this.combo[kind] % chain.length];
    if (!state.spendStamina(a.stamina)) return;
    this.attackDef = a;
    this.attackT = 0;
    this._hitConsumed = false;
    this.attackDamage = a.damage;
    this.combo[kind] = (this.combo[kind] + 1) % chain.length;
    // switching between punches and kicks restarts the other chain
    this.combo[kind === 'kick' ? 'attack' : 'kick'] = 0;
    if (a.type === 'kick') this.fighter.play('idle', { fade: 0.05, speed: 1.4 });
    else this.fighter.playOnce(a.clip, { speed: a.speed });
  }

  _cancelAttack() {
    this.attackDef = null;
    this.attackActive = false;
    this.queued = null;
    this.comboWindow = 0.4;
  }

  /** True once per swing, the first frame the hit is active. */
  consumeHit() {
    if (this.attackActive && !this._hitConsumed) {
      this._hitConsumed = true;
      return true;
    }
    return false;
  }

  get comboFinisher() {
    return !!(this.attackDef && this.attackDef.finisher);
  }

  onHurt() {
    this.fighter.flinch();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.attackDef = null;
    this.attackActive = false;
    this.blocking = false;
    this.fighter.setLean(0);
    this.fighter.playOnce('death', { fade: 0.1 });
  }
}
