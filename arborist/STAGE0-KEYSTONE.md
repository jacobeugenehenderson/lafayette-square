# Stage 0 — the keystone: rubric + 10 dossiers (built)

> **Agent: Hortus** (fresh, non-author of the architecture). 2026-06-18. Built against
> `scratch/brief-stage0-rubric-dossiers.md` + `scratch/FOREST-BUILDER-KIT-MATCHER.md` §2/§3/§4.5/§7/§12/§13/§15.
> **Nothing renders — data + entries + the declared structure only.** Acceptance = **Jacob's eye on the
> vocabulary** (§13 Stage-0 gate): are the axes atomic / orthogonal / complete, are the value-sets right,
> do the required-characteristics read true against botanical reference?

## What shipped (the deliverables)

| Artifact | Home | What it is |
|---|---|---|
| **Rubric** | `arborist/rubric.json` | 19 axes (chassis/bark/leaf/overlay + the `tree.age` conductor), each with kind · values/range · plain · home · tagging · orthogonality · `seededFrom`. Plus the **4 similarity-matrix stubs** (habit, bark.type, leaf.silhouette, leaf.ways) + scalar/ordinal tolerance rules + the 2 declared non-axes. |
| **Dossier schema** | `arborist/dossiers/_SCHEMA.md` | The robust-entry shape + the field-by-field `species-map.json` migration table. |
| **10 dossiers** | `arborist/dossiers/<canonicalId>.json` | The §12 priority species (381 trees ≈ 50% of the park), each with referenceImages · descriptor · identityNotes · `required` (rubric values + hardness + tol) · `recipe` stubs · provenance · partAvailability. |
| **Reference manifests** | `arborist/references/<canonicalId>/sources.json` | One summer + one fall + one bark plate per species (url · credit · caption · `downloaded:false` · `ratified:false`). |
| **Library Builder structure** | `arborist/LIBRARY-BUILDER.md` | The declared canonical folder/naming target Stage-1 ingest writes through (§4.5). Declared only — no files migrate in Stage 0. |

**Self-check (passes):** all 10 dossiers parse; **every `required` enum value resolves against the
rubric vocabulary, 0 errors**; part coverage = **18 have / 6 stretch / 6 gap** (30 cells), and the 6
gaps map *exactly* onto the Stage-3 forcing functions. Re-run:
`node -e '…'` snippet lives in the commit message.

## Seeded from the live library — analyzed, NOT greenfielded (operator directive)

- **Rubric value-sets** ← `species-map.json` (`leafMorph`/`barkMorph`/`tints`/`hasFlowers`),
  `leaf-pack-bindings.json` (`morphologyToPacks` + `coverageGaps`), the pack `meta.json`
  (`morphology`/`naturalSize`/`tileGrid`), the 5 `Bark0NN` dirs, the 241 `_chassis/` + the
  `_chassis-curation.json` approve/reject signal.
- **Vocabulary normalized** into rubric values: `cordate→heart`, `pinnate/fine_compound/palmate_compound→compound`,
  `serrate_ovate/ovate_large/ovate_small→ovate`, `narrow→lanceolate`, `long_needle/short_needle→needle`,
  `papery→exfoliating`, `tulip→lobed`. (Full map in `rubric.json` per-axis `vocabNormalization`.)
- **Dossiers** evolve `species-map.json` field-by-field (2 of the 10 — `acer_saccharum`, `acer_rubrum`,
  + birch — carried forward from existing rows; the other 7 are new). `tints` migrated verbatim into
  `leaf.season.anchors`; `bark.{trunk,branch}` refs survive into `recipe.bark`.
- **Ground truth** for the 10 from a fresh botanical-research sub-agent (Missouri Botanical Garden,
  MDC, university extension) — confirmed binomials + habit/bark/leaf/phyllotaxy/fall-color + the
  reference plates.

⚠️ The current assets are **mined for organization only — NOT endorsed.** The barks look bad, leaves
vanish; **quality is Stage-2/3 work** (§0).

## FINDINGS — flagged for the vocabulary gate (under-specifications surfaced, not papered over)

1. **`leaf.silhouette` was incomplete — added `needle` + `scale`.** §2.3 prints the value-set
   *without* them, yet §12 forces **Bald Cypress** (#9, "scale foliage") and the live roster carries
   **Pine** (needle). Omitting them breaks the **completeness** promise. I added both. Botanical
   refinement: Taxodium is **needle-like** (linear two-ranked sprays), **not** broad "scale" like
   juniper/thuja — the brief's "scale" label is loose; bald-cypress is tagged `needle` (with `scale`
   reserved for true scale conifers). **Needs Jacob's nod.**

2. **The 5 `Bark0NN` dirs only partly map to `bark.type`.** Only `Bark007`→furrowed and `Bark003`→ridged
   are seedable (from `species-map` references); **`Bark004`/`Bark012`/`Bark015` are unassigned** —
   drafted as "ratify." Texture-classification is genuinely hard and the assets aren't deploy-ready, so
   these are `draft-then-ratify`, not auto. (See `rubric.json` `bark.type.barkDirMap`.)

3. **`species-map.barkMorph` values are loose; the dossiers refine them against reference.** Sugar Maple
   was `furrowed` → reference reads **plated/shaggy**; Red Maple `furrowed` → **ridged**; Birch `papery`
   → **exfoliating**. Each dossier records `seedWas` so nothing is silently overwritten. Confirm the
   refinements read true.

4. **Birch re-keyed `betula_pendula` → `betula_nigra` (River Birch).** The research agent's judgment
   call: River Birch is the standard heat-/borer-tolerant urban-park birch for St. Louis (paper/white
   birches struggle here). The exfoliating salmon-cinnamon bark (the Stage-3 hard case) is B. nigra's.
   **Confirm the species identity.**

5. **Crabapple is a cultivar judgment call (`Malus 'Prairifire'`).** The dominant disease-resistant STL
   ornamental; if the park's trees are a different cv., the genus-level traits still hold. No
   cultivar-specific Commons image exists — its reference plates cite MoBot/Chicago Botanic **source
   pages**, not raw images. **Confirm or substitute the cultivar.**

6. **Hardness choices are a taste call (the matcher's behavior rests on them).** I set `leaf.silhouette`
   **hard** (identity — a maple is not workable as an oak), and `chassis.habit` / `bark.type` /
   `chassis.size` / `leaf.ways` **soft** (rank, don't disqualify) — **except** `chassis.size` is **hard**
   for the two small ornamentals (Crabapple 6 m, Redbud 7 m) because the small-tree gap is the whole
   point of those species. The §3 example made `chassis.habit` *hard*; I went softer. **This is exactly
   the §15.1 tolerance-basis call — wants your eye.**

7. **Reference plates are stored as source MANIFESTS, not downloaded binaries (a scope call).** Stage 0
   is "data, nothing renders"; downloading + committing ~30 binary images is a Stage-1 **ingest** action
   (the manifests carry `downloaded:false`). The identification + captions + URLs are what your eye
   ratifies now; the binaries land when ingest runs. If you want the binaries in-repo at Stage 0, say so
   — it's a quick follow-up, not a re-author.

## What this unblocks

Jacob's sign-off here unblocks **Stage 1** (the spine: conform-and-tag-on-ingest + the Library Builder
threaded through it + the matcher + the readiness dashboard) — already specced (§13), dispatchable on
this gate. The matcher reads `rubric.json` `similarityMatrices` + each dossier's `required`; the
dashboard reads `partAvailability`.
