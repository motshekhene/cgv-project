import * as THREE from "three";
import { makeDissolve, applyRim } from "./materials.js";
import { applyToMaterials } from "./characters.js";
import { ARENA_CENTER } from "./Arena.js";

/**
 * The Handler, phase-locked: PURSUIT -> STAND -> DESPERATION at 70% / 35%.
 *
 * Every attack telegraphs — a ring on the floor and a windup pose —
 * because a fight you can't read is a fight you can't parry. Phase 2
 * dissolves the helmet (the story reveal); phase 3 turns on the red rim,
 * drops arena wedges behind him and chains lunges.
 *
 * Damage numbers assume Kai: light 7 / heavy 16 / riposte 2.5x.
 */

const MAX_HP = 300;
const PHASE_AT = [0.7, 0.35]; // health fractions that flip the phases

const RUN_SPEED = [4.6, 5.3, 6.2];
const ATK_CD = [1.7, 1.25, 0.85];
const LUNGE_CD = [5.5, 4.5, 3.5];
const DMG_MULT = [1, 1.15, 1.3];

export class HandlerBoss {
  constructor(root, rig, effects) {
    this.rig = rig;
    this.effects = effects;
    this.pos = rig.group.position;
    this.pos.set(0, 0, -49);
    this.facing = 0;

    this.hp = MAX_HP;
    this.phase = 1;
    this.state = "pursue";
    this.t = 0;
    this.atkCd = 1.2;
    this.lungeCd = 3;
    this.specialCd = 5;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.vulnerable = false;

    // lunge bookkeeping
    this.lungeTarget = new THREE.Vector3();
    this.lungeHit = false;
    this.rushLeft = 0;

    // shockwave bookkeeping
    this.waveR = -1;
    this.waveHit = false;

    // helmet dissolve (phase 2) and death dissolve controllers
    this.helmetMats = [];
    this.helmetDissolve = [];
    this.bodyMats = [];
    this.bodyDissolve = [];
    this.helmetT = -1; // -1 = intact
    this.deathT = -1;
    this.rimControllers = [];

    const seen = new Set();
    applyToMaterials(this.rig.group, (m) => {
      if (!m || seen.has(m)) return;
      seen.add(m);
      this.bodyMats.push(m);
    });
    if (this.rig.parts.helmet) {
      const helmetSeen = new Set();
      applyToMaterials(this.rig.parts.helmet, (m) => {
        if (!m || helmetSeen.has(m)) return;
        helmetSeen.add(m);
        this.helmetMats.push(m);
        this.helmetDissolve.push(makeDissolve(m, { color: 0xff7a2a, scale: 8 }));
      });
    }

    // callbacks the level wires up
    this.onPlayerHit = null; // (dmg, fromPos, kind)
    this.onPhaseChange = null; // (phase)
    this.onDeath = null;

    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  get alive() {
    return this.deathT < 0;
  }

  get staggering() {
    return this.state === "stagger";
  }

  chest(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.35, this.pos.z);
  }

  spawn() {
    this.pos.set(0, 0, -49);
    this.rig.group.visible = true;
    this.rig.play("idle");
  }

  /* ------------------------------------------------------------------ *
   * damage
   * ------------------------------------------------------------------ */

  takeHit(dmg, heavy = false, fromPos = null, riposte = false) {
    if (!this.alive) return { died: false };
    let total = dmg;
    if (this.staggering) total *= 2;
    if (riposte) total *= 2.5;
    this.hp = Math.max(0, this.hp - total);

    this.effects.burstSparks(this.chest(this._tmp).clone(), heavy ? 26 : 14, riposte ? 0x9ce8ff : 0xffa03a, heavy ? 8 : 6);
    if (heavy && fromPos) {
      this._dir.subVectors(this.pos, fromPos).setY(0).normalize();
      this.pos.addScaledVector(this._dir, 0.45);
    }

    if (this.hp <= 0) {
      this._die();
      return { died: true };
    }

    // phase flips
    if (this.phase === 1 && this.hp <= MAX_HP * PHASE_AT[0]) this._enterPhase(2);
    else if (this.phase === 2 && this.hp <= MAX_HP * PHASE_AT[1]) this._enterPhase(3);

    return { died: false };
  }

