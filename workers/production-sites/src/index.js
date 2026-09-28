/**
 * theward-production-sites — every town's own production site, from one Worker.
 *
 *   provincetown.online/_player/<file>  →  R2 `player/provincetown/<file>`   (that town's pinned copy)
 *   provincetown.online/baked/<look>/…  →  R2 `baked/<look>/…`               (the prod slab, same origin)
 *   provincetown.online/<anything else> →  that pinned player's index.html, told which town it is
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

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf',
  glb: 'model/gltf-binary', ktx2: 'image/ktx2', bin: 'application/octet-stream',
  wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', map: 'application/json',
}
const typeFor = (p) => TYPES[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream'
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
      const obj = await env.ASSETS.get(r.key, { range: request.headers, onlyIf: request.headers })
      if (!obj) return text(`"${rec.look}" has no "${r.key}" in production.`, 404)
      return serve(request, obj, { slab: true })
    }

    if (r.kind === 'player') {
      const obj = await env.ASSETS.get(r.key)
      if (!obj) {
        return text(`"${rec.map}"'s player has no "${r.key}" — promote the town again; `
          + 'its pinned copy is incomplete.', 404)
      }
      return serve(request, obj)
    }

    // ── A document. ⛔ A town is only live if its production slab is there: a player with no
    // slab renders a page that looks like a site and is not one. Asked of `manifest.json`, the one
    // slab file whose name never changes (every other is served under its content — slabNames.js).
    const slab = `baked/${rec.look}/manifest.json`
    if (!(await env.ASSETS.head(slab))) {
      return text(`"${rec.look}" has no production slab — nothing at ${slab}.`, 404)
    }
    const obj = await env.ASSETS.get(r.key)
    if (!obj) return text(`"${rec.map}" has no pinned player — nothing at ${r.key}. Promote it.`, 404)
    return townPage(serve(request, obj), rec, url, env)
  },
}

/**
 * The page, told which town it is and where its slab is, plus its share card.
 * ⭐ The two tags are the whole difference between this site and staging: the player bytes are
 * the ones that were checked there (`src/instance.js#readLookParam`, `src/lib/bakedUrl.js`).
 * ⛔ The share card comes from the town's own pinned `towns.json`; a town missing from it gets
 * NEUTRAL tags (its id, no image), never Lafayette Square's.
 */
async function townPage(response, rec, url, env) {
  const tObj = await env.ASSETS.get(`player/${rec.map}/towns.json`)
  const t = (tObj ? await tObj.json() : {})[rec.map] || null
  const title = t?.title || rec.map
  const image = t?.ogImage || null
  const icon = t?.faviconUrl || (t?.mark ? emojiIcon(t.mark) : null)
  const setOr = (value) => ({ element(el) { value ? el.setAttribute('content', value) : el.remove() } })
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return new HTMLRewriter()
    .on('head', { element(el) {
      el.prepend(`<meta name="ward-look" content="${esc(rec.look)}" />`
        + `<meta name="ward-asset-base" content="${esc(url.origin)}/" />`
        // ⭐ The domain Operations confirmed when this town was promoted (Promote writes it into
        // the host record). The same value the staging Worker asks Operations for live; read from
        // the record here so a production page never depends on Operations being up.
        + (rec.domain ? `<meta name="ward-domain" content="${esc(rec.domain)}" />` : ''), { html: true })
      if (t?.description) el.append(`<meta property="og:description" content="${esc(t.description)}" />`, { html: true })
    } })
    .on('title', { element(el) { el.setInnerContent(title) } })
    .on('meta[property="og:title"]', setOr(title))
    .on('meta[name="twitter:title"]', setOr(title))
    .on('meta[property="og:image"]', setOr(image))
    .on('meta[name="twitter:image"]', setOr(image))
    .on('meta[property="og:url"]', setOr(`${url.origin}/`))
    .on('link[rel="icon"]', { element(el) { icon ? el.setAttribute('href', icon) : el.remove() } })
    .transform(await response)
}
function emojiIcon(glyph) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${glyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * ⭐ Hashed build assets are immutable; HTML is not. The slab keeps the cache header its uploader
 * wrote (`PUBLISH.md §6`: short on purpose, because 38 MB of it carries no version token).
 */
function cacheFor(key, contentType, stored, slab) {
  if (slab) return stored || 'public, max-age=300, must-revalidate'
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(key)) return 'public, max-age=31536000, immutable'
  if (contentType.startsWith('text/html')) return 'no-cache'
  return 'public, max-age=3600'
}

function serve(request, obj, { slab = false } = {}) {
  const key = obj.key
  const contentType = obj.httpMetadata?.contentType || typeFor(key)
  const headers = new Headers({
    'content-type': contentType,
    'cache-control': cacheFor(key, contentType, obj.httpMetadata?.cacheControl, slab),
    etag: obj.httpEtag,
    'accept-ranges': 'bytes',
  })
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
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers })
}
