import * as THREE from 'three';

/**
 * RoadSystem — Member 2B
 *
 * Infinite nighttime highway built from recycled chunks.  Each chunk is a
 * 200 m slice of road with:
 *
 *   - Procedural asphalt canvas (albedo + normal + roughness)
 *   - Yellow edge lines and white dashed centre lines
 *   - Metal guardrails on both sides
 *   - Streetlights with emissive lamp heads
 *
 * Chunks recycle behind the car and reappear ahead, so the road never runs
 * out no matter how far the chase goes.  All geometry lives under one
 * THREE.Group so Level.teardown() can clean it up in a single call.
 *
 * The car starts at z = 0 and drives toward +z (heading 0).  The conveyor-
 * belt update keeps every chunk in the right slot regardless of frame rate.
 */

/* ======================== procedural asphalt canvas ======================== */

/** Seeded RNG (mulberry32) — same texture every restart. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on a `cells × cells` random lattice. */
function noiseField(size, cells, rng) {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();

  const field = new Float32Array(size * size);
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const row0 = (y0 % cells) * cells;
    const row1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const a = lattice[row0 + (x0 % cells)];
      const b = lattice[row0 + ((x0 + 1) % cells)];
      const c = lattice[row1 + (x0 % cells)];
      const d = lattice[row1 + ((x0 + 1) % cells)];
      field[y * size + x] =
        a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return field;
}

