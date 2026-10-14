import * as THREE from 'three';

/**
 * Telegraphs — where his next blow will land, painted on the ground (Level 3).
 *
 * Hard but fair: the mask's eye slits were the only warning, and from behind
 * Kai in a scramble they're easy to miss. While the Handler winds up, the
 * ground he's about to hit lights up in that attack's colour:
 *
 *   lunge, combo          a lane out in front of him, as long as the blow
 *                         carries him (reach plus how far it moves him)
 *   sweep, spin, blast    a disc of exactly the radius it hits
 *   a ring (threat.inner)  a disc whose middle is safe: only the band from
 *                         inner to radius is hit (the Shadow Stag's thorns)
 *
 * It fills from him outward as the wind-up runs (a bright front at the edge of
 * the fill), so how full it is says how long is left: full means now. As the
 * blow lands it flashes and fades where it was. Out of it is safe; a dodge
 * through it is too.
 *
 * One shader for both shapes (uShape 0 disc, 1 lane), drawn just above the
 * ground, after everything opaque, so it lies over tiles, roots and grass.
 *
 *   const zones = new Telegraphs(root, arena);
 *   zones.update(dt, boss.threat, boss.root.position);   // every frame
 */
const FADE = 0.3; // s: the flash as the blow lands, fading out
const LANE_W = 1.5; // m

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv; // across and along the shape on the ground
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); // object -> clip space
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor; // one colour per attack, so the player learns them
  uniform float uK, uAlpha, uFlash, uShape, uTime, uLen, uInner; // uK = 0..1 how far the wind-up is (game state); uShape: 0 disc/ring, 1 lane
  varying vec2 vUv;
  void main() {
    float d;       // 0 at him, 1 at the far edge of what it hits
    float edge;    // the outline
    if (uShape < 0.5) {
      vec2 p = vUv * 2.0 - 1.0; // -1..1, 0 at the attacker
      float r = length(p);
      if (r > 1.0 || r < uInner) discard; // a disc, or a ring with a safe middle (uInner)
      d = (r - uInner) / (1.0 - uInner); // 0 at the inner edge of what's hit, 1 at the outer
      edge = max(smoothstep(0.9, 0.975, r), uInner > 0.0 ? 1.0 - smoothstep(uInner, uInner + 0.04, r) : 0.0);
    } else {
      float x = abs(vUv.x * 2.0 - 1.0); // 0 down the lane's middle, 1 at its edges
      d = vUv.y; // distance along the lane
      edge = max(smoothstep(0.82, 0.94, x), smoothstep(1.0 - 0.18 / uLen, 1.0, d));
      // chevrons running out along the lane, the way the blow goes
      float chev = fract(d * uLen * 0.9 - x * 0.45 - uTime * 2.2);
      edge = max(edge, (1.0 - smoothstep(0.0, 0.12, abs(chev - 0.5))) * 0.35 * step(d, uK));
    }
    float fill = step(d, uK) * (0.26 + 0.14 * d); // fills outward as the attack winds up: full = it lands
    float front = (1.0 - smoothstep(0.0, 0.035, abs(d - uK))) * step(0.02, uK); // a bright line at the filling edge
    float a = max(max(edge * 0.85, fill), front);
    a = clamp(a * uAlpha + uFlash * a, 0.0, 1.0); // uFlash: the moment it strikes
    gl_FragColor = vec4(uColor * (1.0 + 0.6 * uFlash + 0.5 * front), a);
  }
`;

export class Telegraphs {
  constructor(root, arena) {
    this.arena = arena;
    this.t = 0;
    const make = (geo, shape) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uK: { value: 0 }, uAlpha: { value: 1 }, uFlash: { value: 0 }, uShape: { value: shape },
          uTime: { value: 0 }, uLen: { value: 1 }, uInner: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 5;
      mesh.visible = false;
      mesh.frustumCulled = false;
      root.add(mesh);
      return mesh;
    };
    // a 2 x 2 disc (scaled to the radius), and a 1 x 1 lane from z = 0 to z = 1 (scaled to width x length)
    const disc = new THREE.PlaneGeometry(2, 2, 1, 1);
    disc.rotateX(-Math.PI / 2);
    const lane = new THREE.PlaneGeometry(1, 1, 1, 1);
    lane.translate(0, 0.5, 0);
    lane.rotateX(Math.PI / 2);
    this.disc = make(disc, 0);
    this.lane = make(lane, 1);
    this.fade = 0; // > 0 while the last blow's flash fades
    this.held = null; // the zone the blow landed in, frozen where it was
  }

  update(dt, threat, at) {
    this.t += dt;
    for (const m of [this.disc, this.lane]) m.material.uniforms.uTime.value = this.t;

    const striking = !!threat?.striking;
    if (threat && !striking) {
      this.held = null;
      this.wasStriking = false;
      this._show(threat, at, threat.k, 0, 1);
      return;
    }
    // freeze it where it was as the blow comes, and flash (once, however long the blow lasts)
    if (striking && !this.wasStriking) {
      this.held = { ...threat, x: at.x, z: at.z };
      this.fade = FADE;
    }
    this.wasStriking = striking;
    if (this.held && this.fade > 0) {
      this.fade -= dt;
      const k = Math.max(0, this.fade / FADE);
      this._show(this.held, this.held, 1, k, k);
      return;
    }
    this.held = null;
    this.disc.visible = this.lane.visible = false;
  }

  _show(threat, at, k, flash, alpha) {
    const ring = threat.radius > 0;
    const mesh = ring ? this.disc : this.lane;
    (ring ? this.lane : this.disc).visible = false;
    mesh.visible = true;
    const y = this.arena.fighterY(at.x, at.z) + 0.03;
    mesh.position.set(at.x, y, at.z);
    if (ring) {
      mesh.scale.set(threat.radius, 1, threat.radius);
      mesh.rotation.y = 0;
    } else {
      mesh.scale.set(threat.width || LANE_W, 1, threat.length);
      mesh.rotation.y = threat.heading;
    }
    const u = mesh.material.uniforms;
    u.uColor.value.setHex(threat.color);
    u.uK.value = k;
    u.uFlash.value = flash;
    u.uAlpha.value = alpha;
    u.uLen.value = ring ? 1 : threat.length;
    u.uInner.value = ring ? threat.inner || 0 : 0;
  }

  hide() {
    this.held = null;
    this.fade = 0;
    this.disc.visible = this.lane.visible = false;
  }

  dispose() {
    for (const m of [this.disc, this.lane]) {
      m.geometry.dispose();
      m.material.dispose();
      m.removeFromParent();
    }
  }
}
