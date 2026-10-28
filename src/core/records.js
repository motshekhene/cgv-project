/**
 * RECORDS — each level's bests, kept in this browser (localStorage) like the
 * Forest Lights and the spirit cards: for the main menu's RECORDS page
 * (ui/RecordsMenu.js), and a NEW BEST on the end card that beats one.
 *
 *   import { submit } from '../core/records.js';
 *   const best = submit('l1.time', 161.3);   // true: it beat the record there was
 *   { label: 'TIME', value: clock(161.3), best }  // the end card's tile
 *
 * The first run sets a record quietly (there was nothing to beat); after that
 * any better one says NEW BEST.
 */
const KEY = 'silent-horn.records';

// better: which way is better. fmt: 'clock' (2:41.3) or 'tenths' (1.2), else whole numbers
export const RECORDS = [
  { id: 'l1.time', chapter: 'level01', label: 'FASTEST ESCAPE', better: 'low', fmt: 'clock', how: 'Escape the Marshal to set it.' },
  { id: 'l1.lights', chapter: 'level01', label: 'MOST LIGHTS IN A RUN', better: 'high', kind: 'lights', how: 'Catch lights on the trail.' },
  { id: 'l1.closest', chapter: 'level01', label: 'CLOSEST CALL', better: 'low', fmt: 'tenths', unit: 'M', how: 'How near he got, on a run you escaped.' },
  { id: 'l2.time', chapter: 'level02', label: 'FASTEST TO THE FALLS', better: 'low', fmt: 'clock', how: 'Reach the falls to set it.' },
  { id: 'l2.speed', chapter: 'level02', label: 'TOP SPEED', better: 'high', unit: 'KM/H', how: 'Drive the River Road.' },
  { id: 'l2.integrity', chapter: 'level02', label: 'MOST CAR LEFT', better: 'high', unit: '%', how: 'Reach the falls with the car in one piece.' },
  { id: 'l2.takedowns', chapter: 'level02', label: 'MOST TAKEDOWNS', better: 'high', how: 'Run his men off the road.' },
  { id: 'l3.time', chapter: 'level03', label: 'FASTEST VICTORY', better: 'low', fmt: 'clock', how: 'Win the fight at the falls to set it.' },
  { id: 'l3.life', chapter: 'level03', label: 'MOST LIFE LEFT', better: 'high', unit: '%', how: 'Win the fight with as little hurt as you can.' },
];
const DEF = Object.fromEntries(RECORDS.map((r) => [r.id, r]));

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}
const store = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage blocked: they count for this session
  }
};

/** A record as kept: { value, at } (at: when it was set, ms), or null if there isn't one yet. */
export function record(id) {
  const r = store[id];
  return r && Number.isFinite(r.value) ? r : null;
}

/** A result for record `id`: kept if it's better. True only if it beat a record there already was. */
export function submit(id, value) {
  const def = DEF[id];
  if (!def || !Number.isFinite(value)) return false;
  const was = record(id);
  const better = !was || (def.better === 'low' ? value < was.value : value > was.value);
  if (!better) return false;
  store[id] = { value, at: Date.now() };
  save();
  return !!was;
}

/** A time as the end cards show it: 2:41.3 */
export function clock(seconds = 0) {
  const t = Math.max(0, seconds);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`;
}

/** A record's value as shown, by its kind: '2:41.3', '1.2', '212'. */
export function shown(def, value) {
  if (def.fmt === 'clock') return clock(value);
  if (def.fmt === 'tenths') return value.toFixed(1);
  return String(Math.round(value));
}
