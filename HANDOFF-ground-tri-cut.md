# HANDOFF -- ground tri-cut (adaptive terrain-aware subdivision)

Branch base: curb-offset-draw (d39461b), materialized into this worktree.
Status: PROPOSE -- re-baked artifact + measured recommendation. NOT committed/deployed. The operator eye is the final gate.
Knob default: GROUND_REFINE = adaptive, GROUND_REFINE_TOL_M = 0.30 m.

## 1. Verified diagnosis

cartograph/bake-ground.js earcuts each ground polygon (THREE.ShapeUtils.triangulateShape), then triangulateAndRefine iteratively 1-to-4 midpoint-subdivides every triangle whose longest edge exceeds a single global REFINE_MAX_EDGE_M = 15 m target. It ran for needsRefine = kind===face || LANDSCAPE_OVERLAY_KEYS.has(key) -- ALL land-use FILL faces (park/residential/recreation/commercial/parking/unknown) + landscape overlays. Ribbon bands (curb/sidewalk/asphalt/highway/...) bypass refine (already dense).

Why it exists (fidelity constraint, confirmed): the baked ground is FLAT (Y=0 per vertex); the runtime vertex shader lifts each vertex by makeElevationSampler(terrain).getElevation(x,z) (src/lib/terrainCommon.js, V_EXAG=1.5); a triangle interior interpolates that lift LINEARLY. terrain.bin = 421x421 Float32 heightfield, 5.0 m sample spacing, raw 0-35.17 m (x1.5 = 0-52.8 m climb). Long flat triangles interpolate Y straight across and lift off the heightfield, exposing dense coplanar overlays (asphalt centerlines, building foundations). The 15 m target was ~3x the 5 m terrain spacing.

The waste: LS terrain is locally planar almost everywhere -- median deviation over a 30 m edge ~1.4 cm; only a few % (raised park band) curves (p99 ~2 m, max ~6 m over a 15 m half-edge). Uniform 15 m carpet-bombs the flat fills. park+residential+recreation = 80.5% of the 1,368,313-tri mesh. The refine is uniform (one global edge target); knob = REFINE_MAX_EDGE_M; materials through it = 6 land-use faces + LANDSCAPE_OVERLAY_KEYS.

## 2. Approach implemented

Replaced the uniform edge test with a terrain-deviation test, opts-gated, in triangulateAndRefine + itemsToBuffers + bakeGround:
- Split a triangle only where the heightfield bends under it: probe true terrain lift at the 3 edge-midpoints + centroid (the points a 1-to-4 split introduces) vs planar interp of the 3 corner lifts; split only if deviation > GROUND_REFINE_TOL_M. Flat blocks stay coarse; steep park band stays fine.
- GROUND_REFINE_MAX_EDGE_M = 64: hard coarse cap, always split monstrous edges so dense overlays keep a face vertex within range.
- GROUND_REFINE_MIN_EDGE_M = 6: floor, never split below this even where steep (bounds bin size).
- Per-material tiering: soft land-use FILLS get the adaptive policy (budget + least-visible coarseness); landscape overlays keep legacy fine 15 m uniform (HARDSCAPE_REFINE_MAX_EDGE_M); ribbon bands bypass refine unchanged.
- The bake-time sampler mirrors src/lib/terrainCommon.js makeElevationSampler EXACTLY (same bilinear x V_EXAG), so the measured deviation = the runtime shader error.
- Gated on opts.* / argv, NEVER process.env. bakeGround({refine}) + CLI --refine=uniform|adaptive --refine-tol --refine-min-edge --refine-max-edge. --refine=uniform restores the byte-faithful legacy mesh (verified: 1,368,313 tris / 25,158.7 KB).

## 3. Before -> after tri budget (default tol = 0.30)

| material | baseline tris | adaptive tris | delta |
|---|---:|---:|---:|
| park (face) | 469,384 | 160,024 | -66% |
| residential (face) | 355,671 | 125,454 | -65% |
| recreation (face) | 276,043 | 227,812 | -17%* |
| parking (face) | 65,629 | 15,175 | -77% |
| commercial (face) | 37,961 | 10,751 | -72% |
| unknown (face) | 23,446 | 4,114 | -82% |
| parking_lot (overlay) | 41,558 | 41,558 | 0 (kept fine) |
| curb/sidewalk/highway/asphalt | 23,879/21,429/13,130/11,624 | identical | 0 (hardscape untouched) |
| TOTAL | 1,368,313 | 683,509 | -50.0% |
| ground.bin | 25,158.7 KB (24.6 MB) | 13,588.7 KB (13.3 MB) | -46% |
| groups | 27 | 27 | none dropped |

*recreation cuts least because that band sits on the steepest terrain -- the gradient test correctly keeps it finer. Feature working, not a miss.

