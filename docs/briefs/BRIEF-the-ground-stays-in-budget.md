# BRIEF — the ground stays inside today's budget: no town's slab or bake grows from here

<!-- BRIEF-STATE
status: OPEN
dispatched: step 7 — (Jacob, FRESH), 2026-10-20 night
written: 2026-10-13
evict-when: RULING: Jacob passes a deformed ground at street level on Huron and Provincetown, at a slab size and a ground-bake time no larger than each town's served one, and a check that reads the served sizes and times refuses any scratch bake that grows them.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.** **Report to
Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each one against the code and say what you
found. If the code contradicts this brief, stop and flag Boz before building.

## 1. What Jacob ruled

- **2026-10-13:** *"Big slab = bad"* · *"we are already at the limit and anything that spikes sizes or times from here
  is not going to work."* ⇒ Each town's served slab and served ground-bake time are the ceiling. The deformer
  (`BRIEF-the-ground-knows-its-height`) has to fit under it; the ceiling doesn't move to fit the deformer.
- **2026-10-15, refined:** *"There is no real size rule. However, given that it's never been 'lightweight' it stands to
  reason that growing in size is going the wrong direction. However, the aim is to get fast, smooth action so that's
  how we should think about it."* ⇒ The measure is fast, smooth action: what loads before the town shows, and long
  frames in motion. Total bytes growing is a warning to report, not a hard gate.
- **2026-10-15, the height map (§3 step 5):** *"LU block openings can be averaged to 5m, but where lots encounter
  streets and sidewalks meet the main (5m avg lidar) lawns/LUs, we need this finer detail … perhaps this 'optimized
  terrain map' could be the SSoT for all of these things."*

## 2. Where it stands (re-read the record; ⛔ never copy a number from it into this file)

- **Served:** the ground slab is `public/baked/<town>/ground.bin`; the bake time is
  `cartograph/data/<town>/clean/bake-timings.json` `<town>:ground`.
- **Step 1 landed:** `checks/claims-the-ground-stays-in-budget.mjs` (55e80e5c; the time ceiling is ground + ground-shore,
  f8e35108).
- **Steps 2–4 are in progress in the record, not here:** `git log --grep='Ground budget'`. The deformer's triangle sweep
  is c1726d21's message; the option set across HPDM and Huron is 17405943 and 55cf53ab; the accuracy pass is
  b433ddeb and bcc51c5b; the chunked-ground loads are ee72057a. Swale's land-use stamp write-up (02da626e) is the pour
  fix, and its `src` is uncommitted in `.claude/worktrees/rings-only` (branch `swale/flatten-paths-r1`).
- **Your first report says where steps 2–4 actually stand**, read from those commits, and what is left of each.

## 3. The work

1. ✅ **The check** (§2).
2. **Measure accuracy**, per Cairn's sweep setting: the drawn ground's vertical error against the deformer's `heightAt`
   on the ped bands (p50/p99/max), on Huron. The sweep's knobs are in `scratch/huron-cost/conform-alone.mjs`.
3. **Find the bytes.** Say what each field of today's `ground.bin` costs per triangle, and which ones are new since
   10-11.
4. **Bring Boz the options that fit**, each with its size, time and error. Include anything that gets there by a
   different route than fewer triangles (layout, where the refinement goes). Step 5 is one such route.
   - ⛔ Design choices go to Boz, then Jacob, before building.
   - ⛔ A tolerance or floor that merely happens to fit Huron is a Class D constant (`CLAUDE.md` Layer 0). The fix
     derives from the town.
5. ✅ **The height map, measured** (Loess, abfd78ac, `scratch/ground-budget/heightmap/`). Jacob ruled its three
   takeaways on 2026-10-15: a 1 m band at the shore only (`BRIEF-the-shore-keeps-its-lidar`); the coarse grid is the true
   mean of the 1 m lidar (eb5aa261); streets and lots keep the deformer's profile.
