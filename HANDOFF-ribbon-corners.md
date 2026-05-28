# HANDOFF — Ribbon Corners (the uniform-width model) [⛔ SUPERSEDED 2026-05-28]

> **SUPERSEDED.** This brief was dispatched and executed by Verge as commits `b8db7b0` → `4509171` (C0–C5 + 2 post-C5 buildPedBand attempts). The operator visual gate failed at every IX corner; the entire 13-commit code arc was REVERTED in `ea0bed6` on 2026-05-28. Root cause documented in **`RIBBONS.md §6.10`** + **`memory/feedback_per_leg_straight_only_overshoot.md`**: `silhouetteStraightEmitter`'s straight-only partition produces square overshoot past the rounded curb — a partition-strategy bug upstream of any corner emitter, which this brief did not name. The brief's "uniform-width model" framing was not directly implementable on a rounded silhouette without first fixing that. Brief rewrite pending (Boz, 2026-05-28) with polygon-only doctrine, full-blockRounded-walk emission, and the `applyRoundCornersToRing.consumed[]` extension named UPFRONT. Strips data-model architecture (C3.1–C3.5) was sound; the rewrite should re-land it once the corner emission is right. C4.5 wall enforcement doctrine is also sound; re-land. The pre-revert text below is preserved for reference.

---

**Status (pre-revert):** Dispatched to Verge 2026-05-27. C0 spike passed; C1–C6 in flight under HOLD-ZONE freeze (`bc5ae7a`).
**Author:** Boz, 2026-05-27.
**Supersedes:** the variable-offset / asymmetric-wedge framing in `RIBBONS.md` §6.8/§6.9. Prior planning passes' code map, authoring trace, bake constraints, and Clipper facts still hold; their construction (per-vertex-perp pad, three-regime emitter, concentric annulus at max-depth) is retired by this.

---

## §1 The win

The 13-month corner dragon was always the **variable** offset — per-side depths → asymmetric corners → wedges → per-vertex-perp ballooning. Keystone:

> **The ribbon (municipal curb → private property line) is one uniform width all the way around a block.** Per-side variation lives only in the *material* (grass vs concrete), not in the width. **Land-use fill plugs the remainder**, so the viewer never sees the scaffolding.

