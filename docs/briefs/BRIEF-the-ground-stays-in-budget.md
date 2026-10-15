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
5. **The height map: one terrain record, fine where things meet, coarse in the open. READ-ONLY; measure, build
   nothing.**
   - **Today:** `cartograph/bake-terrain.js` range-reads each town's 1 m lidar and writes one uniform grid. The grid
     step is read off `terrain.json` (`bounds` ÷ (`width` − 1)); ▶ re-derive it per town. Fine detail near the lines
     is meant to come from the deformer (`cartograph/lineHeight.mjs#lineHeights` → `cartograph/groundDeformer.mjs#buildDeformer`),
     and it lands in the mesh as triangles. That is the budget breach (§2). The one precedent for keeping lidar
     where it matters is `bake-terrain.js#rockCells` (the lidar's rock kept under mapped breakwaters). Readers of
     ground height in the player: `src/lib/drawnGround.js#makeDrawnGround` (the shore band and the revetment read it).
   - **The idea:** one height record that is fine (the lidar's 1 m) in bands where things meet (each side of ①
     along streets, lot and land-use edges behind the walk, and the shore's gusset) and the coarse grid everywhere
     else. The ground, the walks, the shore, the revetment, boulders and trees all read their height from it.
   - **Three measurements, on HPDM, Huron and Provincetown:**
     a. **Where the detail is.** The difference between the 1 m lidar and the served coarse grid: what share of it
        (by area, and by the cells over a threshold you derive and state) falls inside those bands, versus in the
        open interiors. ⛔ Band widths are derived from the scene (the deformer's own blend distance, the gusset's
        extent), never typed in. The mounds behind HPDM's walks (`BRIEF-the-ground-knows-its-height` §4 item 7,
        `scratch/ground-height/mounds.mjs`) are the known case to reproduce.
     b. **What the map costs.** Bytes for the mixed map per town, beside the served `terrain.bin` and beside the
        deformer's triangle cost from the record.
     c. **What the mesh still needs.** The ground only shows height where it has vertices. Count the extra vertices
        the bands need for the kerb step and the shore's bank to show at the close camera (judge there, not from
        far; memory `feedback_build_for_close_inspection_not_for_distance`).
   - **What this trusts:** ① and the partition (`shape.json` runs; `SKELETON`, `RIBBONS §1`), and the shore ruling
     (`BRIEF-the-ground-knows-its-height` §5, "The shore: RULED"). **What trusts this:** the deformer, the walks'
     levels, the shore's gusset, and next the revetment. The revetment's bed would come from this map (Jacob,
     2026-10-15: the revetment becomes a stamped land use, a riprap surface in `cartograph/surfaces.mjs` and placed
     boulders, with no bed built in the browser; its brief waits on this step and on the pour fix).
   - **Bring Boz the three numbers per town and stop.** Whether this becomes the SSoT is Jacob's ruling.

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