## 4. Terrain-deviation error (fidelity proof)

Metric: per-triangle |true terrain lift - planar interp| at each triangle edge-midpoints + centroid, meters, mesh-wide. Conservative on the coarse mesh (bigger triangles -> wider probes -> samples more curvature).

| mesh | tris | max | p99 | p95 | p50 | mean |
|---|---:|---:|---:|---:|---:|---:|
| uniform (baseline, shipped) | 1,368,313 | 13.846 | 0.550 | 0.207 | 0.014 | 0.050 |
| adaptive tol=0.25 | 805,306 | 13.846 | 0.335 | 0.207 | 0.030 | 0.064 |
| adaptive tol=0.30 (default) | 683,509 | 13.846 | 0.364 | 0.239 | 0.032 | 0.073 |
| adaptive tol=0.35 | 596,230 | 13.846 | 0.387 | 0.271 | 0.034 | 0.081 |

Every adaptive tol keeps p99 deviation BELOW the shipped uniform mesh (0.55 m). The max=13.846 is identical across all meshes -- the single steepest park-cliff probe that neither mesh subdivides below the terrain data resolution (a property of the heightfield, not the coarsening). At the default the adaptive mesh is at parity on the worst case and BETTER at p99/p95, with half the triangles. p50/mean rise slightly (flat areas carry larger triangles) but stay sub-decimeter.

Structural sanity on the default artifact: 27 groups, 0 empty, all Y=0, 0 NaN, 0 out-of-range indices.

## 5. The knob

- Name: GROUND_REFINE (adaptive | uniform) + GROUND_REFINE_TOL_M (meters).
- Default: adaptive, 0.30 m. Lower = finer/more tris (0.20 -> 1.00M); higher = coarser/fewer (0.35 -> 596K, 0.50 -> 445K / 9.0 MB). Below ~0.20 the gain collapses; above ~0.40 p95 starts to exceed the shipped baseline.
- Supporting: GROUND_REFINE_MIN_EDGE_M=6, GROUND_REFINE_MAX_EDGE_M=64, HARDSCAPE_REFINE_MAX_EDGE_M=15.
- CLI: node bake-ground.js --refine=adaptive --refine-tol=0.30 (also --refine-min-edge, --refine-max-edge). --refine=uniform = exact legacy mesh.
- Programmatic: bakeGround({ look, scene, refine: { mode, tol, minEdge, maxEdge } }).

## 6. Risk to the look the operator MUST check

No eye here; proxy/node renders have misled both ways, so this is measured not eyeballed. On the lit Stage/Preview:
- The raised park band / recreation slope under grazing light (steepest terrain). The adaptive test keeps it fine, but verify no faceting/terracing on the green where the big park face was coarsened.
- Coplanar overlays over coarsened fills -- asphalt centerlines, building foundation skirts, treelawn seams on a now-coarser face. The 64 m cap + deviation test should keep them anchored; confirm no foundation lip or centerline floats/sinks.
- Silhouette at the neighborhood edge (stencil fade band) -- large boundary fills coarsened most; check the fade still reads smooth.

## 7. Still on the table (not done)

- True mesh decimation (edge-collapse / QEM on the earcut output) -- this work only AVOIDS adding tris, it does not remove earcut tris where the polygon itself is over-tessellated.
- LOD tiers -- bake a coarser far-LOD (e.g. tol=0.6, 445K) + distance-swap; mobile could ship the coarse tier outright.
- Baking Y into the mesh (drop the runtime per-vertex lift) -- lets subdivision target screen-space curvature + enables normal-based simplification, but changes the runtime shader contract (out of scope).
- Recreation is the largest remaining group (228K, 33%), genuinely on steep terrain; a per-material looser tol there would cut it further if the eye allows.
- Re-tune GROUND_REFINE_TOL_M up toward 0.35-0.40 if 0.30 is indistinguishable -- each 0.05 buys ~5-10% more.

## Files (this worktree)

- cartograph/bake-ground.js -- adaptive subdivision (opts-gated, documented). --refine=uniform restores legacy.
- public/baked/lafayette-square/ground.bin + ground.json -- re-baked adaptive (683,509 tris / 13.3 MB). Point dev server / Preview here, or --refine=uniform to A/B.
- cartograph/measure-ground.mjs -- per-material tri budget + terrain-deviation measurement.

NOTE on the worktree: the harness seeded this agent on origin/main; the curb-offset-draw (d39461b) baker + inputs (tileGround.js, ribbons.json, map.json, design.json, terrain) were materialized in via read-only git show so the baseline reproduces exactly (verified: flagless bake = 1,368,313 tris pre-change). The single source change to land is cartograph/bake-ground.js; the re-baked ground.bin/ground.json follow from re-running the bake on curb-offset-draw.
