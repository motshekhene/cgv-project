# Graphics and shaders: what each effect does and how to explain it

This is for the demo and the devlog. The rubric says *"You must be able to explain your shader code and why it works."* Each section below covers what you see, where the code is, and how it works, in words you can say out loud. The last section maps everything to the rubric.

---

## 1. The post-processing pipeline (`src/core/PostFX.js`)

**What you see:** glow around bright things (the sun, the horn, the waterfall, headlights), a colour grade for each level, darker corners, light film grain, a red pulse at the screen edges when Kai is hurt, and a brief colour fringe or flash on impacts.

**How it works:** we stopped drawing straight to the screen. Every frame (`Game.renderScene`):

1. **The scene goes into an HDR render target.** It's a half-float texture, multisampled on HIGH for antialiasing, so colours brighter than 1.0 survive. Without HDR, the sun and a white wall would be the same "1.0" and bloom couldn't tell them apart.
2. **Bloom.**
   - *Bright pass* (`PREFILTER`): each pixel keeps only how much it is over a threshold. A soft knee (a quadratic ramp) means the glow fades in rather than popping on.
   - *Downsample chain* (`DOWN`): it's halved 4 to 6 times with a 13-tap filter (the Call of Duty: Advanced Warfare method, credited in game). Each level is blurrier than the last.
   - *Upsample* (`UP`): it climbs back up with a 3×3 tent filter, *adding* each level onto the next with additive blending. The result is one wide, smooth glow from a few cheap passes, instead of one huge blur.
3. **God rays** (`RAYS`, GPU Gems 3 ch. 13, credited): from every pixel we march 40 steps toward the sun's position on screen. At each step we add up the sky that's brighter than a threshold, and each step counts a bit less (`uDecay`). Where a tree trunk or leaves sit between the pixel and the sun they add nothing, which leaves the dark gaps between the shafts. The sun's direction is read from the level's own sky shader (`uniforms.uSunDir`). The rays fade out when you turn away from the sun.
4. **Composite** (`COMPOSITE`), one full-screen pass:
   - scene + bloom + rays
   - white balance
   - ACES tone mapping (`#include <tonemapping_fragment>`)
   - the grade: lift/gain, a contrast power curve around 18% grey, saturation
   - vignette, chromatic aberration (red and blue read from slightly different places)
   - the damage pulse and impact flash
   - sRGB conversion (`#include <colorspace_fragment>`)
   - grain plus a 1/255 dither, which stops banding in the fog

**Uniforms driven by game state:**
- `uHit` rises whenever `state.health` drops, in any level (`Game._frame`), then decays.
- `uKick` and `uFlash` rise when a level's camera-shake value jumps (an impact).
- `uRays` follows how much the camera faces the sun.
- `uTime` animates the grain.

**Per-level looks:** the `PROFILES` table in `PostFX.js`. For example, Level 1 is a crisp green morning with strong god rays, and Level 3 is warm and glowing.

**LOW graphics** skips all of this and draws straight to the screen.

### Keeping the original look: `src/shaders/display.js`

Turning post-processing on first made every level look washed out. This is a good devlog story. Two things had been tuned for a direct render:

- **The jungle sky shader writes screen colours directly**, with no tone mapping. Through PostFX those colours were tone mapped a second time.
  - *Fix:* `displayToScene()` is the exact inverse of ACES and sRGB. It applies the inverse matrices, then solves the rational ACES curve for its input with the quadratic formula. After the composite, the pixel lands back on the colour the shader meant.
- **three.js mixes fog in after tone mapping**, in screen space.
  - *Fix:* we patch three's own `fog_fragment` chunk. When drawing into the HDR target, it converts the colour to screen space, mixes the fog there, and moves the HDR colour by the difference. With no fog, the HDR colour (and its bloom) is untouched.

We verified it by reading pixels back with `readPixels`: the direct render and the post-processed render match to within a few levels out of 255.

---

## 2. Wind on the plants (`src/shaders/wind.js`)

**What you see:** trees, bushes and grass sway, and the leaves flutter.

**How it works:** a vertex shader injected into the plants' normal `MeshStandardMaterial` with `onBeforeCompile`, so they keep all of three's lighting, fog and shadows.

- It works in world space and replaces three's `project_vertex` chunk.
- The bend grows with height above the plant's own origin (`h·0.04 + h²·0.0015`). The base stays planted and the crown moves most.
- Each plant gets its own phase from where it stands (`dot(root.xz, …)`), so the forest doesn't sway in lock-step.
- Two sines at different frequencies never quite repeat.
- A small, fast flutter varies across each plant.
- It works for instanced meshes too (`instanceMatrix`).

