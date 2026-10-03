# Blackout Protocol: Jungle Shrine implementation guide

The team picked **Jungle Shrine**. All three levels now happen in one jungle, building up to the shrine at **Site 7**. The game structure from the pitch stays the same (RUN → DRIVE → FIGHT, the Key, the Handler, letters, the helmet reveal). Only the places change.

- **Assets:** everything is in [`assets/jungle/`](../assets/jungle/README.md), which has the index, scale factors and material notes.
- **Visual target:** [`docs/concepts/blackout-worlds.html`](concepts/blackout-worlds.html), World A.
- **Working reference code:** `tools/concepts/worlds.js` (`shrineRun`, `shrineDrive`) and `tools/concepts/themes.js` (`shrine`) build those exact images. Copy the lighting, fog and placement numbers from there. Don't import from `tools/`, because it loads from `_source/`.

---

## 1. The story, one line per beat

| Beat | Where | What happens | On screen |
|---|---|---|---|
| **Prologue** | Concrete data centre at the jungle's edge, 01:48 | Kai copies the BLACKOUT key. The door at the end of the hall opens. | Short scripted camera, no controls |
| **L1 · RUN, "The Trail"** | Dirt trail through jungle ruins, morning mist | He's 15 m behind and never slows. Mistakes cost distance. | Runner HUD: distance, letters |
| **Interlude I, "The Gate"** | Ruined stone archway | Kai slides under the arch as it collapses. The Handler is blocked, then starts climbing. | Card: *"You escaped the trail… but he's still coming."* |
| **L2 · DRIVE, "The River Road"** | Logging camp, then a mud road beside the river, from sunset into night and rain | Kai takes a jeep. The Handler's SUV rams him and drones attack. Mistakes cost damage. | Car integrity, boost heat, rear-view, minimap |
| **Interlude II, "The Fall"** | The gorge bridge (`bridge.glb`) | Rammed through the rail into the river. The current carries him over the falls into the pool at Site 7. | Card: *"You got off the road. Now there's only the river."* |
| **L3 · FIGHT, "Site 7"** | Shrine courtyard by the waterfall, golden hour | Three-phase boss fight. The helmet comes off in phase II. The uplink is behind the shrine gate. | FightHUD (already built) |
| **Epilogue, "Eleven more"** | Same courtyard | The upload finishes and the Handler's phone shows 11 more keys. | Text and phone UI |

**What ties it together:** every level has a sign pointing to **SITE 7** (trail arrows → "SITE 7 · 12 km" road sign → laminated sign on the shrine gate). The Key glows cyan in Kai's hand in every level. The Handler goes from a torch beam (L1) to headlights (L2) to a face (L3).

### Letters (three per level, nine total)
| Level | Letters |
|---|---|
| L1 | "They told you that rack was decommissioned. It was signed for on Tuesday." · "Twelve names on the manifest. Yours is the only one still breathing." · "He isn't chasing the drive. He's chasing you." |
| L2 | "Your contact never left the building." · "You were selected six months ago. The job was the interview." · "The shrine isn't a hiding place. It's an address." |
| L3 | "You were meant to find it." · "He wrote your recruitment letter. Compare the handwriting." · "Eleven more keys. Eleven more of you." |

Collecting all nine unlocks the true ending. Store them in `state.letters` (ids `l1-1` … `l3-3`). `GameState` already keeps letters across levels.

---

## 2. Code layout to add

This is where new code should go so the three pairs don't collide. Level 3 has built the shared pieces already: `jungle/props.js` (`loadProp`, `place`, `scatter`, `pbr`, `sign`), `jungle/palette.js`, `jungle/sky.js`, and the `waterfall.js`, `water.js` and `lightshaft.js` shaders. L1 and L2 should reuse them rather than write their own.

