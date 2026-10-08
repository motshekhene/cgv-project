# Level 1B — Jungle Shrine implementation

This branch turns Level 1 from the old subway dressing into **The Trail**, the Jungle Shrine version, while keeping Member 1A's runner/controller logic intact.

## What 1B now owns in Level 1

- Jungle trail world using the repository's existing `assets/jungle/` models.
- PBR mud and forest-floor materials using colour + normal + roughness maps.
- Morning mist (`FogExp2`), warm directional sun, hemisphere fill and dynamic shadows.
- Recycled 30 m scenery chunks with trees, bushes, grass and ruin markers.
- Actual Jungle Shrine props: fallen logs, rocks/columns, arches, ruins, statues, crates and logging-camp props.
- `SITE 7 ->` diegetic signs.
- Custom speed-warp shader (`src/shaders/jungleSpeedWarpShader.js`).
- Additive light-shaft shader + pollen particles.
- Handler torch/spotlight so he first reads as a beam in the fog.
- Ruined gate version of Interlude I.
- Logging-camp handoff area at the end of the run.
- Procedural jungle ambience, dirt footsteps, impacts, gate slam and Handler breathing, so the level has audio even though the asset bundle does not contain sound files.

## Files added / changed

- `src/levels/Level01.js`
- `src/levels/level1/jungleWorld.js`
- `src/shaders/jungleSpeedWarpShader.js`
- `src/core/AssetRegistry.js` — adds FBX support
- `vite.config.js` — copies the runtime `assets/` folder into `dist/assets/` on production build
- `assets/jungle/**` — selected theme models/textures from the repository theme bundle
- `assets/characters/**` — shared character models already defined by the project theme branch

## What was deliberately not taken from 1A

The following are still the existing shared/controller logic in `Level01.js`: lane switching, jump, slide, boost/stamina, distance tracking, look-back camera, Handler gap logic, collision penalty, restart flow and Level 2 handoff.

The internal obstacle names `barrier`, `trolley` and `duct` were left in place to avoid breaking 1A's collision code. Their visuals are now:

- `barrier` -> fallen log (jump)
- `trolley` -> boulder + broken column (change lane)
- `duct` -> low ruin arch (slide)

The old subway train is disabled in the Jungle Shrine version because it no longer matches the selected world/theme guide.

## Run it

From the project folder:

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

The Vite configuration copies `assets/` into `dist/assets/`, because the game loads models/textures through relative runtime URLs.

## Important merge note

Do not replace 1A's controller with a separate runner implementation. Merge this work around the shared `Level01` interface and test after pulling the latest `main` branch.

## V2 traversal pass (2 October 2026)

This pass responds to playtest feedback from the Level 1B branch:

- Fixed the visible scenery "restart" by changing the jungle chunk streamer to a ring buffer. Only scenery that is safely behind Kai is recycled to the far end; the whole forest no longer jumps every 30 m.
- Increased the scenery pool from 9 to 12 unique chunks so repeated tree layouts are farther apart.
- Added three real elevation sequences to the Level 1 route. Kai now climbs ruined shrine causeways, crests high sections and descends again; the camera, Handler and obstacle visuals follow the same course height.
- Added mossy PBR textures to the raised shrine causeway.
- Increased obstacle density and visual variety: logs, boulder/column debris, crates, barrels, bear traps, broken shrine walls and slide-under arches.
- Added four scripted falling-tree set pieces. Each tree starts upright beside the trail, begins to fall while Kai approaches, lands across the route and becomes a jumpable obstacle.
- Added procedural tree-creak and impact audio for those events.
- Added a CAUGHT overlay when the Handler reaches Kai, with RESTART LEVEL and RELOAD GAME controls. The existing R-to-restart control still works.

### Files changed from the previous Jungle Shrine patch

- `src/levels/Level01.js`
- `src/levels/level1/jungleWorld.js`
- `LEVEL1B_JUNGLE_SHRINE.md`

No changes were made to Level 2 or Level 3 in this pass.
