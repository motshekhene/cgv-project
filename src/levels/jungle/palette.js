import * as THREE from 'three';

/**
 * Fog, sky and light colours per level, so the "one palette per level" look
 * (misty green -> sunset/rain -> golden) lives in one place. Numbers come from
 * docs/JUNGLE_SHRINE_IMPLEMENTATION.md and tools/concepts/themes.js. The L1 and
 * L2 entries are used by their intro and win scenes (src/intros/) and are the
 * ones to use when those levels swap their placeholder worlds.
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

/** Level 1: misty morning on the trail (tools/concepts/worlds.js -> shrineRun). */
export const TRAIL_MORNING = {
  fog: 0xcfd6a8,
  fogDensity: 0.014,
  sky: { top: 0x6aa6d8, horizon: 0xf0e2b0, bottom: 0x6f7d4a, sunColor: 0xffd59a, cloudColor: 0xffffff, clouds: 0.3 },
  sunDir: new THREE.Vector3(-0.35, 0.55, -0.75), // ahead of the runner, so the trail is backlit
  sun: 0xffd29a,
  sunIntensity: 4.5,
  hemiSky: 0xbfdcff,
  hemiGround: 0x4a5a26,
  hemiIntensity: 0.6,
  fill: 0x9fc0ff,
  fillIntensity: 0.3, // not in the concept render; keeps Kai's shadow side readable
  shafts: 1,
  torches: 0,
};

/** Level 2 starts here: sunset over the river road (worlds.js -> shrineDrive). */
export const RIVER_SUNSET = {
  fog: 0xdcc39a,
  fogDensity: 0.009,
  sky: { top: 0x5a86c4, horizon: 0xf7c48a, bottom: 0x6f7d4a, sunColor: 0xffb070, cloudColor: 0xffe0c0, clouds: 0.4 },
  sunDir: new THREE.Vector3(-0.6, 0.24, -0.75), // low, front-left of the driver: long shadows across the road
  sun: 0xffb878,
  sunIntensity: 4.0,
  hemiSky: 0xd6cfd8,
  hemiGround: 0x4a5a26,
  hemiIntensity: 0.6,
  fill: 0xffb27a,
  fillIntensity: 0.35,
  shafts: 1,
  torches: 0,
};

/** ...and ends here: night and rain at the gorge bridge (tools/concepts/story.js -> bridge). */
export const RIVER_NIGHT = {
  fog: 0x0d1426,
  fogDensity: 0.006,
  sky: { top: 0x060a1a, horizon: 0x26355a, bottom: 0x05070d, sunColor: 0xcfe0ff, cloudColor: 0x3a4666, clouds: 0.5 },
  sunDir: new THREE.Vector3(-0.4, 0.5, -0.75), // the moon
  sun: 0xb8ccff,
  sunIntensity: 2.2,
  hemiSky: 0x7a90c8,
  hemiGround: 0x10141c,
  hemiIntensity: 0.9,
  fill: 0x6f88c8,
  fillIntensity: 0.3,
  shafts: 0,
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
