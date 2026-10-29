/**
 * The prologue's valley as a place you can wander: its bounds, and the named
 * landmarks off the old path. The prologue builds them (Prologue.js
 * _buildLandmarks), the MAP draws them (ui/GameMap.js), and the spirit cards'
 * clues name them (cards/cards.js), so all three always agree.
 *
 * North is -z: the camp and its fire at the south end, the stone in its glade
 * at the north end, the old path winding between, and the forest all round.
 */
export const VALLEY = { x0: -40, x1: 44, z0: -106, z1: 24 };

// the old path from the camp to the stone (Prologue.js walks it, the map draws it)
export const PATH_END_Z = -90;
export const WALK_PTS = [
  [-1.6, 10.0], [-2.5, 7.6], [-1.3, 4.6], [0, 1.2], [0, -4],
  [3.0, -9], [6.5, -13], [8.0, -19],
  [6.0, -25], [1.0, -28], [-4.5, -31],
  [-7.5, -37], [-7.0, -44],
  [-3.5, -49], [2.5, -52], [6.5, -57],
  [6.5, -64], [3.0, -69],
  [-2.5, -72], [-5.0, -77], [-3.0, -82],
  [0, PATH_END_Z + 4], [0, PATH_END_Z],
];

// r: the clearing round it (no trees), kind: what Prologue.js builds there
export const LANDMARKS = [
  { id: 'fig', name: 'THE OLD FIG', x: -24, z: -10, r: 7, kind: 'fig' },
  { id: 'truck', name: 'THE CREW’S TRUCK', x: 26, z: 4, r: 6, kind: 'truck' },
  { id: 'pool', name: 'THE FOREST POOL', x: 25, z: -32, r: 9, kind: 'pool' },
  { id: 'lookout', name: 'LOOKOUT ROCK', x: -27, z: -56, r: 7, kind: 'lookout' },
  { id: 'fallen', name: 'THE FALLEN GIANT', x: 24, z: -72, r: 8, kind: 'fallen' },
  { id: 'hut', name: 'THE RUINED HUT', x: -22, z: -88, r: 7, kind: 'hut' },
];
export const LANDMARK = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
