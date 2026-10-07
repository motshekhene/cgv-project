import * as THREE from 'three';

/**
 * KeyVision — how the world looks while time is bent (a perfect dodge, or the
 * Key's slow-mo): drained to grey except anything cyan (the Key, its glow),
 * colour fringes and a radial streak toward the edges like the frame is being
 * dragged, and a cold cyan vignette. A post-processing pass: the scene is
 * drawn into an HDR, multisampled render target, then this shader draws it to
 * the screen and does the tone mapping and sRGB conversion the renderer would
 * otherwise do. Only runs while `strength` > 0; the rest of the time the level
 * renders straight to the screen as usual.
 *
 *   vision.strength = 0..1;   vision.render(renderer, scene, camera, time);
 */
const FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uStrength;
  uniform float uTime;
  uniform vec2 uAspect;
  varying vec2 vUv;

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c * uAspect);
    float s = uStrength;
    // radial streak: a few taps toward the centre, more at the edges
    vec2 dir = c * (0.035 * s * smoothstep(0.15, 0.75, r));
    vec3 col = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 6; i++) {
      float k = float(i) / 5.0;
      float w = 1.0 - k * 0.6;
      // colour fringes: red pushed out, blue pulled in
      vec2 uv = vUv - dir * k;
      vec2 ca = c * 0.006 * s * r;
      col.r += texture2D(tScene, uv + ca).r * w;
      col.g += texture2D(tScene, uv).g * w;
      col.b += texture2D(tScene, uv - ca).b * w;
      wsum += w;
    }
    col /= wsum;
    // drain the colour, but keep cyan (the Key) burning
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float cyan = clamp((min(col.g, col.b) - col.r) * 4.0, 0.0, 1.0);
    col = mix(col, vec3(lum), 0.8 * s * (1.0 - cyan));
    col *= mix(vec3(1.0), vec3(0.78, 0.98, 1.1), s); // cold
    // vignette: darker toward the corners, with a cyan rim
    float edge = smoothstep(0.35, 0.95, r);
    col *= 1.0 - 0.45 * edge * s;
    col += vec3(0.05, 0.42, 0.55) * edge * edge * 0.35 * s * (0.85 + 0.15 * sin(uTime * 6.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const _size = new THREE.Vector2();

export class KeyVision {
  constructor() {
    this.strength = 0;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        uStrength: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  get active() {
    return this.strength > 0.002;
  }

  render(renderer, scene, camera, time) {
    renderer.getDrawingBufferSize(_size);
    if (this.target.width !== _size.x || this.target.height !== _size.y) this.target.setSize(_size.x, _size.y);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const u = this.material.uniforms;
    u.uStrength.value = this.strength;
    u.uTime.value = time;
    u.uAspect.value.set(_size.x / Math.max(1, _size.y), 1);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
