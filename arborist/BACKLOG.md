# Arborist Backlog

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Read at session start; check off completions during work; prune toward pristine. Resolved items belong out of this doc, not in a "Done" section. Migrated 2026-05-18 out of `cartograph/BACKLOG.md`. Tree work that intersects cartograph-side code (Couplers wiring, scene channels) still appears in `cartograph/BACKLOG.md`; tree-internal items live here.

> 🌳 **CURRENT ARC — the Forest Builder kit-matcher (supersedes the Salon arc below as the front-end direction).** Ratified architecture: **`scratch/FOREST-BUILDER-KIT-MATCHER.md`**. **Locked doctrine:** **no-cull** (all trees draw); hero-LOD impostor arc **ARCHIVED** (`cartograph/_archive/HANDOFF-tree-hero-lod-2026-06-21.md`) → the **real-DoF return** is now `HANDOFF-real-dof.md`; leaf scale + color are **rubric axes**; **Procedural + LiDAR kept** as equal peer tracks.
>
> **✅ STAGE 0 + STAGE 1 DONE (2026-06-18/19, on `curb-offset-draw`).** Keystone `arborist/rubric.json` (19 axes + similarity matrices) + `arborist/dossiers/` (10 species, ratified vs botany). Spine `arborist/{ingest-tagger,library-builder,ingest,matcher,readiness,library-inventory,forest-dashboard-html}.js` → `arborist/state/part-index.json` + canonical `public/library/` + `GET /readiness` & **`GET /forest`** (rendered dashboard, :3334) + `public/library/INVENTORY.md`. Parts procured: 4 Poly Haven CC0 barks (7/8 types) + 6 scanned vendor leaf packs (star+fan filled; hi-res in `assets/leaf-packs-2026/`, gitignored). **All 10 species buildable, 0 blockers, buildable-CLEAN=5** (Sugar/Silver/Pin Oak/Red Maple/Sweetgum). **Eye it: `:3334/forest`** (or `node arborist/readiness.js` / `INVENTORY.md`).
>
> **▶ NEXT UP (the live `/forest` 🟡-upgrades list, pinned durable):** **(1) STAGE 2** = vertical slice — one Sugar Maple perfect end-to-end (viewer §9 wired to matcher options + reference panel; leaf model = Ways §5 + derived `leaf.size` + season ramp + front/back), then the maple/oak kit-mileage core. **(2) Leaf polish:** ash **compound** + cypress **feathery-needle** still 🟡 placeholders (the 6 vendor packs didn't cover them); **Various-Fall-Leaves.zip** (Desktop) → the `leaf.season` ramp; `scale` silhouette unused by top-10. **(3) Bark:** birch **salmon river-birch color + 2nd mask channel** (Stage-3 exfoliating hard case). **(4) Chassis:** ideal **ornamental cores** for crabapple/redbud (stand-ins work today). **(5) Street-shot:** raise the **atlas leaf-tile budget** (device-profile) so the 2048 leaf sources render crisp up close. **(6)** habit-untag backlog (80 chassis); ratify Bark003 (ambientCG "smooth" vs our ridged). Tooling: `scratch/compose-leaf-packs.mjs` (deterministic atlas builder; ~20 scans/pack in `assets/leaf-packs-2026/`). The May-2026 Salon-composition + Procedural-v1.5 brief arcs (the as-built the kit-matcher rides) are **cooled to `_archive/BACKLOG-2026-05-brief-arcs.md`** — read the architecture doc first; the live open items that survived are distilled in `§ Live open work carried forward` (bottom).

---

## ▶ 2026-06-25 — the Salon "fashion plates" rebuild + a deep vestigia sweep (LANDED). Front door: **`SALON-INTERFACE.md`**

The Salon became the rubric-forward **plate-rack** the kit-matcher always implied. **Full design + decisions + open threads: `SALON-INTERFACE.md` (root); narrative: `NOTES.md` 2026-06-25.** Commits `curb-offset-draw`: `ab3bbbd5` `4631b688` `62dd9988` `65d00f06` `6c29f7a7`.

**LANDED:**
- [x] **A1 — deformer → automatic** (`generate-salon.js#DEFORMER_BY_MORPHOLOGY`, panel retired; engine/seam unchanged). ⚠️ **parked pending 3C** — the deformer is anti-stamping, not diversity.
- [x] **B1 — bark + leaf visual plate grids** (`PlatePicker`): replace the dropdowns + the redundant matcher-text; leaf **gaps marked** ("needed" tags) = a coverage map; `(Add +)` tiles.
- [x] **B2 — chassis live gray-silhouette plates** (`ChassisPlate.jsx`): top-N from the matcher (vendor-filtered), **wood-only**, per-plate **★ Approve**, "Browse all" fallback.
- [x] **Variant preview** (1/3 toggle) — the deformer eye-gate.
- [x] **WYSIWYG plumbing verified carrying to the slab** (autosave ✓ · regenerate-on-bake ✓ `15682e55` · shared preview material ✓ Brief 7; **byte-proven** `scratch/measure-leaf.mjs`). Piece-3 locked "good enough."
- [x] **Vestigia swept:** Oubliette · bark gradient editor · Adopt · RE-PUBLISH SPECIES (+ `publishedVariants` tracking; routing preserved via effect) · STUDIO/WORM · Tilt/Y-up → "advanced" drawer · bio card → tools-rail + inline photos. **Kept (operator):** progress filter, Mark-N/A, multi-slot, Set Canary.

**OPEN / NEXT:**
- [ ] **Fill the ~6 leaf-base gaps** the coverage grid exposes: `fan` (Ginkgo) · `compound` (Ash) · `fine_compound` (Honeylocust) · `palmate_compound` (Buckeye) · `tulip` (Tuliptree) · `short_needle` (Spruce). The ~25-base leaf library is half-stocked (`leaf-pack-bindings.json` needed-list).
- [ ] **`(Add +)` behavior** — affordance built, action TBD → ties to the **online models/assets library** (hosted, versioned home for the ~40 build-once bases; where `(Add +)` procures from, reusable town-to-town).
- [ ] **3C** (canopy asymmetry / branch jitter) — the real per-tree diversity; revisit the deformer magnitudes + any per-species control *then*.
- [ ] **Part-base near/far render tiers** (`SALON-INTERFACE §2`) — leaf near-tier (posterize + high-pass detail + artificial translucency, reusing the bark toolbox), bark PBR/posterize, chassis real/impostor. The build that makes the part model real.
- [ ] **Green-light readiness gate** for bake membership (per-plate ★ Approve exists; the all-green Kit·C·B·L gate is unbuilt). · **Chassis plate perf** (8 demand-canvases; render-once-to-image fallback). · Chassis rename/notes row keep-or-fold. · arborist has **no `OPERATIONS.md`** (knobs live in `FEATURES.md`).

---

## ▶ 2026-06-23 (EOD) — ⛔ THE WALL: trees are 16MB, decimation floors. **(Largely SUPERSEDED — see status)**

> 🔄 **STATUS (2026-06-25):** The 16MB wall was **fixed at the source** — it was **flat normals**, not UV-lock: smooth-normals + weld + simplify gives a real lod0/1/2 ladder (`_archive/BATON-tree-weight-smooth-normals-2026-06-24.md`, rolled out library-wide). The **per-context Street/Hero/Browse-LOD + GeoTierDriver** strategy below is **SUPERSEDED** by the role-at-bake doctrine (`BATON-tree-render-next.md`): geometry = a per-placement ROLE at bake, depth gauges own visual distance, `GeoTierDriver` RETIRED. And trees currently **ship ALL-MESH** (`PROM_THRESHOLD=0`); the impostor render is PARKED. Kept here for the cull-oracle half (`classifyHeroTiers`, occlusion cull) which the future impostor arc reuses.

The afternoon found the foundational blocker and the strategy to beat it. **Full detail: `_archive/HANDOFF-visibility-cull-lods-2026-06-23.md` (root).**
- **Wall:** connected-mesh bark is UV-locked → `simplify` can't reduce below ~127K tris (lod0=lod1 byte-identical, GLBs 16MB, lod1 set = 1.7GB). The **Grove context-losses (GPU OOM)** loading them → stale frame → "edits don't show." (Brief 6.3-followup, now acute.)
- **Strategy:** bake-time **per-context visibility culling** — delete surfaces the known camera tracks never see (don't simplify). Lossless, sidesteps the floor. **Street** = 1 full + rest Hero + DoF-blur BG. **Hero** = lod1 + PVS-cull vs hero pan + DoF. **Browse** = overhead trunk-cut below canopy (most aggressive). Impostors HELD (operator skeptical). DoF = cover, not cut.
- **Design Q (before Hero):** per-variant cull (keeps instancing) vs per-placement (aggressive, breaks it).
- **Role model:** Salon = tweaking + per-context knobs in all 3 views; Grove = cosmetic → renders a LIGHT LOD (fixes its crash).
- **Build order:** (1) Browse trunk-cut, (2) Grove on light LOD + quick Grove→lod2, (3) Hero PVS-cull (+instancing call), (4) Street focal+DoF-BG, (5) per-context knobs.
- **Built (committed):** Phase 1 regenerate-into-bake `15682e55` (needs backend restart); doc correction `f802cb95`. **Uncommitted (HMR-live):** autosave (✓), enterGrove (fires but Grove crashes first), Salon 3 context views, bake `lods`, GeoTierDriver (moot/risky until LODs light), 🧹 debug logs to remove.

---

## ▶ 2026-06-23 (PM) — ROOT-CAUSE NAILED: the Salon↔Grove stale-artifact divergence; the WYSIWYG/autosave arc **(mostly LANDED 2026-06-25)**

> ✅ **STATUS (2026-06-25):** the decided target arc below mostly **LANDED** — autosave ✓, regenerate-from-source folded into the bake ✓ (`15682e55`), the Salon stripped to fashion plates ✓ (the 2026-06-25 entry above). Residual open: the **green-light readiness gate** (per-plate ★ Approve exists; the all-green Kit·C·B·L gate is unbuilt) + LoD stays dormant-not-deleted. The night-emissive sub-arc is still parked (carried forward below).

**The symptom the operator hit:** leaf/bark knobs update in the **Salon** but **not the Grove / LS / after a bake**; hard-refresh doesn't help; the slab looks "pre-leaf." **Confirmed in code (`serve.js`), not memory** — two daylight gaps:
1. **live-preview ≠ published** — the Salon preview is `generateSingleCompositionGLB`@LOD0 (`/salon/generate`), a *different artifact* than what `generate-salon` publishes.
2. **publish ≠ bake** — `/grove/bake` (serve.js:1100) calls **only** `bakeLook`+`bakeTrees`; it **never** re-runs `generate-salon`, so it repacks the *last-published-per-species* GLBs. `/salon/:id/publish` (serve.js:1389) is the ONLY regenerate-from-source, and it's per-species + manual.

**Today's workaround:** `POST /salon/:id/publish` each edited species → *then* `/grove/bake`. (Vendor-only species with no composition — e.g. `platanus_acerifolia` — can't take the knobs at all.)

**Docs corrected (this session, route-first + accord sweep):** `ARCHITECTURE.md §Salon preview ↔ LS parity` now leads with an **AS-BUILT REALITY** block (the flow + 2 gaps + symptom→fix table) instead of the false "no daylight" claim; `README.md §Grove → Slab` gains the troubleshooting + target; `NOTES.md` 2026-06-23 PM carries the narrative.

**▶ THE DECIDED TARGET ARC (operator, 2026-06-23) — the unification that fixes the bug AND is the interface pivot:**
- **Autosave** the Salon (kill the manual per-species Re-publish gesture).
- **Fold regenerate-from-source into the bake** so published is always fresh (closes gap 2 — the long-queued finish of the *Grove→Slab 2026-06-20* decision).
- **All three surfaces render the published artifact** — retire the separate live LOD0 preview (closes gap 1) so Salon == Grove == LS literally.
- **Green-light readiness gate** decides Grove/bake membership: *not all green (Kit C·B·L + approve) = not ready = doesn't bake.*
- **Strip the Salon UI** toward "fashion plates" (folds in the morning's item #3 + the `Bark007`-opaque-ids complaint).
- **LoD stays dormant-not-deleted** — dropping it rides on the *unproven* bet that **DoF far-blur replaces LoD swaps**; the far-field perf mechanism is orthogonal to this WYSIWYG parity. The DoF eval (below) is how that bet gets settled. Do NOT write LoD's obituary.

*(The morning's #1 night-emissive is parked behind this — but it surfaced a confirmed finding: night foliage stays green because **hardcoded lights ignore every knob** — `CelestialBodies.jsx:1219` white ambient 0.45 + `:1236` fill 0.06 + `:1203` hemi-floor 0.20 ≈ 0.51 un-zeroable. "0 doesn't mean 0." Fix = ramp those to 0 on `nightFactor` so the existing framework goes naturally dark. Separate small arc.)*

---

## ▶ 2026-06-23 — Grove→slab connected; leaf-size knob fixed; night-emissive + interface NEXT **(interface LANDED)**

> ✅ **STATUS (2026-06-25):** the "fashion plates" interface pivot (item 3) **LANDED** (`SALON-INTERFACE.md`); the leaf-size knob + Grove→slab work shipped. Still open: **#1 night-emissive** (carried forward below) + the DoF evaluation (#2, a cartograph-side render-conformance item). Birch-bare leaf-UV follow-up still open (carried forward).

**LANDED (uncommitted, branch `curb-offset-draw`):**
- **Grove "Bake → Slab" button** — `POST /grove/bake?look=` (bakeLook + bakeTrees, awaited) + `bakeGroveToSlab` store action + green button in `Grove.jsx`. One-gesture ship-to-slab (was CLI-only). 745 trees, ~5–7s.
- **Leaf-size knob works on NATURAL leaves, all topologies** — `scaleLeafCardsInPlace` rewritten to scale each leaf as a **connected component** about its centroid (union-find), so it resizes the model's own leaves in place on cards (maple) AND connected mesh (blackgum). Slider 0.4–2.5×. Leaves left **natural** everywhere; operator tunes size. Anchored-synthesis built + kept (synth samples anchors from vendor leaf verts) but NOT the default.
- Slab rebaked from the (natural) compositions.

**NEXT (tomorrow, with operator):**
1. **#3 night-emissive (diagnosed).** Foliage glows green with lights+bloom off = leaf albedo under residual ambient/hemi (NOT a rogue emissive; lamp-glow is separate/correct). Build: (a) foliage goes dark at night, (b) the intended **night illumination map** (gated emissive → bloom). Needs design call: dusk→night ramp? per-species? Home: `treeAtlasMaterial.js` + sky channels.
2. **DoF evaluation** — measure how much the DoF/LoD solution is buying us; may need optimizing. (`HANDOFF-real-dof.md`, `HANDOFF-render-conformance.md`.)
3. **Interface = the "fashion plates" pivot** — rubric-named + thumbnailed visual plates (kill `Bark007`), plate-based selection, **Grove/Salon render parity** (Grove=published GLB@LOD1/master atlas vs Salon=`generateSingleCompositionGLB`@LOD0 — same tree, two pipelines, they diverge).

**Follow-ups surfaced:**
- Fold **regenerate-from-source** (`generateSalon`) into `/grove/bake` so a bake never ships stale GLBs (the May-25-vs-June-leaf trap). Decided doctrine, not yet wired.
- **Birch authored renders bare** — connected-mesh leaf UVs map to empty atlas space (per-species texturing fix).
- Commit tonight's work (code + compositions + baked slab) — left for operator review.

---


## Live open work carried forward (distilled from the archived May-2026 brief arcs)

> The full brief-by-brief record is in `_archive/BACKLOG-2026-05-brief-arcs.md` (almost all `[x]` shipped / `[~]` folded). These are the items that were still genuinely open when the arc cooled — re-homed here so the active doc carries the open state. Several are subsumed by the kit-matcher (`§ NEXT UP` top) or the tree-render doctrine (`BATON-tree-render-next.md`); kept because no successor explicitly closed them.

**Kit / library (live — feed the kit-matcher front):**
- [ ] **Streamline asset intake** (old Brief 28) — "+ Add Model / + Add Leaves" targeted single-asset ingest (today: chassis via whole-library `survey-deleaf.js`; bark auto-extract at bake; leaves via `compose-leaf-packs.mjs`). The thin button rides a `serve.js` upload endpoint + a single-asset ingest mode. **Now ties to the 2026-06-25 `(Add +)` + online-asset-library thread** (top entry). 🧊 pull forward when asset-adding is a routine cadence.
- [ ] **Map-refresh — `src/data/park_species_map.json`** (operator-curated). The stale (2026-04-29, pre-chassis-library) routing `bake-trees.js#pickVariant` fans the messy park-names onto published species. Seeding the roster isn't "done" until every park-name routes onto a seeded species (or a deliberate filler). Coverage view surfaces the diagnostic; curation is by hand (no auto-guess gets it right).
- [ ] **Brief 25 — persist + bake provenance** (literal vs composite) into `manifest.json` so Coverage reads it from data instead of deriving on the fly.
- [ ] **Raise atlas `CONTENT_CAP`** (`bake-look.js`) once the roster shrinks post-Grove-curation — bark 512×1024→1024×2048 / leaf 512→1024 for a fidelity bump at no runtime cost. One-line knob; the actual roster size drives the cap. (Related: the kit-matcher §NEXT-UP "raise the atlas leaf-tile budget, device-profile" for crisp street-shot leaves.)

**Tree-render / geometry (live, but mostly under the role-at-bake + parked-impostor arc — `BATON-tree-render-next.md`):**
- [ ] **Night-emissive** — foliage glows green with lights+bloom OFF because **hardcoded lights ignore every knob** (`CelestialBodies.jsx:1219` ambient 0.45 + `:1236` fill 0.06 + `:1203` hemi-floor 0.20 ≈ 0.51 un-zeroable). Fix = ramp those to 0 on `nightFactor` + a gated night-illumination emissive that feeds bloom. Needs an operator design call. *(Whole-system winter/season concern intersects the impostor season-capture plan.)*
- [ ] **Fix the GPU-gauge fake budgets** — the emulator gauge is a count-vs-INTERIM-FAKE-budget verdict (draws/200, tris/1M) that ignores frame-ms and reads red with no trees on screen. It drove a reverted degradation arc. Either wire it to real frame-ms or relabel it so it stops being read as a perf signal. (See NOTES 2026-06-25 EOD.)
- [ ] **Camera-aware hemisphere cull** (old Brief 4) — drop back-facing leaf-card overdraw at hero distance (uniform-driven, single-program). Overdraw is the standing tree cost; folds into the parked impostor/opaque-shell overdraw-killer arc.
- [ ] **Birch authored renders bare** — its connected-mesh leaf UVs map to empty atlas space (a per-species texturing fix).
- [ ] **Build blocker (env, not code): restore `photos-wikimedia/other`** — `public/photos/lafayette-square/other` is a dangling symlink; `npm run build` transforms all modules then fails in vite's publicDir copy. Blocks production builds until the target is restored.

**Superseded / moot (recorded so they aren't re-opened):**
- ~~Brief 17 per-species bottom-cut~~ + ~~the lod2 browse trunk-cut~~ — **moot** under all-mesh + role-at-bake ("if we get good impostors we skip cutting off trunks" — Jacob; `_archive/TREE-GROUND-ELEVATION-FORENSIC-2026-06-25.md`).
- ~~Brief 6.3-followup connected-mesh bark lod2 floor~~ — the 16MB wall was **flat normals**, fixed by smooth-weld (`_archive/BATON-tree-weight-smooth-normals-2026-06-24.md`), not the UV-lock the followup assumed.
- ~~Brief 11 / GeoTierDriver runtime tier-swap~~ — **RETIRED** (geometry by baked role, not live camera distance).
- ~~SpeedTree library~~ — peer-track placeholder; the kit-matcher (Authored-only active) is the live track.

---

> 🗄️ **Archived:** the May-2026 Salon-composition + Procedural-v1.5 brief arcs (Briefs 0–31, Phases A–G, the fallback-v1 / cross-helper / SpeedTree tails) → **`_archive/BACKLOG-2026-05-brief-arcs.md`** (2026-06-25). Companion diary: `_archive/NOTES-2026-05-diary.md`.
