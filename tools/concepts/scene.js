/**
 * Level 3 concept renders — one still per (theme, shot), driven by the URL:
 *   index.html?theme=shrine|monastery|desert|coast&shot=hero|play
 *
 * Uses the real game pieces (Fighter, HandlerBoss, FightHUD) so Kai, the
 * Handler and the HUD look exactly as they do in-game; only the arena is new.
 * Sets window.__ready once the frame is final so a headless browser can grab it.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Fighter } from '../../src/levels/level3/Fighter.js';
import { HandlerBoss } from '../../src/levels/level3/HandlerBoss.js';
import { FightHUD } from '../../src/ui/FightHUD.js';
import { THEMES } from './themes.js';
import { STORY } from './story.js';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const themeName = params.get('theme') || 'shrine';
const storyName = params.get('story');
const shotName = params.get('shot') || 'hero';
document.body.classList.add(shotName);

/* ------------------------------------------------------------ renderer */

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 6000);

/* ------------------------------------------------------------- loaders */

const ROOT = '../../';
export const PACK = {
  ruins: ROOT + '_source/downloads/ruins/Ultimate Modular Ruins Pack - Aug 2021/FBX/',
  rts: ROOT + '_source/downloads/fantasy-rts/Ultimate Fantasy RTS - Aug 2022/glTF/',
  nature: ROOT + '_source/packs/Simple Nature Pack - Dec 2016/FBX/',
};
const RUINS_TEX = ROOT + '_source/downloads/ruins/Ultimate Modular Ruins Pack - Aug 2021/Textures/';

const manager = new THREE.LoadingManager();
// The ruins FBXs look for their leaf/bark textures beside themselves; they live in ../Textures.
manager.setURLModifier((url) => {
  const m = url.match(/(Leaf_Texture\.png|Bark_Texture\.jpg)$/);
  return m ? RUINS_TEX + m[1] : url;
});
const fbxLoader = new FBXLoader(manager);
const gltfLoader = new GLTFLoader(manager);
const texLoader = new THREE.TextureLoader(manager);

const cache = new Map();
/**
 * Load a prop once, convert it to matte PBR (FBX imports as shiny Phong), and
 * apply the theme's material tints by material name.
 */
export function model(path, tint = {}) {
  const key = path + JSON.stringify(tint);
  if (!cache.has(key)) {
    const p = (path.endsWith('.fbx') ? fbxLoader.loadAsync(path) : gltfLoader.loadAsync(path).then((g) => g.scene))
      .then((o) => { toStandard(o, tint); return o; })
      .catch((e) => { console.warn('missing', path, e); return new THREE.Group(); });
    cache.set(key, p);
  }
  return cache.get(key);
}

