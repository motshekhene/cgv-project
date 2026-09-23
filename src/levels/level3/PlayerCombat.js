import * as THREE from "three";

/**
 * Kai in the arena — free movement, lock-on facing, dodge with i-frames,
 * tap/hold attacks, block with a parry window. Stamina pays for
 * everything aggressive; health comes from GameState so the HUD and the
 * level agree on one number.
 *
 * Timings are the fight design — windup/active/recover per attack kind.
 * The level mediates all damage (it owns both fighters and the arena),
 * through the onAttack / onDeath / onParry callbacks.
 */

const ATTACKS = {
  light: {
    windup: 0.18,
    active: 0.12,
    recover: 0.24,
    dmg: 7,
    reach: 2.35,
    arc: 1.05, // radians, half-angle
    stamina: 8,
    lunge: 2.6,
  },
  heavy: {
    windup: 0.4,
    active: 0.16,
    recover: 0.36,
    dmg: 16,
    reach: 2.75,
    arc: 1.25,
    stamina: 18,
    lunge: 3.4,
  },
};

const DODGE = { duration: 0.42, speed: 10.5, stamina: 25, iframesFrom: 0.06, iframesTo: 0.34 };
const PARRY_WINDOW = 0.17;
const HOLD_FOR_HEAVY = 0.27;
const MOVE_SPEED = 5.6;

export class PlayerCombat {
  constructor(root, rig, effects) {
    this.rig = rig;
    this.effects = effects;
    this.pos = rig.group.position;
    this.pos.set(0, 0, 10.5);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI; // spawn facing down the drift (-z)
    this.state = "idle"; // idle | attack | dodge | block | hurt | dead | victory
    this.attackKind = null;
    this.attackT = 0;
    this.attackHit = false;
    this.dodgeT = 0;
    this.dodgeDir = new THREE.Vector3();
    this.hurtT = 0;
    this.parryT = 0;
    this.knockback = new THREE.Vector3();
    this.attackHold = -1; // -1 = not holding
    this.riposteUntil = 0; // parry grants a damage multiplier window

    // callbacks the level wires up
    this.onAttack = null; // (kind) => level resolves the hit
    this.onDeath = null;
    this.onParry = null;

    this._tmp = new THREE.Vector3();
  }

  get iframes() {
    return (
      this.state === "dodge" &&
      this.dodgeT >= DODGE.iframesFrom &&
      this.dodgeT <= DODGE.iframesTo
    );
  }

  get blocking() {
    return this.state === "block";
  }

  get parryOpen() {
    return this.state === "block" && this.parryT < PARRY_WINDOW;
  }

  forward(out) {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  attackSpec(kind) {
    return ATTACKS[kind];
  }

  /** Does the next landed hit crit? (parry riposte window) */
  riposteActive(time) {
    return time < this.riposteUntil;
  }

  playVictory() {
    this.state = "victory";
    this.rig.play("victory");
  }

  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    const { input, state, moveFwd, moveRight, fightActive, bossPos, time } = ctx;
    this.stateRef = state; // takeHit() needs it after update() has run

    if (this.state === "dead" || this.state === "victory") {
      this.rig.update(dt);
      return;
    }

    // ---- input bookkeeping: tap vs hold attack ----
    if (input.pressed("attack")) this.attackHold = 0;
    if (this.attackHold >= 0 && input.isDown("attack")) {
      this.attackHold += dt;
    }
    if (this.attackHold >= 0 && input.released("attack")) {
      const kind = this.attackHold >= HOLD_FOR_HEAVY ? "heavy" : "light";
      this.attackHold = -1;
      this._tryAttack(kind, state);
    }

    // ---- state machine ----
    switch (this.state) {
      case "idle": {
        // block entry
        if (input.isDown("block") && state.stamina > 1) {
          this.state = "block";
          this.parryT = 0;
          this.rig.play("block");
          break;
        }
        // dodge entry
        if (input.pressed("dodge") && state.spendStamina(DODGE.stamina)) {
          this.state = "dodge";
          this.dodgeT = 0;
          const ix = input.axis("left", "right");
          const iz = input.axis("back", "forward");
          if (ix || iz) {
            this.dodgeDir
              .copy(moveRight)
              .multiplyScalar(ix)
              .addScaledVector(moveFwd, iz)
              .normalize();
          } else {
            this.forward(this.dodgeDir).negate();
          }
          this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
          this.rig.play("dodge");
          break;
        }
        this._move(dt, ctx, 1);
        break;
      }

      case "dodge": {
        this.dodgeT += dt;
        this.pos.addScaledVector(this.dodgeDir, DODGE.speed * dt);
        if (this.dodgeT >= DODGE.duration) {
          this.state = "idle";
          this.rig.play("idle");
        }
        break;
      }

      case "attack": {
        this.attackT += dt;
        const spec = ATTACKS[this.attackKind];
        if (this.attackT < spec.windup) {
          // windup — tiny drift toward the target
          this.pos.addScaledVector(this.forward(this._tmp), 0.8 * dt);
        } else if (this.attackT < spec.windup + spec.active) {
          if (!this.attackHit) {
            this.attackHit = true;
            if (this.onAttack) this.onAttack(this.attackKind);
          }
          this.pos.addScaledVector(this.forward(this._tmp), spec.lunge * dt);
        }
        if (this.attackT >= spec.windup + spec.active + spec.recover) {
          this.state = "idle";
          this.rig.play("idle");
        }
        break;
      }

      case "block": {
        this.parryT += dt;
        if (!input.isDown("block") || state.stamina <= 0) {
          this.state = "idle";
          this.rig.play("idle");
          break;
        }
        this._move(dt, ctx, 0.42);
        break;
      }

      case "hurt": {
        this.hurtT -= dt;
        if (this.hurtT <= 0) {
          this.state = "idle";
          this.rig.play("idle");
        }
        break;
      }
    }

    // knockback always applies
    this.pos.addScaledVector(this.knockback, dt);
    this.knockback.multiplyScalar(Math.exp(-7 * dt));

    // ---- facing ----
    if (fightActive && bossPos && this.state !== "dodge" && this.state !== "attack") {
      // lock-on: square up to the Handler whenever hands are free
      const dx = bossPos.x - this.pos.x;
      const dz = bossPos.z - this.pos.z;
      const target = Math.atan2(dx, dz);
      this.facing = this._lerpAngle(this.facing, target, 1 - Math.exp(-8 * dt));
    }

    this.rig.group.rotation.y = this.facing;

    // ---- stamina ----
    const busy = this.state === "attack" || this.state === "dodge" || this.state === "hurt";
    state.regenStamina(this.state === "block" ? 11 : busy ? 0 : 26, dt);

    this.rig.update(dt);
  }

