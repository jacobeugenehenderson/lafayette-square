# HANDOFF — Tile re-pour · T2-finish (the 🔜T2 ledger rows)

**Agent: WARM → Tessera.** You built `tileGround.js` through T2.5 + LS adoption; this finishes T2. The module is yours — warm.

**This pass = the 🔜T2 rows of `HANDOFF-tile-feature-ledger.md`** (the definition-of-done). **Reads first:** that ledger, your T2 report, `src/lib/tileGround.js`. The ledger carries the full context per row; this brief is the dispatch + the specifics.

## Goal

Close the T2 gaps so LS draws the real map *correctly and richly* — ADA corners, honest dead-ends, stroked edges, **land-use color**, working corner controls, swappable strips. Still **LS-direct, unflagged, live==bake.** Jacob's eye on LS is the gate (per row).

## The pieces (suggested order — visible wins first; land incrementally, commit per row)

1. ✅ **M1 + M2 — land-use color — DONE** (resolved, Jacob 2026-06-01). Blocks color by their LU metadata; treelawn matches its block. Not part of this pass.
2. **G5 — ADA corner ramp (Jacob's precise spec, 2026-06-01 — this CORRECTS the earlier arc-handedness guess; that was wrong, ignore it).** At the corner, the **sidewalk FILLS the treelawn band** → **one SOLID sidewalk pad** from the curb's inner edge to the property line (the full ped depth — treelawn+sidewalk — all sidewalk). **The bug:** the corner currently keeps separate **concentric treelawn+sidewalk arcs**, so the inner sidewalk arc **collapses to a point** — that's the "sidewalk comes to a point, no ramp" you're seeing. **Fix:** at the corner span (tangents tA→tB), treelawn **ends** and the ped becomes **one solid sidewalk region filling the full depth** — not nested arcs. **Same rule in the arc (rounded) AND square (R=0) versions** — corner R curves the *outer* edge only; it does **not** shrink the pad to a point; the ramp fills the equivalent area either way ("the difference between the two"). Doctrine home: **RIBBONS.md §6.9** (corner = all-SW, sidewalk curb→property-line — read for the doctrine, ignore the figure-ground "RESOLVED" archaeology around it).
   - ❗ **The corner + sidewalk GEOMETRY is already good (Jacob) — fix only the corner FILL (treelawn→solid sidewalk, no pinch-point); do NOT regress the geometry.**
3. **G8 + A4 — dead-end cap typology.** Honor the authored `capEnds` (`capStart`/`capEnd`): **round → round cap** (current `strokeOpen` etOpenRound), **blunt/none → flat butt cap with NO sidewalk wrapping the end** (the street ends, LU abuts directly). Read the chain's authored cap; don't always round. (Jacob: "round-capped **or** flat with no sidewalk cap.")
4. **A2 — corner-R-wire (folded in per Jacob).** The corner controls (Corners slider, per-IX/per-corner dots) write `cornerRadiusScale` + `cornerRadiusOverrides` but the tile R is hard-coded ~4.5m. **Make the tile corner R read those authored values** (scale × per-corner/per-IX override, NACTO default). Now the existing controls shape the tile corners. (Full UI migration is T3; this is just the data-wire so the live controls work.)
5. **G9 — perimeter / edge-of-map tiles.** Replace the `stencil − tiles` placeholder: the **outermost streets get their full strips on the street side, nothing on the stencil side** (the DCEL already knows each edge's origin). Fixes the half-roaded exterior dead-ends (Jacob #3).
6. **M3 — strip-material data-driven (the swap carry-forward).** Tag the ped strips from the overridable `materials:{outer,inner}` model, **not** a hard-coded treelawn/sidewalk default — so T3's flip gesture plugs in with no geometry rework. (Don't build the gesture; just keep the data path open.)

## Reuse (retrofit, not reinvent)

`tileGround.js` (extend) · existing LU resolution + per-Look `luColors` (M1/M2) · the concentric corner from T2.5 (G5 is a material rule on it) · `cornerRadiusScale`/`cornerRadiusOverrides` (A2) · `capStart`/`capEnd` (G8/A4) · the `materials:{outer,inner}` model (M3) · Clipper + R-kit.

## Boundaries — do NOT cross

- ❌ No authoring **UI** migration to Survey — that's T3 (only A2's *data-wire* is in scope, not moving the controls).
- ❌ Don't build the strip-swap **gesture** — T3 (M3 is data-model only).
- ❌ Don't delete figure-ground — T4. Don't reconnect alleys/paths/overlays — deferred slab-content (D rows).
- ❌ Don't touch `design.json` customs; don't edit canonical docs (Boz folds your report into the ledger).

## Gate (per ledger row, on Jacob's eye, LS)

LS draws: blocks colored by land-use (M1) with matching treelawn (M2); ADA all-SW corners (G5); dead-ends round **or** flat-no-cap per authored cap (G8); the Corners slider + dots actually reshape corners (A2); exterior streets stroked (G9); strips overridable in data (M3). Each row → ✅ in the ledger only when you confirm it.

## Report

Per row: what landed + the LS A/B. Confirm M1's LU resolution path (how a tile gets its class). Flag G2 (per-edge ped width at corners) — is the per-block-uniform acceptable, or does Jacob want the deeper cut? Anything that fought (esp. M1 tile↔parcel mapping, and A2 if the corner construction resists a variable R).

*Provenance: Boz, 2026-06-01. T2-finish of `HANDOFF-pipeline-reconception.md`; rows tracked in `HANDOFF-tile-feature-ledger.md`.*
