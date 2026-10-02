import * as THREE from "three";

const MOSS_TINT = {
  Main: 0x7a7c66,
  Highlights: 0x908f78,
  Green: 0x5f9a2e,
};

function cloneTexture(texture, { repeat = null, srgb = null } = {}) {
  if (!texture) return null;
  const t = texture.clone();
  t.needsUpdate = true;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (srgb === true) t.colorSpace = THREE.SRGBColorSpace;
  if (srgb === false) t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

function standardisePrototype(source, {
  tint = {},
  leafTexture = null,
  barkTexture = null,
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const root = source.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;

    // Keep the AssetRegistry copy pristine. A local geometry clone means
    // Level.teardown() can dispose this level safely without corrupting the
    // cached model that another level (or restart) may ask for later.
    if (o.geometry) o.geometry = o.geometry.clone();

    const originals = Array.isArray(o.material) ? o.material : [o.material];
    const converted = originals.map((m) => {
      const name = m?.name || "";
      const requestedTint = tint[name] ?? tint["*"];
      let map = m?.map ? cloneTexture(m.map, { srgb: true }) : null;

      if (!map && o.geometry?.attributes?.uv) {
        if (/leaf|leaves/i.test(name) && leafTexture) map = cloneTexture(leafTexture, { srgb: true });
        else if (/bark/i.test(name) && barkTexture) map = cloneTexture(barkTexture, { srgb: true });
      }

      const mat = new THREE.MeshStandardMaterial({
        name,
        color:
          requestedTint !== undefined
            ? new THREE.Color(requestedTint)
            : m?.color
              ? m.color.clone()
              : new THREE.Color(0xffffff),
        map,
        roughness: m?.isMeshStandardMaterial ? Math.max(0.55, m.roughness) : 0.85,
        metalness: m?.isMeshStandardMaterial ? Math.min(0.25, m.metalness) : 0,
        side: THREE.DoubleSide,
        alphaTest: map && /leaf|grass|bush/i.test(name) ? 0.42 : 0,
      });

      return mat;
    });

    o.material = Array.isArray(o.material) ? converted : converted[0];
    o.castShadow = castShadow;
    o.receiveShadow = receiveShadow;
  });
  return root;
}

function gltfRoot(gltf) {
  return gltf?.scene || gltf;
}

