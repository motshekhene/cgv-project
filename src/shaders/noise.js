/**
 * Value noise + fbm, shared by the jungle shaders (sky, waterfall, water,
 * light shafts). Paste in front of a fragment shader: NOISE_GLSL + `...`.
 */
export const NOISE_GLSL = /* glsl */ `
  // pseudo-random 0..1 for a grid cell (the classic sin-dot hash)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value noise: random values at the grid corners, smoothly blended in between
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); // which cell, and where inside it
    f = f * f * (3.0 - 2.0 * f); // smoothstep curve: no creases at the cell edges
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // fractal Brownian motion: 5 octaves of noise, each twice the detail at half the strength
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;
