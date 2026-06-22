# Stage — the Look tool

> **Status: v0.1 (2026-06-09) — new, the topic-doc.** The keystone Reference for the **Stage** tool — the third of cartograph's three authoring tools (Survey · Section · Stage; `ARCHITECTURE.md §2.1`). Grounded against `bake-scene.js` (the channel inventory it freezes) and the SC.1–SC.7 channel wiring, not assembled from prose. Paired with **`BAKE.md`** (the publish stage that runs `bake-scene.js`) and **`SLAB-CONTRACT.md §4`** (the `scene.json` format).
>
> The Stage is **both** an *idea* (the LOOK stage — `… section → bake → stage`) and a *tool* (the Look-authoring surface in `CartographApp`, plus the standalone `/stage` page). This doc owns *what the Stage authors and how it persists*. It does **not** re-document the `scene.json` byte format (that's `SLAB-CONTRACT.md §4`) or the bake chain that emits it (that's `BAKE.md`).

---

## 0. What the Stage is

The **Stage** authors the **LOOK** — and only the look. Materials, color, visibility, sky, lighting, post-FX, neon, the Gateway Arch, the horizon disc, camera framing, and (forward-compat) clouds. It is the styling counterpart to Survey (shape) and Section (fill): **Looks vary styling, never geometry** (`ARCHITECTURE.md §2`). That invariant is what lets the runtime swap Looks at zero cost — a different `scene.json`, identical geometry.

Two load-bearing facts:

1. **The Stage is wall #2 — the store dies into `scene.json`.** Survey freezes chains→polygons (wall #1); the Stage freezes the live **look store** into a flat snapshot the runtime trusts (wall #2). Past the bake, no store exists — the runtime reads `scene.json` cold (`BAKE.md §0`, `[[project_two_bakes_two_walls]]`).

2. **Every look channel is a *time-of-day curve*, not a scalar.** The Stage's vocabulary is the **TodChannel**: a value authored across the day (dawn / day / dusk / night anchors), so a single Look renders golden-hour, noon, and deep-night faithfully. Sky pivoted (2026-05-20 ADR) to kit-canonical 4-anchor cards + per-Look *sparse overrides*; the rest follow `{ values: {…} }`. The operator drags a slider at the current scrubbed time; the channel records the curve. *(`skyLightChannels.js` defaults · `skyGrid.js` migration.)*

---

## 1. The vocabulary — the SC channel families

"SC" = the **S**cene **C**hannel install sequence (the arc that moved hardwired look-literals into operator-authored channels — `[[hardwires-come-out-when-channels-install]]`). The families, as `bake-scene.js` emits them:

| Family | Channels | Card (authoring surface) |
|---|---|---|
| **SC.1 — sky / light / celestial** | `sky`, `ambient`, `hemi`, `dirSun`, `dirMoon`, `constellations`, `milkyWay`, `skyGain` | Sky & Light |
| **SC.2 / SC.3 — post-FX** | `bloom`, `ao`, `exposure`, `warmth`, `fill`, `mist`, `halo`, `grade`, `grain`, `shadow` | Post |
| **SC.4 — time defaults** | *(none persisted — see §5)* | DawnTimeline (scrub only) |
| **SC.5 — camera** | `shots`, `browseHeading`, `heroSubject`, `heroKeyframes`, `heroMotion` | Camera / Shots |
| **SC.6 — clouds** | `clouds` (forward-compat preset ref) | *(Meteorologist, standalone — §5)* |
| **SC.7 — arch / horizon / lighting** | `arch`, `archLight`, `horizon` | Hero & Horizon |
| **(look base)** | `palette`, `materialPhysics`, `materialColors`, `layerColors`, `luColors`, `layerVis`, `lampGlow`, `lantern`, `neon` | Materials / Surfaces / Neon / **Lamps** |

