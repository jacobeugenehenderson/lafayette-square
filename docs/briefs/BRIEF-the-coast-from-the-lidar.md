# BRIEF — the coast is drawn from the lidar: where the land meets high water

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
written: 2026-10-13
evict-when: RULING: Jacob passes Huron's and Provincetown's shorelines by eye at street level (smooth where land meets water, no jags, no cracks), each re-poured once from the lidar coast; scratch/ground-height/shore-sources.mjs reads the lidar waterline ON the ① coast chain, and gusset.mjs's open stations are 0 on both towns.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.** You take the
shore over from Swale, who built the deformer and the kerb and stays on the deformer's speed-up. **Report to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each against the code and say what you
found. If the code contradicts this brief, stop and flag Boz before building.

## 1. What Jacob ruled (2026-10-11; go 2026-10-12)

*"I think it meets high-tide and from high tide to low tide is the gusset shape?"* · *"Can we compute the whole sheet
for the lidar and find the actual moment of intersection with the shoreline/low-tide line and then discard the sheet?"*
· *"The lake town still has a gusset."* · On doing it: *"OK."*

⇒ **The coast line is where the lidar surface meets the HIGH-WATER level:** the town's datum where tidal (MHW by
default), the authored lake level on a lake. Its height IS that level. The gusset is the bank from there down to
low water. *2026-10-13, Huron, flown 9 cm above its authored level: "yes"* ⇒ where the water as flown stands above high
at one level, the line is that water's edge and the gap is the gusset. One rule on a tidal town too, said in words
(Boz). ▶ `checks/claims-the-coast-is-the-lidar-at-high-water.mjs` A2. The sheet that finds the intersection is discarded once it has: one outline, from the lidar. The full
ruling and its measured table are in `BRIEF-the-ground-knows-its-height` §5 ("The shore: RULED"). Read it there; it is
not restated here.

## 2. What is true today (read by Swale and Boz, 2026-10-12/13; confirm)

- **① traces OSM's coast, not the lidar's.** On the served slabs, Huron has 8.5% of the drawn coast under its lake
  level, and Provincetown has 66.7% under MHW. ▶ `scratch/ground-height/shore-sources.mjs`.
- **The datum is found FROM the line you are moving.** `bake-terrain`'s `waterDatum` finds the water from the OSM
  coast (`coastline.mjs#coastRings`), and the pour reads no terrain (ground brief §4.1). ⇒ Moving ①'s coast onto the
  lidar puts the lidar and the water levels UPSTREAM of ①, and **the datum must not depend on the line it moves.**
  **Where the intersection is computed is your first design question, and it is not designed for you.**
- **Already landed, so build on it:**
  - a coast run's `h` is the line (`waterLevels().lineAt`; a drawn coast with no water record throws) (c227acaf);
  - `gusset.mjs` reads the baked terrain part (00c76119).
- **Also yours, after (a): the water-side half** (ground brief State, "Next" 1): the gusset record the fill reads.
  Then **(d)'s render** (State, "Next" 3).
  Boz's suggested order is (a) first, because the water side is built on the line (a) moves. Confirm or contest that in
  your first report.

## 3. The work

1. **Route and confirm.** Read `CLAUDE.md` (Layer 0), `ORIENTATION.md`, `README §START HERE`, the ground brief's State
   block and §4–§5, then the code sites: `coastline.mjs`, `bake-terrain`'s `waterDatum`,
   `waterLevel.mjs`, and the skeleton's coast source.
2. **The design, to Boz before building:** where the intersection is computed, what it replaces (the OSM coast as ①'s
   coast source), how the datum stays independent of the line, and
   what it does on a town with no lidar or no water record. ⛔ It throws, by name. Never fall back to OSM.
3. **Build it, in three parts** (`CLAUDE.md`):
   - the old path is deleted in the same commit;
   - the commit names its register;
   - superseded text goes to `cartograph/_archive/`.

   Add a check that reads the source and is seen RED first, then mutation-tested.
4. **Measure** on Huron and Provincetown with scratch pours and bakes:
   - the share of the drawn coast under high water;
   - the lidar waterline's distance off the ① coast chain;
   - the gusset's open stations.

   All before and after.

## 4. Bounds

- ⛔ **No served bake, Publish, Promote or Stage.** A real re-pour or re-skeleton of Huron or Provincetown is Jacob's
  go, through Boz. Scratch pours are fine. LS is HELD: don't touch its data.
- ⛔ **The machine is shared, and one heavy job runs at a time.** Before any run over a few minutes: `uptime` load < 8
  and `memory_pressure` free ≥ 40%. Ask Boz for the slot.
- ⛔ **`cartograph/groundDeformer.mjs` is Swale's** (the rest of the freeze lifted, Boz 2026-10-13). A change there
  is staged in `scratch/` and loaded with the in-memory swap (`scratch/kerb-cut/swap.mjs` + `SWAP_MAP`).
- Commit by pathspec only (`git commit -- <paths>`), and check each commit's name-status. Other sessions have
  uncommitted files in the tree; never `git add -A`.
- Write "cause not established" for anything you did not measure.

## 5. Done when

Jacob passes both shorelines by eye at street level after one re-pour each. `shore-sources.mjs` reads the lidar
waterline on the ① coast, `gusset.mjs` has 0 open stations on both towns, and every new check is green after being seen
red.
