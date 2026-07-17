# Orientation — start here (everyone, first)

**The universal first read.** Plain-language, no jargon — what we're building, how the pieces depend on each other, the handful of things we've already figured out (so nobody re-derives them), and where to go for your piece. This is the *bridge* doc: not the sales pitch (`cartograph/FEATURES.md`), not the deep dev canon (`SKELETON` / `RIBBONS` / `PIPELINE`) — the throughline that connects them, in language you can say out loud to anyone.

---

## What we're building, in one breath

A **kit for pouring 3D neighborhoods.** You feed it real city data; it produces a **slab** — a flat, fast, fortified map the public app stands on like a foundation. Lafayette Square is the first neighborhood off the line. The whole point is that the *next* neighborhood pours from the same kit, by a different operator, with almost no hand-work. **Aesthetics and performance are co-equal and non-negotiable** — it has to be beautiful *and* run on a phone.

## The dependency chain — where it comes from, where it's headed

Raw data flows downhill through fixed stages; each one freezes a thing the next one trusts:

```
real-world data → SKELETON → prebake → SURVEY → ⟦THE WALL⟧ → SECTION → BAKE → the SLAB → the public app
 (OSM, parcels,   (clean      (the       (author    (freeze!)   (author   (pour)   (what       (Lafayette
  measured         street      frozen     the                    the                 ships)      Square,
  widths,          frame)      shapes)    hardscape              sidewalks                        then town
  aerials)                                SHAPE)                 = FILL)                           #2, #3…)
```

Read it left-to-right: messy inputs get traced into a clean **frame**, frozen into **shapes**, dressed with **sidewalks**, given a **look**, and **baked** into the slab the public app trusts. We're currently working the early stages (skeleton + survey); the look is largely authored.

---

## What's already figured out (don't re-derive these)

> These are the things we keep having to *stop re-discovering*. Each is a plain phrase you can hold and repeat; the **→** points to the deep home if you need the engineering.

### How the map gets built

- **The skeleton is the first bake.** Before any prettifying, we trace the real streets into a clean, *simplified* frame — a city block should be ~4 corners, not 30 wiggles. Get the bones simple and everything downstream is healthy. → `SKELETON.md`
- **Chains die at the wall.** We start from messy traced street-lines ("chains"). At one point — *the Wall* — we **freeze** them into finished shapes, and after that nobody may reach back to the messy lines. When something looks broken, the first question is always *"did we sneak back across the wall?"* — and the fix is to move the freeze *earlier*, never to patch the messy lines deeper. → `cartograph/PIPELINE.md §Wall`
- **Polygons, not pen-strokes.** The map is made of **shapes** — the block-tiles between streets — not of drawn lines. We paint the sidewalk and grass *inward* from each block's edge. → `cartograph/RIBBONS.md §1`

### The golden rule for fixing things

- **Everything is a shadow of the centerline.** The order is **centerline → block shape → sidewalk ribbon.** The street's centerline is the one true source; the curb is just that line pushed outward by half the road's width; even *what counts as a corner* is read off it.
- **So fix it at the centerline, not the shadow.** If a block or a curb looks wrong, the real bug is almost always upstream in the centerline. Patching the shape while the centerline stays rough is editing a shadow — it comes right back. → `cartograph/RIBBONS.md §1`, `SKELETON.md §3.5`
- **The curb is a concentric offset.** The curb isn't drawn on its own — it's the centerline stepped outward a fixed distance, parallel to it everywhere. Fix the line, the curb follows. → `cartograph/POLYGON-FIRST.md §1`

### What's automatic vs. hand-made (this is the kit)

- **Everything is a best guess, and everything is overridable.** The kit machine-pours any town's geometry, land-use, trees, weather, and content — a strong first draft — and the operator can override *any* of it. Automation's job is to make the guess better; override is first-class at every layer, never a "defect." *(Supersedes "shape is automatic; hand-fixes are bugs-to-zero," retired 2026-07-02.)* → `NEIGHBORHOOD-INPUTS.md §0.0`
- **Let the machine catch the bugs.** Instead of an operator eyeballing every street, one automatic check per kind-of-bug flags the bad ones. That checker is the real prize — it's what lets the kit work on town #2, #3, #100 without a human re-inspecting everything. → `cartograph/POLYGON-FIRST.md §5`
- **The inputs are real, not guessed.** Real city parcels and right-of-way, operator-*measured* street widths, real map geometry, ML building footprints — all fortified against high-res aerial photos. A generic 3D map extrudes a default city; ours is grounded in the actual record, block by block. → `cartograph/INTAKE.md`

### How it ships