```
src/
├── levels/
│   ├── jungle/                  shared by all three levels (one owner: Graphics & Shaders)
│   │   ├── props.js             loadProp(path, tints), toStandard(), scatter(), leaf/bark fix
│   │   ├── palette.js           fog, sky and light colours per level (numbers below)
│   │   └── sky.js               gradient sky dome + sun glow (port from tools/concepts/scene.js `sky()`)
│   ├── Level01.js               keep lane / jump / slide logic, replace the placeholder tunnel
│   ├── level1/
│   │   ├── TrailChunks.js       chunk streamer + jungle chunk prefabs
│   │   ├── Obstacles.js         logs, arches, bear traps, rocks
│   │   └── Pursuer.js           Handler on foot (gain / close states)
│   ├── Level02.js               keep VehicleController + HandlerAI, replace the placeholder road
│   ├── level2/
│   │   ├── RiverRoad.js         mud-road chunks + river strip + logging camp start
│   │   └── (VehicleController.js, HandlerAI.js, unchanged except the mesh swap)
│   ├── Level03.js               replace _buildArena() and _buildLights() only
│   └── level3/                  (CombatController, Fighter, HandlerBoss, unchanged)
├── shaders/
│   ├── speedwarp.js   L1        ├── water.js     L2 river + L3 pool
│   ├── lightshaft.js  L1 + L3   ├── rain.js      L2
│   └── waterfall.js   L3 (replaces lava.js)
└── ui/                          RunnerHUD.js (L1), DriveHUD.js (L2), FightHUD.js (L3, exists)
```

`props.js` is the one shared helper everyone needs first. A working version of the same logic is `toStandard()` and `place()` in `tools/concepts/scene.js`. Move it over, and switch it to `assets.fbx()` / `assets.model()` with `assets/jungle/...` paths.

Every level must keep the **Level contract** (`src/core/Level.js`): put everything inside `this.root`, and write only the shared `GameState` field names (`health`, `stamina`, `boostHeat`, `distance`, `letters`, `handlerState`, `handlerHelmetOff`).

---

## 3. Prologue, the data centre (owner: 3B, story/UI)

- **Build:** a 8 × 40 m corridor of box "racks" with an LED canvas texture on the front, `concrete-*` floor, and a door at the far end. The working version is `prologue()` in `tools/concepts/story.js`.
- **Camera:** scripted dolly behind Kai, about 6 s, then the cut to L1. Skippable with Space.
- **Jungle link:** through the door at the end of the hall, the jungle is visible. That's where L1 starts.

---

## 4. Level 1 · RUN, "The Trail" (owners: 1A controller/camera, 1B world/shader)

**Keep from `Level01.js`:** `LANE_X = [-2.4, 0, 2.4]`, lane switching, jump, slide, `state.distance`.
**Replace:** the placeholder floor, walls and fog.

### World
| Element | Asset | Notes |
|---|---|---|
| Trail surface (3 lanes, ~7.5 m wide) | `textures/mud-*`, tint 0xc8a27a | Strip under the lanes, repeat about 3 m |
| Ground either side | `textures/forest-floor-*`, tint 0x9fb07a | Big plane under everything |
| Canopy walls | `nature/tree-1..4` (×0.024–0.036), `ruins/tree-1..3` | 5–45 m either side, no shadows past 20 m |
| Path edges | `nature/bush-*`, `ruins/bush-large`, `nature/grass-*` | Instanced |
| Ruin markers | `ruins/column-round`, `column-round-short` (×0.016), `wall-overgrown`, `statue-stag` | Every ~11 m, alternating sides |

**Chunk streamer:** 30 m chunks, keep 6 ahead and 2 behind, and recycle from a pool. Make 4 to 6 chunk prefabs (plain trail, ruin corridor, stream crossing, arch gate, clearing with a statue).