// The ruins FBXs lose their texture links on import; re-attach by material name.
const sharedTex = (file) => {
  const t = texLoader.load(RUINS_TEX + file);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
let LEAF, BARK;

function toStandard(root, tint) {
  LEAF ??= sharedTex('Leaf_Texture.png');
  BARK ??= sharedTex('Bark_Texture.jpg');
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const conv = (m) => {
      const t = tint[m.name] ?? tint['*'];
      const hasUv = !!o.geometry.attributes.uv;
      const fallback = hasUv && /leaf|leaves/i.test(m.name) ? LEAF : hasUv && /bark/i.test(m.name) ? BARK : null;
      const c = new THREE.MeshStandardMaterial({
        name: m.name,
        color: t !== undefined ? new THREE.Color(t) : (m.color ? m.color.clone() : new THREE.Color(0xffffff)),
        map: m.map || fallback,
        roughness: m.isMeshStandardMaterial ? Math.max(0.55, m.roughness) : 0.85,
        metalness: m.isMeshStandardMaterial ? Math.min(m.metalness, 0.3) : 0,
        side: THREE.DoubleSide,
        vertexColors: !!m.vertexColors,
        alphaTest: m.map || fallback ? 0.45 : 0,
      });
      if (c.map) c.map.colorSpace = THREE.SRGBColorSpace;
      if (/fire|flame/i.test(m.name)) { c.emissive.set(0xff8a2a); c.emissiveIntensity = 4; }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

/** Place a clone of a loaded prop. s = uniform scale; ry = yaw. */
export function place(parent, src, x, y, z, { s = 1, ry = 0, rx = 0, rz = 0, sy, shadow = true } = {}) {
  const o = src.clone();
  if (!shadow) o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.set(s, sy ?? s, s);
  parent.add(o);
  return o;
}

/** ambientCG texture set → MeshStandardMaterial. */
export function pbr(prefix, { repeat = 1, tint = 0xffffff, rough = 1, normalScale = 1, roughMap = true } = {}) {
  const load = (suffix, srgb) => {
    // bare ambientCG names (e.g. 'Ground040_1K-JPG') live in _source/ambientcg/<Set>/
    const path = prefix.includes('/') ? prefix : `_source/ambientcg/${prefix.split('_')[0]}/${prefix}`;
    const t = texLoader.load(ROOT + path + suffix);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: load('_Color.jpg', true),
    normalMap: load('_NormalGL.jpg'),
    roughnessMap: roughMap ? load('_Roughness.jpg') : null,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    color: tint,
    roughness: rough,
  });
}

/* --------------------------------------------------------------- helpers */

export function rng(seed = 1) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
`;
export { NOISE_GLSL };

/** Gradient sky dome with sun glow and soft fbm clouds. Colours are sRGB hex. */
export function sky({ top, horizon, bottom, sunDir, sunColor, sunSize = 900, clouds = 0.5, cloudColor = 0xffffff }) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) }, sunDir: { value: sunDir.clone().normalize() },
      sunColor: { value: new THREE.Color(sunColor) }, sunSize: { value: sunSize },
      clouds: { value: clouds }, cloudColor: { value: new THREE.Color(cloudColor) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: NOISE_GLSL + `
      uniform vec3 top, horizon, bottom, sunDir, sunColor, cloudColor; uniform float sunSize, clouds;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0. ? mix(horizon, top, pow(clamp(h,0.,1.), .5)) : mix(horizon, bottom, pow(clamp(-h*3.,0.,1.), .6));
        float s = max(dot(d, sunDir), 0.);
        c += sunColor * (pow(s, sunSize) * 8. + pow(s, 24.) * .45 + pow(s, 4.) * .18);
        if (h > 0.) {
          vec2 uv = d.xz / (h + .12) * 1.4;
          float cl = smoothstep(.5, .85, fbm(uv + vec2(3.1, 1.7)));
          cl *= smoothstep(0., .25, h) * clouds;
          vec3 cc = mix(cloudColor, sunColor * 1.4 + cloudColor * .4, pow(s, 6.) * .8);
          c = mix(c, cc, cl * .75);
        }
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

/** Soft round sprite for particles. */
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const DOT = dotTexture();

export function particles(count, { center = [0, 4, 0], spread = [30, 8, 30], size = 0.12, color = 0xffffff, opacity = 0.8, seed = 7, additive = true }) {
  const r = rng(seed), pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center[0] + (r() - 0.5) * spread[0];
    pos[i * 3 + 1] = center[1] + (r() - 0.5) * spread[1];
    pos[i * 3 + 2] = center[2] + (r() - 0.5) * spread[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    map: DOT, size, color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
  }));
}

/** Additive light shaft from `from` toward `to`. */
export function lightShaft(from, to, width, color, opacity = 0.12) {
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(width * 0.35, width, len, 24, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.); vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), vV)), 1.5);
      float a = edge * smoothstep(0., .25, vUv.y) * smoothstep(1., .55, vUv.y) * opacity;
      gl_FragColor = vec4(color * a, a); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from);
  const dir = to.clone().sub(from).normalize();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  return m;
}

/* --------------------------------------------------------- signs/boards */

/**
 * Text panel drawn on a canvas — departure boards, gantries, stencils, warning
 * signs. `glow` > 1 pushes the text into the bloom pass.
 */
export function sign(lines, { w = 4, h = 1, bg = '#0b0f14', fg = '#ffb547', glow = 1.4, border = null, font = 'Bahnschrift, Segoe UI, sans-serif', weight = 700, px = 1024, basic = true } = {}) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.max(32, Math.round(px * h / w));
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  if (border) {
    g.strokeStyle = border; g.lineWidth = c.height * 0.05;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
  }
  const rows = lines.map((l) => (typeof l === 'string' ? { t: l } : l));
  const total = rows.reduce((a, r) => a + (r.size ?? 1), 0);
  let y = c.height * 0.08;
  const usable = c.height * 0.84;
  for (const r of rows) {
    const rowH = usable * (r.size ?? 1) / total;
    let fs = rowH * 0.72;
    g.font = `${r.weight ?? weight} ${fs}px ${font}`;
    const wMax = c.width * 0.9;
    const tw = g.measureText(r.t).width;
    if (tw > wMax) { fs *= wMax / tw; g.font = `${r.weight ?? weight} ${fs}px ${font}`; }
    g.fillStyle = r.color ?? fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(r.t, c.width / 2, y + rowH / 2);
    y += rowH;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mat = basic
    ? new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(glow, glow, glow) })
    : new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/* ------------------------------------------------------------ the cast */

const KAI_PALETTE = { Skin: 0x9a6538, Hair: 0x1c1512, Shirt: 0x2f8fb5, Pants: 0x8a7658, Socks: 0xe6dfd6, Shoes: 0x2a2320 };

