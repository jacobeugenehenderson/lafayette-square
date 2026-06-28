# Features & Roles — the pitch

What Cartograph is and why it's special — the user/investor read (the *brochure* register). **New here?** Read **[`/ORIENTATION.md`](../ORIENTATION.md)** first — the universal first read (what we're building, how it fits together, the settled doctrine in plain language). This doc is the *what & why*; the operator's knobs are in **[OPERATIONS.md](OPERATIONS.md)**, the engineering in **[ARCHITECTURE.md](ARCHITECTURE.md)** / **[PIPELINE.md](PIPELINE.md)** / **[RIBBONS.md](RIBBONS.md)**, the geometry canon in **RIBBONS.md**.

> Part of the **cartograph quintet** (`FEATURES` / `ARCHITECTURE` / `BACKLOG` / `NOTES` / `RIBBONS`). Read at session start; flag contradictions; update at session end. Stale claims are worse than no claims — they actively mistrain readers.

---

## Architecture in one paragraph

Cartograph + Stage produce a **slab** — a baked, flattened, fortified, secure, optimized artifact under `public/baked/<look>/` — that the LS app builds on top of like a building on a foundation. Authoring is slow, careful, fortification work; the slab is fast, dumb, impenetrable substrate the app trusts unconditionally. **Preview** is the slab inspection environment, used during authoring to stress-test the slab (GPU profiler, phone-aspect frame, per-layer cost matrix) before handing it off. The LS app and its end-user features (place cards, businesses, accounts) live downstream.

**The architecture is the deliverable. Lafayette Square is the v1 instance.** Other neighborhoods will pour their own slabs from the same toolkit; other operators will do the pouring. Every design decision is in service of that kit ambition.

## The conceptual model

Cartograph is recursive — each authoring step makes a truth-claim the next builds on:

- **centerlines** (Survey) → *provable truth*: streets exist here, with this geometry
- **+ thickness** (Measure) → *provable truth*: this street is N meters wide on each side
- **+ dimension** (ribbons) → *emergent*: the 3D cross-section per street
- **+ finish** (Stage) → *authored*: materials, palettes, lighting, sky

**Designer is fortification, not invention.** The operator splits, defines, classifies, marks caps and couplers — against aerial-photo ground truth — but doesn't author geometry. All "other" data (buildings, parcels, landmarks, land use) flows through Designer for the same fortification treatment.

**The inputs are authoritative, not guessed.** That "provable truth" rests on real sources — the City of St. Louis's own assessor **parcels + right-of-way**, **operator-measured** street widths, OpenStreetMap geometry, ML-derived **building footprints** — each fortified against max-resolution aerials. A generic 3D map extrudes a default city from one feed; this one is grounded in the *actual* municipal + survey record, which is what lets the geometry be trusted block by block. *(Full provenance: `INTAKE.md`.)*

**The hard geometry is handled by the kit, automatically.** Turning-circle cul-de-sacs (tangent "keyhole" curbs), divided carriageways with medians (straight outer fronts; the median is a *derived* walked face), complex intersections, and the neighborhood edge (streets that fade out instead of being chopped) all resolve **from the data** — not hand-drawn. A generic 3D map fudges or omits these; resolving them automatically is precisely what lets the kit pour the *next* town without an operator redrawing every Place and boulevard. The remaining hand-fixes are a tracked defect count headed to zero, guarded by an automatic correctness suite. *(As-built: `RIBBONS.md` / `SKELETON.md`; the bug-class scoreboard: `POLYGON-FIRST §5`.)*

**Stage is the second authoring environment** — the *theatrical* sense of "stage": where the look gets staged (materials, palettes, lighting, sky, post-FX), finalized into the slab on Bake.

**The light lives in the ground, and the whole look is a curve across the day.** The lamps' pools of light, the soft contact shadows under every tree and lamp, and the way a trunk's lowest metre takes on the color of the ground beneath it are all *baked into the ground itself* — contour-correct, never floating decals. And every look channel — sky, bloom, exposure, lamp brightness, the Gateway Arch's foot-uplights — is authored as a **time-of-day curve**, so one Look renders golden-hour, high-noon, and deep-night faithfully on the neighborhood's own clock. *(As-built: `STAGE.md`; the baked ground-contact maps: `SLAB-CONTRACT §3.1/§3.2`.)*

**The Bake is the slab pour** — the publish moment for cartograph. The artifact ships to the LS app, not directly to end users.

