# HANDOFF / BRIEF — the content-join pipeline (`bake-content`): make content membership == slab, by construction

> **Agent: FRESH → name yourself.** **Foreground** (background writes are denied). **Worktree** (`isolation: worktree`): trunk `curb-offset-draw` is live with other agents on tree/reader files — you work the intake/bake side (`cartograph/*`, a new `bake-content.js`, `cartograph/data/<scene>/content/*`), no overlap, but isolate.

## Route first (the CLAUDE.md gate — do not skip)
`ORIENTATION.md` → `README.md §⭐ START HERE` → then, in order:
- `cartograph/INTAKE.md` (§0.5 the **Extent tool** = the operator UI that decides building membership; §1 the sources; §2 geometry-vs-attributes).
- `NEIGHBORHOOD-INPUTS.md §5.1.1` (the **content-layer schema** — Layer 0 `profile.json` · Layer 1 `roster.json` · Layer 2 `listings.json`, joined by slab building id) + `§0.0` ("everything is a best guess, fully overridable") + `§5.2` (edge membership).
- `HIPOINTE-DEMUN-ROSTER.md` (the as-built HiPointe roster — line 499 names the current method: *"scratch-staged join scripts"*, i.e. the thing you are replacing).
- `cartograph/pipeline.js` (the geometry pipeline: building **membership** filter at ~L205–218 applies the Extent polygon + `building-overrides` activate/hide → the in-Extent building set) and `cartograph/bake-buildings.js` (assigns the stable `id: \`msbf-${b.msbfId}\`` at ~L56 and writes the baked render index — **your join target**).

Read the model; the doctrine below is settled — don't re-derive it.

## The gap (why this exists)
There is **no re-runnable content generator.** HiPointe's `roster.json`/`listings.json` were produced by one-off scratch scripts (not in the repo) that joined against a **2,089-building** set. The **Extent was later re-curated to 1,281** (`building-overrides`/boundary), and nothing regenerated the content — so 24/225 listings now point at buildings the current Extent excludes. **The Extent is authoritative (in-Extent → in the slab); the content just went stale relative to it, because the join was never a pipeline step.** (Diagnosis: `HANDOFF-building-position-from-slab.md`'s forensic + Boz's trace.)

## The goal (one line)
Build **`bake-content`** — a re-runnable, **scene-generic** bake step that spatially joins the raw sources onto the **baked (post-Extent) building set** and writes `roster.json`/`listings.json`/`profile.json`, so **content membership equals slab membership by construction.** Change the Extent → re-bake → re-join → zero orphans, no "decisions."

