import * as THREE from "three";

/**
 * PROCEDURAL SUBWAY TEXTURES — Member 1B
 *
 * Canvas-generated albedo + normal + roughness maps for the Level 1 tunnel,
 * so the level's materials are textured rather than colour-only (rubric:
 * "textured materials with normal/roughness maps") without waiting on
 * Blender exports. When real .png maps arrive they can drop into the same
 * material slots via AssetRegistry — Level01's setup won't change shape.
 *
 * Why generate instead of shipping files:
 *   - the repo has no assets/ folder yet, and generated maps can't 404 or
 *     break the lowercase-relative-path hosting rule
 *   - everything stays at or under 512 px — inside the team texture budget
 *   - Level.teardown() → disposeMaterial() already walks material
 *     properties for textures, so cleanup between levels/restarts is free
 *
 * Everything tiles seamlessly: the value-noise lattices wrap, slab joints
 * sit exactly on the texture edges, rust streaks use integer-frequency
 * sines, and normal-map gradients wrap at the borders. Normal maps are
 * baked from the same height field the albedo shades, so bumps and
 * shading agree.
 *
 * Costs ~100 ms once per level init — never call anything here per frame.
 */

/* ============================ deterministic noise ============================ */

/** mulberry32 — seeded RNG so a level restart regenerates the identical tunnel. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise: a `cells`×`cells` random lattice, smoothly interpolated, wrapping at the edges. */
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

