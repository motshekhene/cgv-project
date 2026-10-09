# assets/jungle — every model and texture for the Jungle Shrine game

Everything the three levels need is in this one folder. All names are lowercase with hyphens, so they pass `AssetRegistry`'s path check. Load them with paths relative to `assets/`:

```js
const tree  = await assets.fbx('jungle/models/nature/tree-1.fbx');
const logs  = await assets.model('jungle/models/props/logs.gltf');      // gltf.scene
const mudCol = await assets.texture('jungle/textures/mud-color.jpg', { repeat: [4, 40] });
const mudNor = await assets.texture('jungle/textures/mud-normal.jpg', { srgb: false });
```

How the levels use these is in [docs/JUNGLE_SHRINE_IMPLEMENTATION.md](../../docs/JUNGLE_SHRINE_IMPLEMENTATION.md).

```
assets/
├── characters/            kai.fbx, handler.fbx   (shared by all levels, unchanged)
├── jungle/
│   ├── models/
│   │   ├── nature/        13 FBX   trees, bushes, grass, rocks
│   │   ├── ruins/         91 FBX   stone shrine kit + leaf/bark textures
│   │   ├── props/         16 glTF/GLB   logs, crates, barrels, stones, the bridge
│   │   └── wreck/          5 GLB   Kai's car in the pool at Site 7: wheel, tyre, bumper, axle, steering wheel
│   ├── textures/          6 PBR sets (colour / normal / roughness / ao)
│   └── environment/       sky-light.exr (lighting only)
└── textures/              (empty: the old Deephold lava textures went when the shrine landed)
```

