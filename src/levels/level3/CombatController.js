import * as THREE from 'three';
import { Fighter } from './Fighter.js';

/**
 * CombatController — Kai in the arena (Member 3A).
 *
 * Owns movement, lock-on strafing, the 3-hit combo, dodge roll, block and the
 * parry timing. Never touches the boss: Level03 is the only file that knows
 * both fighters exist, and it resolves who hits whom. Health and stamina live
 * in the shared GameState (state.health / state.stamina), not here.
 *
 * Controls (shared Input actions): forward/back/left/right move, attack =
 * jab, hook, heavy finisher; dodge = roll; block (hold) / parry (tap just
 * before impact); ability = the Key's short slow-motion pulse.
 */
const ATTACKS = [
  { clip: 'body-jab-cross', fallback: 'punch', speed: 1.35, windup: 0.16, active: 0.18, total: 0.58, damage: 13, stamina: 9, lunge: 8.0, lungeMax: 1.35 },
  { clip: 'hook-punch', fallback: 'swordslash', speed: 1.15, windup: 0.2, active: 0.2, total: 0.66, damage: 16, stamina: 11, lunge: 8.2, lungeMax: 1.55 },
  { clip: 'combo-punch', fallback: 'heavy', speed: 1.05, windup: 0.3, active: 0.22, total: 0.88, damage: 26, stamina: 18, lunge: 8.5, lungeMax: 1.8 },
];
const PARRY_WINDOW = 0.34;
function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class CombatController {
  constructor(parent, source, options = {}) {
    this.fighter = new Fighter(parent, { source, capsuleColor: 0xdfe8ee, ...options });
    this.root = this.fighter.root;
    this.root.position.set(0, 0, 3.2);

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

    this.attackIndex = -1; // index into ATTACKS while attacking, -1 otherwise
    this.attackT = 0;
    this.attackActive = false;
    this._hitConsumed = false;
    this.comboWindow = 0;
    this.nextCombo = 0;
    this.queued = false;
    this.attackDamage = 0;
    this.attackRange = 3.05;
    this.attackLungeUsed = 0;

    this.abilityCD = 0;
    this.abilityT = 0;
    this.abilityActive = false;

    this._move = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  get attacking() {
    return this.attackIndex >= 0;
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
    if (this.comboWindow > 0) {
      this.comboWindow -= dt;
      if (this.comboWindow <= 0) this.nextCombo = 0;
    }
    if (input.pressed('attack') && !this.dodging && !this.blocking) {
      if (!this.attacking) this._startAttack(state, targetPos);
      else this.queued = true;
    }
    if (this.attacking) {
      const a = ATTACKS[this.attackIndex];
      this.attackT += dt;
      this.attackActive = this.attackT >= a.windup && this.attackT <= a.windup + a.active;
      if (this.attackT < a.windup + a.active && this.attackLungeUsed < a.lungeMax) {
        const dirX = Math.sin(this.heading), dirZ = Math.cos(this.heading);
        let step = Math.min(a.lunge * dt, a.lungeMax - this.attackLungeUsed);
        if (targetPos) {
          const dx = targetPos.x - this.root.position.x;
          const dz = targetPos.z - this.root.position.z;
          step = Math.min(step, Math.max(0, Math.hypot(dx, dz) - 1.12));
        }
        this.root.position.x += dirX * step;
        this.root.position.z += dirZ * step;
        this.attackLungeUsed += step;
      }
      if (this.attackT >= a.total) {
        this.attackIndex = -1;
        this.attackActive = false;
        this.comboWindow = 0.55;
        if (this.queued) {
          this.queued = false;
          this._startAttack(state);
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

    // ---- the Key: brief slow motion, then a nine-second recharge ----
    if (this.abilityCD > 0) this.abilityCD -= dt;
    if (input.pressed('ability') && this.abilityCD <= 0) {
      this.abilityCD = 9;
      this.abilityT = 1.1;
    }
    this.abilityActive = this.abilityT > 0;
    if (this.abilityActive) this.abilityT -= dt;

    // ---- animation ----
    f.setLean(this.blocking ? -0.18 : 0);
    f.setGuard(this.blocking);
    if (!this.attacking) {
      if (this.blocking && f.hasClip('block')) f.play('block');
      else if (this.dodging) f.play('run', { speed: 1.15 });
      else if (moving) f.play('run', { speed: this.blocking ? 0.6 : 1 });
      else f.play('idle');
    }
    f.update(dt);
  }

  _startAttack(state, targetPos = null) {
    const a = ATTACKS[this.nextCombo];
    if (!state.spendStamina(a.stamina)) return;
    this.attackIndex = this.nextCombo;
    this.attackT = 0;
    this.attackLungeUsed = 0;
    this._hitConsumed = false;
    this.attackDamage = a.damage;
    this.nextCombo = (this.nextCombo + 1) % ATTACKS.length;
    if (targetPos) this.heading = Math.atan2(targetPos.x - this.root.position.x, targetPos.z - this.root.position.z);
    const clip = this.fighter.hasClip(a.clip) ? a.clip : a.fallback;
    this.fighter.playOnce(clip, { speed: a.speed });
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
    return this.attackIndex === ATTACKS.length - 1;
  }

  onHurt() {
    this.fighter.flinch();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.attackIndex = -1;
    this.attackActive = false;
    this.blocking = false;
    this.fighter.setLean(0);
    this.fighter.playOnce('death', { fade: 0.1 });
  }
}
