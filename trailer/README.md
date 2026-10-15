# THE SILENT HORN: the trailer

An 89-second cinematic trailer. It is played live on the game's own levels in the browser, not
rendered ahead of time. The trailer has its own page and its own code (`src/trailer/`). It doesn't
change a single game file, and the game doesn't load any of it.

```
npm install
npm run trailer          # opens http://localhost:5173/trailer/
```

Click **PLAY TRAILER**. Browsers only allow sound after a click, so the page waits for that click.
**PLAY WITHOUT SOUND** starts it muted.

| Key | |
|---|---|
| Space | play / pause |
| M | sound on / off |
| S or Esc | skip to the title |
| R | replay (rebuilds the levels, so it plays exactly as the first time) |
| H | hide the controls |

URL options: `?t=42` starts 42 s in, `?hold=42` freezes on that frame, `?clean` shows no controls
and no end panel (for recording), `?autoplay`, `?muted`, `?music=<file>` (see "Music" below).

## The edit

| | Time | On | What you see | Words |
|---|---|---|---|---|
| 1 | 0:00 | the title glade | dawn through the canopy, the horn on its stone, a close look at it | EVERY LEGEND BEGINS SOMEWHERE. |
| 2 | 0:10 | the prologue | Baba Zwane across the fire, Kai listening, the walk up the path, his hand closing on the horn, and the forest going silent | SOME THINGS WERE NEVER MEANT TO BE DISTURBED. |
| 3 | 0:23 | Level 1 | the trail from above, the kudu bolting across, the tree coming down and the leap over it, the dark shrine with the Marshal's torch behind him, the bridge falling away | RUN. |
| 4 | 0:36 | the drive-out scene, then Level 2 | the headlights up the logging track, onto the River Road, the ranger's lights in the trees, low in the rain, alongside at speed, the company's roadblock, over the falls, the splash | THERE IS NOWHERE LEFT TO RUN. |
| 5 | 0:51 | Level 3 | Kai coming to in the pool among the wreck, the Marshal down the zip line and off the arch, the mask, the blow that knocks it off: Baba Zwane | BABA ZWANE…? / YOU WERE NEVER MEANT TO SEE THIS FACE AGAIN, KAI. |
| 6 | 1:04 | Level 3, Level 1 | dusk and the storm, the horn torn off Kai's hip, the forest's bolt, the killing blow slowed, the Shadow Stag rising, then rapid cuts: the stag, the horn's call on the trail, the charge, the lightning | IT ANSWERS TO WHOEVER HOLDS IT. |
| 7 | 1:18 | black, then the glade | THE SILENT HORN, the stone and its watcher, the forest's sound coming back | THE FOREST REMEMBERS. / ENTER THE WORLD. |

The dialogue lines are the game's own lines (Level 3's reveal and snatch conversations). There are
no release dates, platforms, ratings or logos.

## How it works

- **Stages** (`Stage.js`). Each level is built in its own scene with a stand-in for the `game`
  object: its own camera, its own input with no keyboard attached, and a renderer that draws
  without taking over the page. All six (title, prologue, Level 1, the drive-out scene, Level 2,
  Level 3) are built once, while the loading screen shows.
- **The director** (`Director.js`). A shot is a stretch of trailer time on one stage. It has an
  `enter` that puts the level where the shot needs it, an optional unseen `prep` run so the cut
  lands mid-action, an optional `rate` for slow motion, a `drive` that presses the level's own
  inputs, and a `camera`. The level keeps its own camera, and the trailer only borrows it to
  draw. A level runs only while its shots are on screen, so each one is a continuous take.
  `Math.random` is seeded, so the film is the same every time.
- **Who plays the levels.** In Level 1 an autopilot jumps, slides and changes lanes for Kai, and
  avoids the bridge gaps. In Level 2 an autopilot holds the throttle and picks a clear lane, using
  the obstacles' own `blockAt`. Level 3's story beats run as they do in the game, and the
  director moves the fight on by dealing the Marshal the blows the player would.
- **The camera** (`camera.js`). Easing curves, `between` (from one framing to another), handheld
  drift, jolts on hits, and orbit and chase helpers. The shots are in `seq/*.js`, and every shot,
  word and fade is listed in `edit.js`.
