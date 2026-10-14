import * as THREE from 'three';

/**
 * BodyIK — whole-body poses the clips don't have, laid over what the mixer has
 * put on the Mixamo rig. Call it after Fighter.update(): every bone it moves
 * is stashed (Fighter._stash), so the mixer has its own pose back next frame
 * and nothing compounds.
 *
 *   const ik = BodyIK.for(fighter);   // null on a rig without the Mixamo bones
 *
 *   ik.straddle(seat, frame, girth, w, { lean, hunch, hands, place, tuck })
 *     Astride a broad back (the Shadow Stag's): his hips set down on `seat`
 *     (a world point on top of the back), the thighs out over its sides and
 *     the shins down its flanks, clear of it all the way down (`girth(depth)`
 *     is its half-width that far below the top), knees out; bent forward a
 *     little over it, both hands on it in front (`hands` 0..1, so a punch can
 *     take them off), leaning `lean` radians to its right against a buck.
 *     `frame` is the back's world orientation (it faces +z). `place` (0..1,
 *     w if not given) is how far he's moved onto the seat: all the way while
 *     he leaps on, not at all as he drops off (his limbs still blending).
 *     `tuck` (0..1) draws his knees up under him instead, as he jumps.
 *
 *   ik.stoop(target, w, groundY)
 *     Down to pick something up off the ground, like anyone would: a deep
 *     squat with the feet left where they are, the back bent over it and the
 *     head down, the right hand at `target`, the left hand on the left knee.
 *
 * w (0..1) blends either one in over the clip, so they ease in and out.
 * Both are made of two moves, as in FootPlant: a two-bone reach (hip, knee,
 * ankle; shoulder, elbow, wrist) with its middle joint bent toward a pole,
 * and a turn of a bone about a world axis.
 */

export const HIP_UP = 0.17; // the hips bone above the top of the back he's sat on (the seat of him, and his thighs)
const LEG_DEPTH = 0.38; // the feet hang this far down its flanks
const SQUAT_HIPS = 0.4; // the hips bone this high off the ground, squatting
const BEND = 1.15; // radians: how far over his back bends to reach the ground
const SPINE_SHARE = [0.42, 0.33, 0.25]; // Spine, Spine1, Spine2
const HUNCH_SHARE = [0.5, 0.3, 0.2];

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qe = new THREE.Quaternion();
const _w0 = new THREE.Quaternion();
const _w1 = new THREE.Quaternion();
const _w2 = new THREE.Quaternion();
// the reach's own scratch
const _rh = new THREE.Vector3();
const _rk = new THREE.Vector3();
const _ra = new THREE.Vector3();
const _rd = new THREE.Vector3();
const _rp = new THREE.Vector3();
const _rm = new THREE.Vector3();
const _rs = new THREE.Vector3();
const _rt = new THREE.Vector3();
// the poses' scratch
const _F = new THREE.Vector3();
const _U = new THREE.Vector3();
const _L = new THREE.Vector3();
const _T = new THREE.Vector3();
const _P = new THREE.Vector3();
const _H = new THREE.Vector3();
const _D = new THREE.Vector3();
const _S = new THREE.Vector3();
const _K = new THREE.Vector3();
const _FL = new THREE.Vector3();
const _FR = new THREE.Vector3();
const _X = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Move a fighter's root by a world-space offset (whatever its parent is). */
function moveRoot(root, delta) {
  const p = root.getWorldPosition(_X).add(delta);
  root.position.copy(root.parent ? root.parent.worldToLocal(p) : p);
  root.updateMatrixWorld(true);
}

/** Swing a bone (in world space) so the direction `from` points along `to`. */
function swing(bone, from, to) {
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_qa).premultiply(_q);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_qa));
  bone.updateMatrixWorld(true);
}

