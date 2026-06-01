# HANDOFF / BRIEF — The Stroke Construction Model (one verb: stroke a path)

**Status:** SCOPING / brief-zero. **DRAFT — Lodestar for Boz**, from a design session with Jacob (2026-05-31). This is *the construction-model decision* that reshapes the wall-move's W2–W5 and **subsumes W1b's F1 + F3** (they share a root and are parked under this, not fixed in isolation).
**Reads first:** `HANDOFF-wall-move.md`, `HANDOFF-chain-consumer-census.md`, `cartograph/RIBBONS.md §1`. Memory: [[project_two_bakes_two_walls]], [[project_skeleton_is_the_first_bake]], [[project_ribbon_three_representations]], [[project_ribbon_corner_uniform_width]], [[feedback_results_over_vocabulary]].

---

## The decision, in one sentence

Replace the two constructions that currently fight each other (mono-width ribbon emission **and** figure-ground) with **a single generative verb — *stroke a path*** — applied in two stages:

- **Survey** strokes the chains **outward** (asymmetric) into the positive **hardscape** shapes (asphalt / alley / path), unioned into one compound vector shape. **This is the first bake — chains die here.**
- **Measure** takes those frozen shapes and strokes them **inward** (per-fe) into the **ribbons** (curb / treelawn / sidewalk). **LU is the remainder.**

There is no separately-authored "ribbon edge." The strips offset inward by their authored widths; where a block is too narrow they clip themselves; whatever interior survives is LU.

## Why — the root we're actually fixing

The mono-width keystone ([[project_ribbon_corner_uniform_width]]) fixed corner uniformity but **wrecked authoring**: the operator authors per-fe widths, the construction forces a uniform `W`, and the three representations of a ribbon drift apart ([[project_ribbon_three_representations]]) — the render stops matching the handles. That drift *is* W1b's **F1** (bands don't follow the drag) and is entangled with **F3** (the corner regression). They are not two bugs; they are one construction fighting itself. **We do not fix F1/F3 in isolation — they dissolve when the construction stops fighting.**

The keystone phrase to keep: **"ribbon monowidth, strips variable"** was the V1 patch. The stroke model supersedes it — *the strips are an inward stroke; the corner is the stroke's join; the collapse is the primitive's job, not ours.*

## The model, precisely

**Survey (stroke out → bake the hardscape):**
1. Each chain is stroked **outward** by its (possibly asymmetric) asphalt half-widths → a positive street/alley/path shape.
2. Union all of them → one compound hardscape shape. Corners/intersections fill by union; the join style controls the corner.
3. **Freeze it.** This is wall #1 ([[project_two_bakes_two_walls]]): chains are consumed into the shape and never read downstream. The frozen artifact is "a big stack of vector shapes associated with fes."

