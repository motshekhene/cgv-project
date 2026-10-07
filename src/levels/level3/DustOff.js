import * as THREE from 'three';

/**
 * DustOff — a person getting the water off after climbing out of the pool,
 * posed by hand on the Mixamo rig (there's no clip for it): a quick shake of
 * the head, both hands wiped down the face and back over the hair, then the
 * hands shaken out loose at the sides. 'quick' (left idle mid-fight) skips the
 * wipe.
 *
 * The arms are placed with two-bone IK: each beat is where the palm goes
 * (relative to the head, or to the shoulder for the shake-out), which way the
 * fingers point and the palm faces, and which way the elbow points. Everything
 * is blended on top of whatever clip is playing and eased in and out, so
 * stop() mid-gesture settles back instead of snapping.
 *
 * Fighter.update() calls apply() after the mixer; onSpray(kind, ...) is how
 * Wetness throws the water each beat shakes loose.
 */
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _m0 = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// beats of the wipe, for the left hand ([left, up, forward] from the middle of the head; the right hand mirrors it):
// P where the palm is, F which way the fingers point, N which way the palm faces, E which way the elbow points
const WIPE = [
  { t: 0.28, P: [0.045, -0.07, 0.13], F: [-0.12, 1, 0.08], N: [0, 0, -1], E: [1, -0.3, 0.35] }, // over the mouth and chin
  { t: 0.46, P: [0.045, 0.05, 0.125], F: [-0.1, 0.85, -0.45], N: [0, 0.45, -1], E: [1, 0.1, 0.4] }, // up over the eyes and brow
  { t: 0.63, P: [0.05, 0.135, 0.0], F: [0, 0, -1], N: [0, -1, 0], E: [1, 0.1, 0.65] }, // back over the top of the head
  { t: 0.8, P: [0.055, 0.04, -0.11], F: [0, -0.8, -0.35], N: [0, -0.3, 1], E: [1, 0.1, 0.65] }, // down the back of it
  { t: 0.97, P: [0.09, -0.19, 0.03], F: [0.15, -1, 0.35], N: [-0.7, 0, -0.3], E: [1, -0.5, 0.6] }, // and round the neck, elbows coming down in front
];
const WIPE_LEN = 1.2;
const HEAD_LEN = 0.55;
const FLAP_LEN = 0.9;
const FLAP_HZ = 7;
const PALM = 0.075; // wrist to the middle of the palm, metres

// when each part starts, seconds into the gesture
const PLANS = {
  full: { head: 0, wipe: 0.45, flap: 1.6, end: 2.5 },
  quick: { head: 0, wipe: null, flap: 0.45, end: 1.35 },
};

export class DustOff {
  /** null unless the fighter has the Mixamo arms and head. */
  static for(fighter) {
    const b = (n) => fighter.bones['mixamorig' + n];
    const arm = (s) => b(s + 'Arm') && b(s + 'ForeArm') && b(s + 'Hand') && b(s + 'HandMiddle1') && b(s + 'HandIndex1') && b(s + 'HandPinky1')
      && { up: b(s + 'Arm'), lo: b(s + 'ForeArm'), hand: b(s + 'Hand'), mid: b(s + 'HandMiddle1'), idx: b(s + 'HandIndex1'), pky: b(s + 'HandPinky1') };
    const L = arm('Left'), R = arm('Right');
    return L && R && b('Head') && b('Neck') ? new DustOff(fighter, L, R, b('Head'), b('Neck')) : null;
  }

  constructor(fighter, L, R, head, neck) {
    this.f = fighter;
    // side: +1 left, -1 right (mirrors the beats); palm: which side of the hand cross(fingers, index-pinky) comes out of
    this.arms = [{ ...L, side: 1, palm: 1, flip: 0 }, { ...R, side: -1, palm: -1, flip: Math.PI }];
    this.head = head;
    this.neck = neck;
    this.t = 0;
    this.plan = null;
    this.amp = 0; // eased 0..1: the whole gesture fades in and out with it
    this.onSpray = null;
    this._P = new THREE.Vector3();
    this._F = new THREE.Vector3();
    this._N = new THREE.Vector3();
    this._pole = new THREE.Vector3();
    this._hc = new THREE.Vector3();
    this._yawWas = 0;
  }

  get active() {
    return this.plan !== null;
  }

  start(kind = 'full') {
    this.plan = PLANS[kind] || PLANS.full;
    this.t = 0;
  }

  stop() {
    this.plan = null;
  }

