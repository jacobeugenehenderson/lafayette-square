# Brief — Stage 1A: conform-and-tag-on-ingest + the Library Builder (the spine, left half)

> **Agent: FRESH.** Name yourself one word, novel (check `arborist/NOTES.md` + recent commits; avoid
> Hortus / Florilegium / Espalier / Increment / Prism / Verdigris / Alidade / Theodolite / Verge / Mitre).
> You are **half of Stage 1** — you run in parallel with **Stage 1B** (the matcher + dashboard). Your
> contract with 1B is a single file: the **tagged-part index** (`arborist/state/part-index.json`,
> schema below). Build to that contract; 1B reads it. **The Stage-0 keystone is RATIFIED** — `rubric.json`
> + the 10 dossiers are the vocabulary you tag INTO. Do not re-open it; if it's wrong, flag Boz.

## ROUTE FIRST (mandatory gate, CLAUDE.md)
`ORIENTATION.md` → `README.md §⭐ START HERE` → the Arborist canon. Then read, to the section:
`scratch/FOREST-BUILDER-KIT-MATCHER.md` **§4** (conform-and-tag) · **§4.5** (Library Builder) · **§10**
(import = one procedure, two triggers) · **§13 Stage 1** · `arborist/ARCHITECTURE.md §authored transform
bake` + `§Phase F`. Then read the Stage-0 output you build against: `arborist/rubric.json`,
`arborist/dossiers/*.json`, `arborist/LIBRARY-BUILDER.md`, `arborist/STAGE0-KEYSTONE.md`.

## What you build

**1. Conform-and-tag as ONE ingest procedure (§4) — consolidate, don't rebuild.**
Most of *conform* already ships in `survey-deleaf.js` (Brief 19/20/23: recenter to dominant-trunk base
Y-min 0; rescale `>100m → ÷10^k` outliers; forest-split ≥3-trunk meshes; orient via the gnomon).
"Finish Brief 19/20/23" = **wire it to run on ingest as one procedure**, not re-implement it. Close the
residual you can (the per-composition orientation stays hand-done at the viewer — fine).

**2. The auto-tagger — draft rubric values from the part itself, each stamped with confidence (§4).**
Honor the auto-vs-ratify boundary the rubric declares (`tagging` per axis) — it is the **§15.2 named
decision** (accepted as recommended). The split:

| Rubric axis | Source | Confidence / tagging |
|---|---|---|
| `chassis.size` / `canopyRadiusM` | `tree-bounds.js` bbox (post-recenter) — LIVE, sole consumer `bake-look.js:29` | **high — auto** |
| `leaf.silhouette` | leaf-pack `meta.morphology` (+ `rubric.json` `vocabNormalization`) | **high — auto** |
| `bark.color` | sample the bark texture's dominant hue | high — auto-sample, ratify the band handle |
| `chassis.habit` | bbox aspect + branch-angle stats | **low — draft-then-ratify** (flat-merged stock is noisy) |
| `bark.type` | primitive/texture classification + `species-map.barkMorph` | **low — draft-then-ratify** |
| `leaf.ways` | not in the card geometry | **none — human-only** |

The auto-tag is a **DRAFT the operator ratifies, never gospel** (`feedback_proxy_render_is_not_the_operator_eye`).
Every tag carries `{value, ratified:false, confidence, source}`. **Vocab-normalize** through
`rubric.json` (`cordate→heart`, `pinnate→compound`, `papery→exfoliating`, `long_needle→needle`, …) so
every source feeds the **one** vocabulary. Tag **all three sources** (authored / lidar / procedural) into
it — unified findability (§11; LiDAR + Procedural are kept peers, you only INGEST-tag them, you don't
build their tracks).

**3. The Library Builder (§4.5) — threaded THROUGH this ingest, not a separate chore.**
Every part you ingest this stage is **placed + named canonically** by the Builder per
`arborist/LIBRARY-BUILDER.md` (`public/library/{leaves,barks,chassises,overlays}/<rubricValue>/…` +
paired `meta.json` + a generated `MANIFEST.json`). It **converges incrementally** — only the parts you
touch this stage move; **never a blocking migration** of all 241 chassis / 5 barks / split leaves. Ingest
**hands** each part to the Builder (never drops a file ad hoc); the Builder owns the canonical-path
indirection so 1B's matcher/dossier references stay valid.

**Run it on the parts in hand** (CLI/agent for the buildout now — `node arborist/survey-deleaf.js` for
chassis, `compose-leaf-packs.mjs` for leaves, drop bark + bake; §10 "for now"). The human's permanent
job is **ratify, never plumb**; the same procedure gets a user button later (Brief 28) — don't build the
button now.

## THE CONTRACT with Stage 1B — `arborist/state/part-index.json`
An array of tagged parts, the §7.1 shape. **This file is the seam; 1B depends only on it + `rubric.json`.**
```jsonc
{ "parts": [
  { "partId": "london_plane_c", "partType": "chassis", "source": "authored",
    "path": "public/library/chassises/<habit>/london_plane_c/london_plane_c.glb",
    "tags": {
      "chassis.size":  { "value": 25.04, "ratified": false, "confidence": "high", "source": "tree-bounds" },
      "chassis.habit": { "value": "spreading", "ratified": false, "confidence": "low", "source": "bbox-aspect" }
    },
    "conformReport": { "recentered": true, "rescaled": false, "forestSplit": false, "oriented": false } },
  { "partId": "palmate", "partType": "leaf", "source": "authored",
    "path": "public/library/leaves/palmate/palmate/",
    "tags": { "leaf.silhouette": { "value": "palmate", "ratified": false, "confidence": "high", "source": "pack-meta" },
              "leaf.size": { "value": 10, "ratified": false, "confidence": "high", "source": "pack-meta.naturalSize" } } }
] }
```
Emit chassis (from `_chassis/` + `_chassis-curation.json` — the approve/reject is a real signal), leaf
packs (from `…/leaves/shapes/<pack>/meta.json`), and barks (the 5 `Bark0NN` dirs) at minimum. Fold the
curation `approved`/`notes` + any `displayName` into the tags as a high-confidence ratified source where
present (a curated displayName like "Weeping Willow" → `chassis.habit:weeping`, ratified).

## Constraints / boundaries
- **File ownership (avoid colliding with 1B):** you own `survey-deleaf.js` ingest wiring, the new
  tagger, `public/library/**`, `arborist/state/part-index.json`, the Library Builder. **Do NOT rewrite
  `leaf-pack-bindings.json` or `roster-coverage.js`** — those are 1B's seeds; read them, don't mutate.
- Ride the **one pipeline / single master atlas** — no fork (`feedback_no_parallel_pipeline_for_scenes`).
- Gate live (browser-reachable) code on `opts.*`, **never `process.env`** (banked lesson — one ref crashed the tile build).
- **Acceptance (§13 Stage 1, Jacob's eye on the LIT app):** the ingest runs on the parts in hand and
  emits a real `part-index.json` with sensible tags + confidence flags; the touched parts are canonically
  placed by the Builder; Sugar Maple's parts (chassis + palmate leaf + bark) tag correctly. Build to a
  state I (Boz) can reconcile to `curb-offset-draw` for Jacob's eye — **agent-worktree work is invisible
  on the operator's dev server until merged** (banked lesson). Commit your work; I reconcile.
