# Level 3 Theme Redesign — Plan

## Why change the theme

"Deephold" (dead mine + hidden server room + lava) looks striking on paper, but in
practice it fights us on both goals we actually care about:

- **Asset sourcing is hard.** "Volcanic mine with server racks bolted into rock"
  is a narrow, specific mashup. Nothing free matches it directly — we've been
  improvising with a marble texture, a generic lava material, and placeholder
  rock spires. The result reads as a tech demo, not a place.
- **It isn't "fun" to look at.** Dark, cramped, orange-on-black doesn't have the
  open, readable, good-looking quality of the games this is meant to feel like
  (Genshin-style open arenas, Sekiro cliffside duels, Zelda ruins). A boss fight
  needs a stage, not a cave.

**What stays exactly the same:** the combat system (punch/kick chains, dodge,
block/parry, lock-on, hit-stop, 3 health-gated phases, helmet-off reveal),
`Kai` and `The Handler` as characters, `CombatController.js` / `HandlerBoss.js`
/ `Level03.js` as the code. This redesign only touches **where the fight
happens** — the arena dressing, lighting, sky, and one environmental shader.
Nothing above needs to be rebuilt; `_buildArena()` and `_buildLights()` in
`Level03.js` get swapped out, nothing else.

**What can adjust:** the one line of Deephold's lore ("a hidden server room in
a mine") moves to wherever the new theme places it — each option below says
where.

---

## How to judge a theme (the filter every option is scored against)

1. **One real, free, CC0/CC-BY asset pack covers 80% of the scene** — not
   twelve mismatched downloads.
2. **Open and bright enough to be "good-looking"** on a laptop GPU, not another
   dark tunnel.
3. **A natural arena shape already exists in the theme** — a clearing, a
   platform, a courtyard — so we're not building bespoke level geometry.
4. **Kai and the Handler (current Quaternius models) don't look out of place
   in it.** Both are "person in casual/office clothes" — that reads fine
   outdoors, on a ruin, on a cliff; it reads wrong in a dungeon.
5. **Still supports one custom shader**, since that's a rubric line — each
   option names its replacement for the lava shader.

---

## Option A — Overgrown Shrine (jungle ruins) ⭐ recommended

**The pitch:** The hidden server room was never a mine — it's a long-abandoned
stone shrine deep in the jungle, swallowed by roots and vines, that someone
quietly wired into the network years ago. Kai finds it exactly where the story
already sends him (off the road, away from the chase); the Handler corners him
in the shrine's central courtyard.

**Why it's the easy one:** **we already own the main asset pack.** The
`Simple Nature Pack` sitting in the repo (trees, bushes, rocks, grass — CC0,
Quaternius) is a jungle/forest kit. This theme needs almost nothing new.

| Need | Source | Search term |
|---|---|---|
| Trees, bushes, grass, boulders | **Already in `Simple Nature Pack - Dec 2016/`** | — |
| Ruined stone platform / broken pillars | Poly Pizza / Quaternius | `ruins`, `ancient stone`, `broken pillar`, `temple` |
| Stone archway / overgrown gate | Sketchfab / Poly Pizza | `jungle temple ruins`, `overgrown arch` |
| Ground texture (moss/stone) | ambientCG | `moss`, `ground`, `mossy rock` |
| Waterfall / mist (optional, replaces lava) | ambientCG (water texture) + a simple shader | `water` |

**Mood:** daylight or golden-hour, green and warm stone, shafts of light through
canopy, moss-covered ruins. The opposite of claustrophobic — open-air, readable,
cinematic. Think *Uncharted* ruin clearings or *Zelda: Breath of the Wild*
shrine courtyards.

**Arena shape:** a circular or square broken-stone platform at the shrine's
centre (already matches the current arena's circular footprint — same combat
camera math, just redressed), ringed by jungle instead of lava.

**Shader swap:** replace the lava shader with a **waterfall / flowing water
shader** (a cliff or fountain behind the arena) — same "animated, state-driven
ShaderMaterial" rubric line, friendlier visually, and the asset need (a water
texture from ambientCG) is one of the easiest things to source free.

**Lighting:** one warm directional "sun" shaft through canopy + soft green
ambient bounce. Far simpler and better-looking than four point-lights faking
lava glow.

---

## Option B — Cliffside Monastery (mountain duel)

**The pitch:** The uplink is hidden in an abandoned mountain monastery, reached
by a narrow cliff path. The Handler catches Kai on the open stone terrace
overlooking the valley — nowhere to run, a straight drop on one side.

