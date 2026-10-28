import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A player from any Mixamo character, built in the browser: no Blender, and no
 * animation downloads. The character (an FBX, downloaded from Mixamo with skin,
 * in T-pose) gets every one of Kai's moves, the clips in kai-bryce.glb,
 * retargeted onto its own skeleton, and comes out as a GLB + JSON pair just like
 * the ones tools/build-character.py writes, so the game loads it the same way:
 *
 *   npm run dev, open /tools/build-player.html, pick the FBX and give it an id;
 *   save the two files it hands back into assets/characters/, then add the
 *   player to src/player/roster.js.
 *
 * Only what the game draws is kept: the colour and normal maps at 1024 px
 * (WebP), on one skeleton, in metres. The JSON is Kai's (the moves keep his
 * timing, so the fight's hit windows still line up) with this character's own
 * height. Mixamo's FBX 6.1 downloads can't be read (three.js reads FBX 7 and
 * up): download those again as "FBX Binary".
 *
 * Retargeting. Every Mixamo skeleton has the same bones with the same names
 * (only the prefix differs: mixamorig:, mixamorig1:...), and every character
 * is bound in a T-pose facing +Z, so a move carries over bone by bone in world
 * space: each bone of the new character turns from its own rest the way Kai's
 * turns from his. First each bone is lined up with Kai's (the rotation taking
 * its rest direction, towards its child, onto his), so a different build (the
 * goblin's long head and short legs) still strikes the same pose. For a bone b
 * with parent p, where A is Kai's rest rotation in the world, B the new
 * character's and R the line-up:
 *
 *   world(b, t) = kaiWorld(b, t) · A⁻¹ · R · B
 *   local(b, t) = (Bp⁻¹ · Rp⁻¹ · Ap) · kaiLocal(b, t) · (A⁻¹ · R · B)
 *
 * two constants a bone, applied to every key. Only the hips move as well as
 * turn: how far they move from rest is scaled by how high each character's
 * hips are, so a shorter character sits, crouches and bobs by its own leg
 * length. Every other bone keeps its own length (Kai's position tracks are
 * left out).
 */
const KAI = '/assets/characters/kai-bryce';
const TEX = 1024;
const KEEP = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']; // what the game's material uses
// the child a bone points at, where it has more than one
const TOWARD = { Hips: 'Spine', Spine2: 'Neck', LeftHand: 'LeftHandMiddle1', RightHand: 'RightHandMiddle1' };

/** 'mixamorig5:Hips', 'mixamorig2Hips', 'mixamorigHips' -> 'Hips' */
const strip = (name) => name.replace(/^mixamorig\d*:?/, '');

/** Build a player from an FBX (a URL or a File). Returns { glb: ArrayBuffer, meta, report }. */
export async function buildPlayer(fbxSource) {
  const url = fbxSource instanceof Blob ? URL.createObjectURL(fbxSource) : fbxSource;
  const [fbx, kai, kaiMeta] = await Promise.all([
    new FBXLoader().loadAsync(url),
    new GLTFLoader().loadAsync(`${KAI}.glb`),
    fetch(`${KAI}.json`).then((r) => r.json()),
  ]);
  if (fbxSource instanceof Blob) URL.revokeObjectURL(url);
  await texturesReady(fbx);

  const { root, hips } = oneSkeleton(fbx);
  const animations = retarget(kai, root);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const feet = ['LeftFoot', 'RightFoot'].map((n) => hips.getObjectByName('mixamorig' + n).getWorldPosition(new THREE.Vector3()).y);
  const meta = {
    ...structuredClone(kaiMeta),
    ankle: round(Math.min(...feet)),
    hips: round(hips.getWorldPosition(new THREE.Vector3()).y),
    height: round(box.max.y - box.min.y),
    moves: 'kai-bryce', // the clips are Kai's, retargeted (tools/build-player.js)
  };

  const glb = await new GLTFExporter().parseAsync(root, {
    binary: true, trs: true, onlyVisible: false, animations, maxTextureSize: TEX,
  });
  const report = {
    meshes: [], bones: 0, clips: animations.length, height: meta.height,
    tracks: animations[0]?.tracks.length ?? 0, kb: Math.round(glb.byteLength / 1024),
  };
  root.traverse((o) => {
    if (o.isBone) report.bones++;
    if (o.isMesh) report.meshes.push(`${o.name}: ${o.geometry.attributes.position.count} verts, ${[].concat(o.material).map((m) => m.name)}`);
  });
  return { glb, meta, report };
}

const round = (v) => Math.round(v * 1000) / 1000;

/** The FBX's embedded textures decode after the loader returns. */
async function texturesReady(fbx) {
  const maps = [];
  fbx.traverse((o) => {
    if (o.isMesh) for (const m of [].concat(o.material)) for (const t of [m.map, m.normalMap]) if (t) maps.push(t);
  });
  for (let i = 0; i < 300 && maps.some((t) => !(t.image?.width > 0)); i++) await new Promise((r) => setTimeout(r, 100));
}

/**
 * The character on one clean skeleton, in metres, in its bind pose (the T-pose).
 * FBXLoader gives a mesh weighted to bones another mesh also uses its own copy
 * of each one, hung under the first with the same name; every mesh is bound to
 * the one set of bones here, and the copies dropped. Bones are named as Kai's
 * load ('mixamorigHips'), whatever prefix the download had.
 */
function oneSkeleton(fbx) {
  const meshes = [];
  fbx.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) throw new Error('no skinned mesh: download the character "with skin"');
  // twice: a bone's parent can be in another mesh's skeleton, posed after it
  for (let pass = 0; pass < 2; pass++) for (const m of meshes) m.skeleton.pose();

  const hips = fbx.children.find((o) => o.isBone && strip(o.name) === 'Hips') || meshes[0].skeleton.bones.find((b) => strip(b.name) === 'Hips');
  if (!hips) throw new Error('no mixamorig Hips: is it a Mixamo character?');
  const bones = {};
  const walk = (bone) => {
    bones[strip(bone.name)] = bone;
    for (const c of [...bone.children]) {
      if (!c.isBone) continue;
      if (strip(c.name) === strip(bone.name)) bone.remove(c); // a copy
      else walk(c);
    }
  };
  walk(hips);
  for (const [n, b] of Object.entries(bones)) b.name = 'mixamorig' + n;

  // into metres: the bones' offsets and the meshes' vertices, then bind again in that pose
  const root = new THREE.Group();
  root.name = 'Player';
  root.add(hips);
  for (const b of Object.values(bones)) b.position.multiplyScalar(0.01);
  root.updateMatrixWorld(true);

  // every mesh on the whole skeleton, as Kai's are (Level 1 reads his legs' rest off the first mesh's)
  const all = Object.values(bones); // the hips first
  const skeleton = new THREE.Skeleton(all);
  skeleton.calculateInverses();
  const materials = new Map(); // one per name: the meshes share them, and the export shares their textures
  for (const mesh of meshes) {
    const index = mesh.skeleton.bones.map((b) => all.indexOf(bones[strip(b.name)]));
    if (index.some((i) => i < 0)) throw new Error(`${mesh.name}: weighted to a bone outside the skeleton`);
    const skinned = new THREE.SkinnedMesh(cleanGeometry(mesh.geometry, mesh.matrixWorld, index), [].concat(mesh.material).map((m) => material(m, materials)));
    if (!Array.isArray(mesh.material)) skinned.material = skinned.material[0];
    skinned.name = mesh.name;
    root.add(skinned);
    skinned.bind(skeleton, new THREE.Matrix4());
  }
  return { root, hips };
}