### Obstacles → controls
| Obstacle | Asset | Player must |
|---|---|---|
| Fallen log across a lane | `props/logs.gltf` ×4, rotated 90° | **Jump** |
| Low ruined arch | `ruins/arch-round.fbx` ×0.016, lowered so the gap is 1.1 m | **Slide** |
| Broken column / boulder | `ruins/column-round-short`, `nature/rock-*` ×0.01 | **Change lane** |
| Bear trap | `ruins/bear-trap-open.fbx` ×0.016 | Change lane or jump |
| Stream (the whole width) | `water.js` strip + `ruins/bridge-section` stepping stones | Jump on the beat |

A hit costs 3 m of the gap. At 0 m, the Handler catches Kai (fail state).

### Pursuer
Use the Handler model from `assets/characters/handler.fbx` with the `run` clip (same rig as `Fighter.js`), placed `gap` metres behind. He has a **torch spotlight** pointing forward, so in mist he reads as a beam of light first and a man second. He has two states: `GAIN` (slowly closes in when Kai is clean) and `CLOSE` (jumps forward after a hit).

### Look (copy from `tools/concepts/worlds.js → shrineRun`)
- Fog `FogExp2(0xcfd6a8, 0.014)`. Sun `0xffd29a`, intensity 4.5, from behind the trail (`(-0.35, 0.55, -0.75)`). Hemisphere light `0xbfdcff / 0x4a5a26`, 0.6.
- **Shaders:** `lightshaft.js` (additive god-ray cones through the canopy, driven by time) and `speedwarp.js` (screen-edge radial stretch, driven by a `uSpeed` uniform). Pollen as `Points`.
- **Signs:** wooden "SITE 7 →" arrows (canvas-texture planes, see `sign()` in `tools/concepts/scene.js`).

### Interlude I, "The Gate"
The last 15 s are scripted. Kai slides under a huge `ruins/doors-round-arch` / `arch-round` gate (×0.024) while it drops. Cut to slow-mo, then the gate slams. The Handler reaches the bars one beat late. Show the card, then pull the camera back as he starts climbing. Call `game.setLevel('level02')` on Space.

---

## 5. Level 2 · DRIVE, "The River Road" (owners: 2A car/AI, 2B world/cameras/shader)

**Keep:** `VehicleController.js`, `HandlerAI.js` and the input mapping in `Level02.js`.
**Replace:** the placeholder road, stripes and rails.
**Swap later:** box car meshes → `vehicles/jeep.glb` / `suv.glb` once sourced (see the asset README). Keep the colours: Kai's car cyan-blue `0x35c9ff`, the Handler's SUV dark red `0x5a1410`.

### World
| Element | Asset | Notes |
|---|---|---|
| Logging camp (the start) | `props/logs`, `crate-stack-*`, `barrel`, `tree-cluster-cut` | Kai takes the jeep here, so the first 100 m is a clearing |
| Mud road, 2 lanes, ~8 m | `textures/mud-*`, tint 0x8a6a4a, roughness 0.7 | 40 m chunks, same streamer as L1 (longer chunks) |
| River (left side) | `water.js` plane, 22 m wide, 0.3 m below the road | Riverbank from `mossy-rock-*` + `nature/rock-*` |
| Jungle (right side and across the river) | `nature/tree-1..4`, `bush-*`, `grass-*` | Same scatter helper as L1 |
| Signs | "SITE 7 · 12 km" brown road sign | Then "8 km", "4 km": a progress board in the world |

### Threats (from the pitch, all inside `HandlerAI.js`)
Ram · PIT manoeuvre · tyre shots · drones · fallen logs across the road (`props/logs`) · river-ford sections.

### Look (copy from `worlds.js → shrineDrive`)
- Starts at sunset: fog `0xd8cfa0` 0.009, sun `0xffcf94` low from the front left. The **dynamic sky** shifts to night over the level and rain starts at about 60%.
- **Shaders:** `water.js` (river: scrolling normals + fresnel), `rain.js` (line streaks plus wet-road roughness drop), mud-splash particles behind the wheels.
- **Cameras:** chase cam, rear-view picture-in-picture, and an orthographic minimap. The working version is `highwayPlay()` in `tools/concepts/story.js` (scissor viewports).

