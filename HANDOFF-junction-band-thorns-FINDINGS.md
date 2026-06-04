# Junction Band-Thorns — Forensic Findings (Bollard, 2026-06-04)

**Companion to:** `HANDOFF-junction-band-thorns.md` (the dispatch brief). **Forensic only — no construction edits.** Produced on the production `buildTileGround` path (trunk RDP frame, `smooth:0`, `curbWidth:0.381`, `cornerRadiusScale:1`), inspecting `_shapeArtifact` (per-tile `iA`/`runs`/`bandJoin`/`cap`) + `_tiles`. Harnesses: `scratch/bollard-*.mjs`.

---

## TL;DR

The brief unified the 4 marked junctions as "one mechanism." They are **not** one mechanism. The junction band-thorns have **two roots**, and the investigation surfaced a **third, separate** problem class (not actually a junction thorn) worth its own dispatch.

- **The centerlines are clean at every marked junction** — through-streets turn **0.0–0.1°** with **~0 m jog**. The "middle point" the operator sees is **not** a skeleton vertex. (Verified at all 3 newly-circled spots + the original 4.)
- **Root A — T-mouth band-fold (dominant, ~69/115 junctions).** The construction rounds a corner at the T-mouth and wraps the deep ped band around a land wedge in a gap too tight to hold it; the deepest offset folds. *It is, literally, trying to make a corner where there's no room for one.* = the documented **G12 capacity-guard partial-degeneracy**, with the T-mouth as the specific trigger.
- **Root B — thin-tile / real-stagger (~46/115, exemplar: Waverly).** A legitimately thin tile from real tight geometry. Same G12 fold, but the pinch is the geometry, not the corner — and it is **corner-independent**.
- **Separate root — name-logic skeleton dog-legs (5 + 35, NOT junction thorns).** A single named street kinking at its own seams / fragmented into pieces. A skeleton-maker intelligence gap. Surfaced here, deserves its own pass.

Roots A and B share **one** fix (local band-fit). The name-logic root is independent.

---

## The marked instances

| Mark | Stem → Avenue | Junction (deg) | Centerline at node | Root |
|---|---|---|---|---|
| #1 / orig | Vail → Park Ave | [340.0,−120.6] (3) | Park 0.0° straight | **A** |
| #2 / orig | Kennett → Mississippi | [179.9,115.9] (3) | Miss 0.0° | **A** |
| #3 / orig + circle **B** | Mackay → Park Ave | [−48.0,−203.9] (3) | Park 0.0° | **A** |
| #4 / orig + circle **A** | Waverly → Lafayette | [−25.3,191.6] (3) | Laf 0.0°, **17.4 m short edge + 2nd deg-3 node** | **B** |
| circle **C** | Albion → Missouri | [−177.5,−78.7] (3) | Missouri 0.0° | **A** |