- **The overlay** (`Overlay.js`). One 2D canvas over the 3D: the 2.39:1 letterbox, fades and
  flashes, a vignette, light grain, and the words in the game's own serif (Crimson Pro) and its
  title gold.
- **The score** (`score.js`). Every note is synthesised with Web Audio: drones, pads, plucks,
  braams, taiko, risers, rain and thunder. It also uses the game's own sounds: Level 1's kudu horn
  and the shared cue palette (tree crash, bridge crack, guardian roar, splash...). The whole score
  is rendered offline into one buffer while the levels build. That buffer is the clock the picture
  follows, and the exporter writes the same buffer to the video. There is no recorded music, so
  there is nothing to license. The levels' own audio is held silent while the trailer plays.

Only what the game shows is used. The game furniture is hidden from the camera: coins,
life-savers, pickups, Level 3's torn pages and shrine markers, and the HUDs. Level 1's
unlit butterflies and its shrine runes are toned down, because they turned into white squares
under the trailer's lifted exposure. Those changes are made to the trailer's own copies of the
levels, at runtime.

## Recording it at 1080p60

**The exact way: the exporter.** It steps every frame exactly 1/60 s and muxes in the score, so
the video is smooth even on a slow machine. You need Playwright and ffmpeg:

```
npm i -D playwright && npx playwright install chromium
npm run dev                                   # in one terminal
node tools/render-trailer.mjs --gpu           # in another: trailer.mp4, 1920x1080, 60 fps, with sound
```

Leave `--gpu` off on a machine without a usable GPU (it then uses software GL, which is slower but
works anywhere). `--w --h --fps --out --from --to` change the size, rate, file and range. Don't
edit the trailer's files while it records: the dev server would reload the page.

**The quick way: a screen recorder.** Open
`http://localhost:5173/trailer/?clean&autoplay`, go full screen (F11) on a 1920x1080 display, click
once for sound, and record the window with OBS at 1920x1080, 60 fps. The page is 16:9 and the
letterbox is drawn in, so the full frame is the picture. This only gives 60 fps if the machine
renders the levels at 60 fps. Use the exporter if it can't.

## Music

The score needs no track. To lay one under it (a track you have the rights to), put the file in
`public/assets/audio/` and open `/trailer/?music=<filename>`. It mixes under the score, ducked
under the big hits. Leave it out to keep the synthesised score on its own.

## Files

```
trailer/index.html          the page
src/trailer/main.js         page, controls, loading, clock, export hooks
src/trailer/Stage.js        one level, built and run in its own scene
src/trailer/Director.js     shots on the timeline, seeking, the level's camera kept apart
src/trailer/camera.js       the camera moves
src/trailer/Overlay.js      letterbox, fades, grain, the words
src/trailer/score.js        the score
src/trailer/edit.js         the edit: stages, sequences, length
src/trailer/seq/glade.js    1 and 7
src/trailer/seq/prologue.js 2
src/trailer/seq/trail.js    3, and the horn's call in 6
src/trailer/seq/drive.js    4
src/trailer/seq/shrine.js   5 and 6
tools/render-trailer.mjs    the exporter
```

To put the trailer in a production build, add `trailer: resolve(root, 'trailer/index.html')` to
`build.rollupOptions.input` in `vite.config.js`. It builds cleanly. It's left out so the game's
build stays exactly as it was.

## Known limits

- The first build of the six levels takes a few seconds on a desktop GPU (about 12 s in
  a headless software-GL browser). Replay rebuilds them, because a level can only run forward.
- On a machine that can't render the levels at full frame rate, the picture catches up with the
  sound in fixed steps, and it pulls the sound back if it falls far behind. Live playback on such a
  machine isn't smooth. The exporter is.
- The edit is cut to the levels as they are now. If a level's layout changes (an obstacle's
  distance, a beat's timing), a shot can drift or lose what it was framing. The director prints
  `[trailer] beat "..." landed at ...` in the console when a measured beat moves.
- Level 2's car is the last one picked in the game (its saved choice), or the default.
