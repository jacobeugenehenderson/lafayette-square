# HANDOFF — the Chassis Tagging Gauntlet (browse-all → habit shelves → Species Builder)

> **Dispatch-ready brief. Drafted 2026-07-10 (Atlas, with Jacob) after diagnosing why "no place in the Arborist shows all the chassis."** This is **"THE BIG JOB"** (arborist `BACKLOG.md`) — the unlock for the Species Builder. It is a **fresh focused arc**, paused-off the overhead-snapshot work (`HANDOFF-overhead-snapshot-impostor-wireup.md`).

## Who you are + the route
Name yourself (one word). **Route first (CLAUDE.md gate):** `ORIENTATION.md` → `README.md §⭐ START HERE` → **`arborist/ORIENTATION.md §"Categorize, don't recommend"` + §"The operating model"** + `arborist/BACKLOG.md §"THE BIG JOB"`. Read them to the section — the doctrine below is settled; do not re-litigate it.

## The one-paragraph goal (settled with Jacob 2026-07-10)
**Every chassis must be browsable in the Arborist and *usefully labeled* so the Species Builder can compose from it.** Today neither is true: **you can't see all 241 chassis anywhere**, and **0 of 241 carry a habit tag.** They're "useless if they're not separated and usefully labeled." The fix is ONE surface that is *both* the browse-all view *and* the tagging gauntlet: **a grid of all 241 variants, each assigned habit (1-of-9) + leaf-shape (1-of-10) + bark-type (1-of-8), persisted to curation — and the habit shelves fill themselves as you tag.**

