# CGV Group Project

3D browser game for COMS3006A, built with Three.js.

## Getting started

Run these 3 commands, in order, the first time you set this up. This is the same shared repo link for everyone on the team as long as you've been added as a collaborator on GitHub, you can clone it directly, no one needs to send it to you individually.

```bash
git clone https://github.com/motshekhene/cgv-project.git
cd cgv-project
npm install
npm run dev
```

If something breaks after pulling new changes from the team, try running `npm install` again first,  someone may have added something new.

## Where things are

The team picked the **Jungle Shrine** theme. Start with [docs/JUNGLE_SHRINE_IMPLEMENTATION.md](docs/JUNGLE_SHRINE_IMPLEMENTATION.md).

```
assets/jungle/     every model and texture the game uses (index: assets/jungle/README.md)
assets/characters/ kai-bryce.glb, handler-monk.glb (+ .json), built by tools/build-character.py; kai.fbx, handler.fbx are the old fallbacks
public/assets/level2/  Level 2 cars, traffic and drone (served at ./assets/level2/)
src/               the game (core/, levels/, shaders/, ui/, intros/)
intros/            the Level 1 intro and the Level 1 → 2 drive-out on their own pages: npm run intro:l1 / intro:l2
docs/              pitch, plans, implementation guide, concept pages
tools/concepts/    the script that rendered the concept images (reference only)
```

Raw source packs (`.blend` files, 4K originals, zips) are **not** committed — `_source/` is in `.gitignore`. Keep them on the team's shared drive.

### Playing the game

`npm run dev` plays the whole thing in order:

```
level01-intro → level01 → level02-intro → level02 → level03
```

Level 1 ends with a short finish scene at the bay: Kai runs in to the car (the one you picked for Level 2, in its paint), looks back at the Handler hammering on the sealed gate, gets in and the headlights come on, then the ESCAPED card. `level02-intro` is the drive-out scene that follows: Kai takes the car out of the jungle onto the River Road, and Level 2 picks up with him already driving (no car picker; it's still on V / the CAR button, and a restart shows it).

Jump straight to any piece with `?level=`, e.g. `http://localhost:5173/?level=level03`. The intro skips with Space / Enter / click. The order is set in `src/main.js`.

## A few rules (please follow these)

### 1. File paths must start with `./`, never `/`

Anywhere you load a model, texture, sound, or other file, the path must start with `./` (or `../` if it's a folder up). Never start it with a plain `/`.

```js
// ❌ Wrong — will break once hosted
loader.load('/assets/models/spaceship.glb', ...);
const texture = textureLoader.load('/assets/textures/rock.jpg');
audioLoader.load('/assets/audio/music.mp3', ...);

// ✅ Correct
loader.load('./assets/models/spaceship.glb', ...);
const texture = textureLoader.load('./assets/textures/rock.jpg');
audioLoader.load('./assets/audio/music.mp3', ...);
```

Same rule in `index.html`:
```html
<!-- ❌ Wrong -->
<script type="module" src="/src/main.js"></script>

<!-- ✅ Correct -->
<script type="module" src="./src/main.js"></script>
```

**Why:** our game won't live at the very top of the website — it'll be inside a folder (something like `.../motshekhene-group/`). A path starting with `/` skips past that folder and points to the wrong place. It works fine on your own laptop while testing, then breaks the moment it's uploaded to the real server, so this is easy to miss until it's too late. Anyone loading a model, texture, or sound will personally hit this rule, not just one person.

### 2. Filenames: lowercase, no spaces

Use `rock-texture.png`, not `Rock Texture.PNG`. The real server is case-sensitive (Windows/Mac aren't, so this bug hides during development and only appears once hosted).

### 3. Models and textures

- Load them through `AssetRegistry` (`assets.model(...)`, `assets.fbx(...)`, `assets.texture(...)`), not your own loader, so they are cached and freed between levels.
- Shared models (Kai, the Handler, the jungle kit) live in `assets/characters/` and `assets/jungle/`. Reuse them rather than adding copies. For Kai or the Handler, use `loadRig(assets, 'kai-bryce', 'kai.fbx')` from `src/player/rig.js` (or `loadCast` / `makeKai` / `makeHandler` from `src/intros/cast.js`), so every level shows the same characters.
- A model only one level needs goes in that level's own folder, e.g. `public/assets/level2/`.
- Prefer `.glb`, keep textures at 2K or smaller, and note where it came from in a `CREDITS.md` next to it.

### 4. Win and defeat screens

Every level ends on the same card from `src/ui/theme.js`. If your level has no FightHUD or StoryOverlay to show it on, use `showEndCard({ kind: 'win' | 'lose', title, sub, lines, action })` from `src/ui/EndCard.js`.

### 5. Commit and push often to your individual branches as usual

Small changes are fine, don't sit on big, unpushed changes for days.

### 6. When in doubt, ask before pushing to `main`

If you're not sure whether something will break the project for everyone, check with the group first.

## Documentation

### API documentation

Our related Wits-Quest application (backend + frontend) has generated API documentation, deployed here:

- **API docs:** https://nkadimengkgothatso.github.io/-wits-quest/development/api-reference/ (quick-start version: https://nkadimengkgothatso.github.io/-wits-quest/development/api-quickstart/)
- **Docs source repo:** https://github.com/NkadimengKgothatso/-wits-quest (source on `main`, built site on `gh-pages`)

The docs cover the backend REST and socket API (`backend/src/`) — battle socket handling, matchmaking lobby, ELO/leaderboard services, authentication, and the offline queue. Every new backend feature ships with API tests (supertest) and every UI feature with React Testing Library tests, so the docs and the test suite stay in step.

### Performance

Performance targets and how to measure them (per-frame, on a mid-range laptop):

- **Frame rate:** the game must hold 60 FPS during normal driving and no less than 30 FPS with the police chase, traffic, and shadow-casting headlights all active. Measure with the browser DevTools Performance tab, or `renderer.info.render.calls` logged per frame.
- **Draw calls / triangles:** keep the scene under ~300 draw calls. Shared traffic models are cached in the `AssetRegistry` and cloned with `SkeletonUtils.clone`, so all 12 vehicles reuse one set of geometry/materials.
- **Memory:** nothing is created or destroyed while playing — vehicles, skid marks, and smoke use fixed pools recycled each frame. `Level.teardown()` / `AssetRegistry.dispose()` free GPU resources on level change; check for leaks with DevTools Memory heap snapshots before and after a 5-minute session.
- **Asset loading:** all models/textures/audio load once through `AssetRegistry` and are cached, so a second lap or a car swap never re-downloads. Verify on the Network tab (first load pulls assets; picking V → DRIVE again should not).
- **Test coverage as a quality gate:** CI reports coverage for the frontend and backend of our Wits-Quest application and fails below 60% (the rubric's advanced band), rising to 80% for the final submission. Run locally with `npm run test` in each of `frontend/` and `backend/`.

## Questions?

Ask in the group chat, or ask the PM (Junior),  don't sit stuck for too long.