function step(fighter, seconds) {
  const n = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < n; i++) fighter.update(1 / 60);
}

function pose(f, name, spec) {
  if (spec.lean) f.setLean(spec.lean);
  switch (name) {
    case 'guard': f.setGuard(true); step(f, 0.6); break;
    case 'punch': f.playOnce('punch'); step(f, f.clipDuration('punch') * (spec.t ?? 0.42)); break;
    case 'kick': f.setKick('R', 1); step(f, 0.3); break;
    case 'flinch':
      f.setGuard(true, 0.6); f.setLean(-0.12); step(f, 0.5);
      f.flinchT = 0.25; // flinch without the white hit-flash
      step(f, 0.09);
      break;
    default: // any rig clip: run, walk, sitting, idle, death, jump, standing, runningjump
      if (spec.guard) f.setGuard(true, spec.guard);
      f.play(name, { fade: 0 });
      step(f, spec.t ?? 0.5);
  }
}

/** The Key: a shielded drive glowing cyan in Kai's right hand. */
function attachKey(f) {
  let palm = null;
  f.model?.traverse((o) => { if (o.isBone && o.name === 'PalmR') palm = o; });
  if (!palm) return;
  f.root.updateMatrixWorld(true);
  const s = palm.getWorldScale(new THREE.Vector3()).x;
  const key = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.025),
    new THREE.MeshStandardMaterial({ color: 0x141c26, emissive: 0x2fd8ff, emissiveIntensity: 2.4, metalness: 0.6, roughness: 0.3 }));
  key.scale.setScalar(1 / s);
  key.position.set(0, 0.07 / s, 0.02 / s);
  palm.add(key);
  const glow = new THREE.PointLight(0x40e0ff, 1.2, 2.2, 2);
  key.add(glow);
}

function spawn(world, src, spec) {
  let f, boss = null;
  if (spec.who === 'kai') f = new Fighter(world, { source: src.kai, palette: KAI_PALETTE });
  else {
    boss = new HandlerBoss(world, { root: new THREE.Object3D() }, src.handler);
    f = boss.fighter;
  }
  const [x, y, z] = spec.pos;
  f.root.position.set(x, y, z);
  if (spec.face) f.root.rotation.y = Math.atan2(spec.face[0] - x, spec.face[2] - z);
  else f.root.rotation.y = spec.ry ?? 0;
  pose(f, spec.pose ?? 'idle', spec);
  if (boss && spec.helmet === false && boss.helmet) {
    const h = boss.helmet;
    h.parent.remove(h);
    if (spec.helmetAt) {
      const lying = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), h.material);
      lying.scale.set(1, 1.15, 1.05);
      lying.position.set(...spec.helmetAt);
      lying.rotation.set(1.3, 0.5, 0.2);
      lying.castShadow = true;
      world.add(lying);
    }
  }
  if (spec.key) attachKey(f);
  return f;
}

function hitSpark(world, at) {
  const g = new THREE.Group();
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xfff2d0, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.setScalar(0.45);
  core.material.opacity = 0.85;
  g.add(core);
  const r = rng(3);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xffb04a, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    const a = r() * Math.PI * 2, e = (r() - 0.5) * 1.6, d = 0.25 + r() * 0.5;
    s.position.set(Math.cos(a) * d, Math.sin(e) * d, Math.sin(a) * d * 0.5);
    s.scale.setScalar(0.06 + r() * 0.08);
    g.add(s);
  }
  g.position.copy(at);
  world.add(g);
}

/* ------------------------------------------------- level 3 theme shots */

const FIGHT_LAYOUT = {
  hero: { kai: [0.4, 0, 1.25], handler: [-0.3, 0, -1.05] },
  play: { kai: [1.0, 0, 0.15], handler: [-0.45, 0, -0.65] },
  reveal: { kai: [0.55, 0, 1.2], handler: [-0.2, 0, -0.7] },
};