6. ✅ **The simplifier, prototyped offline** (Jacob, 2026-10-16/17; `d1c2c54c` + `0f644469`, `scratch/ground-budget/simplify/`):
   half-edge collapse under a bound derived from the slab's own `refineTol`, group seams locked, no new folds. Measured on
   HPDM's 10-14 gate slab (before the pour fix) at ×1: triangles 2,561,327 → 1,123,753 · ground.bin 79.96 → 39.70 MB ·
   T-junctions 0 → 0 · walk gate +66 stations against HEAD · 11 min, 3.04 GB peak. It does not reach the served size;
   Phase 2 (seam agreement) is probed, not built. Step 6's full text: `cartograph/_archive/BRIEF-ground-budget-step6-RETIRED-2026-10-20.md`.
7. **Into the bake, and the road on its own policy** (Jacob, 2026-10-20 night: *"yes"* to both, then *"option 1"* for the road).
   Why: tonight's Huron bake was stopped before it wrote. Of Huron's growth from the served slab (1.24M) to the 7.8 mm slab
   (3.76M), the ped bands are +2.27M (sidewalk +1.65M, treelawn +0.54M) and the road +0.10M (Zob, measured per group
   from `ground.json`; the script is in Zob's session scratchpad, so re-derive it). Since `6fe30a8a` (10-17) today's code
   also puts the road on the fine policy, and no slab on disk has measured what that costs.
   - **(a) The simplifier moves into `cartograph/bake-ground.js`, after conformity**, from the step 6 prototype: same
     derivation of the bound, group seams locked, the attributes BakedGround reads (`aRaw`, `aGrad`, the rest named in
     ground.json) kept. ⛔ A bound that merely fits one town is Class D. The scratch prototype retires in the same commit
     (fix in three parts, `CLAUDE.md`).
   - **(b) The road splits.** `asphalt` and `highway` go back to the lots' policy (`GROUND_REFINE_TOL_M`,
     `GROUND_REFINE_MIN_EDGE_M`); `stripe` keeps the fine one (the ped `refineTol`, floor `stationM`), because
     `claims-the-stripe-lies-on-its-road` gates each stripe against a lift of millimetres and samples edge midpoints
     (`6fe30a8a`'s measured reason). Site: the refine-policy branch of `bakeGround` (`PED_KEYS || ROAD_KEYS`).
     Conformity welds a fine stripe or curb beside coarse asphalt with red-green closures and throws on any T-junction
     left (Zob, read in source, `groundConformity.js#conformAndRefine`), so the seam needs no new code.
     ⚠️ Whether the road deserves a road-derived tolerance at all is unruled: there is no road norm to derive it from.
   - **(c) Measure on scratch slabs, HPDM first** (HPDM draws stripes; Huron draws none), then Huron. Three slabs each:
     today's code (road all fine) · (b) alone · (a)+(b). Per slab: triangles per group, `ground.bin` bytes, the ground bake
     time, `claims-the-walk-is-level-across`, `claims-the-stripe-lies-on-its-road`,
     `claims-the-road-meets-itself-across-its-centreline`, T-junctions, `claims-ground-refinement-does-not-breed-slivers`.
   - Bring Boz the table and stop. The batch bake (this, plus `BRIEF-perpendicular-leg-ownership`'s build, then ONE Huron
     bake) is Boz's to run after Jacob's go.

## 4. Bounds

- ⛔ **No served bake, Publish, Promote or Stage.** Scratch slabs only. LS is HELD.
- ⛔ **One heavy job at a time.** Ask Boz for the machine. Check load < 8 and `memory_pressure` free ≥ 40%, and pass
  `--max-old-space-size` explicitly. Jacob works on this machine (After Effects, InDesign); free memory runs near 30%
  in the day. A run that does not fit waits for the evening.
- Don't edit `cartograph/groundDeformer.mjs` on main. A bounded memo is pending on `tern/coast-from-lidar` (b45f76a1),
  so stage any copy in `scratch/` (`scratch/kerb-cut/swap.mjs` + `SWAP_MAP`).
- Lidar reads are HTTP range requests, as `bake-terrain.js` does them. Download nothing whole.
- Commit by pathspec only. Write "cause not established" for anything you didn't measure.

## 5. Done when

Jacob passes Huron and Provincetown at street level, at fast, smooth action within each town's served size and time.
The budget check is green on them after being seen red.