### Interlude II, "The Fall"
The road climbs onto **`props/bridge.glb`** (×1–1.5) across a gorge (`cliff-rock-*` walls, river 40 m below). The Handler's last ram connects. The car goes through the rail; cut to black on the splash. Then a quick shot of the river current, the falls, and the pool at Site 7. Call `game.setLevel('level03')`.

---

## 6. Level 3 · FIGHT, "Site 7" (owners: 3A combat, 3B world/UI)

**Keep, unchanged:** `CombatController.js`, `HandlerBoss.js`, `Fighter.js`, `FightHUD.js`, `TouchControls.js`, combat camera, phases, helmet reveal.
**Replace in `Level03.js`:** `_buildArena()` and `_buildLights()` only, plus the lava shader. Full rationale is in [`LEVEL3_THEME_REDESIGN.md`](LEVEL3_THEME_REDESIGN.md), Option A.

> **Status: built.** The world is `level3/ShrineArena.js`, the letters are `level3/Letters.js`, the cutscene overlay is `ui/StoryOverlay.js`, and `Level03.js` runs the beats (intro → fight → reveal → dusk → epilogue). Where it differs from the plan below:
> - **No stairs at the gate.** `ruins/stairs` rises to a 2.3 m block under the arch and seals it, so a paved path runs from the courtyard, under the arch, to the pool instead.
> - **No stage spotlight, torch point lights or HDRI environment.** On an Intel UHD 620 at 720p, each light costs every pixel even at intensity 0. The torches are emissive flames, and the hemisphere and fill lights carry the fighters. That took it from 15 to ~38 fps. The FBX packs also come in with ~200 material groups per mesh, so `props.js` merges them, and the jungle is instanced.
> - **Phase III dusk** swings the sun west, so the columns throw long shadows across the court instead of the gate wall blacking it out.
> - **Letters:** `l3-1` sits in the courtyard from the start, `l3-2` falls out of the Handler's coat at the reveal, and `l3-3` appears on the path at dusk. They're still collected into `state.letters`; nothing in L3 reads the total any more.
> - **Restarts (R)** skip the intro. Space, Enter or a click skips any cutscene.
> - **The jungle is playable.** Kai can leave the courtyard (up to 34 m out) and the Handler follows. Trees, statues, walls and cliff rocks are solid, and anything blocking the camera shrinks out of the way. Three shrines (`level3/Awards.js`) each give one gift, stored in `state.awards`, so a gift survives restarts and is never given twice. **Vitality** adds 40 max health and lengthens the life bar. **Strategy** calls out the Handler's next attack and widens the parry window ×1.5. **Power** makes hits do ×1.4 damage, with sparks and glowing fists.
> - **Victory is plain.** When the Handler falls, the camera circles him for a few seconds, then a VICTORY card says "You won. The Handler is down." with PLAY AGAIN and the credits. The upload and phone epilogue ("11 other keys") was cut, so there's no story text after the win.
> - **UI theme** is in `ui/theme.js`: stone plaques, gold trim and a serif for titles, shared by the HUD, story overlay and touch controls. The end screens (DEFEATED, VICTORY) have clickable TRY AGAIN / PLAY AGAIN buttons, so touch players can restart without an R key.

