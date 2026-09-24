// Pure: no imports, so a check can run it in Node. The loader lives in publishedLayer.js.

/**
 * Lay the layer over a listings array. Pure: returns a new array, never mutates. A listing the layer
 * marks `closed` leaves; edited fields replace the listing's own; a layer entry for an id the town
 * does not have is ignored (it can only be a listing since removed from the base).
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
  return out
}
