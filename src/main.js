import "./style.css";
import { Game } from "./core/Game.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";
import { Level03 } from "./levels/Level03.js";
import { TrailIntro } from "./intros/level1/TrailIntro.js";

/**
 * The full run, in order:
 *
 *   level01-intro → level01 → level02 → level03
 *
 * The intro cutscene hands off here; the levels hand off forward themselves
 * (Level01 → level02, Level02 → level03).
 * Any piece can be opened on its own with ?level=<name>, e.g. ?level=level03.
 */
const game = new Game();

/**
 * Switch levels from inside a cutscene's update(): deferred to a microtask so
 * the scene is not torn down under its own stack frame (see Level01._startLevel02).
 */
function goTo(name) {
  game.setPaused(true);
  Promise.resolve().then(async () => {
    try {
      await game.setLevel(name);
    } catch (err) {
      console.error(`[game] could not start ${name}`, err);
    } finally {
      game.setPaused(false);
    }
  });
}

game.registerLevel("level01-intro", () => new TrailIntro({ onDone: () => goTo("level01") }));
game.registerLevel("level01", () => new Level01());
game.registerLevel("level02", () => new Level02());
game.registerLevel("level03", () => new Level03());

game.onLevelChanged = (name) => console.log("[game] level:", name);
game.onPaused = (v) => console.log("[game]", v ? "paused" : "resumed");

const wanted = new URLSearchParams(location.search).get("level");
await game.setLevel(game.levels.has(wanted) ? wanted : "level01-intro");
game.start();

// handy while developing — open the console and poke at it
window.game = game;
