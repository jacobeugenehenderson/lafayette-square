# BRIEF — Live building palette, for every town

**For:** a fresh agent, in the kit. **Written:** 2026-09-27 (Warden, from Mortise's analysis).
**Ruled by Jacob, 2026-09-27:** *"live retint for every town."*
**Unblocks:** the last hand-assembly — Stage-on-Lafayette-Square — joining `Town`
(`BRIEF-one-town-assembly.md`), and the deletion of the legacy live-building path.

## 1. Why
Stage-on-Lafayette-Square drew buildings through the legacy live path (`LafayetteScene`'s
`Building`/`Foundations`), so the palette sliders recoloured instantly. Every other town draws
`SlabBuildings`, whose colours are baked into the vertices, so its palette shows only after a bake.
One assembly means one building path, and Jacob chose live retint for all.

## 2. Premises — confirm, and say what you found
1. **The bake decides each building's wall tint by precedence** (`cartograph/bake-buildings.js`):
   override colour (building overrides) → the wall material's palette (`design.wallPalettes[wallMat]`) →
   the base `buildingPalette`, indexed `hashStr(id) % length` → legacy `b.color`. It then **derives** the
   slate/metal roof tint (`roofTintFor`) and the night colour (an HSL shift). All three go into
   per-vertex attributes (`color`, `aNightColor`).
2. **The client cannot recompute this alone**: it cannot tell an override colour from a palette pick,
   nor which palette a building drew from.
3. **The per-building index already carries each building's vertex ranges** (`buildings.json` v2 §6.3).

## 3. The work
- **The bake records each building's tint SOURCE** in the index — `{ fixed: <hex> }` or
  `{ palette: 'base' | <wallMat>, slot }`. That is a **slab-contract change: `buildings.json` v2 → v3**,
  and the consumer refuses v2 (`SLAB-CONTRACT.md` §0, §10.3). Rewrite §6 for v3 — don't amend.
- **The tint rules move into ONE shared module** — `hashStr`, the palette pick, `roofTintFor`, the night
  shift — imported by both the bake and `SlabBuildings`, so the two can never drift.
- **On a live palette change** (`Town`'s `overrides.buildingPalette`, and wall palettes), `SlabBuildings`
  rewrites `color` and `aNightColor` over each building's vertex ranges. CPU, no shader change.
  **Fixed (override) colours never move.**
- **Then Stage-on-Lafayette-Square migrates onto `Town`**, and in the same commit the legacy
  live-building path (`LafayetteScene`'s `Building`/`Foundations`/`loadBuildingTextures`) is **deleted**.
  ⚠️ `src/toy/ToyBuildings.jsx` imports those too — sequence with the Toy removal, or remove Toy's use.

## 4. Deploy sequencing — the part that is not code
A v3 consumer refuses v2 slabs, so **every live town must be re-baked and republished to v3 before the
consumer ships** — Lafayette Square, Provincetown (mid-launch), and the rest. Write the order down and
check it; never ship a consumer that blanks a town's buildings.

## 5. Checks — each seen to fail first
- **Live recolour equals a re-bake**, byte for byte on the colour attributes, on two towns.
- **A palette drag never moves an override colour.**
- **The bake and the player share one tint module** — no second copy of the precedence anywhere.
- `claims-every-app-mounts-the-town` turns green when Stage-on-LS joins.

## 6. Docs
`SLAB-CONTRACT.md` §6 rewritten for v3. `cartograph/FEATURES.md` (Stage): "the building palette recolours
live, in every town." Remove Stage's card note that says a bake is needed.
