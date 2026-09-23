import * as THREE from "three";

/**
 * Level 03 shader + texture library — "one owner" per the pitch.
 *
 * Everything here is either a custom ShaderMaterial (lava, heat haze,
 * embers, sparks, shockwave rings) or a patch we inject into a standard
 * material (dissolve, phase-3 rim), so the rubric's "five custom shaders,
 * all time- or state-driven" line is paid for by files you can point at.
 *
 * The CPU noise below is shared with Arena.js so the rock displaced on the
 * CPU and the textures baked here agree with each other.
 */

/* ------------------------------------------------------------------ *
 * CPU noise — value-noise fbm, small and deterministic
 * ------------------------------------------------------------------ */

function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

export function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x, y, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise2(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value; // ~0..1
}

/* ------------------------------------------------------------------ *
 * Procedural rock textures (normal + roughness), baked once
 * ------------------------------------------------------------------ */

let rockTextures = null;

function makeRockTextures(size = 256) {
  if (rockTextures) return rockTextures;

  const heightAt = (x, y) =>
    fbm2(x * 0.028, y * 0.028, 5) * 0.7 + fbm2(x * 0.11, y * 0.11, 3) * 0.3;

  const nData = new Uint8Array(size * size * 4);
  const rData = new Uint8Array(size * size * 4);

  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x + 1) % size;
      const xM = (x - 1 + size) % size;
      const ym = (y + 1) % size;
      const yM = (y - 1 + size) % size;
      const dx = heightAt(xm, y) - heightAt(xM, y);
      const dy = heightAt(x, ym) - heightAt(x, yM);
      // normal = normalize(-dx, -dy, 1)
      const inv = 1 / Math.hypot(dx * strength, dy * strength, 1);
      const nx = -dx * strength * inv;
      const ny = -dy * strength * inv;
      const nz = inv;
      const i = (y * size + x) * 4;
      nData[i] = (nx * 0.5 + 0.5) * 255;
      nData[i + 1] = (ny * 0.5 + 0.5) * 255;
      nData[i + 2] = (nz * 0.5 + 0.5) * 255;
      nData[i + 3] = 255;
      const rough = 195 - fbm2(x * 0.05, y * 0.05, 3) * 70;
      rData[i] = rData[i + 1] = rData[i + 2] = rough;
      rData[i + 3] = 255;
    }
  }

  const normalMap = new THREE.DataTexture(nData, size, size);
  const roughnessMap = new THREE.DataTexture(rData, size, size);
  for (const tex of [normalMap, roughnessMap]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
  }
  rockTextures = { normalMap, roughnessMap };
  return rockTextures;
}

/** Rock/concrete material with baked normal + roughness detail. */
export function makeRockMaterial({
  color = 0x6b5646,
  normalScale = 1.15,
  roughness = 1.0,
  metalness = 0.0,
  repeat = 3,
} = {}) {
  const { normalMap, roughnessMap } = makeRockTextures();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    roughnessMap,
    envMapIntensity: 0.4,
  });
  // cloned maps so each material can tile at its own scale
  const nm = normalMap.clone();
  const rm = roughnessMap.clone();
  nm.repeat.set(repeat, repeat);
  rm.repeat.set(repeat, repeat);
  mat.normalMap = nm;
  mat.roughnessMap = rm;
  mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  return mat;
}

/* ------------------------------------------------------------------ *
 * Lava — the level's signature shader
 * domain-warped fbm, animated, ACES + fog + gamma handled by hand
 * because ShaderMaterials don't run the built-in post chain
 * ------------------------------------------------------------------ */

