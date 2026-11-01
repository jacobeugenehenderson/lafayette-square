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
 * ⭐ A SHARED PLACE LINK SENDS THE PLACE'S CARD (BRIEF-share-image-by-time-of-day §7, part 2): `/place/<id>/<name>`
 *    gets the listing's own name, its type and address, its own address as og:url, and its photo when the photo may be
 *    shown without a credit (`PREVIEW_LICENCES`), else the town's picture for the hour. A place the town's listings
 *    don't know gets the town's card, and the response says so by name (`card.note`), never silently.
 * ▶ node checks/claims-a-town-shares-its-own-picture.mjs · node checks/claims-a-town-page-writes-its-own-card.mjs
 *   · node checks/claims-a-place-link-sends-its-own-card.mjs
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
 * A place's address within a town (the Ward's routes.js `/place/<id>/<name>`) → { id }, { malformed: the raw segment }
 * when it does not decode (`%E0%A4%A`), or null for any other path. ⛔ Never throws: a bad link still gets a page.
 */
export function placeIdOf(path) {
  const m = /^\/place\/([^/?#]+)/.exec(path || '')
  if (!m) return null
  try { return { id: decodeURIComponent(m[1]) } } catch { return { malformed: m[1] } }
}

/**
 * The town's published listings, read from its slab only for a place path (every other page needs none): the
 * Worker's env (its `ASSETS` bucket), the slab's key prefix (`…baked/<look>/`), the manifest, the path within the town.
 * → { listings: [listing] | null, listingsWhy: why there are none | null }, spread into `cardFor`.
 * ⛔ A listings file the manifest names but the bucket lacks or can't parse is SAID (the page is still served, as a
 *    town without a picture is), never read as "no such place".
 */
export async function placeListings(env, prefix, manifest, path) {
  const at = placeIdOf(path)
  if (at == null || at.malformed != null) return { listings: null, listingsWhy: null }
  if (!manifest?.content?.['listings.json']) return { listings: null, listingsWhy: 'the town publishes no listings' }
  try {
    const obj = await env.ASSETS.get(`${prefix}content/listings.json`)
    if (!obj) return { listings: null, listingsWhy: `${prefix}content/listings.json is in the manifest but not in the bucket` }
    const body = await obj.json()
    const listings = Array.isArray(body) ? body : body?.listings
    return Array.isArray(listings) ? { listings, listingsWhy: null } : { listings: null, listingsWhy: `${prefix}content/listings.json has no listings array` }
  } catch (e) { return { listings: null, listingsWhy: `${prefix}content/listings.json could not be read: ${e.message}` } }
}

/**
 * ⛔ The licences under which a place's photo may stand in a link preview, where no credit can be shown. A messaging
 * app draws the picture alone, so a photo whose terms ask for attribution (CC BY, CC BY-SA) or that is shown by
 * permission (`rights`, no licence) is NOT used there: the town's picture stands in, and the response says why.
 * Widening this is Jacob's ruling, not a code change made for coverage.
 */
export const PREVIEW_LICENCES = ['Public domain', 'CC0', 'CC0 1.0']

/**
 * The card for a request to `path` in a town.
 *   town      — the town's towns.json entry ({ title, description, icon, iconFrom }, scripts/towns-record.mjs), or null
 *   townWhy   — why `town` is null, said by the Worker that read it (no record file, or no entry for this town)
 *   map       — the town's id
 *   path      — the request path WITHIN the town ('/' for its front, '/place/<id>/<name>' for a place)
 *   manifest  — the town's published slab manifest
 *   slabBase  — the absolute URL of the town's slab directory, ending in `baked/<look>/`
 *   pageUrl   — the town's front page (the card's og:url, and the root a place's own url is written from)
 *   listings  — the town's published listings ([…], from content/listings.json) for a place path; null when not read
 *   listingsWhy — why `listings` is null for a place path (placeListings), said in the card's note
 *   when      — the instant the link is opened
 * → { title, description, image, url, icon, iconWhy, imageError, note }, or { absent } when the town has no record.
 * ⛔ NO RECORD, NO CARD (Zob, 2026-11-01). A town with no towns.json entry gets no card tags at all: its id as a title
 * and no picture was a NEUTRAL card standing in for a missing record, a plausible preview with nothing said.
 */
export function cardFor({ town, townWhy = null, map, path, manifest, slabBase, pageUrl, listings = null, listingsWhy = null, when }) {
  if (!town) return { absent: townWhy || `"${map}" has no share record`, note: null }
  let image = null, imageError = null
  try {
    if (!manifest) throw new Error('no published manifest')
    const rel = shareImageRel(shareSlotAt(manifest, when))
    if (!manifest.files?.[rel]) throw new Error(`its published slab has no "${rel}" — capture share images in Stage, then Publish`)
    if (manifest.names !== HASHED) throw new Error(`its slab is not published under content names, so "${rel}" has no address a preview cache can't confuse`)
    image = slabBase + servedRel(manifest, rel, true)
  } catch (e) { imageError = `share image for "${map}": ${e.message}` }
  const card = {
    title: town.title || map,
    description: town.description || null,
    image, imageError,
    url: pageUrl,
    // ⭐ The town's icon, a data: URI drawn from its baked Look at publish (scripts/towns-record.mjs). ⛔ Read from
    // nowhere else: an entry without one is a towns.json published before the icon came from the Look.
    icon: town.icon || null,
    iconWhy: town.icon ? null : town.iconFrom ? `the town has no icon (${town.iconFrom})`
      : "the town's towns.json entry has no icon (published before the icon came from the Look: publish the towns record, then Promote)",
    note: null,
  }
  const at = placeIdOf(path)
  if (at == null) return card
  if (at.malformed != null) { card.note = `the town card for a place link that does not decode: "${at.malformed}"`; return card }
  const { id } = at
  const place = Array.isArray(listings) ? listings.find((l) => l.id === id) : null
  if (!place) {
    card.note = listings == null ? `the town card for place "${id}": ${listingsWhy || 'its listings were not read'}`
      : `the town card for place "${id}": ${map}'s listings have no such place`
    return card
  }
  const type = manifest?.taxonomy?.categories?.find((c) => c.id === place.category)?.types?.find((t) => t.id === place.subcategory)?.label
  card.title = place.name
  card.description = [type, place.address].filter(Boolean).join(' · ') || null
  card.url = pageUrl + path.replace(/^\//, '').replace(/[?#].*$/, '')
  const photo = (place.photos || []).map((p) => (typeof p === 'string' ? { url: p } : p)).find((p) => p?.url && manifest?.photos?.[p.url])
  if (photo && PREVIEW_LICENCES.includes(photo.license)) {
    // Served under its content name, as the town's picture is, so a preview cache never shows a replaced photo.
    try {
      if (manifest.names !== HASHED) throw new Error('the slab is not published under content names')
      card.image = slabBase + servedRel(manifest, manifest.photos[photo.url].path, true)
    } catch (e) { card.note = `the town's picture for "${id}": its photo has no content-named address (${e.message})` }
  } else if (photo) card.note = `the town's picture for "${id}": its photo is ${photo.license || (photo.rights ? 'shown by permission' : 'of unstated licence')}, which a preview cannot credit`
  return card
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

/**
 * The card as `<head>` markup → { html, missing: [tag keys], why }. Pure. Besides `CARD_TAGS`, the page's `<title>`
 * and its icon `<link>` — a crawler runs no JavaScript, so the player's runtime never reaches it. ⛔ An absent icon is
 * MISSING (named), never a silent remove (Boz, 2026-10-26).
 */
export function cardHead(card) {
  const missing = [], reasons = []
  let html = ''
  const lack = (key, reason) => { missing.push(key); if (!reasons.includes(reason)) reasons.push(reason) }
  if (card.title) html += `<title>${escAttr(card.title)}</title>`
  else lack('title', 'no title in the card')
  for (const t of CARD_TAGS) {
    const v = t.fixed ?? card[t.from]
    if (v == null || v === '') { if (!t.optional) lack(t.key, t.from === 'image' && card.imageError ? card.imageError : `no ${t.from} in the card`); continue }
    html += `<meta ${t.attr}="${t.key}" content="${escAttr(v)}" />`
  }
  if (card.icon) html += `<link rel="icon"${card.icon.startsWith('data:image/svg') ? ' type="image/svg+xml"' : ''} href="${escAttr(card.icon)}" />`
  else lack('icon', card.iconWhy || 'no icon in the card')
  return { html, missing, why: missing.length ? `missing ${missing.join(' ')}; ${reasons.join('; ')}` : '' }
}

/**
 * ⭐⭐ THE WORKER WRITES THE WHOLE CARD. Both site Workers serve `response` through this, so the two sites cannot
 * write different cards. Every og:/twitter: tag, every `<title>` and every icon link the player's document carries
 * is REMOVED and the card is appended to `<head>`, so the card never depends on which player document is served —
 * the kit's index.html carried placeholder tags and the Ward's carries none (and no icon), and a rewrite-only card
 * served no tags at all on every Ward town (2026-10-26).
 * ⛔ A MISSING VALUE IS NEVER A SILENT DROP. The page is still served (a town without a share image is still a
 * town), but the response carries `ward-share-card: incomplete; missing <tags>; <why>`, the head carries the
 * same as a comment, and the Worker logs it by town. A whole card says `ward-share-card: complete`. A town with NO record
 * (`cardFor` → `{ absent }`) is served with no card tags at all, and says `ward-share-card: absent; <why>` the same three ways.
 * ▶ node checks/claims-a-town-page-writes-its-own-card.mjs
 */
export async function withShareCard(rewriter, response, card, { site, map }) {
  const { html, why } = card.absent ? { html: '', why: '' } : cardHead(card)
  if (card.absent) console.error(`[${site}] share card for "${map}" ABSENT: ${card.absent}`)
  if (why) console.error(`[${site}] share card for "${map}" served incomplete: ${why}`)
  const drop = { element(el) { el.remove() } }
  const out = rewriter
    .on('meta[property^="og:"]', drop)
    .on('meta[name^="twitter:"]', drop)
    .on('head > title', drop)
    .on('head > link[rel~="icon"]', drop)
    .on('head', { element(el) {
      const said = card.absent ? `absent; ${card.absent}` : why ? `incomplete; ${why}` : ''
      el.append(html + (said ? `<!-- ${CARD_HEADER}: ${said.replace(/--/g, '- -')} -->` : ''), { html: true })
    } })
    .transform(await response)
  const res = new Response(out.body, out)
  // A place link that fell to the town's card says so, by name, beside the card's completeness.
  if (card.note) console.error(`[${site}] share card for "${map}": ${card.note}`)
  res.headers.set(CARD_HEADER, `${card.absent ? `absent; ${card.absent}` : why ? `incomplete; ${why}` : 'complete'}${card.note ? `; ${card.note}` : ''}`.replace(/[^\x20-\x7e]/g, '?'))
  return res
}
