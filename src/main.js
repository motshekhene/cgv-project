import "./style.css";
import { Game } from "./core/Game.js";
import { Prologue } from "./levels/Prologue.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";
import { Level03 } from "./levels/Level03.js";
import { Epilogue } from "./levels/Epilogue.js";
import { DriveOutIntro } from "./intros/level2/DriveOutIntro.js";
import { loadJungleKit, createJungleMaterials } from "./levels/level1/jungleWorld.js";
import { mountControlsOverlay, controlRows } from "./ui/ControlsOverlay.js";
import { PauseMenu } from "./ui/PauseMenu.js";
import { CHAPTERS } from "./ui/LoadingScreen.js";
import { ensureDialogueFont } from "./ui/dialogue.js";
import { LoadingScreen } from "./ui/LoadingScreen.js";
import { TitleScreen } from "./ui/TitleScreen.js";
import { TitleScene } from "./levels/TitleScene.js";

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
 *
 * (The old server-room story's Level 1 cutscene, TrailIntro, is no longer
 * part of the run: the prologue replaced it.)
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

// the "H · CONTROLS" pill — what every input does, per level, one press away
const controlsOverlay = mountControlsOverlay(game);

game.onLevelLoading = (name) => loading.show(name);
game.onLoadProgress = (p) => {
  if (game.loading) loading.progress(p);
};
// the title's words and menu, over the title level while it is up
let titleScreen = null;
let titleVisits = 0;
game.onLevelChanged = (name) => {
  console.log("[game] level:", name);
  controlsOverlay.setLevel(name);
  loading.hide();
  if (titleScreen && name !== "title") {
    titleScreen.dispose();
    titleScreen = null;
  }
  if (name === "title" && !titleScreen) {
    titleScreen = new TitleScreen({
      onStart: (next) => {
        titleScreen = null;
        begin(next);
      },
      onControls: () => controlsOverlay.show(),
      skipPress: titleVisits++ > 0, // back from a level: straight to the menu
    });
  }
};
// One pause menu for every level (Esc, or a level's own pause button): the
// chapter, that level's controls, RESUME / RESTART / MAIN MENU
const pauseMenu = new PauseMenu({
  onResume: () => game.setPaused(false),
  onRestart: () => game.restart(),
  onMenu: () => goTo("title"),
});
game.onPaused = (v, reason) => {
  console.log("[game]", v ? "paused" : "resumed", reason === "switch" ? "(level switch)" : "");
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
  show(name);
})(game.onLevelLoading);
game.onControlsToggle = () => controlsOverlay.toggle();

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
