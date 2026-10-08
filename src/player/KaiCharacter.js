import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

/**
 * Visual/animation layer for Kai.
 *
 * Gameplay collision remains in Level01's invisible capsule.  This class only
 * owns the rigged character, animation blending and small visual accessories,
 * so replacing/tuning Kai cannot destabilise the runner collision code.
 */
export class KaiCharacter {
  static async create(assets) {
    const source = await assets.fbx("characters/kai.fbx");
    const model = SkeletonUtils.clone(source);
    return new KaiCharacter(model, source.animations || []);
  }

  constructor(model, clips = []) {
    this.group = new THREE.Group();
    this.group.name = "kai-visual";

    this.pose = new THREE.Group();
    this.pose.name = "kai-pose";
    this.group.add(this.pose);

    this.model = model;
    this.model.name = "kai-rig";
    this.pose.add(this.model);

    this._basePoseY = 0;
    this._currentState = "";
    this._activeAction = null;
    this._runAction = null;
    this._jumpAction = null;
    this._deathAction = null;
    this._idleAction = null;
    this._time = 0;

    this._prepareModel();
    this._buildAccessories();
    this._setupAnimations(clips);
  }

  _prepareModel() {
    // Normalise any source scale to a ~1.74 m character and put the feet on
    // y=0.  This makes the FBX safe even if the source was authored in cm.
    this.model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (Number.isFinite(size.y) && size.y > 0.001) {
      const s = 1.74 / size.y;
      this.model.scale.multiplyScalar(s);
    }

    // The runner travels toward -Z.  The supplied Man rig faces +Z after FBX
    // import, so turn it around once at the visual root.
    this.model.rotation.y += Math.PI;
    this.model.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(this.model);
    if (Number.isFinite(box.min.y)) this.model.position.y -= box.min.y;

    // Centre the mesh horizontally around the collision capsule.
    this.model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(this.model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    if (Number.isFinite(center.x)) this.model.position.x -= center.x;
    if (Number.isFinite(center.z)) this.model.position.z -= center.z;

    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = true;

      const originals = Array.isArray(o.material) ? o.material : [o.material];
      const converted = originals.map((src) => {
        const m = src?.clone ? src.clone() : new THREE.MeshStandardMaterial({ color: 0x687169 });
        // Keep supplied textures, but make Kai read clearly under the jungle's
        // very warm directional light instead of blowing out like plastic.
        if ("roughness" in m) m.roughness = Math.max(0.58, m.roughness ?? 0.58);
        if ("metalness" in m) m.metalness = Math.min(0.12, m.metalness ?? 0);
        return m;
      });
      o.material = Array.isArray(o.material) ? converted : converted[0];
    });
  }

  _buildAccessories() {
    // The Key from the story: a shielded drive strapped high on Kai's back.
    // It is intentionally simple geometry so it remains visible at runner
    // camera distance without requiring another external asset.
    const pack = new THREE.Group();
    pack.name = "kai-key-pack";

    const packMat = new THREE.MeshStandardMaterial({
      color: 0x1c2520,
      roughness: 0.9,
      metalness: 0.08,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x30483d,
      roughness: 0.62,
      metalness: 0.18,
    });
    const keyMat = new THREE.MeshStandardMaterial({
      color: 0x78efe0,
      emissive: 0x1c867b,
      emissiveIntensity: 1.4,
      roughness: 0.32,
      metalness: 0.45,
    });

    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.16), packMat);
    bag.position.set(0, 1.17, 0.18);
    bag.rotation.x = -0.08;
    bag.castShadow = true;
    pack.add(bag);

    const drive = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.34, 0.065), keyMat);
    drive.position.set(0, 1.18, 0.285);
    drive.castShadow = true;
    pack.add(drive);

    for (const x of [-0.155, 0.155]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.19), edgeMat);
      rail.position.set(x, 1.17, 0.19);
      rail.castShadow = true;
      pack.add(rail);
    }

    const status = new THREE.PointLight(0x79fff0, 0.28, 2.4, 2);
    status.position.set(0, 1.18, 0.36);
    pack.add(status);
    this.keyStatusLight = status;

    this.pose.add(pack);
    this.accessories = pack;
  }

  _findClip(clips, names) {
    const lowered = names.map((n) => n.toLowerCase());
    return (
      clips.find((c) => lowered.some((n) => c.name.toLowerCase().endsWith(n))) ||
      clips.find((c) => lowered.some((n) => c.name.toLowerCase().includes(n))) ||
      null
    );
  }

  _setupAnimations(clips) {
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = new Map();

    const defs = {
      run: ["man_run", "run"],
      jump: ["man_runningjump", "runningjump", "man_jump", "jump"],
      idle: ["man_idle", "idle", "man_standing", "standing"],
      death: ["man_death", "death"],
      walk: ["man_walk", "walk"],
    };

    for (const [key, aliases] of Object.entries(defs)) {
      const clip = this._findClip(clips, aliases);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(key, action);
    }

    this._runAction = this.actions.get("run") || this.actions.get("walk") || null;
    this._jumpAction = this.actions.get("jump") || null;
    this._idleAction = this.actions.get("idle") || this.actions.get("walk") || this._runAction;
    this._deathAction = this.actions.get("death") || null;

    if (this._runAction) {
      this._runAction.reset().play();
      this._activeAction = this._runAction;
      this._currentState = "run";
    }
  }

  _switch(action, state, { fade = 0.12, once = false } = {}) {
    if (!action || (this._activeAction === action && this._currentState === state)) return;

    const previous = this._activeAction;
    action.enabled = true;
    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    if (once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    action.play();

    if (previous && previous !== action) previous.crossFadeTo(action, fade, false);
    this._activeAction = action;
    this._currentState = state;
  }

  update(dt, {
    speed = 0,
    airborne = false,
    verticalVelocity = 0,
    sliding = false,
    caught = false,
    escaped = false,
    boosting = false,
    impactLean = 0,
  } = {}) {
    this._time += dt;

    if (caught) {
      if (this._deathAction) this._switch(this._deathAction, "death", { fade: 0.08, once: true });
      else this._switch(this._idleAction, "caught", { fade: 0.1 });
    } else if (escaped || speed < 0.25) {
      this._switch(this._idleAction, "idle", { fade: 0.18 });
    } else if (airborne && this._jumpAction) {
      this._switch(this._jumpAction, "jump", { fade: 0.08, once: true });
    } else {
      this._switch(this._runAction, "run", { fade: 0.1 });
    }

    if (this._activeAction && this._currentState === "run") {
      // The source run was authored near an ordinary sprint.  Drive playback
      // with game speed so legs do not moonwalk as the runner changes gears.
      this._activeAction.timeScale = THREE.MathUtils.clamp(speed / 11.5, 0.72, 2.25);
    }

    // Slide does not have a dedicated clip in the supplied FBX.  Keep the run
    // animation but turn it into a deliberate duck/slide pose at the visual
    // root.  Collision height remains entirely Level01-owned.
    const targetY = sliding ? -0.43 : 0;
    const targetPitch = sliding ? -0.82 : airborne ? THREE.MathUtils.clamp(-verticalVelocity * 0.018, -0.14, 0.14) : 0;
    const targetScaleY = sliding ? 0.72 : 1;
    const poseRate = sliding ? 18 : 12;
    const a = 1 - Math.exp(-poseRate * dt);
    this.pose.position.y = THREE.MathUtils.lerp(this.pose.position.y, targetY, a);
    this.pose.rotation.x = THREE.MathUtils.lerp(this.pose.rotation.x, targetPitch, a);
    this.pose.rotation.z = THREE.MathUtils.lerp(this.pose.rotation.z, impactLean, 1 - Math.exp(-20 * dt));
    this.pose.scale.y = THREE.MathUtils.lerp(this.pose.scale.y, targetScaleY, a);

    // Slight forward sprint lean, stronger during boost.  It is small enough
    // not to fight the jump/slide silhouette.
    if (!sliding) {
      const sprintLean = boosting ? -0.11 : speed > 18 ? -0.065 : -0.025;
      this.pose.rotation.x = THREE.MathUtils.lerp(this.pose.rotation.x, sprintLean + targetPitch, 1 - Math.exp(-7 * dt));
    }

    if (this.keyStatusLight) {
      this.keyStatusLight.intensity = 0.24 + Math.sin(this._time * 5.4) * 0.055 + (boosting ? 0.08 : 0);
    }

    this.mixer.update(dt);
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
    }
  }
}