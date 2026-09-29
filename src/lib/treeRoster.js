/**
 * treeRoster — which tree variants a town draws: the set its atlas was BUILT for.
 *
 * `arborist/bake-look.js` writes it into the slab as `trees-atlas.json#roster` — the selection,
 * the ONE set bake-trees places from and the Salon captures for (Jacob, 2026-08-25). The runtime
 * used to read `design.json#trees` instead: an authoring file the player cannot fetch (inside The
 * Ward that fetch 404ed and every tree switched off), and not the set the atlas has rects for.
 *
 * ⛔ No roster is an error, never "draw everything" or "draw nothing": a bake from before the field
 * existed must be re-baked, and saying so is the only honest answer.
 */
export function rosterOf(manifest, lookName) {
  const r = manifest?.roster
  if (!Array.isArray(r) || r.length === 0) {
    throw new Error(`[treeRoster] "${lookName}": trees-atlas.json carries no roster — re-bake the look `
      + `(node arborist/bake-look.js --look ${lookName}), then publish its slab.`)
  }
  const keys = new Set()
  for (const v of r) {
    if (!v?.species || v.variantId == null) {
      throw new Error(`[treeRoster] "${lookName}": trees-atlas.json#roster holds ${JSON.stringify(v)} — every entry needs species and variantId. Re-bake the look.`)
    }
    keys.add(`${v.species}:${v.variantId}`)
  }
  return keys
}
