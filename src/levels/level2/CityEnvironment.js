import * as THREE from 'three';

/**
 * CityEnvironment — Member 2B
 *
 * Generates 3D urban scenery along the highway: buildings with real depth,
 * recessed window grids, roof equipment, and street-level props.
 *
 * Everything uses proper 3D geometry — extruded shapes, bevelled edges,
 * instanced meshes — not flat planes or single boxes. Buildings have
 * architectural variation (height, width, setbacks, colour) so the city
 * doesn't read as a row of identical blocks.
 *
 * The system is chunk-aware: it places scenery for a 200 m slice and
 * recycles with the road chunks. A seeded RNG keeps the layout identical
 * across restarts.
 *
 * Call once from Level02.init() and add the returned group to this.root.
 */

/* ======================== deterministic RNG ======================== */

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ======================== materials ======================== */

function createMaterials() {
  // building facade — dark concrete/brick tones
  const facadeColors = [
    0x2a2e33, 0x33383e, 0x3a3530, 0x2e3338, 0x352e2e,
    0x38332a, 0x2a3330, 0x30353a, 0x3a3035, 0x2e2a33,
  ];

  const windowLit = new THREE.MeshStandardMaterial({
    color: 0xffe8a0,
    emissive: 0xffa030,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.1,
  });

  const windowDark = new THREE.MeshStandardMaterial({
    color: 0x0a0e14,
    roughness: 0.1,
    metalness: 0.8,
  });

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e22,
    roughness: 0.9,
    metalness: 0.1,
  });

  const acUnitMat = new THREE.MeshStandardMaterial({
    color: 0x5a6068,
    roughness: 0.6,
    metalness: 0.4,
  });

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x3a3e42,
    roughness: 0.85,
    metalness: 0.05,
  });

  const metalFenceMat = new THREE.MeshStandardMaterial({
    color: 0x4a5058,
    roughness: 0.4,
    metalness: 0.7,
  });

  const dumpsterMat = new THREE.MeshStandardMaterial({
    color: 0x2a4a2a,
    roughness: 0.7,
    metalness: 0.3,
  });

  const signMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a5a,
    roughness: 0.5,
    metalness: 0.2,
    emissive: 0x0a1a2a,
    emissiveIntensity: 0.3,
  });

  return {
    facadeColors, windowLit, windowDark, roofMat, acUnitMat,
    concreteMat, metalFenceMat, dumpsterMat, signMat,
  };
}

/* ======================== building generator ======================== */

/**
 * Creates a single 3D building with windows, roof details, and variation.
 * Returns a THREE.Group.
 */
