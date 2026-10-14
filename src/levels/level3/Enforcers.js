import * as THREE from 'three';
import { Fighter } from './Fighter.js';
import { Telegraphs } from './Telegraphs.js';
import { Nav } from './Nav.js';

/**
 * Enforcers — the company's men, Level 3's first fight (act I).
 *
 * The Marshal didn't come down the falls alone. Before he steps in himself he
 * sends his men: logging-company hands in yellow hard hats with red bandanas
 * over their faces and the company's amber band on their arms, so they can
 * never be taken for him. Three of them, on the same rig as he is.
 *
 * Hard but fair, the way a crowd fight has to be:
 *   - only one of them attacks at a time (the squad hands out the turn, with
 *     a breath between turns); the others stand off round Kai, spread out,
 *     and close the circle when one goes down
 *   - every attack lights its ground first (level3/Telegraphs.js): a JAB is a
 *     short lane, a HAYMAKER a disc round him
 *   - they're weaker than he is: a hit interrupts a wind-up, a parry leaves
 *     them reeling, a few combos drop one
 * They find their way round the trees like he does (level3/Nav.js) and come in
 * through the gate under the arch, one after another.
 *
 *   const squad = new EnforcerSquad(root, arena, kai, rig.source, rig.meta);
 *   squad.onStrike = (info, who) => 'hit' | 'blocked' | 'parried' | 'dodged';
 *   squad.update(dt);               // every frame of act I
 *   squad.target(kaiPos, heading)   // the one Kai should be swinging at
 */
const LOOKS = [
  { skin: 0x6b4a30 },
  { skin: 0x8a5c3a },
  { skin: 0x4e3424 },
];
const PALETTE = { Hair: 0x1a1512, Shirt: 0x4b5332, Pants: 0x2a2d24, Details: 0xb8913a, TieTexture: 0x8a2420, Shoes: 0x1a1a1e };

const HEALTH = 70;
const RUN = 4.6;
const WALK = 2.2;
const RING = [3.8, 5.2]; // m: where the ones waiting their turn stand off him
const TURN_GAP = [0.55, 1.1]; // s between one man's attack and the next man's go
const GIVE_UP = 4; // s to get to him once it's his turn, or he steps back and lets the next man try

const ATTACKS = {
  jab: {
    name: 'JAB', tell: 0xff7a1a, telegraph: 0.72, recover: 0.8, engage: 3.0, blockMul: 0.25,
    hits: [{ dur: 0.26, move: 6.5, reach: 1.7, damage: 9 }],
  },
  haymaker: {
    name: 'HAYMAKER', tell: 0xff1133, telegraph: 0.88, recover: 0.95, engage: 2.0, blockMul: 0.6,
    hits: [{ dur: 0.3, move: 0, radius: 2.2, damage: 11 }],
  },
};

/** The rig's clip for each attack, started during the wind-up so its blow lands as the strike opens. */
function clipsFor(meta) {
  const c = meta?.clips || {};
  const at = (clip, hit, lead, speed, impact) => ({ clip, from: Math.max(0, hit - lead), hit, speed, impact });
  return {
    jab: c.lunge && at('lunge', c.lunge.hit, 0.3, 1.2, 0.18),
    haymaker: c.sweep && at('sweep', c.sweep.hits?.find((h) => h.t > 1.2)?.t ?? c.sweep.hit, 0.5, 1.4, 0.1),
  };
}

/**
 * The company's kit on the monk rig: a yellow hard hat, a red bandana up over
 * nose and mouth, an amber armband. Rigid pieces on the bones, like the
 * Marshal's coat (HandlerBoss.dressAsHandler).
 */
function dressAsEnforcer(fighter) {
  const head = fighter.bone('Head');
  const arm = fighter.bones.mixamorigLeftArm;
  if (!head) return;
  fighter.root.updateMatrixWorld(true);
  const s = head.getWorldScale(new THREE.Vector3()).x || 1;
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xd9a520, roughness: 0.45, metalness: 0.05 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8a2420, roughness: 0.95, side: THREE.DoubleSide });
  const band = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffb03a, emissiveIntensity: 0.4, roughness: 0.6 });

  const hat = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135 / s, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatMat);
  dome.scale.set(1.08, 0.95, 1.18);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.175 / s, 0.18 / s, 0.012 / s, 26), hatMat);
  brim.scale.set(1, 1, 1.18);
  brim.position.set(0, 0.004 / s, 0.025 / s);
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.11 / s, 0.012 / s, 5, 20, Math.PI), hatMat);
  ridge.rotation.y = Math.PI / 2;
  ridge.scale.set(1.18, 1.12, 1);
  hat.add(dome, brim, ridge);
  hat.position.set(0, 0.155 / s, 0.0);
  hat.rotation.x = -0.08;
  hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  head.add(hat);

  // over the nose and mouth, round the front of the face and knotted at the back
  const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.104 / s, 0.118 / s, 0.105 / s, 22, 1, true, -Math.PI * 0.62, Math.PI * 1.24), cloth);
  mask.position.set(0, 0.05 / s, 0.012 / s);
  mask.scale.set(1.04, 1, 1.15);
  mask.castShadow = true;
  head.add(mask);

  if (arm) {
    const as = arm.getWorldScale(new THREE.Vector3()).x || 1;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068 / as, 0.016 / as, 6, 18), band);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12 / as;
    arm.add(ring);
  }
}

