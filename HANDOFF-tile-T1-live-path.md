# HANDOFF — Tile re-pour · T1: the tile construction in the LIVE path (WYSIWYG, toy)

**Agent: WARM → Tessera.** You built the tile construction in the spike; T1 promotes it from throwaway to the live Designer path + bake. Your spike context *is* the work — no reason to start cold. (Keep your name.)

This is **step 1 of the re-poured program** (`HANDOFF-pipeline-reconception.md`, now built around the tile model your spike validated). **Reads first:** your own `cartograph/spike-pure-ribbon.js` + report; the re-poured program brief.

## Why this step exists

The spike proved the tile model on the **bake** — but the bake doesn't surface in Design mode (Design renders **live** via `BlockGeometryV2Debug`; only Stage reads the bake, and the Stage transition auto-rebakes and clobbers the spike). So Jacob literally can't see it. **T1 puts the tile construction in the LIVE path** so Design mode shows it directly — which is also the permanent WYSIWYG fix (live = bake by construction). This is the step that lets Jacob gate the whole re-pour on his actual 3-D screen.

## Goal

The tile construction renders in **both** the live Designer (`BlockGeometryV2Debug`) **and** the bake (`bake-ground`), **identically**, on toy. Open toy in Design → see the tile model live, matching the bake. The **minimal / uniform-inset version your spike proved** is the target here — per-edge widths and the other refinements are T2.

## Build

1. **Promote** `cartograph/spike-pure-ribbon.js` from throwaway env-gated module to a real construction module (name it — e.g. `tileGround.js`). Keep the proven DCEL face-walk + per-tile inward inset + strip-rounding verbatim.
2. **Wire into the LIVE path:** `BlockGeometryV2Debug.jsx` renders toy from the tile construction, not the figure-ground `buildBlockGeometryV2`.
3. **Wire into the bake:** `bake-ground` uses it for toy (un-throwaway the adapter; drop the `PURE_RIBBON` env gate).
4. **WYSIWYG:** both call the same module, so live = bake. Confirm by eye that Design and a baked view agree.
5. **Reuse, don't rebuild:** Clipper (`dilateRings`/`differenceRings`), the R-kit for strip-rounding, `triangulateAndRefine`. 

## Staging / boundaries

- **TOY only this step.** LS stays on figure-ground for now — it needs the real-work pieces (per-edge widths, median, boundary tagging) which are T2+. **The toy=tiles / LS=figure-ground split here is EXPLICITLY TEMPORARY transition scaffolding**, retired in the cleanup phase when LS adopts tiles and figure-ground is deleted. It is **not** a permanent scene-flag — flag it clearly as transitional in the code.
- **Do NOT delete figure-ground yet** (Jacob's "not preserving prior work" license applies at *cleanup*, once LS is on tiles — replace then delete, ARCHITECTURE §7). For now: toy routes to tiles, LS routes to figure-ground.
- Reuse the primitives; discard nothing yet.
- Don't touch `design.json` customs; don't edit canonical docs.

## Gate (definition of done)

Jacob opens **toy in Design mode** and sees the tile model rendering **live** — corners round, intersections fill, tiles flood to LU — and it matches the bake. **WYSIWYG confirmed on his screen.** That greenlights the rest of the re-pour.

## Commit / report

- Commit on `cartograph-looks-pass-ab`, signed, Co-Authored-By line.
- Report: what moved from throwaway → real; how live + bake share the one module; the WYSIWYG confirmation (Design vs bake); anything that fought the promotion (esp. if the live path `BlockGeometryV2Debug` resisted swapping construction).

*Provenance: Boz, 2026-06-01. T1 of the re-poured `HANDOFF-pipeline-reconception.md`. Construction validated by the pure-ribbon spike (`HANDOFF-spike-pure-ribbon.md`).*
