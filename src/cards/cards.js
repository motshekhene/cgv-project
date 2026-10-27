/**
 * SPIRIT CARDS — the collectible layer over the story: the forest's
 * creatures, places and spirits as trading cards. ONE card is out in the
 * world each day, hidden at one of the secret places in the prologue's valley
 * or Level 1, 2 or 3. Where it hides is only ever said IN the game: one line
 * from Baba Zwane, one of Kai's thoughts, a sign or a carved tablet (CLUE_WAYS),
 * naming landmarks but never the level. The MAP shows every landmark, so the
 * player matches the clue to a place.
 * Find it and it's yours; then nothing more until tomorrow, when a new card
 * hides somewhere new. Most days it's a common card; a rare one turns up
 * about one day in six, a legendary about one day in thirty. Found cards are
 * kept in this browser (localStorage), so the album fills over weeks.
 *
 *   import { todaysCard, collect, cardsForLevel } from '../cards/cards.js';
 *   const today = todaysCard();          // { card, spot, riddle, found, taken }
 *   if (collect(today.card.id)) ...      // false if today's card is already taken
 *
 * Spots are in each level's own terms: the prologue and Level 3 { x, z },
 * Level 1 { z, lane } on the trail, Level 2 { z, x } on the River Road.
 */

// type: what the card's frame and art are coloured by
export const TYPES = {
  FOREST: { color: '#6fbf4a', dark: '#1d3a17' },
  EARTH: { color: '#c98a4a', dark: '#3c2614' },
  WIND: { color: '#9fd8e8', dark: '#1d3640' },
  LIGHT: { color: '#f2e27a', dark: '#3a3512' },
  WATER: { color: '#4fb4e0', dark: '#122e40' },
  FIRE: { color: '#ff8a3a', dark: '#40180a' },
  SPIRIT: { color: '#4fd6e0', dark: '#0f3236' },
  SONG: { color: '#d89cf0', dark: '#2e1838' },
  SHADOW: { color: '#a0a0b4', dark: '#16161c' },
  SKY: { color: '#b4c8ff', dark: '#1a2040' },
};

const c = (id, name, type, power, rarity, art, lore) => ({ id, name, type, power, rarity, art, lore });