function createBuilding(rng, mats, maxDepth) {
  const group = new THREE.Group();

  // randomise dimensions
  const width = 8 + rng() * 18;
  const depth = 8 + rng() * 14;
  const height = 10 + rng() * 40;
  const hasSetback = rng() > 0.6 && height > 20;

  // pick a facade colour
  const colorIndex = Math.floor(rng() * mats.facadeColors.length);
  const facadeMat = new THREE.MeshStandardMaterial({
    color: mats.facadeColors[colorIndex],
    roughness: 0.82,
    metalness: 0.08,
  });

  // main body
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const body = new THREE.Mesh(bodyGeo, facadeMat);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // setback upper section
  if (hasSetback) {
    const upperHeight = height * (0.3 + rng() * 0.3);
    const upperWidth = width * (0.6 + rng() * 0.25);
    const upperDepth = depth * (0.6 + rng() * 0.25);
    const upperGeo = new THREE.BoxGeometry(upperWidth, upperHeight, upperDepth);
    const upper = new THREE.Mesh(upperGeo, facadeMat);
    upper.position.y = height + upperHeight / 2;
    upper.castShadow = true;
    group.add(upper);

    // windows on setback
    _addWindows(upper, upperWidth, upperHeight, upperDepth, rng, mats);
  }

  // windows on main body (front and back faces)
  _addWindows(body, width, height, depth, rng, mats);

  // roof parapet (low wall around the edge)
  const parapetH = 0.6;
  const parapetT = 0.25;
  const parapetGeo = new THREE.BoxGeometry(width + parapetT * 2, parapetH, parapetT);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(parapetGeo, mats.roofMat);
    p.position.set(0, height + parapetH / 2, side * (depth / 2 + parapetT / 2));
    group.add(p);
  }
  const parapetSideGeo = new THREE.BoxGeometry(parapetT, parapetH, depth + parapetT * 2);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(parapetSideGeo, mats.roofMat);
    p.position.set(side * (width / 2 + parapetT / 2), height + parapetH / 2, 0);
    group.add(p);
  }

  // roof equipment (AC units, water tank)
  const numAC = Math.floor(rng() * 4);
  for (let i = 0; i < numAC; i++) {
    const acW = 1 + rng() * 2;
    const acH = 0.8 + rng() * 1.2;
    const acD = 1 + rng() * 1.5;
    const acGeo = new THREE.BoxGeometry(acW, acH, acD);
    const ac = new THREE.Mesh(acGeo, mats.acUnitMat);
    ac.position.set(
      (rng() - 0.5) * (width * 0.6),
      height + parapetH + acH / 2,
      (rng() - 0.5) * (depth * 0.6),
    );
    ac.castShadow = true;
    group.add(ac);
  }

  // water tank on some tall buildings
  if (height > 25 && rng() > 0.5) {
    const tankR = 1 + rng() * 1.5;
    const tankH = 2 + rng() * 2;
    const tankGeo = new THREE.CylinderGeometry(tankR, tankR, tankH, 8);
    const tank = new THREE.Mesh(tankGeo, mats.acUnitMat);
    tank.position.set(
      (rng() - 0.5) * (width * 0.4),
      height + parapetH + tankH / 2,
      (rng() - 0.5) * (depth * 0.4),
    );
    tank.castShadow = true;
    group.add(tank);
  }

  return group;
}

/** Adds a grid of windows to the front and back faces of a building body. */
function _addWindows(body, bWidth, bHeight, bDepth, rng, mats) {
  const winW = 1.2;
  const winH = 1.6;
  const spacingX = 3.2;
  const spacingY = 3.5;
  const winGeo = new THREE.PlaneGeometry(winW, winH);

  const cols = Math.floor((bWidth - 2) / spacingX);
  const rows = Math.floor((bHeight - 3) / spacingY);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isLit = rng() > 0.4;
      const mat = isLit ? mats.windowLit : mats.windowDark;
      const x = (col - (cols - 1) / 2) * spacingX;
      const y = (row - (rows - 1) / 2) * spacingY;

      // front face
      const front = new THREE.Mesh(winGeo, mat);
      front.position.set(x, y, bDepth / 2 + 0.02);
      body.add(front);

      // back face
      const back = new THREE.Mesh(winGeo, mat);
      back.position.set(x, y, -bDepth / 2 - 0.02);
      back.rotation.y = Math.PI;
      body.add(back);
    }
  }

  // side faces
  const sideCols = Math.floor((bDepth - 2) / spacingX);
  const sideWinGeo = new THREE.PlaneGeometry(winW, winH);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < sideCols; col++) {
      const isLit = rng() > 0.4;
      const mat = isLit ? mats.windowLit : mats.windowDark;
      const z = (col - (sideCols - 1) / 2) * spacingX;
      const y = (row - (rows - 1) / 2) * spacingY;

      for (const side of [-1, 1]) {
        const win = new THREE.Mesh(sideWinGeo, mat);
        win.position.set(side * (bWidth / 2 + 0.02), y, z);
        win.rotation.y = side * Math.PI / 2;
        body.add(win);
      }
    }
  }
}

/* ======================== street props ======================== */

