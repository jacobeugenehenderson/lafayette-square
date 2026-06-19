# The Library Builder — target structure (declared, Stage 0)

> **Declaration only — no files migrate in Stage 0.** Authored by **Hortus** (2026-06-18) against
> `FOREST-BUILDER-KIT-MATCHER.md §4.5`. The Library Builder is the **filesystem counterpart of the
> rubric**: the rubric organizes the *concepts*, the Builder organizes the *files*. It is **not a
> one-time cleanup and not a manual step** — it is a **background task of every ingest / authoring /
> ratify action** (threaded through Stage 1's ingest, §13), converging the on-disk tree toward one
> clean canonical layout **a little on every action, never as a blocking migration.**

This file **declares the target** the Stage-1 ingest writes through. Stage 1 builds the Builder; it does
not pre-migrate the current mess. The point of declaring it now is so the ingest procedure (§4/§10) and
the dossier/matcher path reference **clean canonical paths from day one**, and the Builder owns the
indirection when a part is later renamed or relocated.

## The target tree

```
arborist/
  rubric.json                       # the keystone (§2)
  dossiers/<canonicalId>.json       # robust species entries (§3)
  references/<canonicalId>/         # the reference plates (§15.5) — summer/fall/bark
    <canonicalId>_summer.jpg
    <canonicalId>_fall.jpg
    <canonicalId>_bark.jpg
    sources.json                    # url + credit + caption per plate (the dossier referenceImages[] mirror)

public/library/                     # ← the Builder's canonical part tree (converged toward)
  leaves/<silhouette>/<packId>/     # canonical folder per leaf.silhouette value
    shape.png  meta.json            # meta carries: morphology, naturalSize(cm), tileGrid, ways(default), source
  barks/<type>/<barkId>/            # canonical folder per bark.type value (NOT 'Bark003')
    color.jpg normal.jpg roughness.jpg posterized.png detail.png meta.json  LICENSE.txt
  chassises/<habit>/<chassisId>/    # canonical folder per chassis.habit value
    <chassisId>.glb  meta.json      # meta carries: habit, size(heightRange), source, conformReport, tags
  overlays/<type>/<packId>/         # flowers / fruit / thorns / seasonal-props
    shape.png meta.json
  MANIFEST.json                     # generated back-end doc: what's where, by rubric value
```

## What it converges away from (the current mess — cues only, NOT migrated in Stage 0)

| Part-type | Today (the mess) | Converges to |
|---|---|---|
| **leaves** | SPLIT: flat `public/textures/leaves/<morph>.png` placeholders **and** real packs `…/shapes/<pack>/meta.json` | one `public/library/leaves/<silhouette>/<packId>/` per silhouette; the split is exactly what the Builder normalizes |
| **barks** | opaque pile `public/textures/bark/Bark0NN/` (003/004/007/012/015), type hidden one field over in `species-map.barkMorph` | `public/library/barks/<type>/<barkId>/`, named by `bark.type` — "surface the type as the name" (§2.2) made true on disk |
| **chassises** | flat 241-entry heap `public/trees/_chassis/*.{glb,meta.json}`, only 37 in `_chassis-curation.json` | `public/library/chassises/<habit>/<chassisId>/`, with curation approve/reject folded into meta |

## Three rules the Builder enforces

1. **One canonical folder per part-type, named by rubric value** — never by vendor id. A bark folder is
   `furrowed/`, not `Bark003/`.
2. **Paired meta beside every part** — the `meta.json` the matcher reads (rubric tags + conformReport +
   source), plus a generated front-end (the readiness/library view) and back-end (`MANIFEST.json`) doc.
3. **The Builder owns the indirection** — the dossier + matcher reference parts by canonical path, so a
   rename/relocate keeps every reference valid. Ingest **hands** each part to the Builder (it never drops
   a file ad hoc); the Builder places it canonically, names it by rubric value, pairs its meta.

## Stage-0 status

- **Declared:** the target tree + naming scheme + the three rules (this file).
- **Done in Stage 0:** only `arborist/dossiers/`, `arborist/rubric.json`, and the
  `arborist/references/<canonicalId>/sources.json` skeletons (the reference-plate manifests) exist.
- **NOT done (by design):** no `public/library/**` migration — that is incremental, Stage-1-onward,
  per `§4.5` ("never a blocking migration"). The current `public/textures/**` + `_chassis/**` stay put
  until ingest touches each part.
