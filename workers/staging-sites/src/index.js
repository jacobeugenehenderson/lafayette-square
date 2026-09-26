/**
 * theward-staging-sites — every town's staging site, from one Worker and ONE player.
 *
 *   `staging.theward.online/_player/<file>` →  R2 `staging/player/<file>`   (shared bytes)
 *   `staging.theward.online/<map>/…`        →  that same player's index.html
 *
 * ⭐⭐ THERE IS ONE BUILD, NOT ONE PER TOWN. The Ward is the universal player and a town is
 * a slab instantiated inside it, so the player is compiled once and every town's address
 * serves the same bytes; the app reads its town off the first path segment
 * (`src/instance.js#readLookParam`) and fetches that town's slab from R2 at runtime. ⛔ A
 * build per town was the first design and it was a category error — N compilations of the
 * thing defined by being one thing, and a build + upload for every pour.
 * ⚠️ Which is also why the player's assets are absolute under `/_player/`, not relative:
 * the same index.html is served at `/huron/` and at `/huron/legal`, and a relative asset
 * URL would resolve differently at each depth.
 *
 * ⛔⛔ NO FALLBACK ACROSS TOWNS, AND THAT IS THE WHOLE POINT. An unknown map, or a map
 * whose site has never been uploaded, gets a 404 that NAMES it. It must never fall
 * through to another town's build: a partner opening `…/huron/` and being shown
 * Lafayette Square is the exact plausible-looking success this regime exists to end
 * (`CLAUDE.md` Layer 0 q2). The same rule as `bake-ground`'s refusal, one layer out.
 *
 * ⭐ A NEW TOWN NEEDS NOTHING HERE. The map id is read out of the path and used as an
 * R2 prefix — there is no table of towns in this file, so pouring town #10 requires no
 * deploy of this Worker. If you find yourself adding a list, the design has been lost.
 */

// The SPA's own routes (`/preview`, `/cartograph`, …) and deep links must resolve to the
// town's index.html rather than 404 — but ⛔ only when the request is for a DOCUMENT.
// A missing .js or .png served as HTML is the classic silent-corruption bug: the browser
// reports a syntax error in a file that was never JavaScript.
const looksLikeFile = (p) => /\.[a-z0-9]{2,5}$/i.test(p)
// The one path segment that is NOT a town. ⛔ Keep in step with the player build's `--base`.
const PLAYER_SEGMENT = '_player'