export class Enforcer {
  constructor(parent, arena, kai, source, meta, index) {
    this.arena = arena;
    this.kai = kai;
    this.index = index;
    this.meta = meta;
    const look = LOOKS[index % LOOKS.length];
    this.fighter = new Fighter(parent, {
      source,
      capsuleColor: 0xb8913a,
      palette: { ...PALETTE, Skin: look.skin },
      ...(meta && { modelHeight: meta.height }),
    });
    dressAsEnforcer(this.fighter);
    this.root = this.fighter.root;
    this.root.visible = false;
    this.clips = clipsFor(meta);
    this.zones = new Telegraphs(parent, arena);
    this.nav = new Nav(arena, 0.42);

    this.maxHealth = this.health = HEALTH;
    this.state = 'OFF';
    this.t = 0;
    this.heading = 0;
    this.attackName = 'jab';
    this.hitT = 0;
    this.hitResolved = false;
    this.strikeDir = new THREE.Vector3(0, 0, 1);
    this.slot = new THREE.Vector3();
    this.onStrike = null;
    this.onDown = null;
    this._dir = new THREE.Vector3();
    this._move = new THREE.Vector3();
    this.hurtT = 0;
  }

  get alive() {
    return this.state !== 'DOWN' && this.state !== 'OFF';
  }

  get vulnerable() {
    return this.state === 'STAGGER';
  }

  /** Is he taking his turn (lining up, swinging, or getting over it)? */
  get attacking() {
    return this.state === 'APPROACH' || this.state === 'TELEGRAPH' || this.state === 'STRIKE' || this.state === 'RECOVER';
  }

  /** The attack he's winding up or throwing, for the ground telegraph (as HandlerBoss.threat). */
  get threat() {
    const atk = ATTACKS[this.attackName];
    if (!atk || (this.state !== 'TELEGRAPH' && this.state !== 'STRIKE')) return null;
    const h = atk.hits[0];
    return {
      name: this.attackName,
      color: atk.tell,
      striking: this.state === 'STRIKE',
      k: this.state === 'STRIKE' ? 1 : Math.min(1, this.t / atk.telegraph),
      radius: h.radius || 0,
      length: h.radius ? 0 : h.reach + h.move * h.dur,
      heading: this.state === 'STRIKE' ? Math.atan2(this.strikeDir.x, this.strikeDir.z) : this.heading,
    };
  }

  /** In through the gate, from `from`, to his place round Kai. */
  enter(from) {
    this.root.visible = true;
    this.root.position.copy(from);
    this.heading = 0;
    this._enter('ENTER');
    this.fighter.play('run', { fade: 0 });
  }

  _enter(state) {
    this.state = state;
    this.t = 0;
  }

  takeDamage(amount) {
    if (!this.alive) return 0;
    const dealt = amount * (this.vulnerable ? 1.6 : 1);
    this.health = Math.max(0, this.health - dealt);
    this.fighter.flash(0xffffff, 0.1);
    if (this.health <= 0) {
      this._enter('DOWN');
      this.zones.hide();
      this.fighter.playOnce('death', { fade: 0.08, speed: 1.2 });
      this.onDown?.(this);
      return dealt;
    }
    // weaker than the Marshal: a hit breaks his wind-up
    if (this.state !== 'STRIKE' && this.state !== 'STAGGER') {
      const peak = this.meta?.clips.hit?.peak ?? 0.7;
      this.fighter.playOnce('hit', { from: Math.max(0, peak - 0.3), speed: 1.7, fade: 0.05 });
      this.hurtT = 0.38;
      if (this.state === 'TELEGRAPH') this._enter('RECOVER');
    }
    return dealt;
  }

  /** Parried: dazed and open. */
  stagger(time = 1.5) {
    this._enter('STAGGER');
    this.staggerFor = time;
    this.zones.hide();
    this.fighter.play('stunned', { fade: 0.12 });
  }

