/**
 * shareCard — what a shared link shows (SMS, iMessage, social): the town's title, its description, its icon, and its
 * picture AT THE TIME OF DAY THE LINK IS OPENED. Pure: both site Workers import it (staging and production), so the
 * two sites cannot pick differently. BRIEF-share-image-by-time-of-day.
 *
 * ⭐ THE PICTURE is one of the town's own slab files, `share/<slot>.jpg`, one per time-of-day slot, made by Capture in
 *    Stage. The slot is the kit's own (`todSlots.js#todSlotAt`, sun-relative, on the town's clock), read from the
 *    geography the town's manifest carries. Each file is served under its content name, so a messaging app that
 *    caches a preview by URL never shows a stale slot or a previous capture.
 * ⛔ No picture is never another town's. A town whose manifest names no share image for the slot (it was published
 *    before it had a capture) gets a card with no image and an `imageError` that the Worker logs by town.
 * ▶ node checks/claims-a-town-shares-its-own-picture.mjs
 */
import { TOD_SLOT_IDS, todSlotAt, SHARE_SLOT_TOLERANCE_MIN } from './todSlots.js'
import { HASHED, servedRel } from './slabNames.js'

/** A town's share image for a slot, relative to its slab (`baked/<look>/`). */
export const shareImageRel = (slot) => `share/${slot}.jpg`
/** Every share image a town must have: one per slot. */
export const SHARE_IMAGE_RELS = TOD_SLOT_IDS.map(shareImageRel)

/** The slot a share card shows for this town's manifest at `when`. ⛔ Throws by town when it has no geography or zone. */
export function shareSlotAt(manifest, when) {
  const g = manifest?.identity?.geography
  if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon) || !g.timezone) {
    throw new Error(`"${manifest?.town}" has no geography { lat, lon, timezone } in its manifest, so its share slot cannot be read`)
  }
  return todSlotAt(when, { lat: g.lat, lon: g.lon, tz: g.timezone }, SHARE_SLOT_TOLERANCE_MIN)
}

/**
 * The card for a request to `path` in a town.
 *   town      — the town's towns.json entry ({ title, description, faviconUrl, mark }), or null
 *   map       — the town's id (the title when it has no entry)
 *   path      — the request path within the town. ⭐ Part 2 (§7 of the brief): a `/place/<id>/<name>` path will
 *               return the place's own title, url and picture here; every other path gets the town's card.
 *   manifest  — the town's published slab manifest
 *   slabBase  — the absolute URL of the town's slab directory, ending in `baked/<look>/`
 *   pageUrl   — the card's og:url
 *   when      — the instant the link is opened
 * → { title, description, image, url, icon, imageError }
 */
export function cardFor({ town, map, path, manifest, slabBase, pageUrl, when }) {
  void path   // part 2 reads it
  let image = null, imageError = null
  try {
    if (!manifest) throw new Error('no published manifest')
    const rel = shareImageRel(shareSlotAt(manifest, when))
    if (!manifest.files?.[rel]) throw new Error(`its published slab has no "${rel}" — capture share images in Stage, then Publish`)
    if (manifest.names !== HASHED) throw new Error(`its slab is not published under content names, so "${rel}" has no address a preview cache can't confuse`)
    image = slabBase + servedRel(manifest, rel, true)
  } catch (e) { imageError = `share image for "${map}": ${e.message}` }
  return {
    title: town?.title || map,
    description: town?.description || null,
    image, imageError,
    url: pageUrl,
    icon: town?.faviconUrl || (town?.mark ? emojiIcon(town.mark) : null),
  }
}

function emojiIcon(glyph) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${glyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
