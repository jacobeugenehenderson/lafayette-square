/**
 * The published listings layer — a town's Host and staff edits, from operations.theward.online.
 *
 * ⭐ WHERE IT SITS. A town's listings are its bundled base (content/listings.json), then the Apps
 * Script sheet's rows (useInit#runInit), then THIS. Operations publishes only what it changed —
 * edited fields, and listings marked closed — to `${ASSET_BASE}live/<look>/listings.json`, beside
 * the slab and under the slab's own environment prefix, so staging and production each read their
 * own. Laid over the sheet on purpose: a Host's correction must beat a stale sheet copy, and a
 * claimed Place is already protected upstream (operations refuses Host edits to claimed listings).
 *
 * ⛔ ABSENCE IS NOT FAILURE, AND FAILURE IS NOT ABSENCE. A 404 means nothing has been published for
 * this town, and the listings stand as they are. Any other failure is reported loudly and the
 * listings still stand — the layer is a correction, never the only copy of a listing.
 */
import { ASSET_BASE } from './bakedUrl.js'

export const publishedLayerUrl = (look) => `${ASSET_BASE}live/${encodeURIComponent(look)}/listings.json`

export async function loadPublishedLayer(look) {
  let res
  try {
    res = await fetch(publishedLayerUrl(look), { cache: 'no-cache' })
  } catch (err) {
    console.error(`[published] could not reach the published listings for "${look}" —`, err?.message)
    return null
  }
  if (res.status === 404) return null
  if (!res.ok) {
    console.error(`[published] the published listings for "${look}" answered ${res.status} — showing the listings without them`)
    return null
  }
  try {
    const layer = await res.json()
    if (!layer || typeof layer.listings !== 'object') throw new Error('no listings object')
    return layer
  } catch (err) {
    console.error(`[published] the published listings for "${look}" are malformed —`, err?.message)
    return null
  }
}

export { applyPublishedLayer } from './publishedLayerApply.js'
