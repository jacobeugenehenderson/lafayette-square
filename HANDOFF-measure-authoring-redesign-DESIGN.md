# Measure authoring redesign — polygon-only model

**Design review by Datum, 2026-05-29.** Design only; no code changed. Reviewers: Jacob + Boz.

Doctrine (RIBBONS §1): *chains end forever at bake; polygons are the surface.* The geometry already honors this — `buildBlockGeometryV2` takes no `streets` param. The **authoring surface** still writes chain-scope. This closes that gap.

`chain.measure` (incl. `symmetric`) stays a **read-only** inherited default — pipeline-derived input (skeleton.js → ribbons.json; `symmetric:false` is mostly the divided-road `inner-edge` anchor of RIBBONS §2:147, *not* operator authoring). The rule is only: **no authoring path writes to it.**

## 1. Audit — chain-scope authoring paths

| Path | Scope | Data target | Gesture | Doctrine status |
|---|---|---|---|---|
| `MeasurePanel.updateSide` (global branch, :214) | chain | `chain.measure[side]` (+mirror) | number-row commit, whole-chain mode | ❌ retire |
| `MeasurePanel.toggleAsymmetric` (:232) | chain | `chain.measure.symmetric` | "Asymmetric" checkbox | ❌ retire (→ transient) |
| `MeasureOverlay.applyDrag` (global branch, :522) → `modifyMeasure` → `setStreetMeasure` | chain | `chain.measure[side]` | handle drag, whole-chain mode | ❌ retire |
| `MeasureOverlay.tryFlipStripMaterial` (global branch, :767) | chain | `chain.measure[side].materials` | ctrl/right-click strip | ❌ retire |
| `ModeToggle` wipe-on-enter (:325) | chain↔block | wipes `blockCustoms` for chain | mode toggle | ⚠ rework (couples mode to data loss) |
| store `setStreetMeasure` (:1881) | chain | `centerlineData.streets[].measure` | — | ❌ remove after callers gone |
| store `setSegmentMeasure` (:1900) | chain | `chain.segmentMeasures` | — | 💀 **dead — no callers** |

Polygon-scope (keep): `applyDrag` block branch (:514), `tryFlipStripMaterial` block branch (:761), `setBlockEdgeCustom` (:545), `clearBlockEdgeCustomsForChain` (:579). Confirmed: **no chain-scope writes outside the three listed files.**

## 2. Polygon-only model

The chain becomes a **selection criterion**, never a write scope. Every gesture resolves to one or more `fe`s and writes per-fe to `blockCustoms[blockKey][edgeOrd]`. "Symmetric" and "all blocks along this chain" become properties of the *selection*, applied by fanning the same per-fe write across the selected `fe`s. `materials:{outer,inner}` already lives per-fe (V1.5).

```
blockCustoms[blockKey][edgeOrd] = { pavementHW, treelawn, sidewalk, terminal, curb?, materials:{outer,inner} }
// "whole chain" = write this to every fe whose chain identity matches
// "symmetric"   = also write to the opposite-side fe (transient UI mirror, not stored)
```

## 3. Migration ladder

1. **Selection model.** Add transient `mirrorSides` toggle + "whole chain" as a *select-all-fes* affordance (no chain writes). Panel infers two-sides display from value divergence between resolved L/R fes, not a stored flag.
2. **Reroute writes.** `updateSide` / `applyDrag` / `tryFlipStripMaterial` global branches → fan a per-fe `setBlockEdgeCustom` across the selected fes. Delete `modifyMeasure`.
3. **Retire chain setters.** Remove `toggleAsymmetric` write, `setStreetMeasure`, dead `setSegmentMeasure`, dead `clearBlockCustomsForChain`. Decouple `ModeToggle` from the wipe.
4. **Data migration: none destructive.** `chain.measure` stays a readable default; authored data is already polygon-scope (toy materials in `blockCustoms`; `symmetric:false` is pipeline-derived). No backfill needed.

## 4. What's lost — for Jacob

**One behavior, no capability.** Chain-scope let one drag move *future un-authored* blocks too (sparse default). Polygon-only materializes an explicit custom on each selected fe — every outcome reproducible via select-all, but the data footprint goes sparse→dense and the "living chain default" is gone. **Flag:** confirm you're OK trading the inherited-default convenience for explicit per-fe authoring. I believe yes (it matches the blockKey-drift robustness goal), but it's your call.

## 5. Stop-and-surface

- **No geometry conflict** — model needs zero emit-shape changes.
- **Parallel-impl drift:** `findFeForSide` / `chainMeasure` / `hasAnyChainCustom` are duplicated across MeasureOverlay + MeasurePanel ("keep in sync until extracted"). Extract during impl.
- **Vestigial code:** `setSegmentMeasure` and legacy `clearBlockCustomsForChain` are dead (no callers) — retire in-arc per the vestigial-UX-is-a-wall-violation doctrine.
- **Hidden coupling:** `ModeToggle` silently wipes customs on entering whole-chain — a data-loss gesture masquerading as a view switch; the §0 troubleshooting pain.
