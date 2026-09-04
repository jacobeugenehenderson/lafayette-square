# Archived from `RIBBONS.md §1` — 2026-09-04

Retired by **the grout ruling of 2026-09-04** (Jacob). Live home: `RIBBONS.md §1`.

---

## 1. "Verify the stroke handles zero separation" — ANSWERED, then made moot

Stood as the one open engineering objection to primitive lanes.

> ⚠️ **Open engineering question, not an objection:** an undivided street's two chains are *coincident*,
> and coincident input is exactly where geometry libraries return degenerate results. **Verify the stroke
> handles zero separation before building on it.**
>

**Answered 2026-09-04** — coincident side-chains stroke and union to the single-chain road with delta
exactly 0, both integer scales. ▶ `node scratch/claims-zero-separation-offset.mjs`

**Then made moot by the ruling:** under the grout model the chains are never coincident, because the grout
is stroked at ε. ⭐ And the question it was really guarding was never numerical robustness but **NODE
COUNT** — at zero width a spur's mouth has one vertex where it needs two.

---

## 2. "§2.1's second mouth corner test IS NOT A DEFECT" (Tessel, 2026-08-12)

⛔ **Superseded 2026-09-04.** It contradicted `POLYGON-FIRST §2.1` Check 5 on the same node, and it
contradicted the substrate ruling printed two paragraphs above it in the same section (*"with width the two
mouth vertices are different points — two real street-meets-street corners, every leg bounded"*).

**Jacob's ruling settles which side was wrong:** at zero width the two mouth vertices ARE one point, so this
note measured the degenerate configuration and ruled the degeneracy correct. **A zero gap at a tip is the
COLLAPSED-node signature, not a clean through-node.**
▶ `node scratch/coupler-slit-universal.mjs` — every LS tip prints `FACE=SLIT  gap=0.000m`.

⭐ **Its measured residue SURVIVES and is cited live in `RIBBONS §1`:** the cap-leg standoff harness
`scratch/claims-deadend-notch-standoff.mjs` is a LEG measurement (distance from the chain to `iA` against
the authored half-width) and therefore still legitimate under the 2026-09-04 rule that an offset is
measured from a leg and never from a cap.

> ### ⛔ §2.1's "second mouth corner" test IS NOT A DEFECT — measured 2026-08-12 (Tessel)
> The test read: *both mouth passes are the same coordinate, so the second reads `south-18th →
> south-18th` and `cornerAt` declines; give the spur width and they become two real corners.*
> **The premise is a misreading of the node.** At `south-18th-street-3`'s mouth (386.30, 149.10)
> `kennett-place` **ENDS** and `south-18th` **RUNS THROUGH**: pass 1 is `kennett → south-18th`
> (a real corner, filleted) and pass 2 is `south-18th → south-18th` — **a genuine through node**,
> the two directions collinear to ~1°. ⭐ **`cornerAt` declining is CORRECT, and a second corner
> there would be a defect.** At a T only one side corners; that is what a T looks like.
> ⭐⭐ **And the slit never reached the block.** The retrace lives in `tile.ring` alone — `iA` at that
> tip already carries a real notch: sides standing off **5.50 / 6.94 m** against an authored
> **5.49 / 6.9269** (`clean/overlay.json`, asymmetric BY AUTHORING), a round cap at r=6.93, and a
> continuous leg→cap slope. ⇒ **Do not cite this tip as the thing the substrate fixes.**
> ▶ `node scratch/claims-deadend-notch-standoff.mjs` — the general form: at every frozen cap, march
> out from the spur centerline to `iA` and compare against the half-width **the producer itself was
> handed** (`shape.json runs[].measure`), station by station on the cap leg. Asymmetric authoring
> PASSES by construction. **31 of 49 caps clean at every station; 18 carry ≥1 station off by >0.1 m
> — cause not established.**
