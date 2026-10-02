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
