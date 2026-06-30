# Arborist

The **tree kit** for the neighborhood — the helper that turns curated parts into the trees standing in Lafayette Square (and the next town after). It is the **Forest Builder kit-matcher**: one shared botanical vocabulary → robust species dossiers → parts auto-tagged on ingest → a matcher that turns a species name into ranked workable parts → the operator picks + tunes → the publish/bake spine pours them into the slab the public app renders.

> 🎯 **The goal** (everything below serves it): **the LS trees render reliably and look as good as possible.** "Reliably" = the same authored tree bakes to the same slab every time, no vanishing leaves, no stale-cache surprises. "As good as possible" = correct silhouette, bark, and leaves (size · arrangement · color · season), across the species that fill the real park.

> 🌳 **Doctrine (locked, 2026-06-18/20):** the kit-matcher is the Arborist's **front** — it rides the **kept** publish spine, it does **not** fork it (`feedback_no_parallel_pipeline_for_scenes`). **no-cull** — every tree draws at every distance (the hero-LOD / DoF arc is **parked**, dormant, not deleted). **Authored-only** is the active track; **LiDAR + Procedural are kept as equal peer tracks** (reachable, not retired). Leaf **size** and **color** are **rubric axes**, not patches.

---

## ⭐ START HERE — what the Arborist is, now

The Arborist has two layers:

1. **The publish spine (built, ridden unchanged)** — `generate-salon → publish-glb → bake-look (single master atlas) → bake-trees → the slab → InstancedTrees`. This is the machine that turns an authored recipe into LS trees. It is **kept**; nothing forks it.
2. **The kit-matcher front (the current build)** — the organizing / findability / authoring layer on top: the **rubric** (shared vocabulary), **dossiers** (robust species entries), the **matcher** (ranked workable parts), **Coverage** (per-part readiness), the **Library** (the parts), and the **Salon** (the authoring viewer). This is what the canon never coherently built before; it is being built now.

**Design rationale:** `scratch/FOREST-BUILDER-KIT-MATCHER.md` (ratified architecture + the staged plan). **As-built detail:** the quartet — `FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`. This README is the **current contract + front door**.

### Where the build is (now — 2026-06-25)
- **Keystone + spine — done:** `rubric.json` (19 axes) + `dossiers/` (10 species); ingest+tagger + Library Builder + matcher + readiness (→ Coverage). The publish→bake spine carries authored edits to the slab — **verified byte-level** (`scratch/measure-leaf.mjs`).
- **The Salon is now a plate-rack** (rubric-forward "fashion plates" — **`SALON-INTERFACE.md`**, root): **chassis** (live gray silhouettes) · **bark** (swatches) · **leaf** (cutouts) as visual plates with per-plate **★ Approve**; edits **autosave**; a **3-variants** toggle eye-gates per-tree variation; the deformer is **automatic by morphology** (panel retired). Going visual surfaced the data gaps — the empty `flat` leaf plates render as **"needed"** = the coverage map (~6 missing bases: fan, compound, fine_compound, palmate_compound, tulip, short_needle).
- **The part model (the target, `SALON-INTERFACE.md §2`):** ~40 **build-once** bases — silhouette ~3 topologies/9 habits · bark ~8 types · leaf ~25 shapes — color/face/season via **posterize**, each part tiering near/far by render-role. The dossier reference image is **intake-only** (its product is the rubric coordinates).
- **Open payoff:** fill the leaf-base gaps · `(Add +)` behavior + the **online asset library** (a hosted home for the build-once parts) · **3C** (canopy asymmetry / branch jitter) is the real per-tree diversity — the deformer alone is anti-stamping, parked until 3C.

---

## The pipeline (laid — whether a given stage is wired or not)

```
curated parts            authoring (the Salon)          publish spine                          the slab → LS
─────────────            ─────────────────────          ─────────────                          ─────────────
chassis  _chassis/   ┐                                  generate-salon.js  (compose one tree)
bark     bark/       ├─►  pick chassis · bark · leaf  ─► publish-glb.js    (variants + decimate)
leaves   shapes/     │    from MATCHER options,         ► bake-look.js      (single master atlas)
rubric + dossiers    ┘    tune the rubric axes,         ► bake-trees.js     (substitute placements)
                          against the REFERENCE         ► public/baked/<look>/  →  InstancedTrees.jsx
```

**Authoring is live; production is static** (`project_authoring_is_live_production_is_static`). Edits **autosave** to the composition; the **Grove "Bake → Slab"** regenerates-from-source (`generate-salon` → `bake-look` → `bake-trees`) and ships — the explicit per-species **Re-publish** gesture retired 2026-06-25 (autosave + the regenerate-on-bake replaced it). **The slab is the contract:** if it isn't baked into the slab, the public never sees it.

---

## The Arborist surfaces (UI modes)

Open at `/arborist` — lands directly in the **Salon**.