  /** Called by Fighter.update() after the mixer has posed the body. */
  apply(dt) {
    const p = this.plan;
    if (p) {
      this.t += dt;
      if (this.t >= p.end) this.plan = null;
    }
    this.amp += ((this.plan ? 1 : 0) - this.amp) * (1 - Math.exp(-14 * dt));
    if (this.amp < 0.003) {
      this.amp = 0;
      return;
    }
    const plan = p || this._last;
    this._last = plan;
    if (!plan) return;
    const t = this.t;
    const f = this.f;
    const root = f.root;
    root.updateMatrixWorld(true);
    // the body's own axes
    const h = root.rotation.y;
    this.fwd = _e.set(Math.sin(h), 0, Math.cos(h));
    this.left = this.left || new THREE.Vector3();
    this.left.set(Math.cos(h), 0, -Math.sin(h));

    this._headShake(t - plan.head, dt);
    if (plan.wipe !== null) this._wipe(t - plan.wipe);
    this._flap(t - plan.flap, dt);
  }

  /* --------------------------------------------------------------- beats */

  /** A short, hard no-shake of the head, the hair throwing water off sideways. */
  _headShake(t, dt) {
    if (t < 0 || t > HEAD_LEN) return;
    const env = Math.sin((t / HEAD_LEN) * Math.PI) ** 0.5;
    const yaw = 0.42 * Math.sin(t * Math.PI * 2 * 4.5) * env * this.amp;
    this._turn(this.neck, UP, yaw * 0.35);
    this._turn(this.head, UP, yaw * 0.65);
    const swing = yaw - this._yawWas;
    this._yawWas = yaw;
    if (this.onSpray && dt > 0) this.onSpray('head', this._headCentre(this._hc), Math.sign(swing), Math.abs(swing));
  }

  /** Both palms up the face and back over the hair, wringing it out down his back. */
  _wipe(t) {
    if (t < 0 || t > WIPE_LEN) return;
    const last = WIPE[WIPE.length - 1];
    const w = ease(t / WIPE[0].t) * (1 - ease((t - last.t) / (WIPE_LEN - last.t))) * this.amp;
    // the beat we're between
    let i = 0;
    while (i < WIPE.length - 1 && t > WIPE[i + 1].t) i++;
    const A = WIPE[i], B = WIPE[Math.min(i + 1, WIPE.length - 1)];
    const k = B === A ? 0 : ease((t - A.t) / (B.t - A.t));
    // the head tips back as the hands go over it
    const tip = Math.sin(clamp01((t - 0.4) / 0.5) * Math.PI) * 0.32 * this.amp;
    this._turn(this.head, this.left, -tip * 0.7);
    this._turn(this.neck, this.left, -tip * 0.3);
    const c = this._headCentre(this._hc);
    for (const arm of this.arms) {
      this._body(this._P, c, lerp3(A.P, B.P, k), arm.side);
      this._body(this._F, null, lerp3(A.F, B.F, k), arm.side).normalize();
      this._body(this._N, null, lerp3(A.N, B.N, k), arm.side).normalize();
      this._body(this._pole, null, lerp3(A.E, B.E, k), arm.side);
      this._reach(arm, this._P, this._F, this._N, this._pole, w);
    }
    // wringing the hair out: water runs off the back of the head
    if (this.onSpray && t > WIPE[2].t && t < WIPE[3].t + 0.1) this.onSpray('wring', c.addScaledVector(this.fwd, -0.1), 0, 1);
  }

  /** Hands hanging loose at the hips, shaken out hard: water flicks off the fingertips on each snap down. */
  _flap(t, dt) {
    if (t < -0.2 || t > FLAP_LEN) return;
    const w = ease((t + 0.2) / 0.38) * (1 - ease((t - (FLAP_LEN - 0.22)) / 0.22)) * this.amp;
    for (const arm of this.arms) {
      const ph = t * Math.PI * 2 * FLAP_HZ + arm.flip * 0.5; // the hands a little out of step
      const flap = t > 0 ? Math.sin(ph) * 0.85 : 0;
      arm.up.getWorldPosition(_a); // shoulder
      // wrist down by the hip, a little forward and out; the forearm bounces with each shake
      this._body(_b, _a, [0.09, -0.45 + (t > 0 ? 0.05 * Math.sin(ph + 1.4) : 0), 0.11], arm.side);
      // fingers down (and slightly forward), flapping back and forth about the wrist; palm turned in
      const fx = 0, fy = -Math.cos(flap), fz = 0.25 + Math.sin(flap);
      this._body(this._F, null, [fx, fy, fz], arm.side).normalize();
      this._body(this._N, null, [-1, 0, 0], arm.side);
      this._P.copy(_b).addScaledVector(this._F, PALM);
      this._body(this._pole, null, [0.55, -0.15, -0.8], arm.side);
      this._reach(arm, this._P, this._F, this._N, this._pole, w);
      // each snap down throws a spatter off the fingers
      const was = arm.flapWas ?? 0;
      arm.flapWas = flap;
      if (this.onSpray && t > 0 && was > 0.35 && flap <= 0.35) this.onSpray('flick', arm.mid.getWorldPosition(_d), arm.side, w);
    }
  }

