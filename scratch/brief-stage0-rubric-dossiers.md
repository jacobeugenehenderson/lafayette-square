# Brief — Stage 0: the Rubric + the 10 Dossiers (the keystone)

> **Agent: FRESH.** *Not* the architecture's author. *Why fresh: Stage 0 is the first test of the kit
> thesis — that the self-contained architecture doc is buildable by a non-author. It also gives the
> keystone (the rubric) an **independent** author whose execution surfaces any under-specification
> before Jacob's vocabulary gate, instead of the design-author anchoring on its own choices. The design
> judgment is captured in §2 (every axis spelled out), so you **instantiate** the rubric as data, you
> don't re-derive it.* Name yourself — one word, novel (check `arborist/NOTES.md` + recent commits).
>
> **Plus one FRESH sub-dispatch: a research agent for reference images** (web research / botanical
> reference gathering — a different skill; Jacob spawns it, or you spawn it as a sub-agent). Bounded to
> the 10 species.

**This is Stage 0 of the ratified build plan** (`FOREST-BUILDER-KIT-MATCHER.md §13`). It produces
**data + entries, nothing renders.** Acceptance is Jacob's eye on the *vocabulary* (§13 Stage-0 gate).
The architecture is ratified — **execute it, don't re-design.** If something can't be authored as
specced, flag Boz.

---

## FIRST action — analyze the current library, seed from it (operator directive, do NOT greenfield)

Before authoring anything, read the library **as it actually exists** and take the seed (rubric
value-sets, initial part tags, dossier required-characteristics + recipe stubs) from what's there +
the operator's organizing work (`FOREST-BUILDER-KIT-MATCHER.md §13 Stage 0 / Addition A`):

- `public/textures/leaves/` — leaves are **split**: flat `<morph>.png` placeholders (compound, fan,
  heart, palmate…) **and** the real packs under `shapes/<pack>/` (each with `meta.json` carrying
  `morphology` + `naturalSize` cm). Mine both; note the split is exactly what the Library Builder (§4.5)
  later normalizes.
- `public/textures/bark/Bark0NN/` — 5 opaque dirs (Bark003/004/007/012/015) → map each to a
  `bark.type` (the human name lives in `species-map.barkMorph`: furrowed/papery/plated/ridged/scaly/
  smooth — surface it).
- `public/trees/_chassis/*.{glb,meta.json}` — **241 chassis** + `arborist/state/_chassis-curation.json`
  (operator approve/reject/unreviewed — **a strong seed signal** for which cores are workable).
- `arborist/species-map.json` (the proto-dossier), `arborist/leaf-pack-bindings.json` (the
  proto-matcher + `coverageGaps`), `arborist/roster-coverage.js` (the proto-dashboard).

⚠️ **Mine for structure/cues ONLY — the current assets are NOT deploy-ready or "good"** (the barks
look bad, leaves vanish). Quality is Stage 2/3 work; Stage 0 harvests *organization*, not endorsement.

## Build (the deliverables)

1. **`rubric.json`** (home: `arborist/rubric.json`) — every axis of §2 encoded as data per the §2
   schema: `id · partType · name · kind · values/range · plain · home · tagging · orthogonality`. Include
   the **similarity-matrix stubs** for each enum axis (§7.2 — `habit`, `bark.type`, `leaf.silhouette`,
   `leaf.ways`): the hand-authored "near/far" tables that *are* the matcher's taste. **`leaf.color` is
   LOCKED** (§2.3): a **value+saturation band, hue preserved per species** — encode it as such, no
   hue-collapse. Vocabulary-normalize the existing data into the rubric values (cordate→heart,
   pinnate→compound, papery→exfoliating).
2. **The dossier schema + the 10 species entries** (home: `arborist/dossiers/<key>.json`, or the
   Library Builder's declared structure) — harvested robust per §3: `key` (common name), `scientific`,
   `canonicalId`, `descriptor`, `required` (rubric values with `hardness` + `tol`), `recipe` stubs,
   `referenceImages[]` (filled by the research sub-agent). The 10 species are §12's table (exact
   manifest strings in `src/data/park_trees.json`). Migrate `species-map.json` field-by-field per §3 —
   **don't lose what's there** (tints → `leaf.season`/`leaf.color` anchors; barkMorph → bark.type; etc.).
3. **Reference images for the 10** (via the FRESH research sub-agent) — per §15 decision 5: **one
   canonical summer plate + one fall plate + one bark plate per species**, correctly identified, stored
   in the Library Builder's references home. Jacob ratifies identification (the eye).
4. **Declare the Library Builder target structure** (§4.5) — the canonical folder/naming scheme
   (`leaves/`, `barks/`, `chassises/`, references home) that Stage 1's ingest will write through. Declare
   it; don't migrate files yet (that's incremental, never a blocking migration — §4.5).

## Constraints

- **Nothing renders.** No production/runtime code. Data + entries + the declared structure only.
- **Consolidate, don't greenfield** — `rubric.json` harvests existing vocabulary; dossiers evolve
  `species-map.json`. Cite what each came from.
- **Commit the artifacts** (rubric.json + dossiers + refs + the structure doc) — they're the keystone;
  they must not be lost. Nothing else.

## Acceptance gate (Jacob's eye on the vocabulary — §13 Stage 0)

Jacob reviews `rubric.json` + the 10 dossiers **against botanical reference**: are the axes atomic /
orthogonal / complete? Are the value-sets right? Do the required-characteristics read true? Sign-off
here unblocks Stage 1 (the spine: ingest+tagger, matcher, dashboard — already specced, dispatchable on
this gate).

## Read first

`FOREST-BUILDER-KIT-MATCHER.md` §2 (rubric) · §3 (dossier + the migration table) · §4 (+ §4.5 Library
Builder) · §7 (matcher/tolerance — for the similarity-matrix stubs) · §12 (the 10) · §13 (Stage 0 + the
gate) · §15 (the 5 resolved decisions). Then the current-library read list above. Espalier's v1
(`cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md`) is **superseded** — read it only for the carried-forward leaf-fix
mechanics it details, not its framing.
