import * as THREE from 'three';
import { attachModel as attachVehicleModel } from './attachModel.js';
import { spinWheels } from './wheels.js';

/** States in which he is actively attacking (lights strobe, HUD goes red). */
export const ATTACK_STATES = ['TELEGRAPH', 'SLAM', 'PIT', 'SHUNT', 'PIN', 'BRAKECHECK', 'SHOOT', 'DRONE'];

const MOVE_LABEL = {
  SLAM: 'SIDE SLAM',
  PIT: 'PIT MANOEUVRE',
  SHUNT: 'REAR SHUNT',
  PIN: 'WALL PIN',
  BRAKECHECK: 'BRAKE CHECK',
  SHOOT: 'TYRE SHOT',
  DRONE: 'DRONE LAUNCH',
};

/** Where he sits on you between moves (see _stationSpot), as the HUD names it. */
const STATION_LABEL = {
  tail: 'TAILGATING',
  quarter: 'ON YOUR QUARTER',
  door: 'ALONGSIDE',
  ahead: 'BOXING YOU IN',
};

const _v = new THREE.Vector2();

/**
 * HandlerAI — Member 2A
 *
 * The pursuer for Level 2. Both cars are SOLID: every frame the two bodies
 * are tested as oriented boxes (separating axis test) and pushed apart, with
 * a momentum exchange, so he can bump, shove and spin you but never drive
 * through you. He is heavier than you (mass 1.6 vs 1), so his hits move you
 * more than yours move him.
 *
 * He drives like a pursuer, not like a car on a string. He reads your speed
 * with half a second's lag and has a heavy car's acceleration, so you can
 * open a gap on him, and if you brake hard he overshoots and ends up beside
 * you. Between moves he works round you, a few seconds at each spot:
 *
 *   tail      on your rear bumper, tapping it (small damage)
 *   quarter   his nose at your rear wheel, one side or the other
 *   door      door to door, leaning on you (small damage)
 *   ahead     (after ~30 s) past you and into your lane, weaving to block you
 *
 * He never drives through you to get from one to another: from behind he
 * swings out to the side first, and level with you he keeps to his own lane.
 *
 *   APPROACH   closes in from behind
 *   HARASS     the pressure between moves, at one of the spots above
 *   TELEGRAPH  lightbar strobes and the HUD names the move that's coming,
 *              while he lines up for it. Each spot has its moves:
 *     SHUNT      (tail) drops back, lines up dead behind you and charges
 *     PIT        (quarter) noses into your rear corner: the tail steps out
 *     SLAM       (door) swings out and rams your side
 *     PIN        (door, you near a rail) shoves you along it
 *     BRAKECHECK (ahead) stamps on his brakes in front of you
 *     SHOOT      (after ~18 s) drops back and shoots at your rear tyre —
 *                see HandlerWeapons.js
 *     DRONE      first at ~25 s, then about every 30 s: a spike-strip or
 *                kamikaze drone
 *   RECOVER    backs off after landing a hit
 *   DODGED     you avoided or escaped the move; he falls well back
 *
 * Counters (each move has its own):
 *   SLAM   swerve away, boost, or brake once he's locked on
 *   PIT    swerve away from him or boost — braking backs you into his nose
 *   SHUNT  change lane while he's lining up behind you, or boost
 *   PIN    brake or boost to break contact; steering alone won't beat his weight
 *   BRAKECHECK  change lane round him (braking only softens it)
 *   SHOOT  keep moving sideways: his laser sight lags behind your wheel
 *   DRONE  spikes: change lane before the strip; kamikaze: change speed or
 *          lane when its light goes solid
 *
 * He gets more aggressive over ~60 s (shorter harass, quicker wind-up,
 * harder hits) and rubber-bands back if you boost far ahead.
 *
 * Fair play:
 *   - every wind-up gives at least a full second of warning
 *   - no move starts while a fallen tree, rocks or a car is just ahead of
 *     you: you need room to dodge
 *   - giveSpace(s) after you crash into something: he backs off, cancels a
 *     move that hasn't landed, and his bumps don't hurt for a few seconds
 *   - tailgating taps and leaning on you cost 2 at most
 *   - no move while cars box you in on both sides: every counter needs a
 *     lane to move into
 *   - a hit never chains into another: after a tyre shot, a drone or a
 *     spike strip lands he gives you space too (Level02 calls giveSpace)
 *
 * Smooth driving: where he wants to be (tx, tz) is eased, not snapped, so a
 * new state, a new move or a car to steer round doesn't jerk him across the
 * road. Only the committed charges (SHUNT, BRAKECHECK) and SLAM aim directly.
 *
 * Hooks (set by Level02):
 *   onAttackResolved(hit)  a move landed     hit = { move, label, damage, impact, side }
 *   onContact(hit)         a smaller bump    hit = { damage, impact, side }
 *   onDodge(move, label)   a move missed or you broke free
 */
