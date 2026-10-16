# BRIEF — the shore keeps its lidar: a 1 m height band along the coast, the one place the town's height is fine

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-15
evict-when: RULING: Jacob passes Huron's and Provincetown's shore at the close camera, from the street and from the water, with the band's height drawn, and a check that reads the lidar shows the band equals the 1 m mean within its stated tolerance and that no band cell is filled when the lidar is missing.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: WARM → Loess** if
Loess is still up. Loess measured the curves this brief rests on and holds the instrument. Otherwise FRESH. **Report
to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each one against the code and say what you
found. If the code contradicts this brief, stop and flag Boz. **⛔ Phase A ends in a stop. Nothing in Phase B starts
without Jacob's ruling.**

## 1. What Jacob ruled (2026-10-15)

- *"Perhaps this 'optimized terrain map' could be the SSoT for all of these things."* Loess measured it (abfd78ac,
  `scratch/ground-budget/heightmap/`), and Jacob ruled its three takeaways yes.
  **(1) The fine band is the shore only.** Streets and lots show no band, and the 1 m lidar does not see the kerb.
  (2) The coarse grid becomes the true mean of the 1 m lidar (Loess, in progress).
  (3) Streets and lots stay with the deformer's profile (`BRIEF-the-ground-knows-its-height` §5).
- **The revetment is ground** (same day): a stamped land use, a riprap surface (`cartograph/surfaces.mjs`), and
  boulders placed on it. **Its bed is this band.** The browser-built drape (`src/lib/revetmentDrape.js`, run from
  `src/components/SlabRevetment.jsx`) goes once this lands. That removal is the revetment's brief, not this one.

## 2. What is true today (read by Boz; confirm)

- **The coarse grid.** `cartograph/bake-terrain.js` → `public/baked/<look>/terrain.{json,bin}`, one uniform grid
  (step = `bounds` ÷ (`width` − 1); re-derive). The player reads it as one texture (`src/utils/terrainShader.js`,
  `makeTerrainTexture`, `TERRAIN_DISPLACE*`), and on the CPU through `src/lib/drawnGround.js#makeDrawnGround`.
- **Where the band is** (Loess, read-only, measured against the OVERVIEW grid; ⛔ re-measure, §3 A1):
  - Huron: the 1 m detail is large within ~2 m of the coast and falls to the land-use level by ~30 m inland and ~10 m
    over the water.
  - Provincetown: the concentration was resampling error (the overview grid), up to 1 m at the edge, gone by ~5 m.
    It may vanish once the grid is a true mean.
- **The gusset** (`cartograph/shoreGusset.mjs`, ⚠️ only on `tern/coast-from-lidar`, not on HEAD) records the bank from
  high water down to low water. Its `reachM` (Huron 5.00 m, Provincetown 115.23 m) does not match either town's
  curve. Cause not established.
- **The precedent for keeping lidar where it matters:** `bake-terrain.js#rockCells` (the lidar's rock kept under mapped
  breakwaters).
- **The ground only shows height where it has vertices.** Loess counted 154k 1 m cells over `refineTol` inside
  Huron's coast band.

## 3. The work

### Phase A — design and measure, then stop
1. **Re-measure the band on the true-mean grid**, once Loess's item 2 lands (scratch terrain). The band width is an
   OUTPUT of the distance curve, per town and per side (land, water), never typed in.
   - ⛔ If Provincetown's band vanishes, say so. That is a finding, not a failure.
2. **Propose where the band lives and how it is read.** It is one record, and every reader of shore height reads it:
   the ground's lift, `drawnGround`, the gusset, the revetment's boulders, and trees on the shore.
   ⛔ No reader keeps a copy.
   - Candidates to weigh: a second layer in the terrain artifact, or a sparse tiled record beside it.
   - Name what crosses the slab boundary in bytes (`SLAB-CONTRACT.md`).
3. **Cost it per town:**
   - bytes;
   - terrain bake time and peak memory;
   - the extra ground vertices the band needs to show at the close camera (memory
     `feedback_build_for_close_inspection_not_for_distance`);
   - what loads before the town shows.
   Fast, smooth action is the measure; growing bytes is a warning you report (memory
   `project_served_slab_and_bake_time_are_the_ceiling`).
4. **Stop and bring Boz:** the curves, the proposal, and the cost.

### Phase B — after Jacob's ruling
The check first: the band equals the 1 m mean within its stated tolerance; a cell with no lidar is its own counted
class and is never filled; seen RED, then mutation-tested. Then the bake, then the readers. Remove each reader's own
height path in the same commit it moves to the band.

## 4. The chain

- **Trusts:** the coast line (① coast runs in `shape.json`; the shore ruling, `BRIEF-the-ground-knows-its-height` §5),
  the true-mean grid (Loess's item 2), and the water levels (`terrain.json#water`).
- **Trusted by:** the revetment (stamp + surface + boulders), the gusset, the ground's lift at the shore, and the
  long-frame gate parked on `tern/revet-worker` (23a09cb5). That gate is reused when the revetment moves onto this band.
- **Sequenced after the pour fix** (`swale/flatten-paths-r1`, 02da626e) for anything that stamps the partition. Phase
  A does not stamp and can run before it.

## 5. Bounds

- ⛔ No served bake, Publish, Promote or Stage. Scratch only. LS is HELD.
- ⛔ One heavy job at a time; ask Boz for the machine. Load < 8, free ≥ 40%, explicit `--max-old-space-size`, and
  abort under 30%. Jacob works on this machine by day.
- Lidar by HTTP range request only, as `bake-terrain.js` reads it.
- Commit by pathspec. Write "cause not established" for anything not measured. The commit names the register it
  reaches, or says it reaches none.

## 6. Done when

Jacob passes both shores at the close camera, from the street and from the water. The band check is green after
being seen red.