All source packs are CC0 (Quaternius, ambientCG, Poly by Google, Kenney) except one: `wreck/steering-wheel.glb` is "Steering wheel" by Poly by Google, **CC-BY 3.0** (via [Poly Pizza](https://poly.pizza/m/bIYbhKwE4L0)), so it must stay in the credits. For the rest no credit is legally required, but list them on the credits screen anyway.

The other `wreck/` pieces are from Kenney's [Car Kit](https://kenney.nl/assets/car-kit) (`wheel-truck`, `debris-tire`, `debris-bumper`, `debris-drivetrain-axle`), with the kit's colour map embedded in each GLB so there's no separate `Textures/` folder.

---

## Scale: what to multiply each model by (1 unit = 1 metre)

The packs use different units. Use these scale factors so everything matches Kai at 1.8 m.

| Folder | Authored in | Scale | Result |
|---|---|---|---|
| `models/ruins/*.fbx` | cm, 2 m grid | **0.016** | Wall and floor modules become 3.2 m tiles, columns 6.4 m |
| `models/nature/tree-*.fbx` | cm | **0.025 – 0.035** | 10 – 14 m jungle trees |
| `models/nature/bush-*.fbx` | cm | **0.012 – 0.02** | 1.2 – 3 m bushes |
| `models/nature/grass-*.fbx` | cm | **0.01 – 0.02** | Ankle-high tufts |
| `models/nature/rock-*.fbx` | cm | **0.005 – 0.015** (obstacle), **0.1** (cliff) | 1 – 3 m boulders, or cliff chunks |
| `models/props/*.gltf` | tiny (≈0.1 = 1 crate) | **14** crates/barrels, **4** logs, **3** stones, **8** small trees | Real-world size |
| `models/props/bridge.glb` | metres | **1 – 1.5** | 31 m span (Interlude II) |
| `models/wreck/*.glb` | mixed | Sized by `level3/Wreck.js` (longest side in metres) | 0.8 m wheel, 1.7 m bumper |
| `characters/*.fbx` | 482.7 units tall | Handled by `Fighter.js` | 1.8 m |

Most models stand on their base at y = 0. The exceptions are `ruins/floor-standard.fbx` (its top surface is at about y = 0, and the slab extends downward), `ruins/torch.fbx` (origin at the wall bracket) and the nature rocks (which sink a few cm, which looks fine).

---

## Materials: two things that don't work automatically

1. **FBX files import as shiny `MeshPhongMaterial`.** Convert every mesh to `MeshStandardMaterial` (roughness 0.85, metalness 0), the same way `Fighter._buildFromModel()` already does for Kai.
2. **Ruins leaves and bark load untextured (white).** The FBX points at the pack's old file names. Re-attach them by material name:
   - a material name matching `/leaf/i` gets `models/ruins/leaf-texture.png`, with `alphaTest: 0.45` and `side: DoubleSide`
   - a material name matching `/bark/i` gets `models/ruins/bark-texture.jpg`

Tints that give the mossy jungle-stone look (material name → colour):

| Model set | Tints |
|---|---|
| Ruins stone | `Main` 0x7a7c66 · `Highlights` 0x908f78 · `Green` 0x5f9a2e |
| Ruins statues | `Stone` 0xa9a892 |
| Nature rocks | `Rock` 0x7d8274 (the default is near-black) |
| Nature trees/bushes | Keep the defaults (`Leaves` #a6cc3a, `Tree` brown) |

Performance: turn `castShadow` off for trees more than about 20 m from the path. Only the ruins, rocks and characters near the player need to cast shadows.

---

## Models: what's here and what it's for

### `models/nature/` (13)
| File | Use |
|---|---|
| `tree-1` … `tree-4` | Jungle canopy for all three levels. `tree-2` and `tree-4` are the widest, so use them for background walls. |
| `bush-1` … `bush-3` | Path edges and arena edges |
| `grass-1` … `grass-3` | Ground scatter (instance these, there will be hundreds) |
| `rock-1` … `rock-3` | L1 obstacles, L2 riverbank, L3 waterfall cliff (at scale 0.1) |

### `models/ruins/` (91), grouped by job
| Group | Files | Use |
|---|---|---|
| **Floors** | `floor-standard`, `floor-squares`, `floor-square-large`, `floor-diamond`, `floor-tree`, `floor-hole-*`, `floor-standard-half` | L3 courtyard tiles, L1 broken causeway sections |
| **Walls** | `wall`, `wall-overgrown`, `wall-broken`, `wall-half`, `wall-hole`, `wall-double-*`, `wall-arch-round*`, `wall-arch-gothic`, `curve-*` | L3 shrine boundary, L1 ruin corridors |
| **Columns and arches** | `column-round`, `column-round-short`, `column-square`, `column-bridge-support`, `arch-round*`, `arch-gothic*`, `support-*` | L1 trail markers and slide-under arches, L3 courtyard ring and gate |
| **Doors, windows** | `doors-round-arch*`, `doors-gothic-arch*`, `window-*` | L3 shrine gate (uplink behind it), Interlude I falling gate |
| **Statues** | `statue-stag`, `statue-fox` | L3 guardians either side of the gate, L1 landmarks |
| **Stairs, rails, bridge** | `stairs`, `stairs-2`, `rail-*`, `bridge-section` | L3 gate steps, L1 stream crossings |
| **Vegetation** | `tree-1..3`, `bush-*`, `grass`, `dead-tree-1..3` | Mixes with the nature pack. Uses leaf/bark textures. |
| **Small props** | `pot-*`, `pot-*-broken`, `candles-*`, `torch`, `skull`, `chest*`, `barrel`, `crate`, `cart`, `bricks`, `brick`, `bookcase-*`, `trapdoor`, `flag-*` | Set dressing; `torch` for L3 evening light |
| **Hazards** | `bear-trap-open`, `bear-trap-closed` | L1 lane obstacles (slide/jump fail-state) |

### `models/props/` (16)
| File | Use |
|---|---|
| `logs` | L1 jump-over obstacle, L2 logging camp where Kai takes the jeep |
| `crate`, `crate-stack-1`, `crate-stack-2`, `crate-stack-big`, `barrel` | L2 logging camp, L2 road debris |
| `stone-1..3`, `boulder`, `boulder-group` | L1/L2 path rocks, small scatter |
| `tree-small-1`, `tree-small-2`, `tree-cluster`, `tree-cluster-cut` | Distant tree filler (cheap), cut stumps at the logging camp |
| `bridge.glb` | **Interlude II**: the gorge bridge the Handler rams Kai off |

---

## Textures (`textures/`)

Each set has `-color.jpg` (load with `srgb: true`), plus `-normal.jpg` (OpenGL normals), `-roughness.jpg` and `-ao.jpg`, all loaded with `srgb: false`. They're 1K and tile, so set `repeat`.

| Set | Source | Use |
|---|---|---|
| `forest-floor-*` | ambientCG Ground040 | Jungle ground in all levels |
| `mud-*` | ambientCG Ground051 | L1 trail, L2 mud road, L3 paths (tinted 0xc8a27a for a dry trail, 0x8a6a4a for wet mud) |
| `mossy-rock-*` | ambientCG Rock063 | Riverbanks, waterfall rocks |
| `cliff-rock-*` | ambientCG Rock064 | Gorge walls (Interlude II), waterfall cliff (L3) |
| `wood-planks-*` | ambientCG WoodFloor041 | Bridge deck, logging-camp platforms |
| `concrete-*` | ambientCG Concrete042C | Prologue data centre, Site 7 junction box |

## Environment (`environment/`)
`sky-light.exr` is a 1K HDRI used **only for soft lighting and reflections** (`scene.environment`, intensity about 0.35). It's a city street, so never show it as the background. Paint the sky with a shader instead. `AssetRegistry` has no EXR loader, so load it with `EXRLoader` from `three/addons/loaders/EXRLoader.js` and pass it through `PMREMGenerator`.

---

## Not in the repo yet (needs sourcing)

| Need | Where it goes | Suggested CC0 source |
|---|---|---|
| Kai's jeep and the Handler's SUV | `jungle/models/vehicles/jeep.glb`, `suv.glb` | Kenney "Car Kit" or Quaternius "Cars". `VehicleController.js` and `HandlerAI.js` use box meshes until then. |
| Chase drone (L2) | `jungle/models/vehicles/drone.glb` | Kenney "Space Kit", or keep the box version |
| Sounds and music | `assets/audio/` | Kenney audio packs, freesound.org (CC0 filter) |

## Where the raw downloads went
The original packs are in `_source/` at the repo root (`_source/packs`, `_source/ambientcg`; zips and the full Ruins/RTS packs are in `_source/downloads`, which git ignores). **Don't load anything from `_source/` in game code.** If a level needs a model that isn't here yet, copy it into `assets/jungle/`, rename it lowercase-hyphenated, and add a row to this file.
