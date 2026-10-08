import * as THREE from 'three';

/**
 * FootPlant — the walk clip is authored on flat ground; this stands each foot
 * on the ground under it instead, so Kai steps up out of the pool onto the
 * path's slab like a person: the leading knee comes up and that foot lands on
 * top, he rises onto it as his weight comes over it, and the back foot follows.
 *
 * Each foot is moved up or down by how far its own ground is from the floor
 * the body walks on, with two-bone IK (hip, knee, ankle; the knee bent the way
 * he faces) and the foot kept at the clip's angle. A foot only changes height
 * while it's in the air, looking ahead to where it's going so the toes clear
 * the edge (lifted a little extra on the way up); the body's height follows
 * the feet it's standing on, the chest leaning forward while there's height
 * still to gain.
 *
 *   fighter.feet.start(groundY)   // groundY(x, z): the height of the ground there
 *   fighter.feet.stop()           // eases back to the clip (stop(true): at once)
 *
 * While it's on it sets root.position.y. Fighter.update() calls apply() right
 * after the mixer.
 */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _h = new THREE.Vector3();
const _k = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qf = new THREE.Quaternion();

// measured on the Mixamo Kai standing: the ankle joint, the ball of the foot and the toe tips above the sole
const ANKLE = 0.14;
const BALL = 0.02;
const TOE = 0.02;
const SOLE = [-0.05, 0.06, 0.17]; // heel, middle, ball of the foot: metres ahead of the ankle
const TIP = 0.22; // the tips of the toes, ahead of the ankle
// a foot in the air starts rising to a step up when its toes are LOOK short of it, and is up (plus
// CLEAR, to get them over the edge) by READY short of it, however fast the clip is swinging it
const LOOK = 0.5;
const READY = 0.1;
const CLEAR = 0.05;
const LEAN = 0.28; // radians forward, at most, going up a step: Spine takes 60%, Spine1 the rest

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export class FootPlant {
  /** null unless the fighter has the Mixamo legs. */
  static for(fighter) {
    const b = (n) => fighter.bones['mixamorig' + n];
    const leg = (s) => b(s + 'UpLeg') && b(s + 'Leg') && b(s + 'Foot') && b(s + 'ToeBase') && b(s + 'Toe_End')
      && { up: b(s + 'UpLeg'), lo: b(s + 'Leg'), foot: b(s + 'Foot'), ball: b(s + 'ToeBase'), tip: b(s + 'Toe_End') };
    const L = leg('Left'), R = leg('Right');
    return L && R ? new FootPlant(fighter, L, R, [b('Spine'), b('Spine1')].filter(Boolean)) : null;
  }

  constructor(fighter, L, R, spine) {
    this.f = fighter;
    this.spine = spine;
    this.lean = 0;
    this.left = new THREE.Vector3();
    this.legs = [L, R].map((l) => ({
      ...l, ground: 0, lift: 0, planted: 1, prev: new THREE.Vector3(), // the clip's ankle last frame
      was: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()], // the clip's pose, to blend the solve over
    }));
    this.groundY = null;
    this.amp = 0; // eased 0..1: the IK fades in and out with it
    this.bodyY = 0;
    this._bodyTarget = 0; // the height of the ground under the feet he's standing on
    this.fwd = new THREE.Vector3();
  }

  get active() {
    return this.groundY !== null;
  }

  /** From the feet where the clip has them (on the ground they're on), so it starts at full strength. */
  start(groundY) {
    this.groundY = groundY;
    this._fresh = true;
    this.amp = 1;
  }

  /** now: no easing out (e.g. he's being moved somewhere else). */
  stop(now = false) {
    this.groundY = null;
    if (now) this.amp = 0;
  }

  /** The highest ground under the sole of a foot whose ankle is at (x, z). */
  _under(x, z) {
    let y = -Infinity;
    for (const s of SOLE) y = Math.max(y, this.groundY(x + this.fwd.x * s, z + this.fwd.z * s));
    return y;
  }

  /** The first step up within LOOK of the toes of a foot at (x, z): how far off it is (this._dist) and its top (this._top). */
  _stepAhead(x, z, under) {
    for (let s = 0; s <= LOOK + 1e-6; s += 0.05) {
      const y = this.groundY(x + this.fwd.x * (TIP + s), z + this.fwd.z * (TIP + s));
      if (y > under + 0.05) {
        this._dist = s;
        this._top = y;
        return true;
      }
    }
    return false;
  }

  /** Called by Fighter.update() after the mixer has posed the body. */
  apply(dt) {
    const on = this.groundY !== null;
    this.amp += ((on ? 1 : 0) - this.amp) * (1 - Math.exp(-10 * dt));
    if (!on && this.amp < 0.003) {
      this.amp = this.lean = 0;
      return;
    }
    const root = this.f.root;
    const h = root.rotation.y;
    this.fwd.set(Math.sin(h), 0, Math.cos(h));
    root.updateMatrixWorld(true);

    if (on) {
      if (this._fresh) {
        this._fresh = false;
        this.bodyY = this._bodyTarget = root.position.y;
        for (const l of this.legs) {
          l.foot.getWorldPosition(l.prev);
          l.ground = this._under(l.prev.x, l.prev.z);
          l.lift = 0;
        }
      }
      // which feet the clip has on the ground, and the ground each one is on (or heading for). A walk
      // swings a foot only a few cm clear of the floor, so a foot on its way is told by its speed too
      let sum = 0, wsum = 0;
      for (const l of this.legs) {
        l.foot.getWorldPosition(_a);
        l.ball.getWorldPosition(_b);
        const clear = Math.min(_a.y - root.position.y - ANKLE, _b.y - root.position.y - BALL);
        const speed = dt > 0 ? _e.copy(_a).sub(l.prev).setY(0).length() / dt : 0;
        l.prev.copy(_a);
        // (moving with the toes just off the floor: on its way. Sliding flat, as the clip fades in: still down)
        l.planted = 1 - Math.max(smooth(0.02, 0.07, clear), smooth(0.6, 1.2, speed) * smooth(0, 0.015, clear));
        const under = this._under(_a.x, _a.z);
        let lift = 0;
        if (l.planted < 0.5) {
          let target = under;
          if (this._stepAhead(_a.x, _a.z, under)) {
            const k = smooth(LOOK, READY, this._dist);
            target += (this._top - under) * k;
            lift = CLEAR * k;
          }
          l.ground += (target - l.ground) * (1 - Math.exp(-40 * dt));
        } else {
          l.ground += (under - l.ground) * (1 - Math.exp(-25 * dt));
        }
        l.lift += (lift - l.lift) * (1 - Math.exp(-15 * dt));
        sum += l.ground * l.planted;
        wsum += l.planted;
      }
      // the body rises (or drops) onto the feet it's standing on, as the weight comes over them
      if (wsum > 0.05) this._bodyTarget = sum / wsum;
      this.bodyY += (this._bodyTarget - this.bodyY) * (1 - Math.exp(-7 * dt));
      root.position.y = this.bodyY;
      root.updateMatrixWorld(true);
    }

    for (const l of this.legs) {
      // the clip's foot, moved onto its own ground (and a little higher while it clears an edge)
      let shift = l.ground - this.bodyY + l.lift;
      // ...and in the air, never through what's under its toes: just off a walk's toe-off they point
      // down, well below the ankle, and that's what would catch the edge
      if (on && l.planted < 0.5) shift = Math.max(shift, this._toClear(l.ball, BALL), this._toClear(l.tip, TOE));
      l.foot.getWorldPosition(_t);
      _t.y += shift;
      this._reach(l, _t, this.amp);
    }

    // leaning into a step up: the chest comes forward over the front foot while there's height still to gain
    const climb = on ? Math.max(this.legs[0].ground, this.legs[1].ground) - this.bodyY : 0;
    this.lean += (LEAN * clamp01(climb / 0.3) - this.lean) * (1 - Math.exp(-8 * dt));
    if (this.lean * this.amp > 0.002) {
      this.left.set(Math.cos(h), 0, -Math.sin(h));
      for (let i = 0; i < this.spine.length; i++) this._turn(this.spine[i], this.left, this.lean * this.amp * (i ? 0.4 : 0.6));
    }
  }

  /** How far a foot bone (`sole` above the bottom of the foot) has to go up to be 1 cm clear of the ground under it. */
  _toClear(bone, sole) {
    bone.getWorldPosition(_b);
    return this.groundY(_b.x, _b.z) + sole + 0.01 - _b.y;
  }

  /** Rotate a bone by `angle` about a world axis, on top of its pose. */
  _turn(bone, axis, angle) {
    this.f._stash(bone);
    _q.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_qa).premultiply(_q);
    bone.parent.getWorldQuaternion(_qp);
    bone.quaternion.copy(_qp.invert().multiply(_qa));
    bone.updateMatrixWorld(true);
  }

  /** Two-bone IK: the ankle to T, the knee bent forward, the foot at the clip's angle; blended in by w. */
  _reach(l, T, w) {
    if (w < 0.002) return;
    const { up, lo, foot, was } = l;
    for (const b of [up, lo, foot]) this.f._stash(b);
    was[0].copy(up.quaternion);
    was[1].copy(lo.quaternion);
    was[2].copy(foot.quaternion);
    foot.getWorldQuaternion(_qf);

    const H = up.getWorldPosition(_h);
    const K = lo.getWorldPosition(_k);
    const A = foot.getWorldPosition(_a);
    const a = K.distanceTo(H), b = A.distanceTo(K);
    const dir = _d.copy(T).sub(H);
    const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, dir.length()));
    dir.normalize();
    const cos = (a * a + d * d - b * b) / (2 * a * d);
    const pole = _p.copy(this.fwd).addScaledVector(dir, -this.fwd.dot(dir)).normalize();
    const knee = _b.copy(H).addScaledVector(dir, a * cos).addScaledVector(pole, a * Math.sqrt(Math.max(0, 1 - cos * cos)));
    this._swing(up, _e.copy(K).sub(H), knee.sub(H));
    lo.getWorldPosition(K);
    foot.getWorldPosition(A);
    this._swing(lo, _e.copy(A).sub(K), _t.copy(H).addScaledVector(dir, d).sub(K));
    // the foot keeps the angle the clip gives it: flat when it's down, toes up as it lands
    foot.parent.getWorldQuaternion(_qp);
    foot.quaternion.copy(_qp.invert().multiply(_qf));

    up.quaternion.copy(was[0].slerp(up.quaternion, w));
    lo.quaternion.copy(was[1].slerp(lo.quaternion, w));
    foot.quaternion.copy(was[2].slerp(foot.quaternion, w));
    up.updateMatrixWorld(true);
  }

  /** Swing a bone (in world space) so the direction `from` points along `to`. */
  _swing(bone, from, to) {
    _q.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(_qa).premultiply(_q);
    bone.parent.getWorldQuaternion(_qp);
    bone.quaternion.copy(_qp.invert().multiply(_qa));
    bone.updateMatrixWorld(true);
  }
}
