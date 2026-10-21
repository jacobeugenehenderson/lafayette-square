# BRIEF-the-ground-stays-in-budget §3 step 6 — retired 2026-10-20

*Diary. Cut by Boz, 2026-10-20 night: the prototype it dispatched landed (`d1c2c54c`, `0f644469`), and step 7 (into the bake) replaces it. Kept verbatim.*

6. **Simplify the fine ground after it is built** (Jacob, 2026-10-16). **It starts now, offline, on a finished slab**
   (Jacob, 2026-10-17). It needs no new bake, so it does not wait for the pour fix (`BRIEF-the-stamp-lands-on-the-lattice`).
   - **The input:** a finished deformer ground already on disk, read-only: HPDM's 10-14 HEAD gate slab,
     `.claude/worktrees/rings-only/scratch/ground-budget/flatten-r1/slabs/hipointedemun-HEAD/` (ground.bin + ground.json),
     beside the served `public/baked/hipointedemun/`. Confirm both exist and say what they hold before building. It
     predates the pour fix; that doesn't matter for a simplifier, but say so in every number.
   - **The premise to confirm:** the growth is the ped bands, refined to 7.8 mm (89% of HPDM's added triangles,
     17405943), not the open terrain. The precision of the band is the lever (c1726d21's sweep).
   - **The method:** merge triangles wherever the drawn surface (`aRaw × uExag + y`, `src/lib/drawnGround.js`) moves
     less than a bound, so flat walk collapses and the kerb steps and bends keep their vertices.
     - Group seams survive: a vertex on a seam between groups is never moved or removed unless both sides agree.
       Report T-junctions after (`cartograph/groundConformity.js#findTJunctions`); the target is 0.
     - The bound is derived from the town and judged at the close camera (memory
       `feedback_build_for_close_inspection_not_for_distance`), never a constant that fits HPDM. Sweep a few to show the
       curve, and say which derivation you propose.
     - Group ids, materials and the attributes BakedGround reads (`aRaw`, `aGrad` and the rest named in ground.json)
       survive.
   - **Measure** at each bound, beside the served and the unsimplified slabs: triangles, `ground.bin` bytes, the time
     simplification adds, and the walk's vertical error against the unsimplified surface (p50/p99/max). Use the walk
     gate (`checks/claims-the-walk-is-level-across.mjs`) if it reads a slab path.
   - **Write the best one as a scratch slab** (a copy of the input slab with the simplified ground) and say how Jacob
     can open it in the player without overwriting `public/baked/`. If no such route exists, propose the smallest one
     and stop; ⛔ don't copy over served files.
   - **Streaming** (ROADMAP H5; Brace's chunk study ee72057a, `scratch/ground-budget/stream/`) stays parked. It is the
     next step only if the simplified sizes still hurt on a phone. Browse sees the whole disc, so streaming alone does
     not shrink it.
   - The simplifier lands in the bake later (`cartograph/bake-ground.js`, after conformity). Prototype it in `scratch/`
     tonight; the move into the bake is Boz's and Jacob's call.
   - Bring Boz the numbers and stop.

