import * as THREE from 'three';
import { between, ease, handheld, jolt, V, smooth, mix } from '../camera.js';
import { jungleCourseHeight, BRIDGE_GAPS } from '../../levels/level1/jungleWorld.js';

/**
 * Sequence 3 — THE HUNT BEGINS, on Level 1, the old trail (levels/Level01.js).
 *
 * Level 1 is a three-lane run down the mountain with the Marshal (Baba Zwane
 * in the company's coat and mask, with his torch) a few metres behind. Here
 * the director runs it: Kai is put at a stretch of the trail, the run goes on
 * by itself (Level 1 always runs), and the autopilot below plays the lanes,
 * jumps and slides the way a good player would. The Marshal's gap is held
 * where each shot wants him.
 *
 * The shots use what is really on that stretch: the kudu bolting across at
 * 175 m, the tree that falls across the trail at 260 m, the shrine bridge
 * that falls away behind him at 1.3 km, and the horn call (the forest
 * answering: the trail ahead shatters, roots take the Marshal).
 *
 * The coins, life-savers and pickups along the trail are game furniture, not
 * story, so the trailer hides them.
 */
const LANE_X = [-2.4, 0, 2.4]; // Level01.js

function L(st) {
  return st.level;
}

/** Hide the pickups: coins, life-savers, flight packs, the torn pages. */
function dressForCamera(lv) {
  if (lv._trailerDressed) return;
  lv._trailerDressed = true;
  if (lv._rewardMesh) lv._rewardMesh.visible = false;
  if (lv._rewardDiscMesh) lv._rewardDiscMesh.visible = false;
  for (const list of [lv._healthPacks, lv._jetpackPickups, lv._storyLetters]) {
    for (const p of list || []) if (p.group) p.group.scale.setScalar(0.0001); // their own updates set visible; scale keeps them out
  }
  // the butterflies are unlit card: in the dark of the shrine they read as white squares
  for (const b of lv._wildlife?.butterflies || []) b.visible = false;
  // the shrine's rune slabs glow at 3x: through the trailer's lifted exposure they clip to white, so they're
  // turned down to read as the cyan they are
  lv.root.getObjectByName('dark-shrine-corridor')?.traverse((o) => {
    const m = o.material;
    if (m?.emissive && m.emissive.getHex() === 0x61ffd0) m.emissiveIntensity = 0.3;
  });
}

/** Put Kai at distance z on the trail, in a lane, with the Marshal `gap` metres behind. */
function placeKai(lv, z, lane = 1, gap = 12) {
  lv.z = z;
  lv.lane = lv.laneFrom = lane;
  lv.laneT = 1;
  lv.airborne = false;
  lv.y = 0;
  lv.vy = 0;
  lv.sliding = false;
  lv._bump = null;
  lv._stumbleDebt = 0;
  lv.gap = gap;
  lv.boostSpeed = 0;
  if (lv.handler) lv.handler.position.set(LANE_X[1], jungleCourseHeight(z + gap), z + gap);
}

/**
 * The autopilot: looks a little way down the trail in his lane and does what
 * the obstacle asks — a log or a trap or a fallen tree is jumped, the low arch
 * slid under, anything tall gone round into the nearest clear lane (the
 * level's own _freeLane), and on the bridge the gaps are kept out of.
 */
function autopilot(st, lv) {
  if (lv.caught || lv.escaped || lv._finale) return;
  const speed = Math.max(6, lv.speed || 11);
  const lane = lv.lane;
  let action = null;
  let nearest = Infinity;
  const look = speed * 0.9 + 4;
  for (let i = lv._obsCursor; i < lv.obstacles.length; i++) {
    const o = lv.obstacles[i];
    const d = lv.z - o.z; // metres ahead
    if (d < -1) continue;
    if (d > look) break;
    if (o.gone || o.clipped) continue;
    const off = lv._routeOffsetAt(o.z);
    if (Math.abs(LANE_X[lane] + off - o.x) >= o.halfX + 0.5) continue;
    if (d < nearest) {
      nearest = d;
      action = { d, o };
    }
  }
  for (const ev of lv._fallingTrees || []) {
    if (ev.behind || ev.phase === 'gone' || ev.clipped) continue;
    const d = lv.z - ev.z;
    if (d > -1 && d < nearest && ev.phase !== 'waiting') {
      nearest = d;
      action = { d, tree: ev };
    }
  }
  for (const g of BRIDGE_GAPS) {
    const d = lv.z - (g.z + g.halfZ);
    if (g.lane === lane && d > -g.halfZ * 2 && d < look + 6 && d < nearest) {
      nearest = d;
      action = { d, gapLane: g.lane, gz: g.z };
    }
  }
  if (!action) return;
  const { d, o, tree } = action;
  if (tree || (o && o.hiY <= 1.0)) {
    if (!lv.airborne && d < speed * 0.36 + 0.4) st.tap('jump');
  } else if (o && o.kind === 'duct') {
    if (!lv.sliding && d < speed * 0.32 + 0.3) st.tap('slide');
  } else if (lv.laneT >= 1) {
    let want = null;
    if (action.gapLane !== undefined) want = lane === 1 ? (action.gz % 2 ? 0 : 2) : 1;
    else want = lv._freeLane(o.z);
    if (want !== null && want !== lane) st.tap(want < lane ? 'left' : 'right');
  }
}