/** fBm — stacked octaves of noiseField, normalised back to 0..1. */
function fbmField(size, cells, octaves, rng) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0, c = cells; o < octaves; o++, c *= 2) {
    const layer = noiseField(size, c, rng);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* ============================ canvas plumbing ============================ */

function makeCanvas(size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}

/** Canvas → CanvasTexture with the team defaults (wrap, anisotropy, repeat). */
function toTexture(canvas, { srgb = false, repeat = [1, 1] } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace; // albedo only — data maps stay linear
  return tex;
}

/**
 * Height field → tangent-space normal map. Gradients wrap at the borders so
 * tiling doesn't leave a seam. Canvas y runs opposite to UV v (CanvasTexture
 * flips on upload), which is why the green channel uses +dy.
 */
function normalCanvas(height, size, strength) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const at = (x, y) =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(-dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ============================ generators ============================ */

/**
 * Wet concrete: fine grain + large grime blotches + optional puddles (which
 * drop the roughness so the key light glints off them) + slab-joint grooves
 * along the texture edges. Optional worn painted stripe for the platform
 * ledge, plus a falling-away lip at the outer edge.
 */
function concreteMaps({
  size,
  seed,
  base, // [r, g, b] 0..255 dry concrete colour
  stain, // [r, g, b] grime blotch colour
  repeat,
  puddles = false,
  joint = 0, // px of groove along the edges — tiles into a slab grid
  stripe = null, // { from, to, color, rough, lip } fractions across u
  roughRange = [0.6, 0.85], // dry roughness range driven by the grain
  normalStrength = 2.2,
}) {
  const rng = makeRng(seed);
  const grain = fbmField(size, size > 300 ? 110 : 60, 2, rng);
  const blotch = fbmField(size, 5, 3, rng);

  const alb = makeCanvas(size);
  const rough = makeCanvas(size);
  const aCtx = alb.getContext("2d");
  const rCtx = rough.getContext("2d");
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const g = grain[i];
      const b = blotch[i];
      const t = x / size;

      // ---- height: grain, plus grooves at the slab joints / platform lip ----
      let h = 0.45 + (g - 0.5) * 0.22;
      if (joint > 0) {
        const d = Math.min(x, y, size - 1 - x, size - 1 - y);
        if (d < joint) h -= (1 - d / joint) * 0.55;
      }
      if (stripe && stripe.lip) {
        const d = size - 1 - x; // px from the outer edge
        const w = stripe.lip * size;
        if (d < w) h -= (1 - d / w) * 0.35;
      }
      height[i] = h;

      // ---- albedo ----
      const shade = 0.84 + g * 0.32; // aggregate sparkle
      const stainMix = Math.min(1, Math.max(0, b - 0.42) * 1.25);
      let r = base[0] * shade;
      let gr = base[1] * shade;
      let bl = base[2] * shade;
      r += (stain[0] - r) * stainMix;
      gr += (stain[1] - gr) * stainMix;
      bl += (stain[2] - bl) * stainMix;

      // puddles read darker and sit in the low-frequency blotches
      const wet = puddles ? THREE.MathUtils.smoothstep(b, 0.6, 0.78) : 0;
      if (wet > 0) {
        const k = 1 - wet * 0.3;
        r *= k;
        gr *= k;
        bl *= k;
      }

      // worn paint stripe: coverage thins where the grain runs high
      if (stripe && t > stripe.from && t < stripe.to) {
        const wear = 0.55 + g * 0.45;
        r += (stripe.color[0] - r) * wear;
        gr += (stripe.color[1] - gr) * wear;
        bl += (stripe.color[2] - bl) * wear;
      }

      const ai = i * 4;
      aImg.data[ai] = r; // Uint8ClampedArray clamps for us
      aImg.data[ai + 1] = gr;
      aImg.data[ai + 2] = bl;
      aImg.data[ai + 3] = 255;

      // ---- roughness (grayscale — three reads the green channel) ----
      let rv = THREE.MathUtils.lerp(roughRange[0], roughRange[1], g);
      if (wet > 0) rv = THREE.MathUtils.lerp(rv, 0.1, wet);
      if (stripe && t > stripe.from && t < stripe.to) {
        rv = THREE.MathUtils.lerp(rv, stripe.rough, 0.8);
      }
      rImg.data[ai] = rv * 255;
      rImg.data[ai + 1] = rv * 255;
      rImg.data[ai + 2] = rv * 255;
      rImg.data[ai + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    albedoTex: toTexture(alb, { srgb: true, repeat }),
    normalTex: toTexture(normalCanvas(height, size, normalStrength), { repeat }),
    roughTex: toTexture(rough, { repeat }),
  };
}

/**
 * Pipe metal: brushed grain, two weld-seam rings (constant v), and rust
 * streaks running along the length. The streaks use integer-frequency sines
 * so they wrap seamlessly along the v axis of the pipe however long it is.
 */
function pipeMaps({ size, seed, base, rust, repeat, normalStrength = 2.4 }) {
  const rng = makeRng(seed);
  const grain = fbmField(size, 70, 2, rng);

  const streaks = [];
  for (let i = 0; i < 9; i++) {
    streaks.push({
      x: rng() * size,
      w: 2 + rng() * 6,
      k: 1 + Math.floor(rng() * 3), // whole cycles along v — stays tileable
      phase: rng() * Math.PI * 2,
      depth: 0.3 + rng() * 0.55,
    });
  }
  const seams = [Math.round(size * 0.25), Math.round(size * 0.75)];

  const alb = makeCanvas(size);
  const rough = makeCanvas(size);
  const aCtx = alb.getContext("2d");
  const rCtx = rough.getContext("2d");
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const g = grain[i];

      // rust amount at this pixel — streaks wrap around u
      let rustAmt = 0;
      for (const s of streaks) {
        let dx = Math.abs(x - s.x);
        if (dx > size / 2) dx = size - dx;
        const profile = Math.max(0, 1 - dx / s.w);
        const wave = 0.5 + 0.5 * Math.sin((2 * Math.PI * s.k * y) / size + s.phase);
        rustAmt += profile * profile * s.depth * (0.35 + 0.65 * wave);
      }
      rustAmt = Math.min(1, rustAmt);

      // ---- height: grain, rust pitting, weld grooves ----
      let h = 0.5 + (g - 0.5) * 0.18 - rustAmt * 0.06;
      const seamD = Math.min(Math.abs(y - seams[0]), Math.abs(y - seams[1]));
      if (seamD < 2) h -= (1 - seamD / 2) * 0.45;
      height[i] = h;

      // ---- albedo ----
      const shade = 0.9 + g * 0.2;
      let r = base[0] * shade;
      let gr = base[1] * shade;
      let bl = base[2] * shade;
      r += (rust[0] - r) * rustAmt;
      gr += (rust[1] - gr) * rustAmt;
      bl += (rust[2] - bl) * rustAmt;
      if (seamD < 2) {
        const k = 0.65 + (seamD / 2) * 0.35;
        r *= k;
        gr *= k;
        bl *= k;
      }

      const ai = i * 4;
      aImg.data[ai] = r;
      aImg.data[ai + 1] = gr;
      aImg.data[ai + 2] = bl;
      aImg.data[ai + 3] = 255;

      // ---- roughness: polished metal, rust is matte ----
      let rv = THREE.MathUtils.lerp(0.38 + g * 0.12, 0.9, rustAmt);
      if (seamD < 2) rv = Math.min(1, rv + 0.15);
      rImg.data[ai] = rv * 255;
      rImg.data[ai + 1] = rv * 255;
      rImg.data[ai + 2] = rv * 255;
      rImg.data[ai + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    albedoTex: toTexture(alb, { srgb: true, repeat }),
    normalTex: toTexture(normalCanvas(height, size, normalStrength), { repeat }),
    roughTex: toTexture(rough, { repeat }),
  };
}

/**
 * Painted, scratched metal — barriers, gate bars, the maintenance vehicle.
 * The per-pixel pass does paint + dirt; scratches and chips are vector
 * strokes afterwards, kept clear of the edges so they never cross the
 * tiling seam. Scratches show bare metal: brighter in albedo, glossier
 * (lower roughness) than the paint.
 */
function paintedMaps({ size, seed, base, repeat, normalStrength = 2.0 }) {
  const rng = makeRng(seed);
  const grain = fbmField(size, 70, 2, rng);
  const dirt = fbmField(size, 4, 2, rng);

  const alb = makeCanvas(size);
  const rough = makeCanvas(size);
  const aCtx = alb.getContext("2d");
  const rCtx = rough.getContext("2d");
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const g = grain[i];
      const d = dirt[i];

      height[i] = 0.5 + (g - 0.5) * 0.16 + Math.max(0, d - 0.5) * 0.06;

      const shade = 0.88 + g * 0.24;
      let r = base[0] * shade;
      let gr = base[1] * shade;
      let bl = base[2] * shade;
      const dirtMix = Math.max(0, d - 0.5) * 0.8;
      r += (40 - r) * dirtMix;
      gr += (38 - gr) * dirtMix;
      bl += (33 - bl) * dirtMix;

      const ai = i * 4;
      aImg.data[ai] = r;
      aImg.data[ai + 1] = gr;
      aImg.data[ai + 2] = bl;
      aImg.data[ai + 3] = 255;

      const rv = 0.52 + g * 0.1 + dirtMix * 0.3;
      rImg.data[ai] = rv * 255;
      rImg.data[ai + 1] = rv * 255;
      rImg.data[ai + 2] = rv * 255;
      rImg.data[ai + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // ---- vector overlays: scratches + chips, same coords on both canvases ----
  aCtx.lineCap = rCtx.lineCap = "round";
  const m = 8; // margin so strokes never touch the tiling seam
  for (let i = 0; i < 12; i++) {
    const x0 = m + rng() * (size - 2 * m);
    const y0 = m + rng() * (size - 2 * m);
    const x1 = m + rng() * (size - 2 * m);
    const y1 = m + rng() * (size - 2 * m);
    const w = 0.8 + rng() * 1.2;

    aCtx.strokeStyle = `rgba(198, 208, 214, ${0.35 + rng() * 0.4})`;
    aCtx.lineWidth = w;
    aCtx.beginPath();
    aCtx.moveTo(x0, y0);
    aCtx.lineTo(x1, y1);
    aCtx.stroke();

    // bare metal is glossier than the paint
    rCtx.strokeStyle = "rgba(70, 70, 70, 0.5)";
    rCtx.lineWidth = w;
    rCtx.beginPath();
    rCtx.moveTo(x0, y0);
    rCtx.lineTo(x1, y1);
    rCtx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const cx = m + rng() * (size - 2 * m);
    const cy = m + rng() * (size - 2 * m);
    const rad = 1 + rng() * 1.5;
    aCtx.fillStyle = "rgba(24, 28, 30, 0.55)";
    aCtx.beginPath();
    aCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    aCtx.fill();
  }

  return {
    albedoTex: toTexture(alb, { srgb: true, repeat }),
    normalTex: toTexture(normalCanvas(height, size, normalStrength), { repeat }),
    roughTex: toTexture(rough, { repeat }),
  };
}

/**
 * Glazed subway tiles for the speed-warp walls (albedo only — the walls run
 * through Shader 1, which samples uMap directly). A 20×14 grid of 20 cm
 * tiles on a 512 canvas = one 4 m × 2.8 m patch of wall.
 *
 * Stays NoColorSpace on purpose: the custom shader outputs colour without
 * the sRGB/tonemap chunks, so the canvas values must reach the screen as
 * painted or the walls would go darker than the rest of the tunnel.
 */
function tileWallTexture({ size = 512, cols = 20, rows = 14, seed = 77 } = {}) {
  const rng = makeRng(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");

  const tw = size / cols;
  const th = size / rows;

  // grout
  ctx.fillStyle = "#10161a";
  ctx.fillRect(0, 0, size, size);

  const tile = new THREE.Color();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // mostly desaturated teal-grey, with occasional pale / dark tiles
      const roll = rng();
      if (roll < 0.07) tile.setHSL(0.55, 0.05, 0.4 + rng() * 0.06); // pale
      else if (roll < 0.13) tile.setHSL(0.55, 0.1, 0.14 + rng() * 0.04); // dark
      else tile.setHSL(0.545, 0.09 + rng() * 0.05, 0.2 + (rng() - 0.5) * 0.08);

      // cheap bevel: vertical gradient, lighter at the top of each tile
      const y0 = row * th;
      const grad = ctx.createLinearGradient(0, y0, 0, y0 + th);
      const top = tile.clone().offsetHSL(0, 0, 0.04);
      const bottom = tile.clone().offsetHSL(0, 0, -0.04);
      grad.addColorStop(0, `#${top.getHexString()}`);
      grad.addColorStop(1, `#${bottom.getHexString()}`);
      ctx.fillStyle = grad;
      ctx.fillRect(col * tw + 1, y0 + 1, tw - 2, th - 2);

      // some tiles are stained
      if (rng() < 0.12) {
        ctx.fillStyle = `rgba(70, 54, 34, ${0.08 + rng() * 0.14})`;
        ctx.fillRect(col * tw + 1, y0 + 1, tw - 2, th - 2);
      }
    }
  }

  // dirt settled into the grout grid
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 1;
  for (let col = 0; col <= cols; col++) {
    ctx.beginPath();
    ctx.moveTo(col * tw, 0);
    ctx.lineTo(col * tw, size);
    ctx.stroke();
  }
  for (let row = 0; row <= rows; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * th);
    ctx.lineTo(size, row * th);
    ctx.stroke();
  }

  // a few cracked tiles
  ctx.strokeStyle = "rgba(10, 14, 16, 0.55)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const col = Math.floor(rng() * cols);
    const row = Math.floor(rng() * rows);
    ctx.beginPath();
    ctx.moveTo(col * tw + rng() * tw, row * th + 2);
    ctx.lineTo(col * tw + rng() * tw, (row + 1) * th - 2);
    ctx.stroke();
  }

  // grime drips running down the wall
  for (let i = 0; i < 7; i++) {
    const x = rng() * size;
    const y0 = rng() * size * 0.5;
    const len = size * (0.2 + rng() * 0.45);
    const w = 2 + rng() * 3;
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + len);
    grad.addColorStop(0, "rgba(28, 38, 34, 0)");
    grad.addColorStop(0.25, "rgba(28, 38, 34, 0.16)");
    grad.addColorStop(1, "rgba(28, 38, 34, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y0, w, len);
  }

  // fine noise multiply so the flat tile colour doesn't read as plastic
  const grain = fbmField(size, 160, 2, makeRng(seed + 1));
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const k = 0.9 + grain[i] * 0.2;
    img.data[i * 4] *= k;
    img.data[i * 4 + 1] *= k;
    img.data[i * 4 + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);

  return canvas;
}