export async function loadJungleKit(assets) {
  const [leaf, bark] = await Promise.all([
    assets.texture("jungle/models/ruins/leaf-texture.png"),
    assets.texture("jungle/models/ruins/bark-texture.jpg"),
  ]);

  const requests = {
    tree1: assets.fbx("jungle/models/nature/tree-1.fbx"),
    tree2: assets.fbx("jungle/models/nature/tree-2.fbx"),
    tree3: assets.fbx("jungle/models/nature/tree-3.fbx"),
    tree4: assets.fbx("jungle/models/nature/tree-4.fbx"),
    bush1: assets.fbx("jungle/models/nature/bush-1.fbx"),
    bush2: assets.fbx("jungle/models/nature/bush-2.fbx"),
    grass1: assets.fbx("jungle/models/nature/grass-1.fbx"),
    grass2: assets.fbx("jungle/models/nature/grass-2.fbx"),
    rock1: assets.fbx("jungle/models/nature/rock-1.fbx"),
    rock2: assets.fbx("jungle/models/nature/rock-2.fbx"),
    ruinTree: assets.fbx("jungle/models/ruins/tree-1.fbx"),
    deadTree: assets.fbx("jungle/models/ruins/dead-tree-1.fbx"),
    column: assets.fbx("jungle/models/ruins/column-round.fbx"),
    columnShort: assets.fbx("jungle/models/ruins/column-round-short.fbx"),
    arch: assets.fbx("jungle/models/ruins/arch-round.fbx"),
    gateArch: assets.fbx("jungle/models/ruins/arch-round-round-column.fbx"),
    gateDoor: assets.fbx("jungle/models/ruins/doors-round-arch.fbx"),
    wall: assets.fbx("jungle/models/ruins/wall-overgrown.fbx"),
    stag: assets.fbx("jungle/models/ruins/statue-stag.fbx"),
    trap: assets.fbx("jungle/models/ruins/bear-trap-open.fbx"),
    bridgeSection: assets.fbx("jungle/models/ruins/bridge-section.fbx"),
    logs: assets.model("jungle/models/props/logs.gltf"),
    crates: assets.model("jungle/models/props/crate-stack-big.gltf"),
    barrel: assets.model("jungle/models/props/barrel.gltf"),
    cutTrees: assets.model("jungle/models/props/tree-cluster-cut.gltf"),
  };

  const entries = await Promise.all(
    Object.entries(requests).map(async ([key, promise]) => [key, await promise]),
  );
  const raw = Object.fromEntries(entries);

  const p = (key, opts = {}) =>
    standardisePrototype(gltfRoot(raw[key]), {
      leafTexture: leaf,
      barkTexture: bark,
      ...opts,
    });

  return {
    tree1: p("tree1", { castShadow: false }),
    tree2: p("tree2", { castShadow: false }),
    tree3: p("tree3", { castShadow: false }),
    tree4: p("tree4", { castShadow: false }),
    bush1: p("bush1", { castShadow: false }),
    bush2: p("bush2", { castShadow: false }),
    grass1: p("grass1", { castShadow: false }),
    grass2: p("grass2", { castShadow: false }),
    rock1: p("rock1", { tint: { Rock: 0x7d8274 } }),
    rock2: p("rock2", { tint: { Rock: 0x737a6a } }),
    ruinTree: p("ruinTree", { castShadow: false }),
    deadTree: p("deadTree", { castShadow: true }),
    column: p("column", { tint: MOSS_TINT }),
    columnShort: p("columnShort", { tint: MOSS_TINT }),
    arch: p("arch", { tint: MOSS_TINT }),
    gateArch: p("gateArch", { tint: MOSS_TINT }),
    gateDoor: p("gateDoor", { tint: MOSS_TINT }),
    wall: p("wall", { tint: MOSS_TINT }),
    stag: p("stag", { tint: { Stone: 0xa9a892 } }),
    trap: p("trap", { tint: MOSS_TINT }),
    bridgeSection: p("bridgeSection", { tint: MOSS_TINT }),
    logs: p("logs"),
    crates: p("crates"),
    barrel: p("barrel"),
    cutTrees: p("cutTrees", { castShadow: false }),
  };
}

export async function createJungleMaterials(assets, length = 3600) {
  const [
    mudColor,
    mudNormal,
    mudRough,
    forestColor,
    forestNormal,
    forestRough,
    mossColor,
    mossNormal,
    mossRough,
  ] = await Promise.all([
    assets.texture("jungle/textures/mud-color.jpg"),
    assets.texture("jungle/textures/mud-normal.jpg", { srgb: false }),
    assets.texture("jungle/textures/mud-roughness.jpg", { srgb: false }),
    assets.texture("jungle/textures/forest-floor-color.jpg"),
    assets.texture("jungle/textures/forest-floor-normal.jpg", { srgb: false }),
    assets.texture("jungle/textures/forest-floor-roughness.jpg", { srgb: false }),
    assets.texture("jungle/textures/mossy-rock-color.jpg"),
    assets.texture("jungle/textures/mossy-rock-normal.jpg", { srgb: false }),
    assets.texture("jungle/textures/mossy-rock-roughness.jpg", { srgb: false }),
  ]);

  const mudRepeat = [2.4, Math.max(1, length / 3)];
  const forestRepeat = [20, Math.max(20, length / 5)];

  const trail = new THREE.MeshStandardMaterial({
    map: cloneTexture(mudColor, { repeat: mudRepeat, srgb: true }),
    normalMap: cloneTexture(mudNormal, { repeat: mudRepeat, srgb: false }),
    roughnessMap: cloneTexture(mudRough, { repeat: mudRepeat, srgb: false }),
    color: 0xc8a27a,
    roughness: 0.9,
    metalness: 0,
  });
  trail.normalScale.set(0.8, 0.8);

  const forest = new THREE.MeshStandardMaterial({
    map: cloneTexture(forestColor, { repeat: forestRepeat, srgb: true }),
    normalMap: cloneTexture(forestNormal, { repeat: forestRepeat, srgb: false }),
    roughnessMap: cloneTexture(forestRough, { repeat: forestRepeat, srgb: false }),
    color: 0x9fb07a,
    roughness: 1,
    metalness: 0,
  });
  forest.normalScale.set(0.7, 0.7);

  const stone = new THREE.MeshStandardMaterial({
    map: cloneTexture(mossColor, { repeat: [2.5, 2.5], srgb: true }),
    normalMap: cloneTexture(mossNormal, { repeat: [2.5, 2.5], srgb: false }),
    roughnessMap: cloneTexture(mossRough, { repeat: [2.5, 2.5], srgb: false }),
    color: 0x87906d,
    roughness: 0.95,
    metalness: 0,
  });
  stone.normalScale.set(0.75, 0.75);

  return { trail, forest, stone };
}

