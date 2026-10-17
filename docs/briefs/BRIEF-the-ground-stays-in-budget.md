# BRIEF — the ground stays inside today's budget: no town's slab or bake grows from here

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
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
6. **Simplify the fine ground after it is built** (Jacob, 2026-10-16; queued behind the pour fix,
   `BRIEF-the-stamp-lands-on-the-lattice`, since no town's ground bakes on trunk until it lands).
   - **The premise to confirm:** the growth is the ped bands, refined to 7.8 mm (89% of HPDM's added triangles,
     17405943), not the open terrain. The precision of the band is the lever (c1726d21's sweep).
   - **The method:** bake fine, then merge triangles wherever the surface moves less than a bound, so flat walk
     collapses and the kerb steps and bends keep their vertices.
     - The shared edges between groups survive: the conformity pass still reports 0 T-junctions.
     - The bound is derived from the town and judged at the close camera (memory
       `feedback_build_for_close_inspection_not_for_distance`), never a constant that fits HPDM.
   - **Measure on HPDM, then Huron,** beside the served ground and the unsimplified one: triangles, `ground.bin` bytes,
     bake time (it adds to the bake, so report it), and the walk's vertical error against the fine bake (p50/p99/max).
   - **Streaming** (ROADMAP H5; Brace's chunk study ee72057a, `scratch/ground-budget/stream/`) stays parked. It is the
     next step only if the simplified sizes still hurt on a phone. Browse sees the whole disc, so streaming alone does
     not shrink it.
   - Bring Boz the numbers and stop.

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
