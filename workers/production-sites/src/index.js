/**
 * theward-production-sites — every town's own production site, from one Worker.
 *
 *   provincetown.online/_ward/<sha>/…   →  R2 `ward/<sha>/…`                 (its pinned Ward build)
 *   provincetown.online/kit/<sha>/…     →  R2 `kit/<sha>/…`                  (the renderer's own files)
 *   provincetown.online/baked/<look>/…  →  R2 `baked/<look>/…`               (the prod slab, same origin)
 *   provincetown.online/<anything else> →  that town's Ward build's index.html, told which town it is
 *
 * ⭐ WHICH PLAYER is the host record's (`route.js#appOf`), written by Promote from the town's staging
 * record — the Ward build that was checked there; a record naming the retired legacy player refuses by name. The page
 * is also told `ward-kit-base`,
 * `<origin>/kit/<kit>/`: the same `<ward-asset-base>kit/<sha>/` shape staging stamps, same-origin
 * here as the slab is (no per-town CORS).
 *   www.provincetown.online/…           →  301 to the apex
 *
 * ⭐ THE STAGING ADDRESS BELONGS TO THE WARD; THE PRODUCTION ADDRESS BELONGS TO THE TOWN
 * (`BRIEF-a-link-per-town`). So the town is read off the HOST, not the path, from the record
 * Promote writes at `hosts/<host>.json`. ⛔ There is no table of towns in this file or its
 * config's code path: town #N is a record and a custom-domain binding, never a deploy of this.
 *
 * ⛔⛔ NO FALLBACK ACROSS TOWNS. A host with no record, a town with no production slab, a player
 * file that is not there — each is a 404 that NAMES what is missing. A partner at their own
 * domain being shown another town is the plausible-looking success Layer 0 q2 forbids.
 *
 * ⭐ The slab is served through the town's own domain (Jacob, 2026-09-26): same origin, so no
 * per-town CORS entries, and this is where the H-19 anti-scraping gate will sit.
 * Sibling: `workers/staging-sites` — the same shape, keyed by path instead of host.
 */
import { route, hostKey, wwwRedirect } from './route.js'
import { cardFor, withShareCard, placeListings } from '../../../src/lib/shareCard.js'
import { townsKey } from '../../../src/lib/townsRecordKeys.js'
import { wireHeaders } from '../../../src/lib/slabWire.js'
const text = (body, status) => new Response(body + '\n', { status,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

// A host's record changes only when Promote runs; a minute of staleness is the price of not
// reading R2 on every request.
const _records = new Map()
async function recordFor(env, host) {
  const hit = _records.get(host)
  if (hit && Date.now() - hit.at < 60_000) return hit.rec
  const obj = await env.ASSETS.get(hostKey(host))
  const rec = obj ? await obj.json() : null
  _records.set(host, { rec, at: Date.now() })
  return rec
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!['GET', 'HEAD'].includes(request.method)) return text(`${request.method} is not served here.`, 405)

    const www = wwwRedirect(url)
    if (www) return Response.redirect(www, 301)

    const host = url.hostname
    const rec = await recordFor(env, host)
    if (!rec) {
      return text(`"${host}" has no town promoted to it — nothing at ${hostKey(host)}. `
        + 'Press Promote to Production for the Map that owns this domain.', 404)
    }

    const r = route(url.pathname, rec)
    if (r.kind === 'refuse') return text(r.why, r.status)

    if (r.kind === 'slab') {
      // ⛔ A byte range of an object stored ENCODED is a slice of its brotli stream, not of the file, so it is
      // refused before R2 is asked for it. Only a Range request pays the HEAD; nothing in the player sends one.
      if (request.headers.has('range')) {
        const h = await env.ASSETS.head(r.key)
        if (h?.httpMetadata?.contentEncoding) {
          return text(`"${r.key}" is stored ${h.httpMetadata.contentEncoding}-encoded: a byte range of it is not a range of the file. Fetch it whole.`, 416)
        }
      }
      const obj = await env.ASSETS.get(r.key, { range: request.headers, onlyIf: request.headers })
      if (!obj) return text(`"${rec.look}" has no "${r.key}" in production.`, 404)
      return serve(request, obj, { slab: true })
    }

    if (r.kind === 'ward' || r.kind === 'kit') {
      const obj = await env.ASSETS.get(r.key)
      if (!obj) return text(`"${rec.map}"'s pinned ${r.kind === 'ward' ? 'Ward build' : 'kit bundle'} has no "${r.key}" — promote the town again.`, 404)
      // Promote copies each object's own cache policy from staging (immutable, but the Ward's
      // index.html and build.json are no-cache); honour it.
      return serve(request, obj, { stored: true })
    }

    // ── A document. ⛔ A town is only live if its production slab is there: a player with no
    // slab renders a page that looks like a site and is not one. Asked of `manifest.json`, the one
    // slab file whose name never changes (every other is served under its content — slabNames.js).
    const slab = `baked/${rec.look}/manifest.json`
    if (!(await env.ASSETS.head(slab))) {
      return text(`"${rec.look}" has no production slab — nothing at ${slab}.`, 404)
    }
    // ⛔ A Ward page pointed at a kit bundle that is not there draws with no textures and no
    // clouds, and looks like a site. Ask the bundle's manifest (written last by Promote).
    const kitManifest = `kit/${rec.kit}/manifest.json`
    if (!(await env.ASSETS.head(kitManifest))) return text(`"${rec.map}" pins kit ${rec.kit}, but its bundle is not in production — nothing at ${kitManifest}. Promote it again.`, 404)
    const kitBase = `${url.origin}/kit/${rec.kit}/`
    const obj = await env.ASSETS.get(r.key)
    if (!obj) return text(`"${rec.map}" has no pinned Ward build — nothing at ${r.key}. Promote it.`, 404)
    return townPage(serve(request, obj, { stored: true }), rec, url, env, kitBase)
  },
}

