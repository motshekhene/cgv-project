# Levels 1 & 2: intro and winning scenes

How Level 1 and Level 2 start, and how they end when the player wins, set in the Jungle Shrine world. All four scenes are built and run on their own (see [Running the scenes](#running-the-scenes)). Level 3 is at the bottom for reference, since it's already built.

Each level ends where the next one begins: the gate leads on toward the river road, and the river carries Kai over the waterfall into Site 7.

---

## Level 1 · RUN, "The Trail"

**Intro** (`npm run intro:l1`, about 10 s)
It's early morning. Kai bursts out of the data-centre door into the jungle with the Key glowing cyan in his hand. Mist hangs over a dirt trail lined with mossy ruins and a wooden "SITE 7 →" sign, and he starts running. The camera looks back down the trail, where a torch beam cuts through the mist. It's the Handler, coming out of the same door, and he starts running too. The title cards read "THE TRAIL" and "15 METRES", and control passes to the player with the Handler 15 m behind.

**Winning** (`npm run win:l1`, about 10 s, then the card)
Kai reaches a huge overgrown stone gate at the end of the trail, guarded by stag statues on either side. Its iron portcullis starts grinding down. In slow motion, Kai dives head-first under it and slides on his belly as the spikes come down behind him. The portcullis slams. The Handler arrives a second too late and crashes into the bars, and his torch shines through them onto Kai. Kai gets up and runs on toward the light, while the Handler starts climbing the bars. A card reads *"You escaped the trail… but he's still coming."* The win screen says **ESCAPED**, then Continue goes to Level 2.

---

## Level 2 · DRIVE, "The River Road"

**Intro** (`npm run intro:l2`, about 10 s)
It's sunset at a logging camp by the river, among stacked logs, crates, cut tree stumps and a dying campfire. Kai runs to a jeep and jumps in, and the headlights come on. He pulls onto the muddy road beside the river and passes a sign reading "SITE 7 · 12 km". Behind him in the trees, another pair of headlights switches on: the Handler, in a dark red SUV. The title cards read "THE RIVER ROAD" and "HEADLIGHTS", and the chase starts with the SUV 18 m behind.

**Winning** (`npm run win:l2`, about 13 s, then the card)
Kai survives the chase as night falls and rain starts. The road crosses an old stone viaduct high over a gorge. In the jeep's mirror, the SUV fills the glass. It rams the jeep one last time, and in slow motion Kai's jeep bursts through the parapet and falls into the river far below. The screen cuts to black on the splash. The current carries the Key, still glowing, downstream with the wreckage, then sweeps it over a waterfall into golden light. A card reads *"You got off the road. Now there's only the river."* The win screen says **SURVIVED**, then Continue goes to Level 3.

---

## Level 3 · FIGHT, "Site 7" (built, for reference)

**Intro**
Kai wakes in the pool below the waterfall, stands up and walks through the shrine gate into the courtyard. The Handler jumps down from the top of the arch behind him, and the fight starts.

**Winning**
The Handler falls. The camera slowly circles him, then the win screen says **VICTORY**.

---

## Running the scenes

| Command | Opens |
|---|---|
| `npm run intros` | A menu with all four scenes |
| `npm run intro:l1` | Level 1 intro, "The Trail" |
| `npm run win:l1` | Level 1 win, "The Gate" |
| `npm run intro:l2` | Level 2 intro, "The River Road" |
| `npm run win:l2` | Level 2 win, "The Fall" |

Each one starts the normal dev server and opens its page in `intros/`. If the server is already running, go to `http://localhost:5173/intros/` instead.

- **Space, Enter or a click** skips to the end. On a win card, it presses CONTINUE.
- **R** replays from the start. **Esc** pauses.
- **`?t=6.5`** starts 6.5 s in. **`?hold=7`** stops the clock at 7 s, so you can look at one frame. For example, `level1-win.html?t=2.4&hold=3` freezes the dive under the gate.

When an intro finishes, a panel offers a replay and the next scene. CONTINUE on a win card goes to the next scene, and Level 2's goes into Level 3.

---

## Using them in your level

Each scene is a `Level`, so it runs in the same `Game` as your level. Register it next to your level in `src/main.js`, and switch to it with `game.setLevel()`.

```js
import { TrailIntro } from './intros/level1/TrailIntro.js';
import { GateWin } from './intros/level1/GateWin.js';
import { CampIntro } from './intros/level2/CampIntro.js';
import { FallWin } from './intros/level2/FallWin.js';

game.registerLevel('level01-intro', () => new TrailIntro({ onDone: () => game.setLevel('level01') }));
game.registerLevel('level01-win', () => new GateWin({ stats: game.winStats, onContinue: () => game.setLevel('level02-intro') }));
game.registerLevel('level02-intro', () => new CampIntro({ onDone: () => game.setLevel('level02') }));
game.registerLevel('level02-win', () => new FallWin({ stats: game.winStats, onContinue: () => game.setLevel('level03') }));
```

When the player wins, save the numbers for the win card *before* switching, because `setLevel()` resets `GameState`:

```js
// Level01, when Kai reaches the gate
this.game.winStats = { distance: state.distance, closest: this.closestGap, letters: state.lettersInLevel('l1-') };
this.game.setLevel('level01-win');

// Level02, when the jeep reaches the bridge
this.game.winStats = { distance: this.roadDistance, integrity: state.health, rams: this.ramsSurvived, letters: state.lettersInLevel('l2-') };
this.game.setLevel('level02-win');
```

| Option | Scenes | What it does |
|---|---|---|
| `onDone()` | intros | Called once the intro has handed over (after the RUN / DRIVE popup) |
| `onContinue()` | win scenes | Called when the player presses CONTINUE |
| `stats` | win scenes | Numbers for the win card. L1: `distance`, `closest`, `letters`. L2: `distance` (m), `integrity` (%), `rams`, `letters`. Missing ones fall back to sample values. |
| `start`, `hold` | all | Same as `?t=` and `?hold=` |

Things to know when wiring them up:

- **Pass `'l1-'` to `lettersInLevel`, not `'level01'`.** Letter ids are `l1-1` … `l3-3`, so `lettersInLevel('level01')` always returns 0.
- **Space is jump in Level 1, and it also skips.** A player holding jump through the intro will skip it. The win card only accepts CONTINUE once its button has faded in, so mashing jump at the gate can't skip the card.
- **Where each intro leaves things.** Level 1 hands over with Kai running at 6 m/s, the Handler 15 m behind and the camera on the chase pivot `(0, 2.5, 7.4)`, the same one `Level01.js` uses. Level 2 hands over with the jeep on the road at 18 m/s, the SUV 18 m behind (`HandlerAI` also starts at 18 m) and the chase camera 8 m back and 4.2 m up. Your level rebuilds its own world after `onDone`, so start the player in the same state for a clean cut.
- **The cars are stand-ins.** There are no vehicle models yet, so `vehicles.js` builds a jeep and an SUV from primitives in the level's colours. When `jeep.glb` / `suv.glb` arrive, swap them in there and every scene picks them up.
- **New palette entries.** `TRAIL_MORNING`, `RIVER_SUNSET` and `RIVER_NIGHT` are now in `src/levels/jungle/palette.js`. Use them for your levels' lighting so the cutscenes and the gameplay match.

---

## Files

```
intros/                      the runnable pages (one per scene, plus index.html, the menu)
src/intros/
├── Cutscene.js              base class: timeline, shots, slow motion, eased camera, cards, fades, both endings
├── run.js                   runs one scene on its own page (loading bar, replay panel, ?t= / ?hold=)
├── cast.js                  Kai with the Key, the Handler with his helmet and torch (same rig and colours as Level 3)
├── vehicles.js              stand-in jeep and SUV, plus Route (drive a vehicle along a curve)
├── fx.js                    dust bursts, pollen, rain, flying debris (all functions of time, so seeking works)
├── world.js                 sky and lights from a palette entry, ground, jungle planting, light shafts, soft path strips
├── level1/trail.js          the trail set both Level 1 scenes share
├── level1/TrailIntro.js     Level 1 intro
├── level1/GateWin.js        Level 1 win
├── level2/CampIntro.js      Level 2 intro
└── level2/FallWin.js        Level 2 win
```

Everything uses the same pieces as Level 3: the Jungle Shrine assets through `jungle/props.js`, `Fighter.js` for the characters, `StoryOverlay` and `ui/theme.js` for the cards and win screens, and the `water`, `waterfall` and `lightshaft` shaders.
