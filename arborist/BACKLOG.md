# Arborist Backlog

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Read at session start; check off completions during work; prune toward pristine. Resolved items belong out of this doc, not in a "Done" section. Migrated 2026-05-18 out of `cartograph/BACKLOG.md`. Tree work that intersects cartograph-side code (Couplers wiring, scene channels) still appears in `cartograph/BACKLOG.md`; tree-internal items live here.

> 🌳 **CURRENT ARC — the Forest Builder kit-matcher (supersedes the Salon arc below as the front-end direction).** Ratified architecture: **`scratch/FOREST-BUILDER-KIT-MATCHER.md`**. **Locked doctrine:** **no-cull** (all trees draw); hero-LOD impostor arc **ARCHIVED** (`cartograph/_archive/HANDOFF-tree-hero-lod-2026-06-21.md`) → the **real-DoF return** is now `cartograph/_archive/HANDOFF-real-dof-2026-06-27.md`; leaf scale + color are **rubric axes**; **Procedural + LiDAR kept** as equal peer tracks.
>
> **✅ STAGE 0 + STAGE 1 DONE (2026-06-18/19, on `curb-offset-draw`).** Keystone `arborist/rubric.json` (19 axes + similarity matrices) + `arborist/dossiers/` (10 species, ratified vs botany). Spine `arborist/{ingest-tagger,library-builder,ingest,matcher,readiness,library-inventory,forest-dashboard-html}.js` → `arborist/state/part-index.json` + canonical `public/library/` + `GET /readiness` & **`GET /forest`** (rendered dashboard, :3334) + `public/library/INVENTORY.md`. Parts procured: 4 Poly Haven CC0 barks (7/8 types) + 6 scanned vendor leaf packs (star+fan filled; hi-res in `assets/leaf-packs-2026/`, gitignored). **All 10 species buildable, 0 blockers, buildable-CLEAN=5** (Sugar/Silver/Pin Oak/Red Maple/Sweetgum). **Eye it: `:3334/forest`** (or `node arborist/readiness.js` / `INVENTORY.md`).
>
> **▶ NEXT UP (the live `/forest` 🟡-upgrades list, pinned durable):** **(1) STAGE 2** = vertical slice — one Sugar Maple perfect end-to-end (viewer §9 wired to matcher options + reference panel; leaf model = Ways §5 + derived `leaf.size` + season ramp + front/back), then the maple/oak kit-mileage core. **(2) Leaf polish:** ash **compound** + cypress **feathery-needle** still 🟡 placeholders (the 6 vendor packs didn't cover them); **Various-Fall-Leaves.zip** (Desktop) → the `leaf.season` ramp; `scale` silhouette unused by top-10. **(3) Bark:** birch **salmon river-birch color + 2nd mask channel** (Stage-3 exfoliating hard case). **(4) Chassis:** ideal **ornamental cores** for crabapple/redbud (stand-ins work today). **(5) Street-shot:** raise the **atlas leaf-tile budget** (device-profile) so the 2048 leaf sources render crisp up close. **(6)** habit-untag backlog (80 chassis); ratify Bark003 (ambientCG "smooth" vs our ridged). Tooling: `scratch/compose-leaf-packs.mjs` (deterministic atlas builder; ~20 scans/pack in `assets/leaf-packs-2026/`). The May-2026 Salon-composition + Procedural-v1.5 brief arcs (the as-built the kit-matcher rides) are **cooled to `_archive/BACKLOG-2026-05-brief-arcs.md`** — read the architecture doc first; the live open items that survived are distilled in `§ Live open work carried forward` (bottom).

---

## ▶ 2026-07-21 — SLAB WEIGHT: trees are ~85–88% of a poured neighborhood

Surfaced auditing the GitHub-Pages payload (tracked `public/` ≈ 1.03 GB against Pages' 1 GB soft limit). The finding is arborist-shaped: **the town is small, the trees are not.**

| scene | tracked | trees |
|---|---|---|
| centrum (2,954 buildings — the most in the repo) | **35 MB** | none baked yet |
| altadena | 117 MB | none (terrain-heavy) |
| lafayette-square | 147 MB | **126 MB — 85%** |
| hipointe-demun | 307 MB | **269 MB — 88%** |

Buildings + ground + lamps + shape + scene come to **20–35 MB**. Everything above that is the tree library baked per scene. **207 MB (25%) of `public/baked/` is byte-identical duplication.** Four items, cheapest first:

- [x] **⛔ BUG — `linden_american` skeleton variants are byte-identical** *(fixed 2026-07-22)*. **Cause, two links:** (1) `american_linden_a.glb` is a **shading-group chassis** (`BranchesSG` / `CapsSG` / `LeavesSG` — one tree in three meshes, exactly case 3 in `publish-glb`'s own variant-detection comment), and `generate-salon#writeMultiCompositionGLB` emitted **one top-level node per sub-mesh**, all named `linden_american_1`; (2) `publish-glb#namesSuggestVariants` counted the shared prefix without checking the names actually *differ* → three "variants", and keep-**by-name** then had each variant keep all three siblings → three byte-identical complete trees. Not stacked geometry: lod2 is 1,495 tris either way, so the *tree* always rendered correctly — the cost was publishing the full LOD ladder 3×, shipping it 3× per scene, and a roster that believed in three variants it never had. **Fixed at the source** (one node per *composition*, primitives merged onto one mesh) **and hardened downstream** (identical sibling names are not a variant signal; variants now keep by split-level **index**, not name, so a same-named forest scene can't collide either). Re-published → `variant mode: single (1 variant)`; stale `skeleton-2/3` removed from `public/trees/linden_american/`; the two dead roster entries removed from `looks/lafayette-square/design.json`. ▶ **Real linden variety is now an authoring job** — add slots in the Salon; the pipeline will publish them as genuinely distinct variants. ▶ **The baked copies under `public/baked/*/trees/linden_american/` are still the old triples until a re-bake.**
- [ ] **KTX2/Basis the tree atlases.** 97 MB of uncompressed PNG across scenes (HPDM alone: 73 MB — `trees-atlas-color` 20 MB + `normal` 17 MB + leaves/bark). Already scoped in `HANDOFF-hero-impostor-and-startup-weight.md:58` — *"27.6 MB → ~5 MB, smaller on wire AND in VRAM, independent of impostors."* No KTX2Loader exists in the repo yet.
- [ ] **Share the tree library instead of copying it per scene.** LS and Księży Młyn each carry 101.8 MB of tree GLBs — the *same* linden, maple, oak, plane. `InstancedTrees.jsx:780` rewrites every tree URL to `baked/<look>/trees/…` with **no fallback** to the shared `public/trees/` library, so each slab must carry its own copy. Deduping is an architecture change (it trades slab self-containment for a shared asset path) — **discuss before building**; it also interacts with the per-look 404s below.
- [x] **Atlas QA `-viz.png` untracked** (2026-07-21) — 20 MB, `bake-look.js:658` writes them, nothing loads them; gitignored so they stay local and stop shipping.

Related, same audit: **1,850 HPDM placements (17.9%) request GLBs absent under the look** — six species (`betula_pendula` 725, `magnolia_sp` 438, `acer_saccharum_multistem` 261, `nyssa_sylvatica` 152, `tilia_americana` 141, `acer_saccharum` 133) have no directory in `public/baked/hipointe-demun/trees/`, though all resolve fine against the shared library. Same class as the LS prod 404s, ~3× the exposure. Cause looks like ordering: `trees.json` is Jul 17 00:25, the atlas + GLB dirs Jul 16 13:22 — the re-plant landed after the GLB stage. **A re-bake is the fix.**

---

## ▶ 2026-07-08 — the operating model + the Salon/Grove interface pass (Jacob walkthrough)

**The settled operating model (design, agreed in prose 2026-07-07):**
- **Intake seeds the Look.** A neighborhood census becomes a Look with a *mandatory-real* seed roster: every census species → nearest real chassis (via `bake-trees CATEGORY_FALLBACK`) or an honest gap — **never a filler** (the no-filler pool + [[project_no_filler_gate_and_chassis_curation]] is this gate, moved to Look-birth). A Look opens complete + bakeable; the Salon only *refines*.
- **Three surfaces, one judgment each:** Intake **seeds** · Salon **adds/composes** (add blind, one tree) · Grove **culls in context** (see it next to siblings) · Bake **ships**.
- **Vocabulary = Promote / Demote, no ratings.** Kill the 0–4 Fill/Mid/Hero scale (false precision). **Promote** = vouch eligible (Salon). **Demote** = set aside, **reversible/non-destructive** (Grove, per-Look *and* global). Default = untouched. No hero bit.
- **Grove is add-nothing, remove-freely** (read-only for adds; keeps demotion). Adds happen in the Salon.

**✅ THE BIG JOB — BUILT 2026-07-11** (merge `f1496661`, agent Sylva; eye-gated "looking great"). **The composition workspace on the 9 habit SHELVES (NOT a matcher).** Jacob 2026-07-08: a per-species fuzzy-match / recommendation score is brittle — "Recommended (0)" everywhere is that fragility showing. **Categorize, don't recommend.** The rubric already closes the set, so there's nothing to score:
> - **The counts are finite + complete:** **9 chassis HABITS** — `vase · columnar · oval · spreading · weeping · multi-stem · pyramidal · rounded · irregular` (rubric axis 0); **10 leaf shapes** (palmate · lobed · heart · ovate · lanceolate · compound · fan · star · needle · scale, axis 10); **~8 bark types**. Every silhouette is one of the nine — a closed botanical set, not a growing list.
> - **Parts live on shelves.** Each chassis is assigned ONE of the 9 habits (a *fact*, assigned once — not a score recomputed); leaves → 1 of 10; bark → 1 of ~8. The chassis picker is a plate grid **grouped by shelf** (like bark/leaves already are).
> - **A species declares its habit** (also a fact — White Oak = rounded/spreading). Selecting it lands you on that shelf; browse other shelves freely. **No Recommended toggle, no match engine.**
> - **Coverage per species = "is there a part on each of its shelves?"** → chassis ✓ / bark ✓ / leaf ✗ surfaced in the roster list (the "just need leaves" read). The console reads: *"we have a model (+ the other chassises on its habit shelf · bark/leaf options)"* OR *"no model, but its habit → these chassises, its bark → these barks, **just need the leaves**."*
>
> **The tagging is the reliable kind of work — assign-one-of-N, no ML:** the existing **~80-chassis habit-untag backlog** (1 of 9) + leaf-shape + bark-type per part. Bounded, checkable, a curation afternoon. Species carry their habit via the dossier/rubric ([[project_dossier_annotation_is_first_class_ip]]).
>
> Also in the workspace: roster list gets **All / By-Look** scope over the **growing cross-intake species library**; the `SLOT`-header spot → **collapsible species header** (light now: name · botanical · category · coverage; full dossier — reference photos + descriptor — when the species is tagged). Supersedes the [[project_arborist_kit_matcher]] recommendation framing.
>
> **✅ LANDED 2026-07-11 (merge `f1496661`, agent Sylva) — the Shelves gauntlet + Phase 4:**
> - **Shelves surface** (`ShelvesWorkstage.jsx`, `chassisThumbnails.js`, `chassisForms.jsx` + backend catalog/part-shelf tags): browse all 241 chassis, **silhouette-only** into the 9 forms, junk auto-flag + set-aside, **whole-chassis crown-silhouette** thumbnails.
> - **Phase 4 Salon** composes off the shelves; the matcher (`chassisPlateList` / `salonOptions` ranking + base-dedup) is **ripped out of the picker** — collapsed to "Oval (declared) + Other", dossier-first.
> - **Library QC fallout, fixed:** wood-coverage / **stub-wood checker** (`backfill-wood-coverage.js` — leaves-first vendor variants like `black_gum_i` render bare-wood as a stub) + **47 orphaned-mesh chassis repaired** (`repair-orphan-meshes.js`, `glb-scene-utils.js`); **producer fix in `survey-deleaf.js`** (`attachOrphansToScene` + `computeWoodCoverage` at emit → a re-run reproduces both). The `_chassis` backfill/repair already wrote to the shared gitignored library.
> - **Curation data:** `setAside` **decoupled from `approved`** (16 migrated `approved:false` → `setAside:true`) so the Salon isn't painted red.
>
> **◻ OPEN (the arc *enabled* these — not done):**
> - **The tagging pass itself** — only ~5 chassis classified; the shelves stay empty until a **curation afternoon** (the whole point of the surface).
> - **Vestigial:** the `InsideHeader` **"recommended" scope toggle** (old matcher UI) is still wired — sweep it (left in to keep Phase 4 contained).
> - **Roster coverage lights (🟢/🟡/🔴)** are still the OLD `park_species_map` routing coverage, **NOT** reconceived as shelf/part coverage (chassis✓/bark✓/leaf✗) — a future arc.
> - **Species-key seam** (roster slug `maple_sugar` vs botanical `acer_saccharum`) still tangled; Phase-4 landing works only because `/salon/:id/options` resolves both — **fragile; the #1 reliability fix** (ORIENTATION seam #2).

**◻ Canary picker → Meteorologist side.** Removed the Salon's `→ Set canary` (2026-07-08). The Meteorologist has `CanaryScene` (reads the `meteorologist-canary-tree` localStorage pref, renders it) but **no picker** — needs a species/variant selector there (list from the Look's atlas/roster) that writes the same payload. Until built, the canary still *renders* the last-set value but can't be *changed* from the UI.

**✅ LANDED 2026-07-08 (Salon interface pass, `SalonWorkstage.jsx` + `generate-salon.js`):** Leaf Source → 3-way `Bare · Native · Synthetic` (Bare ships bare — authored, `hideLeaves` in preview+publish; dropped the preview-only Visible toggle); Leaf + Bark pack libraries → collapsible; removed the Overhead (Browse) section, the Name/Reset/Set-Canary footer, the "SLOT · adopted" header, the "all adopted" counter, and the leaf helper-text; roster list dropped the Todo/Done/N/A task-status tabs (→ scope All/By-Look is part of the big job); **species intro (ReferencePanel) → top of the tools stack** (blank on un-dossiered species until the light fallback lands); removed the species-header **`Recommended / Show all`** toggle + **`Mark not-available`** (chassis picker defaults to show-all; recommendation → the 9-habit shelves, above). Grove earlier: no-filler + one-tile-per-species dedupe. Species intro (ReferencePanel) → top of stack; `Recommended/Show all` + `Mark not-available` cut; `1 tree/3 variants` → `Solo/Group`; chassis thumbnails re-centered; Fix-orientation re-aligned; Chassis/Bark/Leaf **libraries → collapsible + called-out chips**; roster rows trimmed to `species · N placements` (slug + state words gone).

**◻ OPEN — surfaced in the 2026-07-08 interface pass (verified findings):**
- **Bark knobs hide-when-inert** (or seed a bark entry). `tint / uvScale / roughness / jitter` are runtime uniforms keyed by a per-species bark manifest entry; **no entry → they do nothing**, so they're **dead on every Native/substituted tree** — the code says so at `generate-salon.js:1571`. The bark **ref swap** works everywhere. Fix: hide the four knobs when there's no entry, or give every composed species a bark entry.
- **Yellow/green species → seed the Salon composition** (this IS intake-seeds-the-Look). A 🟡 (composite/substitute) species opens **blank** because the substitute is a bake-time routing, not a seeded composition. Wire: 🟡 → pre-load the substitute · 🟢 → pre-load the literal · only 🔴 empty. "If there's a yellow light, there should be something in the Salon" (Jacob).
- **Species-intro light fallback** — `ReferencePanel` returns `null` without a dossier (~10 of 84 have one), so the top-of-stack intro is blank for most species. Show **name · botanical · category · coverage** always; upgrade to the full dossier card (reference photos + descriptor) when the species is tagged.
- **Meteorologist canary picker** — canary *setting* was removed from the Salon (2026-07-08). The Meteorologist renders the canary (`CanaryScene`, reads `meteorologist-canary-tree` localStorage) but has **no picker**. Build a species/variant selector there that writes the same payload. Interim: the last-set canary still renders; it just can't be changed from any UI.

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

> 🔄 **STATUS (2026-06-25):** The 16MB wall was **fixed at the source** — it was **flat normals**, not UV-lock: smooth-normals + weld + simplify gives a real lod0/1/2 ladder (`_archive/BATON-tree-weight-smooth-normals-2026-06-24.md`, rolled out library-wide). The **per-context Street/Hero/Browse-LOD + GeoTierDriver** strategy below is **SUPERSEDED** by the role-at-bake doctrine (`arborist/ARCHITECTURE.md §"Tree-render reality at LS"`): geometry = a per-placement ROLE at bake, depth gauges own visual distance, `GeoTierDriver` RETIRED. And trees currently **ship ALL-MESH** (`PROM_THRESHOLD=0`); the impostor render is PARKED. Kept here for the cull-oracle half (`classifyHeroTiers`, occlusion cull) which the future impostor arc reuses.

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
2. **DoF evaluation** — measure how much the DoF/LoD solution is buying us; may need optimizing. (`cartograph/_archive/HANDOFF-real-dof-2026-06-27.md`, `HANDOFF-render-conformance.md`.)
3. **Interface = the "fashion plates" pivot** — rubric-named + thumbnailed visual plates (kill `Bark007`), plate-based selection, **Grove/Salon render parity** (Grove=published GLB@LOD1/master atlas vs Salon=`generateSingleCompositionGLB`@LOD0 — same tree, two pipelines, they diverge).

**Follow-ups surfaced:**
- Fold **regenerate-from-source** (`generateSalon`) into `/grove/bake` so a bake never ships stale GLBs (the May-25-vs-June-leaf trap). Decided doctrine, not yet wired.
- **Birch authored renders bare** — connected-mesh leaf UVs map to empty atlas space (per-species texturing fix).
- Commit tonight's work (code + compositions + baked slab) — left for operator review.

---


## Live open work carried forward (distilled from the archived May-2026 brief arcs)

> The full brief-by-brief record is in `_archive/BACKLOG-2026-05-brief-arcs.md` (almost all `[x]` shipped / `[~]` folded). These are the items that were still genuinely open when the arc cooled — re-homed here so the active doc carries the open state. Several are subsumed by the kit-matcher (`§ NEXT UP` top) or the tree-render doctrine (`arborist/ARCHITECTURE.md §"Tree-render reality at LS"`); kept because no successor explicitly closed them.

**Kit / library (live — feed the kit-matcher front):**
- [ ] **Streamline asset intake** (old Brief 28) — "+ Add Model / + Add Leaves" targeted single-asset ingest (today: chassis via whole-library `survey-deleaf.js`; bark auto-extract at bake; leaves via `compose-leaf-packs.mjs`). The thin button rides a `serve.js` upload endpoint + a single-asset ingest mode. **Now ties to the 2026-06-25 `(Add +)` + online-asset-library thread** (top entry). 🧊 pull forward when asset-adding is a routine cadence.
- [ ] **Map-refresh — `src/data/park_species_map.json`** (operator-curated). The stale (2026-04-29, pre-chassis-library) routing `bake-trees.js#pickVariant` fans the messy park-names onto published species. Seeding the roster isn't "done" until every park-name routes onto a seeded species (or a deliberate filler). Coverage view surfaces the diagnostic; curation is by hand (no auto-guess gets it right).
- [ ] **Brief 25 — persist + bake provenance** (literal vs composite) into `manifest.json` so Coverage reads it from data instead of deriving on the fly.
- [ ] **Raise atlas `CONTENT_CAP`** (`bake-look.js`) once the roster shrinks post-Grove-curation — bark 512×1024→1024×2048 / leaf 512→1024 for a fidelity bump at no runtime cost. One-line knob; the actual roster size drives the cap. (Related: the kit-matcher §NEXT-UP "raise the atlas leaf-tile budget, device-profile" for crisp street-shot leaves.)

**Tree-render / geometry (live, but mostly under the role-at-bake + parked-impostor arc — `arborist/ARCHITECTURE.md §"Tree-render reality at LS"`):**
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
