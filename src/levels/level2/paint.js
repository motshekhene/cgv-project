import * as THREE from 'three';

/**
 * paint.js — Member 2A
 *
 * Repaints a car model without touching its glass, tyres, chrome or lights.
 *
 * The Kenney cars (and most low-poly packs) use ONE shared palette texture,
 * so a plain material tint would darken the windows and tyres too. Instead
 * this injects a small fragment-shader step (onBeforeCompile) right after the
 * texture is sampled:
 *
 *   1. convert the texel to HSV
 *   2. paintMask = "saturated AND close to the car's paint hue"
 *   3. inside the mask, swap hue/saturation for the new paint and rescale the
 *      brightness, so the model's own shading (darker sills, lighter bonnet)
 *      survives the repaint
 *
 * The car's original paint hue is found automatically (detectPaint): every
 * triangle's texel is looked up and weighted by its surface area; the
 * saturated hue covering the most area wins — on a car that's the bodywork.
 *
 *   const info = detectPaint(model);                 // once per model file
 *   applyPaint(model, 0xc8102e, info);               // or null for factory paint
 */

/** Player paint options (null = the model's own colour). */
export const PAINTS = [
  { id: 'factory', name: 'Factory', color: null },
  { id: 'crimson', name: 'Crimson', color: 0xc8102e },
  { id: 'midnight', name: 'Midnight', color: 0x1c2e6b },
  { id: 'racing-green', name: 'Racing Green', color: 0x0f5132 },
  { id: 'pearl', name: 'Pearl White', color: 0xe9e9e6 },
  { id: 'gunmetal', name: 'Gunmetal', color: 0x4a4f55 },
  { id: 'sunset', name: 'Sunset', color: 0xff6a13 },
  { id: 'toxic', name: 'Toxic', color: 0xc8e600 },
  { id: 'violet', name: 'Violet', color: 0x6a2c91 },
  { id: 'black', name: 'Matte Black', color: 0x161616 },
];

/** Everyday colours for traffic, weighted towards the greys you actually see on a motorway. */
export const TRAFFIC_PAINTS = [
  0xe9e9e6, 0xe9e9e6, 0xb9bcc0, 0xb9bcc0, 0x6b7076, 0x1a1a1a, 0x1a1a1a,
  0x1f3a68, 0x7a1018, 0x2f4f3a, 0xc9b48a, 0x8a2a1c, 0x3d5a80,
];

const GLSL_HSV = /* glsl */`
vec3 paint_rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 paint_hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
uniform float uPaintOn;
uniform float uSrcHue;
uniform float uSrcVal;
uniform vec3 uPaintHSV;
`;

const GLSL_APPLY = /* glsl */`
#include <map_fragment>
if (uPaintOn > 0.5) {
  vec3 hsv = paint_rgb2hsv(diffuseColor.rgb);
  float dh = abs(hsv.x - uSrcHue);
  dh = min(dh, 1.0 - dh);
  float mask = smoothstep(0.18, 0.32, hsv.y)          // saturated (not glass/tyre/chrome)
             * (1.0 - smoothstep(0.06, 0.10, dh))      // and the paint's hue (not the tail lights)
             * step(0.03, hsv.z);
  float v = clamp(hsv.z / max(uSrcVal, 0.02) * uPaintHSV.z, 0.0, 1.0);
  vec3 painted = paint_hsv2rgb(vec3(uPaintHSV.x, uPaintHSV.y, v));
  diffuseColor.rgb = mix(diffuseColor.rgb, painted, mask);
}
`;


function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/**
 * Finds the bodywork colour of a loaded model: { hue, val } in linear space,
 * or null if it has no texture to read (then applyPaint falls back to the
 * material colour).
 */
export function detectPaint(model) {
  // untextured models (Quaternius etc.) name their materials: paint the body ones
  const named = detectBodyMaterials(model);
  if (named) return named;

  const bins = new Float32Array(36), vals = new Float32Array(36), hues = new Float32Array(36);
  let canvasCache = new Map();
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.uv) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      const img = mat.map && mat.map.image;
      let px = null, w = 0, h = 0;
      if (img && typeof document !== 'undefined') {
        let entry = canvasCache.get(img);
        if (!entry) {
          w = img.width; h = img.height;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          entry = { data: ctx.getImageData(0, 0, w, h).data, w, h };
          canvasCache.set(img, entry);
        }
        ({ data: px, w, h } = entry);
      }
      const base = mat.color;
      const uv = o.geometry.attributes.uv;
      const pos = o.geometry.attributes.position;
      const index = o.geometry.index;
      const triCount = index ? index.count / 3 : pos.count / 3;
      const step = Math.max(1, Math.floor(triCount / 6000));
      const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c2 = new THREE.Vector3();
      for (let t = 0; t < triCount; t += step) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        // weight by surface AREA: bodywork is big panels, glass and lights are small faces
        a.fromBufferAttribute(pos, i0); b2.fromBufferAttribute(pos, i1); c2.fromBufferAttribute(pos, i2);
        const area = b2.sub(a).cross(c2.sub(a)).length();
        if (!(area > 0)) continue;
        const u = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3;
        const v = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
        let r = base.r, g = base.g, b = base.b;
        if (px) {
          const x = Math.min(w - 1, Math.max(0, Math.floor((u % 1 + 1) % 1 * w)));
          const y = Math.min(h - 1, Math.max(0, Math.floor((v % 1 + 1) % 1 * h)));
          const k = (y * w + x) * 4;
          r *= srgbToLinear(px[k] / 255); g *= srgbToLinear(px[k + 1] / 255); b *= srgbToLinear(px[k + 2] / 255);
        }
        const [hh, ss, vv] = rgbToHsv(r, g, b);
        if (ss < 0.35 || vv < 0.04) continue;
        const bin = Math.floor(hh * 36) % 36;
        bins[bin] += area; vals[bin] += vv * area; hues[bin] += hh * area;
      }
    }
  });
  let best = -1, bestCount = 0;
  for (let i = 0; i < 36; i++) {
    const c = bins[i] + 0.5 * (bins[(i + 35) % 36] + bins[(i + 1) % 36]);   // smooth over neighbours
    if (c > bestCount) { bestCount = c; best = i; }
  }
  if (best < 0 || bins[best] === 0) return null;
  return { hue: hues[best] / bins[best], val: vals[best] / bins[best] };
}

