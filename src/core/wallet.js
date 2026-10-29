/**
 * FOREST LIGHTS — the forest's light, caught on the trail in Level 1, is
 * what Kai has to spend: every one fills the horn (40 to a call) and is kept
 * here too, to buy the cars in Level 2's yard. One light, one Forest Light.
 * Kept in this browser (localStorage), like the spirit cards, so they build
 * up over runs: a run that ends badly still keeps what it caught.
 *
 *   import { CURRENCY, balance, earn, owns, buy } from '../core/wallet.js';
 *   earn(1);                         // a light caught
 *   if (!owns('supercar') && buy('supercar', 350)) ...
 *
 * The name lives in CURRENCY alone, so it can be changed in one place.
 */
export const CURRENCY = 'FOREST LIGHTS';
export const CURRENCY_ONE = 'FOREST LIGHT';
/** The car that is everyone's from the start (level2/carSelect.js CARS). */
export const FREE_CAR = 'bruiser';

const KEY = 'silent-horn.wallet';
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    return {
      lights: Number.isFinite(s.lights) && s.lights >= 0 ? Math.floor(s.lights) : 0,
      owned: Array.isArray(s.owned) ? s.owned.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return { lights: 0, owned: [] };
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

/** Forest Lights to spend. */
export const balance = () => store.lights;

/** Lights caught: added to what there is to spend. */
export function earn(n = 1) {
  if (!(n > 0)) return;
  store.lights += Math.floor(n);
  save();
}

/** Is this car Kai's (bought, or the free one)? */
export const owns = (id) => id === FREE_CAR || store.owned.includes(id);

/** Buy a car: true if it was bought (or already his), false if there aren't enough Forest Lights. */
export function buy(id, price) {
  if (owns(id)) return true;
  if (store.lights < price) return false;
  store.lights -= price;
  store.owned.push(id);
  save();
  return true;
}
