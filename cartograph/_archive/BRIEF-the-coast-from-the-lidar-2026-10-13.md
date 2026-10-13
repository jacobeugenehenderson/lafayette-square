# BRIEF-the-coast-from-the-lidar — superseded text, 2026-10-13

Moved from `docs/briefs/BRIEF-the-coast-from-the-lidar.md` (live home) by Tern when the water as flown became the line
on Huron (Jacob: "yes", relayed by Boz 2026-10-13), and the deformer freeze lifted for every file but
`groundDeformer.mjs` (Boz, 2026-10-13).

## §1, the line's height, before the Huron ruling

default), the authored lake level on a lake. Its height IS that level. The gusset is the bank from there down to
low water.

## §2, already landed, before `lineAt`

  - a coast run's `h` is high water (`waterLevels().highAt`; a drawn coast with no water record throws) (c227acaf);

## §4, the freeze, before it lifted

- ⛔ **Don't edit these in the working tree until Boz says Cairn's triangle-size sweep is done:**
  `cartograph/groundDeformer.mjs`, `cartograph/groundConformity.js`, terrainLoad, `cartograph/waterLevel.mjs`. The sweep
  imports them live and refuses if they change. Swale's speed-up also lands in `groundDeformer.mjs` after the sweep.
  - If you need a change there sooner, stage a copy in `scratch/` and load it with the in-memory swap
    (`scratch/kerb-cut/swap.mjs` + `SWAP_MAP`; see `scratch/ground-height/shore-today/run.sh`).
