import * as THREE from 'three';

/**
 * Fog, sky and light colours per level, so the "one palette per level" look
 * (misty green -> sunset/rain -> golden) lives in one place. Numbers come from
 * docs/JUNGLE_SHRINE_IMPLEMENTATION.md and tools/concepts/themes.js. L1 and L2
 * add their own entries here when they swap their placeholder worlds.
 *
 * Level 3 has two: golden-hour DAY for phases I-II, and DUSK, which the arena
 * blends to when the Handler hits phase III (torches light, the pool runs red).
 */
export const SHRINE_DAY = {
  fog: 0xd9d2a8,
  fogDensity: 0.0068,
  sky: { top: 0x5f9fd8, horizon: 0xf4e2b0, bottom: 0x6f7d4a, sunColor: 0xffd59a, cloudColor: 0xffffff, clouds: 0.35 },
  sunDir: new THREE.Vector3(-0.62, 0.62, -0.45),
  sun: 0xffcf94,
  sunIntensity: 5.2,
  hemiSky: 0xbfdcff,
  hemiGround: 0x4a5a26,
  hemiIntensity: 0.95,
  fill: 0x9fc0ff,
  fillIntensity: 0.45,
  shafts: 1,
  torches: 0,
};

export const SHRINE_DUSK = {
  fog: 0x6e4a44,
  fogDensity: 0.0105,
  sky: { top: 0x1d2350, horizon: 0xf07a3c, bottom: 0x2c2018, sunColor: 0xff7a38, cloudColor: 0xd9806a, clouds: 0.5 },
  sunDir: new THREE.Vector3(-0.93, 0.24, -0.28), // swung west: column shadows streak across the court
  sun: 0xff8a4a,
  sunIntensity: 3.0,
  hemiSky: 0x8a7cc0,
  hemiGround: 0x4a3020,
  hemiIntensity: 0.75,
  fill: 0xffa066,
  fillIntensity: 1.2,
  shafts: 0,
  torches: 1,
};