/**
 * The page, told which town it is and where its slab is, plus its share card.
 * ⭐ The two tags are the whole difference between this site and staging: the player bytes are
 * the ones that were checked there (`src/instance.js#readLookParam`, `src/lib/bakedUrl.js`).
 * ⛔ The share card (`src/lib/shareCard.js#cardFor`, shared with staging) comes from the town's own pinned
 * `towns.json` and its picture from the town's own slab, for the time of day it is there now; a town missing
 * from it gets NO card tags, and the response says why (`ward-share-card: absent; …`), never another town's. The card's tags are WRITTEN, not
 * rewritten (`shareCard.js#withShareCard`), so a Ward document with none still gets the whole card.
 */
async function townPage(response, rec, url, env, kitBase) {
  // The share card's towns record — Promote pins it at `sites/<map>/towns.json` (townsKey). ⛔ Missing is said, never `{}`.
  const tKey = townsKey(rec.map)
  const tObj = await env.ASSETS.get(tKey)
  const towns = tObj ? await tObj.json() : null
  const manObj = await env.ASSETS.get(`baked/${rec.look}/manifest.json`)
  const manifest = manObj ? await manObj.json() : null
  const card = cardFor({ town: towns?.[rec.map] || null, townWhy: towns ? `${tKey} has no entry for "${rec.map}"` : `no towns record at ${tKey}`, map: rec.map, path: url.pathname,
    manifest, slabBase: `${url.origin}/baked/${rec.look}/`, pageUrl: `${url.origin}/`,
    ...await placeListings(env, `baked/${rec.look}/`, manifest, url.pathname), when: new Date() })
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return withShareCard(new HTMLRewriter()
    .on('head', { element(el) {
      el.prepend(`<meta name="ward-look" content="${esc(rec.look)}" />`
        + `<meta name="ward-asset-base" content="${esc(url.origin)}/" />`
        + `<meta name="ward-kit-base" content="${esc(kitBase)}" />`
        // ⭐ The domain Operations confirmed when this town was promoted (Promote writes it into
        // the host record). The same value the staging Worker asks Operations for live; read from
        // the record here so a production page never depends on Operations being up.
        + (rec.domain ? `<meta name="ward-domain" content="${esc(rec.domain)}" />` : ''), { html: true })
    } }), response, card, { site: 'production-sites', map: rec.map })
}

/**
 * ⭐ Hashed build assets are immutable; HTML is not. The slab keeps the cache header its uploader
 * wrote (`PUBLISH.md §6`: short on purpose, because 38 MB of it carries no version token).
 */
function cacheFor(key, contentType, stored, slab, useStored) {
  if (slab) return stored || 'public, max-age=300, must-revalidate'
  if (useStored && stored) return stored
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(key)) return 'public, max-age=31536000, immutable'
  if (contentType.startsWith('text/html')) return 'no-cache'
  return 'public, max-age=3600'
}

/**
 * ⭐ An object stored ENCODED (slabWire.js: brotli, for a type nothing else compresses) is sent as stored, its
 * content-encoding from its R2 metadata and its length the stored bytes', with `encodeBody: 'manual'` so the
 * runtime does not encode it a second time. It takes no byte ranges (refused above, before the get).
 */
function serve(request, obj, { slab = false, stored = false } = {}) {
  const key = obj.key
  const wire = wireHeaders(obj)
  const headers = new Headers({
    ...wire,
    'cache-control': cacheFor(key, wire['content-type'], obj.httpMetadata?.cacheControl, slab, stored),
    etag: obj.httpEtag,
  })
  const encoded = 'content-encoding' in wire
  if (!encoded) headers.set('accept-ranges', 'bytes')
  // `onlyIf` matched a conditional GET: R2 returns the object without a body.
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers })
  if (request.headers.has('range') && obj.range && 'offset' in obj.range) {
    const start = obj.range.offset
    const end = start + (obj.range.length ?? obj.size - start) - 1
    headers.set('content-range', `bytes ${start}-${end}/${obj.size}`)
    headers.set('content-length', String(end - start + 1))
    return new Response(request.method === 'HEAD' ? null : obj.body, { status: 206, headers })
  }
  headers.set('content-length', String(obj.size))
  return new Response(request.method === 'HEAD' ? null : obj.body, encoded ? { headers, encodeBody: 'manual' } : { headers })
}
