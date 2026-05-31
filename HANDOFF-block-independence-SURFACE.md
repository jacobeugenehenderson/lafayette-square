# Block independence — it's monowidth-by-design (surface to Boz, no code change)

**Trammel, 2026-05-30.** Follow-up to the pass-2 customs fix. Jacob: *"ribbons are showing
again, but blocks aren't behaving independently."* Repro: `scratch/diag-block-independence.mjs`.

## Named failure mode: (a) sibling-leg monowidth propagation — doctrine-correct V1

**Not (b), not (c), not (d). This is the keystone working as designed; no code bug.**

The C4 emitter (`emitOneBlockRingBands`) builds the ribbon from three Clipper inward offsets of
`blockRounded` at `cw`, `cw+TL_block`, `cw+TL_block+SW_block`, where **`TL_block`/`SW_block` are
the per-block MAXIMA over the block's fes** (`buildBlockGeometryV2.js` lines 2082-2106). Every
span — leg *and* corner — is sliced from those block-uniform bands; per-fe `measure` controls
**only material routing** (`materials.{outer,inner}`), never depth. So authoring one leg's sidewalk
wider raises the block max → the whole block's ribbon deepens on every leg. That is precisely the
keystone's *"ribbon monowidth, strips variable"*:

> *The ribbon's outer extent W is uniform per block … W = max-per-block(cw + leg.TL + leg.SW).
> This is structurally fundamental and will never change.* — [[project_ribbon_corner_uniform_width]]

The outer extent W is block-uniform **by doctrine**, so widening any one leg widens W and the whole
block's ribbon follows. What the operator reads as "blocks/legs aren't independent" is monowidth
behaving exactly as specified.

(Nuance for accuracy: the keystone's V1-FINAL construction allows the *divider* — the TL↔SW
material boundary — to vary per leg (`leg literal-vert: cw+leg.TL`), with only W block-uniform. The
shipped C4 emitter simplified the divider to block-max too (`cw+TL_block`). That simplification
changes only *where grass meets concrete* within the uniform-W ribbon, **not** the total depth — so
it is not what Jacob is seeing, and the depth-deepening symptom is keystone-correct under either.)

## Evidence (verified)

Author one edge of one block; measure total ped-band area per block, base vs edited. Realistic
custom = full side measure with **pavementHW preserved** (asphalt unchanged → blockKey stable),
ped strips bumped (treelawn 6, sidewalk 9). Four blocks, deterministic across reruns:

| block | target Δ (one leg's sidewalk widened) | OTHER blocks changed |
|---|---|---|
| central plaza `0.0,8.5` | +7835 | **0 — independent** |
| quad `-78.5,76.5` | +2035 | **0 — independent** |
| quad `80.5,86.5` | +2446 | **0 — independent** |
| quad `6.0,10.0` | +2076 | **0 — independent** |

**Cross-block coupling (b): ruled out** — and structurally it must be: post the pass-2 ring-index
fix the emitter groups fes per block by `blockRingIdx`, and a pavementHW-preserving single-edge
edit changes no other block's inputs at all. `fe.measure` stays per-edge-accurate after the edit
(**(c) materials/measure leak: ruled out**). The within-block Δ is the monowidth deepening — mode (a).

## Why it *looks* like a bug (the real UX story)

Two by-design behaviors compound:
1. **Per-block monowidth** (above): a block's ribbon depth = max over its legs.
2. **Polygon-only authoring fan-out** (Datum, `72cd0a7`): a whole-chain measure gesture writes
   dense customs to *every* fe the chain touches — and a chain spans *several* blocks. So editing
   "a street" deepens every block along it, each independently, all at once.

Together they read as "blocks aren't independent," but each block is in fact isolated; the operator
is editing many blocks per gesture and each obeys monowidth.

## Recommendation (UX-doctrine, not code)

1. **If uniform-per-block depth is acceptable** (it was the V1 operator gate — *"still better than
   it was, move on"*): clarify to Jacob that ribbon *depth* is per-block (max of its legs) and only
   *material* is per-leg. The dial is "author the block's widest leg." **No code change.**
2. **If he wants per-leg depth varying within a block:** that is a genuine V2 extension — and it
   collides with the keystone's "W is structurally fundamental, never variable." Corners become
   ambiguous (a corner between a deep and a shallow leg has no single outer extent). Needs an
   explicit Jacob+Boz doctrine call, then touches the three Clipper offsets (V1 keystone geometry,
   off-limits to this arc). Structural, separate brief.
3. **If the surprise is the authoring fan-out** (one gesture → many blocks deepen): that's the
   polygon-only model (`measureModel.js`, Datum's territory) — the sparse "chain default" write was
   path (B) in Datum's brief. Out of scope here.

No code shipped this turn. The pass-2 ring-index fix from the prior turn stands and is unaffected.

## Latent fragility flagged (same pass-2 path, NOT in scope)

The pass-2 customs resolver **replaces** a side's measure wholesale
(`(customsResolver && customsResolver(...)) || m[sideKey]`, ~line 2587) rather than merging
field-by-field. A custom that omits any field (e.g. `pavementHW`) silently drops it → that edge's
asphalt collapses. Polygon-only authoring writes full measures today, so it doesn't bite in
production — but it's a sharp edge in the same pass-2 path the prior turn hardened. (It also cost
me a false-positive "coupling" reading mid-investigation before I caught it.)

## Ruled out
- **(b) cross-block:** single-edge author changes exactly 1 block (table above; structurally
  guaranteed by per-`blockRingIdx` grouping).
- **(c) resolver / materials leak:** `fe.measure` is per-edge-accurate post-edit.
- **Test-methodology traps banked** (so the next agent skips them): a blockKey-keyed metric
  fabricates phantom "other" blocks under pavementHW edits because blockKey drifts (d7a) — use
  point-in-ring against `v2.blocks[].ring`; and partial customs collapse asphalt via the
  wholesale-replace resolver above.
