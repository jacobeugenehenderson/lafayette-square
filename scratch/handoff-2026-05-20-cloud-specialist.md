# Cloud Specialist — 52-preset photo analysis

**From:** Meteorologist orchestrator
**To:** Cloud Specialist (fresh vision-capable agent)
**Date:** 2026-05-20

---

## You are the baby. Start by naming yourself.

If you're reading this, **you are the dispatched agent** — not the orchestrator who wrote it. Jacob pasted this brief into your window. Your job is to execute it.

**Before you begin:** pick a name for yourself. Anything — a word, a symbol, a string of sounds, something in another language, something invented. Whatever feels like you. Tell Jacob your name in your first message back; sign your commits + final report with it; record it in your `specialist-seed.json` output's `specialist` field.

(If you find yourself starting to draft a brief for ANOTHER agent to do this work — stop. That's the orchestrator-confusion failure mode. You're the one doing the work.)

---

## Your job

Look at 52 cloud photographs with our exact shader knobs in mind, and produce a calibrated initial tuning + a short operator-facing description for each preset.

Your output is the upstream input to Phase Seed, which is what makes the Teapot library go from "52 identical whispy ghosts" to "52 visually-distinct, recognizable cloud morphologies, each captioned in plain operator language."

## What you produce

A single artifact: `meteorologist/data/specialist-seed.json`.

```json
{
  "version": 1,
  "generatedAt": "2026-05-20T...",
  "specialist": "<your name or pseudonym>",
  "presets": [
    {
      "id": "cumulus_humilis",
      "params": {
        "coverage": 0.32, "density": 0.85, "thickness": 500, "baseAlt": 1200,
        "warpFreq": 0.0010, "warpAmp": 280, "noiseSeed": 91, "octaves": 4,
        "sunScatter": 1.30, "ambientFloor": 0.32, "edgeSilver": 1.05, "shadowStrength": 0.65
      },
      "description": "Fair-weather puffy cumulus, low base, cauliflower tops with soft self-shadowing on the lit side. Mid-coverage; gaps between cells let blue sky through. Best authored at noon-summer altitudes.",
      "confidence": "high",
      "flags": []
    },
    ...51 more...
  ]
}
```

52 entries total. One per filename in `public/clouds/photos/<id>.jpg`. Run `ls public/clouds/photos/*.jpg | xargs -n1 basename | sed 's/.jpg//'` to enumerate the canonical id set.

## The 12 dials — what each one means visually

You're estimating these from the photograph. Each has a valid range from `src/meteorologist/cloudParamFields.js` (read that file). What follows is the *visual reading* for each:

### Shape

- **`coverage`** [0, 1] — fraction of sky covered by cloud. `0.0` = clear sky, `0.5` = scattered, `0.95` = overcast. **Visual cue:** what % of the photo's sky area is non-blue?
- **`density`** [0, 2] — opacity of the cloud body. `0.2` = wispy/translucent (sun visible through), `1.0` = solid white, `1.6` = dark/loaded. **Visual cue:** can you see through it? How bright is the body relative to a known white reference?
- **`thickness`** [0, 18000] meters — vertical extent of the cloud. `200` = sheet, `500` = fair-weather, `2000` = building, `8000` = towering, `15000` = anvil-cap cumulonimbus. **Visual cue:** silhouette ratio of height-to-width on a single cloud unit, scaled to the species.
- **`baseAlt`** [0, 15000] meters — height of cloud base above ground. `200` = fog/stratus, `1000` = cumulus, `3500` = altocumulus, `8000` = cirrus. **Visual cue:** sky position. Cirrus is high in the sky; stratus is at horizon. Use horizon position + cloud height-in-frame as a rough estimator. Tie to WMO published altitude ranges per genus.
- **`warpFreq`** [0, 0.01] — turbulence wavelength. `0.0002` = broad smooth lobes (stratus, lenticularis), `0.001` = medium (cumulus), `0.002` = fine wispy detail (cirrus). **Visual cue:** how fine is the edge detail relative to the cloud size?
- **`warpAmp`** [0, 2000] meters — turbulence displacement amplitude. `40` = nearly straight edges (stratus sheet), `280` = moderate ruffles (cumulus), `600` = heavily-distorted edges (cumulonimbus). **Visual cue:** how far do the edge ruffles extend from the "ideal" smooth shape?
- **`noiseSeed`** [0, 10000] integer — pseudo-random salt. **NOT visually inferrable.** Pick something — use `(sum of preset-id char codes) % 250 + base` per variant within a species, so cirrus_uncinus and cirrus_fibratus don't look identical at otherwise-similar params. Or just `Math.floor(Math.random() * 250)` if you want.
- **`octaves`** [1, 8] — noise complexity. `1-2` = smooth shapes (lenticularis, stratus), `4` = standard (cumulus), `6-7` = heavily detailed (cumulonimbus, dense cirrus). **Visual cue:** how many "levels" of fractal detail are visible — does the edge have detail-within-detail-within-detail?

