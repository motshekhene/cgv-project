/**
 * The game's two characters, for every level and cutscene: the Mixamo builds
 * from tools/build-character.py (Kai is 'kai-bryce', the Handler is
 * 'handler-monk'), each a GLB with every move as a named animation plus a
 * JSON of the build's measurements. If a build is missing, the old
 * Quaternius FBX (`fallback`) stands in, so nothing breaks.
 *
 *   const kai = await loadRig(assets, 'kai-bryce', 'kai.fbx');
 *   // kai.source: a scene with .animations (clone it before use); kai.meta: measurements, or null for the FBX
 *
 * Mixamo clip names (lower case): idle, walk, run, death, hit, dodge, block,
 * jab, cross, hook, kick... (Kai, plus 'relax', a fight stance easing into a
 * relaxed stand); idle, run, lunge, sweep, combo, jump, stunned, angry... (the
 * Handler). The Quaternius ones are Man_Run etc.
 */
export async function loadRig(assets, name, fallback) {
  try {
    const [gltf, meta] = await Promise.all([
      assets.model(`characters/${name}.glb`),
      fetch(assets.resolve(`characters/${name}.json`)).then((r) => {
        if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
        return r.json();
      }),
    ]);
    gltf.scene.animations = gltf.animations;
    return { source: gltf.scene, meta };
  } catch (e) {
    console.warn(`[rig] no ${name} build, using the Quaternius ${fallback}:`, e?.message || e);
    const source = await assets.fbx(`characters/${fallback}`).catch((err) => {
      console.warn(`[rig] no ${fallback} either:`, err?.message || err);
      return null;
    });
    return { source, meta: null };
  }
}