| Mode | What it is | Code |
|---|---|---|
| **Salon** | The authoring viewer (default) — a **plate-rack** (2026-06-25, `SALON-INTERFACE.md`): navigate by **roster species**; pick **chassis** (live gray silhouettes) · **bark** (swatches) · **leaf** (cutouts) as visual plates with per-plate **★ Approve** + `(Add +)`; tune the trims (leaf size, color). Edits **autosave**; **3-variants** toggle eye-gates the deformer. Deformer automatic-by-morphology; Tilt/Y-up in an "advanced" drawer; Re-publish/Adopt/Oubliette/gradient-editor/Studio-Worm retired. | `src/arborist/SalonWorkstage.jsx` + `ChassisPlate.jsx` |
| **Grove** | Gallery of the published trees on one ground plane + the **ship-to-slab bake**. Roster-driven (a published composition appears in the Look's roster). *See the open question below.* | `src/arborist/Grove.jsx` |
| **Coverage** | Read-only "have vs need" per roster species (🟢 literal / 🟡 composite / 🔴 gap) **+ the Forest-Builder per-part Kit readiness** (Chassis · Bark · Leaves). The path to the goal. | `src/arborist/CoverageView.jsx` |
| **Library** | The parts inventory by rubric value (leaves by silhouette, barks by type, chassis by habit) + the gaps. | `public/library/INVENTORY.md` (rendered view pending) |
| Procedural · LiDAR | **Kept peer tracks** — synthesize-a-tree authoring, reachable via `?legacy=procedural` / `?legacy=lidar`. Not the active track; not retired. | `ProceduralWorkstage.jsx` / `LidarWorkstage.jsx` |

---

## Contract

| | |
|---|---|
| **Inputs (Authored track)** | parts — `public/trees/_chassis/*.glb`, `public/textures/bark/<ref>/`, `public/textures/leaves/shapes/<pack>/` · vocabulary — `arborist/rubric.json` + `arborist/dossiers/<id>.json` · per-species recipe — `arborist/state/<id>/compositions.json` |
| **Inputs (peer tracks, kept)** | LiDAR — `botanica/` (FOR-species20K) + `seedlings.json` · Procedural — `seedlings.json` presets |
| **Outputs (artifacts)** | `public/trees/<id>/{skeleton-N-lod{0,1,2}.glb, tips-N.json, manifest.json}` + `public/trees/index.json` ; per-Look `public/baked/<look>/{trees-atlas.json, master PNGs, trees/<id>/…}` → the slab |
| **Kit state** | `arborist/state/part-index.json` (tagged parts) · `public/library/**` (canonical part tree + `INVENTORY.md`) |
| **Backend** | `arborist/serve.js` on port **3334** (proxied at `/api/arborist`) |
| **Ship-to-slab** | `node arborist/bake-look.js --look <id>` then `node arborist/bake-trees.js --look <id>` (the Grove bake) |
| **UI route** | `/arborist` (opens to the Salon) |

Artifacts are **deterministic** + **pristine**: same recipe + same on-disk parts → byte-identical GLB. *(Reliability caveat learned 2026-06-20: the Salon preview caches by a composition snapshot — any new leaf/composition param must be added to that snapshot, and bump its `buildVersion` on emission-code changes, or the preview silently serves stale.)*

---

## Key API endpoints (`arborist/serve.js`, port 3334)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/coverage` | Roster have-vs-need join **+ per-part Kit readiness** (`forestBuilder`) — powers Coverage + the Salon roster navigator |
| `GET` | `/salon/:id/options` | The matcher's **ranked options** per part-type + the **dossier** (reference plates + required) for the species |
| `GET` | `/salon/:id/{chassis,bark,leaves}` | Part catalogs |
| `GET\|POST` | `/salon/:id/compositions` | The per-species recipe overlay (absent-keys-preserved merge) |
| `POST` | `/salon/:id/:slot/preview-atlas` | Build the per-composition preview (atlas + UV-rewritten GLB via `generateSingleCompositionGLB`) |
| `POST` | `/salon/:id/publish?look=<id>` | **Stage** the species to the library (authoring; does NOT bake the slab) |
| `POST` | `/atlas/bake?look=<id>` | **Ship-to-slab** — re-run `bake-look` (the Grove bake) |
| `GET\|POST` | `/salon/curation[/:chassis]` | Chassis approve / reject / rename (the "approved" signal) |

*(Legacy peer-track routes — `/species/:id/seedlings`, `/species/:id/bake` (`bake-tree.py`), `/procedural/*`, `/lidar/*` — remain for LiDAR/Procedural. Full route list: `FEATURES.md`.)*

---

## Key CLI

| Command | What it does |
|---|---|
| `node arborist/serve.js` | Backend (auto-started by `npm run dev`) |
| `node arborist/ingest.js` | Conform + tag the parts → `part-index.json` + `public/library/` + `INVENTORY.md` |
| `node arborist/generate-salon.js [--species <id>]` | Headless Salon republish (compositions → GLBs) |
| `node arborist/build-leaf-atlas.mjs` | Compose varied tile-grid atlases for scanned leaf packs |
| `node arborist/bake-look.js --look <id>` | Pack the per-Look master atlas (the ship-to-slab bake) |
| `node arborist/bake-trees.js --look <id>` | Substitute placements onto the Look's roster |
| `python arborist/bake-tree.py --species=<id>` | LiDAR seedling bake (peer track) |

---

## The Grove → Slab (decided 2026-06-20)

The per-tree **Re-publish "add"** is **symbolic, not useful** — the Grove's set *is* the slab's set; everything in the Grove already ships to the slab on the bake. So the model is:

- **No per-tree "publish to add."** A tree is never manually added to the Grove.
- **Grove membership = eligible + approved, automatically.** *Eligible / prepared* = the species has an authored composition whose parts are in hand (the Coverage **Kit** readiness — buildable). *Approved* = the operator's eye sign-off (curation approve). Eligible + approved → it just shows in the Grove (and in every Look whose roster has that species; approval is **global per species** — Looks restyle, they don't re-approve).
- **One production gesture: the Grove bake.** It **regenerates each eligible+approved composition from its recipe + parts** and ships them to the slab — the bake *absorbs* the old "publish" step.