> **Arch Lighting (`archLight`, 2026-06-22).** The cross-aimed foot uplights split off the `arch` *placement* channel into their **own TOD-animatable** group channel (`ARCHLIGHT_*` in `skyLightChannels.js`) so the *wash* rides a day→night curve while placement stays put. Mounted as a `<TodChannel>` in the Hero & Horizon card; `GatewayArch` resolves it per-frame. Legacy Looks migrate via `migrateArchLight` (uplights carried off `arch`; cone radians→degrees).
>
> **Lamps card (2026-06-22)** — two channels:
> - **`lantern`** — the lamp's own LIGHT SOURCE (the lantern): **Brightness + Glow**, TOD-animatable. Replaces the hardwired `t·0.8`/`t` lantern multipliers in `StreetLights` (operator master × the automatic dusk→night ramp). **The Lantern Brightness also drives the ground POOL's intensity** (the pool IS the lantern's light on the ground — `StreetLights` writes `poolUniform = Brightness × ramp`), and the lamp *colour* (`layerColors.lamp`, the Surfaces swatch) drives the pool's colour. So one light source → lantern + pool, coherent; off by day automatically.
> - **`lampGlow`** now carries only **`{ trees }`** (the tree CANOPY under-glow). The ground pool is no longer a separate `lampGlow.pool` field — it follows the Lantern (above). The pool renders **baked into the ground** (the contour-correct ring map's R channel; G = contact shadow), not a floating disc — see `BAKE.md` / `SLAB-CONTRACT.md §3.1`.

`skyGain` is worth a sentence: it is **exposure scoped to the sky dome only** — it owns "how dark is night" without dimming lamps or lit windows (the single-owner cure for the night-brightness floor sprawl, `ARCHITECTURE.md §7`, 2026-06-07).

---

## 2. The artifact chain

| | |
|---|---|
| **Input** | the operator's intent, dragged on the Stage cards |
| **Working draft** | `public/looks/<id>/design.json` — autosaved within ~300 ms of every tweak (`ARCHITECTURE.md §3` layer 1); survives reloads; never prompts |
| **Who freezes it** | `bake-scene.js` (run as the `scene` step of the bake — `BAKE.md §2` step 6) |
| **Output** | `public/baked/<id>/scene.json` — the flat per-Look snapshot (**wall #2**) |
| **Format SSOT** | `SLAB-CONTRACT.md §4` |
| **Who consumes it** | the runtime's look consumers — `CelestialBodies` (sky/light), `PostProcessing` (post-FX), `GatewayArch` (arch), `NeonBands` (neon), `BakedLamps` (lampGlow), material binders — all via `useSceneJson`, cache-busted by `scene.json.bakedAt` |

**`design.json` is the live truth; `scene.json` is the frozen copy.** `bake-scene.js` reads `design.json` and, for any unauthored channel, seeds the kit default (`*_FLAT_DEFAULTS` from `skyLightChannels.js`) — so an unauthored Look bakes byte-for-byte to today's hardcoded look. Authoring overrides the default; the bake never invents values.

---

## 3. The authoring model — author live, freeze on bake

The Stage is **WYSIWYG**: a color change in Surfaces, a bloom tweak in Post, an arch nudge — all show on screen *immediately* (the runtime re-renders live edits during authoring; `ARCHITECTURE.md §5`). The bake then captures that exact state for handoff. The operator never "saves the bake" — that language is misleading (`ARCHITECTURE.md §3`). The deliberate save action is **forking a new named Look** ("＋ Save as new Look…"); every panel tweak before that just hits the active Look's autosave.

**Looks are material-keyed, never feature-keyed** (`ARCHITECTURE.md §3`): `design.json` says *"asphalt is pink,"* not *"chain-43A12's asphalt is pink."* So adding geometry in Survey/Section never invalidates a Look — new streets inherit the active Look's rules; the re-bake just enlarges the slab with consistent styling. **Survey/Section → Stage is purely additive.**

Where channels persist (verified in `bake-scene.js`):
- **Baked & consumed:** SC.1 (8 channels), SC.2/SC.3 (10 channels), SC.7 (`arch`, `horizon`), `neon`, `palette`, `materialPhysics/Colors`, `layerColors/luColors`, `layerVis`, `lampGlow`, `browseHeading`.
- **Baked, partially consumed:** SC.5 `shots` / `heroSubject` / `heroKeyframes` / `heroMotion` — the *authored* keyframes bake; the *runtime* inputs (Browse altitude, Hero target centroid, Street double-click position) are deliberately **not** baked — they're computed at runtime (`bake-scene.js:115`). Only Browse heading is a fully-baked camera channel today.
- **Forward-compat, not yet consumed:** SC.6 `clouds` — round-trips a `{ preset: 'auto' }` ref so the future `<Atmosphere />` plugs in mechanically; v1's renderer defers to the Almanac (§5).
- **Not persisted at all:** SC.4 time defaults — DawnTimeline calls `setTime` on the shared clock directly; no `design.time` or sun-curve override is written (`bake-scene.js:139`).

---

## 4. Frozen-or-not — what the Stage freezes

- ✅ **Frozen at the bake:** the entire look store, flattened into `scene.json` (every channel above, with kit defaults seeded for unauthored ones). This is wall #2 — past it the store is gone; the runtime reads the flat snapshot.
- 🟡 **Live, by design (not baked):** the runtime camera inputs (Browse altitude from `computeBrowseAltitude(aspect)`, Hero target from the subject centroid, Street position from the double-click handler). These are *derived per device/session*, so baking them would be wrong, not missing (`bake-scene.js:115`, `[[hardwires-come-out-when-channels-install]]` category 3).
- ⬜ **Not yet captured:** SC.4 time defaults (a Look can't yet declare "open at dusk") and the Hero-keyframe *runtime motion* beyond `period`/`easing`. Tracked under "Slab completeness" (§5).

---

## 5. Status — done / partial / forward-compat

**DONE (shipping, consumed in production):**
- ✅ **SC.1** sky/light/celestial — 8 channels baked & consumed (`CelestialBodies`).
- ✅ **SC.2 / SC.3** post-FX — 10 channels baked & consumed (`PostProcessing`); the hardwired night-bloom boost was deleted in favor of operator-authored bloom + `skyGain` (`ARCHITECTURE.md §7`).
- ✅ **SC.7** arch + horizon — promoted off the `archState` module bridge in `StageApp.jsx`; now persists across reloads and reaches production via the slab.
- ✅ **Neon** — per-Look core/tube/bleed curve; defaults `1/1/1`.
- ✅ **Materials / surfaces** — per-material PBR + colors, layer/LU colors, `layerVis` (which is also a bake lever — `BAKE.md §2`).

**PARTIAL (the V1 tail — "Slab completeness" in `BACKLOG.md`):**
- 🟡 **SC.5 camera** — Browse heading fully baked; Hero keyframes author + bake but runtime motion is minimal; Browse altitude / Hero target / Street position intentionally live (§4). Closing SC.5 = baking the full per-shot framing.
- 🟡 **SC.4 time defaults** — DawnTimeline is scrub-only; no "save default hour" / sun-curve surface persists. The field is omitted from `scene.json` until that surface exists.

**FORWARD-COMPAT (round-trips, runtime deferred):**
- 🔮 **SC.6 clouds** — `scene.json.clouds` carries a preset ref; the live `CloudDome` ignores it; the future raymarched `<Atmosphere />` is its consumer. `preset: 'auto'` defers selection to the Almanac at render time (`almanac-eval.js`).

**The Meteorologist relationship (important — and a doc-vs-intent correction).** `STAGE_MIGRATION.md` (2026-05-20) sketched the cloud-authoring UI living *inside* a Stage right-panel card. **That plan was not executed** — Meteorologist shipped as a **standalone app** (`/meteorologist.html`), the "staging area for the slab" (`[[project_meteorologist_is_slab_staging_area]]`). So clouds are authored in Meteorologist (→ `public/clouds/{presets,almanac,modulators}.json`, a *separate* publish-loop), and the runtime `<Atmosphere />` consumes them directly. The Stage's only cloud surface is the forward-compat `scene.json.clouds` ref. *(`STAGE_MIGRATION.md` is historical; this is the current architecture.)*

---

## 6. The doctrine, in one place

- **Looks vary styling, never geometry.** The Stage cannot move a curb; that's Survey. This is what makes Look-swap free.
- **Every channel is a TodChannel.** Author a curve across the day, not a scalar. Kit defaults are seeded for unauthored channels so an empty Look = today's look.
- **`design.json` lives; `scene.json` freezes.** Author live (WYSIWYG); the bake snapshots. "Saving the bake" is not a thing — forking a named Look is the deliberate save.
- **Material-keyed, additive.** New geometry inherits the active Look's rules; Survey/Section → Stage never invalidates a Look.
- **Single-owner channels.** Each look fact has exactly one owner (`skyGain` owns night darkness; bloom owns bloom) — no emergent sums of hidden floors (`ARCHITECTURE.md §7`).
- **Runtime-derived inputs stay live.** Per-device camera math (Browse altitude, Hero target) is computed at runtime, not baked — baking it would be a bug.
- **Format lives in the contract.** `SLAB-CONTRACT.md §4` is the SSOT for `scene.json`'s bytes; this doc owns *what the operator authors and how it persists*.

---

## Cross-references

- **`BAKE.md`** — the publish stage that runs `bake-scene.js` (the paired keystone).
- **`PREVIEW.md`** — the inspection surface that reads the baked Look back (closes `stage → bake → preview`).
- **`SLAB-CONTRACT.md §4`** — the `scene.json` byte format + the `neon`/`lampGlow`/channel fields (the SSOT this doc points to).
- **`ARCHITECTURE.md §2` / §2.1 / §3 / §5 / §7** — the Designer/Stage split, the three tools, the Looks model, live-edit rendering, the single-owner-channel doctrine.
- **`SECTION.md` / `SURVEY.md`** — the two upstream tools whose frozen shape the Stage styles.
- **`meteorologist/` (CANON · WEATHER-MODEL · STATUS · STAGE_MIGRATION)** — the clouds staging area and the (historical) in-Stage migration plan.
- **Code:** `bake-scene.js` (channel inventory) · `src/cartograph/skyLightChannels.js` (`*_FLAT_DEFAULTS`) · `src/cartograph/skyGrid.js` (`migrateSkyChannel`) · `src/stage/StageApp.jsx` · the look consumers (`CelestialBodies`, `PostProcessing`, `GatewayArch`, `NeonBands`).
- **Memory:** `[[project_two_bakes_two_walls]]`, `[[project_meteorologist_is_slab_staging_area]]`, `hardwires-come-out-when-channels-install`, `slab-carries-full-authored-product`.
