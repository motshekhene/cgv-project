import "./style.css";
import { Game } from "./core/Game.js";
import { Prologue } from "./levels/Prologue.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";

const game = new Game();

game.registerLevel("prologue", () => new Prologue());
game.registerLevel("level01", () => new Level01());
game.registerLevel("level02", () => new Level02());
// 3A: register level03 here the same way once it exists
// game.registerLevel("level03", () => new Level03());

game.onLevelChanged = (name) => console.log("[game] level:", name);
game.onPaused = (v) => console.log("[game]", v ? "paused" : "resumed");

// ?level=level02 in the URL jumps straight into a level while developing
const wanted = new URLSearchParams(location.search).get("level");
await game.setLevel(game.levels.has(wanted) ? wanted : "prologue");
game.start();

// handy while developing — open the console and poke at it
window.game = game;