/**
 * Repaints `model` (a loaded, cloned car). Materials are cloned once per
 * model instance so other copies keep their own colour; calling it again
 * just updates uniforms. color = null restores the factory paint.
 */
export function applyPaint(model, color, info) {
  if (!info) return;
  if (info.bodyMaterials) return applyMaterialPaint(model, color, info);
  const target = new THREE.Color();
  if (color !== null) target.setHex(color);   // hex is sRGB; Color stores linear
  const [h, s, v] = rgbToHsv(target.r, target.g, target.b);

  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.paintable) {
      o.material = Array.isArray(o.material) ? o.material.map(makePaintable) : makePaintable(o.material);
      o.userData.paintable = true;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      const u = mat.userData.paintUniforms;
      u.uPaintOn.value = color === null ? 0 : 1;
      u.uSrcHue.value = info.hue;
      u.uSrcVal.value = info.val;
      u.uPaintHSV.value.set(h, s, Math.max(0.02, v));
    }
  });
}

// material names that are NOT bodywork
const NOT_BODY = /window|glass|black|grey|gray|headlight|taillight|lights|lamp|chrome|tyre|tire|wheel|rim|siren|interior|plate|material\./i;   // 'LightBlue' paint is fine

/**
 * For models without a texture: the body is the non-excluded material(s)
 * covering the most surface. Returns { bodyMaterials: Map(name -> relative
 * brightness) } so two-tone bodies (Orange + DarkOrange) keep their contrast.
 */
function detectBodyMaterials(model) {
  let textured = false;
  const area = new Map(), mats = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    if (list.some((m) => m.map)) textured = true;
    const pos = o.geometry.attributes.position, index = o.geometry.index;
    const groups = o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    for (const g of groups) {
      const m = list[g.materialIndex] || list[0];
      if (!m || NOT_BODY.test(m.name || '')) continue;
      let sum = 0;
      for (let k = g.start; k < g.start + g.count; k += 3) {
        const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
        a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
        sum += b.sub(a).cross(c.sub(a)).length();
      }
      area.set(m.name, (area.get(m.name) || 0) + sum);
      mats.set(m.name, m);
    }
  });
  if (textured || !area.size) return null;
  // keep every body material with at least 15% of the biggest one's area
  const max = Math.max(...area.values());
  const body = [...area.entries()].filter(([, v]) => v >= max * 0.15).map(([n]) => n);
  const bright = (n) => { const col = mats.get(n).color; return Math.max(col.r, col.g, col.b); };
  const top = Math.max(...body.map(bright), 1e-3);
  return { bodyMaterials: new Map(body.map((n) => [n, bright(n) / top])) };
}

function applyMaterialPaint(model, color, info) {
  const target = new THREE.Color();
  if (color !== null) target.setHex(color);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      const rel = info.bodyMaterials.get(m.userData.paintOf || m.name);
      if (rel === undefined) return m;
      // clone once per model instance so other copies keep their colour
      const mine = m.userData.paintOwner === o ? m : Object.assign(m.clone(), {});
      if (mine !== m) {
        mine.userData = { ...m.userData, paintOwner: o, paintOf: m.name, factory: m.color.clone() };
      }
      if (color === null) mine.color.copy(mine.userData.factory);
      else mine.color.copy(target).multiplyScalar(rel);   // darker tones stay darker
      return mine;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

function makePaintable(src) {
  const mat = src.clone();
  const uniforms = {
    uPaintOn: { value: 0 },
    uSrcHue: { value: 0 },
    uSrcVal: { value: 1 },
    uPaintHSV: { value: new THREE.Vector3() },
  };
  mat.userData.paintUniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_HSV)
      .replace('#include <map_fragment>', GLSL_APPLY);
  };
  mat.customProgramCacheKey = () => 'car-paint';
  return mat;
}