export class HandlerAI {
  constructor(scene, target) {
    this.target = target;

    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.65, 3.8),
      new THREE.MeshStandardMaterial({ color: 0xff5533, metalness: 0.2, roughness: 0.5, emissive: 0x220000 })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    this.mesh.add(body);
    scene.add(this.mesh);

    // starts behind the player and has to close the gap
    this.mesh.position.set(0, 0, -28);

    this.state = 'APPROACH';
    this.stateTimer = 0;
    this.elapsed = 0;

    // motion (road space: x across, z along the highway)
    this.speed = 0;
    this.latVel = 0;
    this.heading = 0;
    this.maxSpeed = 46;          // floor; really max(46, your top speed + 4) — see update()
    this.railX = 11.7;
    this.halfW = 0.95;
    this.halfL = 1.9;
    this.mass = 1.6;             // player is 1

    // tactics
    this.side = 1;               // which side of the player he works (+x / -x)
    this.station = 'tail';       // where he sits on you between moves: tail | quarter | door | ahead
    this.stationTimer = 3;       // ...until he moves round to another spot
    this.seenSpeed = 0;          // your speed as he reads it: half a second behind
    this.jabbing = false;        // tapping your bumper / leaning on your door this moment
    this.harassFor = 3;
    this.jabTimer = 1;
    this.nextMove = null;
    this.lastMove = null;
    this.locked = false;
    this.ramX = 0;
    this.ramSpeed = 0;
    this.moveLanded = false;
    this.pinContact = 0;         // seconds since he last touched you during a PIN

    // contact bookkeeping
    this.touching = false;
    this.damageCooldown = 0;
    this.harassRange = 9;        // kept for anything still reading it

    this.weapons = null;         // HandlerWeapons, set by Level02 (optional)
    this.traffic = null;         // Traffic, set by Level02 — he drives round it

    // fairness
    this.nextAttackAt = 10;      // grace period before the first move
    this.graceUntil = 0;         // giveSpace(): no moves, no damage until then
    this.obstacles = null;       // Obstacles, set by Level02: he won't attack into them
    this.avoiding = null;        // traffic car he's currently steering round

