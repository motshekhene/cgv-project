import * as THREE from 'three';
import { disposeObject } from './Level.js';

/**
 * CHARACTERS — one place where Kai and the Handler come from.
 *
 * Every level needs the same two people, so they are defined once here rather
 * than three times in three branches. Import this instead of building figures
 * out of capsules in your own level:
 *
 *   import { attachCharacter } from '../core/Characters.js';
 *   this.kaiModel = attachCharacter(this.assets, 'kai', this.kai);
 *   // ... every frame:
 *   if (this.kaiModel) this.kaiModel.update(dt);
 *   // ... when something happens:
 *   this.kaiModel.play('run');
 *
 * ----------------------------------------------------------------------------
 * MIXAMO FBX — READ THIS BEFORE YOU COMMIT ANYTHING
 * ----------------------------------------------------------------------------
 * Mixamo hands you "FBX Binary (.fbx)", and it has three habits that will cost
 * you an afternoon if you do not know about them. All three are handled here:
 *
 *  1. CENTIMETRES. Mixamo exports at 100x the scale Three.js expects, so a
 *     straight drop-in gives you a person the size of a building. _normalise()
 *     measures the model and rescales it to the height declared below, so the
 *     file's units stop mattering.
 *
 *  2. ANIMATIONS COME IN SEPARATE FILES. The character download is a T-pose.
 *     Each animation is its own .fbx, usually named `character@run.fbx`. They
 *     all share Mixamo's bone names (mixamorigHips and friends), so a clip from
 *     one file plays on the skeleton from another — which is exactly what the
 *     `clips` map below sets up. Download each animation as
 *     "FBX Binary, Without Skin" so you are not shipping the mesh seven times.
 *
 *  3. TEXTURES ARE REFERENCED, NOT EMBEDDED, unless you ask for it. If your
 *     character turns up grey or white, the .fbx is looking for an images
 *     folder you did not commit. Either commit it next to the .fbx or set a
 *     material in `onReady` — the Handler already does the latter, because he
 *     has to be a silhouette in the prologue anyway.
 *
 * GLB works too. If anyone converts to .glb later, just change the filename
 * below — the loader picks the loader by extension and nothing else changes.
 *
 * ----------------------------------------------------------------------------
 * WHEN THE FILES ARE NOT THERE YET
 * ----------------------------------------------------------------------------
 * It never throws and it never blocks. `attachCharacter` returns immediately,
 * loads in the background, and only swaps the model in once it has arrived.
 * Whatever placeholder you already put in the group stays on screen until
 * then, and stays forever if the file is missing. So this is safe to merge
 * before anybody has committed a model, and safe to keep in the build if one
 * is ever pulled. Nothing in a level should depend on the model being there —
 * put collision, timing and camera work on the group, not on the mesh.
 *
 * ----------------------------------------------------------------------------
 * CREDIT
 * ----------------------------------------------------------------------------
 * The licence on each source is recorded below and MUST also appear in the
 * README and in the submission. CC Attribution means the author gets named,
 * and that obligation is ours, not Sketchfab's or Mixamo's.
 */

export const CHARACTERS = {
  kai: {
    base: 'characters/kai.fbx',
    height: 1.80,
    clips: {
      idle: 'characters/kai@idle.fbx',
      walk: 'characters/kai@walk.fbx',
      run: 'characters/kai@run.fbx',
      jump: 'characters/kai@jump.fbx',
      slide: 'characters/kai@slide.fbx',
      hit: 'characters/kai@hit.fbx',
      type: 'characters/kai@typing.fbx',
    },
    source: 'Sketchfab — "Male Hero Character - Rigged Low Poly Game Ready", rigged via Mixamo',
    author: 'medapatirahul21',
    licence: 'check the model page before submission — free download',
  },
  handler: {
    base: 'characters/handler.fbx',
    height: 1.86,                     // he reads taller than Kai on purpose
    clips: {
      idle: 'characters/handler@idle.fbx',
      walk: 'characters/handler@walk.fbx',
      run: 'characters/handler@run.fbx',
      hit: 'characters/handler@hit.fbx',
    },
    source: 'Sketchfab — "Man In Coat - Human Rigged Model", rigged via Mixamo',
    author: 'see the model page',
    licence: 'CC Attribution (CC-BY) — the author MUST be credited in the README',
  },
};

/**
 * Mixamo names most clips "mixamo.com" regardless of what you downloaded, so
 * the filename is the only reliable label. A clip loaded from kai@run.fbx is
 * registered as 'run' here no matter what the file calls it internally. These
 * aliases are the fallback for a model that arrived with sensibly named clips
 * already baked in (a single .glb export, usually).
 */
const CLIP_ALIASES = {
  idle: ['idle', 'breathing', 'standing'],
  walk: ['walk'],
  run: ['run', 'sprint', 'jog'],
  jump: ['jump'],
  land: ['land'],
  slide: ['slide', 'crouch', 'roll'],
  hit: ['hit', 'impact', 'react'],
  fall: ['fall', 'death', 'dying'],
  type: ['type', 'typing', 'sitting'],
};

/**
 * Start loading `who` into `group`. Returns a handle, or null if the character
 * is not one we know about. The handle is safe to use before the model lands:
 * update() and play() are no-ops until then, and a play() called early is
 * remembered and applied once the clips arrive.
 */
