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

## 1. What Jacob ruled (2026-10-13)

*"Big slab = bad"* · *"the subtext is we are already at the limit and anything that spikes sizes or times from here is
not going to work."*

⇒ **Each town's served slab and its served ground-bake time are the ceiling.** The deformer
(`BRIEF-the-ground-knows-its-height`) has to fit under that ceiling. The ceiling doesn't move to fit the deformer.

## 2. What is true today (read by Boz; confirm)

- **Served:** the ground slab is `public/baked/<town>/ground.bin`; the bake time is `cartograph/data/<town>/clean/bake-timings.json`
  `<town>:ground`. Read both; ⛔ never copy a number into a doc.
- **The deformer, on Huron's dump** (Cairn's sweep, 2026-10-13, `scratch/huron-cost/conform-alone.mjs`, c1726d21's
  message):
  - triangles go from 1.24M served to 2.02M–3.74M, depending on the ped bands' floor and tolerance;
  - today's own setting with the raw sampler re-meshes to 1.28M.
  - The table is in that commit message.
- **The bytes per triangle grew**, from 20.74 B in the served 10-11 Huron slab to 30.72 B in a 10-12 scratch bake
  (`scratch/ground-height/shore-today/huron-coast/ground.*`). So even at today's triangle count the slab grows by
  about half. What was added to the layout: not established.
- **Time:** Huron's conformity takes 1,332 s with the speed-up (0ff948e1), and 2,618 s with the bounded memo on
  `tern/coast-from-lidar` (b45f76a1, not on main). The served ground step has a 300 s timeout (ROADMAP, bcf8fc4e).
- **Accuracy:** what each setting gives up against the deformer's own heights is NOT measured.

## 3. The work

1. **The check first.**
   - `checks/claims-the-ground-stays-in-budget.mjs` reads each town's served `ground.bin` bytes and `<town>:ground`
     time, and refuses a given scratch bake that exceeds either for that town.
   - It reads the source and never restates it.
   - See it RED on one of last night's scratch slabs, then mutation-test it.
2. **Measure accuracy**, per Cairn's sweep setting: the drawn ground's vertical error against the deformer's `heightAt`
   on the ped bands (p50/p99/max), on Huron. The sweep's knobs are in `conform-alone.mjs`.
3. **Find the bytes.** Say what each field of today's `ground.bin` costs per triangle, and which ones are new since
   10-11.
4. **Bring Boz the options that fit under the ceiling**, each with its size, time and error. Include anything that
   gets there by a different route than fewer triangles (layout, where the refinement goes).
   - ⛔ Design choices go to Boz, then Jacob, before building.
   - ⛔ A tolerance or floor that merely happens to fit Huron is a Class D constant (`CLAUDE.md` Layer 0). The fix
     derives from the town.

## 4. Bounds

- ⛔ **No served bake, Publish, Promote or Stage.** Scratch slabs only. LS is HELD.
- ⛔ **One heavy job at a time.** Ask Boz for the machine. Tern holds it for Provincetown first. Check load < 8 and
  `memory_pressure` free ≥ 40%, and pass `--max-old-space-size` explicitly.
- Don't edit `cartograph/groundDeformer.mjs` on main. Tern's bounded memo is pending there, so stage any copy in
  `scratch/` (`scratch/kerb-cut/swap.mjs` + `SWAP_MAP`).
- Commit by pathspec only. Write "cause not established" for anything you didn't measure.

## 5. Done when

Jacob passes Huron and Provincetown at street level, within each town's served size and time. The budget check is
green on them after being seen red.
