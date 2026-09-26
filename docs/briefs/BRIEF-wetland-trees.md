<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: a wetland that is forested in the source data carries its trees, a marsh does not, the reason a tree is refused is readable per point, and Jacob has eye-gated Provincetown.
-->

# Wetland trees — a swamp is a forest

**You are the dispatched agent. Name yourself — one word, yours, and NOT a name another RUNNING session
already holds.** Check with `ListAgents` before taking it. Then ask Jacob to `/rename` the session to it.
**Agent: FRESH** — Tally measured this, but a fix wants a clean read; Tally's report is your starting evidence.

## The ask

Jacob, 2026-09-26: Provincetown's trees are too sparse. Tally measured why (`checks/claims-every-tree-candidate-is-accounted-for.mjs`,
commit `90d33ad3` — ▶ re-run it, don't quote this): of Provincetown's ~42,900 candidates, **~48% are refused as
`lu:wetland`** and ~37% as `lu:beach`. Beach refusing trees is right. **Wetland is suspect**, and Jacob said yes
to fixing it.

## What is measured, and what is not

- `cartograph/lu-policy.mjs` `LU_POLICY.wetland = { ground: 'planted', with: ['phragmites'] }` — a wetland takes
  reeds, no census tree.
- `cartograph/derive.js` `OSM_TO_LU` maps **every** `natural:wetland` — whatever its `wetland=*` subtype — to
  `wetland` (grep `'natural:wetland': 'wetland'`).
- Tally, by point test: of the dropped trees, **3,429 stand in `wetland=swamp`**, which OSM defines as a
  **forested** wetland; and **~70% stand where no closed OSM natural/landuse way covers the point at all**.
  ⚠️ Not yet checked against multipolygon relations.
- ⛔ **Cause of the 70% NOT established.** Boz's reading, untested: land use is assigned per BLOCK (a face gets
  one class by an overlay vote), so a tree can be refused as "wetland" because its whole block was classed
  wetland off a polygon that covers only part of it. `ROADMAP` "Land use" records the containment-direction
  question (centroid-in-face vs face-in-polygon). **Measure this first.**

## The two questions, in order

1. **Why is each refused tree "wetland"?** Per refused point: the block's class, the OSM feature (and subtype)
   that won the block's vote, and whether that feature actually contains the point. Report the split.
2. **Which wetlands carry trees?** OSM's `wetland=*` subtypes already say it: `swamp` (and `mangrove`, `bog` with
   trees, per the wiki) is wooded; `marsh`, `reedbed`, `saltmarsh`, `tidalflat` are not. ⭐ Ask the tag — it is
   town #2-portable and needs no operator who has seen the marsh. ⛔ No per-town list, no Provincetown patch.

## Read first

- `cartograph/BAKE.md §4.5/§4.6` (the tree gates; a census is the union of its wells) and `cartograph/lu-policy.mjs`'s
  header (planted vs hard vs soft).
- `ROADMAP.md` "Land use" bullets (the `unknown` hijack and the containment direction) and `H-17` (surveyed is
  nudged, invented is dropped).
- `arborist/bake-trees.js` — the zone gate (`makeZoneTester`, `cartograph/forbidden-surface.mjs`).

## The chain

Upstream you trust: `raw/osm.json` (are subtypes and relations reaching it?) and the block classification in
`derive.js`. Downstream: `trees.json` → the frame rate (Column B). ⚠️ Letting swamp carry trees may add
thousands on Provincetown; report the count and the frame-rate question — Jacob decides.
⚠️ `LU_POLICY` is shared by every town, and changing the OSM→LU map moves every town's land use. Run the density
check on **every** town before and after and report each town's change.

## Can the instrument see it?

Tally's density check reads the bake's own counts. A change to `derive.js` needs a re-pour and a re-bake to show;
that is Jacob's go. Eye gate: Jacob, on Provincetown in Preview, scene recorded.

## Bounds

- Measurement first; stop and report to Jacob before any change.
- Then write in `cartograph/derive.js` and/or `cartograph/lu-policy.mjs`, plus a check. No bake or pour without Jacob's go.
- Canon: `BAKE.md §4.6` gets the rule; a `ROADMAP` line. Commit messages name the register reached.

**The instruction is confirm-then-build:** read the canon and the code, tell Jacob what you found, and if the code
contradicts this brief — stop and flag him.
