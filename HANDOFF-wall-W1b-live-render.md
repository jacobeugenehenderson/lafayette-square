# HANDOFF / BRIEF — W1b: live-render application (bands don't follow) + W1 corner regression

**Status:** dispatch-ready. **Dispatch:** WARM — you are **Lodestar**, continuing from W1 (`HANDOFF-wall-W1-identity.md`). You have the full change context; keep your name, sign your commits.
**Parent:** `HANDOFF-wall-move.md` — this brief restores ledger rows **F1** (ribbon bands) and **F3** (corner rounding). Don't regress **F2** (polygon shape) or **F5** (per-block LU), which are 🟢.

---

## What W1 actually did vs. what's still broken

W1 re-keyed customs onto chain-anchored identity and you **proved it through the bake** (inject-a-custom vert-shift). That was real and correct — keep it. **But the operator-eye gate failed in the live Designer**, and Jacob's decomposition pinned why:

- 🟢 **The block silhouette / polygon ALWAYS moves correctly** — drag the curb (`pavementHW`), the figure-ground reshapes, the render follows.
- 🔴 **The ribbon bands INSIDE don't follow** — same edit, the treelawn/sidewalk bands don't update. (Same on **clean toy** as on LS → *not* drift, *not* LS-specific, *not* what W1 fixed. This is a live-render *application* problem, a layer below the storage key.)
- 🟠 **Corners regressed** — they "no longer work the way they did" post-W1.

## The grounded lead (Jacob's observation — this is the spine, not a guess)

**The polygon and the bands consume the SAME authored measure. The polygon tracks the edit; the bands don't.** That divergence is the bug and it's exactly localizable: one consumer of the edited `pavementHW`/measure keeps it (figure-ground → silhouette), the other drops it (`emitBlockRingBands` → bands). Find where the bands' read loses what the asphalt's read keeps.

## Process discipline (we've earned this the hard way)

Boz burned **two** static hypotheses on this (the bake call-order; a `cornersAtIx` ordering theory) — both wrong. **Do not theorize the fix. Instrument the live path and get runtime truth first.** Then **report the confirmed root cause (with evidence) and check in BEFORE writing the fix.** Diagnose → confirm → fix, not fix-and-hope. And the gate is **Jacob's eye in the real app** — never a proxy render, never your own rasterizer ([[feedback_proxy_render_is_not_the_operator_eye]]).

## Task A — F1: why do bands not follow while the polygon does?

Instrument `BlockGeometryV2Debug` + `buildBlockGeometryV2` for **one curb/`pavementHW` edit** on a toy street and capture runtime values:

1. Does the 250ms debounced full rebuild actually fire, and with the edited measure in `debouncedInputs`? (`BlockGeometryV2Debug.jsx:303–340`.)
2. **The split:** log what the **figure-ground/asphalt** path resolves for the edited measure (the value that correctly moves the silhouette) vs what **`bakeFeScalars`/`emitBlockRingBands`** resolves for the *same fe's* `fe.measure` (the bands). They should be equal; find where they diverge.
   - Candidates to check with evidence, not assumption: does `readFeCustom` resolve the same custom for the band fe that the asphalt path uses? Do the band-path fes carry `chainSkelId` + `segOrds` at `bakeFeScalars` time? Is the band update masked by the live overlay (`buildChainBandsLive`) that covers the selected chain — i.e. is the *full rebuild* correct but hidden, or is the full rebuild itself wrong? Is `debouncedInputs` a stale snapshot vs the store?
3. Once you can point to the exact line where the bands' measure read drops the edit the asphalt keeps — **stop and report it** with the runtime evidence. Then fix.

## Task B — F3: attribute + fix the corner regression

1. **Attribute cleanly:** `git stash` your W1 change set and re-test corners in the app (Jacob, or a reproducible bake comparison). Corners work again → W1 caused it. Bands still broken → confirms F1 is the separate, older problem. Restore the stash.
2. **Find the specific cause** with evidence (likely in the `cornersAtIx` re-key — e.g. a flanking fe lacking `segOrds` so `readFeCustom` returns null where `blockKey`/`edgeOrd` used to resolve → corner depth shifts). Confirm, then fix.
3. Note: you are touching the `cornersAtIx` *ribbon-customs* read (in scope) — **never** the corner-override maps (`cornerRadiusOverrides`/`cornerCornerRadiusOverrides`, the reference model, out of scope).

## Boundaries

- **KEEP W1** — its bake-side chain-anchored key is correct and the wall-move needs it. **Do NOT revert it.** Fix forward.
- Don't touch the corner-override maps; don't add emit clamps ([[feedback_no_corner_radius_clamps_in_emit]]); don't rename Survey/Section/Stage (stale-label rule); don't delete the legacy emitters (W4).
- Canonical docs (quintet, BOZ.md, the HANDOFFs, RIBBONS, the **Feature Restoration Ledger**) are Boz/operator-owned — report findings back; Boz updates the ledger when Jacob's eye confirms a row.
- Nothing commits until Jacob's eye confirms F1 + F3 render in the app.

## Validation (ledger gate)

- F1 RESTORED ⇔ a fresh ribbon-band edit (toy first, then LS) **renders to match the handle**, live + post-bake, all surfaces agreeing — confirmed by Jacob's eye.
- F3 RESTORED ⇔ corner rounding behaves as it did pre-W1 — confirmed by Jacob's eye.
- Verify edits applied before trusting output ([[feedback_verify_edits_applied_before_trusting_output]]); render real before/after ([[feedback_render_guard_against_real_data_not_synthetic]]).

## Memory cross-refs

[[project_ribbon_three_representations]] · [[project_wall_move_eventual_picture]] · [[feedback_proxy_render_is_not_the_operator_eye]] · [[feedback_live_drag_preview_migrates_with_main_emitter]] · [[feedback_block_key_rounded_vs_sharp_diverges]] · [[feedback_toy_is_the_construction_spike_surface]]
