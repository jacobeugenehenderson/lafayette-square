# BRIEF-the-ground-knows-its-height — superseded text, 2026-10-12 (state rewrite)

Removed from the live brief when its State block was rewritten (Swale; Boz). Live home: `docs/briefs/BRIEF-the-ground-knows-its-height.md`, State.

## Preamble (the 10-11 dispatch: confirm-then-build, stop before production code)

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to Boz** (the coordinator session Jacob names when he dispatches you).

**Instruction: confirm-then-build.** This brief REOPENS DESIGN, by Jacob's explicit ruling (§0). That makes the
confirm step heavier than usual: every premise below is a claim to check against the code, and the design in §5 is a
PROPOSAL, not a ruling. Read the canon and code in §2–§3, run the measurements in §4, and **stop and report** before
you write any production code. Where the code contradicts this brief, stop and flag it. That is the work, not an
interruption.


## §3 rows: the 10-10 mesh and kerb sites

| flat paint → mesh → conformed to terrain | `cartograph/bake-ground.js` (`buildTileBakeShape`, `triangulateAndRefine`) · `cartograph/groundConformity.js` (`conformAndRefine`, `closeBoundaryTJunctions`, `findTJunctions`, `cutAlong`) |
| the raised kerb, as cut-then-lift | `cartograph/kerbLift.mjs` (`ringsInside`, `liftBuffer`, `riserFromEdges`, `curblessEdges`), its guard at `bake-ground.js` (`kerbH`) |

## §3 row: the kerb-cut harness (cutAlong deleted 5255b311)

| the kerb-cut harness | `scratch/kerb-cut/dump.mjs`, `scratch/kerb-cut/harness.mjs` |


## §4.4 the kerb as measured 10-10

4. **The kerb.** 265 T-junctions after `cutAlong`, 0 before; 258 on a crease. Mechanism not established
   (`BRIEF-corner-ramps-and-kerb §9`, corrected). The ramp, flare and taper outlines are `kerbLift.mjs`'s own geometry
   (`kerbRegions`, `taperRegions`), NOT partition pieces; the painter gives only the warning strips (`mat:curbCut`)
   and each cut's `{face, inward}`. Slicing the paint with them was tried and failed (§9). ▶ `kerb-tj-where.mjs`

## §4.9 ruling line

   **Ruled 2026-10-11: ① is painted first** (§5).

## §5 shore: go pending

intersection is a skeleton source change and a re-pour of both towns: Jacob's go, pending.

## §5 Step 3 (mechanism to be named)

**Step 3: the ground mesh is deformed by that field near ①, and by the plain terrain elsewhere.** The kerb face is
where the profile steps, so the mesher keeps that line as an edge; nothing is cut afterwards. Name the mechanism (a
constrained triangulation that takes the profile's step lines as edges, or vertices placed along them) and its cost
before adopting it.

## §5 Exaggeration: the ask

Show how the runtime applies the two parts separately, and prove that a walk stays level across
at ANY exaggeration (Browse may regain depth).

**Where two lines come close (overlap), in plain words:** a spot can be near two DIFFERENT lines at once, e.g. a thin
strip of land between two parallel streets, or a median between two carriageways. (One street never overlaps itself:
its two sides are back to back.) Both profiles then reach that spot. **RULED (Jacob, 2026-10-11): the painted band
decides.** Ownership comes from ① (the partition), never from the nearer line, and never from a blend across the strip.
Where two owners' bands meet at a height gap, the gap is a vertical retaining-wall face on that partition edge. A
station with no painted owner fails loudly, as its own class. **Tolerance RULED the same day: 7.8 mm** (×3.8 ground
triangles accepted).

**THE CASE THAT STARTED THIS, a block on a mound** (Jacob, 2026-10-10; common, and frequent in HPDM): *"a lot is never
a smooth inflated bubble meeting at an apex; in HPDM there's lots of ~1.5 m rises over .75 m so the sidewalk is very
distorted there."* Today the 5 m terrain grid can't represent that rise, so it is smeared across the walk and the block
drapes as a bubble. In the real street the walk follows the street, and the rise happens right BEHIND it, steeply (a
berm or low wall), with the lot a terrace on top. In this design that is the lawn-and-land step: the walk stays on the
line's height and the rise lives behind it. So the blend is often SHORT and STEEP (~0.75 m on HPDM), and ideally comes
from where the real rise is in the lidar, finer than the 5 m grid. ⚠️ `BRIEF-terrain-resolution.md` ("the good elevation
exists and the pipeline cannot read it") is directly relevant: read it, and say whether the rise can be located at the
lidar's own resolution. Measure HPDM's mounds: the rise height, its run, and how far it sits behind the walk.

**THE SHORE'S GUSSET** (Jacob, 2026-10-10, the shore's mechanism in his words): *"The protopolygon has two sides; the
shore side and the water side. In plan view, they look like the same line, they are the same shape. However, when looked
at from the side the elevation splits the ground and you can see thru to the sky layer behind. This also makes a
'gusset' shaped opening: a flat bottom (water) and the contoured lip at shoreside. It is both contoured on the ground
plane *and* the terrain elevation plane. I think what has to happen is an averaging step where we look at the elevation
and average the gusset-plugged and turn it from a block shape to an s-curve."* So the shore profile is: the land side
at the line's terrain height, the water side at the water level, and the deformer's averaging step fills the gap
between them, turning the step into an S-curve that rolls the land down to the water (measured: §5 "The shore"). The
shore median's two lines (Jacob's 2026-10-04 ruling, `bake-shore-median.mjs`) are the S-curve's two ends in plan. ⛔ Don't
retire that ruling without asking him. ⭐ **The gusset's SHAPE is data, not just a hole to fill** (Jacob, 2026-10-10: *"The gusset shape itself is
important because it would determine particulate/fill size."*): its height gap and run at each point decide the grain of
what fills it (boulder → rock → gravel → sand; `BRIEF-the-shore-is-closed`'s treatment rules). So the averaging step must
RECORD the gusset's dimensions along the shore (one record, read by the treatment), not only smooth them away.

**Cross-slope limit: RULED** (Jacob, 2026-10-10): ADA's 1:48, as a town norm beside `kerb` in `norms.json`.

## §5 What it replaces + the four open questions

**What it replaces (deleted in the same change):** the flat-paint-then-drape path near ①, `cutAlong` as the kerb's
mechanism, `kerbLift.mjs`'s cut-then-lift, and the shore median's unsmoothed marching-squares outline as a shape
source. Whether `conformAndRefine` survives away from ① is yours to measure.

**Open questions to answer with numbers before Boz and Jacob rule:**
1. The line's height: terrain sampled along ① and smoothed. What window, and what does each candidate do to HPDM's grades
   and Huron's shore? (A town value with a neutral default, never a constant.)
2. Where the deformer's height is stored, so it stays one record that every consumer reads (the ground, trees,
   buildings, lamps, the shore band). Prefer riding an existing artifact (`shape.json` carries ①'s runs) over a new file.
3. Bake cost against today's long poles (Provincetown's ground + ground-shore took ~160 min on 2026-10-07).
4. The shelved perpendicular landings (`BRIEF-corner-ramps-and-kerb §9`): do they become simply the profile's h → 0 at a
   cut? If so, that brief's open item retires into this one.