  stagger(duration = 2.2) {
    if (!this.alive || this.state === "stagger") return;
    this.state = "stagger";
    this.t = 0;
    this.staggerDur = duration;
    this.vulnerable = true;
    this.waveR = -1;
    this.rig.play("stagger");
  }

  _enterPhase(n) {
    this.phase = n;
    this.state = "stagger"; // the roar is a stagger with theatre
    this.t = 0;
    this.staggerDur = 1.6;
    this.vulnerable = false;
    this.rig.play("roar");
    this.effects.spawnRing(this.pos, { maxR: 7, dur: 1.0, color: 0xff3a1a });
    this.effects.addTrauma(0.5);

    if (n === 2 && this.rig.parts.helmet) this.helmetT = 0;
    if (n === 3) {
      for (const m of this.bodyMats) {
        this.rimControllers.push(applyRim(m, 0xff2a1a, 1.7));
      }
    }
    if (this.onPhaseChange) this.onPhaseChange(n);
  }

  _die() {
    this.state = "dying";
    this.deathT = 0;
    this.waveR = -1;
    this.rig.play("death");
    for (const m of this.bodyMats) {
      this.bodyDissolve.push(makeDissolve(m, { color: 0xff7a2a, scale: 3.2 }));
    }
    this.effects.addTrauma(0.6);
    this.effects.spawnRing(this.pos, { maxR: 10, dur: 1.4, color: 0xff7a2a });
  }

  /* ------------------------------------------------------------------ *
   * the FSM
   * ------------------------------------------------------------------ */

