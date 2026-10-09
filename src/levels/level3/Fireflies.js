import * as THREE from 'three';

/**
 * Fireflies — out once the storm has passed (after the final blow): a couple
 * of hundred green-gold specks drifting round the courtyard and the jungle's
 * edge, each blinking on its own slow rhythm. One Points draw call; the drift
 * and the blinking are worked out in the shader from the time and a random
 * seed per firefly, so nothing is touched per firefly per frame.
 *
 *   const flies = new Fireflies(root, arena);
 *   flies.update(time, amount);   // amount 0..1 fades them all in or out
 */
const N = 340;

export class Fireflies {
  constructor(parent, arena) {
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.sqrt(Math.random()) * 19;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos[i * 3] = x;
      pos[i * 3 + 1] = arena.groundHeight(x, z) + 0.35 + Math.random() * 2.6;
      pos[i * 3 + 2] = z;
      seed[i * 4] = Math.random() * 6.283; // phase
      seed[i * 4 + 1] = 0.25 + Math.random() * 0.45; // drift speed
      seed[i * 4 + 2] = 0.6 + Math.random() * 1.4; // blink rate
      seed[i * 4 + 3] = 0.4 + Math.random() * 1.1; // drift radius
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color(0xd9ff8a) },
        uSize: { value: 44 },
        uScale: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uAmount, uSize, uScale;
        varying float vGlow;
        void main() {
          float t = uTime * aSeed.y;
          vec3 p = position + vec3(
            sin(t + aSeed.x) * aSeed.w,
            sin(t * 0.7 + aSeed.x * 2.0) * 0.35,
            cos(t * 0.8 + aSeed.x * 1.3) * aSeed.w);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // a slow pulse: dark most of the time, a soft glow now and then
          float blink = pow(max(0.0, sin(uTime * aSeed.z + aSeed.x * 3.0)), 5.0);
          vGlow = (0.12 + 0.88 * blink) * uAmount;
          gl_PointSize = uSize * uScale * (0.45 + 0.55 * blink) * (10.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vGlow;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d2 = dot(c, c);
          float a = exp(-d2 * 60.0) + 0.35 * exp(-d2 * 10.0); // a hot core in a soft halo
          gl_FragColor = vec4(uColor * a * vGlow, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    parent.add(this.points);
  }

  /** Gather them round (x, z): wherever the fight ended. */
  centre(x, z) {
    this.points.position.set(x, 0, z);
  }

  update(time, amount) {
    this.points.visible = amount > 0.005;
    if (!this.points.visible) return;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uAmount.value = amount;
  }
}