/* ============================ public API ============================ */

/**
 * Builds every textured material Level 1 needs. Call once from
 * Level01.init(); the meshes own the materials afterwards, and teardown
 * disposal walks them automatically.
 *
 * World sizes drive every `repeat` (BoxGeometry faces map UVs 0..1). L is the
 * tunnel length in metres and R = L / 4, so one repeat is always a 4 m slab:
 *   floor      12 × L m top face    → 4 m slabs    repeat (3, R)
 *   ceiling    12.4 × L m           → 4 m slabs    repeat (3, R)
 *   platform   1.2 × L m top face   → 4 m lengths  repeat (1, R)
 *   pipe       0.94 m circumference → 4 m lengths  repeat (1, R)
 *   wall tiles 4 m × 2.8 m patch    → uMapRepeat (R, 2.5) in Shader 1
 *
 * The caller passes tunnelLength and sets the wall shader's uMapRepeat to the
 * same R, since a raw ShaderMaterial ignores texture.repeat.
 */
export function createSubwayMaterials({ tunnelLength = 600 } = {}) {
  // Every length-wise map tiles at one repeat per 4 m of tunnel, so the texel
  // density stays put whatever the level's runway is. Level 01 grew from 600 m
  // to a few kilometres, and hard-coding 150 here would have stretched a 4 m
  // slab into a 20 m smear.
  const lengthRepeat = tunnelLength / 4;

  const floor = concreteMaps({
    size: 512,
    seed: 1337,
    base: [35, 43, 48],
    stain: [22, 20, 15],
    puddles: true, // wet-tunnel look: roughness drops where it "rains"
    joint: 5,
    repeat: [3, lengthRepeat],
  });

  const ceiling = concreteMaps({
    size: 256,
    seed: 4242,
    base: [32, 42, 52],
    stain: [22, 20, 16],
    joint: 4,
    roughRange: [0.78, 0.95],
    repeat: [3, lengthRepeat],
  });

  const platform = concreteMaps({
    size: 256,
    seed: 909,
    base: [70, 84, 92],
    stain: [34, 30, 24],
    stripe: { from: 0.72, to: 0.94, color: [176, 132, 44], rough: 0.5, lip: 0.06 },
    repeat: [1, lengthRepeat],
  });

  const pipe = pipeMaps({
    size: 256,
    seed: 5150,
    base: [84, 93, 102],
    rust: [118, 72, 42],
    repeat: [1, lengthRepeat],
  });

  const barrier = paintedMaps({ size: 256, seed: 606, base: [138, 146, 151], repeat: [1, 1] });
  const gate = paintedMaps({ size: 256, seed: 707, base: [200, 132, 52], repeat: [1, 4] });
  const vehicle = paintedMaps({ size: 256, seed: 808, base: [86, 98, 105], repeat: [1, 1] });

  const std = (maps, extra = {}) =>
    new THREE.MeshStandardMaterial({
      map: maps.albedoTex,
      normalMap: maps.normalTex,
      roughnessMap: maps.roughTex,
      roughness: 1, // the real value lives in the roughness map
      ...extra,
    });

  // the service bay reuses the wet-concrete floor look at its own tiling
  // (14 × 20 m plane → 4 m slabs again); clones keep their own repeat
  const bayFloor = new THREE.MeshStandardMaterial({
    map: floor.albedoTex.clone(),
    normalMap: floor.normalTex.clone(),
    roughnessMap: floor.roughTex.clone(),
    roughness: 1,
    metalness: 0.06,
  });
  bayFloor.map.repeat.set(3.5, 5);
  bayFloor.normalMap.repeat.set(3.5, 5);
  bayFloor.roughnessMap.repeat.set(3.5, 5);

  return {
    floorMat: std(floor, { metalness: 0.06 }),
    ceilingMat: std(ceiling, { metalness: 0.03 }),
    platformMat: std(platform, { metalness: 0.05 }),
    pipeMat: std(pipe, { metalness: 0.55 }),

    barrierMat: std(barrier, { metalness: 0.35 }),
    // the gate keeps its orange emissive glow under the scratched paint
    gateMat: std(gate, { metalness: 0.55, emissive: 0x4a2600, emissiveIntensity: 0.6 }),
    vehicleMat: std(vehicle, { metalness: 0.3 }),
    bayFloorMat: bayFloor,

    // feeds Shader 1's uMap — repeat is handled by uMapRepeat in the shader
    wallMap: toTexture(tileWallTexture()),
  };
}