**Measure (stroke in → the ribbons):**
4. The block = the **complement** of the hardscape (everything that isn't asphalt), one compound shape that *includes* all the weird edge-of-map and dead-end space.
5. Stroke that complement **inward**, per fe, by `[curb | treelawn | sidewalk]` widths. Each strip is the ring between two inward offsets; LU is the innermost remainder.
6. **Only asphalt-facing boundary edges are stroked** — the map-boundary (stencil) edges of the complement are not, so the map edge never sprouts a sidewalk. That asphalt-facing-vs-not tag **is the `fe` you already identify.**

## The de-risking keystone (the AE "foolproof" trick, made concrete)

**Do not compute the medial axis / straight skeleton.** That is the genuinely hard, degenerate-prone part — and it is unnecessary. The collapse where blocks pinch is handled *for free* by a robust primitive, exactly as a self-intersecting stroke in AE/PS is just an outline filled by the winding rule:

- **Vector (this is the slab path):** successive inward offsets + boolean difference (Clipper). Where a strip can't fit, the offset returns empty / splits **on its own**; the band clips itself. You already do three Clipper offsets in the keystone — this is that machinery, with the artificial `W` removed.
- (A raster/SDF realization was considered and **rejected**: the output must be real triangulated 3D surface for the slab, not a coloring. Vector offset geometry only.)

The principle: **defer collapse/overlap to the robust primitive (Clipper union/difference), never solve it analytically.** That is why it's foolproof and why it covers arbitrary complex shapes, narrow necks, and the edge-of-map space without special cases.

## What this subsumes (the payoff)

- **F1** (live bands don't follow) — see the architectural note below.
- **F3** (corner regression) — corners become a stroke property, not a construction.
- **The 13-month corner saga** — corner = the join/round of the strokes at a block corner, governed by the existing per-corner **R kit**.
- **The artificial ribbon/LU `W` edge** — gone; strips meet LU at the natural collapse.
- **Figure-ground as a separate step** — the block is just the complement of the stroked hardscape.

## The high-value consequence Boz should weigh: F1 may dissolve *architecturally*

The reason ribbons couldn't follow a live drag is that **dragging `pavementHW` moved the block silhouette mid-Measure**, and the ribbons inset a stale silhouette. In this model the asphalt **is the Survey stroke**, so by the time you're in Measure the block edge is **frozen**. Ribbon-width drags then inside-stroke a *fixed* edge → cheap, live, no silhouette fight.

**This hinges on one authoring reshuffle:** asphalt width (`pavementHW`) becomes a **Survey** concern (you author it where you stroke the chain), and Measure authors only the ped profile (curb/treelawn/sidewalk). Conceptually clean — *footprint in Survey, profile in Measure* — but it is a real UX move and it is **the hinge the whole responsiveness win turns on.** (Validate in the spike; flagged as Open Decision #1.)

## Design resolutions reached this session (carry these forward)

1. **Asymmetric dead-end caps — no new geometry.** An asymmetric stroke about the centerline *is* a **symmetric** stroke about a **re-centered** line: half-width `(wL+wR)/2`, center shifted `(wR−wL)/2` off the chain. The cap reduces to the symmetric round/butt cap already in hand, centered on the shifted endpoint — it passes through both edge-ends by construction. The shift scaffolding likely already exists (`anchor:'inner-edge'` / `innerSign` for divided roads). **Re-center, reuse the cap.**

2. **Retrofit, not whole cloth (Jacob's explicit constraint).** What is REUSED: the Clipper offset machinery; the corner-**R** kit (becomes the stroke's join control); the **Measure handles + per-fe authoring UI** (the drag UX barely moves — the construction under it changes to "inside-stroke from a frozen edge"); **W1's chain-anchored fe identity** (the per-fe association the inward strokes hang on). What is genuinely NEW and small: the asymmetric re-center, and the live spline smoothing below. **The interface sharpens; it is not reinvented.**

3. **Live smoothing of segmented / loop streets — WYSIWYG, on screen.** Curved/loop streets are faceted polylines; smoothing was render/bake-only. Now the operator must *see* the smoothed curve while authoring. Resolution: fit an **interpolating spline (Catmull-Rom) through the chain's mid-vertices** — *interpolating* so the curve passes through the authored points and only rounds the facets between them — render it live in Survey, and **stroke the smooth curve** (so it bakes smooth and Measure strokes smooth blocks; smooth shows everywhere). **Layered control:** mid-chain vertices smooth **automatically** by default; real corners at **nodes/intersections** keep their authored **R** (existing kit is the override); expose one global **smoothing-tension** dial for streets that should stay angular. Default is WYSIWYG-smooth with zero operator work; the control is there when wanted.

4. **Edge-of-map / "weird space."** Handled by #4–#6 of the model: the complement is one shape, you inside-stroke only the asphalt-facing edges, so the boundary stays raw and the weird space "just fills." No special-casing.

5. **Dead-ends are two distinct cases** (Jacob's correction — this is bigger than the typology brief framed): (a) the **"Dead End" typology** — real rounded mid-model caps, represented several times in LS; (b) **edge-of-map cutoffs** — streets that terminate artificially at the stencil boundary. Both are absorbed by the stroke/complement (the inward stroke follows whatever boundary it's given, including a cap arc). The only thing that stays an **explicit authoring choice** is "two blocks around a dead-end should *read* as separated" — never auto-detected.

## Open decisions for Jacob/Boz (gate the first sub-brief)

1. **The Survey/Measure authoring split — does `pavementHW` move to Survey?** This is the hinge for the F1 responsiveness win. (Lean: yes — footprint/Survey, profile/Measure.)
2. **What does LU *mean* afterward?** Three live options: (a) LU is just the innermost remainder of the inward stroke (generic block interior); (b) `ribbons.faces[]` parcels stay as a base fill *under* the ribbon (real land-use survives); (c) hybrid. This changes whether LU is a stroke band or a separate dataset — decide before W-work.
3. **Narrow-block rule.** Does the innermost strip (sidewalk) flood all the way to center so LU vanishes, or does a minimum-LU sliver always survive? One rule defines the entire narrow-block look.
4. **Smoothing-tension default** (worry 3) — the one genuinely new dial; pick a default + whether per-chain override is needed at v1.
5. **Dead-end "reads as two" affordance** — what the authoring mark is, and whether it ships in v1 or stubs (couples to `HANDOFF-dead-end-typology`).

## How this re-maps the wall-move decomposition

The stroke model **is** the wall-move ([[project_two_bakes_two_walls]]) with a single generative spine. Re-mapping the existing phases:

- **W1 (identity keystone)** — ✅ shipped (`b0cc021`), still load-bearing: the chain-anchored fe identity is exactly the per-fe association the inward strokes need. **Keep.**
- **W1b (F1/F3)** — **parked under this brief.** Do not fix in isolation; they dissolve in the new construction. (The seed fix + the `measureDragging` plumbing landed this session are independent and can stand or be reverted at Boz's call — see State.)
- **W2 (metadata freeze)** — folds into the **Survey bake**: per-fe measure freezes alongside the frozen hardscape shapes.
- **W3 (geometry freeze)** — becomes **"freeze the stroked hardscape compound shape + fe associations."** The corner records become stroke-join data; the fillet residual (H1) likely evaporates (the stroke union *is* the fillet).
- **W4 (eliminate)** — larger and cleaner: the two-pass machine, `probeFeForRun`, ring-index parity, *and* the figure-ground/blockKey join all retire when the construction is "stroke out, stroke in."
- **W5 (LS bring-across)** — unchanged in spirit: re-bake LS on the stroke model, evaluate through the production path, Jacob's eye.

## Validation surface

**Toy-first, always** ([[feedback_toy_is_the_construction_spike_surface]]); operator-eye is the authority, no proxy renders ([[feedback_proxy_render_is_not_the_operator_eye]]). The cheapest decisive spike: **on toy, stroke a few chains outward → union → complement → inside-stroke per-fe → triangulate**, and look at (a) does a ribbon-width drag re-stroke instantly from a frozen edge, (b) do narrow blocks + both dead-end cases behave, (c) how an asymmetric cap reads, (d) how much real band geometry (curb lip height) is needed vs. flat. That answers "relief or trouble" on Jacob's eye, not on argument.

## Boundaries / doctrine

- **Reuse, don't reinvent** (Jacob's hard constraint) — Clipper offsets, the R kit, the Measure handles, W1 identity all carry forward.
- **Never compute the medial axis / straight skeleton** — offset+difference (or the stroke union) handles collapse.
- **3D vector surface for the slab** — no raster/SDF coloring substitute.
- No new emit clamps ([[feedback_no_corner_radius_clamps_in_emit]]); no Survey/Section/Stage rename mid-arc (stale-label rule).
- Canonical docs (the quintet, BOZ.md, the HANDOFFs, RIBBONS, the Feature Restoration Ledger) are Boz/operator-owned — this is a **draft for Boz to shape**, not a canonical edit.

## Memory cross-refs

[[project_two_bakes_two_walls]] · [[project_skeleton_is_the_first_bake]] · [[project_ribbon_three_representations]] · [[project_ribbon_corner_uniform_width]] · [[feedback_toy_is_the_construction_spike_surface]] · [[feedback_proxy_render_is_not_the_operator_eye]] · [[feedback_results_over_vocabulary]] · [[feedback_no_corner_radius_clamps_in_emit]]

---

*Provenance: this brief captures a design conversation (Jacob + Lodestar, 2026-05-31) following W1 (shipped) and W1b (F1 fixed live, then parked under this model decision). It is scoping, not yet validated in code — the spike above is the first step. Boz to rename/integrate/dispatch.*
