import { loadRig } from './rig.js';

/**
 * Who you play: Kai, or one of the others, chosen on the title screen
 * (PLAYER, ui/TitleScreen.js) and kept in localStorage. Each is a Mixamo
 * character with all of Kai's moves (tools/build-player.js builds them), so
 * every level takes whichever one is chosen; the choice applies from the next
 * level that starts.
 *
 *   const player = currentPlayer();          // { id, name, rig, line, pronouns }
 *   const rig = await loadPlayer(assets);    // as loadRig() (player/rig.js)
 *   say('{NAME}');                           // 'KAI'
 *   say('The jungle claimed {him}.');        // 'The jungle claimed him.'
 *
 * Text on screen that names the player goes through say(), when it is shown
 * (the choice can change after a level's module has loaded): {name} {NAME},
 * {he} {him} {his}, capitalised ({He}) at the start of a sentence, and {boy}
 * (what Baba Zwane calls the player when he talks down to them). The
 * code keeps calling the player "kai" (this.kai, makeKai): only the words on
 * screen change.
 *
 * A new player: build it with tools/build-player.html, put the GLB and JSON in
 * assets/characters/, and add a row here. Every name must be different.
 */
const HE = { he: 'he', him: 'him', his: 'his', boy: 'boy' };
const SHE = { he: 'she', him: 'her', his: 'her', boy: 'girl' };

export const PLAYERS = [
  { id: 'kai', name: 'Kai', rig: 'kai-bryce', line: 'A guide who knows every path through the forest.', pronouns: HE },
  { id: 'naledi', name: 'Naledi', rig: 'naledi-ch22', line: 'The fastest guide on the river paths.', pronouns: SHE },
  { id: 'bheki', name: 'Bheki', rig: 'bheki-ch10', line: 'Looks half dead. Runs like he isn’t.', pronouns: HE },
  // short, with a head that size: at 1.8 m it went through the roof of every car in Level 1's bay
  { id: 'knox', name: 'Knox', rig: 'toko-ch19', line: 'Small, blue, and nobody’s idea of a hero.', pronouns: HE, height: 1.35 },
];

const KEY = 'blackout.player';
const FALLBACK = 'kai.fbx'; // the old Quaternius Kai, if a build is missing (loadRig)

/** The chosen player, or Kai. */
export function currentPlayer() {
  try {
    return PLAYERS.find((p) => p.id === localStorage.getItem(KEY)) || PLAYERS[0];
  } catch {
    return PLAYERS[0];
  }
}

export function savePlayer(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

/**
 * A player's model and moves (the chosen one's by default). A player with a
 * `height` (metres) stands that tall instead of Kai's 1.8: every Fighter scales
 * its model to 1.8 m by meta.height, the model's own height, so the meta here
 * says it's that much taller than it is.
 */
export async function loadPlayer(assets, player = currentPlayer()) {
  const rig = await loadRig(assets, player.rig, FALLBACK);
  if (player.height && rig.meta) rig.meta = { ...rig.meta, height: (rig.meta.height * 1.8) / player.height };
  return rig;
}

/** `text` with the player's name and pronouns in it (see the top of this file). */
export function say(text, player = currentPlayer()) {
  return text.replace(/\{(name|NAME|he|him|his|boy|He|Him|His)\}/g, (_, key) => {
    if (key === 'name') return player.name;
    if (key === 'NAME') return player.name.toUpperCase();
    const word = player.pronouns[key.toLowerCase()];
    return key[0] === 'H' ? word[0].toUpperCase() + word.slice(1) : word;
  });
}
