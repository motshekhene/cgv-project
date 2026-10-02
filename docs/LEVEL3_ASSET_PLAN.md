# Level 3 (Deephold) — Model Sourcing & Integration Plan

Follow this top to bottom. Goal: real models for **lava, two fighters (Kai + Handler), and the bridge**, dropped into the game with no code rewrites.

---

## 0. Ground rules (apply to every asset)

| Rule | Why |
|---|---|
| Final format is **`.glb`** | What `AssetRegistry.model()` loads |
| Filenames **lowercase-with-hyphens**, no spaces | Server is case-sensitive (README rule) |
| Textures **max 1024x1024** | Lab-machine performance budget (pitch p.13) |
| Scale: **1 unit = 1 metre**, character ~1.8 m tall | Combat range/arena are tuned in metres |
| Origin at the **feet / centre-bottom** of the model | So it sits on the floor at y = 0 |
| Log every external asset in the **asset log** (section 8) | Needed for the credits screen — marked as never-cut |
| Only use **CC0 or CC-BY** (or free-for-games) licences | CC-BY needs credit; no "non-commercial/no-derivatives" if we modify |

Folders (already created): `assets/characters/`, `assets/level03/`, `assets/textures/`.

---

## 1. What you actually need, and where each comes from

| Need | Real model or shader? | Primary source | Backup |
|---|---|---|---|
| **Lava** | **Mostly a shader, not a model.** The pitch's rubric wants a *custom* animated lava + heat-haze shader. You only need a *texture* and a flat/cracked ground mesh. | ambientCG or Poly Haven (CC0 lava/rock textures) | Sketchfab "lava rock floor" (check licence) |
| **Kai (player)** | Rigged humanoid | **Mixamo** (character + animations) | Quaternius "Universal Base Characters" (CC0) |
| **The Handler (boss)** | Rigged humanoid, **helmet as a separate node** | **Mixamo** (a tactical/armoured character) | Sketchfab humanoid + helmet mesh |
| **Bridge** | Static prop | **Sketchfab** ("highway bridge", "stone arch bridge", "mountain bridge") | Poly Pizza / Kenney, or build from boxes in Blender |
| Mine arena / rocks / server racks | Static props | Quaternius, Poly Pizza, Sketchfab | Blender kitbash |

### Sites (what each is good for)
- **Mixamo** (mixamo.com, free Adobe login) — rigged humanoid characters **plus a large animation library** (idle, run, attack, block, roll, hit reaction, death). Best fit for both fighters.
- **Sketchfab** (sketchfab.com) — huge variety; filter **Downloadable + CC licence**, download the **glTF/GLB** option. Check each model's licence and poly count.
- **Poly Pizza** (poly.pizza) — low-poly CC0/CC-BY models, direct `.glb` download. Good for props.
- **Quaternius** (quaternius.com) — CC0 packs (characters, environment, props). No attribution required.
- **Kenney** (kenney.nl) — CC0 kits, very clean, stylised/low-poly.
- **Poly Haven** (polyhaven.com) — CC0 textures, HDRIs, some models.
- **ambientCG** (ambientcg.com) — CC0 PBR texture sets (rock, lava, metal) with normal/height maps — exactly what the rubric asks for.

---

## 2. Decide the visual style FIRST (do this before downloading)

Pick **one** style so nothing clashes. Recommended: **semi-realistic PBR, low-to-mid poly** (matches the pitch: dark, orange/black, industrial).

- [ ] Write the style in one line here: `__________________`
- [ ] Collect 3-5 reference images (mine chamber, server racks in rock, armoured fighter) in a folder or moodboard.
- [ ] Palette: **burnt orange, black, charcoal**. Reject anything bright/cartoony.

Mixing a stylised Kenney bridge with a realistic Mixamo fighter will look wrong — stay consistent.

---

## 3. Fighters (Kai + Handler)

**Strategy: use the same Mixamo skeleton for both.** Then one set of animation clips works on both, and you only download animations once.

### 3.1 Download
1. Sign in at Mixamo, **Characters** tab.
2. **Kai:** pick a young, practical civilian-style character (jacket/utility). Add the backpack/drive later as a small mesh if needed.
3. **Handler:** pick the tallest, most imposing armoured/tactical character.
4. For each, download **T-pose FBX, "With Skin"**.

### 3.2 Animations to download (Mixamo, "Without Skin", 30 fps, in-place)
Both fighters, in-place versions (game code moves the character, not the animation):

| Clip | Used for |
|---|---|
| Idle / fighting idle | Standing |
| Run (or walk) | Movement / lock-on strafe |
| Standing melee attack (light) | Player attack |
| Heavy/second attack | Heavy attack / boss sweep |
| Block / defend | Block + parry |
| Dodge / roll | Space dodge |
| Hit reaction | Taking damage |
| Death / knocked down | Fail state / boss defeat |
| Lunge / dash attack | Boss `lunge` |
| Combo (2-hit) | Boss phase-3 `combo` |

