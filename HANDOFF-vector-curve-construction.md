# HANDOFF — Vector-curve block construction (the "4 points joined by curves" goal)

**Status: DESIGN — start fresh here.** 2026-06-13/14 burned a long arc proving what does NOT work and distilling the two laws that govern the right approach. The map is reverted to clean (the through-road fix `c4cb191` is the live state; the leg-elimination is dormant/abandoned). Read this before touching code.

---

## The goal (Jacob, in his words)

Curved roads currently render **"smoother but not smooth"** — the centerline is the raw OSM digitization (~15°/vertex), so a curving street is a faceted polyline. The target is **VECTOR**: *"4 points joined by curves"* — few control points, **smooth curves that follow the road**, with the curb a clean concentric offset. Not the "cram a zillion segments in" hack; actual vector geometry.

## The two LAWS we proved this arc (the durable doctrine — do not relearn these)

1. **⭐ THE CONCENTRIC LAW.** The curb is **always** a concentric (parallel) offset of the centerline — by construction (`offsetRingVariable`). So **a straight curb against a curved centerline is impossible unless they came from *different* geometry.** ⇒ **The cleanup MUST happen on the centerline / FRAME (upstream), never at the curb.** Straightening only the curb's source ring (in `extractFaces`) desyncs it from the *displayed* centerline → the "stink" (curved centerline, straight curb). Clean the frame (the streets the app draws AND the curb offsets) once, and they stay concentric.

2. **⭐ CURVES, NOT LEGS.** A road that **genuinely curves** must be represented as a **smooth curve that follows it**. RDP/leg-straightening replaces the curve with straight **chords that cut across the road** — the centerline pulls off the asphalt at corners and bends. Smaller eps just facets; bigger eps cuts more. **Simplification (RDP) is the wrong primitive.** The right one is **curve-FITTING**: keep enough control points to capture the real path, then fit a smooth curve *through* them so it rides the road.

3. **The scalloping fear is dead** (the reason D5 smoothing was shelved 2026-06-04). It scalloped because it smoothed the **dense, noisy** polyline. Smooth the **sparse control points** (after simplifying) and there's no high-frequency noise to amplify. (Jacob's insight — this is what unblocks D5.)

## What we TRIED and REJECTED (don't repeat)

- **Cluster-collapse → synthetic leg-intersection corner** (`scratch/leg-build.mjs`, early): detects concentrated bends, replaces them with the legs' intersection point `X`. **Rejected:** misplaced `X` near name-transition nodes → visible **thorns**; fragile (the cluster broke at any long segment, so spread-out ~90° arcs never triggered).
- **RDP-to-legs** (`simplifyStreetsToLegs` in `tileGround.js`, now `LEG_BLOCKS=false`): junction-protected RDP straightens each edge to predominant legs. Keeps real vertices (no thorns) — but **straightens the curved road into deviating chords** (Law 2). *"The centerline and resulting polygon is no good."*
- **Placement at the curb** (`extractFaces` pre-pass): desynced curb from the drawn centerline (Law 1). Moving it to the frame (`derive.js`) made them concentric but inherited the leg-straightening problem.

## THE PLAN (curve-fit / the real D5)

1. **Control points** — simplify each street to the control points that capture its real path (RDP at a tolerance that *keeps* curve detail, not one that straightens it; junction- and name-transition-protected, like the skeleton's own RDP). For a straight-with-corners street this is ~4 points; for a curving one it's however many the curve needs.
2. **Smooth curve through them** — fit a smooth interpolating curve (Catmull-Rom, or biarc/arc segments) **through** the control points so the rendered centerline **rides the asphalt**. (Catmull-Rom passes through control points; Chaikin/corner-cutting does NOT and would pull off the road — prefer interpolating.)
3. **Placement = the FRAME** (Law 1) — apply in `derive.js` (or `skeleton.js`) so the frozen `ribbons.streets` (drawn centerline), the tiles, and the curb all derive from the one smooth curve → concentric by construction. **Not** in `extractFaces`.
4. **Corners** — a real ~90° turn stays a sharp control vertex so the curb's `filletRing` rounds it into a vector arc (offset-then-round); gentle curves stay smooth. (Decide: sharp-corner-in-centerline + rounded-curb, vs rounded-centerline — TBD on Jacob's eye.)
5. **Concentric offset** — the curb offsets the smooth curve; a curve's parallel offset is itself smooth, so no facets.

## Open items (not blockers, but in scope)

- **Dead-end pendant** — the cul-de-sac out-and-back leaves a 180° spur in the tile ring (a visible hook near Dolman). Pre-existing (`extractFaces` doesn't prune pendants); handle in the curve pass or separately.
- **Control-point density / tolerance** — the dial: too sparse loses the road, too dense re-facets. Tune on the eye.
- **Median / legacy tiles** — loop interiors and median tiles take the *legacy carve* path (`legacyBlock`, gated at `tileGround.js:2364` by `isMedianTile` / `ringArea>1500`), so they don't get the offset+round. Bring them onto the same path.

## ⛔ Gates (a 2-day arc reinforced these)

- **The EYE is the only gate.** Proxy metrics misled repeatedly this arc — the "157°/180° worst-turn" numbers were artifacts that didn't match what the render showed; Jacob's eye caught the real issues (thorns, the concentric stink, legs-cut-the-road) every time. **Validate on the lit app, never a metric.** (`feedback_proxy_render_is_not_the_operator_eye`.)
- **Stand up the design before code.** This arc thrashed through 3 primitives partly by patching live. Curve-fit is a real build — design the control-point method + smoothing + corner handling + concentric offset, align with Jacob, *then* implement behind a flag with the frame placement (Law 1) from the start.
- **Subagents are write-blocked in this sandbox** (read-only `node -e` only) — Boz implements landed code; agents forensic/design.

## Artifacts / references

- The leg-elimination prototype (`scratch/leg-build.mjs`) was **cleared** as session scratch. The **reusable harness pattern** it used — load `src/data/ribbons.json` → apply a streets transform → `buildTileGround({smooth:0, emitArtifact:true})` (delete `ribbons.tiles` to force the live `extractFaces` walk) → compare W18/grid tile rings + `iA` — lives in the committed `scratch/correctness-detector.mjs` / `corner-guard.mjs`; rebuild the curve-fit test harness from those.
- `src/lib/tileGround.js` — `simplifyStreetsToLegs` (RDP-legs, **dormant, `LEG_BLOCKS=false`, ABANDONED**) + the gated `bendCorner` in `cornerAt` + `offsetRingVariable` (`:91`, the concentric offset) + `filletRing` (`:189`, the corner round). **Remove the dormant leg-elimination when curve-fit lands.**
- Canon: `RIBBONS.md` (tile = polygon, centerlines = grout), `SECTION.md §8` (smoothing deferred — now unblocked by Law 3), `SKELETON.md §5a` (the through-road fix, the curve's name-transition).

---
*Drafted 2026-06-14 to wrap the block-construction arc for a clean restart. The through-road fix (`c4cb191`) stands; the leg-elimination is reverted. — Boz.*
