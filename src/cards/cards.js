/**
 * SPIRIT CARDS — the collectible layer over the story: the forest's
 * creatures and spirits as trading cards, hidden all through the three
 * levels. Found cards are kept in this browser (localStorage), so the
 * collection carries over from one play to the next: that's the replay.
 *
 *   - 12 cards always hidden at their own spots (SPOTS), 4 in each level
 *   - 3 LEGENDARY spirits that only appear one at a time: each day one of
 *     them hides at one of six secret places (DAILY_SPOTS), and the main
 *     menu gives that day's riddle; the MAP shows the area to search
 *
 *   import { CARDS, isFound, collect, todaysSpirit } from '../cards/cards.js';
 *   if (collect('kudu')) showReveal('kudu');      // true the first time only
 *   const daily = todaysSpirit();                   // { card, spot, riddle, found }
 *
 * Spots are in each level's own terms: Level 1 { z, lane } on the trail,
 * Level 2 { z, x } on the River Road, Level 3 { x, z } round the courtyard.
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

// rarity: 1 common, 2 rare, 3 legendary (stars on the card, the glow round the pickup)
export const CARDS = [
  { id: 'kudu', name: 'KUDU', type: 'FOREST', power: 40, rarity: 1, art: 'antlers', lore: 'Bolts across the trail the moment it hears running feet.' },
  { id: 'hornbill', name: 'HORNBILL', type: 'WIND', power: 30, rarity: 1, art: 'bird', lore: 'Its call carries over three valleys. It was the first to go quiet.' },
  { id: 'firefly', name: 'FIREFLY', type: 'LIGHT', power: 20, rarity: 1, art: 'glow', lore: 'A spark the forest lends to anyone lost after dark.' },
  { id: 'baobab', name: 'BAOBAB', type: 'FOREST', power: 60, rarity: 2, art: 'tree', lore: 'A thousand years old, and it has never once been cut.' },
  { id: 'warthog', name: 'WARTHOG', type: 'EARTH', power: 35, rarity: 1, art: 'tusks', lore: 'Tail straight up, it runs at whatever is on its road.' },
  { id: 'river', name: 'THE RIVER', type: 'WATER', power: 55, rarity: 1, art: 'wave', lore: 'It knows the way down the mountain better than any road.' },
  { id: 'mbira', name: 'MBIRA', type: 'SONG', power: 45, rarity: 2, art: 'mbira', lore: 'The tune from the fire. Every spirit in the valley knows it.' },
  { id: 'mask', name: 'THE MASK', type: 'SHADOW', power: 65, rarity: 2, art: 'mask', lore: 'Carved stone, with a face behind it Kai would know anywhere.' },
  { id: 'stag', name: 'THE STAG', type: 'SPIRIT', power: 80, rarity: 2, art: 'antlers', lore: 'It heals the one who carries the horn, and wakes again.' },
  { id: 'fox', name: 'THE FOX', type: 'SPIRIT', power: 70, rarity: 2, art: 'fox', lore: 'It shows you where the next blow will land.' },
  { id: 'ember', name: 'THE EMBER', type: 'FIRE', power: 75, rarity: 2, art: 'flame', lore: 'The last coal of the fire, carried into the fight.' },
  { id: 'falls', name: 'THE FALLS', type: 'WATER', power: 90, rarity: 2, art: 'falls', lore: 'Everything that goes over comes up changed.' },
  // the legendary spirits: one a day, at one of the secret places
  { id: 'horn', name: 'THE SILENT HORN', type: 'SPIRIT', power: 120, rarity: 3, art: 'horn', lore: 'While it sits on its stone, the forest sings.', daily: true },
  { id: 'greatstag', name: 'THE GREAT STAG', type: 'SPIRIT', power: 110, rarity: 3, art: 'antlers', lore: 'The forest’s first guardian. The statues are all of him.', daily: true },
  { id: 'storm', name: 'THE STORM', type: 'SKY', power: 100, rarity: 3, art: 'storm', lore: 'It broke over the falls the day the horn was taken.', daily: true },
];
export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// where each always-there card hides, in its level's own terms
export const SPOTS = {
  kudu: { level: 'level01', z: -420, lane: 0 },
  hornbill: { level: 'level01', z: -1650, lane: 2 },
  firefly: { level: 'level01', z: -2240, lane: 1 },
  baobab: { level: 'level01', z: -3300, lane: 0 },
  warthog: { level: 'level02', z: 1200, x: -9 },
  river: { level: 'level02', z: 2600, x: 9 },
  mbira: { level: 'level02', z: 3900, x: -3 },
  mask: { level: 'level02', z: 6500, x: 3 },
  stag: { level: 'level03', x: -22, z: 13 },
  fox: { level: 'level03', x: 21, z: 14 },
  ember: { level: 'level03', x: 1, z: 24 },
  falls: { level: 'level03', x: -7, z: -14 },
};

// the secret places a daily spirit can be, each with its riddle
export const DAILY_SPOTS = [
  { level: 'level01', z: -1240, lane: 2, riddle: 'Between the dark shrine and the bridge that falls away, the right side of the trail keeps today’s spirit.' },
  { level: 'level01', z: -3700, lane: 0, riddle: 'Past the high ruins, with the camp under a kilometre away, keep to the left edge of the trail.' },
  { level: 'level02', z: 3000, x: -9, riddle: 'On the River Road, about five kilometres before the falls, in the far left lane.' },
  { level: 'level02', z: 5450, x: 9, riddle: 'Between the company’s first and second barricades on the River Road, keep to the far right.' },
  { level: 'level03', x: -25, z: 2, riddle: 'At the falls, walk from the Stag’s shrine toward the courtyard. It waits on the way.' },
  { level: 'level03', x: 7, z: 27, riddle: 'At the falls, beside the Ember’s shrine, on the side away from the pool.' },
];
const LEGENDS = CARDS.filter((c) => c.daily).map((c) => c.id);

const KEY = 'silent-horn.cards';
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    return { found: Array.isArray(s.found) ? s.found : [] };
  } catch {
    return { found: [] };
  }
}
const store = load();
const listeners = new Set();

export const isFound = (id) => store.found.includes(id);
export const foundCount = () => store.found.length;

/** Add a card to the collection. True if it's new (the reveal plays), false if already had. */
export function collect(id) {
  if (!CARD[id] || isFound(id)) return false;
  store.found.push(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage blocked: the card counts for this session
  }
  for (const f of listeners) f(id);
  return true;
}

export function onCollect(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Which day it is, as a whole number (local midnight to midnight). ?day=N in the URL picks one, for testing. */
export function dayNumber() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('day') : null;
  if (q !== null && !Number.isNaN(+q)) return +q;
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

/** Today's legendary spirit, where it hides and the riddle. */
export function todaysSpirit() {
  const n = dayNumber();
  const card = CARD[LEGENDS[((n % LEGENDS.length) + LEGENDS.length) % LEGENDS.length]];
  // the spot walks on a different step from the card, so every pairing comes round
  const spot = DAILY_SPOTS[((n * 5 + 1) % DAILY_SPOTS.length + DAILY_SPOTS.length) % DAILY_SPOTS.length];
  return { card, spot, riddle: spot.riddle, found: isFound(card.id) };
}

/** Every card to place in `level` today: [{ card, spot }], the daily spirit too if it's here and not found yet. */
export function cardsForLevel(level) {
  const list = [];
  for (const [id, spot] of Object.entries(SPOTS)) if (spot.level === level && !isFound(id)) list.push({ card: CARD[id], spot });
  const d = todaysSpirit();
  if (d.spot.level === level && !d.found) list.push({ card: d.card, spot: d.spot, daily: true });
  return list;
}
