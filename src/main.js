import "./style.css";
import "./audio/masterMute.js"; // first: every AudioContext the game makes goes through its master volume
import { Game } from "./core/Game.js";
import { Prologue } from "./levels/Prologue.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";
import { Level03 } from "./levels/Level03.js";
import { Epilogue } from "./levels/Epilogue.js";
import { DriveOutIntro } from "./intros/level2/DriveOutIntro.js";
import { loadJungleKit, createJungleMaterials } from "./levels/level1/jungleWorld.js";
import { mountPauseHint, controlRows } from "./ui/ControlsOverlay.js";
import { ControlsMenu } from "./ui/ControlsMenu.js";
import { PauseMenu } from "./ui/PauseMenu.js";
import { CHAPTERS } from "./ui/LoadingScreen.js";
import { ensureDialogueFont } from "./ui/dialogue.js";
import { LoadingScreen } from "./ui/LoadingScreen.js";
import { TitleScreen } from "./ui/TitleScreen.js";
import { TitleScene } from "./levels/TitleScene.js";
import { OptionsMenu } from "./ui/OptionsMenu.js";
import { CreditsMenu } from "./ui/CreditsMenu.js";
import { CardAlbum } from "./ui/CardAlbum.js";
import { GameMap } from "./ui/GameMap.js";
import { Playbook } from "./ui/Playbook.js";
import { RecordsMenu } from "./ui/RecordsMenu.js";
import { reached } from "./core/progress.js";
import { mountFpsCounter } from "./ui/FpsCounter.js";

/**
 * The full run, in order:
 *
 *   title → prologue → level01 → level02-intro → level02 → level03 → epilogue
 *
 * The title is a level too (levels/TitleScene.js: the glade at dawn with the
 * horn on its stone), with the menu drawn over it (ui/TitleScreen.js); the
 * pause menu's MAIN MENU comes back to it.
 *
 * The prologue is the intro of record: the fire, Baba Zwane, the horn on the
 * stone. It ends with Kai running onto the trail at dawn, Level 1's first
 * frame, so it hands straight to level01. Level 1 ends with Kai getting into
 * the car; level02-intro is him driving out of the jungle onto the River
 * Road, so Level 2 picks up already driving, and Level 2 ends over the falls
 * where Level 3 begins. The levels hand off forward themselves. Any piece can
 * be opened on its own with ?level=<name>, e.g. ?level=level03.
 */
ensureDialogueFont(); // the one serif the dialogue, cards and HUD names share
const game = new Game();

/**
 * Switch levels from inside a cutscene's update(): deferred to a microtask so
 * the scene is not torn down under its own stack frame (see Level01._startLevel02).
 */
function goTo(name) {
  game.setPaused(true, "switch");
  Promise.resolve().then(async () => {
    try {
      await game.setLevel(name);
    } catch (err) {
      console.error(`[game] could not start ${name}`, err);
    } finally {
      game.setPaused(false, "switch");
    }
  });
}

game.registerLevel("title", () => new TitleScene());
game.registerLevel("prologue", () => new Prologue());
game.registerLevel("level01", () => new Level01());
game.registerLevel("level02-intro", () => new DriveOutIntro({ onDone: () => { level02FromIntro = true; goTo("level02"); } }));
// straight from the drive-out scene: no car picker, you're already driving
// (the picker is still on V / the CAR button). A restart shows it as usual.
let level02FromIntro = false;
game.registerLevel("level02", () => {
  const level = new Level02({ fromIntro: level02FromIntro });
  level02FromIntro = false;
  return level;
});
game.registerLevel("level03", () => new Level03());
// after the falls: Kai takes the horn back up to its stone (Level 3's VICTORY card leads here)
game.registerLevel("epilogue", () => new Epilogue());

/**
 * The loading screen (ui/LoadingScreen.js): the same one for every switch, so
 * a change of level reads as a chapter turning — the valley at dawn, the horn
 * filling with its light as the level builds, the chapter's name and a line
 * of the story — never as a flash of the next level's empty sky.
 */
const loading = new LoadingScreen();

// ESC · PAUSE in the corner of every level (the pause menu lists the level's keys)
const pauseHint = mountPauseHint(game);
// CONTROLS, from the title menu (and H there): every chapter's controls, in a panel like CREDITS
const controlsMenu = new ControlsMenu(game);
// OPTIONS (volume, mouse, graphics, FPS), from the title menu and the pause menu
const options = new OptionsMenu();
// CREDITS, from the title menu: every asset the team didn't make, with links
const credits = new CreditsMenu();
// SPIRIT CARDS and MAP, from the title menu: the collection and where to look for today's spirit
const gameMap = new GameMap();
const cardAlbum = new CardAlbum({ onMap: () => gameMap.open() });
// PLAYBOOK, from the title and pause menus: the rules, what everything does, and the places, with pictures
const playbook = new Playbook({ onMap: () => gameMap.open() });
// RECORDS, from the title menu: each level's bests (core/records.js)
const recordsMenu = new RecordsMenu();
mountFpsCounter();

