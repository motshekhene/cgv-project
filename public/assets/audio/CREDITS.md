# Game audio credits

Everything here that the team did not make. Copy these into the in-game credits screen.

All three are used under the Pixabay Content License — free to use, no attribution required
(https://pixabay.com/service/license-summary/). They are credited anyway: the ID in each
filename finds the file on pixabay.com if it ever needs replacing.

| Asset | File | Author | Source | Licence |
|---|---|---|---|---|
| The game's theme loop (3:07, on every level) | `sounduniversestudio-repeat-gaming-background-music-instrumental-218942.mp3` | sounduniversestudio | Pixabay (ID 218942) | Pixabay Content License |
| Coin collect chime (Level 1) | `liecio-collect-points-190037.mp3` | liecio | Pixabay (ID 190037) | Pixabay Content License |
| Traffic wreck — swerving and crash (Level 2) | `rsf_studios-car-crash-swerving-and-crash-592672.mp3` | rsf_studios | Pixabay (ID 592672) | Pixabay Content License |

Each file is peak-normalised on load (`src/audio/jungleAudio.js`), so recorded and
synthesised sounds sit at one loudness — the cues peak where the palette does, the theme
above the old arrangements' ceiling, which is where the game's mix balance landed.
Every other sound in the game is synthesised in code; the synthesised voices for these
three remain in the code as the fallback if a file ever fails to load.

`tools/probe-audio.mjs` prints any file's duration and bitrate:
`node tools/probe-audio.mjs public/assets/audio/<file>.mp3`
