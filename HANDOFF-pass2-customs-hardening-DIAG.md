# Pass-2 customs hardening — diagnosis + fix

**Trammel, 2026-05-29.** Downstream investigation of Datum's dense-customs band collapse
(`HANDOFF-pass2-customs-hardening-DIAG.md` brief, Boz). Repro:
`scratch/diag-measure-customs-bandcollapse.mjs`.

**Status: Path (A) shipped — ≤50 LOC, fix landed in `src/lib/buildBlockGeometryV2.js`.**

## The failure mechanism (refines Datum's hypothesis)

Datum's "blockKey drift + segOrd assignment" hypothesis is **confirmed on the blockKey-drift
half, refuted on the segOrd half.** Traced precisely:

- `frontageEdges` count is **identical** (76) with and without customs, and `blocks` stays 14.
  Pass-2's geometry rebuild does **not** drop fes, and segOrd backfill is **not** the culprit —
  the carried-forward `(blockKey, edgeOrd)` keys on fes are correct.
- The collapse is **entirely inside `emitBlockRingBands`** (the C4 ring-band emitter). It groups
  fes into a `Map` keyed by `fe.blockKey`, then iterates `blockRoundedWithMeta[bi]` and looks the
  group up via a **freshly recomputed** `blockKeyFromRing(blockSharp[bi])`.
- After pass-2, the large-`pavementHW` customs (10–20 m) expand the asphalt, shifting blockSharp
  bbox centers ≥0.5 m → `blockKeyFromRing` flips its rounding bin. The fes carry their **pass-1**
  key (intentionally backfilled at line ~2780 so `blockCustoms` lookups resolve); the emitter
  recomputes the **pass-2** key. They disagree on ~10 of 14 blocks → `if (!blockFes.length)
  continue` drops every band on those blocks.

Diag confirmation (live + customs): emitter computes `0.0,9.5 / 8.0,79.0 / -82.5,76.5 / 3.0,10.0
/ -82.5,-80.0 / …`; fes carry `0.0,8.5 / 11.5,79.0 / -78.5,76.5 / 6.0,10.0 / -78.5,-80.0 / …`.
Only the 4 non-drifted blocks emit → **42 bands** (= 2+8+8+24).

This is textbook [[feedback_block_key_rounded_vs_sharp_diverges]]: *blockKey is not a join surface
across drift; use ring-index parity.* The comment at the emitter's head **already prescribed**
ring-index parity — the code just never implemented it (it used `blockKeyFromRing(sharpRing)`).

## The fix — Path (A), ring-index parity

1. `buildFrontageEdges` stamps `fe.blockRingIdx` = the `blockSharp` array index it was walked from.
2. `emitBlockRingBands` groups fes by `blockRingIdx` and joins via the loop index `bi`.
   `blockRoundedWithMeta = blockSharp.map(applyRoundCornersToRing)` (unfiltered, index-aligned),
   so `bi` is a drift-free join. `fe.blockKey` is untouched — still pass-1, still resolves customs.

**Result via repro:** live+customs **42 → 175**; live+no-customs **162** (unchanged, no regression);
static-bake path **156** (unchanged). Toy bake artifact **byte-identical** pre/post-fix (the
static-ribbons path's 1/25 match rate never drift-dropped a block, so the fix is a no-op there) —
the fix's effect is entirely in the **live Designer** (overlay-merged) path.

## Surfaced (separate, NOT fixed here — per §5)

1. **Bake-vs-Designer key divergence.** The bake reads static `toy-ribbons.json` (1/25 customs
   match); the Designer reads live overlay-merged ribbons (9/25). Customs were authored against
   live keys. My fix hardens the consumer so *whichever* customs match emit correctly, but the
   bake still under-applies. This is an upstream re-keying / shared-input concern, not consumer
   fragility — Datum's V2-Measure authoring territory.
2. **Stale leftover chain-scope customs.** `design.json.blockCustoms` still holds 6 legacy
   entries keyed `"0"`/`"5"` with `{left,right}` shape (pre-`72cd0a7` chain-scope authoring).
   They never match a real blockKey and are inert dead weight; a migration/prune is warranted.
3. **Pre-existing baked-artifact drift.** Re-baking `default` (LS) from HEAD source alone produces
   a modified `public/baked/default/` — committed LS bake is stale vs current source, independent
   of this work. Restored to HEAD; flag for a separate refresh.
