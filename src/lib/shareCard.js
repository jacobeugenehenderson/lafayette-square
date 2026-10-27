/**
 * shareCard — what a shared link shows (SMS, iMessage, social): the town's title, its description, its icon, and its
 * picture AT THE TIME OF DAY THE LINK IS OPENED. Both site Workers import it, card and writer (staging and production), so the
 * two sites cannot pick differently. BRIEF-share-image-by-time-of-day.
 *
 * ⭐ THE PICTURE is one of the town's own slab files, `share/<slot>.jpg`, one per time-of-day slot, made by Capture in
 *    Stage. The slot is the kit's own (`todSlots.js#todSlotAt`, sun-relative, on the town's clock), read from the
 *    geography the town's manifest carries. Each file is served under its content name, so a messaging app that
 *    caches a preview by URL never shows a stale slot or a previous capture.
 * ⛔ No picture is never another town's. A town whose manifest names no share image for the slot (it was published
 *    before it had a capture) gets a card with no image and an `imageError`, which `withShareCard` serves as an incomplete card, loudly.
 * ▶ node checks/claims-a-town-shares-its-own-picture.mjs · node checks/claims-a-town-page-writes-its-own-card.mjs
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

/**
 * ⭐ THE CARD'S TAGS, in the order they are written. `from` is the card field; `fixed` is a constant of the card's
 * kind. `optional` is the only tag a town may lack without it being a defect (a town that authored no description).
 */
export const CARD_TAGS = [
  { attr: 'property', key: 'og:title', from: 'title' },
  { attr: 'property', key: 'og:description', from: 'description', optional: true },
  { attr: 'property', key: 'og:image', from: 'image' },
  { attr: 'property', key: 'og:url', from: 'url' },
  { attr: 'property', key: 'og:type', fixed: 'website' },
  { attr: 'name', key: 'twitter:card', fixed: 'summary_large_image' },
  { attr: 'name', key: 'twitter:title', from: 'title' },
  { attr: 'name', key: 'twitter:image', from: 'image' },
]
/** The response header that says whether the card is whole, and if not, which tags are missing and why. */
export const CARD_HEADER = 'ward-share-card'

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The card as `<head>` markup → { html, missing: [tag keys] }. Pure. */
export function cardHead(card) {
  const missing = []
  let html = ''
  for (const t of CARD_TAGS) {
    const v = t.fixed ?? card[t.from]
    if (v == null || v === '') { if (!t.optional) missing.push(t.key); continue }
    html += `<meta ${t.attr}="${t.key}" content="${escAttr(v)}" />`
  }
  return { html, missing }
}

/**
 * ⭐⭐ THE WORKER WRITES THE WHOLE CARD. Both site Workers serve `response` through this, so the two sites cannot
 * write different cards. Every og:/twitter: tag the player's document already carries is REMOVED and the card is
 * appended to `<head>`, so the card never depends on which player document is served — the kit's index.html
 * carried placeholder tags and the Ward's carries none, and a rewrite-only card served no tags at all on every
 * Ward town (2026-10-26). Also the page's `<title>` and icon.
 * ⛔ A MISSING VALUE IS NEVER A SILENT DROP. The page is still served (a town without a share image is still a
 * town), but the response carries `ward-share-card: incomplete; missing <tags>; <why>`, the head carries the
 * same as a comment, and the Worker logs it by town. A whole card says `ward-share-card: complete`.
 * ▶ node checks/claims-a-town-page-writes-its-own-card.mjs
 */
export async function withShareCard(rewriter, response, card, { site, map }) {
  const { html, missing } = cardHead(card)
  const why = missing.length ? `missing ${missing.join(' ')}; ${card.imageError || 'no value in the card'}` : ''
  if (why) console.error(`[${site}] share card for "${map}" served incomplete: ${why}`)
  const drop = { element(el) { el.remove() } }
  const out = rewriter
    .on('meta[property^="og:"]', drop)
    .on('meta[name^="twitter:"]', drop)
    .on('head', { element(el) {
      el.append(html + (why ? `<!-- ${CARD_HEADER}: incomplete; ${why.replace(/--/g, '- -')} -->` : ''), { html: true })
    } })
    .on('title', { element(el) { el.setInnerContent(card.title) } })
    .on('link[rel="icon"]', { element(el) { card.icon ? el.setAttribute('href', card.icon) : el.remove() } })
    .transform(await response)
  const res = new Response(out.body, out)
  res.headers.set(CARD_HEADER, why ? `incomplete; ${why}`.replace(/[^\x20-\x7e]/g, '?') : 'complete')
  return res
}
