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

If something breaks after pulling new changes from the team, try running `npm install` again first — someone may have added something new.

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

**Why:** our game won't live at the very top of the website — it'll be inside a folder (something like `.../motshekhene-group/`). A path starting with `/` skips past that folder and points to the wrong place. It works fine on your own laptop while testing, then breaks the moment it's uploaded to the real server — so this is easy to miss until it's too late. Anyone loading a model, texture, or sound will personally hit this rule, not just one person.

### 2. Filenames: lowercase, no spaces

Use `rock-texture.png`, not `Rock Texture.PNG`. The real server is case-sensitive (Windows/Mac aren't, so this bug hides during development and only appears once hosted).

### 3. Commit and push often

Small changes are fine — don't sit on big, unpushed changes for days.

### 4. When in doubt, ask before pushing to `main`

If you're not sure whether something will break the project for everyone, check with the group first.

## Questions?

Ask in the group chat, or ask the PM (Junior),  don't sit stuck for too long.