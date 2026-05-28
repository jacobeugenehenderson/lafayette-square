# HANDOFF — Ribbon Corners (stroke the inside of the polygon)

**Status:** fourth and final rewrite, 2026-05-28 night. Supersedes every prior version. The construction below was already in `project_ribbon_corner_uniform_width.md` from the start; three brief rewrites bolted on imagined complexity. Read this brief at face value. Don't elaborate.

**Author:** Boz, 2026-05-28 night, after eating three rewrites.

---

## §1 The plan, in one paragraph

You have a block. Its edge is the curb — a polygon called `blockRounded`, already with rounded corners from the corner-radius authoring kit. You want a ribbon (grass + sidewalk) on the inside of that polygon, hugging the curb all the way around.

In Illustrator: select the polygon, give it a thick **inside stroke**, split the stroke into two stripes — outer (grass, `treelawn` thick), inner (concrete, `sidewalk` thick).

In Clipper: three inward offsets of `blockRounded`. Two ring-differences. Two band rings. Done.

```
ringA = inset(blockRounded, cw)                                       // outer edge of grass
ringB = inset(blockRounded, cw + treelawn)                            // grass↔concrete divider
ringC = inset(blockRounded, cw + treelawn + sidewalk)                 // inner edge of concrete

grassBand    = differenceRings(ringA, ringB)                          // landuse, per-LU routed
concreteBand = differenceRings(ringB, ringC)                          // sidewalk material
```

Then the curb stroke (`curbBands` @2349) renders last on top, as today. Beyond `ringC` inward is parcel interior, handled by existing parcel construction (unchanged).

The corners take care of themselves. `blockRounded` is already rounded; offsetting a rounded polygon inward produces a rounded inner edge. There is no per-vertex math. There is no sector slicing. There is no per-fe attribution table. There is no `W_block` scalar. There is no synthetic strip. You do not think about corners — Clipper does.

---

## §2 What this assumes about authored data

**One arrangement per block.** Symmetric `treelawn` + `sidewalk` widths around the perimeter. Toy authors this and only this; LS chains carry per-side measures that are also symmetric in practice. **There is no per-fe asymmetry to handle in this brief.** If a future operator UX adds per-block asymmetric authoring, the construction can extend, but extending it now is overengineering for a case that doesn't yet exist.

The values `treelawn` and `sidewalk` in the construction above come from the block's authored measure. If you need them per-block (in case adjacent chains carry different values around the same block), take a uniform answer per block — operator-settled doctrine: `treelawn` and `sidewalk` are uniform around any one block. If the data shows divergent values around the four sides of one block today, pick one strategy ONCE (e.g. average, or majority, or the deepest-side value) and document it; do not invent per-fe attribution.

---

## §3 What to delete

`silhouetteStraightEmitter` (@1461) — replaced by the three-offset construction.
`buildFrontageBandsV2` (@1607) — replaced.
`buildFrontageBands` (@1368, already `// SUB-A retired`) — delete.
`KINK_THRESHOLD_RAD`, `PHASE2_*` constants, cusp guard, `RAMP_MIN_M`, `attributeFilletResidualToArcs` (@1813) — delete.

`dilateRings` needs inward + `jtRound` support if it doesn't already; the rest of the curb path is unchanged.

---

## §4 What stays untouched

Corner-radius authoring kit (`cornersAtIx`, `applyRoundCornersToRing`, `bezierReplaceCorner`, `CornerEditHandles.jsx`). `blockRounded` construction. Curb stroke cap (`curbBands`). `MeasureOverlay.jsx` and the entire Measure authoring UX. The `m.measure[side]` schema. `blockCustoms` keying. `buildChainBandsLive`. Per-LU routing in `bake-ground.js`.

---

## §5 Commits

**C1 — Three offsets, two bands, in `buildBlockGeometryV2.js`.** Replace `silhouetteStraightEmitter` and `buildFrontageBandsV2`'s output with `grassBand` + `concreteBand` per §1, feeding the same `frontageBands` consumer shape `bake-ground.js:349` expects (per-fe per-material rings keyed for per-LU probe on the grass side, sidewalk-keyed on the concrete side). Wire toy and LS together — no flag, no gate. If it looks right in toy, run it on LS the same commit.

**C2 — Delete the dead code listed in §3.**

That's all.

---

## §6 Validation

[`/AGENT-VALIDATION-SURFACES.md`](AGENT-VALIDATION-SURFACES.md) is the doctrine. Toy IS the spike surface — the production code path runs on it via `node cartograph/bake-ground.js`; results render in Toy designer. The visible-result gate: ribbon hugs the inside of `blockRounded` all the way around, grass on the outside, concrete on the inside, corners follow the rounded curve cleanly without grass wrapping. If it looks like a picture-frame mat around the block, you're done.

---

## §7 What ate the day, banked so it can't repeat

Across three brief rewrites (2053561 → 21b0c68 → 852a37c → 18dc8fe) Boz added per-fe sector attribution, depth-band ring stacks, `W_block`-as-scalar, synthetic landuse strips, material-attribution tables, sector slicing, "concentric-with-the-curb-by-construction" reasoning, and a positive directive in §0 about per-vertex-perp tripwires. **Every layer of that was solving for asymmetric per-fe authored measures.** The Measure tool doesn't reach the schema slot where per-block asymmetric override would land; toy authors one symmetric arrangement; the asymmetry was imagined. The original keystone — `project_ribbon_corner_uniform_width`'s "ribbon = one uniform width all the way around, corner = single inward Clipper offset of `blockRounded`" — was already the answer the first time it was banked.

Banked separately: [[feedback_boz_overengineered_for_imagined_authoring_complexity]].

**Don't re-import any of the deprecated machinery.** If you find yourself writing a `depths_block` array, a `sliceRingsByBlockRoundedSectors` function, a `Step-2 attribution table`, or anything that asks "which fe owns this slice of the ring," stop. You've drifted back into the imagined case.

---

*This document is one page on purpose.*