const _p = new THREE.Vector3();
/** Kai's feet on the trail. */
function kaiPos(lv, out = _p) {
  return out.copy(lv.player.position);
}
const _h = new THREE.Vector3();
function marshalPos(lv, out = _h) {
  return out.copy(lv.handler.position);
}

/** A run shot: autopilot, and the Marshal held `gap` metres back. */
function run(gap) {
  return (st, c) => {
    const lv = L(st);
    autopilot(st, lv);
    if (gap !== undefined) {
      const g = typeof gap === 'function' ? gap(c) : gap;
      lv.gap = mix(lv.gap, g, 0.08);
    }
  };
}

export const RUN = {
  shots: [
    {
      // high and wide over the trail in the morning haze: how big the forest is, how small he is in it
      id: '3a', at: 23.4, stage: 'level01',
      enter(st) {
        const lv = L(st);
        dressForCamera(lv);
        placeKai(lv, -86, 1, 24);
        lv._storyT = 99; // his thoughts on the run are for the player, not the trailer
        lv._saidStart = lv._saidMarshal = true;
      },
      prep: 0.3,
      drive: run(24),
      camera(st, c, cam) {
        const k = kaiPos(L(st));
        between(cam,
          { pos: V(k.x + 1.6, k.y + 7.5, k.z + 15), look: V(k.x, k.y + 0.8, k.z - 7), fov: 50 },
          { pos: V(k.x + 0.9, k.y + 4.6, k.z + 10.5), look: V(k.x, k.y + 1.0, k.z - 9), fov: 46 },
          c.k, ease.inOut);
        handheld(cam, c.t, 0.2);
      },
    },
    {
      // the kudu bolt across the trail ahead of him: low and down the trail, looking back up it
      id: '3b', at: 25.4, stage: 'level01',
      enter(st) {
        // the right-hand lane: the kudu crosses it just before he gets there, a few metres in front of him
        placeKai(L(st), -154, 2, 22);
      },
      drive: run(20),
      camera(st, c, cam) {
        const k = kaiPos(L(st));
        const z = -185;
        cam.pos.set(-1.2, jungleCourseHeight(z) + 0.6, z);
        cam.look.set(1.4, jungleCourseHeight(-175) + 1.25, mix(k.z, -175, 0.45));
        cam.fov = 30;
        handheld(cam, c.t + 3, 0.3);
      },
    },
    {
      // the tree coming down across the trail in front of him
      id: '3c', at: 27.3, stage: 'level01',
      enter(st) {
        placeKai(L(st), -193.5, 1, 18);
      },
      drive: run(18),
      camera(st, c, cam) {
        const k = kaiPos(L(st));
        // long lens down the trail: the dead tree tipping over the trail ahead of him
        cam.pos.set(k.x - 1.0, k.y + 0.9, k.z + 4.2);
        cam.look.set(0.4, jungleCourseHeight(-260) + 3.2, -260);
        cam.fov = 28;
        handheld(cam, c.t, 0.5);
      },
    },
    {
      // ...and over it: from the side, low, as he leaps the trunk
      id: '3d', at: 28.5, stage: 'level01',
      enter(st) {
        placeKai(L(st), -249.5, 1, 16);
      },
      drive: run(16),
      camera(st, c, cam) {
        // beyond the trunk, low: he comes over it at the lens
        const k = kaiPos(L(st));
        cam.pos.set(2.6, jungleCourseHeight(-264) + 0.45, -264.5);
        cam.look.set(k.x * 0.6, k.y + 1.1, Math.max(k.z, -262));
        cam.fov = 42;
        handheld(cam, c.t, 0.25);
      },
    },
    {
      // the dark shrine: the runes, his own small light, and behind him the Marshal's torch through the dust
      id: '3e', at: 29.9, stage: 'level01',
      enter(st) {
        placeKai(L(st), -1046, 1, 9);
      },
      prep: 0.5,
      drive: run(7.5),
      camera(st, c, cam) {
        const lv = L(st);
        const k = kaiPos(lv);
        // ahead of him, low, falling back at his pace: he comes on, the torch comes on behind him
        cam.pos.set(k.x + 0.9, k.y + 0.55, k.z - 4.6 - c.local * 0.6);
        cam.look.lerpVectors(k, marshalPos(lv), smooth(0.15, 0.95, c.k) * 0.8).add(_up(1.3));
        cam.fov = 40;
        cam.exposure = 1.8; // the shrine is dark in the game too; the trailer lifts it enough to read
        handheld(cam, c.t, 0.45);
      },
    },
    {
      // over his shoulder, looking back: the Marshal closing, the mask and the torch
      id: '3f', at: 32.0, stage: 'level01',
      prep: 0.2,
      drive: run(4.2),
      camera(st, c, cam) {
        const lv = L(st);
        const k = kaiPos(lv);
        const m = marshalPos(lv);
        cam.pos.set(k.x - 1.0, k.y + 1.85, k.z - 1.7);
        cam.look.set(m.x, m.y + 1.45, m.z);
        cam.fov = 38;
        cam.exposure = 1.8;
        handheld(cam, c.t, 0.7);
      },
    },
    {
      // the shrine bridge, falling away behind him into the gorge as he runs it
      id: '3g', at: 33.5, stage: 'level01',
      enter(st) {
        placeKai(L(st), -1322, 1, 14);
      },
      prep: 0.8,
      drive: run(14),
      camera(st, c, cam) {
        const k = kaiPos(L(st));
        // off the side of the bridge, under the deck: he runs at us, the planks drop away behind him
        // high off the side, ahead of him: he runs at us, the planks drop away into the gorge behind him
        cam.pos.set(k.x + 4.2, k.y + 3.4, k.z - 9 + c.local * 1.5);
        cam.look.set(k.x - 0.3, k.y - 0.4, k.z + 7);
        cam.fov = 50;
        cam.exposure = 0.9;
        handheld(cam, c.t, 0.5);
      },
    },
  ],
  cards: [
    { at: 35.3, dur: 1.15, kind: 'word', text: 'RUN.', fadeIn: 0.05, fadeOut: 0.25 },
  ],
  fades: [
    { at: 23.25, dur: 0.6, out: 0.45 },
    { at: 35.25, dur: 1.25, in: 0.03, out: 0.05 }, // hard black under RUN.
  ],
};

