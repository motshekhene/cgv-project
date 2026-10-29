# Game audio credits

Everything here that the team did not make. The in-game credits (CREDITS on the main menu) list them too, with links: `src/ui/credits.js` — add a new asset there as well as here.

The three from Pixabay are used under the Pixabay Content License — free to use, no attribution required
(https://pixabay.com/service/license-summary/). They are credited anyway: the ID in each
filename finds the file on pixabay.com if it ever needs replacing. The two from OpenGameArt are CC0
(public domain); credited too, with their pages.

| Asset | File | Author | Source | Licence |
|---|---|---|---|---|
| The game's theme loop (3:07, on every level) | `sounduniversestudio-repeat-gaming-background-music-instrumental-218942.mp3` | sounduniversestudio | Pixabay (ID 218942) | Pixabay Content License |
| Coin collect chime (Level 1) | `liecio-collect-points-190037.mp3` | liecio | Pixabay (ID 190037) | Pixabay Content License |
| Traffic wreck — swerving and crash (Level 2) | `rsf_studios-car-crash-swerving-and-crash-592672.mp3` | rsf_studios | Pixabay (ID 592672) | Pixabay Content License |
| The car's engine (Level 2), looped and pitched with the revs | `domasx2-racing-car-engine-loop.wav` | domasx2 | OpenGameArt, "racing car engine sound loops" (loop_0.wav): https://opengameart.org/content/racing-car-engine-sound-loops | CC0 |
| The car blowing up, and the Marshal's bombs (Level 2) | `elnineo-big-explosion.ogg` | elnineo | OpenGameArt, "Explosion tilesets" (Big Explosion.ogg): https://opengameart.org/content/explosion-tilesets | CC0 |

Each file is peak-normalised on load (`src/audio/jungleAudio.js`), so recorded and
synthesised sounds sit at one loudness — the cues peak where the palette does, the theme
above the old arrangements' ceiling, which is where the game's mix balance landed.
Every other sound in the game is synthesised in code; the synthesised voices for these
three remain in the code as the fallback if a file ever fails to load.

`tools/probe-audio.mjs` prints any file's duration and bitrate:
`node tools/probe-audio.mjs public/assets/audio/<file>.mp3`