## §6 Checks as specified 10-08

## 6. Checks (each must be seen to FAIL before it passes; mutation-test every one)

- **Level across:** every walk and curb band's cross-slope is within the town's tolerance, on every town, with the
  count of exceptions (each named by tile and arc). Mutation: today's drape → red on HPDM.
- **The kerb has a face:** wherever the town's kerb is drawn, the height step between road and curb pieces is a mesh
  face, with no T-junction (`claims-the-ground-has-no-cross-polygon-t-junctions` green on every town, LS included).
  Mutation: drop the face → red.
- **The shore meets:** the water plane and the shore piece share the smoothed waterline as an edge. The fixed gap walk
  finds zero views reaching the sky along every shore, from water and land, near and far. Mutation: today's unsmoothed
  marching-squares edge → red (jags), and a removed shore piece → red (holes).
- **The ground tiles:** `claims-the-ground-tiles-without-a-gap` goes green on every town once ① is painted (the
  centreline slits and the ε shore crack close). Mutation: leave ① unpainted → red with today's counts.
- **Objects still sit on the drawn ground:** the existing anchor checks (trees, buildings, lamps) stay green.
- **Flat towns don't move:** on a town with flat terrain and a flat kerb, the new ground is byte-identical to today's,
  or every difference is explained.
- **One pour → its ground:** a ground bake reads the map, terrain and ribbons of ONE pour (`bake-reads.json`).
  2026-10-07 found LS's shipped ground baked from an uncommitted pour; make that impossible to ship unnoticed.

## From ROADMAP, closed 2026-10-13 (Swale): the memo's sampling order

The board line as it stood:

- **The deformer's heights may depend on the order they are asked for** *(Cairn, read 2026-10-12; confirmed in code by Boz)*. `cartograph/groundDeformer.mjs` `resolve` memoizes `resolveUncached(x, z)` in one Map keyed by the 1 mm lattice cell, so the first point to reach a cell sets the height, owner and unowned verdict for every later point in it. Whether any drawn height differs between two sampling orders is not measured. ⇒ the deterministic form evaluates the cell's own point, or keys exact positions only. Swale to measure on Cairn's Huron dump, then propose a fix. → `groundDeformer.mjs#resolve`.

Closed by keying the memo on the exact position (`groundDeformer.mjs#resolve`). Measured on Huron's dump-shore (`scratch/ground-height/memo-order.mjs`, 1,977,072 points): the 1 mm key, forward vs reversed: 13,789 heights differ (max |Δ| 0.6186 m raw), 486 null↔value, 760 owner flips, 40 unowned flips; the exact key: 0 of each. ▶ `checks/claims-the-ground-height-is-a-function-of-the-point.mjs`.