/**
 * For the rapid cuts in sequence 6: back on the trail, further down it, the
 * horn's call — the shockwave down the trail, the obstacles in its way
 * shattering, the roots coming up round the Marshal.
 */
export function hornCallShot(at) {
  return {
    id: '6g', at, stage: 'level01',
    enter(st) {
      const lv = L(st);
      placeKai(lv, -1560, 1, 7);
      lv._hornCharge = 1;
      // the stone guardian on this stretch is its own set piece (and would end the run): not in this cut
      lv._guardianResolved = true;
      if (lv.guardian) lv.guardian.visible = false;
    },
    prep: 0.25,
    drive(st, c) {
      const lv = L(st);
      if (!lv._hornFired && c.local > 0.08 && !c.prepping) {
        lv._hornFired = true;
        st.tap('ability');
      }
      autopilot(st, lv);
      lv.gap = mix(lv.gap, 7, 0.08);
    },
    camera(st, c, cam) {
      // low ahead of him, looking back: the call goes out past the lens, the roots take the torch behind him
      const lv = L(st);
      const k = kaiPos(lv);
      cam.pos.set(k.x - 3.6, k.y + 1.7, k.z - 3.4);
      cam.look.set(k.x - 0.2, k.y + 1.1, k.z + 1.5);
      cam.fov = 52;
      handheld(cam, c.t, 0.4);
      jolt(cam, c.local - 0.5, 0.6, 5);
    },
  };
}

const _u = new THREE.Vector3();
function _up(y) {
  return _u.set(0, y, 0);
}
