# Arborist Features

**What this is.** The Arborist is the kit's tree factory. It turns a real tree species into one reusable, baked model — real geometry, photographed bark, a leaf model that tracks the season — and stamps that model across a neighborhood's canopy. You feed it the species a neighborhood actually has; it gives back the actual trees, at correct botanical heights, standing on the real ground.

**How you make one.** In the Salon you compose a species from parts you can see: a chassis (the woody geometry), a bark, a leaf pack. Publish, and the pipeline bakes three LOD tiers plus a per-Look master atlas that de-duplicates shared bark and leaf tiles — so the *second* hero species costs almost nothing to add. (Procedural and LiDAR authoring are kept as peer tracks; Scan is legacy.)

**What ships today, exactly.** Every tree in Lafayette Square paints — nothing is dropped. The **impostor is the foundation**: each placement renders as a captured canopy billboard, and the **tallest 15%** keep real `lod1` mesh geometry as anchors sprinkled through the scene, so articulated branch-motion and parallax read against a canopy sea that breathes with the same wind. Two impostor constructions are live, split by viewing hemisphere — the **overhead** 3-slice snapshot for browse (zoom out and the whole scene swaps), the **hero** azimuthal canopy bands for the low side-on pan. Both are render-to-texture captures of the actual tree through the shared atlas, so they match their mesh neighbours in colour and season. The geometry budget is a dial (`?heroGeom=`). **Not yet:** the load-streaming that orders GLBs along the pan, the Stage knob for the budget, and KTX2 compression — the hero pool is still ~70 MB of PNG, so this is a look claim, not yet a weight claim. → `ARCHITECTURE.md "Tree-render reality at LS"`.

**What it produces** (the contract the runtime consumes): per-species `skeleton-N.glb` at three LOD tiers + leaf-anchor `tips-N.json` + `manifest.json`, and per-Look atlas artifacts under `public/baked/<look>/`. The same inputs bake byte-identical output, every time.

---

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Operator-facing surface of the helper. Read at session start to know what's already shippable vs. what's still in flight. `BACKLOG.md` carries the in-flight items; `ARCHITECTURE.md` carries the load-bearing patterns; `NOTES.md` carries the dated decision record.

> 🌳 **The Arborist IS the Forest Builder kit-matcher now — not "being rebuilt."** Current contract + front door: **`README.md §⭐ START HERE`**; ratified architecture + staged plan: `scratch/FOREST-BUILDER-KIT-MATCHER.md`. **Built (2026-06-18/20):** the keystone (`rubric.json` 19 axes + `dossiers/` the 10 priority species), the spine (ingest+tagger → `part-index.json` + canonical `public/library/`, the matcher, readiness folded into the **Coverage** "Kit · C·B·L" column, the **Salon** wired to ranked **options** + a **reference panel**), and a **functional leaf model** (derived leaf-size · **Leaf Ways** arrangement · whole-crown fill · varied tile-atlases · an **Authored vs Synthesized** leaf-source toggle). *Open:* the leaf **season/color ramp** (§6); the **LS bake-proof** (Stage-2 gate). The operator surface below is the as-built the kit **rides** — the publish spine is **KEPT, not forked**; the leaf-colorer + bark fixes are now **rubric axes**. Doctrine: **no-cull** (hero-LOD/DoF **parked**, not deleted) · **Authored-only** active, **LiDAR + Procedural kept as equal peer tracks**.

---

## What the helper produces

Per-species runtime artifacts under `public/trees/<species>/`:

- `skeleton-N.glb` — one published variant per `N`, at 3 LOD tiers (`skeleton-N-lod0.glb` / `lod1` / `lod2`)
  - ⭐ **`lod0` is the SOLO lod** (2026-08-23): nothing in the map loads it — `InstancedTrees#lodForRole`
    returns `lod1` for every role — so its only consumers are the Grove tile, the diorama/embed and the
    coming street view, each showing ONE tree. It is therefore emitted **pristine**, before the
    destructive decimation levers and with no bracket simplify, and **matches the Salon's own build
    exactly**. ⛔ Do not re-cut it for weight: the bracket exists to bound INSTANCED cost.
  - `lod1` is the SHIP lod — the map's mesh anchors AND the source every impostor is captured from.
  - ▶ `python3 scratch/_wren-glbstat.py public/trees/<sp>/skeleton-1-lod0.glb`