export function attachCharacter(assets, who, group, opts = {}) {
  const spec = CHARACTERS[who];
  if (!spec) {
    console.warn(`[characters] no character called "${who}"`);
    return null;
  }

  const handle = {
    who,
    ready: false,
    root: null,
    mixer: null,
    actions: new Map(),     // logical name -> AnimationAction
    clips: [],              // whatever came baked into the base file
    current: null,
    currentName: null,
    _wanted: null,

    update(dt) { if (this.mixer) this.mixer.update(dt); },

    /** Cross-fade to a named animation. Safe to call every frame. */
    play(name, fade = 0.22) {
      if (!this.mixer) { this._wanted = name; return false; }
      if (this.currentName === name) return true;
      const next = this.actions.get(name) || this._fromBakedClips(name);
      if (!next) return false;
      next.reset().fadeIn(fade).play();
      if (this.current && this.current !== next) this.current.fadeOut(fade);
      this.current = next;
      this.currentName = name;
      return true;
    },

    /** Which animations actually loaded — useful when debugging a silent rig. */
    available() { return [...this.actions.keys()]; },

    _fromBakedClips(name) {
      const clip = _findClip(this.clips, name);
      if (!clip) return null;
      const action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
      return action;
    },

    dispose() {
      if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
      if (this.root) { group.remove(this.root); disposeObject(this.root); }
      this.root = null; this.mixer = null; this.ready = false;
      this.actions.clear(); this.clips = []; this.current = null; this.currentName = null;
    },
  };

  if (!assets) return handle;        // headless tests pass no registry

  _loadInto(assets, spec, group, handle, opts).catch((err) => {
    console.warn(`[characters] ${who}: ${err && err.message ? err.message : err}`);
  });

  return handle;
}

async function _loadInto(assets, spec, group, handle, opts) {
  const baseUrl = assets.resolve(spec.base);
  if (!(await _exists(baseUrl))) {
    console.info(
      `[characters] ${handle.who}: no ./assets/${spec.base} yet, using the placeholder`,
    );
    return;
  }

  const loaded = await _loadModel(assets, spec.base);
  const root = loaded.object;
  if (!root) return;
  // the level may have been torn down while this was in flight
  if (!group.parent) { disposeObject(root); return; }

  _normalise(root, spec.height);
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = false; }
  });

  // hide the placeholder rather than deleting it, so a level that measured the
  // placeholder's bounds earlier is not surprised
  if (opts.hidePlaceholder !== false) {
    for (const child of group.children) {
      if (child !== root && !child.isLight) child.visible = false;
    }
  }

  group.add(root);
  handle.root = root;
  handle.clips = loaded.animations || [];
  handle.mixer = new THREE.AnimationMixer(root);

  // Pull each animation out of its own file. They are independent, so one
  // missing walk cycle does not stop the run cycle arriving.
  const names = Object.keys(spec.clips || {});
  await Promise.all(names.map(async (name) => {
    const path = spec.clips[name];
    try {
      if (!(await _exists(assets.resolve(path)))) return;
      const anim = await _loadModel(assets, path);
      const clip = (anim.animations || [])[0];
      if (!clip) return;
      clip.name = name;                       // Mixamo calls them all "mixamo.com"
      handle.actions.set(name, handle.mixer.clipAction(clip));
      // the animation file's own mesh, if they downloaded "with skin", is not
      // wanted — we only took the clip off it
      if (anim.object && anim.object !== root) disposeObject(anim.object);
    } catch (_) {
      console.info(`[characters] ${handle.who}: could not read ${path}, skipping`);
    }
  }));

  handle.ready = true;
  const first = handle._wanted || 'idle';
  if (!handle.play(first, 0) && handle.actions.size === 0 && handle.clips.length === 0) {
    console.info(
      `[characters] ${handle.who}: model loaded but no animations found. ` +
      `Download each one from Mixamo as FBX Binary (Without Skin) and name it ` +
      `like "${spec.clips ? Object.values(spec.clips)[0] : 'name@clip.fbx'}".`,
    );
  }

  if (opts.onReady) opts.onReady(handle);
}

/** Pick the loader by extension, so .fbx and .glb are both just "the model". */
async function _loadModel(assets, path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.fbx')) {
    const obj = await assets.fbx(path);
    return { object: obj, animations: obj.animations || [] };
  }
  const gltf = await assets.model(path);
  return { object: gltf.scene || gltf.scenes?.[0], animations: gltf.animations || [] };
}

/**
 * Downloaded models arrive at arbitrary scale and arbitrary origin — Mixamo in
 * centimetres, Sketchfab in whatever the author used. Put the feet on y=0,
 * centre on x/z, and scale to the height we asked for, so a level can position
 * a character without knowing anything about the file it came from.
 */
function _normalise(root, height) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);

  if (size.y > 0.001) {
    const k = height / size.y;
    root.scale.multiplyScalar(k);
    box.min.multiplyScalar(k);
    centre.multiplyScalar(k);
  }
  root.position.x -= centre.x;
  root.position.z -= centre.z;
  root.position.y -= box.min.y;
}

function _findClip(clips, name) {
  if (!clips.length) return null;
  const wanted = CLIP_ALIASES[name] || [name];
  for (const w of wanted) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(w));
    if (hit) return hit;
  }
  // a single-clip export is more useful played than ignored
  return clips.length === 1 ? clips[0] : null;
}

/**
 * Is this file actually there? A HEAD request, and never a thrown error.
 *
 * This exists so the console stays clean while models are still being sourced:
 * AssetRegistry logs a red error on any failed load, which is right for a model
 * a level needs and wrong for one that is optional by design.
 */
async function _exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch (_) {
    return false;
  }
}