**Why it's easy:** mountain/cliff/stone-platform kits are extremely common in
free packs (they're a staple of action-RPGs), and a flat terrace with a
dramatic backdrop needs very little geometry — mostly one good skybox.

| Need | Source | Search term |
|---|---|---|
| Stone terrace / monastery platform | Poly Pizza / Quaternius | `stone platform`, `temple ruins`, `monastery` |
| Distant mountains | A skybox/HDRI | Poly Haven | `mountain`, `cliff` (HDRI) |
| Snow/rock texture | ambientCG | `rock`, `snow`, `cliff rock` |
| Prayer flags / banners (set dressing) | Poly Pizza | `banner`, `flag` |

**Mood:** cold, crisp, high-altitude — pale stone, blue-grey sky, wind. Visually
closer to *Sekiro* or *Genshin Impact's* mountain regions.

**Arena shape:** a rectangular or circular terrace, cliff edge on one side
(good staging: "nowhere left to run" reads literally).

**Shader swap:** a **wind/mist shader** — fog banks drifting across the terrace,
driven by the same `uTime`-uniform pattern the lava shader already uses.
Cheapest of all four options to build, since it's mostly a moving fog plane.

**Caution:** needs a convincing distant-mountain skybox to sell the height —
if a good free HDRI isn't found, this one weakens fast.

---

## Option C — Desert Canyon Outpost

**The pitch:** The server room is bolted into an old desert relay station,
half-buried in a box canyon. Sun-bleached metal, sand, dead technology.

**Why it's easy:** desert/canyon packs are common and the canyon walls double
as the arena's natural boundary — no custom wall geometry needed at all, the
terrain *is* the wall.

| Need | Source | Search term |
|---|---|---|
| Canyon rock / mesas | Quaternius / Poly Pizza | `canyon`, `desert rock`, `mesa` |
| Sand ground texture | ambientCG | `sand`, `desert ground` |
| Dead tech / relay props | Poly Pizza | `satellite dish`, `antenna`, `crate` |
| Cacti / dead scrub (set dressing) | Quaternius desert pack | `desert plants` |

**Mood:** harsh warm light, long shadows, orange sand against pale sky — still
keeps a warm palette (so it's the gentlest swap from Deephold's orange-and-black
look if the team doesn't want to lose that feel entirely).

**Shader swap:** a **heat-haze shimmer over the sand** — this is almost the
*same shader math already written* for the lava (`uTime`-driven distortion),
just reading a sand texture instead of lava, so it's the least new shader work
of all four options.

---

## Option D — Coastal Cliffs (sea arena)

**The pitch:** The uplink is in a cliffside bunker above the ocean. The
Handler's last stand happens on the exposed rock shelf at the cliff edge,
waves below.

**Why it's easy:** coastal/rock packs are common, and the ocean itself is
mostly a **shader**, not modelling work — a plane with a water material covers
the whole backdrop for free.

| Need | Source | Search term |
|---|---|---|
| Cliff rock / coastal platform | Poly Pizza / Quaternius | `cliff`, `coastal rocks` |
| Seagulls / driftwood (set dressing) | Poly Pizza | `seagull`, `driftwood`, `shipwreck` |
| Rock/cliff texture | ambientCG | `cliff rock`, `coastal stone` |

**Mood:** dramatic, moody — grey-blue sea, spray, overcast or sunset sky.
Closest visual cousin to *God of War*'s coastal cliffs.

**Shader swap:** an **ocean shader** (the most "wow" of the four, but also the
most work — a convincing water shader is harder than lava, fog, or sand haze).

---

## Comparison

| | Jungle Ruins (A) | Mountain (B) | Desert (C) | Coastal (D) |
|---|---|---|---|---|
| Assets already owned | ✅ yes | ❌ no | ❌ no | ❌ no |
| Ease of sourcing rest | Easiest | Medium | Easy | Medium |
| Shader difficulty | Low (water) | Lowest (fog) | **Lowest (reuses lava math)** | Highest (ocean) |
| Visual "wow" | High | High | Medium | Highest |
| Keeps warm Deephold palette | No (green/gold) | No (cold) | **Yes (orange)** | No (blue) |
| Risk if a key asset is missing | Low | Medium (needs good skybox) | Low | Medium (ocean shader) |

---

## Recommendation

**Go with Option A — Overgrown Shrine.** It's the only option where the main
asset need is already solved (the nature pack is sitting in the repo right
now), it keeps the arena's existing circular footprint and camera math
untouched, and "ruins reclaimed by jungle" reads as good-looking and current
without any exotic sourcing. If the team wants to keep more of Deephold's
warm/orange identity, **Option C (Desert)** is the strongest fallback — it
reuses the lava shader's own math almost unchanged.

---

## What does **not** change

- `CombatController.js`, `HandlerBoss.js` — zero changes. Combat, phases, the
  helmet-off reveal, lock-on, dodge/block/parry all carry over exactly.
- `Kai` / `The Handler` models — kept as-is. Both read fine outdoors.
- `FightHUD.js`, `TouchControls.js` — zero changes.
- The story beat (Handler corners Kai where the chase ends) — only the *place*
  changes, not the beat.

## What changes (all inside `Level03.js`)

- `_buildArena()` — swap the platform material/geometry and the background
  dressing (lava sea → the chosen theme's set dressing).
- `_buildLights()` — swap point-light "lava glow" rig for the theme's natural
  lighting (sun shaft, overcast sky, etc.).
- `src/shaders/lava.js` — rename/repurpose into the theme's shader (water,
  fog, or sand-haze per the table above); the `uTime`-driven technique carries
  over directly.
- One or two new asset downloads per the table for the chosen option, dropped
  into `assets/level03/` and `assets/textures/` exactly as before.

## Next step

Pick one of A–D (or tell me to mix, e.g. "jungle ruins but keep warm
lighting") and I'll write the matching `LEVEL3_ASSET_PLAN.md`-style download
list for it, then redo `_buildArena()` / `_buildLights()` to match once the
assets are in hand.
