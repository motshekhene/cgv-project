import * as THREE from 'three';

/**
 * Shared jungle prop helpers, used the same way by all three levels.
 *
 *   const col = await loadProp(assets, 'ruins/column-round.fbx', TINT.stone);
 *   place(this.root, col, x, 0, z, { s: RU });              // one clone
 *   scatter(this.root, grass, spots, { shadow: false });    // one InstancedMesh per sub-mesh
 *
 * FBX imports as glossy Phong and the ruins pack loses its leaf/bark texture
 * links, so every prop goes through toStandard() before it is placed
 * (assets/jungle/README.md, "Materials"). Scale factors per pack are in the
 * same README; RU is the one for the ruins kit.
 */
export const RU = 0.016; // ruins pack: cm on a 2 m grid -> 3.2 m modules next to a 1.8 m fighter

/** Material-name tints that give the mossy jungle-stone look. */
export const TINT = {
  stone: { Main: 0x7a7c66, Highlights: 0x908f78, Green: 0x5f9a2e },
  statue: { Stone: 0xa9a892 },
  rock: { Rock: 0x7d8274 },
};

const LEAF = /leaf|leaves/i;
const BARK = /bark/i;
const FIRE = /fire|flame/i;

/**
 * Load a model from assets/jungle/models/ and return a matte-PBR template.
 * The template is not added to the scene; place() or scatter() it. Every call
 * builds fresh materials, so two levels can tint the same model differently.
 */
export async function loadProp(assets, path, tint = {}) {
  const full = 'jungle/models/' + path;
  const src = full.endsWith('.fbx') ? await assets.fbx(full) : (await assets.model(full)).scene;
  const ruins = path.startsWith('ruins/');
  const [leaf, bark] = ruins
    ? await Promise.all([
        assets.texture('jungle/models/ruins/leaf-texture.png'),
        assets.texture('jungle/models/ruins/bark-texture.jpg'),
      ])
    : [null, null];
  const prop = src.clone();
  toStandard(prop, tint, leaf, bark);
  return prop;
}

/** Swap every material under root for a matte MeshStandardMaterial, tinted by name. */
export function toStandard(root, tint = {}, leaf = null, bark = null) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    mergeGroups(o.geometry);
    const hasUv = !!o.geometry.attributes.uv;
    const conv = (m) => {
      const t = tint[m.name] ?? tint['*'];
      const isLeaf = hasUv && !!leaf && LEAF.test(m.name);
      const fallback = isLeaf ? leaf : hasUv && BARK.test(m.name) ? bark : null;
      const map = m.map || fallback;
      const c = new THREE.MeshStandardMaterial({
        name: m.name,
        color: t !== undefined ? new THREE.Color(t) : m.color ? m.color.clone() : new THREE.Color(0xffffff),
        map,
        roughness: m.isMeshStandardMaterial ? Math.max(0.55, m.roughness) : 0.85,
        metalness: m.isMeshStandardMaterial ? Math.min(m.metalness, 0.3) : 0,
        // only leaf cards need both sides; on closed meshes DoubleSide just shades hidden back faces
        side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
        vertexColors: !!m.vertexColors,
        alphaTest: map ? 0.45 : 0,
      });
      if (FIRE.test(m.name)) {
        c.emissive.set(0xff8a2a);
        c.emissiveIntensity = 4;
      }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

/**
 * The packs' FBX files interleave materials face by face, so one wall comes in
 * as ~200 geometry groups, and every group is a draw call (twice, with shadows).
 * Reorder the triangles so each material is one contiguous group. Idempotent,
 * and safe to run on the shared cached geometry.
 */
export function mergeGroups(geo) {
  const groups = geo.groups;
  if (groups.length <= 1) return;
  const byMat = new Map();
  for (const g of groups) {
    if (!byMat.has(g.materialIndex)) byMat.set(g.materialIndex, []);
    byMat.get(g.materialIndex).push(g);
  }
  if (byMat.size === groups.length) return;

  const order = [];
  const merged = [];
  for (const [materialIndex, list] of [...byMat].sort((a, b) => a[0] - b[0])) {
    const start = order.length;
    for (const g of list) for (let i = g.start; i < g.start + g.count; i++) order.push(i);
    merged.push([start, order.length - start, materialIndex]);
  }
  if (geo.index) {
    const src = geo.index.array;
    const dst = new src.constructor(order.length);
    for (let i = 0; i < order.length; i++) dst[i] = src[order[i]];
    geo.setIndex(new THREE.BufferAttribute(dst, 1));
  } else {
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.attributes[name];
      const n = a.itemSize;
      const dst = new a.array.constructor(order.length * n);
      for (let i = 0; i < order.length; i++) {
        for (let k = 0; k < n; k++) dst[i * n + k] = a.array[order[i] * n + k];
      }
      geo.setAttribute(name, new THREE.BufferAttribute(dst, n, a.normalized));
    }
  }
  geo.clearGroups();
  for (const [start, count, mi] of merged) geo.addGroup(start, count, mi);
}