    this.onAttackResolved = null;
    this.onContact = null;
    this.onDodge = null;
  }

  /**
   * 0 at the start of the chase → 1 after ~60 s. Halved while you're badly
   * hurt, so a low health bar is a comeback window, not a death spiral.
   */
  get aggro() {
    const a = Math.min(1, this.elapsed / 60);
    return this._hurt ? a * 0.5 : a;
  }

  get _hurt() {
    return (this.target.health ?? 100) < 35;
  }

  /** Called whenever a move finishes (hit or miss): guaranteed breathing room. */
  _cooldown() {
    const gap = THREE.MathUtils.lerp(7, 4.5, this.aggro) * (this._hurt ? 1.6 : 1);
    this.nextAttackAt = this.elapsed + gap;
  }

  /** Is there traffic on that side of you, close enough to box you in? */
  _boxedIn(dir) {
    if (!this.traffic) return false;
    const p = this.target.mesh.position;
    return this.traffic.pool.some((v) => Math.abs(v.z - p.z) < 9 && (v.x - p.x) * dir > 0 && (v.x - p.x) * dir < 6);
  }

  /** Only start a move when it can be read and answered. */
  _fairToAttack() {
    if (this.passive) return false;                // the finale: he backs off near the falls
    if (this.elapsed < this.nextAttackAt) return false;
    if (this.elapsed < this.graceUntil) return false;
    if (this.weapons && this.weapons.threatActive) return false;   // one threat at a time
    if (this._hazardAhead()) return false;         // you're busy dodging the road already
    if (this._boxedIn(-1) && this._boxedIn(1)) return false;   // cars both sides: nowhere to dodge to
    return true;
  }

  /** Something solid on the road just in front of you (a tree, rocks, an animal, a car)? */
  _hazardAhead() {
    const p = this.target.mesh.position;
    const look = 25 + Math.max(0, this.target.speed) * 1.2;
    const near = (o) => o.z - p.z > -2 && o.z - p.z < look && Math.abs(o.x - p.x) < (o.halfW || 1) + 4;
    if (this.obstacles && this.obstacles.pool.some((o) => o.holder?.visible && o.state !== 'gone' && near(o))) return true;
    if (this.traffic && this.traffic.pool.some((v) => !v.parked && near(v))) return true;
    return false;
  }

  /**
   * You just crashed into something: he eases off for `seconds` — no new
   * moves, an unlanded move is called off, and contact doesn't hurt.
   */
  giveSpace(seconds = 2.5) {
    this.graceUntil = Math.max(this.graceUntil, this.elapsed + seconds);
    if (['TELEGRAPH', 'SLAM', 'PIT', 'SHUNT', 'PIN', 'BRAKECHECK', 'HARASS'].includes(this.state) && !this.moveLanded) {
      this.state = 'RECOVER';
      this.stateTimer = 0;
      this._cooldown();
    }
  }

  /** Bumps only cost health while he's actually on the attack (and not while giving you space). */
  get hostile() {
    if (this.elapsed < this.graceUntil) return false;
    return this.state === 'HARASS' || ATTACK_STATES.includes(this.state);
  }

  /** Text for the HUD: names the incoming move during the wind-up. */
  get label() {
    if (this.state === 'TELEGRAPH' && this.nextMove) return MOVE_LABEL[this.nextMove] + ' !';
    if (this.passive && this.state === 'APPROACH') return 'FALLING BACK';
    if (this.state === 'HARASS') {
      // on his way past you, not yet in front
      if (this.station === 'ahead' && this.target.mesh.position.z - this.mesh.position.z > -this.halfL) return 'OVERTAKING';
      return STATION_LABEL[this.station];
    }
    return MOVE_LABEL[this.state] || this.state;
  }

  attachModel(assets, path, options = {}) {
    return attachVehicleModel(assets, this.mesh, path, { length: 4.6, ...options }).then((model) => {
      const b = model && model.userData.bounds;
      if (b) {
        this.halfW = (b.max.x - b.min.x) / 2;
        this.halfL = (b.max.z - b.min.z) / 2;
      }
      if (model) this.model = model;
      return model;
    });
  }

  _enter(state) {
    if (['RECOVER', 'DODGED'].includes(state) || (['SHOOT', 'DRONE'].includes(this.state) && state === 'APPROACH')) {
      this._cooldown();
    }
    this.state = state;
    this.stateTimer = 0;
  }

  _carHalf() {
    const b = this.target.bounds;
    // Level02 stores slightly shrunk bounds for traffic; use the full body here
    return b ? { w: b.halfW / 0.9, l: b.halfL / 0.92 } : { w: 0.9, l: 1.8 };
  }

  /** The move that fits where he is on you. */
  _chooseMove() {
    const p = this.target.mesh.position;
    // drones are the showpiece: the first one ~25 s in, then about every 30 s
    if (this.weapons && this.elapsed > 25 && this.weapons.canLaunchDrone()
        && this.elapsed - (this.lastDroneAt ?? -Infinity) > 30) {
      return 'DRONE';
    }
    let options;
    if (this.station === 'ahead') options = ['BRAKECHECK'];
    else if (this.station === 'door') {
      // the pin needs a rail on your far side to shove you along
      const nearRail = Math.abs(p.x) > this.railX - 6 && Math.sign(p.x) === -this.side;
      options = nearRail ? ['PIN', 'SLAM'] : ['SLAM', 'SLAM'];
    } else if (this.station === 'quarter') options = ['PIT', 'PIT'];
    else {
      options = ['SHUNT', 'SHUNT'];
      // ranged attacks unlock as the chase goes on, and come up more often later
      if (this.weapons && this.elapsed > 18) options.push('SHOOT');
      if (this.weapons && this.elapsed > 25 && this.weapons.canLaunchDrone()) options.push('DRONE');
    }
    const pool = options.filter((m) => m !== this.lastMove);
    const from = pool.length ? pool : options;
    return from[Math.floor(Math.random() * from.length)];
  }

  /** Clear road beside you on that side, rail to your door. */
  _room(dir) {
    const p = this.target.mesh.position;
    return this.railX - this.halfW - dir * p.x - this._carHalf().w;
  }

  /**
   * Moves round to another spot on you: more often up your side the longer the
   * chase goes on, and past you only from alongside. From behind he takes the
   * side with more road; level with you or in front, he stays on his own.
   */
  _nextStation() {
    const a = this.aggro;
    const e = this.elapsed;
    const from = this.station;
    const late = e > 25;
    const w = {
      tail: from === 'tail' ? 0.4 : 0.7,
      quarter: from === 'quarter' ? 0.4 : 1.6,
      door: e > 10 ? (from === 'door' ? 0.5 : 1.5 + a) : 0,
      // past you: only from beside you, once the chase has gone on a while
      ahead: !late ? 0 : from === 'door' ? 0.9 + a : from === 'quarter' ? 0.4 + 0.6 * a : 0,
    };
    if (from === 'ahead') { w.ahead = 0; w.tail = 1; w.quarter = 0.8; w.door = 0.6; } // he's had his go in front
    let r = Math.random() * (w.tail + w.quarter + w.door + w.ahead);
    let next = 'tail';
    for (const k of ['tail', 'quarter', 'door', 'ahead']) {
      if ((r -= w[k]) < 0) { next = k; break; }
    }
    const behind = this.target.mesh.position.z - this.mesh.position.z > this.halfL + this._carHalf().l + 0.6;
    if (next !== 'tail' && behind) {
      const more = this._room(1) >= this._room(-1) ? 1 : -1;
      this.side = Math.random() < 0.75 ? more : -more;
      if (this._room(this.side) < 1.2) this.side = -this.side;
      if (this._room(this.side) < 1.2) next = 'tail';      // no room either side: stay on your bumper
    }
    this.station = next;
    this.stationTimer = (2.6 + Math.random() * 2.2) * (1 - 0.3 * a);
  }

  /**
   * Where he sits at a spot, and where he leans in to when he's jabbing: on
   * your rear bumper, beside your rear wheel, door to door, or in front of you.
   * `surge` keeps the gap breathing; nobody holds one to the inch.
   */
  _stationSpot(p, GAP, LEN, behind, ahead, surge) {
    const s = this.side;
    const jab = this.jabbing;
    switch (this.station) {
      case 'quarter':
        return { tx: p.x + s * (GAP + (jab ? 0.15 : 0.6)), tz: p.z - LEN * 0.8 + surge * 0.5 };
      case 'door':
        return { tx: p.x + s * (GAP + (jab ? -0.35 : 0.7)), tz: p.z - 0.3 + surge * 0.6 };
      case 'ahead':
        // past you on his own side first, then into your lane, following you across it
        return { tx: ahead ? p.x : p.x + s * (GAP + 0.9), tz: p.z + LEN + 5 + surge };
      default:
        return {
          tx: behind ? p.x : p.x + s * (GAP + 0.8),
          tz: jab ? p.z - LEN + (this._hurt ? 0.2 : 0.6) : p.z - LEN - 1.3 + surge * 0.6,
        };
    }
  }

  update(dt) {
    const car = this.target;
    const p = car.mesh.position;
    const m = this.mesh.position;
    this.elapsed += dt;
    this.stateTimer += dt;

    // a drone or spike strip finishing counts as a move finishing: breathing room after it too
    const threat = !!(this.weapons && this.weapons.threatActive);
    if (this._threatWas && !threat) this._cooldown();
    this._threatWas = threat;
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);

    this._dt = dt;
    const a = this.aggro;
    const half = this._carHalf();
    const GAP = half.w + this.halfW;      // centre-to-centre when doors touch
    const LEN = half.l + this.halfL;      // centre-to-centre when bumpers touch
    const dz = p.z - m.z;                 // >0: player is ahead of him
    const dist = Math.hypot(p.x - m.x, dz);

    // your speed as he sees it: he reacts to a change half a second late, so
    // when you stamp on the brakes he overshoots, and when you floor it you pull away
    this.seenSpeed += (car.speed - this.seenSpeed) * (1 - Math.exp(-dt / 0.45));

    // Level with you (you braked, he overshot, or he's come up alongside) he
    // keeps to his own lane, and in front of you he stays out of yours until
    // he's well clear: he never cuts across you to get somewhere.
    const behind = dz > LEN + 0.6;
    const ahead = dz < -(LEN + 0.6);
    if (!behind && !(ahead && this.station === 'ahead')) this.side = Math.sign(m.x - p.x) || this.side;
    const laneBehind = () => (behind ? p.x : p.x + this.side * (GAP + 0.8));
    const surge = Math.sin(this.elapsed * 1.3) * 0.7 + Math.sin(this.elapsed * 0.53 + 1) * 0.5;

    // ---------- where he wants to be ----------
    let tx = p.x + this.side * (GAP + 1.5);
    let tz = p.z - LEN - 4;
    let maxLat = 6;
    let fixedSpeed = null;                // set when he commits to a speed
    let accel = 14;                       // a heavy car: you out-accelerate him
    let decel = 30;
    let keepClear = true;                 // don't aim through the player unless attacking

    switch (this.state) {
      case 'APPROACH': {
        tx = laneBehind();
        tz = p.z - LEN - 2.5;
        if (this.passive) { tz = p.z - LEN - 32; break; }   // he knows what's ahead, and lets you go
        const caughtUp = behind && Math.abs(tz - m.z) < 3 && Math.abs(m.x - p.x) < GAP;
        const besideYou = !behind && !ahead && Math.abs(m.x - p.x) > GAP - 0.2 && this.elapsed > 10;
        if (caughtUp || besideYou) {
          this.harassFor = THREE.MathUtils.lerp(4, 2.2, a) + Math.random() * 1.2;
          this.jabTimer = 0.6 + Math.random() * 0.6;
          if (besideYou) {
            this.station = 'door';                        // you braked and he's come up level: he stays there
            this.stationTimer = 1.5 + Math.random() * 1.5;
          } else {
            this.station = 'tail';
            this._nextStation();                          // on your bumper, and on round you from there
          }
          this._enter('HARASS');
        }
        break;
      }

      case 'HARASS': {
        // THE PRESSURE between moves, at one spot on you for a few seconds and
        // then round to another; at the tail and the door he leans in every
        // second or so (a tap on the bumper, a shove on the door: small damage)
        const t = this.stateTimer;
        // squeezed against the rail on his side: he goes round the back to the other
        if (this.station !== 'tail' && behind && this._room(this.side) < 0.6) this.side = -this.side;
        ({ tx, tz } = this._stationSpot(p, GAP, LEN, behind, ahead, surge));
        // from right behind you to your side: out of your lane first, then up
        const sideways = this.station === 'quarter' || this.station === 'door';
        if (sideways && behind && Math.abs(m.x - p.x) < GAP - 0.1) tz = Math.min(tz, p.z - LEN - 1.2);
        const atSpot = Math.abs(m.x - tx) < 1.6 && Math.abs(m.z - tz) < 3.5;
        const settled = this.station !== 'ahead' || ahead;
        // a few seconds AT each spot: getting there doesn't count for much
        this.stationTimer -= dt * (atSpot && settled ? 1 : 0.3);
        if (this.stationTimer <= 0) this._nextStation();
        // a tap on the bumper is quick; a shove on the door takes him a moment to swing in
        this.jabTimer -= dt;
        this.jabbing = atSpot && this.jabTimer < 0 && (this.station === 'tail' || this.station === 'door');
        if (this.jabTimer < (this.station === 'door' ? -0.7 : -0.35)) this.jabTimer = THREE.MathUtils.lerp(1.6, 1.0, a) + Math.random() * 0.5;
        accel = this.jabbing ? 20 : 14;
        keepClear = !this.jabbing && this.station !== 'tail';
        if (this.station === 'ahead' && ahead) keepClear = false;
        if (dz > 25 || this.passive) this._enter('APPROACH');
        else if (t > this.harassFor && atSpot && settled && this._fairToAttack()) {
          this.nextMove = this._chooseMove();
          this.locked = false;
          this.moveLanded = false;
          this._enter('TELEGRAPH');
        }
        break;
      }

      case 'TELEGRAPH': {
        const windUp = THREE.MathUtils.lerp(1.4, 1.05, a);   // never less than a second of warning
        const tell = 0.35;                // he holds still for this long before going
        const move = this.nextMove;
        if (move === 'SLAM') {
          tx = p.x + this.side * (GAP + 2.4);
          tz = p.z;
          if (!this.locked && this.stateTimer > windUp - tell) {
            this.locked = true;
            this.ramX = p.x;              // commits to where you are...
            this.ramSpeed = car.speed;    // ...and how fast you're going
          }
          if (this.locked) { tx = m.x; fixedSpeed = this.ramSpeed; this.latVel *= Math.exp(-12 * dt); }
        } else if (move === 'PIT') {
          tx = p.x + this.side * (GAP + 0.5);
          tz = p.z - LEN * 0.75;          // tucked in at your rear quarter
        } else if (move === 'SHUNT') {
          // drops back, lines up dead behind you, revs — then charges
          tz = p.z - LEN - 7;
          tx = laneBehind();
        } else if (move === 'PIN') {
          tx = p.x + this.side * (GAP + 0.3);
          tz = p.z;
        } else if (move === 'BRAKECHECK') {
          // squarely in your lane, a few lengths ahead, brake lights about to go
          tx = p.x;
          tz = p.z + LEN + 6;
          keepClear = false;
        } else if (move === 'SHOOT' || move === 'DRONE') {
          // falls back to a firing position behind you, a little to one side
          tx = behind ? p.x + this.side * 1.6 : laneBehind();
          tz = p.z - 10;
        }
        maxLat = 5;
        if (this.stateTimer > windUp) {
          this.locked = false;
          this.moveLanded = false;
          this.pinContact = 0;
          this.lastMove = move;
          this._enter(move);
          if (move === 'SHOOT') this.weapons.startTyreShot(a);
          if (move === 'DRONE') {
            this.lastDroneAt = this.elapsed;
            this.weapons.launchDrone(m, Math.random() < 0.5 ? 'spikes' : 'kamikaze');
          }
        }
        break;
      }

      case 'SLAM':
        tx = this.ramX - this.side * 0.6;     // aim through the locked spot
        tz = m.z;
        fixedSpeed = this.ramSpeed;
        maxLat = 11 + 4 * a;
        keepClear = false;
        if (this.moveLanded) this._enter('RECOVER');
        else if (this.stateTimer > 0.6) this._miss();
        break;

      case 'PIT':
        tx = p.x + this.side * (GAP - 1.1);   // nose into the rear corner
        tz = p.z - LEN * 0.6;
        maxLat = 8;
        accel = 14;
        decel = 14;                           // brake hard and he overshoots
        keepClear = false;
        if (this.moveLanded) this._enter('RECOVER');
        else if (this.stateTimer > 0.8) this._miss();
        break;

      case 'SHUNT':
        // he commits to the lane you were in when he launched: change lane
        // (or boost away) and he thunders past / falls short
        if (this.stateTimer < dt * 1.5) this.ramX = p.x;
        tx = this.ramX;
        fixedSpeed = car.speed + 9 + 3 * a;   // closes on your bumper
        maxLat = 2;
        accel = 22;
        keepClear = false;
        if (this.moveLanded) this._enter('RECOVER');
        else if (this.stateTimer > 1.4 || (dz < -LEN && Math.abs(p.x - m.x) > GAP)) this._miss();
        break;

      case 'BRAKECHECK':
        // he stamps on the brakes in front of you: go round him, or you're into his tailgate
        if (this.stateTimer < dt * 1.5) this.ramX = m.x;
        tx = this.ramX;
        fixedSpeed = Math.max(0, car.speed - (10 + 4 * a));
        decel = 34;
        maxLat = 1.5;
        keepClear = false;
        if (this.moveLanded) this._enter('RECOVER');
        else if (this.stateTimer > 1.6 || dz > LEN + 0.5) this._miss();   // you're past him
        break;

      case 'PIN':
        // keep shoving towards the rail; you break free by braking or boosting
        tx = p.x - this.side * 1.2;
        tz = p.z;
        maxLat = 4.5;
        accel = 10 + 4 * a;                   // slow to match speed: that's your way out
        keepClear = false;
        this.pinContact = this.touching ? 0 : this.pinContact + dt;
        if (this.stateTimer > 2.2 + a) this._enter('RECOVER');
        else if (this.stateTimer > 0.5 && this.pinContact > 0.5) this._miss();
        break;

      case 'SHOOT':
        // holds his firing position behind you while the sight tracks you
        tx = behind ? p.x + this.side * 1.6 : laneBehind();
        tz = p.z - 10;
        if (!this.weapons.busy) this._enter('APPROACH');
        break;

      case 'DRONE':
        tx = laneBehind();
        tz = p.z - 12;
        if (this.stateTimer > 1) this._enter('APPROACH');
        break;

      case 'DODGED':
        tx = laneBehind();
        tz = p.z - 13;
        if (this.stateTimer > 1.5) this._enter('APPROACH');
        break;

      case 'RECOVER':
        tx = laneBehind();
        tz = p.z - LEN - 6;
        if (this.stateTimer > 1.3 && this.elapsed >= this.graceUntil) this._enter('APPROACH');
        break;
    }

    // giving you space: hang well back whatever else he was doing
    if (this.elapsed < this.graceUntil && !this.passive) { tz = Math.min(tz, p.z - LEN - 12); tx = laneBehind(); }

    // ---------- ease the targets ----------
    // a committed charge aims straight; everything else glides to its new spot
    const direct = ['SHUNT', 'SLAM', 'BRAKECHECK'].includes(this.state);
    if (this._tx === undefined || direct) { this._tx = tx; this._tzOff = tz - p.z; }
    else {
      const k = 1 - Math.exp(-dt * (this.state === 'HARASS' ? 5 : 3.5));
      this._tx += (tx - this._tx) * k;
      this._tzOff += (tz - p.z - this._tzOff) * (1 - Math.exp(-dt * 4.5));
      tx = this._tx;
      tz = p.z + this._tzOff;
    }

    // never plan a path through the car while level with it
    if (keepClear && Math.abs(dz) < LEN + 0.5) {
      tx = this.side > 0 ? Math.max(tx, p.x + GAP + 0.25) : Math.min(tx, p.x - GAP - 0.25);
    }

    // ---------- weave through traffic ----------
    let trafficCap = Infinity;
    const avoid = this._avoidTraffic(tx);
    if (avoid) {
      if (avoid.x !== null) { tx = avoid.x; maxLat = Math.max(maxLat, 7); }
      else trafficCap = avoid.speed;                     // both sides shut: tuck in behind it
      // an attack that would have to go through a car is called off
      if (avoid.close && ['SLAM', 'PIT', 'SHUNT', 'PIN', 'BRAKECHECK'].includes(this.state) && !this.moveLanded) this._miss();
    }

    // ---------- drive there ----------
    // his top speed follows your car: enough above your normal top speed that he
    // can come up your side and get past you, more when he's fallen back, but
    // always short of your boosted speed, so boost is a real escape
    const yourTop = car.maxSpeed || 42;
    const baseTop = Math.max(this.maxSpeed, yourTop + 6);
    const topSpeed = Math.min(baseTop + THREE.MathUtils.clamp((dz - 8) * 0.35, 0, 8), yourTop * 1.25 - 2);
    const desired = fixedSpeed !== null
      ? fixedSpeed
      : THREE.MathUtils.clamp(this.seenSpeed + THREE.MathUtils.clamp((tz - m.z) * 1.2, -12, 12), 0, topSpeed);
    this.speed += THREE.MathUtils.clamp(Math.min(desired, trafficCap) - this.speed, -decel * dt, accel * dt);

    // a car can only go sideways as fast as its speed lets it turn
    if (this.state !== 'SLAM') maxLat = Math.min(maxLat, 0.5 * Math.max(6, this.speed));
    const wantLat = THREE.MathUtils.clamp((tx - m.x) * (direct ? 3 : 2.2), -maxLat, maxLat);
    const latAccel = this.state === 'SLAM' ? 60 : direct ? 24 : 16;
    this.latVel += THREE.MathUtils.clamp(wantLat - this.latVel, -latAccel * dt, latAccel * dt);

    m.z += this.speed * dt;
    m.x += this.latVel * dt;
    const lim = this.railX - this.halfW;
    if (Math.abs(m.x) > lim) { m.x = Math.sign(m.x) * lim; this.latVel = 0; }

    // body follows his actual direction of travel
    const h = THREE.MathUtils.clamp(Math.atan2(this.latVel, Math.max(4, this.speed)), -0.45, 0.45);
    this.heading += (h - this.heading) * Math.min(1, 10 * dt);
    this.mesh.rotation.y = this.heading;
    spinWheels(this.model, this.speed, THREE.MathUtils.clamp(this.latVel / 6, -1, 1), dt);

    // ---------- solid contact ----------
    this.touching = false;
    for (let k = 0; k < 2; k++) {
      const c = this._solve(car, half);
      if (!c) break;
      this.touching = true;
      if (k === 0) this._react(car, c);
    }

    return { dist, state: this.state };
  }

  /**
   * Looks down the road for traffic in the corridor he's about to drive
   * through. Returns null (clear), { x } (steer to this x to pass it), or
   * { x: null, speed } (no gap either side — slow to its speed).
   */
  _avoidTraffic(tx) {
    if (!this.traffic) return null;
    const m = this.mesh.position;
    const look = 8 + Math.max(0, this.speed) * 0.6;
    const pad = 0.5;
    let blocker = null, bestDz = Infinity;
    for (const v of this.traffic.pool) {
      const vz = v.z - m.z;
      if (vz < -1 || vz > look) continue;
      const reach = this.halfW + v.halfW + pad;
      const lo = Math.min(m.x, tx) - reach, hi = Math.max(m.x, tx) + reach;
      if (v.x > lo && v.x < hi && vz < bestDz) { blocker = v; bestDz = vz; }
    }
    this.avoiding = blocker;
    if (!blocker) return null;

    const clear = this.halfW + blocker.halfW + 0.9;
    const lim = this.railX - this.halfW - 0.2;
    const free = (x) => Math.abs(x) < lim && !this.traffic.pool.some((w) => w !== blocker
      && Math.abs(w.z - blocker.z) < w.halfL + this.halfL + 4
      && Math.abs(w.x - x) < w.halfW + this.halfW + pad);
    const options = [blocker.x - clear, blocker.x + clear].filter(free);
    const close = bestDz < blocker.halfL + this.halfL + 4;
    if (!options.length) return { x: null, speed: blocker.speed, close };
    options.sort((a, b) => Math.abs(a - tx) - Math.abs(b - tx));
    return { x: options[0], close };
  }

  _miss() {
    const move = this.state;
    this.speed *= move === 'SLAM' ? 0.6 : 0.8;
    this.latVel *= 0.3;
    this._enter('DODGED');
    if (this.onDodge) this.onDodge(move, move === 'PIN' ? 'BROKE FREE' : 'DODGED');
  }

  /**
   * Oriented-box contact between the player (A) and the Handler (B).
   * Separates them completely, exchanges momentum and returns the contact,
   * or null when they don't touch.
   */
  _solve(car, half) {
    const p = car.mesh.position, m = this.mesh.position;
    const hA = car.heading, hB = this.heading;
    const axes = [
      [Math.cos(hA), -Math.sin(hA)], [Math.sin(hA), Math.cos(hA)],   // A right, A forward
      [Math.cos(hB), -Math.sin(hB)], [Math.sin(hB), Math.cos(hB)],   // B right, B forward
    ];
    const dx = m.x - p.x, dz = m.z - p.z;

    let depth = Infinity, nx = 0, nz = 0;
    for (const [ax, az] of axes) {
      const rA = half.w * Math.abs(axes[0][0] * ax + axes[0][1] * az) + half.l * Math.abs(axes[1][0] * ax + axes[1][1] * az);
      const rB = this.halfW * Math.abs(axes[2][0] * ax + axes[2][1] * az) + this.halfL * Math.abs(axes[3][0] * ax + axes[3][1] * az);
      const d = dx * ax + dz * az;
      const o = rA + rB - Math.abs(d);
      if (o <= 0) return null;                 // a separating axis: not touching
      if (o < depth) { depth = o; const s = d >= 0 ? 1 : -1; nx = ax * s; nz = az * s; }
    }
    // n points from the player towards the Handler

    // --- push apart, heavier car moves less ---
    const carMass = car.mass || 1;
    const share = this.mass / (carMass + this.mass);   // the player's share
    p.x -= nx * depth * share;  p.z -= nz * depth * share;
    m.x += nx * depth * (1 - share);  m.z += nz * depth * (1 - share);

    // the rail doesn't move: if you're squeezed against it, he gets pushed back instead
    const limA = car.railX - half.w;
    if (Math.abs(p.x) > limA) {
      const over = Math.abs(p.x) - limA;
      p.x = Math.sign(p.x) * limA;
      m.x -= Math.sign(p.x) * over;
      car.wallHit = Math.max(car.wallHit || 0, 0.38);   // grinding along the rail
    }

    // --- momentum exchange along the normal ---
    const vAx = Math.sin(hA) * car.speed + (car.lateralVel || 0);
    const vAz = Math.cos(hA) * car.speed;
    const vBx = this.latVel, vBz = this.speed;
    const vn = (vBx - vAx) * nx + (vBz - vAz) * nz;   // < 0: closing
    let j = 0;
    if (vn < 0) {
      const e = 0.25;                                  // a little bounce
      j = -(1 + e) * vn / (1 / carMass + 1 / this.mass);
      const dAx = -j * nx / carMass, dAz = -j * nz / carMass;   // player Δv
      car.lateralVel = (car.lateralVel || 0) + dAx;
      car.speed += dAz;
      this.latVel += (j / this.mass) * nx;
      this.speed += (j / this.mass) * nz;

      // spin: a push off the car's centre turns it (hit the back, the tail swings)
      const lx = Math.max(-half.w, Math.min(half.w, dx * Math.cos(hA) - dz * Math.sin(hA)));
      const lz = Math.max(-half.l, Math.min(half.l, dx * Math.sin(hA) + dz * Math.cos(hA)));
      car.yawVel = (car.yawVel || 0) + 0.11 * (lz * dAx - lx * dAz);
    }

    _v.set(dx * Math.cos(hA) - dz * Math.sin(hA), dx * Math.sin(hA) + dz * Math.cos(hA));
    return { depth, nx, nz, impulse: j, localX: _v.x, localZ: _v.y, half };
  }

  /** Turns a contact into gameplay: damage, move resolution, callbacks. */
  _react(car, c) {
    const side = Math.sign(this.mesh.position.x - car.mesh.position.x) || this.side;
    const move = this.state;
    const attacking = ['SLAM', 'PIT', 'SHUNT', 'PIN', 'BRAKECHECK'].includes(move);

    if (attacking && !this.moveLanded) {
      // the move connects. A pin has to hold you against him for a moment
      // first: braking or boosting out of it in that time beats it
      if (move === 'PIN') {
        this.pinHeld = (this.stateTimer < 0.1 ? 0 : this.pinHeld || 0) + (this._dt || 0);
        if (this.pinHeld < 0.5) return;
      }
      const rear = c.localZ < -c.half.l * 0.3;
      const ok = move === 'SLAM' || move === 'PIN'
        || (move === 'PIT' && rear)
        || (move === 'SHUNT' && c.localZ < 0)
        || (move === 'BRAKECHECK' && c.localZ > c.half.l * 0.3);   // your nose into his tailgate
      if (!ok) return;
      this.moveLanded = true;
      const a = this.aggro;
      let damage = 8, impact = 0.6;
      if (move === 'SLAM') {
        car.bump(-side, 0.6, 0.1);
        damage = Math.round(8 + 4 * a + Math.min(2, c.impulse * 0.25));
        impact = Math.min(1, 0.55 + c.impulse / 12);
      } else if (move === 'PIT') {
        // rear tapped sideways: the tail steps out and the car fishtails
        car.yawVel = (car.yawVel || 0) + side * (1.4 + 0.6 * a);
        car.speed *= 0.82;
        damage = Math.round(7 + 4 * a);
        impact = 0.7;
      } else if (move === 'SHUNT') {
        car.yawVel = (car.yawVel || 0) + (Math.random() < 0.5 ? -1 : 1) * 0.7;
        damage = Math.round(7 + 4 * a + Math.min(2, c.impulse * 0.2));
        impact = Math.min(1, 0.5 + c.impulse / 15);
      } else if (move === 'PIN') {
        damage = Math.round(5 + 3 * a);
        impact = 0.5;
      } else if (move === 'BRAKECHECK') {
        // you ran into the back of him: the nose crumples, and you lose the speed you had
        car.speed *= 0.72;
        car.yawVel = (car.yawVel || 0) + (Math.random() < 0.5 ? -1 : 1) * 0.5;
        damage = Math.round(7 + 4 * a + Math.min(2, c.impulse * 0.2));
        impact = Math.min(1, 0.55 + c.impulse / 14);
      }
      this.damageCooldown = 0.5;
      if (this.onAttackResolved) {
        this.onAttackResolved({ move, label: MOVE_LABEL[move], damage, impact, side });
      }
      return;
    }

    // smaller bumps: his taps on your bumper and his shoves on your door cost
    // health; a scrape you steered into (or anything you did to him) is just physics
    const tapping = this.station === 'tail' && c.localZ < -c.half.l * 0.4;
    const leaning = this.station === 'door' && Math.sign(this.latVel) === -side && Math.abs(this.latVel) > 0.8;
    const his = this.state === 'HARASS' && this.jabbing && (tapping || leaning);
    if (this.damageCooldown === 0 && this.hostile && his && c.impulse > 1.2 && !this._hurt) {
      this.damageCooldown = 0.9;
      const damage = Math.min(2, Math.max(1, Math.round(c.impulse * 0.3)));
      if (this.onContact) this.onContact({ damage, impact: Math.min(0.6, 0.15 + c.impulse / 12), side });
    }
  }
}
