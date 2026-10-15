import * as THREE from 'three';

/**
 * The trailer's camera language: easing curves, moves between two framings,
 * moves that ride along with something moving, orbits, and a hand-held drift
 * that is a smooth function of time (never Math.random), so a frame looks the
 * same however the trailer got to it.
 *
 * A shot's camera function fills `cam` every frame:
 *
 *   cam.pos   where the lens is          (THREE.Vector3)
 *   cam.look  what it is pointed at      (THREE.Vector3)
 *   cam.fov   vertical field of view, degrees (the "focal length")
 *   cam.roll  a dutch tilt, radians
 *
 * Everything here is written into vectors the caller owns, so nothing is
 * allocated per frame.
 */

export const ease = {
  linear: (k) => k,
  in: (k) => k * k * k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  // the camera operator's push: starts already moving, settles at the end
  settle: (k) => 1 - Math.pow(1 - k, 2.2),
  // slow-fast-slow, softer than inOut, for long drifts
  drift: (k) => k * k * (3 - 2 * k),
  // a whip: almost all of the move in the first third
  whip: (k) => 1 - Math.pow(1 - k, 6),
};

export const clamp01 = (k) => Math.min(1, Math.max(0, k));
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, k) => a + (b - a) * k;

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Two framings and an easing between them: cam ends up `k` of the way from a to b. */
export function between(cam, a, b, k, curve = ease.inOut) {
  const e = curve(clamp01(k));
  cam.pos.lerpVectors(a.pos, b.pos, e);
  cam.look.lerpVectors(a.look, b.look, e);
  cam.fov = mix(a.fov ?? 50, b.fov ?? a.fov ?? 50, e);
  cam.roll = mix(a.roll ?? 0, b.roll ?? a.roll ?? 0, e);
  return cam;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _o = new THREE.Vector3();

/**
 * A point in something's own frame: `local` metres to its +x (its left, for a
 * character facing +z), +y and +z (ahead), turned by `yaw` (its heading about
 * Y, radians) and added to `origin`.
 */
export function inFrame(out, origin, yaw, local) {
  _o.copy(local).applyAxisAngle(_Y, yaw);
  return out.copy(origin).add(_o);
}
const _Y = new THREE.Vector3(0, 1, 0);

/** Same, with an object: its world position and world yaw. */
export function onObject(out, obj, local) {
  obj.updateWorldMatrix(true, false);
  obj.matrixWorld.decompose(_o, _q, _e);
  _e.setFromQuaternion(_q, 'YXZ');
  const p = obj.getWorldPosition(_tmpP);
  return inFrame(out, p, _e.y, local);
}
const _tmpP = new THREE.Vector3();

/** A point on a circle round `center`, `angle` radians from +z, `r` out and `h` up. */
export function orbitPoint(out, center, r, angle, h) {
  return out.set(center.x + Math.sin(angle) * r, center.y + h, center.z + Math.cos(angle) * r);
}

/**
 * The hand on the camera: a slow wander made of out-of-step sines, in metres
 * and radians. `amount` 0 is a locked-off tripod; 1 is a handheld operator
 * walking with the action. Deterministic in `time`.
 */
export function handheld(cam, time, amount = 0.3) {
  if (amount <= 0) return cam;
  const a = amount;
  cam.pos.x += (Math.sin(time * 0.71) * 0.6 + Math.sin(time * 1.93 + 1.3) * 0.25) * 0.05 * a;
  cam.pos.y += (Math.sin(time * 0.53 + 2.1) * 0.6 + Math.sin(time * 1.37 + 0.4) * 0.3) * 0.04 * a;
  cam.pos.z += (Math.sin(time * 0.61 + 4.2) * 0.6 + Math.sin(time * 2.11 + 2.6) * 0.25) * 0.05 * a;
  cam.look.x += (Math.sin(time * 0.83 + 0.7) * 0.6 + Math.sin(time * 2.41 + 3.1) * 0.2) * 0.06 * a;
  cam.look.y += (Math.sin(time * 0.67 + 5.3) * 0.6 + Math.sin(time * 1.77 + 1.9) * 0.2) * 0.05 * a;
  cam.roll += Math.sin(time * 0.47 + 0.9) * 0.006 * a;
  return cam;
}

/**
 * An impact: a hard jolt that rings down. `age` seconds since the hit; returns
 * nothing, moves the camera. Strength is in metres at the lens.
 */
export function jolt(cam, age, strength = 0.25, decay = 9) {
  if (age < 0 || age > 1.2) return cam;
  const env = Math.exp(-decay * age) * strength;
  cam.pos.x += Math.sin(age * 71) * env;
  cam.pos.y += Math.sin(age * 83 + 1.1) * env * 0.8;
  cam.look.x += Math.sin(age * 67 + 2.2) * env * 1.6;
  cam.look.y += Math.sin(age * 59 + 0.3) * env * 1.3;
  cam.roll += Math.sin(age * 41) * env * 0.08;
  return cam;
}

/** Ease `cur` toward `want` at `rate` per second (frame-rate independent). */
export function chase(cur, want, rate, dt) {
  return cur + (want - cur) * (1 - Math.exp(-rate * dt));
}

/** Apply a framing to a THREE camera. */
export function applyCamera(camera, cam) {
  camera.position.copy(cam.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.look);
  if (cam.roll) camera.rotateZ(cam.roll);
  if (Math.abs(camera.fov - cam.fov) > 1e-4) {
    camera.fov = cam.fov;
  }
  camera.updateProjectionMatrix();
}

/** A fresh framing object. */
export function newCam() {
  return { pos: new THREE.Vector3(), look: new THREE.Vector3(0, 0, -1), fov: 50, roll: 0 };
}

