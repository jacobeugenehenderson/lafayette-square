# Degenerate-W ribbon flood — diagnosis + fix design (SHIPPED)

> **RESOLUTION (Trammel, 2026-05-30, arc 4).** Both fixes landed:
> - **`2607763` ribbons(customs):** pass-2 ring-index parity + per-block **capacity guard**
>   (`WB = min(WB, 0.9·inscribed_capacity)` at the three Clipper offsets in
>   `emitBlockRingBands`). Visual-gated on a forced flood (block 80,-80: OFF flood-frac 1.26 →
>   ON 0.82, clean). **Verified no-op on current toy data** (byte-identical guard on/off, 179
>   bands) — it's a forward safety net, not the visible fix.
> - **`52d7f9e` toy(reset):** the *actual* visible fix. The map looked ugly because
>   accumulated large customs (sw≈9–11.5m) now render thick (the pass-2 fix made them apply
>   instead of collapsing). Cleared `design.json.blockCustoms` to `{}` and rebaked → functional
>   thin-ribbon blocks restored (operator-confirmed). `cornerRadiusOverrides` preserved.
> - **Lesson:** I initially pushed the capacity guard as *the* fix; it wasn't — on the live data
>   the degeneracy wasn't present, the problem was bad accumulated data. The guard is still
>   correct and worth keeping, but the diagnosis "degenerate-W flood" only described a *forced*
>   stress case, not what Jacob was seeing. Always render the guard against the ACTUAL current
>   data, not a synthetic worst case, before claiming it fixes the reported symptom.

**Trammel, 2026-05-30.** Third arc on the customs/ribbon thread. Jacob screenshot: top block's
sidewalk material floods the block interior in an irregular shape with an asphalt-colored hole
inside; the adjacent bottom block renders clean. Diagnostics ran via a frozen-snapshot harness
(deleted as throwaways this turn — see cleanup note); the durable repro
`scratch/diag-measure-customs-bandcollapse.mjs` remains and extends to this case by swapping in the
live `public/looks/toy/design.json` customs.

**Status: SURFACE. Two distinct problems found — one data, one geometry. The data prune is small
and safe; the geometry guard is small in LOC but lands inside the V1 keystone Clipper-offset
construction, changes visible output, and needs an operator visual gate. Neither shipped this turn
(I do not ship unverified geometry — [[feedback_verify_edits_applied_before_trusting_output]]).**

> Process note: this turn's investigation suffered a flaky harness (cancelled tool batches,
> raced Edit/Read) and one earlier draft of the data section below stated wrong HEAD counts. The
> numbers here are from re-verified single reads. The `_emitdiag.mjs`-era "harness degraded" note
> elsewhere was real but is resolved; final source state verified clean.

## Root cause: W exceeds the block's inscribed capacity → ringWedge inward-offset collapses

`emitOneBlockRingBands` builds the ribbon from three inward Clipper offsets of `blockRounded` at
`cw`, `cw+TL_block`, `WB = cw+TL_block+SW_block`, where TL_block/SW_block are the **per-block
maxima** over the block's fes (`buildBlockGeometryV2.js` ~2082-2106). When `WB` approaches the
block's inscribed radius, `dilateRings([ring], -WB)` collapses (inward offset past the medial
axis → empty/self-intersecting). Then `differenceRings(ringDivider, ringWedge)` ≈ the **entire
interior**, the sector slice tags it **SW** → cream floods the block; the collapsed wedge remnant
is the **asphalt-colored hole**. Matches the screenshot exactly.

## Decisive evidence (frozen snapshot, drift-proof PIP sidewalk-area/block-area)

`scratch/_floodtest.mjs`, worst-block flood fraction (clean block ≈ 0.11):

| scenario | worst frac | blocks >100% |
|---|---|---|
| 1. AS-IS (live customs) | **5.91** @(22,120) | 2 |
| 2. stale `{left,right}` stripped | **5.91** (identical) | 2 |
| 3. NO customs at all | **0.94** @(80,-80) | 0 |

Two conclusions:
- **Stale entries are NOT the flood cause** (1→2 unchanged). Boz candidate (1) ruled out *for the
  flood*.
- **The flat (current) customs drive it** (3 drops to 0.94, zero over-100%). In-spec per-fe values
  + fan-out + small toy blocks → degenerate W. Candidates (2)+(3) confirmed.
- **Even no-customs hits 0.94** on block (80,-80) — it sits right at the cliff on baseline data
  alone. So the capacity guard is warranted *independent of customs*.

The flat customs carry large sidewalks: **sw=11.5** on three blocks, **10.9** on four,
and **`[-78.5,80.0]/e3 sw=9.3 tl=11.3` → WB ≈ 20.9m** on a ~65m block. These are the per-fe values
the polygon-only fan-out wrote; the per-block MAX promotes the deepest one to the whole block.

