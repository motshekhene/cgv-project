import * as THREE from 'three';
import { NOISE_GLSL } from '../../shaders/noise.js';

/**
 * River — Member 2A (Level 2 improvements)
 *
 * The river either side of the causeway in the last 200 m, as a river rather
 * than two flat rectangles of water:
 *
 *   banks    the outline wanders (it widens and narrows, and the upstream
 *            shore curls round in bays), and the ground slopes down into it:
 *            wet dark mud at the waterline, a sunken bed under the water. The
 *            shoreline is simply where that ground meets the water, so it is
 *            as irregular as the ground.
 *   current  it flows towards the falls and speeds up near the lip (a flow-map
 *            blend, so the ripples never smear), shallow and green-brown at
 *            the edges, deep in the middle.
 *   white    foam along the shore and the causeway walls, foam trails behind
 *            every boulder, and rapids that whiten the last 60 m to the lip.
 *
 * shore(x, zr) is the same function in JS and GLSL: metres inside the water
 * (negative on land); zr is z relative to the lip (-200..0).
 *
 *   const river = new River(group, { endZ: E, wallX, forest: mat });
 *   river.addRocks(list)           // [{ x, z, r }] the current breaks round
 *   river.material.uniforms.uTime  // driven by Course.update via course.waters
 */

export const WATER_Y = -0.7;
export const RIVER_LEN = 200;

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Metres inside the river (negative: on the bank). */
export function shore(x, zr) {
  const ax = Math.abs(x);
  const outer = 100 + 14 * Math.sin(zr * 0.031 + 1.3) + 7 * Math.sin(zr * 0.083 + 0.4) + 12 * sstep(-40, 0, zr);
  const up = zr + 180 + 10 * Math.sin(ax * 0.05 + 0.7) + 5 * Math.sin(ax * 0.17);
  const wobble = 1.2 * Math.sin(x * 0.41 + zr * 0.27) + 0.8 * Math.sin(x * 0.93 - zr * 0.71);
  return Math.min(outer - ax, up) + wobble;
}

const SHORE_GLSL = /* glsl */ `
  float shore(float x, float zr) {
    float ax = abs(x);
    float outer = 100.0 + 14.0 * sin(zr * 0.031 + 1.3) + 7.0 * sin(zr * 0.083 + 0.4) + 12.0 * smoothstep(-40.0, 0.0, zr);
    float up = zr + 180.0 + 10.0 * sin(ax * 0.05 + 0.7) + 5.0 * sin(ax * 0.17);
    float wobble = 1.2 * sin(x * 0.41 + zr * 0.27) + 0.8 * sin(x * 0.93 - zr * 0.71);
    return min(outer - ax, up) + wobble;
  }
`;

const MAX_ROCKS = 24;