  /**
   * One frame. `turn` is true while it's his go at Kai (the squad decides);
   * `slot` is where he stands off him otherwise.
   */
  update(dt, turn) {
    const f = this.fighter;
    if (this.state === 'OFF') return;
    if (this.state === 'DOWN') {
      f.update(dt);
      return;
    }
    this.t += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    const pos = this.root.position;
    const kp = this.kai.root.position;
    const dir = this._dir.set(kp.x - pos.x, 0, kp.z - pos.z);
    const dist = dir.length();
    if (dist > 1e-4) dir.divideScalar(dist);
    const face = (rate, towards = dir) => {
      const want = Math.atan2(towards.x, towards.z);
      let d = (want - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * (1 - Math.exp(-rate * dt));
    };
    const anim = this.hurtT <= 0;
    const runTo = (target, speed, stopAt) => {
      const d = Math.hypot(target.x - pos.x, target.z - pos.z);
      if (d <= stopAt) return true;
      const move = this.nav.steer(pos, target, this._move);
      pos.addScaledVector(move, Math.min(speed * dt, d - stopAt * 0.5));
      face(9, move);
      const runSpeed = this.meta?.clips.run?.speed;
      if (anim) f.play('run', { speed: runSpeed ? speed / runSpeed : 1, fade: 0.2 });
      return false;
    };

    switch (this.state) {
      case 'ENTER':
        // in through the gate until he's in the ring round Kai: from there it's standing off him
        if (runTo(this.slot, RUN, 0.6) || dist < RING[1] + 1.2) this._enter('WAIT');
        break;
      case 'WAIT':
        // his go: in he comes. Otherwise he stands off him at his place, turned to him
        if (turn) {
          this.attackName = Math.random() < 0.55 ? 'jab' : 'haymaker';
          this._enter('APPROACH');
          break;
        }
        if (!runTo(this.slot, WALK + 0.8, 0.7)) break;
        face(6);
        if (anim) f.play('idle', { fade: 0.3 });
        break;
      case 'APPROACH': {
        const atk = ATTACKS[this.attackName];
        const close = dist <= atk.engage && this.nav.clear(pos, kp);
        if (!close) runTo(kp, RUN, atk.engage * 0.85);
        else {
          this._enter('TELEGRAPH');
          this.clipStarted = false;
        }
        if (this.t > GIVE_UP) this._enter('WAIT'); // couldn't get to him: let the next man try
        break;
      }
      case 'TELEGRAPH': {
        const atk = ATTACKS[this.attackName];
        if (this.t < atk.telegraph * 0.75) face(7);
        const cl = this.clips[this.attackName];
        if (cl) {
          const startAt = atk.telegraph + cl.impact - (cl.hit - cl.from) / cl.speed;
          if (!this.clipStarted && this.t >= startAt) {
            this.clipStarted = true;
            f.playOnce(cl.clip, { from: cl.from + (this.t - startAt) * cl.speed, speed: cl.speed, fade: 0.08 });
          } else if (!this.clipStarted && anim) f.play('idle', { fade: 0.2 });
        }
        if (this.t >= atk.telegraph) {
          this.strikeDir.copy(dir);
          this._enter('STRIKE');
          this.hitResolved = false;
        }
        break;
      }
      case 'STRIKE': {
        const atk = ATTACKS[this.attackName];
        const h = atk.hits[0];
        if (h.move) pos.addScaledVector(this.strikeDir, h.move * dt);
        if (!this.hitResolved) {
          const inRange = h.radius ? this.t > 0.08 && dist <= h.radius : dist <= h.reach;
          if (inRange) {
            this.hitResolved = true;
            const out = this.onStrike?.({ type: this.attackName, damage: h.damage, blockMul: atk.blockMul }, this);
            if (out === 'parried') { this.stagger(); break; }
          }
        }
        if (this.t >= h.dur) this._enter('RECOVER');
        break;
      }
      case 'RECOVER': {
        if (anim && this.t > 0.3) f.play('idle', { fade: 0.3 });
        if (this.t >= ATTACKS[this.attackName].recover) this._enter('WAIT');
        break;
      }
      case 'STAGGER':
        if (this.t >= this.staggerFor) this._enter('WAIT');
        break;
    }
    this.root.rotation.y = this.heading;
    f.update(dt);
    this.zones.update(dt, this.threat, pos);
  }

  dispose() {
    this.zones.dispose();
    this.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
  }
}

/**
 * The squad: brings them in, keeps them spread round Kai, and hands out the
 * turn to attack, one man at a time.
 */
export class EnforcerSquad {
  constructor(parent, arena, kai, source, meta, count = 3) {
    this.kai = kai;
    this.men = Array.from({ length: count }, (_, i) => new Enforcer(parent, arena, kai, source, meta, i));
    this.turnOf = null;
    this.turnGap = 1.2;
    this.onStrike = null;
    this.onDown = null;
    for (const m of this.men) {
      m.onStrike = (info, who) => this.onStrike?.(info, who);
      m.onDown = (who) => {
        if (this.turnOf === who) this.turnOf = null;
        this.onDown?.(who);
      };
    }
    this._entering = [];
    this._c = new THREE.Vector3();
    this._order = [];
    this._orderT = 0;
    this._base = null;
  }

