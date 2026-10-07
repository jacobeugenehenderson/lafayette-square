<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: every poured town bakes its surveyed lamps plus a derived fill, each lamp stamped with its source; the spacing and street selection come from the towns' own data, never one street's; Provincetown and Huron have lamps; and Jacob has seen both at night.
-->

# Street lamps: real where real, derived where necessary

**You are the dispatched agent. Name yourself: one word, not a name another RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

*"I want to make sure we have streetlamps in PTown … Huron is correctly surfaced with the rowcrops and
streetlamps."* **Go on the streetlamp brief.**

## ⭐ Already ruled. Read it; don't re-ask it

`ROADMAP H-17` holds the whole record. Read it end to end before anything else.
- ✅ **Jacob, 2026-09-21: "real where real, extrapolated where necessary", one rule for lamps and trees.**
- ⭐ **Copy the tree pattern; don't invent one.** Two wells with provenance stamped per item (`osm` real,
  `derived` fill: `arborist/bake-trees.js#SOURCE_BY_BASENAME`), cross-well dedup keeps the richest record,
  **surveyed is nudged and invented is dropped** on illegal ground, and invented items dissolve toward the rim.
  ⇒ The deliverable is a **`derived_lamps.json` producer plus the same provenance contract**.
- ✅ **Jacob, 2026-09-21, on how the open numbers get answered:** *"This is a heuristic concern; we need to avail
  ourselves to the data and think it through."* ⛔ Don't pick a spacing, and don't ask him to pick one. Derive it
  from the `highway=street_lamp` population across **every** scene on disk. ⛔ Not Huron's 18 m: that's one
  person mapping one street.

## What is on disk (measured by Boz 2026-09-26; re-run it, don't quote it)

- Baked lamps: **Provincetown 0, Huron 0** (`public/baked/<look>/lamps.json#count`).
- Surveyed lamps in `raw/osm.json#pois` (`tags.highway === 'street_lamp'`): **Provincetown 1, Huron 30**
  (one 431 m street), HiPointe and LS 0 (both have no `pois` at all; they were fetched before the node-tag
  intake). LS's hundreds come from a hand-made `raw/osm_street_lamps.json` that nothing in the kit writes.
- ⇒ **Derivation is what lights a town.** The surveyed lamps are a seed, not a census.

## The steps

1. **Wire the surveyed well.** `cartograph/bake-lamps.js#loadLampsForMap` reads only `raw/osm_street_lamps.json`.
   Make it read `raw/osm.json#pois` street lamps, projected through `geography.json` as the existing path does.
2. **Measure the population, then propose.** Using every scene's surveyed lamps (and LS's municipal file as
   real data, clearly labelled as one city's import): spacing by road class, which classes get lamps at all,
   which side of the street, and the setback from the curb. **Report it to Jacob with a proposal before
   building the producer.** Name what the data can't answer.
3. **Build the derived producer** along the street graph, on legal ground (the sidewalk or tree lawn, never
   the roadway or a driveway), with the tree pattern's dedup, nudge/drop and dissolve.
4. **The override is the product.** Say where an operator adds, moves or removes a lamp (`cartograph/BACKLOG.md`,
   *"Lamp-placement authoring (queued)"*). Propose the surface; don't build it unasked.

## Fix on the way (same file, both Layer 0)

- **The silent flat-ground fallback** (found by Plumb): `anchorLampsToGround` uses
  `loadSceneTerrain(scene) || { getElevationRaw: () => 0 }`. A hilly town missing its terrain would bake every
  lamp at 0 with no warning. Make it **fail loudly** unless the town is declared flat. (`bake-tree-anchors` has
  the same fallback; fix both, and say so.)
- **Altadena shows LS's 80 park lamps** (Plumb, 2026-09-26: an exact position match with `cartograph/data/lafayette-square/authored_lamps.json`,
  all anchored at 0). Find how they got there. The code's own guard says that file is read only for
  lafayette-square. Report it; `BRIEF-ls-bleed-excision.md` site 1 is the home.

## Can the instrument see it?

- A check per town: lamps baked > 0 wherever the street graph has lit road classes, and every lamp stamped
  `osm` | `derived` | `authored`. Mutation: drop the derived well.
- No derived lamp stands on the roadway or inside a building.
- ▶ `claims-anchors-know-their-terrain` stays green.
- Then Jacob's eye: Provincetown and Huron in Stage at night.

## Bounds

- Write: `cartograph/bake-lamps.js`, a derived-lamp producer beside it, `bake-tree-anchors` (the fallback only),
  and the checks. The runtime (`src/components/StreetLights.jsx`) only if the stamp needs it.
- No bake or pour without Jacob's go in your own window. LS is not re-poured (standing ruling); a lamp-only bake
  of LS needs his explicit go.
- Commit only your own paths (`git commit -- <paths>`); the working tree is shared.
- Canon: `ROADMAP H-17` (close what lands), `cartograph/BAKE.md` (the lamp wells), `OPERATIONS` (the knobs),
  `FEATURES` (towns get street lamps). Commit messages name the register reached.

**The instruction is confirm-then-build:** measure, tell Jacob what you found and your proposal, then build. If
the code contradicts this brief, stop and flag him.
