# HANDOFF / BRIEF — W1: The Identity Keystone (chain-anchored customs)

**Status:** dispatch-ready. **Parent arc:** `HANDOFF-wall-move.md` (read it + the §Design-decisions first). **Census:** `HANDOFF-chain-consumer-census.md` HARD §H4.
**Dispatch:** COLD (foundational; well-seeded by the census + parent brief; no live prior window needed). Name yourself, sign your commits.

---

## You are the dispatched Agent

You own the keystone of the whole wall-move arc. Name yourself in your first reply. This brief touches **load-bearing authoring code** — there's a mandatory check-in seam below; respect it.

## The one-sentence goal

Re-key ribbon customs from the **drift-prone derived block** (`blockKey`, edgeOrd) onto **chain-anchored identity** (`skelId`, `side`, `segOrd`) — the stable authored input — and unify all three representations of a ribbon onto that one key, so an operator's edit stops drifting and the render finally follows the handles (WYSIWYG).

## Why this is the keystone

A ribbon has **three representations, each its own code path** ([[project_ribbon_three_representations]]): the authoring handles, the live preview (`buildChainBandsLive`), and the committed render (`emitBlockRingBands`/bake). Today all three key customs off `blockKey` — a bbox-string of a *derived* polygon that drifts when corner-rounding nudges the bbox across a 0.5m bin (the rounded-vs-sharp + pass1-vs-pass2 drift, [[feedback_block_key_rounded_vs_sharp_diverges]]). The operator writes a custom under one block-name and the emitter reads under another → the edit evaporates. **This is the verified cause of "ribbon edits don't render on LS"** (corners already work — they're *already* chain-anchored, see below).

The fix is H4: **anchor identity to the street you author, not the block the computer derives.** A custom becomes *"street `HW3`, right side, segment 2"* — a handle that cannot drift, because `skelId`/`side`/`segOrd` don't move when geometry re-derives.

## The reference model — corners already do this

`CornerEditHandles.jsx` keys per-corner overrides by `${ixPoint} | ${sorted(legKeyA, legKeyB)}` where leg-keys are `skelId`-based. **That's chain-anchored, and it's why corners render correctly while ribbons drift.** Your job is to make ribbon-fe identity match the pattern corners already prove. **Do NOT touch the corner override maps** (`cornerRadiusOverrides`, `cornerCornerRadiusOverrides`) — they're the model, already correct. This brief is **ribbon `blockCustoms` only.**

## Scope

1. **Define the chain-anchored key.** Each `fe` already carries `chainIdx`, `side`, `segOrds[]`. Resolve `chainIdx → skelId` (the stable name; `streets[chainIdx].skelId` / `.name`). Proposed key: `(skelId, side, segOrd)`.
   - ⚠️ **Design nuance to resolve FIRST, then check in (see seam):** `fe.segOrds` is an *array* — an fe can cover more than one natural segment. Decide the canonical key shape: one custom per `(skelId, side, segOrd)` (fan an fe's customs across its segOrds), or key at fe granularity. This decision sets the storage shape — get Boz/Jacob's nod before the full refactor.
2. **Rewrite the write path** — the store's `setBlockEdgeCustom` / `setBlockEdgeCustoms` (+ batched per-fe writer) and `MeasureOverlay`/`MeasurePanel`'s `findFeForSide → blockKey` resolution → emit the chain-anchored key instead. The operator already authors in (street, side, segment) terms (`MeasurePanel` shows "segment N", `naturalSegmentOrdinal`), so this *matches their mental model.*
3. **Rewrite the read paths** to look up customs by the fe's chain-anchored key:
   - `bakeFeScalars` (the metadata resolver) in `buildBlockGeometryV2.js`
   - the `customsResolver` in the emit body — ⚠️ remember it's **wholesale-replace, not merge** ([[feedback_customs_resolver_wholesale_not_merge]]); preserve that behavior, just change the key.
   - `buildChainBandsLive`'s `customForSegSide` (the live preview — line ~3150 reads `blockCustoms[fe.blockKey][fe.edgeOrd]`). **This is the third representation — it MUST migrate in lockstep** ([[feedback_live_drag_preview_migrates_with_main_emitter]]); unifying it is half the point of this brief.
4. **Clean-slate LS** — clear `public/looks/lafayette-square/design.json` `blockCustoms` → `{}` (decided: the two legacy regimes are unmigratable/orphaned; LS falls to pipeline-derived measure = toy's V1.6 baseline). Toy is already `{}`. Coordinate any direct file edit with the running `serve.js` (stop the Designer first, or do it through the app, so autosave doesn't clobber).

## Mandatory check-in seam

After step 1 (the key-shape decision) and a written migration plan — **before** the multi-file refactor — report the proposed key structure + how you'll handle the `segOrds`-array nuance back to Boz/Jacob. These are load-bearing authoring files; we serialize at the design seam.

## Validation (operator-eye is the gate — no proxy renders)

- **Toy-first, no regression:** author a NEW toy ribbon custom (drag a sidewalk/treelawn handle) → it resolves and the **render follows the handle**, live and after bake. Toy has no legacy customs (`{}`), so this proves the new path clean.
- **LS, the win:** after clean-slate, author a test edit on an LS street → confirm it **renders** (it didn't before — that's the WYSIWYG win). Through the **production render path / your actual app**, with Jacob's eye — NOT a self-built rasterizer ([[feedback_proxy_render_is_not_the_operator_eye]]).
- **Verify edits applied before trusting output** ([[feedback_verify_edits_applied_before_trusting_output]]); render real before/after ([[feedback_render_guard_against_real_data_not_synthetic]]).
- Confirm all three representations agree during a drag (handle ↔ live preview ↔ post-release bake).

## Boundaries

- **YOURS:** the customs key in the store, `MeasureOverlay`/`MeasurePanel` write path, `bakeFeScalars` + `customsResolver` + `buildChainBandsLive` read paths, LS `design.json` blockCustoms wipe.
- **DO NOT:** touch the corner override maps (the reference model); freeze geometry (`blockRounded`/corner records — that's W3); delete the legacy emitters or dead fns (W4); rename Survey/Section/Stage (stale-label rule); add emit clamps ([[feedback_no_corner_radius_clamps_in_emit]]).
- **Canonical docs** (quintet, BOZ.md, the HANDOFFs, RIBBONS) are Boz/operator-owned — report back, don't edit.

## Memory cross-refs

[[project_ribbon_three_representations]] · [[feedback_block_key_rounded_vs_sharp_diverges]] · [[feedback_live_drag_preview_migrates_with_main_emitter]] · [[feedback_customs_resolver_wholesale_not_merge]] · [[project_two_bakes_two_walls]] · [[feedback_proxy_render_is_not_the_operator_eye]] · [[feedback_toy_is_the_construction_spike_surface]]
