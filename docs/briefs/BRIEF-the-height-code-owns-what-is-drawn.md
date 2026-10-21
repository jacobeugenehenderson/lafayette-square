# BRIEF — the height code owns what is drawn: three fixes in `groundDeformer.mjs`

<!-- BRIEF-STATE
status: OPEN
dispatched: Mitre (WARM), Jacob 2026-10-20 night ("yes, brief Mitre; Tern's fix tonight too")
written: 2026-10-20
evict-when: HPDM's and LS's ground bakes pass the deformer with 0 unowned ped vertices and no rim refusal, the mutants below each go RED, and the build is merged to integration; then this moves to cartograph/_archive/ dated.
-->

**Agent: WARM → Mitre** (you carried the leg owner through the band pieces in 3a55accb; this carries it one stage
further). **Report to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim (Zob's, read in source and measured, 2026-10-20 night).
Check each against the code and say what you found. If the code contradicts this brief, stop and flag Boz.

## 0. Why

After Truss's flatten noding (`BRIEF-the-stamp-lands-on-the-lattice` §3b), both Thursday towns stop in the height code,
which `BRIEF-the-ground-knows-its-height` installed 10-11 → 10-17:
- **HPDM:** `bakeGround`'s `terrainPart` throws *"2426 ped vertex(es) lie in a drawn band that NO painted band owns"*
  (`groundDeformer.mjs#resolveUncached`: a point in a painted ped band (`inBand`) that no ② span's inward ray holds).
  Zob placed them (Kerf's log, `.claude/worktrees/kerf/scratch/ground-budget/step7/slabs/hipointedemun-today/bake.log`):
  **1,559 inside perpendicular legs' ENVELOPE extensions** (831 inside WALK extensions), mostly beside link roads; the
  **~867 rest** along ordinary streets (waterman-avenue-2, clayton-road-2 …), ~470–500 of which predate tonight
  (`scratch/ground-budget/hpdm-gate/*.log`, "unowned refusal suppressed").
- **LS:** `groundDeformer: ⛔ lafayette-square: the ② edge from (194.440, -1113.157) has no height — its run __boundary__
  … carries no line (rim)`. The edge is 1,118 m from centre, outside the 892 m disc, on the FETCH RECTANGLE's edge: ①'s
  blocks run to the frame, the deformer carries `iaFull` (② uncut), and LS's frame sits tight to its disc.

## 1. The three fixes (Jacob, 2026-10-20 night: all three, tonight)

1. **A leg's extension is owned by its leg.** The extension is ground past the leg's tangent, so no station's normal ray
   reaches it, and the corner arc carries no band at a perpendicular corner. Carry the leg owner your build already
   carries (`runs[stamps[p.si][i]]`) into the deformer's band ownership: a point in leg L's extension takes L's profile,
   along L's own normal at its tangent station. ⛔ Never by distance, never a nearer-line fallback (A15; "the band
   decides, never the nearer line", 6be9cbaf). Sites: `resolveUncached`'s owner loop and `inBand`. Say how the extension
   rings reach the deformer (shape / pr / a new field), and keep it one source.
2. **A frame edge outside the drawing has no height to give.** In `buildDeformer`'s ring loop, an edge whose owner is
   `__boundary__` and which lies WHOLLY OUTSIDE the stencil (`disc`, already passed in) is not part of the drawing: it
   gets no height and leaves the nearest-span search. ⛔ A `__boundary__` edge INSIDE the disc still REFUSES (the frame
   must contain the disc; `checks/claims-the-disc-stays-inside-the-bb.mjs`). No rim-height rule, no fallback.
3. **Tern's window: chain each crossing from the PREVIOUS one.** `bandsAlong` groups crossings within one lattice of the
   group's FIRST crossing (`pending[0].t - t0 <= LATTICE`), so a sub-lattice gap between two band pieces reads 'lot'
   (Tern's forensic, Huron fox-road). Jacob ruled tonight: chain the window. Bring Tern's check onto your branch from
   `tern/coast-from-lidar` (`a43e8a9a`: `checks/claims-the-ray-reads-the-bands-the-point-test-reads.mjs` + its fixture
   `checks/fixtures/deformer-ray-huron-t20.json`; its `--selftest` already proves the chained window turns it GREEN).
   ⛔ Bring only that check and fixture, never the rest of Tern's branch (33 commits, conflicts in six core files).

## 2. Mutants, each must go RED

1. The extension owner dropped → HPDM's extension points unowned again. 2. A `__boundary__` edge placed inside the disc →
refuses. 3. The window back to the first crossing → Tern's check RED. 4. A nearest-line fallback for an unowned point →
caught. Name the check that holds each (a new row in an existing check is fine; say which).

## 3. Gates

- Light first: measure the unowned count and the rim refusal with the deformer alone (Zob's probe pattern, scratchpad
  `uo/` and `unowned/`: tileGround on the affected blocks, then `buildDeformer` + the resolve loop), on HPDM and LS.
  Target: 0 unowned, no rim refusal. Name any residual by site and class; ⛔ don't suppress it.
- Then report and stop. The batch bake (Truss's noding + this + Kerf's step 7) is Boz's after Jacob's go.

## 4. Bounds

- Branch off `integration/2026-10-20` in a worktree under `.claude/worktrees/`; commit by pathspec; never push; Boz merges.
- ⛔ No served bake, Publish, Promote or Stage; never write any town's `clean/` or `public/baked/`.
- Heavy jobs one at a time: ask Boz for the slot (load < 8, free ≥ 40%, `--max-old-space-size` explicit).
- Measure before writing; an unmeasured mechanism is "cause not established". Surface scope drift; don't absorb it.
- Registers: `BRIEF-the-ground-knows-its-height`'s reference home for the deformer, or say "reaches no register".