/** fBm — stacked octaves of noiseField, normalised to 0‥1. */
function fbmField(size, cells, octaves, rng) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0, c = cells; o < octaves; o++, c *= 2) {
    const layer = noiseField(size, c, rng);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Height field → tangent-space normal map (borders wrap for seamless tiling). */
function normalCanvas(height, size, strength) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(-dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i]     = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = ( dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = ( inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Canvas → CanvasTexture with wrap + anisotropy set.
 * `srgb` true only for the albedo — data maps stay linear.
 */
function toTexture(canvas, { srgb = false, repeat = [1, 1] } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Dark asphalt: fine aggregate grain, oil-stain blotches, a few cracks and
 * patched areas.  The normal map is baked from the same height field the
 * albedo shades so bumps and lighting agree.
 */
function asphaltMaps({ size = 512, seed = 2024, repeat = [1, 1] } = {}) {
  const rng = makeRng(seed);
  const grain = fbmField(size, 120, 2, rng);
  const blotch = fbmField(size, 5, 3, rng);

  const alb = document.createElement('canvas');
  const rough = document.createElement('canvas');
  alb.width = alb.height = size;
  rough.width = rough.height = size;
  const aCtx = alb.getContext('2d');
  const rCtx = rough.getContext('2d');
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const g = grain[i];
      const b = blotch[i];

      // height: grain + occasional pothole dips
      let h = 0.5 + (g - 0.5) * 0.2;
      if (b > 0.72) h -= (b - 0.72) * 0.3;
      height[i] = h;

      // albedo: dark grey with aggregate sparkle and oil stains
      const shade = 0.82 + g * 0.36;
      let r = 28 * shade;
      let gv = 30 * shade;
      let bl = 34 * shade;
      const oilMix = Math.max(0, b - 0.6) * 1.5;
      r  += (12 - r)  * oilMix;
      gv += (10 - gv) * oilMix;
      bl += (8  - bl) * oilMix;

      const ai = i * 4;
      aImg.data[ai]     = r;
      aImg.data[ai + 1] = gv;
      aImg.data[ai + 2] = bl;
      aImg.data[ai + 3] = 255;

      // roughness: mostly matte, oil patches are glossier
      let rv = THREE.MathUtils.lerp(0.78, 0.95, g);
      rv = THREE.MathUtils.lerp(rv, 0.35, oilMix);
      rImg.data[ai]     = rv * 255;
      rImg.data[ai + 1] = rv * 255;
      rImg.data[ai + 2] = rv * 255;
      rImg.data[ai + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // vector cracks — kept inside the margin so they never cross the tiling seam
  aCtx.strokeStyle = 'rgba(14, 14, 16, 0.4)';
  aCtx.lineWidth = 1;
  const m = 10;
  for (let i = 0; i < 5; i++) {
    aCtx.beginPath();
    aCtx.moveTo(m + rng() * (size - 2 * m), m + rng() * (size - 2 * m));
    aCtx.lineTo(m + rng() * (size - 2 * m), m + rng() * (size - 2 * m));
    aCtx.stroke();
  }

  return {
    albedoTex: toTexture(alb,   { srgb: true, repeat }),
    normalTex: toTexture(normalCanvas(height, size, 2.0), { repeat }),
    roughTex: toTexture(rough,  { repeat }),
  };
}

/* ============================ RoadSystem class ============================= */

export class RoadSystem {
  /**
   * @param {THREE.Object3D} parent  — usually the level's this.root
   */
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'roadSystem';
    parent.add(this.group);

    this.chunkLength = 200;   // metres per chunk
    this.roadWidth   = 24;    // matches the old placeholder
    this.numChunks   = 8;     // 1 600 m total — always covers the fog
    this.chunks      = [];
    this.lights      = [];    // point-lights that follow the car

    this._buildMaterials();
    this._buildChunks();
    this._setupLights();
  }

  /* ---- materials (built once, shared by every chunk) ---- */

  _buildMaterials() {
    // asphalt — procedural canvas maps
    const asphalt = asphaltMaps({
      size: 512,
      seed: 2024,
      repeat: [6, this.chunkLength / 4],   // 4 m per repeat slab
    });
    this.roadMat = new THREE.MeshStandardMaterial({
      map: asphalt.albedoTex,
      normalMap: asphalt.normalTex,
      roughnessMap: asphalt.roughTex,
      roughness: 1,
      metalness: 0.04,
    });

    // lane markings — slightly emissive so they read in the dark
    this.yellowLineMat = new THREE.MeshStandardMaterial({
      color: 0xc8a832, emissive: 0x3a2e00, emissiveIntensity: 0.3, roughness: 0.6,
    });
    this.whiteLineMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, emissive: 0x222222, emissiveIntensity: 0.2, roughness: 0.5,
    });

    // concrete shoulder
    this.shoulderMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2e, roughness: 0.92, metalness: 0.02,
    });

    // guardrail — painted steel
    this.railMat = new THREE.MeshStandardMaterial({
      color: 0x6e7880, metalness: 0.65, roughness: 0.35,
    });
    this.postMat = new THREE.MeshStandardMaterial({
      color: 0x4a4e52, metalness: 0.5, roughness: 0.5,
    });

    // streetlight pole + lamp
    this.poleMat = new THREE.MeshStandardMaterial({
      color: 0x3a3e42, metalness: 0.6, roughness: 0.4,
    });
    this.lampMat = new THREE.MeshStandardMaterial({
      color: 0xffe8c0,
      emissive: 0xffa040,
      emissiveIntensity: 2.0,
    });

    // ground beyond the road
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c0e, roughness: 0.98,
    });

    // shared geometries (one set for every chunk to reference)
    this._geo = {
      roadSurface:    new THREE.PlaneGeometry(this.roadWidth, this.chunkLength),
      edgeLine:       new THREE.PlaneGeometry(0.25, this.chunkLength),
      dashLine:       new THREE.PlaneGeometry(0.18, 4),
      shoulder:       new THREE.PlaneGeometry(4, this.chunkLength),
      ground:         new THREE.PlaneGeometry(400, this.chunkLength),
      railBeam:       new THREE.BoxGeometry(0.25, 0.12, this.chunkLength),
      post:           new THREE.BoxGeometry(0.1, 0.8, 0.1),
      pole:           new THREE.CylinderGeometry(0.12, 0.15, 7, 6),
      arm:            new THREE.BoxGeometry(2.8, 0.1, 0.1),
      lampHead:       new THREE.BoxGeometry(0.7, 0.12, 0.35),
    };
  }

  /* ---- chunk assembly ---- */

  _buildChunks() {
    for (let i = 0; i < this.numChunks; i++) {
      const chunk = this._createChunk();
      chunk.position.z = i * this.chunkLength;
      this.group.add(chunk);
      this.chunks.push(chunk);
    }
  }

  _createChunk() {
    const g = new THREE.Group();
    const L = this.chunkLength;
    const W = this.roadWidth;
    const halfW = W / 2;

    // road surface
    const road = new THREE.Mesh(this._geo.roadSurface, this.roadMat);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    g.add(road);

    // concrete shoulders on both sides
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(this._geo.shoulder, this.shoulderMat);
      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(side * (halfW + 2), 0.005, 0);
      shoulder.receiveShadow = true;
      g.add(shoulder);
    }

    // ground beyond the shoulders
    for (const side of [-1, 1]) {
      const ground = new THREE.Mesh(this._geo.ground, this.groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(side * (halfW + 204), -0.05, 0);
      g.add(ground);
    }

    // yellow edge lines
    for (const x of [-halfW + 0.5, halfW - 0.5]) {
      const line = new THREE.Mesh(this._geo.edgeLine, this.yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.012, 0);
      g.add(line);
    }

    // white dashed centre lines — three lanes = two dividers
    for (const x of [-W / 6, W / 6]) {
      for (let z = -L / 2; z < L / 2; z += 10) {
        const dash = new THREE.Mesh(this._geo.dashLine, this.whiteLineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.012, z + 2);
        g.add(dash);
      }
    }

    // guardrails
    for (const side of [-1, 1]) {
      const x = side * (halfW + 0.3);

      const beam = new THREE.Mesh(this._geo.railBeam, this.railMat);
      beam.position.set(x, 0.65, 0);
      beam.castShadow = true;
      g.add(beam);

      const lowerBeam = new THREE.Mesh(this._geo.railBeam, this.railMat);
      lowerBeam.position.set(x, 0.35, 0);
      g.add(lowerBeam);

      for (let z = -L / 2 + 5; z < L / 2; z += 8) {
        const post = new THREE.Mesh(this._geo.post, this.postMat);
        post.position.set(x, 0.4, z);
        post.castShadow = true;
        g.add(post);
      }
    }

    // streetlights — every 50 m, alternating sides
    const spacing = 50;
    for (let z = -L / 2 + 25; z < L / 2; z += spacing) {
      const side = (Math.round((z + L / 2) / spacing) % 2 === 0) ? 1 : -1;
      this._addStreetlight(g, side * (halfW + 4.5), z);
    }

    return g;
  }

  _addStreetlight(parent, x, z) {
    const pole = new THREE.Mesh(this._geo.pole, this.poleMat);
    pole.position.set(x, 3.5, z);
    pole.castShadow = true;
    parent.add(pole);

    const arm = new THREE.Mesh(this._geo.arm, this.poleMat);
    const dir = x > 0 ? -1 : 1;
    arm.position.set(x + dir * 1.4, 6.9, z);
    parent.add(arm);

    const lamp = new THREE.Mesh(this._geo.lampHead, this.lampMat);
    lamp.position.set(x + dir * 2.6, 6.8, z);
    parent.add(lamp);
  }

  /* ---- a few point-lights that follow the car for atmosphere ---- */

  _setupLights() {
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffa040, 1.8, 60, 1.5);
      light.position.set(0, 6.5, 0);
      this.group.add(light);
      this.lights.push(light);
    }
  }

  /* ---- per-frame update: recycle chunks + move the atmosphere lights ---- */

  /**
   * Call every frame with the car's world position.
   * Uses a modulo conveyor-belt so recycled chunks land tightly packed
   * at the tail of the queue — never beyond the fog line.
   */
  update(carPosition) {
    const carZ = carPosition.z;
    const L = this.chunkLength;
    const threshold = carZ - L * 0.5;

    for (const chunk of this.chunks) {
      if (chunk.position.z < threshold) {
        const farthest = Math.max(...this.chunks.map(c => c.position.z));
        chunk.position.z = farthest + L;
      }
    }

    // move the three atmosphere lights to span the road ahead of the car
    for (let i = 0; i < this.lights.length; i++) {
      this.lights[i].position.set(0, 6.5, carZ + 20 + i * 40);
    }
  }

  /* ---- cleanup ---- */

  dispose() {
    for (const geo of Object.values(this._geo)) geo.dispose();
    for (const mat of [
      this.roadMat, this.yellowLineMat, this.whiteLineMat,
      this.shoulderMat, this.railMat, this.postMat,
      this.poleMat, this.lampMat, this.groundMat,
    ]) {
      if (mat.map)         mat.map.dispose();
      if (mat.normalMap)   mat.normalMap.dispose();
      if (mat.roughnessMap) mat.roughnessMap.dispose();
      mat.dispose();
    }
  }
}