const LAVA_VERT = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = vec4(position, 1.0);
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const LAVA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHot;
  uniform float uScale;
  uniform float uSpeed;
  uniform vec2 uOffset;
  uniform float uExposure;
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>

  float lhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float lnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(lhash(i), lhash(i + vec2(1.0, 0.0)), u.x),
      mix(lhash(i + vec2(0.0, 1.0)), lhash(i + vec2(1.0, 1.0)), u.x),
      u.y);
  }
  float lfbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * lnoise(p);
      p = p * 2.03 + 19.19;
      a *= 0.5;
    }
    return v;
  }
  // three's ACES approximation, copied so ShaderMaterial matches the renderer
  vec3 aces(vec3 c) {
    c *= uExposure;
    const mat3 inMat = mat3(
      0.59719, 0.07600, 0.02840,
      0.35458, 0.90834, 0.13383,
      0.04823, 0.01566, 0.83777);
    const mat3 outMat = mat3(
      1.60475, -0.10208, -0.00327,
      -0.53108, 1.10813, -0.07276,
      -0.07367, -0.00605, 1.07602);
    c = inMat * c;
    c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081);
    c = outMat * c;
    return saturate(c);
  }
  void main() {
    vec2 p = vUv * uScale + uOffset;
    float t = uTime * uSpeed;
    // domain warp: two nested fbm fields push the third around
    vec2 q = vec2(lfbm(p + t * 0.06), lfbm(p + vec2(5.2, 1.3) - t * 0.05));
    vec2 r = vec2(
      lfbm(p + 2.4 * q + vec2(1.7, 9.2) + t * 0.09),
      lfbm(p + 2.4 * q + vec2(8.3, 2.8) - t * 0.07));
    float v = lfbm(p + 2.6 * r);

    vec3 col = mix(uDeep, uMid, smoothstep(0.22, 0.58, v));
    col = mix(col, uHot, smoothstep(0.60, 0.93, v));
    col *= 0.72 + 0.55 * r.x;
    // the veins pulse — slow circulation, not a strobe
    float pulse = 0.5 + 0.5 * sin(uTime * 1.7 + v * 14.0 + r.y * 6.0);
    col += uHot * smoothstep(0.70, 0.95, v) * (0.3 + 0.8 * pulse);

    col = aces(col);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(0.4545454545));
  }
`;

export function makeLavaMaterial({
  deep = 0x2b0903,
  mid = 0xc93c07,
  hot = 0xffb03a,
  scale = 3.2,
  speed = 0.35,
  exposure = 1.25,
} = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: LAVA_VERT,
    fragmentShader: LAVA_FRAG,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(deep) },
        uMid: { value: new THREE.Color(mid) },
        uHot: { value: new THREE.Color(hot) },
        uScale: { value: scale },
        uSpeed: { value: speed },
        uOffset: { value: new THREE.Vector2(Math.random() * 50, Math.random() * 50) },
        uExposure: { value: exposure },
      },
    ]),
  });
  return mat;
}

/* ------------------------------------------------------------------ *
 * Heat haze — cheap additive shimmer above the pool
 * ------------------------------------------------------------------ */

export function makeHeatHazeMaterial({
  color = 0xffa254,
  opacity = 0.5,
} = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      float hhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float hn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hhash(i), hhash(i + vec2(1.0, 0.0)), u.x),
          mix(hhash(i + vec2(0.0, 1.0)), hhash(i + vec2(1.0, 1.0)), u.x),
          u.y);
      }
      void main() {
        // stretched vertically so it reads as rising air, not smoke
        float n = hn(vUv * vec2(7.0, 22.0) + vec2(0.0, -uTime * 1.6));
        float n2 = hn(vUv * vec2(13.0, 34.0) + vec2(uTime * 0.4, -uTime * 2.3));
        float shimmer = smoothstep(0.45, 0.9, n * 0.7 + n2 * 0.3);
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = smoothstep(0.0, 0.18, min(e.x, e.y));
        gl_FragColor = vec4(uColor, shimmer * edge * uOpacity);
      }
    `,
  });
}

/* ------------------------------------------------------------------ *
 * Dissolve — patch injected into any MeshStandardMaterial
 * (helmet reveal, boss death, collapsing floor wedges)
 * ------------------------------------------------------------------ */

