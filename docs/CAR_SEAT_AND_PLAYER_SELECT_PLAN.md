# Plan: the head through the car roof, and choosing your player

Two jobs, in this order:

1. **Bug.** At the end of Level 1, just before Level 2, Kai gets into the car and his head stays outside, poking up through the roof.
2. **Feature.** The player picks who they play as, and every player has their own name, shown everywhere the game now says "Kai".

Both parts are **done**: part 1 in [What was changed](#what-was-changed), part 2 in [What was built](#what-was-built). Two of the five downloaded characters still need downloading again (see [Still to do](#still-to-do)).

---

## 1. Bug: his head stays outside when he gets into the car

### Where it happens

The Level 1 finish scene ([`Level01._startFinale`](../src/levels/Level01.js#L3689) and [`_updateFinale`](../src/levels/Level01.js#L3817)). Kai opens the bay car's door, sits down, the door shuts and the ESCAPED card orbits the car. In most cars his head is through the roof in the "door" shot and in the orbit.

### What we measured

We loaded each car the way `attachModel` does, put Kai's `sitting` clip where the finale puts him, and cast rays straight down onto the roof above his head. Kai's seated head top is 1.35 m above his feet and 0.16 m forward of them. His hips are at 0.53 m.

| Car (`id`) | Roof over his head | Top of his head | Result |
|---|---|---|---|
| Executive (`executive`, default) | none, it's a convertible | 1.30 | head shows above the windscreen, **by design** |
| Drifter (`drifter`) | 1.25 | 1.26 | touching: his hair comes through |
| Muscle (`muscle`) | 1.28 | 1.45 | **0.18 m through** |
| Street Racer (`street-racer`) | 1.15 | 1.30 | **0.15 m through** |
| Supercar (`supercar`) | 0.86 | 1.10 | **0.25 m through** |
| Bruiser (`bruiser`) | 1.89 | 1.84 | clear by 5 cm |

### Why

[`Level01.js:3716`](../src/levels/Level01.js#L3716):

```js
local.seat.y = Math.min(local.seat.y + 0.09 - SIT_HIPS, max.y - 0.06 - SIT_HEAD);
```

This treats `max.y`, the top of the car's bounding box, as the roof above his head. It is wrong in three ways:

- **Roofs slope.** Above the driver the roof is lower than the car's highest point. On the Supercar the car's highest point is 1.15 m, but the roof over his head is 0.86 m. On the Street Racer it is 1.35 m against 1.15 m.
- **The Muscle has stray geometry.** Its `Cylinder` mesh makes `max.y` 2.23 m, so the limit never applies.
- **He sits too close to the door.** The default seat is 0.44 m in from the side ([`carDoor.js` `seatLocal`](../src/levels/level1/carDoor.js)), where the roof curves down toward the door. About 0.6 m in, the roof is 0.1 to 0.2 m higher:

  | In from the side (m) | 0.4 | 0.5 | 0.6 | 0.7 |
  |---|---|---|---|---|
  | Drifter roof | 1.26 | 1.27 | 1.27 | 1.28 |
  | Muscle roof | 1.30 | 1.30 | 1.30 | 1.30 |
  | Street Racer roof | 1.23 | 1.30 | 1.31 | 1.32 |
  | Supercar roof | 0.91 | 1.04 | 1.12 | 1.13 |

### What was changed

1. **The roof is measured, not assumed.** [`CarDoor.roofOver`](../src/levels/level1/carDoor.js) casts rays straight down onto the car at his head's position and a 9 cm ring around it, and keeps the lowest surface above his chin. The rays come **from above** because the car meshes are one-sided: a ray cast upward from inside the cabin passes straight out through the roof.
2. **He sits where there's room.** [`CarDoor.fit`](../src/levels/level1/carDoor.js) puts him on the cushion unless the roof over his head is lower than that allows (5 cm headroom). In that case he sits lower, but never with his hips below the door sill. The stand-in cabin's cushion, seat back and steering wheel move down with him, and so does its floor.
3. **His size comes from his own animation.** [`Fighter.highest`](../src/levels/level3/Fighter.js) plays a clip on its own and finds a bone's highest point. [`Level01._buildKai`](../src/levels/Level01.js) uses it on the `sitting` clip to measure the top of his head (1.35 m) and his hips (0.53 m). The old `SIT_HIPS` and `SIT_HEAD` constants are only a fallback now. Any player model in part 2 gets measured the same way, with no new JSON fields.
4. **It's done ahead of time.** The rays cost up to about 60 ms on the Supercar, so [`_fitBaySeat`](../src/levels/Level01.js) runs once both Kai and the bay car have loaded, not when the finale starts.
5. **Two cars needed their door specs fixed** in [`carSelect.js`](../src/levels/level2/carSelect.js):
   - **Street Racer:** `seat.x` 0.6 (out from under where the roof slopes down), and a door cut `depth` of 0.45 instead of 0.32.
   - **Supercar:** `seat.x` 0.7, and a door cut `depth` of 0.5 instead of 0.35.

   On both cars the side window leans inward as it rises (to 0.42 m and 0.54 m in from the side at the top). The old cut was too shallow, so when the door opened, a strip of window stayed hanging over the doorway and his head went through it as he swung in.

6. **A crash with the Street Racer, found while testing.** Cutting its door threw `TypeError: Converting circular structure to JSON`, so with that car selected the finish scene never started and the player was stuck at the end of Level 1. `Material.clone()` deep-copies `userData` through JSON, and `paint.js` keeps the mesh itself in `userData.paintOwner`, which points back at the material. [`ownMaterial`](../src/levels/level1/carDoor.js) now leaves `userData` out of the copy; it was being replaced with the shared original right after anyway.

Leaning him back in the Supercar, as first planned, turned out not to help: his seated pose leans forward, so bending his waist back only straightens him up. The longer and deeper ducks tested while getting in didn't fix it either; the door depth did.

**Result**, checked on the real models through the whole animation:

| Car | Seated: head under the roof by | Getting in: worst |
|---|---|---|
| Executive | open top (unchanged) | clear |
| Drifter | 5 cm (was 0) | clear |
| Muscle | 5 cm (was 18 cm through) | touching, as before |
| Street Racer | 5 cm (was 15 cm through) | 1 cm, hair only (was 12 cm through) |
| Supercar | 5 cm (was 25 cm through) | 1 cm, hair only (was 19 cm through) |
| Bruiser | 5 cm (unchanged) | 1 cm, as before |

> **The Executive is the default car and has no roof.** His head showing above the windscreen there is correct. If the bug was reported on the Executive, ask what exactly looked wrong. If he should sit lower, lower that car's `seat.y`.

### Testing

- **The car:** the finish scene is always the Bruiser now (`ESCAPE_CAR` in [`carSelect.js`](../src/levels/level2/carSelect.js)), whatever car was driven in Level 2. The other cars' seats were fitted as above, but the bay no longer shows them. To try one there again, set `ESCAPE_CAR` to its index for the test.
- **Get to the bay quickly:** open `/?level=level01`, wait for the run to start, then in the console run `game.level.z = -4455.5`. The finale starts on the next frame.
- **Watch** the "door" shot (him getting in) and the orbit under the ESCAPED card, where the car is seen from every side.

---

## 2. Feature: choose your player, each with their own name

### What was built

**Four players.** Each is a Mixamo character with all of Kai's moves:

| Name | Character | Pronouns | Height | Files in `assets/characters/` |
|---|---|---|---|---|
| Kai | Mixamo "Bryce" | he | 1.8 m | `kai-bryce` (unchanged) |
| Naledi | Mixamo Ch22 (white tee, jeans) | she | 1.8 m | `naledi-ch22` |
| Bheki | Mixamo Ch10 (the zombie) | he | 1.8 m | `bheki-ch10` |
| Toko | Mixamo Ch19 (the blue goblin) | he | 1.35 m | `toko-ch19` |

Names, the one-line descriptions, pronouns and heights are all in [`src/player/roster.js`](../src/player/roster.js) and can be changed there. Toko is shorter because the goblin's short legs and big head put Toko's head through every car roof at 1.8 m.

**Building a player without Blender: [`tools/build-player.html`](../tools/build-player.html).** Run `npm run dev`, open `/tools/build-player.html`, pick a Mixamo FBX (with skin, T-pose) and give it a file name. It saves a `.glb` and a `.json`; put both in `assets/characters/`, then add a row to `PLAYERS` in `roster.js`. No animation downloads are needed:

- The tool gives the character every one of Kai's clips, retargeted bone by bone from `kai-bryce.glb`. All Mixamo skeletons have the same bones; only the name prefix differs.
- Each bone is first lined up with Kai's. A character built differently, like the goblin, still strikes the same poses.
- The hips' up-and-down movement is scaled by the character's own hip height, so a shorter character sits and crouches by its own leg length.
- Textures are cut down to 1024 px WebP. Each player comes out at 3–5 MB, about the size of Kai's.
- The `.json` is Kai's: the moves keep his timing, so the fight's hit windows line up. It gets the character's own height.

The method is explained at the top of [`tools/build-player.js`](../tools/build-player.js).

**Choosing.** A **PLAYER** item on the title menu, under CHAPTERS. It shows the chosen name and opens a list of the players with their lines. As you move through the list, the selected player stands at the stone in the title glade, turned to the camera, and the camera holds still. Enter keeps the choice: it's saved in `localStorage` (`blackout.player`) and used from the next NEW GAME or chapter. Esc or BACK leaves the choice as it was.

**Loading.** `loadCast` ([`cast.js`](../src/intros/cast.js)), which serves the prologue, Level 1, the epilogue and the title, and Level 3 both load `loadPlayer(assets)` from the roster. If a model is missing, the old Kai FBX stands in, as before.

**Names on screen.** Every on-screen "Kai" now goes through `say()` in `roster.js`, which fills in `{name}`, `{NAME}`, `{he}`, `{him}`, `{his}` (and the capitalised forms) and `{boy}`. It runs when the text is shown, not when the file loads, because the choice can change on the title screen. Changed:

- the prologue's speaker label and "{name}. You came."
- Level 1's name plaque and its five lose messages
- the name plaques on the Level 2 and Level 3 HUDs
- Level 3's speaker label, Baba Zwane's lines that name the player or call them "{boy}", the pause tip, THE FALLS card and the VICTORY line

The player's speaker colour is now keyed by role (`SPEAKERS.PLAYER` in [`dialogue.js`](../src/ui/dialogue.js)), not by the name. Code names such as `this.kai` and `makeKai` are unchanged.

**Tested in Chrome** for each new player:

- the PLAYER page
- every level loading the right model, with the right name and pronouns
- Level 1's finish scene in the Muscle, the Supercar and, for Toko, every car with a roof: getting in and sitting with the head under the roof
- every level loading with no errors
- `npx vite build`

### Still to do

- **Akai and Boss** (`new_characters/character (2).fbx` and `character.fbx`) are in the old FBX 6.1 format, which three.js can't read. Download them again from Mixamo with Format **FBX Binary (.fbx)**, Pose **T-pose**, then build them with the tool.
- **The source FBXs** in `new_characters/` total 230 MB. Don't commit them: keep them out of git, for example in `_source/`, which is already ignored.
- **Toko in the prologue.** At the fire, the shot over the player's shoulder is framed for Kai's head. Toko's large head fills more of it.
- **Play-throughs.** Each player has not yet been played through from the prologue to the epilogue, including the Level 3 fight.

---

## Order of work

| # | Task | Owner |
|---|---|---|
| 1 | Part 1: the player's head through the car roof | done |
| 2 | Roster, names, loading, PLAYER on the title menu | done |
| 3 | Build the players (tools/build-player.html) | done for three; Akai and Boss need FBX Binary downloads |
| 4 | Full play-through with every player and car | |

## Open questions for the team

- **Names and pronouns.** Naledi, Bheki and Toko are suggestions. Change them, and the lines and pronouns, in `roster.js`.
- **Which car was the head bug seen in?** If it was the Executive (the default), that car has no roof, so the head is meant to show.
- **When can the player change?** Only from the title menu. A pause-menu option would need the level to reload.
