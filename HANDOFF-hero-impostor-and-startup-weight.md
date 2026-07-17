# BRIEF — hero-view weight: the canopy-only impostor editorial surface

**Status: DESIGN SETTLED at standup (Jacob, 2026-07-17, evening) — tabled for a sleep, not yet built.**
**From:** the session that landed the LS/HPDM census. **Trunk:** `curb-offset-draw`.
**Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → `arborist/README §⭐ START HERE` → `SALON-INTERFACE.md` → `project_overhead_impostor_capture_fix` (the pattern we mirror) → this.

---

## Why this exists — the driver
The census work landed a **real, dense canopy** (LS 5,768 trees, HPDM 10,352 — both real IRL density, not inflation). That density is beautiful **and** a real cold-load weight. The `?loadAudit` profiler (built this session, see below) measured the LS cold load:

- **~103 MB of real assets** (prod-representative, stripping Vite-dev JS noise), **~98 MB hero-critical**.
- **~73 MB of that is TREES:** `lod1` GLBs **39.3 MB** (15 species × ~2.6 MB) + tree atlas textures **27.6 MB** + `trees.json` 6.4 MB.
- `lod0` (60.8 MB) + `lod2` (1.7 MB) + overhead PNGs (4.8 MB) are correctly NOT hero-critical.

That 39 MB of `lod1` geometry is the target.

## The key realization (Jacob's screenshot, 2026-07-17)
In the LS hero shot the trees are a **distant, dense canopy sea — you cannot see a single trunk**, even though every tree is currently full mesh geometry. So the trunk/branch articulation in the far mass is **invisible weight**. → **Ditch the trunks for the far impostor.**

Also decisive (`captureImpostor.js`): the current `ImpostorSpecies` **captures the real tree at RUNTIME, at load** — which means it must load the `lod1` GLB to capture from, so it saves **zero** weight. The file itself names the fix: *"Salon-authored capture + a baked texture is Phase 2."* The analytic "+"-card (atlas rects) was already tried and **killed** ("floating dark leaf-slabs + a stone trunk", operator 2026-06-25) — do NOT revive it.

## The design — SETTLED
A **canopy-only, nested-band billboard**, authored the same way the overhead impostor was, just re-aimed from top-down to the hero's low side angle. It is a *smaller* effort than a full-tree impostor, not a bigger one — it reuses the overhead pipeline.