### 3.3 Convert to GLB (Blender)
1. Import FBX into Blender.
2. Apply scale so the character is ~**1.8 m** tall, feet at origin.
3. **Handler only:** make sure the **helmet is its own object/node** named `helmet` (split it from the head mesh if needed) — the reveal hides this node. Code already hides a `helmet` mesh on phase 2.
4. Export as **glTF Binary (.glb)**, include animations, compress textures to 1024.
5. Save as: `assets/characters/kai.glb`, `assets/characters/handler.glb`.

### 3.4 Sanity test
Open the `.glb` in any online glTF viewer (or three.js editor) — check scale, facing (+Z forward), and that clips play.

---

## 4. Lava

The pitch grades a **custom shader**, so don't hunt for a "lava model."

1. **Texture:** download a CC0 lava/volcanic-rock set from ambientCG or Poly Haven — you want **colour + emissive/height + normal**. Save 1024px versions to `assets/textures/lava-*.jpg`.
2. **Geometry:** the floor is a mesh with fissure cut-outs (or planes placed in cracks). Kitbash in Blender, or use a simple plane and let the shader do the work.
3. **Shader (code, later):** animated noise + emissive glow + heat-haze distortion, driven by a `uTime` uniform → goes in `src/shaders/`. The texture only feeds it.
4. Optional real model: rock floor slab with cracks from Sketchfab/Quaternius, as the base under the shader.

Deliverables: `assets/textures/lava-color.jpg`, `lava-height.jpg` (+ normal), and optionally `assets/level03/floor-rock.glb`.

---

## 5. Bridge (starting scene)

Where it appears: the mountain-pass bridge the Handler rams you off (Level 2 -> 3 interlude), then the ravine/riverbank leading to the mine entrance ("SHAFT 7 — DECOMMISSIONED").

1. Search Sketchfab / Poly Pizza for: `highway bridge`, `stone arch bridge`, `mountain bridge`, `guardrail`.
2. Requirements: a **straight deck with side barriers**, one section that can be treated as **broken/missing** (the car goes through the barrier).
3. If nothing fits, **build it from boxes in Blender**: a long slab deck + two barrier rails + support pillars. Stylistically consistent beats fancy.
4. Export: `assets/level03/bridge.glb`. Keep it under ~20k triangles.
5. Also grab (optional): a rock/cliff piece for the ravine and a "SHAFT 7" sign (can be a plain textured plane made in code).

> Note: the ram/car-through-barrier cinematic itself is code (3A owns transitions). You only supply the bridge geometry.

---

## 6. Rest of the mine (do after the three above work)

- Rock wall/tunnel pieces, stalactites/stalagmites — Quaternius / Poly Pizza cave packs.
- Server monoliths — search `server rack`, `data center` (Sketchfab/Poly Pizza), kitbash into rock.
- Steam vent, mine cart, support beams — Poly Pizza / Sketchfab.
- Use the **prompt already written** if you'd rather AI-generate any of these as a prototype.

---

## 7. Integration into the game (once files exist)

The game already has a fallback: it shows the greybox capsules/arena until a real file loads.

1. Put files in the folders above (names exactly as listed).
2. Tell me / add the load calls (`assets.model('characters/kai.glb')`, `assets.model('level03/bridge.glb')`) in `Level03.js` init — placeholders remain if a file is missing.
3. For animated fighters, use `THREE.AnimationMixer` (per the task doc) and map clips to the `CombatController` / `HandlerBoss` states (idle, run, attack, block, dodge, hit, death, telegraph).
4. Check in the browser at `localhost:5173/?level=level03`: scale correct? facing correct? feet on floor? animations playing? helmet hides on phase 2?
5. Check the **teardown**: restart the level (R) several times — memory shouldn't climb.

---

## 8. Asset log (fill in as you go — feeds the credits screen)

| File | What | Source site | Author | Licence | URL |
|---|---|---|---|---|---|
| `assets/characters/kai.glb` | | Mixamo | | | |
| `assets/characters/handler.glb` | | Mixamo | | | |
| `assets/level03/bridge.glb` | | | | | |
| `assets/textures/lava-color.jpg` | | | | | |

Rule: **no row, no asset in the build.** CC-BY requires the author's name to appear in credits.

---

## 9. Order of work (checklist)

- [ ] 1. Lock the visual style + collect references (section 2)
- [ ] 2. Download + convert **Handler** (harder: helmet node) (section 3)
- [ ] 3. Download + convert **Kai** using the same rig (section 3)
- [ ] 4. Download all animation clips, verify in a glTF viewer
- [ ] 5. Get lava textures, prepare 1024px versions (section 4)
- [ ] 6. Source or build the **bridge** (section 5)
- [ ] 7. Drop files in `assets/`, wire loaders, test in browser (section 7)
- [ ] 8. Fill in the asset log (section 8)
- [ ] 9. Rest of the mine props (section 6)

## 10. Common mistakes to avoid
- Downloading a model with a **restrictive licence** (NC / ND) — skip it.
- Huge models (>50k tris or 4K textures) — will hurt lab machines.
- Different skeletons per fighter — you'd have to retarget animations.
- Forgetting to make the **helmet a separate node**.
- Uppercase filenames or spaces — breaks after hosting.
- Not logging the source — credits are a never-cut deliverable.