  update(dt, ctx) {
    const { state, player, arena } = ctx;
    this.t += dt;
    this.atkCd -= dt;
    this.lungeCd -= dt;
    this.specialCd -= dt;

    if (this.deathT >= 0) {
      this._updateDeath(dt);
      this._publish(state);
      return;
    }

    const playerPos = player.pos;
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = this._dir.set(dx, 0, dz).normalize();

    switch (this.state) {
      case "pursue": {
        this.rig.play(dist > 6 ? "run" : "walk");
        this._faceTo(toPlayer, dt);
        this._moveToward(playerPos, RUN_SPEED[this.phase - 1], dt, arena);

        this.strafeT += dt;
        if (dist < 2.9 && this.atkCd <= 0) {
          this._startSwipe();
        } else if (
          dist >= 4.2 &&
          dist <= 8.8 &&
          this.lungeCd <= 0
        ) {
          this._startLunge(playerPos);
        } else if (this.phase >= 2 && this.specialCd <= 0 && dist < 12) {
          if (dist >= 4.5) this._startVentCall();
          else this._startShockwave();
        } else if (this.strafeT > 4.5 + Math.random() * 2) {
          this.state = "strafe";
          this.t = 0;
          this.strafeT = 0;
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        break;
      }

      case "strafe": {
        this.rig.play("walk");
        this._faceTo(toPlayer, dt);
        // circle at roughly the current radius
        const tangent = this._tmp.set(-toPlayer.z, 0, toPlayer.x).multiplyScalar(this.strafeDir);
        const desired = this._tmp
          .clone()
          .multiplyScalar(2.2)
          .addScaledVector(toPlayer, dist > 3.8 ? 1.2 : -1.2);
        this._moveToward(
          this._tmp.copy(this.pos).add(desired),
          3.2,
          dt,
          arena,
        );
        if (this.t > 1.15) {
          this.state = "pursue";
          this.t = 0;
        }
        break;
      }

      case "swipe": {
        const WINDUP = 0.55;
        const ACTIVE = 0.2;
        const RECOVER = 1.35;
        if (this.t < WINDUP) {
          this._faceTo(toPlayer, dt * 0.6); // slow tracking — dodgeable
        } else if (this.t < WINDUP + ACTIVE) {
          if (!this.lungeHit) {
            this.lungeHit = true;
            this._faceTo(toPlayer, 1);
            const angle = Math.abs(this._angleDiff(this.facing, Math.atan2(dx, dz)));
            if (dist < 2.75 && angle < 1.35) {
              if (this.onPlayerHit) {
                this.onPlayerHit(Math.round(14 * DMG_MULT[this.phase - 1]), this.pos, "swipe");
              }
            }
          }
        } else if (this.t >= RECOVER) {
          this.state = "pursue";
          this.t = 0;
          this.atkCd = ATK_CD[this.phase - 1];
          this.lungeHit = false;
        }
        break;
      }

      case "lunge": {
        const TELEGRAPH = this.rushLeft > 0 ? 0.32 : 0.5;
        const DASH = 0.35;
        if (this.t < TELEGRAPH) {
          this._faceTo(
            this._tmp.subVectors(this.lungeTarget, this.pos).setY(0).normalize(),
            dt,
          );
        } else if (this.t < TELEGRAPH + DASH) {
          this._dashToward(this.lungeTarget, 15, dt, arena);
          if (
            !this.lungeHit &&
            Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z) < 1.85
          ) {
            this.lungeHit = true;
            if (this.onPlayerHit) {
              this.onPlayerHit(Math.round(18 * DMG_MULT[this.phase - 1]), this.pos, "lunge");
            }
          }
        } else if (this.t >= TELEGRAPH + DASH + 0.35) {
          if (this.rushLeft > 0) {
            // phase-3 rush: chain the next lunge immediately
            this.rushLeft--;
            this._startLunge(playerPos);
          } else {
            this.state = "pursue";
            this.t = 0;
            this.lungeCd = LUNGE_CD[this.phase - 1];
            this.lungeHit = false;
          }
        }
        break;
      }

      case "shockwave": {
        const WINDUP = 0.7;
        if (this.t < WINDUP) {
          this._faceTo(toPlayer, dt * 0.4);
        } else {
          if (this.waveR < 0) {
            this.waveR = 0.5;
            this.waveHit = false;
            this.effects.spawnRing(this.pos, { maxR: 9.5, dur: 1.0, color: 0xff7a2a, opacity: 1 });
            this.effects.addTrauma(0.35);
            this.effects.burstSparks(this.pos, 22, 0xff7a2a, 7);
          }
          this.waveR += 10.5 * dt;
          if (
            !this.waveHit &&
            !player.iframes &&
            Math.abs(dist - this.waveR) < 0.75
          ) {
            this.waveHit = true;
            if (this.onPlayerHit) {
              this.onPlayerHit(Math.round(12 * DMG_MULT[this.phase - 1]), this.pos, "shockwave");
            }
          }
          if (this.t >= WINDUP + 1.1) {
            this.state = "pursue";
            this.t = 0;
            this.specialCd = 7;
            this.waveR = -1;
          }
        }
        break;
      }

      case "ventcall": {
        if (this.t < 0.6) {
          this._faceTo(toPlayer, dt);
        } else if (this.waveR < 0) {
          this.waveR = 0; // reusing the flag as "already called"
          const idx = arena.ventNear(playerPos, 99);
          if (idx >= 0) arena.triggerVent(idx, false);
          else arena.triggerVent(Math.floor(Math.random() * 4), false);
        }
        if (this.t >= 1.2) {
          this.state = "pursue";
          this.t = 0;
          this.specialCd = 6.5;
          this.waveR = -1;
        }
        break;
      }

      case "stagger": {
        if (this.t >= this.staggerDur) {
          this.state = "pursue";
          this.t = 0;
          this.vulnerable = false;
          this.atkCd = 0.4;
        }
        break;
      }
    }

    // hazards apply to him too — the pool is everybody's problem
    arena.hazards(this.pos, dt, 0.85);

    this.rig.group.rotation.y = this.facing;
    this.rig.update(dt);
    this._publish(state);
  }