**The slab carries the operator's *full* authored product.** This is load-bearing. Anything authored in cartograph — geometry AND optics (sky, atmosphere, post-FX, exposure, time-of-day, per-shot camera, materials, neon, lamp glow) — must travel through the bake into the slab. The deployed runtime trusts the slab unconditionally and cannot reach back into the authoring store, so **anything authored-but-not-baked is invisible** — the product silently degrades to "operator geometry + procedural-default optics," which isn't the product. The product is what the operator sees in Stage. *(Gap inventory: `BACKLOG.md` "Slab completeness.")*

**Aesthetics + performance are co-equal, non-negotiable.** Aesthetics are the differentiator (what separates this from generic 3D maps); performance is equally important and invisible (mobile playback can't compromise). The whole authoring-time complexity exists to guarantee both at runtime.

*(The geometry doctrine — tiles, ribbons, corners, curbs — lives in `RIBBONS.md`; read it before any geometry work.)*

## Roles, plainly

| Component | Role | Audience | Deployed? |
|---|---|---|---|
| Designer / Survey / Section | Fortification authoring (geometry + tabular data integrity) | Operator | No |
| Stage | Look authoring (materials, palettes, lighting, post-FX, shots) | Operator | No |
| **Bake** (action) | Slab pour — publishes to `public/baked/<look>/` | Operator clicks | N/A |
| Slab (`public/baked/<look>/*`) | Substrate — flat, fortified, secure, dumb | LS app + Preview | Yes (with LS app) |
| Preview (`/preview.html`) | Publish-confidence gate — virtual-device cost, per-platform editorial, thermal/memory/transition | Operator | No (authors the inclusion manifest) |
| LS app | Consumer surface (place cards, businesses, accounts, …) | End users | Yes |
| Aerial photos (in Designer) | Ground-truth verification | Operator | No (max-res, never shipped) |

## The three operator environments

*(What each is, for the pitch. The knobs — every slider and gesture — live in `OPERATIONS.md`.)*

### 1. Designer (`/cartograph.html`, `inDesigner` mode)
**Owns: fortification of all spatial + tabular data against aerial-photo ground truth.** Top-down orthographic, compass-N up, paired with max-resolution georeferenced aerials (never shipped). The operator traces and corrects the street network, paths, lots, park boundary; classifies land use; integrates buildings, parcels, landmarks, lamps — splits, defines, marks caps, sets couplers, but doesn't author geometry. **Toolbar = views, Panel = tools:** the toolbar carries view controls (Aerial, Look/Toy picker, Stage); the panel's 3-part pill (Survey · Section · Design) selects the authoring tool. **Toy is the canonical pipeline test rig** — land geometry/pipeline changes in toy first, then cut LS over (doctrine: `/AGENT-VALIDATION-SURFACES.md`; a new scene routes through the *same* pipeline, never a toy-only branch). Output: `data/raw/{centerlines,measurements}.json` + `data/clean/overlay.json`.

**The Marker — operator↔kit triage.** A freehand pen layer over the map, independent of the authoring tools. The operator circles anything that needs attention — a faceted loop, a mis-traced lot, a feature to revisit — and the strokes persist (`data/clean/marker_strokes.json`) as a durable, shareable punch-list drawn *in place* on the geometry, so "the two loops that are still faceted" is a thing you point at, not a thing you describe. A companion server endpoint (`/analyze`) reports the parcels and blocks under the strokes, turning a circle into a query — *what's under here?* It's how a human aims the kit at the next bug without leaving the map. *(The gestures — eraser · undo · clear → `OPERATIONS.md`.)*

### 2. Stage (`/cartograph.html`, shot modes)
**Owns: look authoring — the theatrical sense.** Perspective camera, multiple "shots" each with their own framing, atmosphere, time-of-day. The operator takes Designer's fortified data as truth and dresses it in a chosen aesthetic ("Look"). Concretely, **you can change the colors** (per-layer + per-building palettes), **set materials** (roughness, metalness, texture, emissive), **author the sky** (gradient, sun/moon, ambient, mist, halo), **shape the image with post-FX** — a cinematic **depth-of-field** that pulls *real* focus (the near sharp, the distance melting — which doubles as an invisible cover for far detail to taper) with a gentle softening reserved for the hero, and a **bloom** that lets a bright sky *backlight* the hero and makes the lamps and neon truly glow, plus exposure, color grade, film grain, ambient occlusion, tune the **streetlamps and the Gateway Arch's uplights**, and compose an **authored Hero camera move** (by *flying the camera* to each keyframe while the shot previews exactly as it ships) — and because **every one of those is a time-of-day curve**, a single Look renders golden-hour, noon, and deep-night faithfully. The artist spends most of their time here. Output: `public/looks/<id>/design.json` per Look. *(Every knob, by card, and how to drive it: [`OPERATIONS.md`](OPERATIONS.md) "Stage.")*

**A Look is a whole authored day.** Not one frozen moment — the operator paints the neighborhood across **seven slots** (dawn → sunrise → noon → golden → sunset → dusk → night), and nearly every atmospheric and post channel rides that clock: sky brightness *and* sky colour, sun/moon/ambient/hemisphere light, the lamps, mist, halo, exposure, bloom, **depth-of-field**, warmth, shadow fill. So one Look can carry a real artistic arc — a moody dawn, a blown-out noon, an electric-colour sunset, a blue-moonglow dusk, a dark night — and each slot is its own composed picture. **DoF** is the romance *and* the invisible level-of-detail cover (near sharp, distance melting away). **Bloom** lets a bright sky backlight the hero and makes lamps and neon truly glow. The streetlamps are **photocell-realistic** — lit before dawn, dark after sunrise. And the whole authored day **bakes into the slab**, so the public app sees the operator's exact look at every slot, not a procedural default.

### 3. Preview (`/preview.html`)
**Owns: the publish-confidence gate — *know* the slab will ship before it does, no push-and-wait.** Renders exactly what production renders, plus the inspection toolkit (per-layer cost, phone frame, layer-toggle matrix, TOD scrub) — and the proving ground where the operator (a) reads each channel's *tax against a target-device budget* — benchmarked to **two real reference phones** (iPhone 16 Pro Max as the ceiling, a Samsung Galaxy A54/A55 as the floor we guarantee), not the operator's desktop, (b) makes the **per-platform editorial call** (which channels ship to desktop vs. mobile) right beside the gauge that responds, and (c) catches the three things a fast desktop hides — thermal, memory, and crash-on-transition. If a layer is too hot here, it surfaces before a mobile user feels it; if something looks right in Stage but wrong in Preview, the bake didn't propagate. Model: `PREVIEW.md`. *(The named-virtual-device emulator + the re-aimed budget gauges + the shared blur-pyramid tuner are the in-flight v0.2 arc — `HANDOFF-preview-measurement.md`.)* *(Every inspection control — the device picker, the layer-toggle matrix, the gauges, the shot picker — and how to read them: [`OPERATIONS.md`](OPERATIONS.md) "Preview.")*

## Helper apps

Each authors a discrete content type, ships one canonical artifact, knows nothing about the runtime (`ARCHITECTURE.md §1`).

- **Arborist** (`/arborist.html`) — tree species library, per-species workstage, and **Grove** (per-Look roster + curation gallery). Bakes tree placements + per-Look atlases consumed by `InstancedTrees`. *(Build history + procedural-tree phases → `arborist/NOTES.md`.)*
- **Meteorologist** (`/meteorologist.html`) — clouds & weather rules; authoring UI lives inside Stage. Publishes `public/clouds/{presets,almanac}.json`. *(`meteorologist/` docs.)*

## Where the engineering lives

The render/bake internals that used to sit here moved to their proper homes (2026-06-14) so this stays the pitch:
- **Render & bake internals** (layering & depth precision, terrain doctrine, the 5-env render topology, neon renderer, async-bake + cache-bust + dirty-skip, the data-flow diagram, frame discipline, map-state) → **`ARCHITECTURE.md §8`** + the §7 conventions.
- **Operator knobs** (corner-radius kit, Sky Layer Gain, Hero bounce, bake buttons, alley-cap, tube radius, drag) → **`OPERATIONS.md`**.
- **The settled doctrine in plain language** → **`/ORIENTATION.md`**.

## Pointers

- `ARCHITECTURE.md` — file layout, the publish-loop pattern, render/bake internals (§8)
- `OPERATIONS.md` — the operator's manual (every knob)
- `PIPELINE.md` — the execution spine (raw data → slab, P1–P15)
- `RIBBONS.md` — the geometry canon (tiles / ribbons / corners / curbs)
- `BACKLOG.md` — current punchlist · `NOTES.md` — historical decisions
- `arborist/SPEC.md` · `meteorologist/SPEC.md` — the helper kits
