# BRIEF-the-ground-knows-its-height §4 — the measurement steps as dispatched (Diary, 2026-10-10)

Retired for currency: the steps were run (Talus, 2026-10-10). Live home: the brief's §4, which now carries the
results and the command for each. Text as it stood before the results replaced it:

## 4. Step 1: measure, then STOP and report (read-only)

1. **Confirm the order and the dependencies.** List each bake step's inputs from `runIfDirty` / `bake-reads.json`.
   Confirm terrain reads nothing the ribbons make, and that the ribbons and paint today read no terrain. If either is
   false, stop: §5's reorder premise changes.
2. **Size the stretched walk, per town** (HPDM, Huron, Provincetown and LS; Altadena if it bakes). For every walk band
   (and curb and lawn), measure along its length across its width: the cross-slope (the height difference across the
   band ÷ its plan width), and how it changes along the band (the warp). Report the distribution (p50 / p90 / max)
   and the count above a cross-slope a person would read as tilted. ⭐ The threshold is NOT yours to pick: report the
   distribution and propose the source (an accessibility norm already in the kit, e.g. the curb-cut norm's slopes in
   `norms.json`, or Jacob's call). Give HPDM's ten worst stretches by place (the tile whose ring contains them, the arc
   and its `skelId · side · segOrd`; ⛔ never "nearest street").
   *Before reporting a defect:* is it the authoring's intended output? A walk the operator widened onto a slope is
   still his walk.
3. **Where does the walk's height come from today?** For one of HPDM's worst stretches, trace a vertex from the paint
   to its rendered y: what the conformed mesh holds, and what the runtime adds. Say whether the tilt is the terrain
   itself, the mesh's coarseness (`triangulateAndRefine`'s max edge), or both. Cause measured, or "cause not
   established".
4. **The kerb, re-read in this light.** Confirm §9's 266 and where they sit. Then answer the first question Jacob's
   ruling raised: **is each ramp, flare and taper outline already a piece of the painted partition (derived through
   ① → ② → the bands), or only a record that `kerbLift.mjs` turns into a cut afterwards?**
   Name the producer of each outline (`kerbLift.mjs` today) and whether it could be emitted as partition pieces instead.
5. **Who else reads a ground height** (trees, buildings, lamps, the revetment, the shore band, labels): list each and
   what it samples (the field, or the drawn mesh). The deformer changes the drawn ground, and every one of
   these must still sit on it.

6. **The shore: test the thesis, don't hunt holes** (§0(c)). Measure whether the waterline has one shape source or
   two (the coast chain in ① vs the shore median's lidar trace: the distance between them along every shore, per town),
   and whether the jags sit where the 2D edges place vertices on the 5 m terrain (per-vertex render sampling). Fix the gap
   walk's camera first, so it never lands under the far bank (derive its standoff from the local water width, never the
   20 m constant). Re-run it for a true baseline, then say whether the ~1417–1430 crack cluster survives on the fixed
   instrument.

Report counts per town, plus screenshots of HPDM's worst stretch from the street camera, then **STOP**.


---

§0(c)'s two bullets on the drape and the cracks, superseded by §4.3 and §4.6 the same day:

- The ground is pressed flat into the 2D partition at bake and lifted per VERTEX at render from the 5 m terrain texture
  (`terrainShader.js#patchTerrain`, perVertex). The extrusion happens LAST and samples the terrain only where the 2D
  edges happen to put vertices. The bed raster is the same 5 m grid.
- The cracks: Huron's biggest "hole" (9,212 px at −2386, −2008) is the INSTRUMENT. The gap walk's near-from-water camera
  sits 20 m out along the normal, which on a ~12 m channel puts it under the far bank. One real crack cluster (~785
  px/station near 1417–1430, −320…−326): two thin lines along the shoreline where rays pass under a `face:beach` drawn at
  ~0.31 m, with open edges on `mat:shore` nearby. Down-facing triangles and T-junctions are ruled out; the mechanism is not
  established.