  _publish(state) {
    state.bossHealth = this.hp;
    state.handlerState = this.state.toUpperCase();
    state.phase = this.phase;
  }

  /* ---------------- attack starters ---------------- */

  _startSwipe() {
    this.state = "swipe";
    this.t = 0;
    this.lungeHit = false;
    this.rig.play("swipe");
    this.effects.spawnRing(this.pos, { maxR: 2.8, dur: 0.55, color: 0xff3020 });
    this.effects.addTrauma(0.05);
  }

  _startLunge(playerPos) {
    this.state = "lunge";
    this.t = 0;
    this.lungeHit = false;
    this.rushLeft = this.phase === 3 && this.rushLeft === 0 ? 2 : this.rushLeft;
    this.lungeTarget.copy(playerPos);
    this.rig.play("lunge");
    this.effects.spawnRing(playerPos, { maxR: 2.2, dur: 0.5, color: 0xffa030 });
  }

  _startShockwave() {
    this.state = "shockwave";
    this.t = 0;
    this.waveR = -1;
    this.rig.play("shockwave");
    this.effects.spawnRing(this.pos, { maxR: 3.5, dur: 0.7, color: 0xff3020 });
  }

  _startVentCall() {
    this.state = "ventcall";
    this.t = 0;
    this.waveR = -1;
    this.rig.play("roar");
  }

  /* ---------------- movement helpers ---------------- */

  _faceTo(dir, dt) {
    const target = Math.atan2(dir.x, dir.z);
    this.facing = this._lerpAngle(this.facing, target, Math.min(1, dt * 6));
  }

  _moveToward(target, speed, dt, arena) {
    this._dir.subVectors(target, this.pos).setY(0);
    const len = this._dir.length();
    if (len < 0.05) return;
    this._dir.divideScalar(len);
    // pool avoidance — steer tangentially around the lava
    const ax = this.pos.x - ARENA_CENTER.x;
    const az = this.pos.z - ARENA_CENTER.z;
    const distToPool = Math.hypot(ax, az);
    if (distToPool < 8.2) {
      const outward = this._tmp.set(ax, 0, az).normalize();
      const blend = THREE.MathUtils.clamp((8.2 - distToPool) / 2.2, 0, 1);
      this._dir.lerp(outward, blend * 0.85).normalize();
    }
    this.pos.addScaledVector(this._dir, Math.min(speed, len / dt) * dt);
    arena.clampToWorld(this.pos, 0.85);
  }

  _dashToward(target, speed, dt, arena) {
    this._dir.subVectors(target, this.pos).setY(0);
    const len = this._dir.length();
    if (len < 0.1) return;
    this._dir.divideScalar(len);
    this.pos.addScaledVector(this._dir, speed * dt);
    arena.clampToWorld(this.pos, 0.85);
    this.facing = Math.atan2(this._dir.x, this._dir.z);
  }

  _updateDeath(dt) {
    this.deathT += dt;
    const p = Math.min(1, this.deathT / 2.6);
    for (const d of this.bodyDissolve) d.set(p * 0.98);
    if (this.rig.parts.helmet && this.helmetT < 1) this.helmetT = 1;
    if (this.deathT >= 2.8) {
      this.rig.group.visible = false;
      if (this.onDeath) {
        const cb = this.onDeath;
        this.onDeath = null;
        cb();
      }
    }
  }

  /** Phase-2 helmet dissolve animation, driven from update by the level. */
  updateHelmet(dt) {
    if (this.helmetT < 0 || this.helmetT >= 1) return;
    this.helmetT = Math.min(1, this.helmetT + dt / 1.8);
    for (const d of this.helmetDissolve) d.set(this.helmetT * 0.99);
    if (this.helmetT >= 1 && this.rig.parts.helmet) {
      this.rig.parts.helmet.visible = false;
    }
  }

  _angleDiff(a, b) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  _lerpAngle(a, b, t) {
    return a + this._angleDiff(a, b) * t;
  }
}
