import "./style.css";
import { Game } from "./core/Game.js";
import { Prologue } from "./levels/Prologue.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";
import { Level03 } from "./levels/Level03.js";
import { TrailIntro } from "./intros/level1/TrailIntro.js";
import { GateWin } from "./intros/level1/GateWin.js";
import { CampIntro } from "./intros/level2/CampIntro.js";
import { FallWin } from "./intros/level2/FallWin.js";

/**
 * The full run, in order:
 *
 *   prologue → level01-intro → level01 → level01-win
 *            → level02-intro → level02 → level02-win → level03
 *
 * The levels themselves hand off forward (Prologue → level01-intro,
 * Level01 → level01-win, Level02 → level02-win); the cutscenes are wired here.
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

// the win scenes read the numbers the level left in state.lastRun
const lastRun = () => game.state.lastRun ?? {};

game.registerLevel("prologue", () => new Prologue());
game.registerLevel("level01-intro", () => new TrailIntro({ onDone: () => goTo("level01") }));
game.registerLevel("level01", () => new Level01());
game.registerLevel("level01-win", () => new GateWin({ stats: lastRun(), onContinue: () => goTo("level02-intro") }));
game.registerLevel("level02-intro", () => new CampIntro({ onDone: () => goTo("level02") }));
game.registerLevel("level02", () => new Level02());
game.registerLevel("level02-win", () => new FallWin({ stats: lastRun(), onContinue: () => goTo("level03") }));
game.registerLevel("level03", () => new Level03());

game.onLevelChanged = (name) => console.log("[game] level:", name);
game.onPaused = (v) => console.log("[game]", v ? "paused" : "resumed");

const wanted = new URLSearchParams(location.search).get("level");
await game.setLevel(game.levels.has(wanted) ? wanted : "prologue");
game.start();

// handy while developing — open the console and poke at it
window.game = game;
