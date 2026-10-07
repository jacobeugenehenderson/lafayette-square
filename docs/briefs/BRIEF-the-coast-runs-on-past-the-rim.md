# BRIEF — past the town's rim, the water ends where the real coast does

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to the session `Boz the Younger`.**

**Instruction: confirm-then-build.** Read the canon and code below and tell Boz what you found. If the code
contradicts this brief, **stop and flag**. **Towns: Huron** (Lake Erie), then **Provincetown** (open ocean).

---

## 0. What this is (Jacob, 2026-10-06)

Past the town's circle, two things fill the view to the horizon: the **horizon disc** (land, in the colour of what grows
round the town's rim; restored at Jacob's ruling 2026-09-27) and, in every direction where the rim is water, **the water
body run on to the horizon** (`BakedGround.jsx#extendWaterToHorizon`). That run-on is built in **256 pie-slices round
the rim, each all water or all land**. Where a water slice meets a land slice, a hard straight water/land edge runs
from the rim to the horizon, at right angles to the real shore. Jacob's screenshot (Huron, Hero): *"the artificial
extensions where the water meets land on the outside of the radius circle is a hard edge."*

**Ruled (Jacob, 2026-10-06), option (b):** past the rim, the water/land boundary **follows the real coast**. The kit
already fetched it, out to the edge of the fetched square (`EXTENT-DESIGN §3.3`). From there it **carries on along
the coast's own heading** to the horizon's fade. ⛔ Not a wider disc (Jacob asked; it only moves the line out, and costs
frame time and an hour's ground re-bake). ⛔ Not a feathered pie-slice (the boundary would still run the wrong way).

⭐ **Kit, not Huron (`CLAUDE.md` Layer 0).** One construction for a lake, a sea and a river mouth. Every distance is
the town's own (the fetched square, `horizonFor`'s multiples of the radius), never a constant fitted to Huron.

## 1. Read first

- `cartograph/FEATURES.md`, the waterfront paragraph ("a shoreline is easier than a street, because it is absolute";
  a lake is a closed body, an ocean coast is loose fragments the kit stitches).
- Memory/canon: **the neighbourhood is one closed shape; the rim is an EDGE OF THE DRAWING**, and the fade is applied
  last, as a look. Past the rim is horizon, drawn to read right, not survey.
- `src/components/HorizonDisc.jsx` header (`horizonFor`: disc to 2.8 R, fading 1.05 R → 3.53 R; colour from the
  bake's `stencil.horizon`).
- `cartograph/coastline.mjs` (`isWaterFeature`, `weldCoastlines`, which side is water) and `cartograph/shoreRuns.mjs`
  (`coastVerdict`: a shoreline wholly outside the drawing is no shore *for the town*, Kerb 2026-10-06; this brief draws
  it as HORIZON, and must not undo that verdict).

## 2. Code sites

| what | where |
|---|---|
| today's run-on (256 sectors, `inBody` test at 0.995 R, a sector out to `horizonFor(R).fadeOuter`) | `src/components/BakedGround.jsx#extendWaterToHorizon`, `#waterHorizon` |
| the land past the rim | `src/components/HorizonDisc.jsx` |
| the coast, welded, with its water side | `cartograph/coastline.mjs` |
| where the stencil and the `horizon` record are written | `cartograph/bake-ground.js` (`manifestStencil.horizon`, `groundCover.mjs#horizonRecord`) |
| the fast shore steps (candidates to emit the outer coast, rather than the hour-long ground step) | `cartograph/bake-coast-distance.js`, `cartograph/bake-shore-median.mjs` |

## 3. The work

1. **Measure (read-only), and stop.** For Huron and Provincetown, list each wet run of the rim and, for each, the real
   coast past the rim inside the fetched square: where it meets the rim, where it leaves the square, and its heading
   there. Count the cases the construction must handle:
   - a coast that leaves the square (carry on along its heading);
   - a water body CLOSED inside the square (a small lake or bay cut by the rim): it ends at its own far shore and must
     **not** run to the horizon. ⚠️ Today's code runs every wet sector to the horizon, so this is a second defect, if
     present.
   - open water to the square's edge in every direction of a run (the sea: water to the horizon is correct).

   Report counts per town and a screenshot of today's edge at Jacob's Hero pose.
2. **The bake emits the outer coast:** the coast past the rim, clipped to the fetched square, with each exit point's
   heading and which side is water. Emit it from a FAST step (shore / coast-distance), ⛔ not the ground step: Jacob
   ruled that long bakes must be rare. Name the step, and the bake time it adds.
3. **The runtime builds the water past the rim from it:** the region bounded by the rim, the real coast to the square's
   edge, and the coast's heading on to `fadeOuter`. It replaces the pie-slice sectors in the same commit (the old
   construction is gone, not kept alongside). The horizon disc keeps the land side.
   - ⛔ **No fallback:** a wet rim run with no outer coast record is a loud console line and is drawn as today's rim
     water only, counted. It is never a guessed extension.
4. **Checks:**
   - every wet rim run meets the outer water with no gap or overlap;
   - no water/land edge past the rim runs farther than one sector from the real coast inside the fetched square;
   - a closed body cut by the rim ends at its own shore.

   Mutation-test each one. Eye-gate on Huron at Jacob's Hero pose and on Provincetown, with the scene and shot recorded.

## 4. Bounds

- **Writes:** `src/components/BakedGround.jsx` (the run-on), `src/components/HorizonDisc.jsx` (only if the land side
  needs it), the chosen fast bake step, `cartograph/coastline.mjs` (reads only, unless a helper is missing), `checks/`.
- ⛔ Others in the checkout: **Strobe** (perf: post-FX, the renderer), **Argon** (`SlabBuildings.jsx`, neon), **Sill**
  (`tileGround.js`, the raised kerb in `bake-ground.js`). Ask Boz before touching a file they hold. ⛔ Clear every bake
  with Boz.
- Commit through explicit paths only (`BOZ §3.7`). **Registers:** `FEATURES` (the waterfront paragraph, in place),
  `SLAB-CONTRACT` (the new outer-coast record), `ARCHITECTURE §8`.

## 5. Done when

On Huron's Hero and Provincetown's, the water past the rim meets the land along the real coast and fades into the
haze along its heading, with no straight radial edge. A small lake cut by the rim ends at its own shore. Jacob's eye
in Preview.
