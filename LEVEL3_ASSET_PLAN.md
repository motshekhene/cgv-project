# Level 3 — Deephold redesign and asset record

Level 3 is a third-person mine-arena duel against the Handler. The encounter uses human GLB characters, a scanned rock obstacle set with collision, an animated lava shader, a phase-changing boss fight, a shrinking final arena, procedural combat sound and a new compact field HUD.

## Redesign

- **Camera and play:** over-the-shoulder lock-on framing, with free orbit on Tab. WASD moves, left mouse attacks, right mouse guards/parries, Space dodges, and Q triggers the Key slow-motion ability. Mobile touch controls use the same combat actions.
- **Fight:** the Handler telegraphs his opening lunge, then escalates from pursuit to a helmet reveal and a final desperation phase. Well-timed parries stagger him; the arena contracts in the final phase. Player and Handler positions resolve against rock obstacles and the arena boundary.
- **Interface:** a new restrained mine-field HUD shows the mission, boss phase/health, Kai health/stamina/Key charge, control hints, pause, sound and field credits. The pause and credits panels work without refreshing the page.
- **World and sound:** scanned rocks frame the ring and block fighter movement; Ground 051 and Lava 004 textures dress the platform and lava. The existing custom lava shader drives animated emission. Web Audio generates the combat cues in code, so no sound pack was downloaded.
- **Characters:** Kai uses the MakeHuman suited model. The Handler uses the Vanguard humanoid GLB with Mixamo rig/animation support. Their scales are corrected separately because the Vanguard file already contains a centimetre-to-metre transform.

## Bundled assets and credits

All newly sourced assets are free to download; no paid assets are used.

| Bundled path | Asset/source | Licence and use |
|---|---|---|
| `assets/characters/level3/kai-suited.glb` | MakeHuman generated suited human from the VSim asset library | MakeHuman states generated characters made from bundled assets are CC0. See [VSim asset credits](https://github.com/kunalkushwaha/vsim/blob/main/packages/assets/library/CREDITS.md) and [MakeHuman asset terms](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md). |
| `assets/characters/level3/handler-soldier.glb` | Vanguard by T. Choonyung, distributed as the Three.js Soldier example | Adobe says Mixamo characters and animations may be used royalty-free in video games. See the [model file](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb) and [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html). |
| `assets/characters/level3/{fight-idle,walking,running,body-jab-cross,hook-punch,combo-punch,standing-melee-punch,blocking,big-hit-to-head,running-dive-roll,aerial-evade}.glb` | Mixamo motion clips converted to GLB by [MisterYI](https://github.com/MisterYI/deevid-mixamo-assets) | Mixamo game use is royalty-free under the [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html). |
| `assets/models/rock-face-01/rock_face_01_1k.gltf`, `.bin` | Rock Face 01, Dario Barresi via [Poly Haven](https://polyhaven.com/a/rock_face_01) | CC0. |
| `assets/textures/rock-{color,normal,roughness}.jpg` | Ground 051 maps from [ambientCG](https://ambientcg.com/view?id=Ground051) | CC0. |
| `assets/textures/lava-{color,emission}.jpg` | Lava 004 maps from [ambientCG](https://ambientcg.com/view?id=Lava004) | CC0. |
| npm dependency `three` | [Three.js](https://threejs.org/) | MIT. |
| npm dependency `vite` | [Vite](https://vite.dev/) | MIT. |

The in-game **Field Credits** panel names these sources. The team created the arena arrangement, lava shader integration, UI, collisions, camera, fight logic integration and Web Audio sound design.

## Build and verification

- `npm run build` succeeds and emits a production `dist/` with `index.html` at its root. The Vite copy step includes `assets/`; `base: './'` keeps the build deployable in a subdirectory.
- The current bundle reports an existing `HandlerAI` chunk-size warning (~592 kB minified, ~150 kB gzip). It does not fail the build.
- The local HTTP preview at `http://127.0.0.1:4173/` has been visually inspected with the HUD, scanned rock ring and both human characters loaded. The Handler’s initial model scale and warning window were corrected after this inspection.
- Still to verify: complete a full Level 3 win and restart through the interface; inspect all current browser logs for 404s; check Levels 1 and 2, published Chrome play-through, lab-hardware frame rate, and memory over three levels.

## Submission checklist items outside this Level 3 implementation

- Create/inspect the production archive so `index.html` is at its top level; upload it through Moodle.
- Open the published URL in Chrome and play from Level 1 through Level 3, checking the console for missing assets.
- Record lab-hardware frame rate and memory across all levels.
- Upload the trailer (maximum two minutes) to YouTube, submit the devlog video, and have each team member submit their individual contribution report.
