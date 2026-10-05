<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: every piece of a tile's inner area takes its own land use (the split-tile census reports zero pieces painted by another piece's point, in every town); an operator can set a piece's land-use TYPE in Survey and it reaches the bake; an override whose piece is gone after a re-pour is reported loudly, never dropped; the hash fallback is deleted; checks green and mutation-tested; Jacob has set a type on Huron's motorway median and seen it in Preview.
-->

# BRIEF — Land use per piece, and the control to set it

**Boz the Younger drafted this 2026-10-04; Jacob dispatches.**

## Who you are, and the bounds

**Agent: WARM → Sward.** Sward measured the split-tile class (`acff8071`) and landed the union fix (`1f5317c6`); the code
and the Huron tiles are loaded.
- `src/lib/tileGround.js` (land-use painting), the land-use store and its Survey control, the bake's read of it. ⛔ No pours or
  bakes without Jacob's go. `tileGround.js` is shared by the live Survey render and the bake: run the existing checks on every
  town before and after. Commit only your paths.
- **Three-part fix** (`CLAUDE.md`). Registers: `cartograph/OPERATIONS.md` (the control) · `cartograph/FEATURES.md` (the
  capability) · `cartograph/SURVEY.md` if the control lives there.

## The ask (Jacob, 2026-10-04)

*"Perhaps the user needs a LU controller in the designer after all? It's not about color it's about type."*

## What exists — read by Boz in source 2026-10-04. Confirm.

- **A per-block land-use override is built end to end, and nothing calls it.** `setBlockLandUse(blockKey, lu)`
  (`src/cartograph/stores/useCartographStore.js:907`) → `design.json#blockLandUse` (hydrate :369) → the live render
  (`BlockGeometryV2Debug.jsx`) and the bake (`cartograph/bake-ground.js:466`). `git grep setBlockLandUse` finds only its
  definition; every town's `public/looks/<town>/design.json` has **0** entries.
- **The painter** was `luForRing`: the override, else the smallest face holding **one interior point** of the tile ring, else
  `pickLuFromHash`. ⚠️ *Corrected by Sward:* three callers, and the poured towns took the proto mint's, which voted the whole
  `①` block **before** the disc cut, so every rim piece inherited it. ✅ **Step 1 landed (not poured):** `landUseByPiece`
  votes each piece by area after the cut; the hash is deleted. ✅ **Superseded 2026-10-05: a piece is painted by its evidence
  polygons** (`layerLandEvidence` → `evidenceByPiece`); `luByPiece` is its label. ⏸ **Steps 2–3 (the per-piece override key and the
  Section type control) PARKED 2026-10-05** — Jacob: "We may not need the section controller anymore"; per-polygon
  painting paints a mixed block correctly without one. If ever built, it lives in SECTION (his ruling). ▶ `node checks/claims-every-piece-takes-its-own-land-use.mjs`
- **The key:** `blockKeyFromRing` (`src/lib/buildBlockGeometryV2.js:66`), the tile ring's bbox centre snapped to 0.5 m.

## The defect (Sward, measured)

A tile whose inner area (`iA`) falls into several pieces is painted whole by one point. Huron's motorway median strip is a
second piece of tile 63 (5.21 ha against 185.95 ha) and tile 108, so it draws crop. Census, pieces ≥ 100 m²: Huron 3 · LS 4 ·
HPDM 3 · Provincetown 8 · Altadena 17. ▶ `node scratch/huron-median-lu/split-tile-census.mjs`. Home:
`BRIEF-land-use-derivation.md §0`; the warning it fulfils: `cartograph/PREBAKE-POLYGONIZATION-PLAN.md:77` ("composite faces …
Don't silently coarsen").

## The work. Stop and report to Jacob after each.

1. **Each piece takes its own land use.** Sample each piece of the inner area on its own, not the tile ring once. Delete
   `pickLuFromHash` from the return path: a piece nothing classifies is `underived`, by name. Turn the census into a check that
   fails on any piece painted by another piece's point; mutation-test it by restoring the single point.
2. **The key reaches a piece.** Decide how an override names a piece so it survives a re-pour that nudges geometry (the bbox
   snap is today's answer for a block), and **report an override that matches no piece**, loudly, in Survey and in the bake.
   ⛔ Never drop it silently.
3. **The control.** In Survey: select a piece, choose its type from the town's land-use vocabulary (the classes
   `checks/claims-every-lu-tag-has-a-home.mjs` knows), clear it back to the machine's answer. The view must show which pieces
   are **authored** and which are **derived**, and from what.

⛔ **Not this brief:** the ruling on a tile's uncovered remainder and the source ladder (OSM → parcels / the Cropland Data Layer
→ derived from buildings), which is `BRIEF-land-use-derivation.md` · the two Huron split mechanisms (a 1–10 mm throat at a
motorway handover; a trail poured as a 5.49 m residential street), which are `BRIEF-highway-build.md` Open.

## Can the instrument see it?

The census reads the frozen shape and the live painter; it runs without a bake, so it can show step 1 directly. Steps 2–3 reach
the slab only through a bake: Jacob's go. **Eye gate:** Jacob sets a type on Huron's motorway median in Survey and sees it in
Preview.

**Confirm-then-build:** read the code sites, tell Jacob what you found, and stop if the code contradicts this brief.
