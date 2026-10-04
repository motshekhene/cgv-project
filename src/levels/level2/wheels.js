import * as THREE from 'three';

/**
 * wheels.js — Member 2A
 *
 * Makes a car model's wheels roll with the road and its front wheels steer.
 *
 * The downloaded cars (Quaternius, Ignition Labs) do have separate wheel
 * meshes, but every wheel's pivot sits at the car's origin, so rotating it
 * would swing it round the middle of the car. rigWheels() re-pivots each one
 * on its own centre (a new Group at the wheel's centre, the mesh moved inside
 * it), without touching the shared, cached geometry.
 *
 *   rigWheels(model);                         // once, after loading (attachModel does it)
 *   spinWheels(model, speed, steer, dt);      // every frame
 */

const FRONT = /front|_fl\b|_fr\b|wheel_?f[lr]|f[lr]_?wheel/i;

export function rigWheels(model) {
  if (model.userData.wheels) return model.userData.wheels;
  // the outermost node whose name says "wheel" — a wheel is often a group of
  // tyre + rim meshes, and they must turn together on ONE pivot
  const found = [];
  const pattern = model.userData.wheelPattern || /wheel|tyre|tire/i;
  const isWheel = (o) => pattern.test(o.name || '');
  model.traverse((o) => {
    if (!isWheel(o) || o === model) return;
    for (let a = o.parent; a && a !== model; a = a.parent) if (isWheel(a)) return;   // an ancestor is already the wheel
    let hasMesh = false;
    o.traverse((c) => { if (c.isMesh) hasMesh = true; });
    if (hasMesh) found.push(o);
  });

  // Work in the CAR's frame (the model root's parent, i.e. after any yaw that
  // turned a side-on model to face +Z): the axle is always the car's X axis,
  // up is Y, the nose is +Z — however the file itself was authored.
  const wheels = [];
  const box = new THREE.Box3(), centreW = new THREE.Vector3(), size = new THREE.Vector3();
  const qParent = new THREE.Quaternion(), centreLocal = new THREE.Vector3();
  model.updateMatrixWorld(true);       // model isn't attached yet: "world" = the car's frame
  for (const node of found) {
    const parent = node.parent;
    if (!parent) continue;
    box.setFromObject(node);           // car-frame box
    box.getCenter(centreW);
    box.getSize(size);

    const pivot = new THREE.Group();
    pivot.name = 'wheel-pivot';
    pivot.rotation.order = 'YXZ';      // steer (Y) around the already-spinning (X) wheel
    centreLocal.copy(centreW);
    parent.worldToLocal(centreLocal);
    pivot.position.copy(centreLocal);
    parent.getWorldQuaternion(qParent);
    pivot.quaternion.copy(qParent).invert();   // pivot axes = car axes
    parent.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(node);                // keeps the wheel exactly where it was

    const radius = Math.max(0.05, Math.max(size.y, size.z) / 2);
    const named = /front|back|rear|_f[lr]\b|_r[lr]\b/i.test(node.name);
    wheels.push({ pivot, front: FRONT.test(node.name), radius, z: centreW.z, named });
  }
  // names like Wheel1..Wheel4 / Cylinder001..004 don't say which end they're
  // on: the front pair is the one further forward (+Z is the car's nose)
  if (wheels.length >= 4 && !wheels.some((w) => w.named)) {
    const zs = wheels.map((w) => w.z).sort((a, b) => a - b);
    const mid = (zs[0] + zs[zs.length - 1]) / 2;
    for (const w of wheels) w.front = w.z > mid;
  }
  // the quaternion set above must survive the spin/steer updates
  for (const w of wheels) w.base = w.pivot.quaternion.clone();
  model.userData.wheels = wheels;
  return wheels;
}

/** speed in m/s (signed), steer -1..1 (positive = left). */
const _qy = new THREE.Quaternion(), _qx = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0);

export function spinWheels(model, speed, steer, dt) {
  const wheels = model && model.userData.wheels;
  if (!wheels) return;
  for (const w of wheels) {
    w.angle = (w.angle || 0) + (speed / w.radius) * dt;
    _qy.setFromAxisAngle(_Y, w.front ? steer * 0.42 : 0);
    _qx.setFromAxisAngle(_X, w.angle);
    // local = base · steer · spin: base cancels the parent's turn, so the
    // steer (Y) and spin (X) happen around the CAR's axes
    w.pivot.quaternion.copy(_qy).multiply(_qx);
    w.pivot.quaternion.premultiply(w.base);
  }
}