## Answer to Boz's data-side question: design.json IS dirty, and HEAD does NOT give a clean slate

Checked `git show HEAD:public/looks/toy/design.json` vs working tree (design.json **is** modified
vs HEAD — 186/180-line diff):

- **HEAD design.json.blockCustoms = 17 entries (11 flat per-fe + 6 stale `{left,right}`), incl. 2
  LARGE flat ones:** `5.0,79.0/e4 sw=8.4` and `-78.5,80.0/e3 sw=9.3 tl=11.3` (WB≈20.9m).
- **LIVE working tree = 36 entries (30 flat + the same 6 stale).**

So the live file accreted ~19 flat entries on top of HEAD this session — but **HEAD is not clean
either**: it already carries 6 stale entries AND the two largest flood-driving customs. Therefore
`git checkout HEAD -- design.json` (the current reset workaround) does **not** produce a clean
slate — it reverts to a still-dirty 17-entry state that includes the worst large-value customs and
all 6 stale ones. The live file's 6 surviving stale entries are `0/e5, 5/e0..e4`.

This confirms Boz's suspicion: **the reset is incomplete, and HEAD itself is not a safe baseline.**
`design.json.blockCustoms` is a Look-level authoring file the overlay-only reset never cleans, and
even checking out HEAD leaves large + stale customs behind.

**Actionable regardless of the flood:** the queued **Reset toy button**
([[project_reset_toy_button_queued]]) MUST clear `design.json.blockCustoms` to `{}` directly — NOT
rely on `git checkout HEAD`, because HEAD's design.json carries both stale entries and large
customs. Recommend amending that memory's sweep target now. (The 6 stale entries are also latent
landmines for the wholesale-replace resolver, [[feedback_customs_resolver_wholesale_not_merge]].)

**Caveat on causation:** because HEAD already contains the two largest customs, the flood is NOT
purely a live-session accretion artifact — it is reproduced by in-spec authored values that live in
the committed Look. A clean `blockCustoms: {}` reset drops the worst flood fraction from 5.91 to
0.94 (the no-customs row above), but 0.94 on block (80,-80) shows the geometry guard (B) is still
needed for the baseline cliff case.

## Two recommended fixes (both small; geometry one needs the gate)

**(A) Data: purge stale + define a real reset.** Clear the 6 `{left,right}` entries from the live
design.json (and make the Reset toy button write `blockCustoms: {}` rather than git-checkout). Pure
data, no geometry risk. Does NOT fix the flood, but removes the landmine and makes the reset honest.

**(B) Geometry: capacity guard on WB (Boz candidate 1).** This is the actual flood fix. **Not the
forbidden corner-radius clamp** — [[feedback_no_corner_radius_clamps_in_emit]] is about *tight-R
corner* degeneracy (Clipper handles it natively); *W-past-medial-axis* is a different degeneracy
Clipper does NOT handle (it produces the flood). State this explicitly at dispatch so the next
agent doesn't reflexively delete the guard. Preferred shape:

- Compute the block's inscribed-offset capacity once (binary-search the largest `d` with non-empty
  `dilateRings([ring], -d)` — ~8 LOC helper) and clamp `WB = min(WB, k·capacity)` with a safety
  factor `k` (~0.9) before the three offsets. Also clamp `cw+TL_block` to stay below WB. ~25-35 LOC.
- Visible result: small over-capacity blocks get a *truncated but clean* ribbon instead of a flood.
  **Needs Jacob's eye on the truncation** before it's right.
- Boz candidate 2 (Clipper-fail → full symmetric-residential fallback) is heavier and discards the
  operator's per-fe material intent block-wide; prefer the clamp, which preserves everything except
  the over-spec depth.

## Scope decision
Per brief (≤50 LOC small fix OR surface). (A) is shippable but is a data/UX change tied to the
Reset-toy-button feature, not an emit fix — belongs with that feature. (B) is ≤50 LOC but inside
keystone geometry with visible output change + needs a visual gate + I can't verify it this turn.
**Surfaced both.**

## Cleanup — done this turn
All `scratch/_*` throwaways from this turn were deleted by exact name (NOT `rm -rf scratch/`, per
[[feedback_scratch_dir_is_tracked]]). The durable repro `scratch/diag-measure-customs-bandcollapse.mjs`
and `scratch/diag-block-independence.mjs` remain. `src/lib/buildBlockGeometryV2.js` is **clean** —
verified 0 DIAG residue; diff is exactly the prior pass-2 ring-index fix (22+/15−), no degenerate-W
code added.