  /* --------------------------------------------------------------- posing */

  /** [left, up, forward] in the body's frame (left mirrored for the right hand), plus `origin` if given. */
  _body(out, origin, [l, u, fw], side) {
    out.set(0, 0, 0)
      .addScaledVector(this.left, l * side)
      .addScaledVector(UP, u)
      .addScaledVector(this.fwd, fw);
    if (origin) out.add(origin);
    return out;
  }

  /** The middle of the head (the Head bone sits at the top of the neck). */
  _headCentre(out) {
    this.head.getWorldPosition(out);
    return out.addScaledVector(UP, 0.085);
  }

  /** Rotate a bone by `angle` about a world axis, on top of its pose. */
  _turn(bone, axis, angle) {
    if (!angle) return;
    this.f._stash(bone);
    _q.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_qa).premultiply(_q);
    this._setWorld(bone, _qa);
    bone.updateMatrixWorld(true);
  }

  _setWorld(bone, worldQ) {
    bone.parent.getWorldQuaternion(_qp);
    bone.quaternion.copy(_qp.invert().multiply(worldQ));
  }

  /** Swing a bone (in world space) so the direction `from` points along `to`. */
  _swing(bone, from, to) {
    _q.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(_qa).premultiply(_q);
    this._setWorld(bone, _qa);
    bone.updateMatrixWorld(true);
  }

  /**
   * Two-bone IK: put the palm at P with the fingers along F and the palm facing
   * N, the elbow bent toward `pole`, blended in by w over the clip's own pose.
   */
  _reach(arm, P, F, N, pole, w) {
    if (w < 0.002) return;
    const { up, lo, hand } = arm;
    for (const b of [up, lo, hand]) this.f._stash(b);
    const from = [up.quaternion.clone(), lo.quaternion.clone(), hand.quaternion.clone()];

    const S = up.getWorldPosition(new THREE.Vector3());
    const E = lo.getWorldPosition(new THREE.Vector3());
    const W = hand.getWorldPosition(new THREE.Vector3());
    const a = E.distanceTo(S), b = W.distanceTo(E);
    const T = _v.copy(P).addScaledVector(F, -PALM); // the wrist
    const dir = T.clone().sub(S);
    const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, dir.length()));
    dir.normalize();
    const cos = (a * a + d * d - b * b) / (2 * a * d);
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = S.clone().addScaledVector(dir, a * cos).addScaledVector(p, a * Math.sqrt(Math.max(0, 1 - cos * cos)));
    this._swing(up, E.clone().sub(S), elbow.sub(S));
    lo.getWorldPosition(E);
    hand.getWorldPosition(W);
    this._swing(lo, W.clone().sub(E), S.clone().addScaledVector(dir, d).sub(E));

    // the hand: turn its (fingers, palm) frame onto (F, N)
    const f0 = arm.mid.getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(_b)).normalize();
    const across = arm.idx.getWorldPosition(new THREE.Vector3()).sub(arm.pky.getWorldPosition(_b));
    const n0 = new THREE.Vector3().crossVectors(f0, across).multiplyScalar(arm.palm).normalize();
    basis(_m0, f0, n0);
    basis(_m1, F, N);
    _q.setFromRotationMatrix(_m1.multiply(_m0.transpose()));
    hand.getWorldQuaternion(_qa).premultiply(_q);
    this._setWorld(hand, _qa);

    // blend the solve over the clip's pose
    up.quaternion.copy(from[0].slerp(up.quaternion, w));
    lo.quaternion.copy(from[1].slerp(lo.quaternion, w));
    hand.quaternion.copy(from[2].slerp(hand.quaternion, w));
    up.updateMatrixWorld(true);
  }
}

function lerp3(a, b, k) {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** A rotation whose x axis is `x` and y axis is `y` (made square to x). */
function basis(out, x, y) {
  const X = _c.copy(x).normalize();
  const Y = _d.copy(y).addScaledVector(X, -y.dot(X)).normalize();
  const Z = _a.crossVectors(X, Y);
  return out.makeBasis(X, Y, Z);
}