  /** In they come, through the gate one after another (`gate` the far side of the arch). */
  start(gate) {
    this._entering = this.men.map((m, i) => ({ m, at: i * 0.9, from: gate.clone().add(new THREE.Vector3((i - 1) * 1.1, 0, -1.2 - i * 0.6)) }));
    this._t = 0;
  }

  get alive() {
    return this.men.filter((m) => m.alive);
  }

  get done() {
    return this.men.every((m) => m.state === 'DOWN');
  }

  /** Their health left, of all of theirs, for the HUD's bar. */
  get fraction() {
    return this.men.reduce((s, m) => s + (m.state === 'OFF' ? m.maxHealth : m.health), 0) / this.men.reduce((s, m) => s + m.maxHealth, 0);
  }

  /** The one Kai should be swinging at: the nearest in front of him, else the nearest. */
  target(kp, heading) {
    let best = null, score = Infinity;
    for (const m of this.men) {
      if (!m.alive) continue;
      const p = m.root.position;
      const dx = p.x - kp.x, dz = p.z - kp.z;
      const d = Math.hypot(dx, dz);
      const facing = d > 1e-3 ? (Math.sin(heading) * dx + Math.cos(heading) * dz) / d : 1;
      const s = d - facing * 1.6;
      if (s < score) { score = s; best = m; }
    }
    return best;
  }

  update(dt) {
    this._t += dt;
    for (const e of this._entering) {
      if (!e.started && this._t >= e.at) {
        e.started = true;
        e.m.enter(e.from);
      }
    }
    const kp = this.kai.root.position;
    // their places: spread round him, an arc that closes up as there are fewer of them, centred on where
    // they are. Who stands where is only worked out again now and then, so nobody chases a place that keeps moving
    const live = this.alive;
    const c = this._c.set(0, 0, 0);
    for (const m of live) c.add(m.root.position);
    if (live.length) c.divideScalar(live.length);
    const want = Math.atan2(c.x - kp.x, c.z - kp.z);
    if (this._base === null) this._base = want;
    const turn = Math.atan2(Math.sin(want - this._base), Math.cos(want - this._base));
    this._base += turn * (1 - Math.exp(-1.5 * dt));
    const base = this._base;
    const spread = live.length > 1 ? Math.min(2.4, 1.2 * (live.length - 1)) : 0;
    this._orderT -= dt;
    if (this._orderT <= 0 || this._order.length !== live.length || this._order.some((m) => !m.alive)) {
      this._orderT = 1.2;
      this._order = [...live].sort((a, b) => {
        const aa = Math.atan2(a.root.position.x - kp.x, a.root.position.z - kp.z) - base;
        const bb = Math.atan2(b.root.position.x - kp.x, b.root.position.z - kp.z) - base;
        return Math.atan2(Math.sin(aa), Math.cos(aa)) - Math.atan2(Math.sin(bb), Math.cos(bb));
      });
    }
    this._order.forEach((m, i) => {
      const a = base + (live.length > 1 ? -spread / 2 + (spread * i) / (live.length - 1) : 0);
      const r = RING[0] + ((m.index * 0.37) % 1) * (RING[1] - RING[0]);
      m.slot.set(kp.x + Math.sin(a) * r, 0, kp.z + Math.cos(a) * r);
    });

    // whose go it is: one at a time, a breath between turns
    if (this.turnOf && !this.turnOf.attacking) {
      this.turnOf = null;
      this.turnGap = TURN_GAP[0] + Math.random() * (TURN_GAP[1] - TURN_GAP[0]);
    }
    if (!this.turnOf) {
      this.turnGap -= dt;
      const ready = live.filter((m) => m.state === 'WAIT');
      if (this.turnGap <= 0 && ready.length) {
        // whoever has waited longest goes (the nearer, if it's a tie): they take it in turns
        ready.sort((a, b) => (a.lastTurn ?? -1) - (b.lastTurn ?? -1)
          || a.root.position.distanceToSquared(kp) - b.root.position.distanceToSquared(kp));
        this.turnOf = ready[0];
        this.turnOf.lastTurn = this._t;
      }
    }
    for (const m of this.men) m.update(dt, m === this.turnOf);
  }

  hideZones() {
    for (const m of this.men) m.zones.hide();
  }

  dispose() {
    for (const m of this.men) m.dispose();
  }
}