  _move(dt, ctx, speedScale) {
    const { input, moveFwd, moveRight } = ctx;
    const ix = input.axis("left", "right");
    const iz = input.axis("back", "forward");
    this._tmp.set(0, 0, 0);
    if (ix || iz) {
      this._tmp
        .copy(moveRight)
        .multiplyScalar(ix)
        .addScaledVector(moveFwd, iz);
      if (this._tmp.lengthSq() > 1) this._tmp.normalize();
    }
    this._tmp.multiplyScalar(MOVE_SPEED * speedScale);
    this.vel.lerp(this._tmp, 1 - Math.exp(-12 * dt));
    this.pos.addScaledVector(this.vel, dt);

    // rig action from actual speed — GLB clips and procedural poses both read it
    const speed = this.vel.length();
    if (speed > 4.4) this.rig.play("run");
    else if (speed > 0.6) this.rig.play("walk");
    else this.rig.play("idle");

    if (speed > 0.6 && this.state === "idle") {
      this.facing = this._lerpAngle(
        this.facing,
        Math.atan2(this.vel.x, this.vel.z),
        1 - Math.exp(-10 * dt),
      );
    }
  }

  _tryAttack(kind, state) {
    if (this.state !== "idle" && this.state !== "block") return;
    const spec = ATTACKS[kind];
    if (!state.spendStamina(spec.stamina)) return;
    this.state = "attack";
    this.attackKind = kind;
    this.attackT = 0;
    this.attackHit = false;
    this.rig.play(kind === "heavy" ? "attack_heavy" : "attack");
  }

  /* ------------------------------------------------------------------ *
   * damage resolution — called by the level when the Handler connects
   * ------------------------------------------------------------------ */

  takeHit(dmg, fromPos, kind = "hit", time = 0) {
    if (this.state === "dead") return "miss";
    if (this.iframes) {
      this.effects.burstSparks(this._chest(), 6, 0x9ab4c8, 3);
      return "miss";
    }

    if (this.state === "block") {
      if (this.parryT < PARRY_WINDOW) {
        // PARRY — the fight's reward moment
        this.riposteUntil = time + 1.3;
        this.effects.burstSparks(this._chest(), 30, 0x9ce8ff, 9);
        this.effects.spawnRing(this.pos, { maxR: 2.2, dur: 0.4, color: 0x9ce8ff });
        this.effects.addTrauma(0.25);
        if (this.onParry) this.onParry();
        return "parried";
      }
      // guarded — chip damage, stamina cost, pushed back
      const s = this.stateRef;
      s.damage(Math.round(dmg * 0.25));
      s.stamina = Math.max(0, s.stamina - 9);
      const dir = this._tmp.subVectors(this.pos, fromPos).setY(0).normalize();
      this.knockback.copy(dir).multiplyScalar(4.5);
      this.effects.burstSparks(this._chest(), 10, 0xffc27a, 5);
      this.effects.addTrauma(0.08);
      if (s.stamina <= 0) {
        // guard broken — that's the real cost
        this.state = "hurt";
        this.hurtT = 0.55;
        this.rig.play("hurt");
      }
      if (s.health <= 0) this._die();
      return "blocked";
    }

    // clean hit
    const s2 = this.stateRef;
    s2.damage(Math.round(dmg));
    this.state = "hurt";
    this.hurtT = 0.32;
    this.rig.play("hurt");
    const dir = this._tmp.subVectors(this.pos, fromPos).setY(0).normalize();
    this.knockback.copy(dir).multiplyScalar(kind === "lunge" ? 7 : 5);
    this.effects.burstSparks(this._chest(), 16, 0xff6a3a, 6);
    this.effects.addTrauma(0.22);
    if (s2.health <= 0) this._die();
    return "hit";
  }

  _die() {
    this.state = "dead";
    this.rig.play("death");
    if (this.onDeath) this.onDeath();
  }

  _chest() {
    return this._tmp.set(this.pos.x, this.pos.y + 1.2, this.pos.z).clone();
  }

  _lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
}