// the title's words and menu, over the title level while it is up
let titleScreen = null;
let titleVisits = 0;
// Opening the game there is no loading screen: the landing itself comes up at
// once (the horn in the dark, the title), its gold line filling as the title
// level loads behind it, and PRESS ANY KEY once it's ready. Every other load
// (each chapter, and back to the menu) has the loading screen.
game.onLevelLoading = (name) => {
  if (name === "title" && titleVisits === 0) {
    titleVisits++;
    titleScreen = makeTitleScreen({ skipPress: false, loading: true });
    return;
  }
  loading.show(name);
};
game.onLoadProgress = (p) => {
  if (!game.loading) return;
  if (titleScreen?.loading) titleScreen.progress(p);
  else loading.progress(p);
};
game.onLevelChanged = (name) => {
  console.log("[game] level:", name);
  reached(name); // where the story is up to, for CONTINUE (core/progress.js)
  pauseHint.setLevel(name);
  loading.hide();
  if (titleScreen && name !== "title") {
    titleScreen.dispose();
    titleScreen = null;
  }
  if (name === "title") {
    if (titleScreen?.loading) titleScreen.ready(); // the opening: now PRESS ANY KEY
    else if (!titleScreen) titleScreen = makeTitleScreen({ skipPress: titleVisits++ > 0 }); // back from a level: straight to the menu
  }
};

function makeTitleScreen({ skipPress, loading: waiting = false }) {
  return new TitleScreen({
    onStart: (next) => {
      titleScreen = null;
      begin(next);
    },
    onOptions: () => options.open(),
    onControls: () => controlsMenu.open(),
    onCredits: () => credits.open(),
    onCards: () => cardAlbum.open(),
    onMap: () => gameMap.open(),
    onPlaybook: () => playbook.open(),
    onRecords: () => recordsMenu.open(),
    onPlayer: (id) => game.level?.showPlayer?.(id), // the PLAYER page: who you're choosing, at the stone
    onEnter: (instant) => game.level?.wake?.(instant), // the landing's key: the horn wakes, the camera pulls back to the menu
    skipPress,
    loading: waiting,
  });
}
// One pause menu for every level (Esc, or a level's own pause button): the
// chapter, that level's controls, RESUME / RESTART / MAIN MENU
const pauseMenu = new PauseMenu({
  onResume: () => game.setPaused(false),
  onRestart: () => game.restart(),
  onOptions: () => options.open(),
  onPlaybook: () => playbook.open("how", game.levelName), // on the chapter being played
  onMenu: () => goTo("title"),
});
game.onPaused = (v, reason) => {
  console.log("[game]", v ? "paused" : "resumed", reason === "switch" ? "(level switch)" : "");
  pauseHint.setPaused(v);
  const name = game.levelName;
  if (v && reason === "user" && name === "title") {
    game.setPaused(false, "switch"); // nothing to pause on the title screen: Esc is its "back"
    return;
  }
  if (!v || reason !== "user" || !game.level || game.loading) {
    pauseMenu.show(false);
    return;
  }
  const c = CHAPTERS[name] || { kicker: "", title: "" };
  pauseMenu.show(true, { kicker: c.kicker, title: c.title, rows: controlRows(game, name), tip: game.level.pauseTip || "" });
};
game.onLevelLoading = ((show) => (name) => {
  pauseMenu.show(false);
  pauseHint.loading();
  show(name);
})(game.onLevelLoading);

/** Start the story at `name`, preloading Level 1 behind the prologue. */
async function begin(name) {
  if (game.paused) game.setPaused(false); // Esc on the title screen must not carry into the level
  await game.setLevel(name);
  // Level 1's models and textures download while the prologue plays, so the
  // hand-off is instant. AssetRegistry caches them; Level 1 clones its own copies.
  if (name === "prologue") {
    Promise.all([loadJungleKit(game.assets), createJungleMaterials(game.assets)]).catch((err) =>
      console.warn("[game] level 1 preload failed; it will load on its own", err),
    );
  }
}

// ?level=<name> goes straight there (development, and the chapter links);
// otherwise the game opens on its title screen
const wanted = new URLSearchParams(location.search).get("level");
// handy while developing — open the console and poke at it
window.game = game;

game.start();
await begin(game.levels.has(wanted) ? wanted : "title");
