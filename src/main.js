import "./style.css";
import { Game } from "./core/Game.js";
import { Level01 } from "./levels/Level01.js";
import { Level02 } from "./levels/Level02.js";

const game = new Game();

game.registerLevel("level01", () => new Level01());
game.registerLevel("level02", () => new Level02());
// 2A / 3A: register yours here the same way once they exist
// game.registerLevel('level02', () => new Level02());
// game.registerLevel('level03', () => new Level03());

game.onLevelChanged = (name) => console.log("[game] level:", name);
game.onPaused = (v) => console.log("[game]", v ? "paused" : "resumed");

await game.setLevel("level01");
game.start();

// handy while developing — open the console and poke at it
window.game = game;