### Lighting (estimate from how light interacts in the photo)

- **`sunScatter`** [0, 3] — direct-sun forward-scatter strength. `0.7` = matte (stratus), `1.3` = normal, `1.6` = brilliant (thin cirrus, fog with sun behind). **Visual cue:** how bright are the parts of the cloud directly facing the sun?
- **`ambientFloor`** [0, 1] — minimum brightness in self-shadowed regions. `0.15` = deep shadow (cumulonimbus undersides), `0.32` = moderate, `0.50` = bright (cirrus, where the cloud is thin enough to glow through). **Visual cue:** how dark is the darkest part of the cloud? Compare to a known black.
- **`edgeSilver`** [0, 2] — silver-lining intensity on backlit edges. `0.4` = none visible, `1.0` = normal, `1.4` = brilliant rim (sun-behind cumulus). **Visual cue:** is there a bright bright ring around the cloud edge against the sun?
- **`shadowStrength`** [0, 2] — self-shadowing depth (how dark the cloud's underside / interior gets). `0.15` = no internal modulation (thin cirrus), `0.65` = standard, `1.15` = deep (loaded cumulonimbus, nimbostratus). **Visual cue:** how strong is the contrast between lit top and shadowed bottom?

If the photo doesn't give you enough information to estimate a particular dial confidently (e.g., the cloud is silhouetted against the sun and you can't see its body), pick a value based on what's PUBLISHED for the species (WMO Cloud Atlas conventions) and flag the field in `flags` (e.g., `"flags": ["density_inferred_from_species_not_photo"]`).

## The description (operator-facing paragraph)

**Tone:** plainspoken, observational, helpful. Aimed at an operator who's picking which preset to sponsor for an event. They're not a meteorologist; they're someone authoring a Look. Lean toward what the cloud LOOKS like, where it sits in the sky, what kind of day it suggests.

**Length:** 40-80 words. One paragraph. No bullet points.

**Anti-patterns:**
- Don't recite the WMO species code; the operator already knows the name.
- Don't say "this preset has high coverage" — params are the implementation; describe what the operator sees.
- Don't use clinical meteorology jargon when plain English works.

**Good shape:**

> Fair-weather puffy cumulus, low base, cauliflower tops with soft self-shadowing on the lit side. Mid-coverage with gaps that let blue sky through. The signature of a calm summer afternoon. Author best at noon-summer altitudes; sits gently in the lower third of the sky.

> Wispy cirrus, very high altitude, drawn out into long fibers by upper-level winds. Translucent — the sun glows through them gold at golden hour. Suggests fair weather today, a front in 24 hours.

> Towering cumulonimbus, dense and dark-bottomed, with the anvil cap starting to spread. Late-afternoon thunderstorm material. Strong silver lining when the sun catches the side; very strong self-shadowing under the body. Read with rain_heavy or lightning_intracloud in the same Condition.

## Calibration approach (work in passes, not individually)

Don't go preset-by-preset. Cross-preset coherence matters — cirrus_uncinus' coverage should read lower than stratocumulus_opacus' because you've seen both. Two-pass approach:

**Pass 1 — Survey.** Look at all 52 photos quickly. Group mentally: cirrus family, cumulus family, stratus family, precip family, lightning family, special (fog/haze/clear). Note the visual range each family spans (e.g., cirrus spans `coverage ∈ [0.1, 0.5]`, cumulonimbus spans `[0.5, 0.95]`).