**Uniforms:**
- `uWindTime` is shared by every plant and advanced by Game with the game's own `dt`, so it slows down in slow motion.
- `uWindAmp` is set per plant type (grass more than trees, bark less than leaves).

---

## 3. Particles (`src/fx/Particles.js`)

**What you see:** dust kicked up on every stride, a bigger puff when Kai lands, a trail of dust on slides, and earth and splinters on impacts in Level 1.

**How it works:** one `THREE.Points` pool, simulated on the CPU (a ring buffer, nothing allocated per frame), drawn by our own shader.

- **Attributes:** `aSize`, `aAlpha`, `aColor`, `aSeed`, one per particle.
- **Varyings:** `vAlpha`, `vColor`, `vSeed`, passed to the fragment stage.
- **Vertex stage:** turns a size in metres into pixels the way the projection would (`aSize · projectionMatrix[1][1] · viewportHeight / 2 / depth`), so particles shrink correctly with distance.
- **Fragment stage:** draws a soft disc and breaks its edge up with **value noise**, the same technique as Lab 4.2: random values on a grid, smoothly interpolated. That's why dust reads as a puff and not a dot. Sparks use a clean, white-hot core instead (`uSoft`).

---

## 4. The pool's reflection and refraction (`src/shaders/water.js` + `src/levels/level3/ShrineArena.js`)

**What you see:** the pool below the falls mirrors the cliffs and the waterfall, and you see the pool bed through the water, bent by the ripples.

**How it works:**
- A `CubeCamera` sits just above the water and renders the shrine into a cube map, six views. The water and spray are hidden while it captures. It re-captures twice a second (the light changes at dusk and people move).
- In the water's fragment shader, the surface normal comes from two scrolling noise height fields (finite differences, no normal-map texture). This is the bump-mapped animated water idea from the labs.
- The view ray is bent with GLSL's `reflect()` for the mirror image, and with `refract(-v, n, 1.0/1.33)` (air into water) to see into the pool. Each direction is looked up in the cube map.
- A **Fresnel** term (`pow(1 − n·v, 3)`) decides the mix. Looking straight down you mostly see into the water; at a shallow angle it becomes a mirror, as real water does.

---

## 5. Voices (`src/audio/voice.js`)

**What you hear:** every line of dialogue and Kai's thoughts are spoken aloud, in time with the subtitles.

**How it works:** the browser's Web Speech API (credited).
- Each speaker has a pitch and pace: the Marshal low and slow, Baba Zwane old and measured, Kai quicker.
- A South African English voice is chosen when the computer has one (Edge offers natural en-ZA voices).
- It follows the master volume, M (mute) and pause.
- **OPTIONS > VOICES** turns it off.

---

## 6. Impact feel and optimisation (`src/core/Game.js`)

- **Every level's camera shake now also kicks the lens.** When `shake` / `_shake` jumps, PostFX adds colour fringing, and a short flash on the biggest hits.
- **Lab hardware** (rubric: "Does it lag?"):
  - Integrated or software GPUs (Intel, Vega, SwiftShader…) start on MEDIUM until the player picks a GRAPHICS level.
  - If the game runs under 35 fps for four seconds, it steps graphics down one level for that session.
  - MEDIUM drops MSAA, uses 4 bloom levels instead of 6, and draws god rays at quarter resolution.

---

## 7. Rubric map (new work only; the earlier shaders are in `JUNGLE_SHRINE_IMPLEMENTATION.md` §7)

| Rubric line | What to show |
|---|---|
| **3D Effects**: antialiasing | MSAA on the HDR target (HIGH) |
| **3D Effects**: reflections, refractions | Level 3 pool: cube-map `reflect()` + `refract()` with Fresnel |
| **3D Effects**: bump / height maps | Water normals from noise height fields; PBR normal and AO maps on the ground sets |
| **3D Effects**: lighting, shadows, skybox | God rays aimed at each level's sky sun; HDR bloom on emissive lights |
| **Shaders**: several custom shaders, vertex + fragment | PostFX passes (fragment), wind (vertex), particles (vertex + fragment, attributes and varyings), water (fragment, cube maps) |
| **Shaders**: uniforms driven by time or game state | `uHit` from health, `uKick` from impacts, `uRays` from camera direction, `uWindTime`, the pool's `uTint` at dusk |
| **Shaders**: things built-in materials can't do | Post-processing passes, procedural noise, vertex displacement, water |
| **Polish**: no lag, options, extra features | Auto quality and step-down, OPTIONS > VOICES, damage feedback |
| **Innovation**: effects beyond the course | HDR bloom chain, screen-space light scattering, inverse tone mapping, speech |
| **Gameplay & Experience**: sound | Spoken dialogue on top of the existing music and synthesised sound |