/**
 * Only what the game draws, indexed (the FBX gives every corner of every
 * triangle its own vertex), in metres; `index` takes each of the mesh's own
 * bone numbers to the whole skeleton's.
 */
function cleanGeometry(src, matrix, index) {
  const g = new THREE.BufferGeometry();
  for (const k of KEEP) if (src.attributes[k]) g.setAttribute(k, src.attributes[k].clone());
  g.applyMatrix4(new THREE.Matrix4().makeScale(0.01, 0.01, 0.01).multiply(matrix));
  const j = g.attributes.skinIndex;
  for (let i = 0; i < j.count; i++) for (let c = 0; c < 4; c++) j.setComponent(i, c, index[j.getComponent(i, c)]);
  // four weights a vertex, adding up to one
  const w = g.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const s = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    if (s > 0) w.setXYZW(i, w.getX(i) / s, w.getY(i) / s, w.getZ(i) / s, w.getW(i) / s);
  }
  const out = mergeVertices(g, 1e-5);
  for (const { start, count, materialIndex } of src.groups) out.addGroup(start, count, materialIndex); // same triangles, same order
  return out;
}

/** The game's material (Fighter makes it matte PBR): the colour and normal maps, cut out where the FBX's is see-through. */
function material(m, cache) {
  if (cache.has(m.name)) return cache.get(m.name);
  const tex = (t) => {
    if (!t) return null;
    t.userData.mimeType = 'image/webp';
    return t;
  };
  const cutout = m.transparent || m.alphaTest > 0; // hair cards, eyelashes
  const c = new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.map ? 0xffffff : m.color,
    map: tex(m.map),
    normalMap: tex(m.normalMap),
    roughness: 0.92,
    metalness: 0,
    alphaTest: cutout ? 0.5 : 0,
    side: cutout ? THREE.DoubleSide : THREE.FrontSide,
  });
  cache.set(m.name, c);
  return c;
}