/** Add one clone of a template. s = uniform scale (sy overrides height), ry = yaw. */
export function place(parent, prop, x, y, z, { s = 1, sy, rx = 0, ry = 0, rz = 0, shadow = true } = {}) {
  const o = prop.clone();
  if (!shadow) o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.set(s, sy ?? s, s);
  parent.add(o);
  return o;
}

/**
 * Many copies of one template as InstancedMeshes: one draw call per sub-mesh
 * instead of one per copy. spots = [{ x, y, z, s, sy?, rx?, ry?, rz? }, ...].
 */
export function scatter(parent, prop, spots, { shadow = false, receive = true } = {}) {
  const group = new THREE.Group();
  if (!spots.length) return group;
  prop.updateMatrixWorld(true);
  const inv = prop.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  prop.traverse((o) => {
    if (!o.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const inst = new THREE.InstancedMesh(o.geometry, o.material, spots.length);
    spots.forEach((it, i) => {
      q.setFromEuler(e.set(it.rx || 0, it.ry || 0, it.rz || 0));
      m.compose(p.set(it.x, it.y, it.z), q, sc.set(it.s, it.sy ?? it.s, it.s)).multiply(local);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = shadow;
    inst.receiveShadow = receive;
    inst.computeBoundingSphere();
    group.add(inst);
  });
  parent.add(group);
  return group;
}

/**
 * ambientCG texture set from assets/jungle/textures/ as a MeshStandardMaterial.
 * set = 'forest-floor' | 'mud' | 'mossy-rock' | 'cliff-rock' | 'wood-planks' | 'concrete'.
 * Textures are cloned so two materials can repeat the same set differently.
 */
export async function pbr(assets, set, { repeat = 1, tint = 0xffffff, roughness = 1, normalScale = 1 } = {}) {
  const load = async (suffix, srgb) => {
    const t = (await assets.texture(`jungle/textures/${set}-${suffix}.jpg`, { srgb })).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const [map, normalMap, roughnessMap] = await Promise.all([
    load('color', true),
    load('normal', false),
    load('roughness', false),
  ]);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    color: tint,
    roughness,
  });
}

/**
 * Text panel drawn on a canvas: trail arrows, road signs, the SITE 7 notice.
 * lines = ['SITE 7', { t: 'NO ENTRY', size: 0.6, color: '#a3231c' }].
 * basic = true makes it unlit (glow > 1 pushes it brighter than the scene).
 */
export function sign(lines, { w = 4, h = 1, bg = '#0b0f14', fg = '#ffb547', glow = 1.4, border = null, font = 'Bahnschrift, Segoe UI, sans-serif', weight = 700, px = 512, basic = false } = {}) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.max(32, Math.round((px * h) / w));
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = c.height * 0.05;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
  }
  const rows = lines.map((l) => (typeof l === 'string' ? { t: l } : l));
  const total = rows.reduce((a, r) => a + (r.size ?? 1), 0);
  let y = c.height * 0.08;
  const usable = c.height * 0.84;
  for (const r of rows) {
    const rowH = (usable * (r.size ?? 1)) / total;
    let fs = rowH * 0.72;
    g.font = `${r.weight ?? weight} ${fs}px ${font}`;
    const tw = g.measureText(r.t).width;
    if (tw > c.width * 0.9) {
      fs *= (c.width * 0.9) / tw;
      g.font = `${r.weight ?? weight} ${fs}px ${font}`;
    }
    g.fillStyle = r.color ?? fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(r.t, c.width / 2, y + rowH / 2);
    y += rowH;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const mat = basic
    ? new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(glow, glow, glow) })
    : new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/** Small seeded RNG (mulberry32), so scatter layouts are the same every run. */
export function rng(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