/** Turn a theme's world into one of the four Act III beats. */
function themeShot(setup, world) {
  const L = { ...FIGHT_LAYOUT, ...setup.fighters }[shotName];
  const out = { cast: [], camera: setup.cameras[shotName], bloom: setup.bloom };
  if (shotName === 'hero') {
    out.cast.push({ who: 'kai', pos: L.kai, face: L.handler, pose: 'guard' }, { who: 'handler', pos: L.handler, face: L.kai, pose: 'punch' });
  } else if (shotName === 'play') {
    out.cast.push({ who: 'kai', pos: L.kai, face: L.handler, pose: 'kick' }, { who: 'handler', pos: L.handler, face: L.kai, pose: 'flinch' });
    const k = new THREE.Vector3(...L.kai), h = new THREE.Vector3(...L.handler);
    hitSpark(world, k.clone().lerp(h, 0.72).setY(L.kai[1] + 1.25));
    out.hud = (host) => {
      const hud = new FightHUD(host);
      hud.setBoss(0.58, 'PHASE II — PRESSURE');
      hud.setPlayer(0.78, 0.46);
      hud.setLock(true);
      hud.pop.textContent = 'COUNTER!';
      hud.pop.style.color = '#ffd27a';
      hud.pop.style.opacity = '1';
    };
  } else if (shotName === 'wake') {
    out.cast.push({ who: 'kai', pos: L.kai, face: L.face, ry: L.ry, pose: 'sitting', t: L.t ?? 1.4, key: true });
  } else if (shotName === 'reveal') {
    const k = new THREE.Vector3(...L.kai), h = new THREE.Vector3(...L.handler);
    out.cast.push(
      { who: 'kai', pos: L.kai, face: L.handler, pose: 'guard', key: true },
      { who: 'handler', pos: L.handler, face: L.kai, pose: 'idle', t: 2.1, helmet: false, helmetAt: [h.x + 0.9, h.y + 0.17, h.z + 0.55] },
    );
    if (!out.camera) {
      const d = k.clone().sub(h).setY(0).normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(d).normalize();
      const pos = k.clone().addScaledVector(d, 1.3).addScaledVector(right, -0.55).setY(k.y + 1.75);
      out.camera = { pos: pos.toArray(), look: [h.x, h.y + 1.6, h.z], fov: 30 };
    }
    // soft key light on his face so the reveal reads in every theme's lighting
    const key = new THREE.SpotLight(0xfff0e0, 9, 8, 0.35, 0.8, 1.5);
    key.position.set(out.camera.pos[0], out.camera.pos[1] + 0.4, out.camera.pos[2]);
    key.target.position.set(h.x, h.y + 1.6, h.z);
    world.add(key, key.target);
  }
  return out;
}

/* ----------------------------------------------------------------- main */

async function main() {
  const theme = storyName ? null : THEMES[themeName];
  const world = new THREE.Group();
  scene.add(world);

  // soft image-based fill from the provided HDRI (a city street, so it is only
  // used for lighting/reflections, never shown as the background)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const exr = await new EXRLoader().loadAsync(ROOT + '_source/downloads/hdri/DayEnvironmentHDRI101_1K_HDR.exr').catch(() => null);
  if (exr) {
    exr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(exr).texture;
    scene.environmentIntensity = theme?.envIntensity ?? 0.3;
  }

  const [kai, handler] = await Promise.all([
    fbxLoader.loadAsync(ROOT + 'assets/characters/kai.fbx'),
    fbxLoader.loadAsync(ROOT + 'assets/characters/handler.fbx'),
  ]);
  const src = { kai, handler };

  const ctx = { scene, world, renderer, camera, shot: shotName, THREE, W, H };
  let setup;
  if (storyName) setup = await STORY[storyName](ctx);
  else setup = themeShot(await theme.build(ctx), world);

  for (const spec of setup.cast ?? []) spawn(world, src, spec);
  if (setup.hud) setup.hud(document.getElementById('hud'));
  if (setup.exposure) renderer.toneMappingExposure = setup.exposure;
  if (setup.envIntensity !== undefined) scene.environmentIntensity = setup.envIntensity;

  const cam = setup.camera;
  camera.fov = cam.fov;
  camera.position.set(...cam.pos);
  camera.lookAt(new THREE.Vector3(...cam.look));
  camera.updateProjectionMatrix();

  // wait for every texture to arrive before rendering the final frame
  await new Promise((res) => {
    if (manager.itemsLoaded >= manager.itemsTotal) return res();
    manager.onLoad = res;
    setTimeout(res, 20000);
  });
  await new Promise((r) => setTimeout(r, 300));

  const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const b = setup.bloom ?? theme?.bloom ?? {};
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), b.strength ?? 0.35, b.radius ?? 0.55, b.threshold ?? 0.92));
  composer.addPass(new OutputPass());

  composer.render();
  composer.render();

  // picture-in-picture views (rear-view mirror, minimap) drawn straight on top
  for (const v of setup.views ?? []) {
    const [x, y, w, h] = v.rect;
    renderer.setScissorTest(true);
    renderer.setScissor(x, H - y - h, w, h);
    renderer.setViewport(x, H - y - h, w, h);
    renderer.render(scene, v.camera);
  }
  renderer.setScissorTest(false);
  window.__ready = true;
}

main().catch((e) => { console.error(e); document.title = 'ERROR ' + e.message; window.__error = String(e.stack || e); window.__ready = true; });
