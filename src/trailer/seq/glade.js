import * as THREE from 'three';
import { between, ease, handheld, V } from '../camera.js';

/**
 * The glade at first light (levels/TitleScene.js, the world behind the title
 * screen): the stone with the horn lying on it, the stag and the fox either
 * side, the old columns, dawn through the canopy in shafts, mist, motes.
 * It opens the trailer and closes it.
 *
 * Far back in the mist the title scene keeps a man in a long coat and a mask,
 * watching the stone. The opening hides him (the hunter is not shown before
 * the hunt); the last shot lets him be found.
 */
const _h = new THREE.Vector3();

/** Where the horn lies on the stone, in the glade's world. */
export function hornOnStone(st, out = _h) {
  return st.level.horn.getWorldPosition(out);
}

export const AWAKENING = {
  shots: [
    {
      // out among the trunks, low, drifting in toward the clearing: the scale of the place
      id: '1a', at: 0, stage: 'title',
      enter(st) {
        if (st.level.watcher) st.level.watcher.root.visible = false;
      },
      camera(st, c, cam) {
        between(cam,
          { pos: V(2.6, 0.55, 15.5), look: V(-0.4, 2.3, 0), fov: 44 },
          { pos: V(1.2, 1.05, 8.6), look: V(-0.2, 1.25, 0), fov: 40 },
          c.k, ease.settle);
        handheld(cam, c.t, 0.25);
      },
    },
    {
      // the horn on its stone, the cyan just stirring in it
      id: '1b', at: 6.4, stage: 'title',
      camera(st, c, cam) {
        const h = hornOnStone(st);
        between(cam,
          { pos: V(h.x + 1.55, h.y + 0.32, h.z + 1.35), look: V(h.x + 0.1, h.y + 0.02, h.z), fov: 34 },
          { pos: V(h.x + 0.82, h.y + 0.16, h.z + 0.62), look: V(h.x + 0.12, h.y + 0.02, h.z), fov: 30 },
          c.k, ease.drift);
        handheld(cam, c.t + 3, 0.12);
      },
    },
  ],
  cards: [
    { at: 3.6, dur: 4.6, kind: 'line', text: 'EVERY LEGEND BEGINS SOMEWHERE.', y: 0.8 },
  ],
  fades: [
    { at: 0, dur: 4.4, out: 2.6 },              // up out of black, the sound first
    { at: 9.1, dur: 1.4, in: 0.9, out: 0.4 },   // down to black under the cut to the fire
  ],
};

/** The title sequence's words and fades, for a sequence starting at `at`. */
export function titleCards(at) {
  return {
    cards: [
      { at: at + 0.45, dur: 3.4, kind: 'title', fadeIn: 0.2, fadeOut: 0.7 },
      { at: at + 4.3, dur: 3.6, kind: 'line', text: 'THE FOREST REMEMBERS.', y: 0.78, rule: true, fadeIn: 1.1, fadeOut: 0.8 },
      { at: at + 8.0, dur: 2.7, kind: 'small', text: 'ENTER THE WORLD.', y: 0.5, size: 30, fadeIn: 0.7, fadeOut: 0.6 },
    ],
    fades: [
      { at: at - 0.05, dur: 3.85, in: 0.01, out: 0.75 },          // the hard cut to black, the title in it
      { at: at + 7.4, dur: 3.7, in: 0.8, out: 0.01 },              // down to black again under the last line
    ],
  };
}

export const TITLE = {
  // set by edit.js: where the title sequence starts
  shots: (at) => [
    {
      // black: the title over nothing (the glade waits under the fade)
      id: '7a', at, stage: 'title',
      enter(st) {
        if (st.level.watcher) st.level.watcher.root.visible = true;
      },
      camera(st, c, cam) {
        cam.pos.set(-0.9, 1.25, 7.4);
        cam.look.set(0.5, 1.35, -4);
        cam.fov = 42;
      },
    },
    {
      // the stone again, wider now, and in the mist behind it, if you look, the man who has been watching it
      id: '7b', at: at + 3.2, stage: 'title',
      enter(st) {
        if (st.level.watcher) st.level.watcher.root.visible = true;
      },
      camera(st, c, cam) {
        between(cam,
          { pos: V(-0.9, 1.25, 7.4), look: V(0.5, 1.35, -4), fov: 42 },
          { pos: V(-0.55, 1.3, 6.2), look: V(0.6, 1.45, -4), fov: 38 },
          c.k, ease.drift);
        handheld(cam, c.t, 0.1);
      },
    },
  ],
};