export function cloneProp(proto) {
  return proto.clone(true);
}

export function placeProp(parent, proto, x, y, z, {
  s = 1,
  ry = 0,
  rx = 0,
  rz = 0,
  sy = null,
  visible = true,
} = {}) {
  const o = cloneProp(proto);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.set(s, sy ?? s, s);
  o.visible = visible;
  parent.add(o);
  return o;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTrailBase(root, kit, mats, {
  length = 3600,
  centerZ = -1760,
} = {}) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, length + 140), mats.forest);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, centerZ);
  ground.receiveShadow = true;
  root.add(ground);

  const trail = new THREE.Mesh(new THREE.PlaneGeometry(7.8, length + 100), mats.trail);
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(0, 0.01, centerZ);
  trail.receiveShadow = true;
  root.add(trail);

  // Chunk pool: twelve 30 m chunks = 2 behind + 10 ahead. Each chunk has a
  // different deterministic layout, so recycling is cheap without looking
  // like one identical copy pasted hundreds of times.
  const chunks = [];
  const trees = [kit.tree1, kit.tree2, kit.tree3, kit.tree4, kit.ruinTree];
  const bushes = [kit.bush1, kit.bush2];
  const grasses = [kit.grass1, kit.grass2];

  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const r = seeded(4100 + i * 97);

    // Keep a deliberate sight-line corridor around the playable trail. The
    // previous version allowed bushes to start at x=3.1 even though the trail
    // itself is 7.8 m wide, so leaves could literally sit over a lane and hide
    // the next obstacle. Trees now form a canopy wall OUTSIDE the action, not
    // inside it. This matters even more on the high shrine climbs where the
    // player needs to read the crest and the Handler at the same time.
    for (const side of [-1, 1]) {
      for (let n = 0; n < 5; n++) {
        const p = cloneProp(trees[(i + n + (side > 0 ? 1 : 0)) % trees.length]);
        const dist = 11.8 + r() * 18.0;
        p.position.set(side * dist, 0, -13 + r() * 26);
        const s = 0.020 + r() * 0.010;
        p.scale.setScalar(s);
        p.rotation.y = r() * Math.PI * 2;
        g.add(p);
      }
    }

    // Low vegetation is pushed even farther away from the running lanes. It
    // still fills the jungle floor in peripheral vision, but never masks an
    // obstacle or the beginning of a ramp.
    for (let n = 0; n < 8; n++) {
      const side = r() < 0.5 ? -1 : 1;
      const p = cloneProp(bushes[n % bushes.length]);
      p.position.set(side * (10.4 + r() * 6.4), 0, -14 + r() * 28);
      p.scale.setScalar(0.010 + r() * 0.006);
      p.rotation.y = r() * Math.PI * 2;
      g.add(p);
    }

    for (let n = 0; n < 14; n++) {
      const side = r() < 0.5 ? -1 : 1;
      const p = cloneProp(grasses[n % grasses.length]);
      p.position.set(side * (9.6 + r() * 8.0), 0, -14 + r() * 28);
      p.scale.setScalar(0.009 + r() * 0.006);
      p.rotation.y = r() * Math.PI * 2;
      g.add(p);
    }

    // Every other prefab contains a piece of the old shrine so the trail
    // increasingly feels like Site 7 long before the player reaches it.
    if (i % 2 === 0) {
      const left = cloneProp(i % 4 === 0 ? kit.column : kit.columnShort);
      left.position.set(-10.2, 0, -7 + r() * 12);
      left.scale.setScalar(i % 4 === 0 ? 0.016 : 0.019);
      left.rotation.z = (r() - 0.5) * 0.12;
      g.add(left);

      const right = cloneProp(i % 3 === 0 ? kit.wall : kit.columnShort);
      right.position.set(10.6, 0, 6 - r() * 12);
      right.scale.setScalar(i % 3 === 0 ? 0.016 : 0.019);
      right.rotation.y = (r() - 0.5) * 0.8;
      g.add(right);
    }

    const slot = i - 2;
    g.userData.streamSlot = slot;
    g.position.z = -slot * 30;
    root.add(g);
    chunks.push(g);
  }

  // One memorable landmark close to the start.
  placeProp(root, kit.stag, 9.4, 0, -18, { s: 0.0112, ry: -0.7 });

  return { ground, trail, chunks };
}