const vertex = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragment = NOISE_GLSL + SHORE_GLSL + /* glsl */ `
  uniform float uTime, uEnd, uWall, uOpacity;
  uniform vec3 uDeep, uShallow, uMud, uSky, uSunDir, uSunColor;
  uniform vec3 uRocks[${MAX_ROCKS}];   // x, z, radius
  uniform int uRockCount;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float fbm3(vec2 p) {
    return noise(p) * 0.55 + noise(p * 2.07 + 3.1) * 0.3 + noise(p * 4.13 + 7.7) * 0.15;
  }
  // the surface: broad swells and fine chop
  float waves(vec2 p) { return fbm3(p * 0.32) * 0.65 + noise(p * 1.5) * 0.35; }
  // foam texture: stretched along the current
  float foamTex(vec2 p) { return noise(vec2(p.x * 0.9, p.y * 0.14)) * 0.6 + noise(p * 0.75) * 0.4; }

  void main() {
    vec2 p = vWorld.xz;
    float zr = p.y - uEnd;
    if (abs(p.x) < uWall + 0.3) discard;      // under the causeway
    float d = shore(p.x, zr);

    // the current: towards the falls (+z), quicker near the lip. Two copies of
    // the pattern slide along it half a cycle apart and cross-fade, so it never
    // stretches out however long you watch.
    float rapids = smoothstep(-70.0, 0.0, zr);
    vec2 flow = vec2(0.0, 1.2 + 4.5 * rapids);
    float t = uTime * 0.25;
    float ph0 = fract(t), ph1 = fract(t + 0.5);
    float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
    vec2 o0 = flow * ph0 * 4.0, o1 = flow * ph1 * 4.0 + vec2(17.3, 9.1);

    float e = 0.2;
    vec3 hs = vec3(0.0);   // h, h(x+e), h(z+e)
    hs += w0 * vec3(waves(p - o0), waves(p - o0 + vec2(e, 0.0)), waves(p - o0 + vec2(0.0, e)));
    hs += (1.0 - w0) * vec3(waves(p - o1), waves(p - o1 + vec2(e, 0.0)), waves(p - o1 + vec2(0.0, e)));
    float rough = 0.55 - 0.3 * rapids;          // choppier towards the lip
    vec3 n = normalize(vec3(hs.x - hs.y, rough * e * 4.0, hs.x - hs.z));

    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    // deep in the middle, shallow and silty at the edges
    vec3 c = mix(uDeep, uShallow, smoothstep(0.3, 0.8, hs.x));
    c = mix(c, uMud, (1.0 - smoothstep(0.0, 9.0, d)) * 0.55);
    c = mix(c, uSky, fres * 0.6);
    vec3 r = reflect(-normalize(uSunDir), n);
    c += uSunColor * pow(max(dot(r, v), 0.0), 120.0) * 1.1;

    // white water: the shore, the causeway walls, the boulders, the rapids
    float shoreFoam = 1.0 - smoothstep(0.0, 2.2, d);
    float wallFoam = 1.0 - smoothstep(0.0, 1.6, abs(p.x) - uWall - 0.4);
    float rockFoam = 0.0;
    for (int i = 0; i < ${MAX_ROCKS}; i++) {
      if (i >= uRockCount) break;
      vec2 q = p - uRocks[i].xy;
      float rr = uRocks[i].z;
      // a ring round it, and a wake trailing downstream
      float ring = 1.0 - smoothstep(rr * 0.9, rr * 1.7, length(q));
      float wake = (1.0 - smoothstep(rr * 0.4, rr * 1.3, abs(q.x))) * smoothstep(0.0, rr, q.y) * (1.0 - smoothstep(rr, rr * 7.0, q.y));
      rockFoam = max(rockFoam, max(ring, wake * 0.8));
    }
    float amount = clamp(max(max(shoreFoam, wallFoam), max(rockFoam, rapids * rapids)), 0.0, 1.0);
    float ft = w0 * foamTex(p - o0) + (1.0 - w0) * foamTex(p - o1);
    float foam = smoothstep(0.75, 1.05, ft + amount * 0.55) * amount;
    c = mix(c, vec3(0.92, 0.96, 0.95), foam * 0.85);
    // the white crest where it pours over the lip
    float lip = smoothstep(-9.0, -1.0, zr) * (0.55 + 0.45 * ft);
    c = mix(c, vec3(0.94, 0.98, 0.97), lip * 0.85);
    foam = max(foam, lip);

    gl_FragColor = vec4(c, mix(uOpacity, 1.0, fres * 0.5 + foam * 0.6));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class River {
  constructor(parent, { endZ, wallX, forest, sunDir = new THREE.Vector3(-0.35, 0.55, 0.75) }) {
    this.endZ = endZ;
    const z0 = endZ - RIVER_LEN;

    // the water: one sheet across the whole valley; the banks hide what's on land
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uEnd: { value: endZ },
          uWall: { value: wallX },
          uOpacity: { value: 0.86 },
          uDeep: { value: new THREE.Color(0x1d4a3f) },
          uShallow: { value: new THREE.Color(0x5f9a84) },
          uMud: { value: new THREE.Color(0x6b6040) },
          uSky: { value: new THREE.Color(0x9fbfae) },
          uSunDir: { value: sunDir.clone().normalize() },
          uSunColor: { value: new THREE.Color(0xffd59a) },
          uRocks: { value: Array.from({ length: MAX_ROCKS }, () => new THREE.Vector3()) },
          uRockCount: { value: 0 },
        },
      ]),
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(300, RIVER_LEN - 3), this.material);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, WATER_Y, z0 + (RIVER_LEN - 3) / 2);
    water.renderOrder = 1;
    parent.add(water);

    // the ground: banks sloping into the water, the bed under it
    const W = 800, SX = 320, SZ = 100;
    const geo = new THREE.PlaneGeometry(W, RIVER_LEN, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const mud = new THREE.Color(0x4a3f2c), bed = new THREE.Color(0x2c3226), dry = new THREE.Color(1, 1, 1), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const zr = pos.getZ(i) - RIVER_LEN / 2;      // plane centred on the stretch: -200..0
      const s = -shore(x, zr);                      // metres up the bank
      let y = s >= 0 ? -0.62 + 0.64 * sstep(0, 9, s) : -0.62 - 2.0 * sstep(0, 14, -s);
      if (zr < -196) y = Math.max(y, -0.05);        // meet the road chunk's forest floor
      pos.setY(i, y);
      if (s < 0) tmp.copy(bed).lerp(mud, sstep(-6, 0, s));
      else tmp.copy(mud).lerp(dry, sstep(0.4, 6, s));
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const groundMat = forest.clone();
    groundMat.vertexColors = true;
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (!groundMat[k]) continue;
      groundMat[k] = groundMat[k].clone();
      groundMat[k].wrapS = groundMat[k].wrapT = THREE.RepeatWrapping;
      groundMat[k].repeat.set(W / 5, RIVER_LEN / 5);
      groundMat[k].needsUpdate = true;
    }
    const ground = new THREE.Mesh(geo, groundMat);
    ground.position.z = z0 + RIVER_LEN / 2;
    ground.receiveShadow = true;
    parent.add(ground);
  }

  /** Boulders the current breaks round: [{ x, z, r }] (world x, z; radius in metres). */
  addRocks(list) {
    const u = this.material.uniforms;
    list.slice(0, MAX_ROCKS).forEach((rk, i) => u.uRocks.value[i].set(rk.x, rk.z, rk.r));
    u.uRockCount.value = Math.min(MAX_ROCKS, list.length);
  }
}
