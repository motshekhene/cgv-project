import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * attachModel — Member 2A
 *
 * Loads a .glb through the shared AssetRegistry and swaps it in for a
 * vehicle's placeholder box meshes.
 *
 *   await attachModel(assets, this.mesh, 'level2/player-car.glb', {
 *     length: 3.6,      // world length (metres) the car should end up
 *     yaw: 0,           // 0 | Math.PI | Math.PI / 2 | -Math.PI / 2 — see below
 *   });
 *
 * Game conventions this respects:
 *  - the car drives towards +Z when heading = 0, so the model's FRONT must
 *    point at +Z. Downloaded models often don't: if the car drives
 *    backwards, set yaw: Math.PI; if it drives sideways, try ±Math.PI / 2.
 *  - the vehicle's origin sits on the ground, so the model's underside is
 *    moved to y = 0 and centred on x/z regardless of how it was authored.
 *  - if the load fails, the placeholder boxes stay and the game keeps running.
 */
export async function attachModel(assets, holder, path, opts = {}) {
  const {
    length = 4,          // target size of the longest horizontal side
    yaw = 0,             // extra rotation to face +Z
    lift = 0,            // nudge up/down if the wheels sink or float
    tint = null,         // optional colour multiplier, e.g. 0xff5533
    keepPlaceholder = false,
  } = opts;

  let gltf;
  try {
    gltf = await assets.model(path);
  } catch (err) {
    console.warn(`[attachModel] could not load "${path}", keeping placeholder`, err);
    return null;
  }

  // clone so the same .glb can be reused (traffic, restarts) without sharing a transform
  const model = cloneSkinned(gltf.scene);

  model.rotation.y = yaw;
  model.updateMatrixWorld(true);

  // scale to the target length
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z) || 1;
  model.scale.multiplyScalar(length / longest);
  model.updateMatrixWorld(true);

  // centre on x/z and sit the underside on y = 0
  box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box.min.y - lift;

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = true;
    if (tint !== null) {
      // clone the material first, otherwise every copy of the model changes colour
      o.material = o.material.clone();
      o.material.color.multiply(new THREE.Color(tint));
    }
  });

  if (!keepPlaceholder) {
    // remove only the placeholder boxes that were there before
    for (const child of [...holder.children]) {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
        holder.remove(child);
      }
    }
  }

  // swapping cars: drop the previous model first (its geometry/materials are
  // shared with the AssetRegistry cache, so they are NOT disposed here)
  const previous = holder.getObjectByName('vehicle-model');
  if (previous) holder.remove(previous);

  model.name = 'vehicle-model';
  holder.add(model);
  return model;
}