export function updateTrailChunks(chunks, z, chunkLength = 30) {
  if (!chunks?.length) return;

  // Ring-buffer streaming: only the chunk that has genuinely fallen behind Kai
  // is moved to the far end. The previous version reassigned EVERY chunk every
  // 30 m, which made the whole forest visibly "restart" in one frame.
  const current = Math.floor((-z) / chunkLength);
  const minSlot = current - 2;

  for (const chunk of chunks) {
    if (!Number.isFinite(chunk.userData.streamSlot)) {
      chunk.userData.streamSlot = Math.round(-chunk.position.z / chunkLength);
    }
  }

  let guard = 0;
  while (guard++ < chunks.length * 8) {
    let oldest = chunks[0];
    let newest = chunks[0];
    for (const chunk of chunks) {
      if (chunk.userData.streamSlot < oldest.userData.streamSlot) oldest = chunk;
      if (chunk.userData.streamSlot > newest.userData.streamSlot) newest = chunk;
    }

    if (oldest.userData.streamSlot >= minSlot) break;

    oldest.userData.streamSlot = newest.userData.streamSlot + 1;
    oldest.position.z = -oldest.userData.streamSlot * chunkLength;
  }
}


export const BRIDGE_GAPS = [
  { z: -1348, lane: 0, halfZ: 4.6 },
  { z: -1386, lane: 2, halfZ: 4.6 },
  { z: -1424, lane: 1, halfZ: 4.6 },
];

const COURSE_PROFILE = [
  [0, 0],
  [280, 0],
  [360, 3],
  [430, 9],
  [500, 14],
  [580, 14],
  [650, 8],
  [740, 0],

  [1000, 0],
  [1080, 3],
  [1160, 12],
  [1230, 24],
  [1290, 34],
  [1580, 34],
  [1640, 27],
  [1710, 15],
  [1780, 5],
  [1840, 0],

  [2050, 0],
  [2130, 5],
  [2200, 13],
  [2270, 22],
  [2360, 22],
  [2440, 15],
  [2520, 5],
  [2600, 0],
  [3400, 0],
];

/**
 * Roller-coaster style vertical profile for Level 1.
 * z is world-space (Kai runs toward negative z); the returned value is the
 * trail floor height in metres. Smoothstep keeps every crest and valley soft.
 */
export function jungleCourseHeight(z) {
  const d = Math.max(0, -z);
  for (let i = 1; i < COURSE_PROFILE.length; i++) {
    const [d0, y0] = COURSE_PROFILE[i - 1];
    const [d1, y1] = COURSE_PROFILE[i];
    if (d <= d1) {
      const u = THREE.MathUtils.clamp((d - d0) / Math.max(0.001, d1 - d0), 0, 1);
      const t = u * u * (3 - 2 * u);
      return THREE.MathUtils.lerp(y0, y1, t);
    }
  }
  return COURSE_PROFILE[COURSE_PROFILE.length - 1][1];
}

/**
 * Draws a raised shrine causeway over the otherwise flat jungle floor.
 * Kai's controller samples jungleCourseHeight(), so this is real traversal,
 * not just scenery: he climbs the ramps, crests the ruins, then drops again.
 */
