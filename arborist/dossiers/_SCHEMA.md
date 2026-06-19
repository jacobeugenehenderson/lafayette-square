# Dossier schema — the robust species entry (the "fashion plate")

Stage 0 keystone, authored by **Hortus** (2026-06-18) against
`scratch/FOREST-BUILDER-KIT-MATCHER.md §3`. A dossier is `species-map.json` **made robust and
expressed in the rubric** — *not greenfielded*. Each is keyed by **common name** (the operator-facing
findability key), carries the **reference plates** (ground truth from the research harvest), and
declares the **rubric values this species demands** with `hardness` + `tol`. The operator **ratifies**
these once (the cognitive lift, up front); the matcher (`§7`) reads them forever.

One file per species at `arborist/dossiers/<canonicalId>.json`. The 10 priority species (`§12`,
381 trees ≈ 50% of the park) ship in Stage 0.

```jsonc
{
  "key": "Sugar Maple",                 // common name — the findability key
  "scientific": "Acer saccharum",
  "canonicalId": "acer_saccharum",      // existing slug spine (FEATURES §keying spine)
  "inventoryNames": ["Maple, Sugar"],   // exact src/data/park_trees.json manifest string(s)
  "count": 88,                          // park placements (the forcing weight)
  "descriptor": "one-line plain-language portrait",
  "identityNotes": "disambiguation / what tells it apart (from the reference research)",
  "referenceImages": [                  // §15.5 — one summer + one fall + one bark plate
    { "state": "summer|fall|bark", "url": "...", "credit": "...", "caption": "diagnostic features" }
  ],

  // REQUIRED — the rubric values this species demands. hardness ∈ {hard, soft};
  // tol read against rubric.similarityMatrices (enum: hops) or scalarTolerance (scalar: %).
  // hard axis out of tol → option drops workable→stretch; soft never disqualifies, only ranks.
  "required": {
    "chassis.habit":   { "target": "oval", "hardness": "soft", "tol": 1 },
    "chassis.size":    { "target": 21, "hardness": "soft", "tol": 0.4, "canopyRadiusM": 9 },
    "bark.type":       { "target": "plated", "hardness": "soft", "tol": 1 },
    "leaf.silhouette": { "target": "palmate", "hardness": "hard", "tol": 0 },   // identity
    "leaf.ways":       { "target": "opposite", "hardness": "soft", "tol": 1 },
    "leaf.size":       { "target": 12, "hardness": "soft", "tol": 0.4 },        // cm
    "leaf.face":       { "front": "...", "back": "...", "strength": "none|mild|strong" },
    "leaf.season":     { "anchors": { "buds":"#..","spring":"#..","summer":"#..","fall":"#..","winter":null } },
    "overlay.type":    { "target": "none|flowers|fruit|thorns" }
  },

  // RECIPE — what the operator picks/authors (written back by the viewer, §9). Stage-0 stubs:
  // candidate hints where the seed library clearly has a part, null where it's a GAP.
  "recipe": {
    "chassis": null,                              // a core-id, picked from matcher options
    "bark": { "ref": null, "band": null },
    "leaf": { "pack": "palmate", "ways": "opposite", "sizeMult": 1.0 },
    "overlay": null, "deformer": { "range": {} }, "transform": {}, "age": null
  },

  // PROVENANCE + matcher seed — what each field came from, and the part-availability the
  // dashboard (§8) reads as 🟢 in-hand / 🟡 stretch / 🔴 gap.
  "provenance": { "fromSpeciesMap": true|false, "notes": "..." },
  "partAvailability": { "chassis": "have|stretch|gap", "bark": "...", "leaf": "..." }
}
```

## Migration from `species-map.json` (don't lose what's there)

| Existing field | Becomes |
|---|---|
| `label` / `scientific` | `key` / `scientific` |
| `leafMorph` | `required["leaf.silhouette"].target` (vocab-normalized: cordate→heart, pinnate→compound) |
| `barkMorph` | `required["bark.type"].target` (papery→exfoliating) |
| `bark.{trunk,branch}` | `recipe.bark` (resolved spec; region-split survives) |
| `tints` | `required["leaf.season"].anchors` (the ramp seed, verbatim) |
| `deciduous` | `leaf.season` cardinality (deciduous ≈ ≤6 anchors; evergreen ≈ 2) |
| `hasFlowers` | `required["overlay.type"]` |
| `heroSpecies` / `qualityOverride` | unchanged (substitution lottery) — carried in `provenance` |
| **new** | `referenceImages[]`, `descriptor`, `identityNotes`, per-axis `hardness`+`tol`, `recipe.{ways,sizeMult,age}` |

Entries are **largely pre-populated** — habit/bark/leaf/phyllotaxy are documented botanical facts; the
operator **ratifies**, not authors from zero. Reference plates are the cloud-Tuner's ground truth made
a **UI element, not an agent** (`TUNER.md §8.2`) — "so we know what we're going for."