- `tips-N.json` — leaf-anchor positions for per-instance jitter / wind
- `manifest.json` — per-species metadata: variant list, `quality` / `qualityOverride`, `bark` spec (photo-PBR material ref + tint defaults + uvScale), `leafCluster` ref (per-hero), `deformer.range`, and **botanical mature height in meters** (2026-06-25 — `publish-glb.js#normalizeScale` targets the species' dossier `chassis.size`, so a sugar maple ships ~21m and a dogwood ~8m; `mature-heights.json` is the stopgap for roster species without a full dossier yet — see ARCHITECTURE "Botanical mature height")
- `public/trees/index.json` — roster index aggregating all species

Plus per-Look atlas artifacts emitted by `bake-look.js`:

- `public/baked/<look>/trees-atlas.json` — master atlas tile map, `barkBySpecies` block, per-species overrides, `deformerBySpecies`, and (dormant) `impostorBySpecies` layer plans
- `public/baked/<look>/trees/<species>/...` — placement-substituted GLBs for the Look

These are the contract the deployed runtime (`InstancedTrees.jsx`) consumes. The helper's job is to keep them deterministic and pristine.

> 🌲 **What ships to LS today (tree-render reality, 2026-07-22):** the **impostor is the FOUNDATION** — every placement paints as a captured canopy billboard and the **tallest `heroGeomFraction`** (default 0.15, live via `?heroGeom=`) keeps real lod1 mesh as anchors. **Nothing is culled** in foundation mode: the old hero-pan prominence `cull` was dropping most placements onto bare ground and is retired — ⛔ **but only for looks that HAVE their hero impostors baked.** A look with no `heroImpostorBySpecies` still culls, onto ground that already carries a contact-shadow ring for every placement — **circles without trees is that defect**, and the fix is always to shoot the missing impostors in the Grove, never to re-tune the cull. The runtime warns; ▶ check every look at once with `node scratch/claims-every-shadowed-placement-renders.mjs`. Two impostor systems, by viewing hemisphere — **overhead** 3-slice snapshot (`overheadBySpecies`, browse) and **hero** azimuthal canopy bands (`heroImpostorBySpecies`, the side-on pan) — both RTT captures of the real tree on the shared atlas material, both browser-GPU authored and carried by `bake-look`. ⛔ The whole-tree octahedral cross (`impostorBySpecies`) is **killed, not parked** — don't revive it. Visual distance is the **depth gauges'** job (DoF/fog — "DoF is the cover"). ⚠️ **Don't read the Preview GPU gauge as a perf signal** (count-vs-fake-budget, ignores frame-ms, red even with no trees) — gate tree perf on real device frame-ms + the operator's eye on the cinematic pan. Full as-built + doctrine + the open weight/streaming work: ARCHITECTURE "Tree-render reality at LS."

---

## Authoring surfaces — the Salon composes; ⛔ Procedural / LiDAR / Scan are RETIRED

> 🌳 **Doctrine (2026-06):** **Authored-only (Salon) is the active track; Procedural + LiDAR are kept as equal PEER tracks** (reachable, not retired). Only the **Scan** Workstage is genuinely legacy/deprecating. Where the prose below calls Procedural/LiDAR "legacy," read "peer track (kept), reachable via `?legacy=` dev-fallback URL."

**Post-Brief-18A (Mullion, 2026-05-23)**: the Arborist UI (`/arborist`) opens **directly into the Salon Workstage** — there is no Library landing, no mode-selector chrome at the top. The header reads `Arborist / Salon` (brand) + `LookPicker` + `Grove →` button. Procedural, LiDAR, and the legacy Scan Workstage stay reachable only via dev-fallback URL params (`?legacy=procedural`, `?legacy=lidar`, `?legacy=workstage&species=<id>`, `?legacy=grove`) during the transition to Brief 18B (source-picker — merges Procedural + LiDAR's authoring affordances into Salon's slot card; queued). All workspaces' `← Library` buttons now read `← Salon` and route home to the Salon Workstage.

The four authoring paths (Salon + the three legacy modes) all share the same publish pipeline and the same per-Look atlas pass. The chrome flattened; the publish contract did not change. Below, each path is documented; Salon is the operator's canonical surface as of 2026-05-23.

### ~~Scan · Procedural · LiDAR modes~~ — ⛔ RETIRED 2026-08-23

⛔ **We are not using procedural or LiDAR** (Jacob, 2026-08-23). Their knob tables, layouts,
extraction loops and endpoints are retired to `_archive/FEATURES-procedural-lidar-2026-08-23.md`.
The three workstages remain on disk and **are still compiled into the deployed bundle** —
removal is a separate job, scoped in `LEDGER-exorcism-wren.md §B`.

### Shelves (`src/arborist/ShelvesWorkstage.jsx`, `?legacy=shelves`)
Curate the SUPPLY: browse all chassis and assign each ONE of the nine habits, so a species can
land on the right shelf. ⚠️ **This is the app's real bottleneck** — only a handful of chassis are
RATIFIED, and most of the rest carry a value GUESSED from the chassis's own `source.species`, which
the keying doctrine says keys nothing. `ORIENTATION.md §2`.
▶ `node -e "const p=require('./arborist/state/part-index.json').parts.filter(x=>x.partType==='chassis');const h=x=>x.tags?.['chassis.habit'];console.log('ratified',p.filter(x=>h(x)?.ratified).length,'| valued',p.filter(x=>h(x)?.value).length,'| of',p.length)"`


### Salon mode (`src/arborist/SalonWorkstage.jsx`, Brief 1 shipped 2026-05-21; roster-driven nav Brief 26; **rebuilt as the plate-rack 2026-06-25**)

> ⭐ **REBUILT 2026-06-25 — the Salon is now the rubric-forward "fashion-plates" rack.** The **current surface** is `SALON-INTERFACE.md` (root, §5/§7). What changed: **chassis · bark · leaf are visual PLATES** (chassis = live gray silhouettes, `ChassisPlate.jsx`; bark = swatches; leaf = cutouts) with per-plate **★ Approve** + `(Add +)`; edits **autosave**; a **3-variants** toggle eye-gates the deformer; the deformer is **automatic by morphology** (panel retired). **Retired:** the Deformer panel, the Bark gradient editor, Adopt, Re-publish, the Oubliette, Studio/Worm; Tilt/Y-up moved to an "advanced" drawer; the bio card moved to the tools rail (inline photos). The detail below describes the *pre-rebuild* knob surface — kept for the schema/publish mechanics it documents, but for the live UI read `SALON-INTERFACE.md`.

Fourth top-level mode. The Salon pivots from *generation* (Procedural / LiDAR — synthesize a tree) to *composition* — operator picks **chassis + bark + leaves** from existing libraries and the publish pipeline emits a compatible artifact unchanged.

**Why it exists:** the Salon arc is the operator's call to ship v1.5 by composing rather than synthesizing. Two prior generation-focused arcs hit ceilings (Phase G.1 procedural progressing slowly; Li'l Vera LiDAR shelved 2026-05-20 at N.3.0). The Arborist already has the publish pipeline, atlas system, and runtime contract — Salon is a parallel authoring surface that emits compatible output.

**Roster-driven navigation (Brief 26).** The Salon's authoring **unit is the ROSTER species** (what Lafayette Square needs), not the library species. The old "SPECIES" dropdown is gone; the top nav is a **roster navigator** (left column, `RosterNavigator`) listing every canonicalized park species from `GET /coverage` (Brief 24's join) — each row shows placement count and a **readiness light**, filterable by name + state.

> ### ⛔ ALL THE PARTS ASSIGNED → GREEN. MISSING SOMETHING → YELLOW. *(Jacob, 2026-08-27)*
> 🟢 complete · 🟡 missing something, and you can act · 🔴 no library coverage yet · ➖ marked not-available. **Four states. ⛔ Do not add a fifth** — a new colour is paid by every reader of a 167-row rail forever; the tooltip carries *why*, which costs nobody who isn't asking.
> **⭐ WHAT CHANGED IS WHAT "ALL THE PARTS" COUNTS.** It meant the INPUTS exist — a chassis, or a model that literally is this species. Whether the impostor actually **came out of the bake** lives in the baked atlas, which this surface never opened, so a tree could be green and ship as **MESH at every distance** (*"the light shouldn't be green if it's not going to export the impostor"*). The light has now moved twice the same way: botanical coverage → *a composition exists* → **it exported**. *(The first move was Tuliptree: green, and it opened blank.)*
> ⛔ A species **below the bar** substitutes to a neighbour and is *supposed* to have no impostor — flagging it would call the operator's own bar a bug. Eligibility comes from the shared `resolveGrove`, never a second opinion.
> ### ⭐ AND SINCE 2026-08-28 THE "no impostor" LIST MEANS SOMETHING NARROWER — read it as a shopping list.
> The library carries the SAME TREE under two ids: a composed one and a **raw Latin twin** (`blackgum`/`nyssa_sylvatica`, `oak_white`/`quercus_alba`). A placement that landed on the raw twin could never impostor — no composition → no bark record → a blank capture the baker correctly refuses — and **no amount of re-baking cleared it**, which is why those names sat in this banner for months. `bake-trees` now swaps a raw twin for its composed sibling automatically (LS: 670 placements), so ⛔ **a name still listed here has no composed sibling at all** — it is a species nobody has composed yet, not a routing accident. Compose it in the Salon and it leaves the list.
> ⚠️ It is a **bake-time** decision: the banner clears after **Bake → Slab**, not on reload.
> ▶ Offline, every look: `node scratch/claims-the-roster-light-tells-the-truth.mjs`. ⛔ Don't quote counts from this doc — run it. Clicking a roster species opens the **inside authoring view**: the existing composition controls (chassis + bark + leaves + height/transform), re-parented under that species, plus a **recommended ↔ show-all** candidate toggle and a **Mark not-available** action.

**The keying spine — canonical-id-per-roster-species (settled 2026-05-25).** Every roster species resolves to exactly one **canonical library-species-id = a deterministic slug of its canonical roster name** (`Oak, Pin` → `oak_pin`, `Ash, Green` → `ash_green`; `roster-coverage.js#slugifyRoster`). Distinct per roster species (Pin Oak ≠ Willow Oak — no more "all oaks collapse to one"), no botanical auto-guess; the operator can hand-rename a slug to a botanical id in `park_species_map.json` later. Composing writes the composition under the canonical id (`state/<canonicalId>/compositions.json` → `public/trees/<canonicalId>`, via the **unchanged** publish path — `listSalonSpecies` auto-includes any id with a compositions file) **and** sets `park_species_map[rosterName] = [canonicalId]` (the routing source of truth read by `bake-trees.js#pickVariant`). The chassis is **free geometry** — picking any chassis (incl. an unlabeled split / generic via *show all*) IS the assignment; the chassis's own `source.species` keys nothing. The shared join + canonical resolution + candidate computation live in one module, **`arborist/roster-coverage.js`** (lifted from Brief 24's inline `/coverage` handler).