export class BodyIK {
  /** null unless the fighter has the Mixamo bones it needs. */
  static for(fighter) {
    const b = (n) => fighter.bones['mixamorig' + n];
    const chain = (up, lo, end) => (b(up) && b(lo) && b(end) ? { up: b(up), lo: b(lo), end: b(end) } : null);
    const legs = [chain('LeftUpLeg', 'LeftLeg', 'LeftFoot'), chain('RightUpLeg', 'RightLeg', 'RightFoot')];
    const arms = [chain('LeftArm', 'LeftForeArm', 'LeftHand'), chain('RightArm', 'RightForeArm', 'RightHand')];
    const spine = [b('Spine'), b('Spine1'), b('Spine2')];
    if (!b('Hips') || !b('Head') || legs.includes(null) || arms.includes(null) || spine.some((s) => !s)) return null;
    return new BodyIK(fighter, b('Hips'), spine, b('Head'), legs, arms);
  }

  constructor(fighter, hips, spine, head, legs, arms) {
    this.f = fighter;
    this.hips = hips;
    this.spine = spine;
    this.head = head;
    this.legs = legs; // [left, right]
    this.arms = arms; // [left, right]
  }

  /** Rotate a bone by `angle` about a world axis, on top of its pose. */
  turn(bone, axis, angle) {
    if (Math.abs(angle) < 1e-5) return;
    this.f._stash(bone);
    _q.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_qa).premultiply(_q);
    bone.parent.getWorldQuaternion(_qp);
    bone.quaternion.copy(_qp.invert().multiply(_qa));
    bone.updateMatrixWorld(true);
  }

  /** Two-bone reach: the end of `chain` to T, the middle joint bent toward `pole` (a world direction), the end keeping its world angle; blended in by w. */
  reach(chain, T, pole, w) {
    if (w < 0.002) return;
    const { up, lo, end } = chain;
    for (const b of [up, lo, end]) this.f._stash(b);
    _w0.copy(up.quaternion);
    _w1.copy(lo.quaternion);
    _w2.copy(end.quaternion);
    end.getWorldQuaternion(_qe);

    const H = up.getWorldPosition(_rh);
    const K = lo.getWorldPosition(_rk);
    const A = end.getWorldPosition(_ra);
    const a = K.distanceTo(H), b = A.distanceTo(K);
    const dir = _rd.copy(T).sub(H);
    const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, dir.length()));
    dir.normalize();
    const cos = (a * a + d * d - b * b) / (2 * a * d);
    const p = _rp.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (p.lengthSq() < 1e-8) p.set(0, 1, 0).addScaledVector(dir, -dir.y);
    p.normalize();
    const mid = _rm.copy(H).addScaledVector(dir, a * cos).addScaledVector(p, a * Math.sqrt(Math.max(0, 1 - cos * cos)));
    swing(up, _rs.copy(K).sub(H), _rt.copy(mid).sub(H));
    lo.getWorldPosition(K);
    end.getWorldPosition(A);
    swing(lo, _rs.copy(A).sub(K), _rt.copy(H).addScaledVector(dir, d).sub(K));
    end.parent.getWorldQuaternion(_qp);
    end.quaternion.copy(_qp.invert().multiply(_qe));

    up.quaternion.copy(_w0.slerp(up.quaternion, w));
    lo.quaternion.copy(_w1.slerp(lo.quaternion, w));
    end.quaternion.copy(_w2.slerp(end.quaternion, w));
    up.updateMatrixWorld(true);
  }

  straddle(seat, frame, girth, w, { lean = 0, hunch = 0.34, hands = 1, place = w, tuck = 0 } = {}) {
    if (w < 0.002 && place < 0.002) return;
    const root = this.f.root;
    const F = _F.set(0, 0, 1).applyQuaternion(frame);
    const U = _U.set(0, 1, 0).applyQuaternion(frame);
    const L = _L.set(1, 0, 0).applyQuaternion(frame); // its left
    // the hips set down on its back: the whole of him moved there, so nothing else shifts
    root.updateMatrixWorld(true);
    const H = this.hips.getWorldPosition(_H);
    if (place > 0.002) moveRoot(root, _D.copy(seat).addScaledVector(U, HIP_UP).sub(H).multiplyScalar(place));
    if (w < 0.002) return;
    // bent forward over it a little, and leaning against the buck
    this.spine.forEach((bone, i) => {
      this.turn(bone, L, hunch * w * HUNCH_SHARE[i]);
      this.turn(bone, F, lean * w * HUNCH_SHARE[i]);
    });
    // a leg down each side: the foot well out past its flank, the knee bowed up and out over its back
    // (or, tucked, the feet drawn up under him and the knees forward, the way you jump up onto something)
    this.legs.forEach((leg, i) => {
      const s = i === 0 ? 1 : -1; // his left leg down its left side
      _T.copy(seat).addScaledVector(L, s * (girth(LEG_DEPTH) + 0.08)).addScaledVector(U, -LEG_DEPTH).addScaledVector(F, 0.04);
      _P.copy(U).multiplyScalar(0.75).addScaledVector(L, s * 0.55).addScaledVector(F, 0.35);
      if (tuck > 0.002) {
        leg.up.getWorldPosition(_K).addScaledVector(U, -0.3).addScaledVector(F, 0.18).addScaledVector(L, s * 0.06);
        _T.lerp(_K, tuck);
        _P.lerp(_S.copy(F).addScaledVector(U, 0.3), tuck);
      }
      this.reach(leg, _T, _P, w);
    });
    // both hands on it in front of him, holding on
    const hw = w * hands;
    if (hw > 0.002) {
      this.arms.forEach((arm, i) => {
        const s = i === 0 ? 1 : -1;
        _T.copy(seat).addScaledVector(F, 0.5).addScaledVector(U, 0.2).addScaledVector(L, s * 0.17);
        _P.copy(L).multiplyScalar(s * 0.7).addScaledVector(U, -0.5).addScaledVector(F, -0.3);
        this.reach(arm, _T, _P, hw);
      });
    }
  }

  stoop(target, w, groundY) {
    if (w < 0.002) return;
    const root = this.f.root;
    root.updateMatrixWorld(true);
    const h = root.rotation.y;
    const fwd = _F.set(Math.sin(h), 0, Math.cos(h));
    const left = _L.set(Math.cos(h), 0, -Math.sin(h));
    // his feet stay where the clip has them
    const feet = [this.legs[0].end.getWorldPosition(_FL), this.legs[1].end.getWorldPosition(_FR)];
    // down into a squat, the hips low and back over his heels
    const H = this.hips.getWorldPosition(_H);
    moveRoot(root, _D.copy(fwd).multiplyScalar(-0.12 * w).setY(-Math.max(0, H.y - (groundY + SQUAT_HIPS)) * w));
    this.legs.forEach((leg, i) => {
      _P.copy(fwd).addScaledVector(left, (i === 0 ? 1 : -1) * 0.3); // knees forward, a little apart
      this.reach(leg, feet[i], _P, w);
    });
    // the back bent over it, the head down to it
    this.spine.forEach((bone, i) => this.turn(bone, left, BEND * w * SPINE_SHARE[i]));
    this.turn(this.head, left, 0.15 * w);
    // the right hand to it (the wrist just short of it, toward the shoulder), the elbow out
    const S = this.arms[1].up.getWorldPosition(_S);
    _T.copy(S).sub(target).normalize().multiplyScalar(0.07).add(target);
    _P.copy(left).multiplyScalar(-0.8).addScaledVector(fwd, -0.2).addScaledVector(UP, 0.3);
    this.reach(this.arms[1], _T, _P, w);
    // the left hand on the left knee
    const knee = this.legs[0].lo.getWorldPosition(_K);
    _T.copy(knee).addScaledVector(fwd, 0.06).addScaledVector(left, 0.03).addScaledVector(UP, 0.06);
    _P.copy(left).multiplyScalar(0.8).addScaledVector(fwd, -0.3);
    this.reach(this.arms[0], _T, _P, w * 0.85);
  }
}