export function buildElevatedTrail(root, kit, mats, {
  startZ = -260,
  endZ = -2860,
  step = 12,
} = {}) {
  const group = new THREE.Group();
  group.name = "jungle-elevated-course";
  group.userData.bridgePanels = [];

  const BRIDGE_START_Z = -1318;
  const BRIDGE_END_Z = -1450;

  for (let z0 = startZ; z0 > endZ; z0 -= step) {
    const z1 = Math.max(endZ, z0 - step);
    const midZ = (z0 + z1) * 0.5;
    const y0 = jungleCourseHeight(z0);
    const y1 = jungleCourseHeight(z1);

    if (Math.max(y0, y1) < 0.06) continue;
    if (midZ <= BRIDGE_START_Z && midZ >= BRIDGE_END_Z) continue;

    const dz = Math.abs(z1 - z0);
    const dy = y1 - y0;
    const length = Math.hypot(dz, dy);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 0.32, length + 0.08),
      mats.stone,
    );
    deck.position.set(0, (y0 + y1) * 0.5 - 0.16, midZ);
    deck.rotation.x = Math.atan2(dy, dz);
    deck.castShadow = false;
    deck.receiveShadow = true;
    group.add(deck);
  }

  const panelStep = 6;
  const laneWidth = 2.28;
  for (let z0 = BRIDGE_START_Z; z0 > BRIDGE_END_Z; z0 -= panelStep) {
    const z1 = Math.max(BRIDGE_END_Z, z0 - panelStep);
    const midZ = (z0 + z1) * 0.5;
    const y0 = jungleCourseHeight(z0);
    const y1 = jungleCourseHeight(z1);
    const dz = Math.abs(z1 - z0);
    const dy = y1 - y0;
    const length = Math.hypot(dz, dy);

    for (let lane = 0; lane < 3; lane++) {
      const missing = BRIDGE_GAPS.some(
        (g) => g.lane === lane && Math.abs(midZ - g.z) <= g.halfZ,
      );
      if (missing) continue;

      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(laneWidth, 0.30, length + 0.06),
        mats.stone,
      );
      panel.position.set((lane - 1) * 2.4, (y0 + y1) * 0.5 - 0.15, midZ);
      panel.rotation.x = Math.atan2(dy, dz);
      panel.castShadow = false;
      panel.receiveShadow = true;
      panel.userData.bridgeLane = lane;
      panel.userData.bridgeZ = midZ;
      panel.userData.baseY = panel.position.y;
      panel.userData.baseRotX = panel.rotation.x;
      panel.userData.collapseT = -1;
      group.add(panel);
      group.userData.bridgePanels.push(panel);
    }
  }

  for (let d = 340; d <= 2640; d += 48) {
    const z = -d;
    const h = jungleCourseHeight(z);
    if (h < 2.2) continue;

    for (const x of [-4.65, 4.65]) {
      const support = cloneProp((Math.floor(d / 48) % 2) ? kit.column : kit.columnShort);
      support.position.set(x, 0, z);
      support.scale.setScalar(0.018 + Math.min(h, 28) * 0.00034);
      support.rotation.y = (x < 0 ? 1 : -1) * 0.08;
      group.add(support);
    }
  }

  for (const [z, scale] of [[-520, 0.024], [-1295, 0.031], [-2310, 0.027]]) {
    const arch = cloneProp(kit.gateArch);
    arch.position.set(0, jungleCourseHeight(z), z);
    arch.scale.setScalar(scale);
    group.add(arch);
  }

  for (const z of [-1305, -1460, -1550]) {
    for (const x of [-6.2, 6.2]) {
      const wall = cloneProp(kit.wall);
      wall.position.set(x, jungleCourseHeight(z) - 0.15, z);
      wall.scale.setScalar(0.017);
      wall.rotation.y = x < 0 ? 0.12 : Math.PI - 0.12;
      group.add(wall);
    }
  }

  for (const [x, z, ry] of [[-5.2, -1310, 0.55], [5.2, -1540, -0.55]]) {
    const statue = cloneProp(kit.stag);
    statue.position.set(x, jungleCourseHeight(z), z);
    statue.scale.setScalar(0.0105);
    statue.rotation.y = ry;
    group.add(statue);
  }

  root.add(group);
  return group;
}

export function createSign(text = "SITE 7 →", { width = 2.4, height = 0.85 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#3f2a19";
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  ctx.fillStyle = "#f1e2c2";
  ctx.font = "700 78px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, side: THREE.DoubleSide }),
  );
  board.position.y = 2.05;
  group.add(board);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x4b321f, roughness: 0.95 });
  for (const x of [-width * 0.32, width * 0.32]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 8), postMat);
    post.position.set(x, 1.0, -0.03);
    group.add(post);
  }
  return group;
}