- **The slab is the contract.** We pour a flat, dumb, fast "slab" the public app trusts blindly and can't argue with. The catch: **if it isn't baked into the slab, the public never sees it** — what the operator sees in authoring only ships if it travels through the bake. → `SLAB-CONTRACT.md`
- **The player reads three payloads, not one.** The public app is a generic **player**; Lafayette Square is just installation #1 (`?look=lafayette-square`). It reads (1) the **slab** — the *render* (geometry, ground, buildings' render-side, trees), poured by the kit; (2) the **content** — names, history, listings — a separate per-installation layer read *alongside* the slab, not baked in; and (3) the **installation config** (`src/instances/<look>.js`) — identity, geography, branding, and a **module manifest** that switches whole features on or off. **The kit *pours* slabs; the player *plays* them — the consumer app is not itself a kit** (the kit is the authoring side: cartograph/arborist/meteorologist). → `SLAB-CONTRACT.md §0/§C2`, `NEIGHBORHOOD-INPUTS §5.1`, `ls/ARCHITECTURE.md §2`
- **Features are switched by the manifest, not guessed from presence.** Each installation turns on only the features it runs (`INSTANCE.modules.*` — bulletin, delivery/Cary, events, …). "Show it if the data's there" is leaky — a feature with empty data still tries to mount (the ungated-Cary bug) — so the switch is an **explicit declarative flag**, not an inference. LS = everything on. → `ls/ARCHITECTURE.md §6`
- **One compass frame, no trick rotations.** Every coordinate sits at its true GPS position; there are no secret rotation constants hiding in the math. → `cartograph/ARCHITECTURE.md`
- **Everything sits on the ground we actually draw.** On a rolling site, objects look fake the instant they float. So every object — tree, lamp, path — is anchored to the **one rendered ground surface** (a height baked per object), not each guessing its own elevation off a smoother field the coarse ground only approximates. The buildings always worked this way (their foundations); it now covers everything that stands on the ground. → `cartograph/ARCHITECTURE.md §8 "Ground conformance"`

### A few more, settled (won't reopen)
Divided roads stay two centerlines with the median between them · grade-separated roads (bridges/ramps) are pulled out of the block grid and drawn flat · street smoothing rides **one knob** (`STREET_SMOOTH`), never two copies kept in sync by hand · the practice scene ("toy") routes through the *same* pipeline, never a private one · a neighborhood is a **circle with bites taken out** — the auto-fit disc IS the boundary (every building inside is in by default), and the operator draws **exclusion loops** to carve the strays + hand-curates the edge building-by-building; we never trace a perimeter or geocode for geometry (`NEIGHBORHOOD-INPUTS §5.2`, `INTAKE §0.5`). *(Where each lives: the `README` cross-cutting feature index.)*

---

## Find your piece

The project is **four parts** plus the public runtime. Each is documented next to its code in three flavors — **FEATURES** (the pitch: what & why), **OPERATIONS** (the operator's manual: the knobs), and the **dev** docs (how it's built).

| If you're working on… | Go to |
|---|---|
| **The map kit** — streets, blocks, curbs, the bake | `cartograph/` — start `README §⭐ START HERE` (settled-state by stage) + the `README` cross-cutting feature index (where-X-lives) |
| **The public app** — place cards, residences, the courier | `ls/` — `FEATURES` / `ARCHITECTURE` / `STATUS` |
| **The trees** — the kit-matcher tree builder | `arborist/` — start **`arborist/README.md §⭐ START HERE`** (the goal + current state) → **`SALON-INTERFACE.md`** (root — the Salon **plate-rack**, the realized rubric-forward front, 2026-06-25) → `scratch/FOREST-BUILDER-KIT-MATCHER.md` (the ratified architecture); **no-cull** — all trees draw; Authored-only, LiDAR/Procedural kept as peers |
| **The weather** — clouds + sky rules | `meteorologist/` — `README` / `WEATHER-MODEL` |

**The three navigational indexes** (when you need to *find* something, not be *oriented*) — all in `README.md` + `PIPELINE.md`, never `BOZ.md` (that's the coordinator's doc, summoned only when you're Boz):
- `README.md §⭐ START HERE` — the settled conclusion **per pipeline stage**, with status.
- `README.md` Documentation map — **where does X live**: the artifact homes + the cross-cutting feature index.
- `cartograph/PIPELINE.md` — the **execution spine**: how raw data becomes the slab, step by step.

**And when you need to know *what's left*** (not where it lives): **[`ROADMAP.md`](ROADMAP.md)** — the one cross-domain master of all remaining work, ranked and pruned to zero. We're in the home stretch; ROADMAP is the surface we prune the whole board against. Two columns to done (the SHAPE finish + the tree impostor/placement scheme = "works on a phone") + the security close-out, then the cleanup tail toward human-developer engagement, then the approaching horizon.

> *New doc, 2026-06-14 — the executive-orientation surface the doc-system arc called for. Reference-kind; keep it plain and lean. The doctrine here is the colloquial face of the dev canon — when the canon changes, change the one-liner, keep the pointer.*