### Arena (radius ~13 m, same footprint as now, so combat camera maths doesn't change)
| Element | Asset | Placement (from `themes.js → shrine`) |
|---|---|---|
| Courtyard floor | `ruins/floor-standard`, `floor-squares` ×0.016 | 3.2 m tiles, disc of r ≈ 12.4 m, a few missing or heaved near the edge |
| Column ring | `ruins/column-round` ×0.0176, every 3rd one `column-round-short` | 12 columns at r = 13.6 |
| Shrine gate | `ruins/arch-round-round-column` ×0.0256 at z = −17, `wall-arch-round-overgrown(-broken)` and `wall-overgrown` either side | The uplink is behind it. Laminated "SITE 7 · NO ENTRY" sign + junction box with a cyan LED. |
| Guardians | `statue-stag` ×0.0136, `statue-fox` ×0.0176 | Either side of the gate |
| Steps | `ruins/stairs` ×0.0256, rotated 180° | In front of the gate |
| Waterfall cliff | `nature/rock-1/2` ×0.1–0.16 | Behind the gate, z ≈ −40 |
| Waterfall + pool | `waterfall.js` plane 7 × 19 m; `water.js` disc r = 11 | Pool is where Kai wakes up (the opening shot of L3) |
| Jungle ring | `nature/tree-*`, `bush-*`, `grass-*` | r 14–60 m, keep the waterfall sightline clear |
| Dressing | `ruins/pot-*`, `torch` | Torches on in phase III (dusk) |

### Lights (replace the four lava point lights)
Warm sun `0xffcf94`, intensity about 5, from behind the gate (`(-0.62, 0.62, -0.45)`). Hemisphere light `0xbfdcff / 0x4a5a26`, 0.55. Cool fill `0x9fc0ff`, 0.45. Fog `FogExp2(0xd9d2a8, 0.0068)`. Plus 3–4 `lightshaft.js` cones and pollen. Keep the existing stage spotlight so the fighters stay readable.

### Shader swap
`src/shaders/lava.js` → `src/shaders/waterfall.js`. Use the same `uTime` pattern: an fbm noise streak scrolling down, foam where the streaks peak, and a soft edge mask. A working version is `waterfall()` in `tools/concepts/themes.js`. **Phase III:** speed up `uTime` and tint the pool red. The arena "fights back" with spray instead of lava.

### Opening and ending
- **Opening:** Kai wakes in the pool (`sitting` clip, about 1.4 s in), stands up, and walks to the courtyard while the Handler drops in from the gate. The working framing is `shrine:wake` in `tools/concepts/scene.js`.
- **Reveal (phase II):** keep `HandlerBoss._popHelmet()`. A reaction shot over Kai's shoulder with a 30° FOV reads well (`themeShot('reveal')` in `scene.js`).
- **Epilogue:** an upload bar on the junction box, then a phone UI overlay saying "11 other keys".

---

## 7. Rubric coverage

| Criterion | Where it's earned |
|---|---|
| Shaders | `speedwarp` (L1), `lightshaft` (L1/L3), `water` (L2/L3), `rain` (L2), `waterfall` (L3); all time- or state-driven |
| 3D effects | Dynamic sky (L2), headlight shadows, wet-road roughness, normal maps on every ground set, fog, bloom |
| Viewing | Chase cam (L1), look-back, rear-view PiP + ortho minimap (L2), lock-on combat cam (L3), two scripted interludes |
| Gameplay | Verb shift run → drive → fight, nine letters + true ending, signs as story |
| Polish | One palette per level (misty green → sunset/rain → golden), restart without reload (Level contract) |

---

## 8. Build order

1. **`src/levels/jungle/props.js`** (loader, material fix, scatter), so everyone can place jungle assets the same way.
2. **L3 arena swap.** The smallest change, and it proves the props helper against the real combat code.
3. **L1 chunks + obstacles**, then the pursuer, then the Interlude I script.
4. **L2 road chunks + river**, then the dynamic sky and rain, then Interlude II.
5. **Prologue, epilogue, letters, signs.**
6. **Vehicle models** (when sourced) and audio.

If time runs short, cut in this order: drones (L2) → rain (L2, keep wet roughness) → stream-crossing chunk (L1) → torches in phase III. **Never cut:** all three levels playable from the hosted URL, one custom shader per level, restart without reload, credits.
