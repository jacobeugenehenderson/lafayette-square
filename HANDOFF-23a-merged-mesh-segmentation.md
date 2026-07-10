# HANDOFF — Brief 23a: segment merged-mesh forest chassis into individual trees

> **Dispatch-ready brief. Drafted by Boz 2026-07-10.** The sibling flagged in `HANDOFF-chassis-tagging-gauntlet.md §Siblings` — **the real root of the overhead "rows of trees" / lost-willow artifact.** Run this **AFTER the chassis-tagging gauntlet lands** (both are arborist-pipeline lane; sequential, not concurrent).

## Who you are + the call

You are the agent dispatched to split merged-mesh forest chassis. **Name yourself** (one word).

- **Agent: FRESH.** Why: a distinct geometry/pipeline problem (mesh segmentation) against precise anchors, self-contained; branch off the post-gauntlet trunk so you build on the un-suppressed catalog. *(If the gauntlet agent is still live and Jacob prefers, it can warm-continue — but fresh-off-updated-trunk is cleaner.)*
- **Route:** `ORIENTATION.md` → `README §⭐ START HERE` → `arborist/ORIENTATION.md` (the operating model + "Arborist hands off pristine wholes") → `arborist/BACKLOG.md` (Brief 23 / 23a). Read to the section.

## The problem (verified 2026-07-10 — confirm against code)

Some chassis GLBs are **"group shots": a SINGLE merged mesh containing N trunks** (`acer_saccharum_a`=17, `acer_saccharum_c`=22, `burnt_tree`=4–8 …). When such a chassis is used as *a tree* and instanced across placements, **every instance is the whole cluster** — so the scene fills with **grids/rows of identical clumps** (the "rows of trees"), and individual specimens (the lost willow) never appear as themselves.

**What already exists (Brief 23, DONE):**
- **Detector** — `arborist/survey-deleaf.js#surveyTrunkClusters` (`:537`): counts trunk clusters in a mesh from `POSITION` geometry. `FOREST_MIN_TRUNKS = 3` (`:246`) — **≥3 trunks = forest; a 2-trunk reading is deliberately KEPT** (multistem / forked base — `sugar_maple_multistem`, `italian_cypress`, `blue_spruce`, `common_beech`, `western_juniper` all read 2 and are ONE legit tree). **Do not break this stem-vs-forest line.**
- **Worklist + suppression** — `arborist/state/_chassis-forests.json` (`{filename: {source, clusterCount}}`, producer-derived, regenerated each run); forests are suppressed from the Salon catalog via `generate-salon.js#listForestChassis`.
- **Node-split (the current splitter, INSUFFICIENT)** — `publish-glb.js#nodesSpatiallySeparated` (`:393`) + `findSplitLevel` (`:406`): splits a chassis into variants when trees are **separate scene-graph NODES** (≥2 m apart in xz) or names suggest variants. **It operates on NODES, not mesh geometry — it cannot reach inside one merged mesh.** That gap is exactly 23a.

## The task — a geometric splitter (one merged mesh → N individual-tree GLBs)

Given a merged-mesh forest chassis, **partition the mesh geometry by trunk cluster into N separate tree meshes**, each re-centered to its own origin, emitted as an individual chassis variant — so the library gains N usable single trees instead of one group shot. `surveyTrunkClusters` already *finds* the clusters; 23a turns that reading into an actual **vertex/triangle partition**.

**Approach (design to the section, flag if the substrate fights you):**
1. **Cluster assignment** — extend `surveyTrunkClusters` to return not just the count but the **cluster centroids (xz) + a per-vertex (or per-triangle) cluster label** (nearest-trunk-cluster in xz, canopy verts included by their column). Reuse its existing trunk-base clustering; don't invent a second clusterer.
2. **Partition** — split the mesh into N sub-meshes by label (keep whole triangles; a triangle spanning two clusters goes to its majority/centroid cluster). Preserve UVs / normals / material.
3. **Re-center + emit** — translate each sub-mesh so its trunk base sits at origin (the chassis convention), export N GLBs as variants (`<name>_a/_b/…` per the existing variant-letter scheme, `variantLetter`/`variantIndexFromName` in `survey-deleaf.js`).
4. **Un-suppress** — once split, the N trees are ordinary single chassis: **drop them from `_chassis-forests.json` suppression** so they flow into the catalog (and the gauntlet's tagging grid). Marked-but-visible forests become real, taggable trees.

## Invariants (violating any is how this goes wrong)

- **Pristine wholes** — each emitted tree is a *complete, standalone* chassis (correct trunk base at origin, whole canopy, valid UVs/normals). The Arborist hands off pristine wholes (`arborist/ORIENTATION.md §The law`).
- **Don't touch the 2-trunk line** — multistem / forked-base organisms (`clusterCount == 2`) are ONE tree; 23a only splits `≥ FOREST_MIN_TRUNKS`. Keep `FOREST_MIN_TRUNKS = 3`.
- **Producer state, not curation** — the split is a *bake-pipeline producer* step (like the detector), re-runnable, deterministic; don't write it into operator curation.
- **Deterministic + pristine** — same input mesh → byte-identical N GLBs (the Arborist determinism contract).
- **No-filler / honest-gap** stays.

## Relationship to the gauntlet (sequencing)

The **gauntlet** makes all catalog chassis browsable + tagged; it marks merged forests as *group-shots, visible but un-taggable-as-trees*. **23a converts those group-shots into real single trees** that then flow into the gauntlet's shelves as normal chassis. So: **gauntlet first (tag what's real) → 23a (split the forests into more real trees) → they join the shelves.** Together they retire the "rows of trees" and recover lost specimens like the willow.

## Anchors

- Detector + worklist: `arborist/survey-deleaf.js#surveyTrunkClusters` (`:537`), `#FOREST_MIN_TRUNKS` (`:246`), variant naming (`variantIndexFromName`/`variantLetter`, `:253`) → `arborist/state/_chassis-forests.json`.
- Current node-split (the gap): `arborist/publish-glb.js#nodesSpatiallySeparated` (`:393`), `#findSplitLevel` (`:406`).
- Catalog suppression to lift: `arborist/generate-salon.js#listForestChassis` (`:223`).
- Library: `public/trees/_chassis/*.glb` + `*.meta.json`.

## Commit boundaries + DoD

- Worktree off `curb-offset-draw` (after the gauntlet is merged); arborist-pipeline lane (`survey-deleaf.js`, `publish-glb.js`, `generate-salon.js`). Canon docs off-limits (Boz folds after eye-gate). Commit per phase (clusterer → partition → emit+re-center → un-suppress). Surface scope drift.
- **Definition of done:** a merged-mesh forest (e.g. `acer_saccharum_c`, 22 trunks) splits into 22 pristine standalone tree chassis, each re-centered, that appear as individual variants in the catalog/gauntlet; the 2-trunk multistem line is untouched; instancing them no longer produces rows-of-clumps; the lost willow is recoverable. **Jacob's eye passes** the split trees in the Salon + a scene render.