- **Candidate scope:** *recommended* = chassis whose `source.species` is one of the roster species' covering library ids (the coverage join's literal/cousin candidates), intersected with the catalog so procedural/forest chassis stay excluded; *show all* = the full chassis catalog.
- **Not-available:** marks a deliberate gap — writes `park_species_map[rosterName] = []`. The roster species is recorded as not-available and shown as such; *bake honoring "→ no tree" is a deferred `bake-trees.js` follow-up* (out of Brief 26's scope walls — authoring/routing only).

**Workstage layout** — fork of `ProceduralWorkstage.jsx` with the per-slot controls rail and data wiring swapped (~70% lifted intact: slot tabs, viewport, LoD selector, perf gauge, wind toggle, DraftSlider, header/footer pattern). The replaced sections are:

| Section | Knobs | Notes |
|---|---|---|
| **Chassis** | Picker dropdown (filtered/ranked by species morphology), height-range readout | Reads `public/trees/_chassis/<name>.glb` + `<name>.meta.json` sidecar (Whittle, Brief 0). Chassis-library empty → workstage shows a regenerate instruction (`node arborist/survey-deleaf.js`). **Every chassis ships dominant-trunk-base at ~origin, Y-min at 0** (Brief 20, Sextant 2026-05-25 — recentered at source; `heightRange` is now `[~0, H]`). |
| **Bark** | Ref dropdown, uvScale X/Y `DraftSlider`s, tintBase + tintJitterRange color pickers, roughnessOverride `DraftSlider` | Lists `public/textures/bark/<ref>/`. |
| **Leaves** | Pack dropdown, occupancy + scale `DraftSlider`s, tintFront + tintBack color pickers | Lists `public/textures/leaves/shapes/<pack>/shape.png` — RGBA composites of vendor Color RGB + Opacity alpha. Brief 1.5a (Sequoia) shipped `palmate`/`lobed`/`ovate` (LeafSet010/016/005). Brief 1.5e (Fern, 2026-05-21) expanded the library to 10 packs: `+ serrate_ovate` (LeafSet001), `+ heart` (LeafSet004), `+ elm_autumn` (LeafSet007), `+ oak_autumn` (LeafSet012), `+ lanceolate` (LeafSet013), `+ long_needle` (LeafSet019), `+ ovate_large` (Leaf001). Each pack carries a `meta.json` sidecar (`morphology`, `naturalSize` in cm, `recommendedSpecies`, `source`) — Phase F-prep metadata; today documentation only, scale knob stays operator-driven. Falls back to flat `public/textures/leaves/*.png` when no shapes/ dir present. |

**Per-slot actions** (footer): ↺ Reset · → Set canary · manual Name input *(✓ Adopt retired 2026-06-25 — autosave persists every edit; the footer is now a slim "edits autosave; bake from the Grove" hint)* (no dice — compositions are deterministic from chassis + bark + leaves; no seed roll). The canary button (Brief 8, Linnet 2026-05-22) mirrors Grove's writer and is enabled only when the composition is not dirty, has been published (`variantId` exists in `public/trees/<species>/manifest.json#variants`), and a Look is active; tooltip surfaces the highest-precedence unmet condition. The slot tab carries a small `CANARY` chip when its composition is the active Meteorologist canary (subscribed via `storage` events — cross-tab + same-tab via the synthetic event the store action dispatches).

**Species set (`listSalonSpecies`):** union of (a) species with at least one chassis in `_chassis/` (via `meta.source.species`) AND (b) species with an existing `arborist/state/<species>/compositions.json`, minus procedural + LiDAR-Scan species. Post-Brief-26 the operator navigates by roster species (above) rather than this library-species set, but the set still gates the publish path (which includes any slug id once its compositions file is written).

**Persistence:** the Salon-open flag persists to `localStorage` so reloading inside Salon returns to Salon (mirrors the `activeLookId` pattern). The other modes (Procedural / LiDAR / Grove) intentionally don't persist.

**Effective-value layering** (server-side, surfaced in `effective` per composition): `DEFAULTS → CHASSIS_DEFAULTS → operator overlay`. UI controlled selects bind to `effective.*`. Store action `setSalonSlotParams` mirrors patches into both `params` and `effective` so changes reflect immediately without a server round-trip.

**Composition data model** — per-species overlay at `arborist/state/<species>/compositions.json`:

```json
{
  "compositions": [
    {
      "slot": 1,
      "name": "<operator label>",
      "chassis": "<chassis-name from _chassis library>",
      "bark":    { "ref": "Bark007", "uvScale": [1.5, 4], "tintBase": "#3a2820", "tintJitterRange": 0.12, "roughnessOverride": 0.8 },
      "leaves":  { "pack": "palmate", "occupancy": 0.7, "scale": 1.0, "tintFront": "#3a7530", "tintBack": "#a8b89a" },
      "deformer": {},
      "transform": { "posOffset": [0, 0, 0], "rotation": [0, 0, 0], "scale": 1 }
    }
  ]
}
```

`deformer` is filled by Brief 3A (Cant, 2026-05-25) — `deformer.range = { lean:[lo,hi], twist:[lo,hi], wander:[lo,hi] }` (lean/twist radians, wander metres); see "Per-instance deformer" below. Brief 4 adds camera-aware hemisphere cull. Brief 2 (Holm, 2026-05-21) shipped multi-stop gradient bark on top of this schema — see "Bark gradient maps" below. `transform` (Brief 19) is the authored gizmo correction — absent/identity renders byte-identical (back-compat).

**Authored chassis transform — persist + bake (Brief 19, Quartz 2026-05-25):** the Salon gnomon gizmo (rotateY / posOffset / scale / tiltX-Z drag handles + rotate ring + the "Y-up trunk 90°X" button) stands-up, centers, and scales mis-oriented vendor chassis (kit models often arrive Z-up / off-center / leaning). The authored value persists to `composition.transform` (`{posOffset, rotation:[tiltX,rotationY,tiltZ] radians XYZ, scale uniform}`) and **bakes into the published GLB geometry** so the chassis ships exactly as the operator saw it. *Was inspection-only* — local state reset on every slot/chassis switch, never written; the Z-up flip evaporated on publish. **The bake replicates the viewport composition exactly** (`[[project_preview_equals_ls_literally]]`): `SpecimenViewport.jsx`'s `<Skeleton>` composes `R · S · T_posOffset · T_autocenter` — it auto-centers the dominant-trunk base (`computeDominantTrunk`) to the bullseye BEFORE the authored transform, so rotation/scale pivot about the **trunk base, not the group origin**. `generate-salon.js#bakeAuthoredTransform` bakes the **conjugated** form `v' = T_autocenter⁻¹ · R · S · T_posOffset · T_autocenter · v` (in-place: correction about the trunk base, base stays put; identity → geometry untouched, byte-identical). Persist + hydrate is client-side (gizmo `onChange` → `onParams({transform})`, hydrate on slot/chassis switch); the bake runs **only on the publish path** (`writeMultiCompositionGLB`) — the live preview leaves the transform to the gizmo, so the published GLB carries it baked once with no runtime double-transform. Restores Brief 3A's premise (merge-time pivot now reads corrected geometry). The separate global off-origin lean / wind-frame bug is fixed by **Brief 20** (Sextant 2026-05-25 — chassis recentered to dominant-trunk origin at source; on a recentered chassis `T_autocenter ≈ I`, so this conjugation degenerates to plain `R·S·T` about origin and keeps working trivially — authored `posOffset` stays valid because the recenter does at source what the viewport auto-center did at display).

**Leaf emission stub (Brief 1):** chassis `leafAttachmentTags` are operator-authoring fields populated post-Brief-1. While the array is empty, the generator samples a deterministic placement set from the chassis's upper-bbox volume (mulberry32-seeded by `hash(chassis|bark.ref|leaves.pack)`) so the operator has visible leaves to author against. The lifted D.1b helpers consume that point set just as they consume terminal-tip positions in the procedural path.

**Chassis curation (Brief 1.5b, Quill 2026-05-21):** the Salon Chassis section gains a curation surface so the operator can rename and approve/reject chassis from the 141-entry library. Lives at `arborist/state/_chassis-curation.json` (sibling to compositions; never under `public/trees/_chassis/` so it survives Brief 1.5c's upcoming `survey-deleaf.js` re-run). Schema is `{chassis: {'<name>.glb': {displayName, approved, notes}}}` where `approved` is tri-state (`true` / `false` / `null = unreviewed`). The Chassis section now carries: (a) an **Approved only** filter checkbox (default ON) — when ON, the picker drops chassis whose `approved !== true`; (b) **dropdown labels** = glyph (★ approved / · unreviewed / ✗ rejected) + `displayName` (falling back to filename) + morphology + max-height; (c) a **curation row** below the picker — `displayName` text input (commits on blur or Enter), tri-state Status button (cycles unreviewed → approved → rejected → unreviewed), notes textarea (collapsed until the operator clicks "+ Add note"). Endpoints: `GET /salon/curation` and `POST /salon/curation/:chassisName`; POST merges with absent-keys-preserved (only fields present in the body touch the file; `null` for displayName/notes clears, `null` for approved restores unreviewed; empty entries are pruned). Paired `_chassis-curation.defaults.json` carries the schema doc + an empty `chassis: {}` backstop.

**Bark gradient maps (Brief 2, Holm 2026-05-21) — ⛔ EDITOR RETIRED 2026-06-25.** The multi-stop `BarkGradientEditor` UI is removed from the Salon — bark color is a rubric axis + the **posterize recolor** now (`SALON-INTERFACE.md §2`). The runtime LUT/atlas machinery below is **dormant, not deleted** (an authored `gradientStops` still renders). *Original:* above the legacy single-tint controls, each composition's Bark section gains a `BarkGradientEditor` block — **Use gradient** checkbox, CSS-`linear-gradient` ramp visualization, per-stop t-slider + color picker + delete (disabled at the 2-stop minimum), and a **+ Add stop** button that inserts at the largest-gap midpoint with interpolated color. Stops persist as `composition.bark.gradientStops = [{t, color}, ...]` via the existing overlay POST. Last-authored stops are stashed in a component ref so a toggle-OFF / toggle-ON round trip preserves the operator's work. Backwards-compat: compositions without `gradientStops` render through the Brief 1.5a single-tint runtime path unchanged. Toggle OFF clears stops on disk; toggle ON reapplies stash or seeds a sensible 2-stop ramp from `tintBase`. At publish time, `generate-salon.js#patchManifestForSalon` writes per-variant `manifest.json#/variants[i].bark.gradientStops` (composition[i] → variantId i+1, matching publish-glb's emission order). `bake-look.js` compiles each ramp to a 256×1 sRGB RGBA LUT (sha1-deduped — identical ramps across compositions/species collapse to one tile), packs the LUTs as a third `barkGradient` sub-atlas page inside `unifyAtlases`, and emits `trees-atlas.json#/barkGradientByVariant[species][variantId] = { offsetU, offsetV, scaleU, scaleV }`. Runtime: three uniforms on the shared `treeAtlasMaterial` (`uUseBarkGradient`, `uBarkGradientTileOffset`, `uBarkGradientTileScale`); the fragment chunk samples the LUT from the existing `map` sampler at `vec2(jh4, 0.5) * Scale + Offset` where `jh4 = fract(sin(dot(vWorldXZ.xz, vec2(521.7, 233.1))) * 43758.5453)` — a fresh per-instance hash channel uncorrelated with `tintJitter`'s `jh1/jh2/jh3`. Gradient tint replaces the legacy single-spec/region tint via `mix(barkTint, gradientTint, uUseBarkGradient)`. Uniform-driven branch on the same compiled program — Bloom-stable single shader program preserved. `InstancedTrees.jsx#applyBarkUniforms(material, barkSettings, gradientSlot)` reads the per-variant slot keyed by `(urlToSpecies, urlToVariantId)`; absent slot → `uUseBarkGradient=0` → legacy path. Bake's atlas-survey path is untouched (LUT tiles aren't GLB-material-bound).

**Bark Detail Texturing (Brief 2.1a, Cinder 2026-05-21):** an additive composite layer over whatever bark color path produces — single-tint, gradient-on, gradient-off all unaffected. Gaming-standard Overlay-blend technique (Unreal Detail Texture / Unity HDRP Detail Albedo). Pre-bake: `arborist/extract-bark-detail.mjs` runs once per bark library refresh — for each `public/textures/bark/<ref>/color.jpg`, applies sharp's Gaussian blur (σ=15px on 1024 source), subtracts blurred from original + centers on 0.5 grey, writes `detail.png` (greyscale, single-channel, ~700KB–1.2MB per ref, idempotent with mtime-touch on no-op). At bake: `bake-look.js` collects each roster species's primary bark `materialRef` (trunk wins for region-split), reads the matching `detail.png`, packs as a fourth `barkDetail` sub-atlas page inside `unifyAtlases` (same master PNG — no new sampler binding, Bloom-stable). Emits `trees-atlas.json#/barkDetailBySpecies[<species>] = { uvTransform, barkTileUV }` — the second field carries the species's primary bark tile bounds in unified-atlas space so the runtime can recover local-UV from `vMapUv` (which spans only the bark sub-region) before mapping into the detail tile. Runtime: five new uniforms on `treeAtlasMaterial` (`uBarkDetailTileOffset/Scale`, `uBarkDetailStrength` default 1.0, `uBarkTileOffset/Scale`); the fragment chunk runs the Overlay-blend `mix(2*ab, 1-2*(1-a)*(1-b), step(0.5, a))` on the FINAL bark color and mixes the composite back via `uBarkDetailStrength`, gated by `vBark` so leaf fragments pass through identity. Uniform-driven, single compiled program. `applyBarkUniforms` reads the per-species slot via URL→species; absent slot → identity (no detail bound). For region-split species (trunk + branch ref different), only trunk's detail composites — branch fragments receive trunk's detail map keyed against trunk's bark tile bounds, which is a known visual approximation pending Phase G detail-per-region work.

**Per-instance deformer (Brief 3A, Cant 2026-05-25):** the compose-don't-synthesize capstone — one chassis renders ~100 visually-distinct instances via per-instance vertex-shader displacement, no extra baked variants. Three rigid ops applied to `transformed` in the shared `treeAtlasMaterial` vertex shader BEFORE Sough's wind sway (wind oscillates around the deformed rest pose): **lean** (tilt toward a per-instance compass azimuth, angle grows base→top so the base stays planted), **twist** (rotation about local Y, angle grows base→top), **wander** (sinusoidal-in-height XZ drift of the centerline). All pivot about the trunk base = **origin** (Brief 20 recenter — no per-chassis pivot). Each op's per-species `[lo,hi]` range is now **morphology-derived automatically** (A1, 2026-06-25 — `generate-salon.js#DEFORMER_BY_MORPHOLOGY` keyed on chassis morphology `broadleaf`/`conifer`/`columnar`/`weeping`, injected at `resolveEffective`; the Salon **Deformer panel is retired** — ⚙️ **operator knob = the `DEFORMER_BY_MORPHOLOGY` table**, tune magnitudes there, eye-gate pending), sampled per-instance by a world-XZ hash seeded from the **instance anchor** (`instanceMatrix[3].xz`, `modelMatrix[3]` fallback in the non-instanced Salon preview) so every vertex of one tree shares one signature and a fixed-XZ tree always deforms identically (deterministic). Fresh hash channels `dh5/dh6/dh7/dh8` (vertex-side, uncorrelated with the fragment `jh1-jh4`). **Normals stay correct without inverse-transpose:** the ops are rigid rotations, so the SAME lean∘twist `mat3` rotates `objectNormal` — but because three.js consumes the normal in `<beginnormal_vertex>` (before `<begin_vertex>`), the matrix is built and the normal rotated there, then the matrix + wander offset are reused on `transformed` in `<begin_vertex>` (cross-chunk `main()`-scope locals). Range uniforms (`uDeformLeanRange/uDeformTwistRange/uDeformWanderRange`, default `(0,0)` → identity, bit-exact regression-safe) are set per-draw via a sibling `applyDeformerUniforms` (NOT a widened `applyBarkUniforms`); a `uDeformSeed` perturbs the preview hash for re-roll (0 in LS). Single compiled shader program preserved (uniform+attribute branch, no `customProgramCacheKey`, no `#define`). The `aTreeHeightNorm` attribute (normalized trunk-base→top Y) is computed at **runtime-merge** time — chassis-wide Y-bbox scan shared across LS (`InstancedTrees#meshes`) and preview (`SpecimenViewport` → `stampTreeVertexAttrs`) — so GLB + atlas bytes are untouched (reintroduces Cork's retired scan; the scan was always sound, only 10A's camera-angle-dependent bark consumer was wrong). `generate-salon.js#patchManifestForSalon` writes `manifest.json#deformer.range`; `bake-look.js` passes it through to `trees-atlas.json#deformerBySpecies` (runtime-consumed, nothing atlas-baked). The deformer still fires in the Salon preview so the **automatic** per-type variation is visible (one representative hash sample; the operator no longer authors it — `uDeformSeed`/re-roll retired with the panel). **3B** (designed hero slots + PlaceCard binding) and **3C** (canopy asymmetry + branch jitter — those need inverse-transpose normals) are deferred.

**Bark plumbing (Brief 1.5a):** `generate-salon.js#patchManifestForSalon` writes the first composition's bark spec into `public/trees/<species>/manifest.json#bark` after `publish-glb.js` completes, in the exact shape `bake-look.js#flatten` expects (`materialRef`/`uvScale`/`tintBase`/`tintJitterRange`/`roughnessOverride`). Runtime `InstancedTrees.jsx#applyBarkUniforms` then drives per-draw uniforms — the operator's tintBase / uvScale / roughnessOverride / per-instance jitter visibly land at LS. Single bark spec per species (procedural's model); per-composition bark texture variation lives in each variant's GLB. `qualityOverride: 4` (Hero tier) so Salon variants win their bucket's quality lottery vs the procedural fillers. Salon's `main()` also calls `syncLookRoster('lafayette-square', ...)` so the published variants appear in LS placements after the next bake-look + bake-trees (Brief 1 deferred this; 1.5a closed the loop).

### Leaf undersides — the silver flash (2026-08-28)

Real leaves are paler underneath, and a wind that turns them makes a whole canopy flash — **silver maple is the extreme case and the reason this exists.** The Salon's **Leaves** panel now carries three controls that reach the render: **Tint front**, **Tint back**, and **Underside** (0–100%, the strength of the effect).

**You usually will not have to touch them.** The species dossier already carries the pair for the trees that need it, and the pickers open showing *that* colour — silver maple at 100%, red maple / green ash / river birch at 45%, sugar maple and pin oak at 0 because their undersides barely differ. Change a picker and yours wins.

⚠️ **Underside at 0 means the effect is off**, and a front tint alone does nothing — the front colour is only the reference the back is measured against, so the front face renders unchanged. If you want an underside on a species whose dossier has none, raise **Underside** first.

⛔ **It is a live uniform, so the Salon preview updates as you drag** — no re-bake to see it. But it only reaches the map after **Bake → Slab**. ▶ `node scratch/claims-the-leaf-face-axis-reaches-the-shader.mjs` names any Look whose slab is missing an underside its dossier authors.

### The species dossier — what the machine knows, and what it admits it does not

Each species carries a **dossier** of required traits (habit, bark texture, leaf type/shape/margin,
mature size) harvested from NCSU, SelecTree, USDA and the Urban Tree Database. What the operator
sees in the Salon is not a set of confident answers — it is the **state of the evidence**:

- **Agreed** — one value, with the sources and the FIELD each answered (`askedAs`). Two sources
  saying 80 ft under different question headings is a derivation, and the cell says so.
- **Contested** — sources disagree, so **every candidate is published** with who claimed it. The
  operator picks; the pick is authoring and is never re-derived. No invented consensus, no
  ranking by source authority, and never a cell that looks unscraped when it is disputed.
- **Narrowed** — no source could answer at our resolution, so the cell says **what was ruled out**
  and lists what survives. SelecTree's `leaf_form` only knows simple-vs-compound; against our
  seven leaf types its "Simple" means *not compound*, which is four values, not one. A hint
  narrows; it does not decide (`ARCHITECTURE §8a`).
- **Authored** — the operator's own value. Machine writes carry `sourced: true` and re-derive
  freely; an authored cell is never touched by any harvest.

⭐ **The point: a wrong confident cell is more expensive than an empty one.** Three species read
`leaf.type: simple` from a source with no word for "needle", scored as having no matchable leaf,
and reached a procurement brief as 100 placements of leaves to go buy — against a needle pack
already on the shelf.

## Full monte (`?view=fullmonte` → `src/components/TreeDiorama.jsx`)

**The first view anywhere in the product that shows a FINISHED tree.** One
specimen from the Look's **bake**, wearing the shared tree atlas the map's trees
wear, mounted in the neighbourhood's real sky and lit by it, with the production
sway driver attached. Not a composition check — a *ship* check.

⭐ **Why it exists.** The Salon's cyclorama answers "is this composition right".
Nothing answered "is the thing we ship good", which is exactly how a publish
contract that paints leaves with bark reached production without anyone noticing
(`BACKLOG.md`, 2026-08-22). A view that shows the shipped artifact, dressed the
way the runtime dresses it, is the check for that whole class.

⛔ **It is the SAME component the marketing embed mounts** (`?embed=tree`) — one
method, two mounts. A second implementation here would drift, and the drift would
be invisible because both would look plausible.

- `?view=fullmonte` — read straight off the URL, not a store flag: it is a
  destination you link to, not a mode you can get stranded in.
- `&species=` / `&lod=` / `&variant=` — swap the specimen. Defaults to the Look's
  baked `linden_american` at lod0.
- Reads `public/baked/<look>/trees/…`, ⛔ **never** `public/trees/` (gitignored
  authoring pool, never read by runtime — see `.gitignore`). So what it shows is
  what deploys.
- The specimen's primitives are stamped with `stampTreeVertexAttrs` and drawn
  merged when their attribute sets agree, **unmerged when they do not** — the
  baked linden is 3 parts with divergent attrs, and an earlier cut that returned
  nothing in that case rendered an empty sky. One `[TreeDiorama]` console line
  reports parts / merge state / tris / height on every mount, so "loaded but drew
  nothing" cannot be silent.
### ⭐ It drives the shared material's state — the seam this surface kept falling through

A bare `<Canvas>` mounts none of the drivers the map mounts, so every uniform the shared tree
material needs sat at its module default and the specimen rendered on a path nobody chose. Fixed
2026-08-23; **anything new that mounts this material must do the same four things:**

| what | why it matters | driven in the map by |
|---|---|---|
| `applyBarkUniforms` per frame | ⛔ **without it `uBarkUVScale` stays (1,1) and the tiling NEVER RUNS** — one 512px bark tile stretched over a 20 m trunk, which is the whole of "there is no texture on this trunk" | `InstancedTrees:394` |
| bark **tier → 2** | tier ≤1 REPLACES trunk diffuse with the posterized 16-colour substrate built for browse distance | `InstancedTrees:556` |
| ground colour + FX maps | the trunk-base blend and the contact ring; both read the ground by world-XZ | `BakedGround:157,176` |
| a wind **floor** | the directive carries no `wind` block, so `uWindIntensity` is 0 and the entire sway apparatus — per-tier damping, gust envelope, travelling spikes — never runs | the weather directive |

⭐ **The specimen is rendered the SALON's way** — traverse, stamp attributes in place, assign the
shared material, render the graph. ⛔ **It is not merged.** The merge is an `InstancedTrees`
optimisation for 5,000 placements; on one tree it cost ~534k triangles of main-thread work per
mount **and** made the geometry unquantizable (`applyMatrix4` writes floats into integer buffers).

**Operator dials** (URL, all defaulting to the committed values):
`?ring=` contact-ring footprint · `?trunk=` / `?trunkTop=` trunk-base darkening + reach ·
`?wind=` / `?gust=` breeze · `?leafT=` / `?leafK=` leaf transmission · `?species=` `?lod=` `?variant=` ·
`?whip=` the wind-tier ramp (see below), with `?whipGamma=` `?whipAmpMax=` `?whipLeaf=` shaping it ·
`?nightAmbient=` / `?nightHemi=` the diorama's own night keys (see below)

⚠️ **The trunk-base contact is a SHARED knob** (`treeTrunkGround` + `setTrunkGround` in
`treeAtlasMaterial.js`), defaulting to the map's values and restored on unmount — so street view
inherits it by turning it up, never by reimplementing it.

⭐ **THE WIND-TIER RAMP is a SHARED knob too** (`treeWindTiering` + `setWindTiering`, same file,
same restore-on-unmount contract). The legacy classifier buckets a vertex by distance from the trunk
**AXIS**, which is backwards: an outer branch tip damps to 0.30 while the upper trunk core reads
"twig" at 0.60, and leaves at a flat 1.00 move 3× the branches they hang on. `?whip=1` replaces the
four buckets with **one continuous ramp over height × radial distance** — a near-still bole to
whipping tips — and makes a leaf ride its branch (branch motion **+** its own flutter) instead of
moving independently of it.
▶ `node scratch/claims-wind-tier-extraction.mjs` — proves the shared classifier still matches the
pre-extraction one, parsing the old thresholds out of git rather than restating them.

- ◻ **`?whip=` DEFAULTS TO 0 — the legacy buckets still ship.** The ramp is built, measured and
  renders clean, but it moves EVERY tree in the map, so the default flips only on the operator's eye
  on the cinematic pan. Until then the backwards classifier is what the map runs.
⭐ **THE DIORAMA LIGHTS ITS OWN NIGHT, and the map never feels it** *(Jacob's ruling, 2026-08-24:
"the Diorama should have no impact on the larger product")*. The Look's `ambient` has no `night`
key, so midnight resolves by interpolation wrapping through the night and lands **above noon**
(1.69 vs 1.47) — unauthored, and it read as a lit canopy against a black sky. But `ambient` /
`hemi` are per-Look channels the **whole map** reads, so the key is **never written to the Look**:
the diorama overlays it on an in-memory copy and passes it through `CelestialBodies`'
`ambientOverride` / `hemiOverride` — the same seam the Stage drives. `public/looks/**` and
`public/baked/**` stay untouched. ⛔ A Look with no baked `scene.json` keeps today's lighting **and
says so by name**; it must never look like the override ran.
⛔ **`design.json` is NOT `scene.json`** — `CelestialBodies` reads the BAKED slab, so an experiment
edited into `design.json` changes nothing until a bake. That trap produces false negatives.

⭐ **THE HERO GEOMETRY BUDGET is an operator knob, and it is measured in TRIANGLES.**
`bake-trees.js` takes `heroTriangleBudget` (default 15e6) and `heroBandMaxM` (default 250m):
who keeps real mesh in the hero shot is decided AT BAKE by distance to the authored camera
path, spending that budget nearest-first. LS: 2323 mesh / ~86M tris → **403 mesh / 15.0M
tris**, cutoff 181m. ⛔ A COUNT budget lets one heavy species eat the frame — trunk diameter,
the old axis, predicts neither cost nor visibility.
▶ `node -e "console.log(require('./public/baked/lafayette-square/trees.json').heroBandMeta)"`
- ◻ **A species with no baked hero impostor still keeps MESH regardless of size** — an absent
  asset upgraded to the most expensive role. It is now REPORTED (`mesh=Nearned+Mleaked`, with
  the species named), never silent. The fix is to compose + capture the species, ⛔ never to
  widen the budget, which would relabel the leak as "earned".
- ◻ **Wind is FLOORED, not authored**: the meteorologist still does not author a `wind` block into
  the directive.

## Grove (`src/arborist/Grove.jsx`)

Per-Look roster curation. Reads `public/looks/<look>/design.json#/trees`; lets the operator scope `In Look` / `All Published`, click a tile to select it → toggle membership in the fixed editor panel, fires `/api/cartograph/looks/<id>/trees` + `/api/arborist/atlas/bake?look=<id>` automatically. **The Grove is how operators prune heavy hand-authored variants from a Look — not by editing design.json directly.**

**Population is roster-driven (Brief 27, Scion 2026-05-25).** The Grove is populated by **published Salon compositions**, not a "rate it, then add it" gallery. Compose a species in the Salon (edits autosave; ⛔ there is no Re-publish gesture) → the Grove bake regenerates it, `patchManifestForSalon` stamps the variant Hero (`qualityOverride: 4`) and `syncLookRoster` adds it to the active Look's `design.json#/trees` → it appears in the Grove **In Look**, no manual rating step. Visibility = **published-and-in-roster**, never a Fill/Mid/Hero rating the operator must set. The `GET /grove` gate (`serve.js`, `quality < 2` skip) survives only as a **published-not-raw-chassis** filter — raw ingested vendor chassis stay at quality 0 and are kept out; published compositions are always Hero so they pass. ⛔ **(2026-08-23: the editor panel's rating / category / notes controls have NEVER been written to — 0 of 37 variants carry any of them. ▶ `node -e "const v=require('./public/trees/index.json').variants;console.log(v.filter(x=>x.qualityOverride!=null).length,v.filter(x=>x.operatorNotes).length,v.filter(x=>x.categoryOverride!=null).length,'of',v.length)"` The 0–4 scale was retired for Promote/Demote on 2026-07-08 and the vocabulary never landed.)** (The per-tile rating ladder in the editor panel stays — it still authors `qualityOverride`, which feeds `bake-trees.js#pickVariant`'s hero-lottery via `index.json` — but it no longer gates Grove visibility. Whether that lottery is still meaningful under one-composition-per-roster-species, and an explicit `v.published` marker to decouple the gate from the rating *value*, are deferred follow-ups.)

**Authoring/production gesture split (Brief 14, Lintel 2026-05-23; extended Brief 14.1, Corbel 2026-05-25):** the Grove bake is now the *explicit* ship-to-slab gesture. Both authoring Re-publish paths — **Salon** (Brief 14) and **Procedural** (Brief 14.1) — stage species artifacts to the library (authoring side) but no longer auto-bake; baking the master atlas / slab is a separate, intentional Grove action. **Updated 2026-06-25:** edits now **autosave** and the **Grove bake regenerates-from-source** (`generate-salon` → `bake-look` → `bake-trees`, `15682e55`), so the explicit per-species **Re-publish is retired** — the workflow is **author (autosaves) → Grove "Bake → Slab" (regenerates + ships).** This still keeps the operator's mental model clear about when LS actually changes (only on the bake). Per `project_authoring_is_live_production_is_static`. (The Vellum posterized-substrate auto-extract rides `bake-look.js`, so it now fires on the Grove bake — correct, extraction stays tied to the bake step.)

⛔ **RE-BAKE EVERY LOOK BAKED BEFORE 2026-08-28.** The impostor capture measured the tree's height in the un-scaled chassis frame while the camera framed and clipped in world metres, so **stored card heights are wrong** (`maple_silver` shipped 29.7 m for a 21.0 m tree; HPDM's `picea_abies` 681 m) and any species whose GLB node scale is **under 1** lost its top band and could not capture at all — it went missing from Browse with no error. Fixed; one "Bake → Slab" per Look clears it. ▶ `node scratch/claims-the-capture-frame-is-the-clip-frame.mjs` says which Looks still carry pre-fix records.

The Grove's master atlas (`bake-look.js:unifyAtlases`) is the load-bearing innovation that makes hero species nearly free to add: `atlas-survey.js` dedupes tiles by sha1 hash before pack, so hero bark + leaf-cluster tiles collapse against the filler roster's identical content. See `ARCHITECTURE.md` for the full story.

**Set as Meteorologist canary** (per-tile editor-panel affordance). Click `→ Set as Meteorologist canary` on any tile to publish `{species, variantId, lookId}` into `localStorage.meteorologist-canary-tree`. Meteorologist's CanaryScene listens for the `storage` event (cross-tab, same origin) and swaps its hero tree to match — useful for sanity-checking a freshly adopted variant under stormy weather conditions without leaving Arborist. Per-operator UI preference; not authored, not per-Look state. Contract lives in `ARCHITECTURE.md` "Arborist ↔ Meteorologist canary contract".

### Gallery ↔ Coverage view toggle (Brief 24, Cadastre 2026-05-25)

The Grove header carries a top-level view toggle:

- **Gallery** — the by-model 3D crop (per-Look `In Look` / `All Published` scope + click-to-select editor panel). All roster-curation behavior lives here. **Per-tile editing is click-to-select → a fixed right-rail `GroveEditorPanel` (Brief 31, Cleat 2026-05-25), retiring the camera-chasing `<Html>` hover-card.** (Brief 27 retired the Fill/Mid/Hero quality filter — every published composition is Hero, so the filter was inert.)
- **Coverage** (`src/arborist/CoverageView.jsx`) — a **read-only**, roster-anchored "have vs need" table. One row per *canonicalized* park species (from the scene's `cartograph/data/<scene>/clean/park_census.json`), sorted by placement count descending, each tagged 🟢 **literal** / 🟡 **composite** / 🔴 **gap**, with the covering library species and the current `park_species_map.json` routing. It reproduces, live, the join hand-maintained in the live `GET /coverage` join (`arborist/roster-coverage.js`). Computed by `GET /coverage`; writes nothing.

**Coverage classification (derived on the fly, never persisted — slab provenance is the separate Brief 25):**
- 🔴 **gap** — the species has no `park_species_map` routing to any *existing* library species (no published manifest, no chassis, no composition). This is the roster-anchored shopping list.
- 🟢 **literal** vs 🟡 **composite** — a name-token heuristic: literal iff the park name's distinctive tokens (genus stopword removed; bare-genus names fall back to the genus token) all appear in a routed library id's `id` / `label` / `scientific` text. Imperfect on cultivars (e.g. honeylocust "thornless") and a stale/wrong map entry surfaces as composite (e.g. `black locust → gleditsia_triacanthos` mis-routing) — **the operator owns the final literal/composite call**; the routing column is shown so they can verify and hand-correct `park_species_map.json`.

**Map-refresh worktable.** Each row displays its current `park_species_map.json` routing and flags ⚠ missing (no map entry) / ⚠ dangling (routed at a library id nothing answers to) / thin (routed at a published-but-no-chassis species). The view *displays* routing only — it never writes `park_species_map.json` (curation is by hand). This is the surface for refreshing the stale (2026-04-29) map so `bake-trees.js#pickVariant` fans the park-names onto the right published species.

**Canonicalization** — `arborist/roster-name-canon.json` (`{ "<raw name>": "<canonical name>" }`) merges messy duplicate roster names (casing / word-order / cultivar) before counting, so the coverage list doesn't double-count. Operator-editable; seeded from the 5 merges in `_archive/ROSTER-COVERAGE-2026-08-23.md` §intro (Oak Pin + restricted = 46, Bald Cypress + Baldcypress = 25, etc.). Unmerged raw names pass through as their own canonical name (visible, so a missing merge is spottable). Canonical counts sum to the full 756 placements.

---

## API endpoints (`arborist/serve.js`, port 3334)

Mounted under `/api/arborist` from the web app via Vite proxy.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/species` | Read `public/trees/index.json` |
| `GET` | `/species/:id` | Read one species's `manifest.json` (404 until baked) |
| `GET` | `/species/:id/specimens` | Candidate specimens from `tree_metadata_dev.csv` with `recommended` flags |
| `GET` | `/species/:id/seedlings` | Picked seedlings + per-seedling tune params (Scan mode) |
| `POST` | `/species/:id/seedlings` | Save the seedling library for the species |
| `GET` | `/specimens/:treeId/preview.ply` | Stream a `.laz` as PLY for the viewport (cached) |
| `POST` | `/species/:id/bake` | Run `python bake-tree.py --species=<id>` |
| `DELETE` | `/species/:id` | Remove published artifacts + state |
| `GET` | `/inventory` | Species histogram from the scene's census |
| `GET` | `/coverage` | **Read-only (Brief 24, Cadastre):** roster-anchored have-vs-need join, computed by the shared `arborist/roster-coverage.js#computeCoverage` (lifted from inline in Brief 26). Canonicalized park species (`park_trees.json` merged via `roster-name-canon.json`) × library (`index.json` + `_chassis/*.meta.json` + `state/*/compositions.json`) × routing (`park_species_map.json`). Returns `{summary, species:[{species,count,mergedFrom,coverage,covering,routing,mapMissing,dangling, canonicalId,recommendedChassis,authoringState,publishedCanonical,impostorExport}]}`. ⭐ `impostorExport` is the **output** axis — `{overhead,hero}` read off `public/baked/<scene>/trees-atlas.json`, the only field here that is not an *input* fact. `null` = this look has no baked atlas (unknown, ≠ missing). Provenance derived on the fly. Powers the Grove Coverage view (Brief 24) + the Salon roster navigator (Brief 26). |
| `POST` | `/coverage/:rosterName/routing` | **Brief 26 (Cadastre 2026-05-25):** the ONE `park_species_map.json` write. Body `{canonicalId}` → `map[rosterName]=[canonicalId]` (composed); `{notAvailable:true}` → `map[rosterName]=[]` (deliberate gap). Mirrors the value onto the merge table's raw aliases so `bake-trees#pickVariant` routes every placement. Preserves `_doc`/`_libraryAt` + key order. |
| `GET` | `/procedural/species` | List of procedural species + hero entries |
| `GET\|POST` | `/procedural/:species/seedlings` | Procedural seedlings overlay (`arborist/state/<species>/seedlings.json`); GET returns `effective` field per variant (PRESETS base merged with operator overlay) |
| `POST` | `/procedural/generate` | Returns `model/gltf-binary` directly for a single (species, slot, seed, params) — used by the workstage dice/preview loop |
| `POST` | `/procedural/:species/publish?look=<id>` | **Authoring-only (Brief 14.1, Corbel 2026-05-25):** shells out to `node generate-procedural.js --species <id>` (which syncs the Look roster in its `main()`) + rebuilds the index. Stages species artifacts to the library; does **not** bake the slab atlas. `?look=` accepted + echoed but vestigial (no longer triggers a bake). Slab bake is the explicit Grove gesture (`/atlas/bake`). |
| `GET`  | `/salon/species` | Salon species: chassis-available OR composition-authored (union) |
| `GET`  | `/salon/:species/chassis` | Chassis catalog (`public/trees/_chassis/`); optional `?morphology=` filter |
| `GET`  | `/salon/:species/bark` | Bark refs under `public/textures/bark/` |
| `GET`  | `/salon/:species/leaves` | Leaf packs (shapes/ dir if present, else flat PNG fallback) |
| `GET\|POST` | `/salon/:species/compositions` | Overlay; GET returns `effective` per composition; POST merges with absent-keys-preserved |
| `POST` | `/salon/generate` | Body `{chassis, bark, leaves, lod}` — returns `model/gltf-binary` for live preview |
| `POST` | `/salon/:species/publish?look=<id>` | **Authoring-only (Brief 14, Lintel 2026-05-23):** shells out to `node generate-salon.js --species <id>` + rebuilds the index. Stages species artifacts to the library; does **not** bake the slab atlas. `?look=` accepted + echoed but vestigial (no longer triggers a bake). Slab bake is the explicit Grove gesture below. |
| `GET`  | `/salon/curation` | Salon chassis curation file (`arborist/state/_chassis-curation.json`) |
| `POST` | `/salon/curation/:chassisName` | Body `{displayName?, approved?, notes?}` — merges with absent-keys-preserved; `null` clears displayName/notes or restores unreviewed for approved |
| `POST` | `/atlas/bake?look=<id>` | Re-run `bake-look.js` for one Look (used by Grove on curation changes). **The explicit ship-to-slab gesture** — post-Brief-14 this is the *only* path that rebuilds the master atlas / slab artifact. |

---

## CLI

| Command | What it does |
|---|---|
| `node arborist/serve.js` | Start the backend (called automatically by `npm run dev`) |
| `node arborist/generate-procedural.js [--species procedural_<id>]` | Headless procedural republish; reads `arborist/state/<species>/seedlings.json` overlays + PRESETS fallback |
| `node arborist/generate-salon.js [--species <id>]` | Headless Salon republish; reads `arborist/state/<species>/compositions.json` overlays + chassis-defaults + kit DEFAULTS |
| `node arborist/survey-deleaf.js` | Regenerate the gitignored chassis library at `public/trees/_chassis/` (Whittle, Brief 0). Brief 1 acceptance-testing depends on this. |
| `node arborist/bake-look.js --look <id>` | Re-pack per-Look master atlas + emit `trees-atlas.json` |
| `node arborist/bake-trees.js --scene <name>` | Place the NEIGHBOURHOOD's census + emit `public/baked/<look>/trees/...`. ⛔ `--scene`, not `--look` — renamed 2026-07-15; it always meant the scene. |
| `node arborist/republish-all.js` | Walk every species and re-emit through the full pipeline |
| `python arborist/bake-tree.py --species=<id>` | Bake one species's LiDAR seedling library (Scan mode) |

---

## Determinism

Same `{species, slot, seed, params}` + same on-disk materials → byte-identical GLB across re-publishes. Verified end-to-end on every procedural phase shipped (sha1sum of `public/trees/<species>/skeleton-N-lod0.glb` is stable). Required for `writeIfChanged` mtime stability and cache predictability — see `cartograph/ARCHITECTURE.md` and `project_writeifchanged_touches_mtime` memory.

---

## Decimation pipeline (Brief 6, Spindle 2026-05-22)

Inside `publish-glb.js`'s per-variant loop, after `loadVariantDocument` and before LoD emission, two tree-aware decimation levers run:

**Lever 3 — card-aware leaf-card reduction** (`arborist/decimate-tree.mjs`, importable). For each primitive with `extras.atlasKind === 'leaf'`:
- If `max-vert-use === 1` (Robinia-class card-based topology), compute per-triangle XZ centroid, build 2D convex hull of all centroids, drop interior triangles by deterministic Knuth-hash with `innerHullDropFactor` (default 0.6). Outer-silhouette triangles (within `outerHullToleranceFrac × bboxDiag` of hull boundary, default 0.05) are always kept.
- If `max-vert-use > 1` (Linden-class connected-mesh), skip — defers to MeshoptSimplifier.
- If `tcount < minTrisToFire` (default 1000), skip — chassis was already light.
- Stamps `prim.extras.spindleDecimated = true` for idempotency on re-runs.

**Lever 4 — adaptive simplify-to-bracket** (inside `publish-glb.js#emitLod`). Replaces the prior fixed `ratio: 0.85/0.40/0.10` with per-LoD `[minTris, maxTris]` brackets read from `arborist/decimation-defaults.json`. The simplifier ratio is seeded from `maxTris / startTris`, then iteratively tightened up to 3× on overshoot. Chassis whose pre-simplify tri count is already inside the bracket skip simplify entirely. Out-of-bracket results are logged with `✗bracket[min-max]`; MeshoptSimplifier's topology floor (controlled by `error`) bounds how aggressive Lever 4 can be without exceeding visual-quality budget — see `scratch/brief-decimation-survey-spindle.md` for observed per-species behavior.

**Levers 1 + 2 (Order-N twig pruning, parallel-branch collapse) were dropped before code** — vendor + procedural chassis arrive flat-merged with no walkable per-branch node graph. Filed as Brief 6.1 candidate (generator-side pre-merge inside `generate-procedural.js`'s SCA graph and `bake-tree.py`'s LiDAR cylinder graph). See `BACKLOG.md`.

---

## Pipeline integration

The deployed runtime — `src/components/InstancedTrees.jsx` — consumes Arborist artifacts unchanged:

1. Fetch `public/trees/index.json`
2. Load each species's `skeleton-N.glb` + `tips-N.json` + `manifest.json`
3. Group `park_trees.json` placements by species + variant via `hash(treeId) % nVariants`
4. Render one `InstancedMesh` per `(species, variant)` pair
5. Per-instance shader jitter (branch angle, length, tint micro-variation, wind phase) breaks repetition

The shared material (`src/components/treeAtlasMaterial.js`) carries the bark retint uniforms (`uBarkTintBase`, `uBarkTintJitterRange`, `uBarkRoughnessOverride`, `uBarkUVScale`, `uBarkTileOffset`, `uBarkTileScale`) and the per-vertex `aBark` attribute gate. Single shader program preserved (Bloom-stable). Stage's Surfaces.Trees panel rebinds to the dynamic species list from `index.json`, with per-species tint overrides feeding the runtime uniforms via `scene.materialColors[<species>]`.

Per-Look palette override is instant — `scene.materialColors[<species>]` wins over species default `tintBase` at runtime, no rebake required.

---

## Cross-references

- `README.md` — runtime contract (the slimmer outward-facing version of this doc)
- `_archive/SPEC-2026-08-23.md` — the retired v1 (LiDAR/QSM) work order. History, not canon.
- `ARCHITECTURE.md` — load-bearing patterns: publish-loop, two-tier substitution, master atlas, generator contract, bark shader unification
- `BACKLOG.md` — the live kit-matcher arc + recent open state + the distilled carried-forward items (the May-2026 Procedural/Salon brief arcs are cooled to `_archive/BACKLOG-2026-05-brief-arcs.md`)
- `NOTES.md` — dated decision record (live + recent; the May-2026 brief diary, incl. the load-bearing 2026-05-15 maxi-brief, is cooled to `_archive/NOTES-2026-05-diary.md`)
- `../cartograph/ARCHITECTURE.md` — kit-wide publish-loop pattern Arborist mirrors
- `../cartograph/README.md` — helper template