// rarity: 1 common, 2 rare, 3 legendary
export const CARDS = [
  // common: the forest's everyday life
  c('kudu', 'KUDU', 'FOREST', 40, 1, 'antlers', 'Bolts across the trail the moment it hears running feet.'),
  c('duiker', 'DUIKER', 'FOREST', 25, 1, 'antlers', 'So small and so quick that most people never see one.'),
  c('hornbill', 'HORNBILL', 'WIND', 30, 1, 'bird', 'Its call carries over three valleys. It was the first to go quiet.'),
  c('sunbird', 'SUNBIRD', 'WIND', 20, 1, 'bird', 'It drinks from the flowers at dawn, and shines like a coal.'),
  c('loerie', 'LOERIE', 'WIND', 30, 1, 'bird', 'A flash of red under its wings, then gone into the canopy.'),
  c('owl', 'EAGLE OWL', 'SHADOW', 35, 1, 'eyes', 'It watched the crew go past the stone. It did not blink.'),
  c('bushbaby', 'BUSHBABY', 'SHADOW', 20, 1, 'eyes', 'Its cry in the dark sounds like a lost child.'),
  c('firefly', 'FIREFLY', 'LIGHT', 20, 1, 'glow', 'A spark the forest lends to anyone lost after dark.'),
  c('butterfly', 'MOTHER-OF-PEARL', 'LIGHT', 25, 1, 'butterfly', 'A butterfly that only flies where the trees are old.'),
  c('beetle', 'DUNG BEETLE', 'EARTH', 30, 1, 'beetle', 'It steers by the stars and never loses its way home.'),
  c('chameleon', 'CHAMELEON', 'FOREST', 25, 1, 'snake', 'Whatever colour the forest is, so is it.'),
  c('python', 'ROCK PYTHON', 'EARTH', 45, 1, 'snake', 'Older than the road. It was here when the stone was set.'),
  c('warthog', 'WARTHOG', 'EARTH', 35, 1, 'tusks', 'Tail straight up, it runs at whatever is on its road.'),
  c('bushpig', 'BUSHPIG', 'EARTH', 40, 1, 'tusks', 'It turns the forest floor over looking for roots, all night.'),
  c('monkey', 'VERVET', 'FOREST', 30, 1, 'paw', 'It will steal your lunch and laugh at you from the branches.'),
  c('river', 'THE RIVER', 'WATER', 45, 1, 'wave', 'It knows the way down the mountain better than any road.'),
  c('stream', 'THE STREAM', 'WATER', 20, 1, 'wave', 'A thread of the river, singing over the stones.'),
  c('fern', 'TREE FERN', 'FOREST', 25, 1, 'leaf', 'It was old before there were trees with flowers.'),
  c('mushroom', 'GHOST MUSHROOM', 'LIGHT', 30, 1, 'mushroom', 'It glows faintly green where nobody walks.'),
  c('mopane', 'MOPANE', 'FOREST', 35, 1, 'leaf', 'Its leaves fold up like butterflies in the midday heat.'),
  c('feather', 'GUINEAFOWL FEATHER', 'WIND', 15, 1, 'feather', 'Spotted like the night sky. Kai keeps one in his pocket.'),
  c('drum', 'THE DRUM', 'SONG', 40, 1, 'drum', 'The camp’s drum. It talks across the valley at night.'),
  c('cairn', 'TRAIL CAIRN', 'EARTH', 20, 1, 'stone', 'Stones stacked to keep you on the old path.'),
  c('moon', 'THE MOON', 'SKY', 45, 1, 'moon', 'It lit Kai’s way up to the stone that night.'),
  // rare: turn up about one day in six
  c('baobab', 'BAOBAB', 'FOREST', 60, 2, 'tree', 'A thousand years old, and it has never once been cut.'),
  c('mbira', 'MBIRA', 'SONG', 55, 2, 'mbira', 'The tune from the fire. Every spirit in the valley knows it.'),
  c('mask', 'THE MASK', 'SHADOW', 65, 2, 'mask', 'Carved stone, with a face behind it Kai would know anywhere.'),
  c('stag', 'THE STAG', 'SPIRIT', 80, 2, 'antlers', 'It heals the one who carries the horn, and wakes again.'),
  c('fox', 'THE FOX', 'SPIRIT', 70, 2, 'fox', 'It shows you where the next blow will land.'),
  c('ember', 'THE EMBER', 'FIRE', 75, 2, 'flame', 'The last coal of the fire, carried into the fight.'),
  c('falls', 'THE FALLS', 'WATER', 90, 2, 'falls', 'Everything that goes over comes up changed.'),
  c('leopard', 'LEOPARD', 'SHADOW', 85, 2, 'eyes', 'You never see it. It always sees you.'),
  c('eagle', 'CROWNED EAGLE', 'WIND', 80, 2, 'bird', 'It can lift a monkey from the canopy and not slow down.'),
  // legendary: about one day in thirty
  c('horn', 'THE SILENT HORN', 'SPIRIT', 120, 3, 'horn', 'While it sits on its stone, the forest sings.'),
  c('greatstag', 'THE GREAT STAG', 'SPIRIT', 110, 3, 'antlers', 'The forest’s first guardian. The statues are all of him.'),
  c('storm', 'THE STORM', 'SKY', 100, 3, 'storm', 'It broke over the falls the day the horn was taken.'),
];
export const CARD = Object.fromEntries(CARDS.map((x) => [x.id, x]));
export const RARITY_NAME = { 1: 'COMMON', 2: 'RARE', 3: 'LEGENDARY' };

// The secret places one card a day can hide in. `clue` is how the forest's
// lore names the place: it never says which level, only landmarks the MAP
// shows, so a clue heard in one place can point somewhere else entirely.
export const DAILY_SPOTS = [
  { level: 'prologue', x: -21, z: -8, clue: 'under the roots of the old fig' },
  { level: 'prologue', x: 22, z: 6, clue: 'beside the crew\u2019s rusted truck' },
  { level: 'prologue', x: 19, z: -30, clue: 'at the edge of the still forest pool' },
  { level: 'prologue', x: -23, z: -53, clue: 'at the foot of lookout rock' },
  { level: 'prologue', x: 20, z: -76, clue: 'by the roots of the fallen giant' },
  { level: 'prologue', x: -22, z: -88, clue: 'inside the ruined hut\u2019s walls' },
  { level: 'level01', z: -460, lane: 0, clue: 'on the left of the old trail, before it first forks' },
  { level: 'level01', z: -1240, lane: 2, clue: 'on the right of the trail, between the dark shrine and the falling bridge' },
  { level: 'level01', z: -1700, lane: 1, clue: 'in the middle of the trail, just past where the stone guardian charges' },
  { level: 'level01', z: -3700, lane: 0, clue: 'on the left of the trail, past the high ruins, with the camp close' },
  { level: 'level02', z: 1300, x: -9, clue: 'in the far left lane of the river road, before its first kilometre is out' },
  { level: 'level02', z: 3000, x: 9, clue: 'in the far right lane of the river road, five kilometres short of the falls' },
  { level: 'level02', z: 5450, x: 9, clue: 'far right on the river road, between the first and second barricades' },
  { level: 'level02', z: 7600, x: -9, clue: 'far left on the river road, past the last barricades, with the falls in sight' },
  { level: 'level03', x: -25, z: 2, clue: 'between the stag\u2019s shrine and the courtyard' },
  { level: 'level03', x: 7, z: 27, clue: 'beside the ember\u2019s shrine, on the side away from the pool' },
  { level: 'level03', x: 21, z: 4, clue: 'between the fox\u2019s shrine and the courtyard' },
  { level: 'level03', x: -7, z: -14, clue: 'at the edge of the pool below the falls' },
];