export function createJungleSky() {
  const top = new THREE.Color(0x6aa6d8);
  const horizon = new THREE.Color(0xf0e2b0);
  const bottom = new THREE.Color(0x6f7d4a);
  const sunColor = new THREE.Color(0xffd59a);
  const sunDir = new THREE.Vector3(-0.35, 0.55, -0.75).normalize();

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: top },
      uHorizon: { value: horizon },
      uBottom: { value: bottom },
      uSun: { value: sunColor },
      uSunDir: { value: sunDir },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBottom, uSun, uSunDir;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0
          ? mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.55))
          : mix(uHorizon, uBottom, pow(clamp(-h*3.0,0.0,1.0), 0.65));
        float s = max(dot(d, uSunDir), 0.0);
        c += uSun * (pow(s, 1000.0) * 7.0 + pow(s, 18.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(350, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

export function createLightShaft(width = 2.0, color = 0xffd9a0, opacity = 0.13) {
  const len = 28;
  const geo = new THREE.CylinderGeometry(width * 0.28, width, len, 16, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main(){
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main(){
        float edge = pow(abs(dot(normalize(vNormal), vView)), 1.4);
        float fade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
        float a = edge * fade * uOpacity;
        gl_FragColor = vec4(uColor * (0.7 + a * 2.0), a);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.z = -0.55;
  return mesh;
}

export function createPollen(count = 420) {
  const r = seeded(909);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * 18;
    pos[i * 3 + 1] = 0.4 + r() * 5.5;
    pos[i * 3 + 2] = (r() - 0.5) * 130;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xffe2a0,
    size: 0.055,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return new THREE.Points(g, m);
}

export function makeJungleObstacle(kind, kit, stoneMaterial) {
  const group = new THREE.Group();

  if (kind === "barrier") {
    const log = cloneProp(kit.logs);
    log.scale.setScalar(2.0);
    log.rotation.y = Math.PI / 2;
    log.position.y = -0.05;
    group.add(log);
  } else if (kind === "trolley") {
    const rock = cloneProp(kit.rock2);
    rock.scale.setScalar(0.0125);
    rock.rotation.y = Math.PI * 0.2;
    rock.position.y = -0.08;
    group.add(rock);
    const shard = cloneProp(kit.columnShort);
    shard.scale.setScalar(0.0105);
    shard.rotation.z = 1.1;
    shard.position.set(0.15, 0.16, 0.05);
    group.add(shard);
  } else if (kind === "crate") {
    const crate = cloneProp(kit.crates);
    crate.scale.setScalar(4.2);
    crate.rotation.y = 0.15;
    group.add(crate);
  } else if (kind === "barrel") {
    const barrel = cloneProp(kit.barrel);
    barrel.scale.setScalar(8.5);
    barrel.rotation.z = 0.08;
    group.add(barrel);
  } else if (kind === "trap") {
    // Turn the existing bear-trap prop into a more readable shrine spike plate.
    // The model remains the centrepiece; simple stone/metal spikes make the
    // hazard silhouette obvious at runner speed.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.10, 0.82), stoneMaterial);
    plate.position.y = 0.05;
    plate.receiveShadow = true;
    group.add(plate);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x464b40, roughness: 0.72, metalness: 0.18 });
    for (const x of [-0.42, 0, 0.42]) {
      for (const z of [-0.24, 0.24]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 6), spikeMat);
        spike.position.set(x, 0.25, z);
        group.add(spike);
      }
    }
    const trap = cloneProp(kit.trap);
    trap.scale.setScalar(0.008);
    trap.position.y = 0.10;
    group.add(trap);
  } else if (kind === "wall") {
    const wall = cloneProp(kit.wall);
    wall.scale.setScalar(0.008);
    wall.position.y = -0.1;
    group.add(wall);
  } else {
    const arch = cloneProp(kit.arch);
    arch.scale.setScalar(0.022);
    arch.position.y = -2.35;
    group.add(arch);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.45, 0.8), stoneMaterial);
    lintel.position.y = 1.32;
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    group.add(lintel);
  }

  return group;
}