// ⭐ Hashed build assets are immutable; HTML is not. Vite fingerprints everything under
// `assets/`, so those may be cached hard and the document must never be — otherwise a
// partner's browser pins one deploy forever and no re-publish reaches them.
function cacheFor(key, contentType) {
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(key)) {
    return 'public, max-age=31536000, immutable'
  }
  if (contentType.startsWith('text/html')) return 'no-cache'
  return 'public, max-age=3600'
}

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const parts = url.pathname.replace(/^\/+/, '').split('/')
    const map = parts.shift() || ''
    if (!/\/staging\/$/.test(env.SLAB_BASE || '')) {
      // ⛔ A preview pointed at the production keys is not a preview (the 2026-09-03 bug); this
      // is the guard `publish-player-to-staging.mjs` used to hold at build time.
      return new Response(`SLAB_BASE must end in "/staging/" — got "${env.SLAB_BASE}". Fix wrangler.jsonc.\n`,
        { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

    // ── What this Worker tells a page about its slab. `publish-player-to-staging.mjs` asks
    // before uploading a runtime player: a Worker that cannot answer (an older deploy) would
    // serve that player with no tag, and every town's staging site would refuse to load.
    if (map === '_slab-base') {
      return new Response(env.SLAB_BASE + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
    }

    // ── The shared player. One prefix, every town's bytes.
    if (map === PLAYER_SEGMENT) {
      const rel = parts.join('/') || 'index.html'
      const obj = await env.ASSETS.get(`${env.PLAYER_PREFIX}${rel}`)
      if (!obj) {
        // ⛔ Never fall through to a town prefix: a missing player file is a broken DEPLOY,
        // and answering it with something else would hide that behind a working-looking page.
        return new Response(`the player has no "${rel}" — publish the player.\n`, { status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' } })
      }
      return serve(request, obj)
    }

    // The bare host lists nothing and guesses nothing: there is no "default town" here,
    // because picking one would be the bleed this regime removes.
    if (!map) {
      return new Response(
        'theward staging — address a town directly: https://staging.theward.online/<map>/\n',
        { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(map)) {
      return new Response(`not a map id: "${map}"\n`, { status: 400,
        headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

    const rest = parts.join('/')

    // ⛔ A TOWN IS ONLY REAL IF ITS SLAB IS PUBLISHED. The player would happily render its
    // loud "look is not in the index" fallback for a town nobody has poured — a page that
    // looks like a site and is not one. Ask the artifact instead: the slab's `scene.json`
    // is what a pour writes, so its absence is the honest 404.
    const slab = `staging/baked/${map}/scene.json`
    if (!(await env.ASSETS.head(slab))) {
      return new Response(
        `"${map}" has no staging slab yet — nothing has been published to ${slab}. `
        + `Bake it, then press Publish to Staging for that Map.\n`,
        { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

    // Anything under a town that looks like a FILE is that town's own asset; everything
    // else is an SPA route and gets the shared player.
    const wantsTownFile = Boolean(rest) && looksLikeFile(rest)
    const obj = wantsTownFile
      ? await env.ASSETS.get(`${env.SITE_PREFIX}${map}/${rest}`)
      : await env.ASSETS.get(`${env.PLAYER_PREFIX}index.html`)
    if (!obj) {
      // ⛔ SAY WHICH THING IS MISSING. These two failures look identical from the outside
      // and have nothing to do with each other: one is a town without an asset, the other
      // is a DEPLOY with no player in it — and the second is every town at once.
      const why = wantsTownFile
        ? `"${map}" has no "${rest}".`
        : `the player is not published — nothing at ${env.PLAYER_PREFIX}index.html. `
          + `This affects EVERY town, not just "${map}". `
          + `▶ node scripts/publish-player-to-staging.mjs`
      return new Response(why + '\n', { status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
    if (wantsTownFile) return serve(request, obj)
    return shareCard(serve(request, obj), map, url, env)
  },
}

/**
 * ⭐ THE SHARE CARD — what an SMS/iMessage/social crawler reads. Crawlers never run JavaScript,
 * so the player's runtime branding (`src/lib/townMark.js`) never reaches them and every town's
 * link showed index.html's static Lafayette Square tags. Rewrite them here, per <map>, from
 * `towns.json` — generated from the instance registry by publish-player-to-staging.mjs, so
 * this file still holds no list of towns.
 * ⛔ A map with no entry gets NEUTRAL tags (its id, no image), never Lafayette Square's.
 */
import { decideProductionDomain } from '../../../src/lib/productionDomain.js'

/**
 * ⭐⭐ THE TOWN'S PRODUCTION DOMAIN, ON ITS STAGING PAGE (Jacob, 2026-09-26). Every public URL the
 * player builds — the check-in and claim QR codes, place and bulletin shares — takes the TOWN'S
 * domain (`src/lib/townOrigin.js`), so a claim card printed while testing on staging carries
 * `provincetown.online`, never this Worker's address. The domain's one home is Operations; this
 * asks it with the same read-only service token and the same rule Promote uses.
 * ⛔ No answer ⇒ no tag, and the player draws no QR and no share URL. Never a guess.
 */
const _domains = new Map()
async function townDomain(env, map) {
  const hit = _domains.get(map)
  if (hit && Date.now() - hit.at < 300_000) return hit.d
  let d
  if (!env.OPS_ACCESS_CLIENT_ID || !env.OPS_ACCESS_CLIENT_SECRET) {
    d = { domain: null, why: 'this Worker has no Operations service token (wrangler secret OPS_ACCESS_CLIENT_ID / _SECRET)' }
  } else {
    try {
      const r = await fetch(`${env.OPERATIONS_URL}/api/production-domain/${encodeURIComponent(map)}`, {
        headers: { 'CF-Access-Client-Id': env.OPS_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.OPS_ACCESS_CLIENT_SECRET } })
      let body = null
      try { body = await r.json() } catch { /* Access answers a refused token with HTML */ }
      d = r.ok || body?.error ? decideProductionDomain(map, body) : { domain: null, why: `Operations answered ${r.status}` }
    } catch (e) { d = { domain: null, why: `could not reach Operations: ${e.message}` } }
  }
  if (!d.domain) console.error(`[staging-sites] no production domain for "${map}": ${d.why}`)
  _domains.set(map, { d, at: Date.now() })
  return d
}

let _towns = null, _townsAt = 0
async function townsIndex(env) {
  if (_towns && Date.now() - _townsAt < 60_000) return _towns
  const obj = await env.ASSETS.get(`${env.PLAYER_PREFIX}towns.json`)
  _towns = obj ? await obj.json() : {}
  _townsAt = Date.now()
  return _towns
}
function emojiIcon(glyph) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${glyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
async function shareCard(response, map, url, env) {
  const t = (await townsIndex(env))[map] || null
  const { domain } = await townDomain(env, map)
  const title = t?.title || map
  const image = t?.ogImage || null
  const icon = t?.faviconUrl || (t?.mark ? emojiIcon(t.mark) : null)
  const setOr = (value) => ({ element(el) { value ? el.setAttribute('content', value) : el.remove() } })
  return new HTMLRewriter()
    // ⭐ WHERE THE SLAB IS — the published player is built with `VITE_ASSET_BASE=runtime` and
    // reads this (`src/lib/bakedUrl.js`), so the same bytes can be promoted to a town's domain.
    // ⛔ `SLAB_BASE` is required: without it the player refuses to load rather than guess.
    .on('head', { element(el) {
      el.prepend(`<meta name="ward-asset-base" content="${env.SLAB_BASE}" />`
        + (domain ? `<meta name="ward-domain" content="${domain}" />` : ''), { html: true })
    } })
    .on('title', { element(el) { el.setInnerContent(title) } })
    .on('meta[property="og:title"]', setOr(title))
    .on('meta[name="twitter:title"]', setOr(title))
    .on('meta[property="og:image"]', setOr(image))
    .on('meta[name="twitter:image"]', setOr(image))
    .on('meta[property="og:url"]', setOr(`${url.origin}/${map}/`))
    .on('link[rel="icon"]', { element(el) { icon ? el.setAttribute('href', icon) : el.remove() } })
    .on('head', { element(el) { if (t?.description) el.append(`<meta property="og:description" content="${t.description.replace(/"/g, '&quot;')}" />`, { html: true }) } })
    .transform(await response)
}

function serve(request, obj) {
  const key = obj.key
  const contentType = obj.httpMetadata?.contentType || typeFor(key)
  const headers = new Headers({
    'content-type': contentType,
    'cache-control': cacheFor(key, contentType),
    etag: obj.httpEtag,
    // Unlisted, but durable (ruled 2026-09-21): a partner holds this address and returns
    // to it. ⛔ Unlisted is not private — it is simply not advertised — so the only thing
    // asserted here is that search engines should not index it.
    'x-robots-tag': 'noindex, nofollow',
  })
  if (request.method === 'HEAD') return new Response(null, { headers })
  return new Response(obj.body, { headers })
}
