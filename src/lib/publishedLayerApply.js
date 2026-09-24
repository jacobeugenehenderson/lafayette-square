// Pure: no imports, so a check can run it in Node. The loader lives in publishedLayer.js.

/**
 * Lay the layer over a listings array. Pure: returns a new array, never mutates. A listing the layer
 * marks `closed` leaves; edited fields replace the listing's own; a layer entry for an id the town
 * does not have is ignored (it can only be a listing since removed from the base). A place the layer
 * ADDS joins the list unless the town already has its id, and takes its building from the synthetic
 * zoning listing (`_bare`) that stood in for it.
 */
export function applyPublishedLayer(listings, layer) {
  const edits = layer?.listings
  if (!edits) return listings
  const out = []
  for (const l of listings) {
    const e = edits[l.id]
    if (!e) { out.push(l); continue }
    if (e.closed) continue
    out.push({ ...l, ...e })
  }
  const have = new Set(out.map(l => l.id))
  const adds = Object.entries(layer.adds || {}).filter(([id]) => !have.has(id)).map(([id, a]) => ({ ...a, id }))
  if (!adds.length) return out
  const taken = new Set(adds.map(a => a.building_id).filter(Boolean))
  return [...out.filter(l => !(l._bare && taken.has(l.building_id))), ...adds]
}
