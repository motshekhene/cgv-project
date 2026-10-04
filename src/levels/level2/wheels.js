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
  const isWheel = (o) => /wheel|tyre|tire/i.test(o.name || '');
  model.traverse((o) => {
    if (!isWheel(o) || o === model) return;
    for (let a = o.parent; a && a !== model; a = a.parent) if (isWheel(a)) return;   // an ancestor is already the wheel
    let hasMesh = false;
    o.traverse((c) => { if (c.isMesh) hasMesh = true; });
    if (hasMesh) found.push(o);
  });

  const wheels = [];
  const box = new THREE.Box3(), centre = new THREE.Vector3(), size = new THREE.Vector3(), inv = new THREE.Matrix4();
  model.updateMatrixWorld(true);
  for (const node of found) {
    const parent = node.parent;
    if (!parent) continue;
    // wheel centre and size in the parent's space
    box.setFromObject(node);
    inv.copy(parent.matrixWorld).invert();
    box.applyMatrix4(inv);
    box.getCenter(centre);
    box.getSize(size);

    const pivot = new THREE.Group();
    pivot.name = 'wheel-pivot';
    pivot.rotation.order = 'YXZ';             // steer (Y) around the already-spinning (X) wheel
    pivot.position.copy(centre);
    parent.add(pivot);
    node.position.sub(centre);
    pivot.add(node);

    // radius in the car's own (holder) space, for the right roll speed
    const worldScale = new THREE.Vector3();
    parent.getWorldScale(worldScale);
    const radius = Math.max(0.05, (Math.max(size.y, size.z) / 2) * worldScale.y);
    wheels.push({ pivot, front: FRONT.test(node.name), radius, z: centre.z, named: /front|back|rear|_f[lr]\b|_r[lr]\b/i.test(node.name) });
  }
  // names like Wheel1..Wheel4 don't say which end they're on: the front pair
  // is the one further forward (+Z is the car's nose)
  if (wheels.length >= 4 && !wheels.some((w) => w.named)) {
    const zs = wheels.map((w) => w.z).sort((a, b) => a - b);
    const mid = (zs[0] + zs[zs.length - 1]) / 2;
    for (const w of wheels) w.front = w.z > mid;
  }
  model.userData.wheels = wheels;
  return wheels;
}

/** speed in m/s (signed), steer -1..1 (positive = left). */
export function spinWheels(model, speed, steer, dt) {
  const wheels = model && model.userData.wheels;
  if (!wheels) return;
  for (const w of wheels) {
    w.pivot.rotation.x += (speed / w.radius) * dt;
    if (w.front) w.pivot.rotation.y = steer * 0.42;
  }
}