- **Far mass (~85%, no visible trunk) → canopy-only impostor.** No trunk, no branches — the leafy mass captured as nested bands (the overhead's branch/mid/canopy slices, tilted side-on for the hero pitch), base-anchored, relit from the same weather uniforms overhead uses (`overheadLightUniforms`).
- **Front row (~15% nearest) → keep the mesh** (trunk + all, `lod1` GLB) — where a trunk might actually catch the eye, so it earns its geometry.

**Weight math:** trade ~39 MB of `lod1` GLBs for ~5–8 MB of baked canopy billboards (the overhead bundle is ~5 MB for 10 species) — authored-for-quality, not scattered quads. A species that goes fully-impostor stops loading its `lod1` GLB entirely (the runtime loads GLBs per mesh-role species).

### Mirror the overhead pipeline exactly
| overhead (built, mastered) | hero impostor (to build) |
|---|---|
| `captureImpostor.js` RTT (browser GPU; Node has none) | reuse, re-aimed low + side-on |
| `OverheadBaker.jsx` rides **Bake→Slab** (`Grove.jsx`) | **`HeroImpostorBaker`** rides Bake→Slab |
| `SpecimenViewport` / Browse view = per-species eye-gate | new **Hero view** = per-species eye-gate |
| → `overheadBySpecies` (baked PNGs, top-level atlas key) | → **`heroImpostorBySpecies`** (baked PNGs) |
| runtime `OverheadSpecies` reads it | runtime `ImpostorSpecies` reads it (**no GLB**) |
| `bake-look` carries it forward (browser-authored) | same |
| swap gated on `useOverheadMode` (camera viewMode) | hero-tier `impostor` role gates it |

### The two remaining dials (the whole open design)
1. **How nested** — how many canopy depth-slices give enough side-on volume/parallax as the camera drifts (overhead used 3 height-bands; hero likely wants 2–3 depth layers).
2. **How many azimuths** — the crux that's *smaller* than feared: a distant, dense, canopy-only mass reads nearly the same across the narrow arc the hero pans, so likely a **handful of angles**, not full octahedral. **Coupled to the hero camera move**: Jacob's smaller-hero-move idea shrinks the arc → fewer angles → each can be more perfect (parallax: less move → flat billboards read as geometry). The hero move is a **dial** (currently 764 m of travel), not a switch.

### Prereqs / traps when building
- ⚠️ **`ImpostorSpecies` carries the armed Matrix4 aliasing bug** (`InstancedTrees.jsx:~435`, identical to the overhead-disc `adc55bcd`) — dormant only because no tree is `impostor`-role today. **Fix it before turning the tier on** or all impostors collapse onto one placement.
- **Turn on the hero-tier threshold** (`bake-trees.js` `HERO_TIER.PROM_THRESHOLD`, currently 0 = all-mesh). Sweep for LS: `0.02→469 mesh`, `0.05→194`; ~15% mesh (~865) ≈ threshold ~0.01–0.015. Re-bake assigns the role.
- **LS is the right scene** — its hero pan is the authored original (HPDM/Altadena fly a byte-identical copy, so their heroTier is against the wrong camera; the "don't ship the cull" caution is about THAT, not LS).
- `bake-look` must carry `heroImpostorBySpecies` forward (browser-authored, can't be CLI-regenerated) — same trapdoor the overhead had (`c195f64e`).
- "It's purely weight" (Jacob) — behaviors/culling already handled; the goal is download+VRAM weight, and the authored quality is what makes the trade invisible.

---

## The startup load-in lane (built this session, UNCOMMITTED)
- **`src/lib/loadAudit.js`** + `main.jsx` wire — a cold-load profiler, opt-in via **`?loadAudit`** (inert otherwise). Prints a copy-pasteable manifest: real-assets (prod-representative) vs dev-only app-JS, HERO vs deferrable, buckets, biggest single assets. `window.__loadAudit()` re-dumps; `window.__loadAuditData` has raw rows. Reads the browser's own resource-timing (device-independent for **sizes + sequence**; the *felt* cost — decode/upload/thermal — is Preview's job).
- **Overhead lazy-gate** — `useOverheadWarm` (`OverheadTrees.jsx`) + `enabled: overheadWarm` (`InstancedTrees.jsx:~899`). The 60 overhead disc PNGs (~5 MB) were loading eagerly during the hero shot (gated on *capability*, not on Browse); now idle-warm-after-hero OR on-Browse-entry, off the startup critical path, no height heuristic (the swap doctrine forbids it). Verified in the audit: overhead reads `defer`, ~4% of load.
- **The other guaranteed weight lever (not yet done):** **KTX2/Basis compress the tree atlas** — 27.6 MB → ~5 MB, smaller on wire AND in VRAM, independent of impostors.

**Preview integration (pending Jacob's aim):** the cold-load spike is already Preview's named crash-on-transition vector + there's an `assets` swimlane waiting — wire `loadAudit` in as a cold-load budget gauge against a named device (the v0.2 measurement arc, ratified/unbuilt). (a) build into Preview now / (b) keep console tool, defer.

## Suggested order tomorrow
1. Decide the two dials with Jacob (nesting + azimuth ↔ hero-move) — standup, then brief-for-dispatch (this may want a dedicated agent, like the overhead marathon).
2. Build the Hero editorial surface (capture re-aim + `HeroImpostorBaker` + Hero view + `heroImpostorBySpecies` + `bake-look` carry) mirroring overhead.
3. Fix the armed aliasing bug, turn on the hero-tier threshold, re-bake, eye-gate.
4. In parallel / meanwhile: atlas KTX2 (surer MB), and commit the load-audit + lazy-gate if keeping.

Memory: [[project_overhead_impostor_capture_fix]] · [[project_ls_tree_census_city_osm_real_only]] · [[project_smooth_pan_is_the_only_perf_target]] · [[project_tree_lod_role_at_bake_not_distance.md]].