With width uniform, the corner is a **single inward offset of the curb silhouette** — concentric, degenerating honestly with the authored radius. A point at neutral, an arc when radius opens past `cw+W`, self-clipped when sharp (Clipper's native self-intersection handling: *"the ribbon corner stops when the points converge"*). No variable offset, no wedge, no per-corner joiner, no apex fillet, no per-vertex perp.

---

## §2 The polygon-only barrier (the stage-wall doctrine)

`RIBBONS.md` §1, line 74: **chains end forever at bake; polygons are the surface.** Inside `buildBlockGeometryV2.js`:

1. **Polygon construction is phase 1** — `blockSharp`, `blockRounded`, `frontageEdges`, corner records. Chains are consulted *only here*.
2. **After phase 1, emission consumes only polygon-side data.** `fe.measure` is baked at fe-construction; **no emission function takes `streets` as a parameter** (see C4.5). The wall is enforced by the function signature itself.

**Sanctioned exceptions:**
- `cornersAtIx` + `applyRoundCornersToRing` — the **corner-radius authoring/rounding kit**. Out of scope; do not touch.
- Authoring-overlay reads — `BlockGeometryV2Debug.jsx` enriching `fe` with `chainSkelId/chainName` for `MeasureOverlay`'s handle lookup is fine. The wall is about *emitted geometry*, not authoring cross-reference.

(Note: `RIBBONS.md` §1's cross-ref to `FEATURES.md §"The stage wall"` is stale — no such section exists today. `RIBBONS.md` §1 is canonical.)

---

## §3 The construction

Figure-ground is unchanged and load-bearing: **block = positive space**, `asphalt = stencil − blockRounded`, curb rounded via cubic Bézier on convex vertices. `blockRounded` is the **curb silhouette** (per-side curb position from `pavementHW`; rounded corners from the radius kit). Everything below insets *from* `blockRounded`.

**The ped ribbon (one continuous object):**
```
curbInner    = inset(blockRounded, cw)         // after the curb stroke
propertyLine = inset(blockRounded, cw + W)     // W = the DEEPEST leg's width, derived
pedBand      = differenceRings(curbInner, propertyLine)
```
Two uniform inward Clipper offsets + one difference. Corner falls out free, per §1.

**Materials inside the band (per side):**
- Each straight leg's ped band is split into sub-strips by an authored divider; each sub-strip assigned **concrete** or **land-use** → yields concrete|grass, all-concrete, or grass|concrete (cross-section order is per-side authorable).
- **Grass sub-strips are emitted per leg / per parcel** — load-bearing: `bake-ground.js:349` probes each treelawn ring to route it to its parcel's material. Never merge into one block-wide ring. Clipped to the straight run; cut off at corners.
- **The corner is the strips ARCING around — never a constructed block.** The sidewalk simply bends; where a grass strip (the curb-to-sidewalk gap) exists it *stops* at the corner and that gap fills with concrete; a sidewalk-only corner is just the sidewalk curving — nothing extra. The exact shape of the common *lopsided* corner (grass street meeting sidewalk-only) is decided by *looking* in C0, not pinned in prose.
- **Land-use fills everything ped materials don't** — the scaffold-band remainder on shallow sides *and* the block interior. Concrete-on-concrete at the leg→corner transition + land-use plug behind = no visible seam. The corner being concrete to the uniform band, deeper than a shallow leg, is correct (ADA corner pads) and invisible.

---

## §4 The authoring reshape (small + additive)

**Existing per-side handles stay exactly as wired** — drag + type-input. The aerial map under the ribbons, the click-centerline-to-select flow, the ribbon translucification, and per-side handles for curb / internal strips / outer sidewalk limit are all unchanged. They author the per-side "internal rectangle."

**ADD — the border** (derived, not authored). A continuous outer ribbon connecting all four sides at `W = max` of the per-side outer limits (the deepest leg). This is what makes it *one ribbon, not four*, and produces the clean continuous corner — one uniform offset at `W`. Render as the continuous outer limit when a block is selected. The corner's shape follows its two adjacent legs (decided by eye in C0).

**CHANGE — stripe management → fill assignment.** Instead of add/subtract stripes, each internal strip is *assigned a fill* — **concrete or land-use** — toggled by **ctrl-click**. "Treelawn" dissolves as a special material — it's a strip assigned land-use, the parcel showing through. All-concrete, all-grass, every mix fall out of one toggle.

**Data:** per side keeps `{ pavementHW, terminal }` + its strips; now `strip = { width, fill ∈ {concrete, landuse} }`. **No depth migration** — widths stay; only stripe *semantics* shift. `blockCustoms[blockKey][edgeOrd]` keying unchanged.

---

## §5 Code anchors (verified)

All file:line in `src/lib/buildBlockGeometryV2.js` unless noted.

**KEEP untouched:**
- Figure-ground + curb rounding: `bezierReplaceCorner` @614, `applyRoundCornersToRing` @677, `blockSharp` @2197/2260, `blockRounded` @2294, `asphaltRounded` @2300.
- Curb stroke: `dilateRings` @1853, `curbBands` @2349. Generalize `dilateRings` to take a sign/`joinType` so it can do the inward ped offsets; default args keep the curb call byte-identical. (The curb itself is also **authorable** — width via the type-input area, color-editable in the Stage. Preserve both.)
- The **3-tier corner-radius authoring kit** — `CornerEditHandles.jsx` runs its own `computeIxLayout` @118 (decoupled from emission), feeding `applyRoundCornersToRing`. Sanctioned chain consumer per §2; perfect and unrelated to ribbon emission.
- The **block polygon itself** stays editable (co-equal with ribbon editability; verify in C6).
- Live drag `buildChainBandsLive` @2537 (independent).
- Land-use / block fill (the plug) — already exists.

**REFACTOR — algorithm stays, inputs change per §2:**
- `silhouetteStraightEmitter` @1477 — keeps its run-partition + kink-split. Consumes `fe.measure` (baked at fe-construction), not `streets[fe.chainIdx].measure[fe.side]`. Drop `streets` from signature in C4.5.

**REPLACE:**
- The corner pad: `buildFrontageBandsV2` @1623 (the per-vertex-perp pad — source of every §6.8/§6.9 defect) → the corner is now the corner region of `pedBand` (uniform offset). Retire three-regime constants, cusp guard, `RAMP_MIN_M`.
- `attributeFilletResidualToArcs` @1813 → route residual to `cornerOrphanAsphalt` (renders as asphalt in both consumers).

**RETIRE (delete in C5):** `buildFrontageBands` @1368 (already `// SUB-A retired`), the `PHASE2_*` constants, the cusp-guard block.

**Consumer contract — do not break.** Both consumers iterate `frontageBands` strictly by field, never by corner identity:
- `bake-ground.js` @347–364 — the per-parcel treelawn probe @349 is load-bearing (see §3).
- `BlockGeometryV2Debug.jsx` @512–515 (asphalt), @567–592 (per-LU treelawn).
- Keep returning `frontageBands` entries `{ treelawnRings, sidewalkRings, asphaltRings }` + `cornerOrphanAsphalt` + `frontageCaps` (may be empty).

---

## §6 Ordered, revertible commits

> The construction is *new*. C0 is a throwaway spike — *decide from a picture*.

**C0 — Spike (throwaway).** In a scratch read-only probe, build `pedBand` via two uniform Clipper insets of one real `blockRounded` ring. Confirm the corner is concentric, degenerates to a point at neutral R, opens to an arc at large R, and self-clips when sharp. **Explicitly test the common lopsided corner** (grass treelawn+sidewalk meeting sidewalk-only) by looking — per `[[feedback_geometry_briefs_need_artifact_inspection]]`. **Gate:** the corner falls out clean with no per-vertex math. No production edit; delete after.

**C1 — Generalize the offset kernel** (no behavior change). Add inward + `jtRound` support to `dilateRings`; default args preserve the curb call exactly. **Verify:** curb byte-identical.

**C2 — New ped-band emitter behind a flag.** `buildPedBand(blockRounded, cw, W)` → two-inset difference → `sidewalkRings`. Per-leg grass sub-strips from the new `split`, clipped to straight runs, cut off at corners → `treelawnRings` (per parcel). Gate behind `opts.useUniformBand`. **Verify:** flag off = baseline; flag on = ring counts.

**C3 — Authoring reshape + migration.** Reshape MeasureOverlay handles (curb/property edges + divider + 2 fill toggles); per-side strips become `{width, fill}`. **Verify:** author a side three ways (concrete|grass, all-concrete, grass|concrete); writes flow to `blockCustoms`; re-emit.

**C4 — Cutover.** Flip `useUniformBand` default on; route `frontageBands = buildPedBand(...)`. Retire `buildFrontageBandsV2`'s pad path. **Verify (operator-gated, on the *corrected* render):** all 4 corners of every IX go uniform and concentric (§6.9 non-uniformity gone); grass never wraps a corner; land-use plugs cleanly; check Mississippi × Park (§6.9 reference IX) and a long curved chain.

**C4.5 — Enforce the polygon-only barrier (the stage-wall fix).** At fe-construction in `buildFrontageEdges` @1045, resolve ONCE and bake onto fe:
```
fe.measure = blockCustoms?.[fe.blockKey]?.[fe.edgeOrd]
          ?? streets[fe.chainIdx].measure[fe.side]
```
Refactor `silhouetteStraightEmitter` @1477, the pad emitters, `buildPedBand` @1889 to consume `fe.measure` and **drop `streets` from their signatures.** Structural enforcement of §2: after this commit, no emission function takes `streets`. The `fe` keeps `chainIdx/side/chainSkelId/chainName` for the authoring overlay — the wall is about *emission*, not cross-reference. **Verify:** byte-identical visible output to C4 (same resolution rule, moved one phase earlier); grep audit shows zero `streets` references inside ribbon/corner *emission* functions (the radius kit's `cornersAtIx` is the sanctioned exception). Revertible: parameter-list refactor, no algorithmic shift.

**C5 — Re-home fillet residual + retire dead code.** Route corner asphalt residual to `cornerOrphanAsphalt`; delete `buildFrontageBands`, `buildFrontageBandsV2` pad, `PHASE2_*`, cusp guard. **Verify:** asphalt mouths intact; build clean; no orphan refs.

**C6 — Re-validate authoring against the corrected render** (the "masked by the broken display" check). With geometry right, confirm the tools actually work: (a) block-polygon / width edit re-derives band + corner; (b) per-side material/divider edit re-emits; (c) radius drags re-shape the corner; (d) curb width + Stage color edit. **Then** update `RIBBONS.md` (§6.8/§6.9 → RESOLVED; §1 → uniform-width model), `NOTES.md`, `MEMORY.md`.

---

## §7 Critical files
- `src/lib/buildBlockGeometryV2.js` — the construction. `buildFrontageEdges` @1045 is where C4.5 bakes `fe.measure`.
- `cartograph/bake-ground.js` — consumer; per-parcel treelawn probe @349 is load-bearing.
- `src/cartograph/BlockGeometryV2Debug.jsx` — Designer consumer + verification surface.
- `src/cartograph/MeasureOverlay.jsx` — handles + `blockCustoms` writes (the C3 reshape).
- `cartograph/RIBBONS.md` §1, line 74 — canonical statement of the stage wall; update on close.

(z-fighting is unaffected by this work — `[[project_zfighting_known_cosmetic]]`.)