## Diagnosis — verified this session (don't re-derive; confirm against code)
1. **241 chassis on disk** (`public/trees/_chassis/*.glb` + `*.meta.json`). Meta carries `morphology` (`weeping`/`broadleaf`/`conifer`…), `heightRange`, `source`, `leafAttachmentTags` — **NO `habit`, NO `leafShape`, NO `barkType`. 0/241 habit-tagged.**
2. **Why no surface shows all** — four stacked reducers in the Salon picker:
   - **Backend filters** (`arborist/serve.js` `/salon/:species/chassis`, ~L1173–1195): `allowedSpecies` (drops any chassis whose `source.species` isn't a Salon species → **−31**, incl. the clean `acer_saccharum` singles + procedurals) + `forest` (`listForestChassis` → **−5**). 241 → **205** reach the UI.
   - **Matcher ranking** — `SalonWorkstage.jsx#chassisPlateList` (~L877) sources plates from `matchOptions.chassis.options` (the ranked matcher). **⛔ "We're not ranking anymore"** (ORIENTATION: categorize, don't recommend — no matcher). This is the primary driver and must go.
   - **Scope gate** — `candidateScope` (`ranked`, ~L857): `recommended` = roster-fit names only; `approved` = `curation.approved===true` only (≈ nothing, most unreviewed).
   - **Base-dedup** — strips the `_<letter>` suffix so `weeping_willow_a…_e` collapse to ONE plate. 241 → ~40 bases.
   Net: a handful of plates, never 241.
3. **The 9 habits / 10 leaves / 8 barks are finite, closed, complete sets** (`arborist/rubric.json` + ORIENTATION) — assign-1-of-N is a *fact* stated once, not a score.

## The design — the tagging-gauntlet surface
- **One grid, all 241 variants** (all variants, grouped by habit — Jacob's call). Untagged land in an **"Untagged" shelf** at top; assigned ones populate their **habit shelf**.
- **Per-plate assignment controls:** **habit (1-of-9)** `vase · columnar · oval · spreading · weeping · multi-stem · pyramidal · rounded · irregular`; then **leaf-shape (1-of-10)** `palmate · lobed · heart · ovate · lanceolate · compound · fan · star · needle · scale`; **bark-type (1-of-8)**. Seed the habit control from the coarse `morphology` where it maps (e.g. `weeping`→weeping) so it's a *confirm*, not blank.
- **Persist to `_chassis-curation.json`** (the existing `salonChassisCuration` store, keyed `<name>.glb`) — extend the value from `{displayName, approved, notes}` to also carry `{habit, leafShape, barkType}`. Producer-independent curation that survives re-ingest.
- **This surface IS the browse-all AND the gauntlet.** As tags land, shelves fill; the Species Builder reads habit/leaf/bark shelves to compose.

## Build plan (phased)
1. **Backend — expose the full catalog.** Drop the `allowedSpecies` filter (keep the procedural/LiDAR *species*-dropdown exclusion, but not the chassis-catalog one). Forest chassis: **show them, marked** (⚠ group-shot) rather than hidden — you can't tag what you can't see; they're a Brief-23a sibling, not a reason to hide. A `?all=1` catalog endpoint (or a new `/chassis`) that returns all 241 is fine.
2. **Frontend — the grid.** Rip out the matcher ranking (`chassisPlateList` off `matchOptions`) + the `recommended/approved` scope + the base-dedup from the *browse* path. Render **every variant** as a plate, grouped by assigned habit (Untagged first).
3. **Assignment + persistence.** Per-plate habit→leaf→bark pickers → `setSalonChassisCuration` extended to write the tags → `_chassis-curation.json`. Optimistic UI; autosave (the existing curation POST pattern).
4. **Species Builder consumes it.** The composer's chassis shelf = chassis whose `habit` matches the species' declared habit; browse other shelves freely. Leaf/bark shelves likewise. (The "big build" in `BACKLOG.md §THE BIG JOB`.)

## Invariants (violating any is how this goes wrong)
- **Categorize, don't recommend** — NO matcher, NO ranking, NO score. Shelves, not suggestions.
- **Closed finite sets** — 9 habits / 10 leaves / 8 barks. A chassis gets exactly ONE of each (a fact).
- **Separated + labeled = usable** — an unlabeled or un-separated chassis is useless to the Species Builder. Tag it or it doesn't ship into the composer.
- **Tags are curation, not producer state** — persist to `_chassis-curation.json` (git-tracked sibling), survive `survey-deleaf` re-runs.
- **No-filler / honest-gap** stays (`arborist/ORIENTATION.md`).

## Siblings — flag, do NOT conflate (each its own task)
- **Brief 23a — per-tree segmentation** of *merged-mesh* forests (`_chassis-forests.json`: one mesh, N trunks — `acer_saccharum_c`=22, `sugar_maple_low_poly_forest_*`, etc.). Node-split (`publish-glb.js#nodesSpatiallySeparated`, ≥2 m separate NODES) already handles separate-node variety packs — it's how the library exists — but **cannot reach inside one mesh.** Until 23a, merged forests are tag-visible-but-marked, usable only once split. (This is the real "rows of trees" / lost-willow root.)
- **Stale forest publishes** in `public/trees/<species>/` — the *published* per-species assets are old scan forests (e.g. `acer_saccharum` manifest = `source: glb`, 1 variant, no chassis; footprints up to `pseudotsuga_oregon` **174 km**), and `generate-salon` **skips re-publishing** even after a composition re-point (verified: mtime unchanged after `/grove/bake`). A force/cache-bust on the composed-species re-publish is its own fix.

## Anchors (so the next agent doesn't spelunk)
- Library: `public/trees/_chassis/*.glb` + `*.meta.json` (241; `morphology` + `leafAttachmentTags`, no habit).
- Catalog endpoint + filters: `arborist/serve.js` `/salon/:species/chassis` (~L1173) · `allowedSpecies` (inline) · `listForestChassis` (`arborist/generate-salon.js:223` ← `arborist/state/_chassis-forests.json`) · base catalog `listChassis` (`generate-salon.js:188`).
- Salon UI: `src/arborist/SalonWorkstage.jsx` — `ranked` (~L857), `chassisPlateList` + base-dedup (~L877), `candidateScope` (~L853), `ChassisPlate.jsx` (the plate).
- Curation store + persistence: `src/arborist/stores/useArboristStore.js` — `salonChassisCuration` (~L578), `setSalonChassisCuration` (~L636) → `_chassis-curation.json`.
- The sets: `arborist/rubric.json` (19 axes incl. habit/leaf/bark) + `arborist/ORIENTATION.md §"Categorize, don't recommend"`.
- Forest detector: `arborist/survey-deleaf.js#surveyTrunkClusters` (per-prim trunk-cluster count → `_chassis-forests.json`).

## Commit boundaries
Worktree off `curb-offset-draw`. Canon docs off-limits (Boz folds the outcome into `arborist/` canon after eye-gate). Surface scope drift before crossing it. The gauntlet is a large arc — commit per phase (backend catalog · grid · tagging+persistence · Species-Builder consume).

## Definition of done
The Arborist has a **Library/Shelves surface showing all 241 chassis**, every one **assignable to habit + leaf + bark**, tags **persisted + reloaded**, and the **habit shelves render from the tags**. The Species Builder composes a species by landing on its habit shelf and browsing others freely — **no matcher, no ranking.** Jacob's eye passes the shelves + the tagging flow.