**Why:** simpler (one gesture, no symbolic middle step); **more reliable** — the slab is always baked *fresh from compositions + parts*, never from stale staged artifacts; **only eye-approved trees ship**. The author-live / produce-static split stays — we drop the *per-tree publish*, not the split.

**Retires / changes:** the per-tree Re-publish gesture; `syncLookRoster`'s "add" role; the `quality < 2` Grove gate — all collapse into *eligible + approved*. `bake-look`/`bake-trees` grow to regenerate-from-source (start with regenerate-everything; incremental later).

> **Status (2026-06-25 — LANDED):** the Grove **"Bake → Slab"** (`POST /grove/bake?look=`) now **regenerates-from-source** (`generate-salon` → `bake-look` → `bake-trees`, `15682e55`) — published is always fresh; the May-25-vs-June-leaf stale-trap is closed. Propagation verified byte-level (`scratch/measure-leaf.mjs`). Edits **autosave**; the per-species Re-publish gesture is retired (2026-06-25).
>
> 🔧 **Troubleshooting "knobs work in the Salon but not the Grove / LS / after a bake" (the recurring stale-artifact bug):** there are **two daylight gaps** — (1) the Salon preview is a *different artifact* (`generateSingleCompositionGLB`@LOD0) than what gets published, and (2) `/grove/bake` repacks the *last-published* GLBs and never re-runs `generate-salon`. **Today's fix:** `POST /salon/:id/publish` **each** edited species, *then* `/grove/bake`. Hard-refresh won't help — the stale artifacts are on disk. A species with no Salon composition (raw vendor GLB, e.g. `platanus_acerifolia`) can't take the leaf/bark knobs at all. **Full as-built flow + symptom→fix table: `ARCHITECTURE.md §Salon preview ↔ LS runtime material parity`.**
>
> 🎯 **TARGET — mostly LANDED (2026-06-25):** ✅ **autosave** (manual publish gone) · ✅ **regenerate-from-source folded into the bake** (published always fresh) · ✅ **Salon stripped to "fashion plates"** (the plate-rack — `SALON-INTERFACE.md`). ⏳ Residual: the live LOD0 preview **stays** — piece-3 locked "good enough" (it shares the runtime material, so no shader daylight; the published path is proven faithful). A **green-light readiness gate** for bake membership is *partial* — per-plate **★ Approve** exists; the all-green gate (Kit C·B·L + approve) is unbuilt. **LoD stays dormant-not-deleted** (DoF-replaces-LoD bet unproven). Realizes the *Grove → Slab (2026-06-20)* decision.

> ⚠️ **Synthesized trees are NOT yet "in the clear" (2026-06-20).** The leaf model is *wired + functional* (size, whole-crown fill, Ways are visually distinct) but **not visually correct** — the Ways grammars need work and the **season/color ramp is unbuilt**. The bake-to-slab + LS-camera work proceeds to test the *pipeline + cameras + DoF*, not to declare the trees finished.

---

## Read order

1. `scratch/FOREST-BUILDER-KIT-MATCHER.md` — the ratified kit-matcher architecture + staged plan (the live design).
2. This README — the current contract + front door.
3. The quartet — `FEATURES.md` (operator surface) · `ARCHITECTURE.md` (load-bearing patterns: publish-loop, master atlas, deformer, the cartograph↔arborist boundary) · `BACKLOG.md` (in-flight + next-up) · `NOTES.md` (dated decision record).
4. `../cartograph/ARCHITECTURE.md` — the kit-wide publish-loop pattern the Arborist mirrors.

## Cross-references
- `STAGE0-KEYSTONE.md` · `LIBRARY-BUILDER.md` — the kit keystone + the filesystem layer
- [[project_arborist_kit_matcher]] — the project thread
- FOR-species20K (LiDAR peer track): https://zenodo.org/records/13255198
