import "./style.css";
import { Game } from "./core/Game.js";
import { Prologue } from "./levels/Prologue.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";
import { Level03 } from "./levels/Level03.js";
import { TrailIntro } from "./intros/level1/TrailIntro.js";
import { loadJungleKit, createJungleMaterials } from "./levels/level1/jungleWorld.js";
import { mountControlsOverlay } from "./ui/ControlsOverlay.js";

/**
 * The full run, in order:
 *
 *   prologue → level01 → level02 → level03
 *
 * The prologue is the intro of record (1A): it ends with Kai bursting onto
 * the trail at dawn — Level 1's first frame — so it hands straight to
 * level01. TrailIntro, the level-1 cutscene, stays registered for its own
 * work; open it on its own with ?level=level01-intro. Levels hand off
 * forward themselves (Level01 → level02, Level02 → level03). Any piece can
 * be opened on its own with ?level=<name>, e.g. ?level=level03.
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

game.registerLevel("prologue", () => new Prologue());
game.registerLevel("level01-intro", () => new TrailIntro({ onDone: () => goTo("level01") }));
game.registerLevel("level01", () => new Level01());
game.registerLevel("level02", () => new Level02());
game.registerLevel("level03", () => new Level03());

/**
 * Loading cover: fades in over the last frame while a level builds and fades
 * out once it is ready, so a switch reads as a cut through black rather than
 * a flash of the next level's empty sky.
 */
const cover = document.createElement("div");
cover.innerHTML = "<div>LOADING</div><i><b></b></i>";
cover.style.cssText =
  "position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
  "gap:14px;background:#05060c;color:#e3bb62;font:700 13px 'Segoe UI',system-ui,sans-serif;letter-spacing:.32em;" +
  "transition:opacity .35s ease;pointer-events:none;";
const bar = cover.querySelector("b");
cover.querySelector("i").style.cssText = "display:block;width:min(260px,60vw);height:2px;background:rgba(227,187,98,.2)";
bar.style.cssText = "display:block;height:100%;width:0;background:#e3bb62;transition:width .2s";
document.body.appendChild(cover);

// the "H · CONTROLS" pill — what every input does, per level, one press away
const controlsOverlay = mountControlsOverlay(game);

game.onLevelLoading = () => {
  bar.style.width = "0";
  cover.style.opacity = "1";
};
game.onLoadProgress = (p) => {
  if (game.loading) bar.style.width = `${Math.round(p * 100)}%`;
};
game.onLevelChanged = (name) => {
  console.log("[game] level:", name);
  controlsOverlay.setLevel(name);
  cover.style.opacity = "0";
};
game.onPaused = (v) => console.log("[game]", v ? "paused" : "resumed");
game.onControlsToggle = () => controlsOverlay.toggle();

const wanted = new URLSearchParams(location.search).get("level");
const first = game.levels.has(wanted) ? wanted : "prologue";
await game.setLevel(first);
game.start();

// Level 1's models and textures download while the intro plays, so the
// hand-off is instant. AssetRegistry caches them; Level 1 clones its own copies.
if (first === "prologue" || first === "level01-intro") {
  Promise.all([loadJungleKit(game.assets), createJungleMaterials(game.assets)]).catch((err) =>
    console.warn("[game] level 1 preload failed; it will load on its own", err),
  );
}

// handy while developing — open the console and poke at it
window.game = game;
