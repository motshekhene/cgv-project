import * as THREE from 'three';
import { between, ease, handheld, V, smooth } from '../camera.js';
import { dotTexture } from '../../intros/fx.js';

/**
 * Sequence 2 — SOMETHING HAS CHANGED, on the prologue (levels/Prologue.js).
 *
 *   the fire     Baba Zwane across the flames, lit by them: the one clear look
 *                at his face the game ever gives (it comes back at the shrine)
 *   Kai          on his log, the fire on his face
 *   the path     the walk up to the stone between the old cairns, through a
 *                gate; the flock bursts out of the canopy, and later a pair of
 *                eyes in the undergrowth (the prologue's own beats, by distance)
 *   the take     he reaches, his hand closes on the horn, its cyan wakes, and
 *                every sound in the forest stops (score.js cuts the bed on it)
 *   alone        the pull-back: Kai at the stone with the lit horn
 *
 * The prologue is interactive; here the director plays it. The fire is its
 * 'talk' phase; for the walk Kai is put on the path where 'rise' would leave
 * him, further up, and walks it holding forward (the path steers him, as it
 * does a player); at the stone the choice is made with E.
 *
 * Places are the prologue's own (Prologue.js: SEAT, ZWANE_AT, FIRE, STONE).
 */
const ZWANE_FACE = V(-1.0, 1.66, 6.3);
const KAI_FACE = V(0.0, 1.22, 11.1);
const STONE = V(0, 0, -54.6);
export const GRIP_AT = 18.07; // trailer time his hand closes on the horn (measured: see the score's silence)

function lvl(st) {
  return st.level;
}

/** Kai on the path at z, walking up it: what the 'rise' beat sets, further along. */
function onPath(L, z) {
  L.phase = 'walk';
  L.t = 0;
  L.seated = false;
  L.standing = true;
  L.px = 0;
  L.pz = z;
  L.walkS = L._pathS(0, z);
  L.yaw = L.heading = 0; // yaw 0 looks down -z: up the path
  L.pitch = 0.06;
  L._kaiRose = true;
  L.zwane.visible = false; // he has gone off into the trees
  L.zwaneLampLight.intensity = 0;
  L.kai.visible = true;
  L.kaiF.play('walk', { fade: 0 });
}

const _k = new THREE.Vector3();
function kaiAt(L, out = _k) {
  return out.set(L.px, 0, L.pz);
}

export const FIRE_AND_STONE = {
  shots: [
    {
      // across the fire: the flames low in the frame, Baba Zwane beyond them, his lamp at his side
      id: '2a', at: 10.2, stage: 'prologue',
      enter(st) {
        const L = lvl(st);
        if (L.phase === 'title') L._begin();
        // the fireflies are bare points, square up close: give them the game's soft dot
        L.fireflyMat.map = dotTexture();
        L.fireflyMat.needsUpdate = true;
      },
      prep: 2.0,
      camera(st, c, cam) {
        between(cam,
          { pos: V(0.42, 0.92, 9.7), look: V(ZWANE_FACE.x + 0.12, ZWANE_FACE.y - 0.3, ZWANE_FACE.z), fov: 32 },
          { pos: V(0.3, 1.0, 9.2), look: V(ZWANE_FACE.x + 0.06, ZWANE_FACE.y - 0.2, ZWANE_FACE.z), fov: 26 },
          c.k, ease.linear);
        handheld(cam, c.t, 0.18);
      },
    },
    {
      // the reverse: Kai on his log, listening, the fire on his face
      id: '2b', at: 12.5, stage: 'prologue',
      camera(st, c, cam) {
        between(cam,
          { pos: V(-0.95, 1.08, 9.15), look: V(KAI_FACE.x, KAI_FACE.y - 0.08, KAI_FACE.z), fov: 30 },
          { pos: V(-0.8, 1.12, 9.45), look: V(KAI_FACE.x, KAI_FACE.y - 0.04, KAI_FACE.z), fov: 26 },
          c.k, ease.linear);
        handheld(cam, c.t + 5, 0.15);
      },
    },
    {
      // the path to the stone: low beside him as he walks up between the cairns, through the second gate
      id: '2c', at: 13.9, stage: 'prologue',
      enter(st) {
        onPath(lvl(st), -16.5);
        st.hold('forward', true);
      },
      prep: 0.5,
      camera(st, c, cam) {
        const L = lvl(st);
        const p = kaiAt(L);
        cam.pos.set(p.x - 3.4, 0.75, p.z + 2.0 - c.k * 1.2);
        cam.look.set(p.x + 0.3, 1.15, p.z - 1.0);
        cam.fov = 40;
        handheld(cam, c.t, 0.45);
      },
    },
    {
      // the stone: from behind it, low, as he comes up to it and reaches
      id: '2d', at: 16.6, stage: 'prologue',
      enter(st) {
        const L = lvl(st);
        st.hold('forward', false);
        onPath(L, STONE.z + 2.3);
        // the prologue's aim beat has turned him to it: the choice is his
        L.phase = 'choice';
        L.t = 0;
        L._aimed = true;
        L._aimSaid = true;
        L.standing = true;
        L.yaw = L.heading = L._yawTo(STONE.x, STONE.z);
        L.kaiF.play('idle', { fade: 0 });
      },
      drive(st, c) {
        const L = lvl(st);
        if (L.phase === 'choice' && c.local > 0.12) st.tap('interact');
        if (L._take?.gripped && !L._markedGrip) {
          L._markedGrip = true;
          c.director.mark('grip', c.t, GRIP_AT);
        }
      },
      camera(st, c, cam) {
        between(cam,
          { pos: V(1.0, 1.85, STONE.z - 1.9), look: V(-0.15, 1.0, STONE.z + 0.9), fov: 38 },
          { pos: V(0.8, 1.7, STONE.z - 1.55), look: V(-0.1, 1.1, STONE.z + 0.9), fov: 32 },
          c.k, ease.drift);
        handheld(cam, c.t + 2, 0.12);
        // the horn waking in his hand: the frame breathes with it
        cam.exposure = 1 + 0.12 * smooth(GRIP_AT - c.at, GRIP_AT - c.at + 0.8, c.local);
      },
    },
    {
      // alone with it: the pull-back, up and away, the lit horn in his fist
      id: '2e', at: 19.7, stage: 'prologue',
      camera(st, c, cam) {
        const L = lvl(st);
        const p = kaiAt(L);
        between(cam,
          { pos: V(p.x + 2.7, 0.85, p.z - 2.1), look: V(p.x, 1.25, p.z), fov: 40 },
          { pos: V(p.x + 1.65, 1.05, p.z - 1.2), look: V(p.x, 1.35, p.z), fov: 32 },
          c.k, ease.drift);
        handheld(cam, c.t, 0.15);
      },
    },
  ],
  cards: [
    { at: 20.1, dur: 3.1, kind: 'line', text: 'SOME THINGS WERE NEVER MEANT TO BE DISTURBED.', y: 0.8, fadeOut: 0.6 },
  ],
  fades: [
    { at: 10.0, dur: 1.2, out: 1.0 },          // up from the black at the end of the glade
    { at: 22.7, dur: 0.75, in: 0.45, out: 0.3 }, // down into the run
  ],
};
