import * as THREE from "three";

/**
 * Every level in BLACKOUT extends this class. The contract is:
 *
 *   init(scene, assets, input, state)   build the world
 *   update(dt, state)                   one frame
 *   teardown()                          give the GPU its memory back
 *
 * Levels must put everything they create inside `this.root`. That way teardown
 * is one call and nothing gets left behind between levels or restarts — which
 * is what stops memory climbing across a three-level playthrough.
 *
 * `this.game` is set by Game before init() runs, so a level can reach
 * game.camera, game.renderer and game.setLevel() when it needs to.
 */
export class Level {
  constructor(name = "level") {
    this.name = name;
    this.root = new THREE.Group();
    this.root.name = name;
    this.game = null;
    this.finished = false;
  }

  /** Called once when the level starts. Override, and call super.init first. */
  init(scene, assets, input, state) {
    this.scene = scene;
    this.assets = assets;
    this.input = input;
    this.state = state;
    scene.add(this.root);
  }

  /** Called every frame. dt is seconds, already clamped by Game. */
  update(dt, state) {}

  /** Called when the level ends. Override for extra cleanup, then call super. */
  teardown() {
    if (this.scene) this.scene.remove(this.root);
    disposeObject(this.root);
    this.root.clear();
    this.scene = null;
  }
}

/**
 * Walk an object and dispose every geometry, material and texture under it.
 * Removing a mesh from the scene does NOT free its GPU memory — this does.
 */
export function disposeObject(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();

    // lights own a shadow map texture that nothing else will free
    if (obj.isLight && obj.shadow && obj.shadow.map) {
      obj.shadow.map.dispose();
      obj.shadow.map = null;
    }

    const mats = Array.isArray(obj.material)
      ? obj.material
      : obj.material
        ? [obj.material]
        : [];
    for (const mat of mats) disposeMaterial(mat);
  });
}

export function disposeMaterial(mat) {
  if (!mat) return;
  for (const key of Object.keys(mat)) {
    const value = mat[key];
    if (value && value.isTexture) value.dispose();
  }
  if (mat.uniforms) {
    for (const u of Object.values(mat.uniforms)) {
      if (u && u.value && u.value.isTexture) u.value.dispose();
    }
  }
  mat.dispose();
}