**Pass 2 — Tune.** Go through each family. Within a family, tune presets RELATIVELY to each other ("cirrus_spissatus is denser than cirrus_fibratus is denser than cirrus_floccus"). Maintain monotonicity inside the family where the species naming implies it.

You can write descriptions during Pass 2 or as a Pass 3 — your call.

## Output mechanics

Write the final artifact to `meteorologist/data/specialist-seed.json`. Pretty-printed JSON, 2-space indent. Include a top-level `generatedAt` ISO timestamp and a `specialist` name (your own; pick what you like).

Stage that single file + nothing else for commit. Don't touch `presets.json` directly — Phase Seed's downstream baby reads your artifact and merges into `presets.json` with proper autosave plumbing.

## What you DON'T do

- Don't modify `presets.json` directly.
- Don't write the UI. Phase Seed's baby owns that.
- Don't write the seeding script. Phase Seed's baby owns that.
- Don't second-guess the photo's species label. If `cumulus_humilis.jpg` looks more like mediocris to you, tune it as humilis-with-flag and add `"flags": ["photo_appears_to_show_mediocris"]`. Jacob can swap the source photo later if he wants.

## Calibration anchors (use these to peg the dial-space)

So your ranges stay consistent, here are pegs for the extremes:

| Field | LOW peg | MID peg | HIGH peg |
|---|---|---|---|
| coverage | 0.05 (cirrus_fibratus) | 0.45 (altocumulus_translucidus) | 0.95 (nimbostratus, snow_blizzard) |
| density | 0.15 (cirrus, haze_summer) | 0.85 (cumulus_humilis) | 1.50 (cumulonimbus_capillatus) |
| baseAlt | 100 (fog_ground) | 1500 (cumulus, altostratus) | 9000 (cirrus_spissatus) |
| thickness | 200 (cirrus, stratus_nebulosus) | 600 (cumulus_humilis) | 12000 (cumulonimbus_capillatus) |
| warpAmp | 40 (lenticularis, stratus) | 250 (cumulus) | 700 (cumulonimbus) |

`cumulus_humilis` is the one preset already hand-tuned by Jacob during Phase 4b.1 — use its current values (in `public/clouds/presets.json` at preset id `cumulus_humilis`) as your "this is what hand-tuned looks like" reference. Your output for `cumulus_humilis` should match those values (set `"flags": ["preserve_authored"]` and copy the params verbatim).

## Confidence + flags

`confidence`: `"high"` | `"medium"` | `"low"`. High = photo gave you most signals. Low = photo was poor (silhouette only, motion blur, overexposed) and you fell back to species conventions.

`flags`: array of short kebab-case strings. Useful flags:
- `"preserve_authored"` — Jacob already hand-tuned this; don't overwrite
- `"photo_appears_to_show_<other-species>"` — visible species mismatch
- `"<param>_inferred_from_species_not_photo"` — one or more dials couldn't be visually estimated
- `"poor_reference_photo"` — would benefit from a better source image
- `"variant_within_family_atypical"` — this variant pushes against the family's typical range

Flags are advisory; Jacob reads them, the seeding script doesn't act on them.

## Verification before you finish

- 52 entries in the output
- Every entry has all 12 params with values in the field-defined ranges (`cloudParamFields.js`)
- Every entry has a description (40-80 words, English, plainspoken)
- Within each species family, monotonicity where naming implies it (e.g., translucidus < perlucidus < opacus on coverage; floccus < castellanus on density)
- `cumulus_humilis` carries the authored values verbatim

## Why this matters

Right now the Teapot library is 52 entries of placeholder-whispy. A baby could seed it from a 14-bucket archetype table (decent but coarse). YOU can seed it from real photo evidence with calibrated cross-preset judgment, AND give every preset a human description. The result is an authoring surface the operator can actually use — pick a preset, read what it's supposed to be, see what it's supposed to look like, then tune the last 20% by hand.

This is the move that turns the Teapot from scaffolding into a real library.

— Claude (Meteorologist orchestrator)