## ⛔ Decide the ENRICHMENT-PRESERVATION seam FIRST — standup before any mass-join
The machine-join regenerates the *base* roster/listings. But hand-authored enrichment exists and MUST survive: **`menus.json`** (keyed by listing id), **hosted photos** (`content/photos/<slug>/`), and the **four fully-elaborated cards** (Barrio · Louie · Sasha's · Clementine's — history/menu/photo fields). This is the `§0.0` "best guess, fully overridable" doctrine: **the join is the guess; hand-authoring is the override that wins.** Before mass-joining, propose + align with Jacob on the seam:
- Cleanest is a **base (machine-joined) + overrides (hand-authored) merge**: the join writes base records; a committed override layer (per-building / per-listing id) is applied on top and never clobbered by a re-run. `menus.json` + `photos/` are already separate override layers — mirror that for the elaborated-card fields (don't inline hand-authored prose into the regenerable `listings.json` where a re-run erases it).
- **This is the one real design decision — surface it, don't guess** (`feedback_baby_must_surface_scope_drift`).

## The design to build to (settled — the rest is not up for debate)
- **Join target = the BAKED building set**, not the raw msbf set. Read `public/baked/<scene>/buildings.json` (the render index: `id` = `msbf-*`, plus footprint → XZ centroid). A POI/parcel joins to a building iff that building is **in the baked set** — so membership is inherited from the Extent for free, and **every emitted `building_id` is guaranteed present in the slab (0 orphans, by construction).**
- **Inputs (all committed, per scene):** `raw/osm.json` (OSM POIs), `raw/stl_parcels.json` (assessor parcels / land-use), `content/nr-inventory.json` (NR survey), `content/county-land-use-codes.csv` (land-use code table). The Extent (`neighborhood_boundary.json` + `building-overrides.json`) is already reflected in the baked set — do **not** re-apply it; the baked set *is* the membership.
- **Outputs (match the existing shapes — `NEIGHBORHOOD-INPUTS §5.1.1`):** Layer 1 `roster.json` (`{meta, buildings:[…]}` — one per baked building: id, name, address, use, category/subcategory, in_historic_district, assessor fields…), Layer 2 `listings.json` (`{meta, listings:[…]}` — business/named POIs, `building_id` ∈ baked set, category/subcategory), Layer 0 `profile.json` (installation facts). Keep the existing field set; diff a regenerated LS-or-HiPointe against the committed file to prove shape-parity.
- **Classification = the existing Society Pages taxonomy** — the St. Louis zoning → category/subcategory table (`useListings.js` `ZONING_CAT/SUB/LABELS`, `src/tokens/categories.js`). **Reuse it; do not invent a new taxonomy** (it's a known deep-residual to generalize later — out of scope here; `feedback_classifier_keyword_cross_check`).
- **Scene-generic, one step, no fork.** `bake-content({ scene })` reads `<scene>`'s raw + baked set → writes `<scene>`'s content. Runs for any scene (`feedback_no_parallel_pipeline_for_scenes`). LS is the legacy exception (its content is hand-curated + conflated into `src/data/buildings.json`) — **do NOT regenerate LS content; guard the step so LS is untouched** unless explicitly asked (mirror how bake steps default-guard LS).
- **Pipeline placement + trigger:** runs **after** `bake-buildings` (needs the baked set). Wire it as a step in the bake chain and/or a `/grove`-style POST + CLI, so `re-bake HiPointe` re-joins content automatically. Confirm the existing bake orchestration (`pipeline.js` / `serve.js` bake endpoints) and slot in — don't build a parallel runner.

## Verification (the eye-gate — prove membership == slab)
- **HiPointe re-join:** every emitted `listings.json` `building_id` **exists in the current baked set** (grep/asserts → **0 orphans**, vs the 24 today). The Hi-Pointe/McCausland businesses either resolve (their building is in the Extent) or are correctly absent (it isn't) — **and if the Theatre is absent, that's a signal to check the Extent, reported, not hand-fixed here.**
- **Enrichment intact:** the 4 elaborated cards + menus + photos survive a re-run untouched (the override seam holds).
- **LS untouched:** the step does not regenerate LS content; LS app byte-identical.
- **Re-runnable/idempotent:** running `bake-content` twice with no input change is a no-op diff (`feedback_clean_regen_must_be_idempotent_complete`). Don't claim "confirmed" without driving a real re-join + the app (`feedback_dont_claim_confirmed_without_verifying`).

## Out of scope (surface drift before crossing)
- The **Extent's correctness** (is the Hi-Pointe node wrongly clipped?) is an operator/Extent-tool question — you *report* orphans-vs-Extent, you don't hand-add buildings.
- **Generalizing the STL zoning taxonomy** to non-STL scenes — its own deep-residual arc; reuse the existing table here.
- LS content regeneration; the reader render path; trees; backend tenancy — other arcs.

## Commit boundaries
Worktree branch; **canon docs off-limits** (Boz folds the outcome into `NEIGHBORHOOD-INPUTS §5.1.1` + `INTAKE.md` + the roster doc after eye-gate — retiring the "scratch-staged join scripts" line). Commit only your own files (`bake-content.js`, its wiring, the regenerated HiPointe content, the override-layer files). Re-baked content is Jacob's commit-or-discard call. Surface the enrichment-seam decision + any scope drift before crossing it.