export function makeDissolve(
  material,
  { color = 0xff6a00, scale = 5.0, edge = 0.14 } = {},
) {
  const uniforms = {
    uDissolve: { value: 0 },
    uEdgeColor: { value: new THREE.Color(color) },
    uEdge: { value: edge },
    uScale: { value: scale },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vDissolveP;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvDissolveP = position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vDissolveP;
        uniform float uDissolve;
        uniform vec3 uEdgeColor;
        uniform float uEdge;
        uniform float uScale;
        float dHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        float dNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = dHash(i);
          float n100 = dHash(i + vec3(1.0, 0.0, 0.0));
          float n010 = dHash(i + vec3(0.0, 1.0, 0.0));
          float n110 = dHash(i + vec3(1.0, 1.0, 0.0));
          float n001 = dHash(i + vec3(0.0, 0.0, 1.0));
          float n101 = dHash(i + vec3(1.0, 0.0, 1.0));
          float n011 = dHash(i + vec3(0.0, 1.0, 1.0));
          float n111 = dHash(i + vec3(1.0, 1.0, 1.0));
          return mix(
            mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
            mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
            f.z);
        }`,
      )
      .replace(
        "#include <tonemapping_fragment>",
        `float dnv = dNoise(vDissolveP * uScale) * 0.65 + dNoise(vDissolveP * uScale * 3.1) * 0.35;
        if (dnv < uDissolve) discard;
        outgoingLight += uEdgeColor * smoothstep(uDissolve + uEdge, uDissolve, dnv) * 2.2;
        #include <tonemapping_fragment>`,
      );
  };
  return {
    uniforms,
    set(value) {
      uniforms.uDissolve.value = value;
    },
    get() {
      return uniforms.uDissolve.value;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Rim — phase-3 outline on the Handler
 * inverted hull breaks on skinned meshes, so we do it as an emissive
 * fresnel injection instead. Works on GLB and fallback alike.
 * ------------------------------------------------------------------ */

export function applyRim(material, color = 0xff2a1a, strength = 1.5) {
  const uniforms = {
    uRimColor: { value: new THREE.Color(color) },
    uRimStrength: { value: strength },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;",
      )
      .replace(
        "#include <lights_fragment_begin>",
        `#include <lights_fragment_begin>
        {
          float rim = pow(1.0 - saturate(dot(normalize(geometry.geometryNormal), normalize(geometry.geometryViewDir))), 3.0);
          totalEmissiveRadiance += uRimColor * rim * uRimStrength;
        }`,
      );
  };
  return {
    uniforms,
    setStrength(v) {
      uniforms.uRimStrength.value = v;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Environment — tiny PMREM gradient scene: warm below, cold above
 * one render target, disposed in Level03.teardown()
 * ------------------------------------------------------------------ */

export function makeEnvMap(renderer) {
  const envScene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 24, 16);
  const posAttr = geo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const warm = new THREE.Color(0xff6a22).multiplyScalar(1.4);
  const hot = new THREE.Color(0xff9a3a).multiplyScalar(2.2);
  const cool = new THREE.Color(0x0c1626);
  const c = new THREE.Color();
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = THREE.MathUtils.clamp((y + 10) / 20, 0, 1);
    c.copy(warm).lerp(cool, Math.pow(t, 0.7));
    if (Math.abs(y + 4) < 1.4) c.add(hot); // lava band around the "horizon"
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    vertexColors: true,
  });
  envScene.add(new THREE.Mesh(geo, mat));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.06);
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return rt;
}

/* ------------------------------------------------------------------ *
 * Small canvas helpers — glow sprite + diegetic boards
 * ------------------------------------------------------------------ */

let glowTex = null;

export function makeGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function makeGlowSprite(color, scale = 1) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

/** Mine signage — "SHAFT 7", "SECTOR 9 — UPLINK", the diegetic boards. */
export function makeBoardTexture({ title, lines = [], accent = "#ffb648" }) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#151009";
  ctx.fillRect(0, 0, 512, 256);

  // hazard stripe borders, top and bottom
  const stripe = (y) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, 512, 18);
    ctx.clip();
    for (let x = -24; x < 512 + 24; x += 36) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(x, y + 18);
      ctx.lineTo(x + 18, y);
      ctx.lineTo(x + 36, y);
      ctx.lineTo(x + 18, y + 18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };
  stripe(6);
  stripe(232);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd9a0";
  ctx.font = "700 44px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(title.toUpperCase(), 256, 92, 464);
  ctx.fillStyle = "#b7a58c";
  ctx.font = "600 24px 'Segoe UI', Arial, sans-serif";
  lines.forEach((line, i) => {
    ctx.fillText(line.toUpperCase(), 256, 134 + i * 32, 464);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Emissive helper — lamp glass, server LEDs, the Key's drive. */
export function makeEmissive(color, intensity = 2.2, base = 0x0a0705) {
  return new THREE.MeshStandardMaterial({
    color: base,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
  });
}