/**
 * How today's clue reaches the player, chosen by the day (and never the
 * menus): something Baba Zwane says at the fire, one of Kai's thoughts in a
 * level, a sign painted on the trail, a board by the river road, or a stone
 * tablet at the falls. Often not in the level the card is in.
 */
export const CLUE_WAYS = ['zwane', 'think:level01', 'think:level02', 'think:level03', 'sign:level01', 'sign:level02', 'sign:level03'];

/* ---------------------------------------------------------------- the collection */
const KEY = 'silent-horn.cards';
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    return {
      found: Array.isArray(s.found) ? s.found : [],
      takenDay: Number.isFinite(s.takenDay) ? s.takenDay : null,
      takenCard: typeof s.takenCard === 'string' ? s.takenCard : null,
    };
  } catch {
    return { found: [], takenDay: null, takenCard: null };
  }
}
const store = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage blocked: it counts for this session
  }
};

export const isFound = (id) => store.found.includes(id);
export const foundCount = () => store.found.length;

/* ---------------------------------------------------------------- the day */
/** Which day it is, as a whole number (local midnight to midnight). ?day=N in the URL picks one, for testing. */
export function dayNumber() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('day') : null;
  if (q !== null && !Number.isNaN(+q)) return +q;
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

/** A steady 0..1 number for a day and a salt: the same for everyone, all day. */
function luck(day, salt) {
  const x = Math.sin(day * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Today's card: its rarity by luck (legendary ~1 in 30 days, rare ~1 in 6,
 * otherwise common), then a card of that rarity, preferring one this player
 * hasn't got yet, and the secret place it's hiding today.
 */
export function todaysCard() {
  const day = dayNumber();
  const r = luck(day, 1);
  const rarity = r < 0.034 ? 3 : r < 0.2 ? 2 : 1;
  const pool = CARDS.filter((x) => x.rarity === rarity);
  const start = Math.floor(luck(day, 2) * pool.length);
  let card = pool[start];
  // once today's is found it stays today's, even though the album has changed since
  const taken = store.takenDay === day && CARD[store.takenCard];
  for (let i = 0; i < pool.length && !taken; i++) {
    const cand = pool[(start + i) % pool.length];
    if (!isFound(cand.id)) { card = cand; break; }
  }
  const spot = DAILY_SPOTS[Math.floor(luck(day, 3) * DAILY_SPOTS.length)];
  const way = CLUE_WAYS[Math.floor(luck(day, 4) * CLUE_WAYS.length)];
  if (taken) card = taken;
  return { card, spot, clue: spot.clue, way, day, taken: !!taken, found: isFound(card.id) };
}

/**
 * Take today's card: 'new' if it's new to the album, 'again' if you had it
 * already, null if today's card is already taken (one card a day).
 */
export function collect(id) {
  const today = todaysCard();
  if (today.taken || id !== today.card.id) return null;
  store.takenDay = today.day;
  store.takenCard = id;
  const isNew = !isFound(id);
  if (isNew) store.found.push(id);
  save();
  return isNew ? 'new' : 'again';
}

/** What to place in `level` today: today's card, if it hides here and hasn't been taken yet. */
export function cardsForLevel(level) {
  const t = todaysCard();
  return t.spot.level === level && !t.taken ? [{ card: t.card, spot: t.spot, daily: true }] : [];
}

/** The clue said as a whole line, for whoever says it. */
export function clueLine(way, clue) {
  if (way === 'zwane') return `And Kai, the old people say the forest hides a little of its spirit somewhere every day. Today it sleeps ${clue}.`;
  if (way.startsWith('think')) return `Baba Zwane\u2019s old saying: the forest hides its spirit somewhere every day. Today it sleeps ${clue}.`;
  return `TODAY THE FOREST\u2019S SPIRIT SLEEPS ${clue.toUpperCase()}`;
}

/** Does today's clue come in `place` ('zwane', 'think:level02', 'sign:level01' ...)? Returns the line, or null. */
export function clueFor(place) {
  const t = todaysCard();
  return t.way === place && !t.taken ? clueLine(t.way, t.clue) : null;
}
