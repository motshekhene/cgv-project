import "./style.css";
import { Game } from "./core/Game.js";
import { Prologue } from "./levels/Prologue.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";
import { Level03 } from "./levels/Level03.js";

const game = new Game();

game.registerLevel("prologue", () => new Prologue());
game.registerLevel("level01", () => new Level01());
game.registerLevel("level02", () => new Level02());
game.registerLevel("level03", () => new Level03());

game.onLevelChanged = (name) => console.log("[game] level:", name);
game.onPaused = (v) => console.log("[game]", v ? "paused" : "resumed");

const wanted = new URLSearchParams(location.search).get("level");
await game.setLevel(game.levels.has(wanted) ? wanted : "prologue");
game.start();

window.game = game;