(The operator's 3 newest marker circles are at `[-40.7,175.6]` (Waverly), `[-49.8,-188.7]` (Mackay), `[-168.3,-78.0]` (Albion).)

---

## Root A — T-mouth band-fold *(the dominant root; the T-mouth framing)*

**One-line:** at a tight T the construction rounds the mouth corner and wraps the deep ped band around the land wedge between stem and avenue; the gap is narrower than the band is deep, so the deepest offset folds back on itself → the thorn.

**The chain, pinned op by op:**

1. **`iA` (the curb line) is clean.** At the T-mouth the per-vertex fillet rounds the two convex "jaw" corners (where the avenue-edge turns onto the stem-edge) at radius R. Verified on Vail: `iA` near the mouth is two clean rounded convex arcs, **no thorn**. So the thorn is **not** in the shape pass.
2. **The wide avenue pinches `iA` into a local neck.** The avenue's asphalt subtraction erodes the flanking tile's `iA` to a narrow corridor ~one-avenue-band-width out. **The thorn distance tracks avenue width:** Park Ave ≈ 18.7–19.1 m, Mississippi/Lafayette ≈ 14.5–15.3 m.
3. **The thorn is born in `sectionPass`'s deepest offset.** Walking the offset depths on the real tile: `iC` (curb, +0.38 m) clean → `iT` (treelawn, +1.72 m) clean → **`iW = offsetRings(iA, −(cw+tl+sw)≈3.95 m, join)` folds: a 76–180° reversal in the SIDEWALK ring.** The fold appears only as depth crosses into `iW`. **Join (miter vs round) is irrelevant** — both fold; it is *depth past local reach*, so RIBBONS invariant #2 (jtMiter) is not in play.
4. **The per-tile capacity guard never fires.** `tileGround.js:936-938` clamps only on **full** collapse (`!offsetRings(iA,−(WBnom/0.9)).length`). These tiles are **globally in-spec** (`cap == WB`, not clamped), so the guard sleeps while the **local** neck folds. This is exactly the **G12** ledger entry: *"a tile that collapses to a thin non-empty sliver keeps `cap=WBnom` → offsets run past the medial axis → thorn."*

**The corner connection (the operator's insight, confirmed).** The corner-fillet at the mouth is part of the trigger. Sweeping `cornerRadiusScale` at the clean-T thorns: **square corners remove them.**

| `cornerRadiusScale` | Albion (circle C) |
|---|---|
| 0 (square) | **0°** |
| 1 (default) | 2° |
| 2 (bubbly) | 4° |

The construction is rounding a corner + wrapping the band into a gap too tight to hold it — *making a corner where there's no room for one.*

**Caveat — the corner radius is a mechanism clue, not the fix.** Zeroing it globally is a wash: the **map-wide reversal count stays flat (~395 → 432 → 429 → 414 across scale 0→0.5→1→2)**, the per-junction response is non-monotonic (Mackay actually *improves* at larger R), and it would square every real intersection. So the lever is *local*, not the global radius.

**Scale:** of 115 deg≥3 junctions carrying a >120° sidewalk reversal, **69 are clean single-node Ts** (this root).

**Fix direction (written, not applied):** detect the tight T-mouth (local inscribed reach < band depth) and **let the band meet the avenue flat / truncate locally** instead of bending a rounded corner around the wedge — i.e., *don't build the corner where there's no room for it.* Mechanically this is a **local** capacity clamp (the deep offset degrades to a clean truncated edge — G12's "degrade to a clean truncated ribbon"), **not** a per-corner constructed primitive (RIBBONS invariant #1), **not** a join change (#2), **not** a corner-R clamp (`feedback_no_corner_radius_clamps_in_emit`). ⚠️ **The hard part:** the clamp must be **local** — these tiles are globally fine, so a per-tile `cap` (the G12 row's stated fix) would *over-clamp* the rest of the block. That gap is the real construction question to take to Boz before any edit.

---

## Root B — thin-tile / real-stagger *(Waverly; corner-independent)*

**One-line:** a legitimately thin tile from real tight geometry — same G12 fold, but the pinch is the geometry, so the corner radius can't touch it.

- **Waverly Place is a real U/crescent:** 219 m path, endpoints 17.4 m apart, **12.6× ratio** — both legs land on Lafayette 17 m apart, creating a real 17 m block edge (the `cap=0.00 clamped=true` sliver tile #28).
- **Corner-independent:** the thorn holds **99–124° at every `cornerRadiusScale` including 0** (contrast Root A).
- **Not a skeleton artifact, and not cleaned by the existing frame work.** A/B of the staged P1-enriched frame (`scratch/vesalius-ribbons-{BEFORE,AFTER}.json`): staggered-pairs **100→103**, band reversals **484→485**, and the Waverly stagger **persists in BEFORE, AFTER, and the trunk RDP frame**. The enrichment is junction-aware *simplify* (restores deleted Ts → *adds* nodes), **not** intersection *consolidation* (merging staggers) — and consolidation wouldn't merge two *real* intersections anyway.
- **Fix:** the **same** local band-fit as Root A — on a genuinely thin tile the deep band truncates instead of folding. One fix, two triggers.

---

## Separate root — name-logic skeleton dog-legs *(NOT a junction thorn)*

The operator's deeper point — *"the skeleton maker should use the names; there shouldn't be dog-legs within a named street"* — is correct and the data backs it:

- **35 of 113 named streets are fragmented** into >1 segment (weldable into continuous chains by name).
- **5 within-name dog-legs** — a single named street kinking at its own seam:

  | where | street | kink off-straight |
  |---|---|---|
  | [−416.4,−164.2] | Saint Vincent Ave | 88° |
  | [58.7,−234.0] | Benton Place | 37° |
  | [521.7,−560.1] | Papin Street | 25° |
  | [509.7,−570.1] | Papin Street | 146° |
  | [780.1,99.7] | Park Place | 17° |

- **This is a different population from the junction thorns** (these are deg-2 within-name seams, not the deg≥3 T-junctions) — *none coincide with the marked circles.*
- **Bonus payoff:** Saint Vincent and Benton are the exact two "butt-tip" chains that cascaded and broke the parked dead-end prune (`bollard-dead-end-prune`) — because they were never dead-ends, they're **mid-street fragmentation seams**. Name-logic would have flagged them up front.

**Fix direction:** a **name-aware skeleton pass** — weld same-name fragments; straighten same-name kinks — slotting into the documented "better bones" / intersection-consolidation arc (BACKLOG line 38) with a new **semantic name prior**. Separate dispatch from the band fix; upstream, and it also de-risks the dead-end work.

---

## What it is NOT (no-regress / don't-chase)

- **NOT a centerline dog-leg at the thorns** — through-turns 0.0–0.1°, ~0 jog at every marked junction.
- **NOT the cul-de-sac wrap path** — `deadEndTips` gates on `nodeDeg===1`; T-mouths are deg-3. `roundTips`/`wrapDisks` uninvolved; Mackay's *actual* cul-de-sac keeps its wrap.
- **NOT a join artifact** — `iW` folds under both miter and round.
- **NOT fixable by band-ring cleanup** — Clipper `CleanPolygon` at 0.3–1.2 m barely moves it (111° → 95–108°). It is a *real fold*, not redundant vertices.
- **NOT double-smoothing** (separate root, handled) and **NOT** the divided-carriageway median (`TRUMAN-FORENSICS.md`).

---

## Fix sequencing (recommendation)

1. **Band fix (Roots A + B) — one change, two triggers.** A **local** band-fit / capacity treatment in `sectionPass`: where the local inscribed reach < band depth, truncate the deep offset to a clean edge instead of folding. This is the G12 partial-degeneracy fix made **local** (the open construction question: local vs per-tile clamp). Honors RIBBONS invariants; flag Boz for green-light before editing.
2. **Name-logic skeleton pass (separate root) — parallel/upstream.** Weld-by-name + straighten same-name kinks. Folds into "better bones"; also de-risks the dead-end prune.

## Validation surface (reuse, don't rebuild)

`scratch/bollard-*.mjs`: `jx` (junction band scan) · `tile`/`ia`/`ia2`/`sw` (per-tile `iA`/band dumps) · `offset` (the `iC/iT/iW` depth walk + fix candidates) · `scan`/`split` (115-junction census + 60/40 classification) · `frames` (3-frame stagger A/B) · `bandcount` (end-to-end reversal counts) · `dogleg`/`dl2`/`circles`/`needle` (centerline + band-ring inspection of the 3 circles) · `snip` (CleanPolygon test) · `corner`/`corner2` (cornerRadiusScale sweep) · `namelogic` (fragmentation + within-name dog-legs).