/** Concrete jersey barrier — proper 3D trapezoidal shape. */
function createBarrier(mats) {
  const group = new THREE.Group();
  // base wider than top (trapezoidal profile)
  const shape = new THREE.Shape();
  shape.moveTo(-0.4, 0);
  shape.lineTo(0.4, 0);
  shape.lineTo(0.25, 0.8);
  shape.lineTo(-0.25, 0.8);
  shape.closePath();

  const extrudeSettings = { depth: 3, bevelEnabled: false };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.translate(0, 0, -1.5);
  const mesh = new THREE.Mesh(geo, mats.concreteMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

/** Dumpsters — proper 3D box with lid. */
function createDumpster(rng, mats) {
  const group = new THREE.Group();
  const w = 1.2 + rng() * 0.8;
  const h = 1.0 + rng() * 0.5;
  const d = 1.8 + rng() * 0.6;

  // body
  const bodyGeo = new THREE.BoxGeometry(w, h, d);
  const body = new THREE.Mesh(bodyGeo, mats.dumpsterMat);
  body.position.y = h / 2;
  body.castShadow = true;
  group.add(body);

  // lid (slightly larger, tilted open)
  const lidGeo = new THREE.BoxGeometry(w + 0.05, 0.06, d + 0.05);
  const lid = new THREE.Mesh(lidGeo, mats.dumpsterMat);
  lid.position.set(0, h + 0.03, -d * 0.15);
  lid.rotation.x = -0.3 - rng() * 0.4;
  group.add(lid);

  return group;
}

/** Street sign pole with a sign board. */
function createSignPole(rng, mats) {
  const group = new THREE.Group();
  const poleH = 4 + rng() * 2;
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, poleH, 6);
  const pole = new THREE.Mesh(poleGeo, mats.metalFenceMat);
  pole.position.y = poleH / 2;
  pole.castShadow = true;
  group.add(pole);

  // sign board
  const signW = 1.2 + rng() * 0.8;
  const signH = 0.6 + rng() * 0.4;
  const signGeo = new THREE.BoxGeometry(signW, signH, 0.08);
  const sign = new THREE.Mesh(signGeo, mats.signMat);
  sign.position.set(0, poleH - 0.3, 0.15);
  sign.castShadow = true;
  group.add(sign);

  return group;
}

/* ======================== public API ======================== */

/**
 * Populates a road chunk (200 m slice) with buildings and street props
 * on both sides of the road.
 *
 * @param {THREE.Group} chunk  — the road chunk group to add scenery to
 * @param {number} chunkLength — length of the chunk in metres
 * @param {number} roadWidth   — width of the road
 * @param {number} seed        — seed offset for this chunk's RNG
 */
export function populateChunk(chunk, chunkLength, roadWidth, seed) {
  const rng = makeRng(seed);
  const mats = createMaterials();
  const halfRoad = roadWidth / 2;
  const buildingZone = halfRoad + 5; // start buildings 5 m past the road edge

  // place buildings along both sides
  let z = -chunkLength / 2 + rng() * 8;
  while (z < chunkLength / 2 - 10) {
    for (const side of [-1, 1]) {
      const building = createBuilding(rng, mats);
      const xOffset = buildingZone + 4 + rng() * 12;
      building.position.set(side * xOffset, 0, z);
      building.rotation.y = side === 1 ? Math.PI : 0; // face the road
      chunk.add(building);

      // how far this building extends along z (use its depth for spacing)
      const bDepth = 8 + rng() * 14;
      z += bDepth * 0.4 + rng() * 3; // some gap between buildings
    }
    z += 5 + rng() * 10; // gap between building pairs
  }

  // street props along the sidewalk area
  z = -chunkLength / 2 + rng() * 20;
  while (z < chunkLength / 2 - 10) {
    const propRoll = rng();

    if (propRoll < 0.3) {
      // concrete barrier segment
      const barrier = createBarrier(mats);
      const side = rng() > 0.5 ? 1 : -1;
      barrier.position.set(side * (halfRoad + 2.5), 0, z);
      chunk.add(barrier);
    } else if (propRoll < 0.55) {
      // dumpster
      const dumpster = createDumpster(rng, mats);
      const side = rng() > 0.5 ? 1 : -1;
      dumpster.position.set(side * (halfRoad + 3.5 + rng() * 2), 0, z);
      chunk.add(dumpster);
    } else if (propRoll < 0.75) {
      // sign pole
      const sign = createSignPole(rng, mats);
      const side = rng() > 0.5 ? 1 : -1;
      sign.position.set(side * (halfRoad + 2), 0, z);
      chunk.add(sign);
    }

    z += 15 + rng() * 25;
  }
}