/** Kai's clips, onto the bones under `root` (see the top of this file). */
function retarget(kai, root) {
  const src = {}, dst = {};
  kai.scene.updateMatrixWorld(true);
  kai.scene.traverse((o) => { if (o.isBone) src[strip(o.name)] = o; });
  root.traverse((o) => { if (o.isBone) dst[strip(o.name)] = o; });

  const wq = (o) => (o ? o.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  // each bone's line-up: its rest direction (towards the child it points at) onto Kai's
  const line = {};
  const lineUp = (n) => {
    if (line[n]) return line[n];
    const child = TOWARD[n] || Object.keys(dst).find((c) => dst[c].parent === dst[n] && src[c]?.parent === src[n]);
    const parent = dst[n].parent?.isBone ? strip(dst[n].parent.name) : null;
    if (!child || !src[n] || !src[child] || !dst[child]) return (line[n] = parent ? lineUp(parent) : new THREE.Quaternion());
    const a = wp(src[child]).sub(wp(src[n])).normalize();
    const b = wp(dst[child]).sub(wp(dst[n])).normalize();
    return (line[n] = new THREE.Quaternion().setFromUnitVectors(b, a));
  };

  const fix = {};
  for (const n of Object.keys(dst)) {
    if (!src[n]) continue;
    const parent = dst[n].parent?.isBone ? strip(dst[n].parent.name) : null;
    if (parent && !src[parent]) continue;
    const A = wq(src[n]), B = wq(dst[n]), R = lineUp(n);
    const Ap = wq(src[n].parent), Bp = wq(dst[n].parent), Rp = parent ? lineUp(parent) : new THREE.Quaternion();
    fix[n] = {
      pre: Bp.clone().invert().multiply(Rp.clone().invert()).multiply(Ap),
      post: A.clone().invert().multiply(R).multiply(B),
    };
  }

  // the hips: their way from rest, in the world, scaled by hip height
  const sh = src.Hips, dh = dst.Hips;
  const s0 = wp(sh), d0 = wp(dh);
  const k = d0.y / s0.y;
  const sParent = sh.parent.matrixWorld.clone();
  const dParentInv = dh.parent.matrixWorld.clone().invert();

  const q = new THREE.Quaternion(), p = new THREE.Vector3();
  return kai.animations.map((clip) => {
    const tracks = [];
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const n = strip(track.name.slice(0, dot)), prop = track.name.slice(dot + 1);
      if (!fix[n]) continue;
      const v = track.values.slice();
      if (prop === 'quaternion') {
        for (let i = 0; i < v.length; i += 4) {
          q.fromArray(v, i).premultiply(fix[n].pre).multiply(fix[n].post).normalize().toArray(v, i);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`mixamorig${n}.quaternion`, track.times.slice(), v));
      } else if (prop === 'position' && n === 'Hips') {
        for (let i = 0; i < v.length; i += 3) {
          p.fromArray(v, i).applyMatrix4(sParent).sub(s0).multiplyScalar(k).add(d0).applyMatrix4(dParentInv).toArray(v, i);
        }
        tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', track.times.slice(), v));
      }
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
}
