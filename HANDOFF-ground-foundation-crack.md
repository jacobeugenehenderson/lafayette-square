# HANDOFF — the ground↔building foundation crack (mechanism B: footprint-flatten + apron)

**Agent: FRESH.** Route via `CLAUDE.md`. **Read `scratch/GROUND-BUILDING-CRACK-FINDINGS.md` FIRST**
(the full forensic) + `cartograph/BACKLOG.md §FRONT B`. Rebuild-gated. **Work in a worktree; docs→trunk.**

---

## THE DEFECT (forensic-confirmed 2026-07-16, all anchors verified)
On a slope, a crack runs parallel to a building footprint and **exposes the concrete foundation
blocks.** This is **mechanism B** — a divergence of two displacement rules that meet at the footprint.
Do **not** conflate it with mechanism A (the terrain-tessellation split), which is **already fixed**
(`15957592`, conforming red-green refinement).

- Ground displaces **per-vertex** to its own world height (`terrainShader.js:197`).
- The building **+ its foundation rigid-lift as one body** to the footprint's **mean** elevation
  (`aCentroidY` = mean of footprint-vertex raw elevations, `bake-buildings.js:726-728`; applied `:725`).
  Walls + foundation share it → a flat base at the mean (intentional anti-shear).
- The footprint is **not cut out of the ground** — `bake-ground.js:385-391` subtracts curb/treelawn/
  sidewalk/park, never buildings, so the ground sheet passes continuously under the building.
- Result on a slope: the downhill footprint-vertex ground `Y = e_i·uExag` sits **below** the flat
  foundation top `mean(e)·uExag + fh`, exposing a concrete band `(mean(e) − e_i)·uExag + fh` that
  **grows with slope.** Uphill, the same divergence buries the wall base (the "house-mound").
- The 8 m foundation depth (`foundationGeometry.js`) only keeps the *bottom* buried — it can't help the
  exposed *top*.

## THE CURE (the smallest true fix — per findings §36-59)
A **`bake-terrain.js` post-process** that **stamps the heightmap flat under each footprint to that same
mean elevation, with a smooth apron falloff** blending back to native terrain over a few metres outside
the footprint. Then ground-under-building == the building's rigid anchor → flush with the foundation
top (no exposed band), and it "stretches" back to terrain across the apron.

1. In `cartograph/bake-terrain.js`, after the raw heightfield is built, stamp each building footprint
   flat to its footprint-vertex **mean** elevation + a smooth apron falloff.
2. **Extract ONE shared `footprintMeanElevation()` helper** used by BOTH `bake-terrain.js` (the stamp)
   and `bake-buildings.js` (the anchor) so the ground-stamp and the building-anchor **can never drift.**
   This shared helper is the load-bearing part — don't duplicate the mean-calc.
3. Read `V_EXAG` from its **SSoT**, never re-hardcode `1.5` (`BACKLOG §GPU-perf gotchas`).

⛔ **Rejected alternatives — do NOT pursue:** shearing the building to per-vertex terrain (defeats the
rigid-centroid anti-shear); a deeper foundation skirt (moves only the buried bottom, not the exposed
top); a weld (there's no seam to weld here).

## GATING (rebuild)
Re-bake terrain + ground; **then re-run `bake-ground-ao.js --look=<id> --scene=<id>`** — a standalone
ground bake strips `poolmap`/`colormap`/`lightmap` → flat-lit slab (`HANDOFF-ground-refine-cdp.md:68`,
`BACKLOG §GPU-perf gotchas`). The GUI `/bake` chains this; a manual CLI bake does not.

## DoD
- On a steep LS lot, the concrete band is **gone** on **Jacob's eye** (the apron reads natural, not a
  visibly flattened yard); flat/gentle lots unchanged; no flat-lit regression (AO intact). ⛔ verify on
  the real render, not the bake log. Operator must confirm the apron radius doesn't flatten steep yards.

*Quick independent win (ROADMAP §Quick wins) — a public-visible aesthetic defect; independent of
Front A / Column B. Sits in FRONT B (ground-mesh correctness).*
