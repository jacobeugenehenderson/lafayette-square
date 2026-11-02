/**
 * theward-staging-sites — every town's staging site, from one Worker; each town names its player.
 *
 *   `staging.theward.online/_ward/<sha>/<file>`  →  R2 `staging/ward/<sha>/<file>` (The Ward's build)
 *   `staging.theward.online/<map>/…`             →  the document of the player that town's record names
 *   `staging.theward.online/<former map>/…`      →  301 to `/<map>/…`, from R2 `staging/renamed.json`
 *
 * ⭐⭐ EACH TOWN NAMES ITS PLAYER, AND A TOWN THAT NAMES NONE IS A 404 (BRIEF-ward-on-staging, 2026-09-28).
 * `staging/sites/<map>/player.json` says `ward`; `scripts/set-staging-player.mjs` writes it, and src/lib/stagingPlayer.js
 * reads it (the one answer Preview's status and Promote's gate also give).
 * ⛔ There is no default player: a town silently served the wrong one is the plausible-looking
 * success `CLAUDE.md` Layer 0 q2 forbids. `ward` serves the build `staging/ward/current.json` points at
 * and stamps `<meta name="ward-kit-base">` — the versioned renderer bundle on the asset host
 * (`scripts/publish-kit-bundle.mjs`) for the kit that build was made against. ⛔ A record naming the retired
 * `legacy` kit player refuses by name (retired 2026-11-01, with `/_player/`): never served the Ward in its place.
 *
 * ⭐⭐ ONE BUILD, NOT ONE PER TOWN. A town is a slab instantiated inside the Ward, so every town is served the same
 * build; the app reads its town off the first path segment and fetches that town's slab from R2 at runtime. ⛔ A build
 * per town was the first design and it was a category error.
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
// The path segments that are NOT towns (a map id cannot start with `_`). The retired legacy kit player's prefix
// (2026-11-01) is answered by name.
const RETIRED_PLAYER_SEGMENT = '_player'
// The Ward's builds, one immutable prefix per Ward commit (`theward/scripts/publish-staging.mjs`).
const WARD_SEGMENT = '_ward'
const text = (body, status) => new Response(body + '\n', { status,
  headers: { 'content-type': 'text/plain; charset=utf-8' } })

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

// A file's content type, and whether it is stored encoded: src/lib/slabWire.js (one table, both Workers and the uploaders).

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const parts = url.pathname.replace(/^\/+/, '').split('/')
    const map = parts.shift() || ''
    if (!/\/staging\/$/.test(env.SLAB_BASE || '')) {
      // ⛔ A preview pointed at the production keys is not a preview (the 2026-09-03 bug).
      return new Response(`SLAB_BASE must end in "/staging/" — got "${env.SLAB_BASE}". Fix wrangler.jsonc.\n`,
        { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

    // ── The retired legacy kit player: said by name, never a town's path.
    if (map === RETIRED_PLAYER_SEGMENT) return text(`the kit's legacy player was retired (2026-11-01): every town plays the Ward. Address a town: https://staging.theward.online/<map>/`, 404)

    // ── The Ward's builds. `/_ward/<sha>/…` is only ever that Ward commit's bytes; ⛔ never a
    // kit file, and never another sha's (the kit's bundle lives on the asset host, not here).
    if (map === WARD_SEGMENT) {
      const rel = parts.join('/')
      if (!/^[0-9a-f]{40}\/./.test(rel)) return text(`not a Ward build path: "/${WARD_SEGMENT}/${rel}"`, 404)
      const obj = await env.ASSETS.get(`${env.WARD_PREFIX}${rel}`)
      if (!obj) return text(`the Ward build has no "${rel}" — publish it (theward: npm run publish:staging).`, 404)
      // The Ward's publish sets each object's cache policy (immutable, but no-cache for its
      // index.html and build.json); honour it rather than re-guess it from the name.
      return serve(request, obj, obj.httpMetadata?.cacheControl)
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

    // ── A RENAMED TOWN KEEPS ITS OLD LINKS. Staging links are unlisted but durable (a partner returns
    // months later), so a former name 301s to the current one, path and query kept. The table is DATA
    // (`staging/renamed.json`, `{ "<old>": "<new>" }`), written by the rename, so the next rename needs
    // no deploy. ⛔ A redirect to a name with no slab is a 404 that names both, never a hop to nothing.
    const renamedTo = (await renamedTable(env))[map]
    if (renamedTo) {
      if (!(await env.ASSETS.head(`staging/baked/${renamedTo}/manifest.json`))) {
        return text(`"${map}" was renamed to "${renamedTo}", and "${renamedTo}" has no staging slab yet.`, 404)
      }
      return Response.redirect(`${url.origin}/${renamedTo}/${rest}${url.search}`, 301)
    }

    // ⛔ A TOWN IS ONLY REAL IF ITS SLAB IS PUBLISHED. The player would happily render its
    // loud "look is not in the index" fallback for a town nobody has poured — a page that
    // looks like a site and is not one. Ask the artifact instead: the slab's `manifest.json`
    // is the one file published at a fixed name (every other is served under its content —
    // src/lib/slabNames.js), so its absence is the honest 404.
    const slab = `staging/baked/${map}/manifest.json`
    if (!(await env.ASSETS.head(slab))) {
      return new Response(
        `"${map}" has no staging slab yet — nothing has been published to ${slab}. `
        + `Bake it, then press Publish to Staging for that Map.\n`,
        { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

    // ⛔⛔ WHICH PLAYER — the town's record says, and nothing else may: src/lib/stagingPlayer.js, the answer Preview's
    // status and Promote's gate give too. No record, a record naming the retired legacy player, no Ward, no kit bundle,
    // no document: each a refusal naming its key, never a default player.
    const player = await stagingPlayerOf(map, {
      json: async (k) => { const o = await env.ASSETS.get(k); if (!o) return null; try { return await o.json() } catch { return {} } },
      exists: async (k) => !!(await env.ASSETS.head(k)),
    })

    // Anything under a town that looks like a FILE is that town's own asset; everything
    // else is an SPA route and gets the town's player.
    const wantsTownFile = Boolean(rest) && looksLikeFile(rest)
    if (wantsTownFile) {
      const obj = await env.ASSETS.get(`${env.SITE_PREFIX}${map}/${rest}`)
      return obj ? serve(request, obj) : text(`"${map}" has no "${rest}".`, 404)
    }

    // ⛔ SAY WHICH THING IS MISSING. A town without an asset (above) and a player that is not there look identical from
    // outside; the second is every town at once, so it says so.
    if (!player.current) return text(`${player.why}${player.status === 404 && !/names no player/.test(player.why) ? ` This affects EVERY town, not just "${map}".` : ''}`, player.status)
    const doc = await env.ASSETS.get(`${env.WARD_PREFIX}${player.ward}/index.html`)
    if (!doc) return text(`the Ward build ${player.ward} has no index.html — it went missing after it was checked. This affects EVERY town.`, 404)
    return shareCard(serve(request, doc), map, url, env, `${env.SLAB_BASE}kit/${player.kit}/`)
  },
}


/**
 * ⭐ THE SHARE CARD — what an SMS/iMessage/social crawler reads. Crawlers never run JavaScript,
 * so the player's runtime never reaches them and every town's
 * link showed index.html's static Lafayette Square tags. WRITE them here (`shareCard.js#withShareCard`
 * removes any the document carries and appends the whole card, so a Ward document with none gets one), per <map>, from
 * the town's own record (`staging/sites/<map>/towns.json`, written by its Publish through scripts/publish-towns-record.mjs),
 * so this file still holds no list of towns — and its picture from the town's own slab, for the time
 * of day it is in the town now. The card itself is `src/lib/shareCard.js#cardFor`, shared with production.
 * ⛔ A map with no entry gets NO card tags, and the response says why (`ward-share-card: absent; …`); never another town's.
 */
import { decideProductionDomain } from '../../../src/lib/productionDomain.js'
import { cardFor, withShareCard, placeListings } from '../../../src/lib/shareCard.js'
import { stagingTownsKey } from '../../../src/lib/townsRecordKeys.js'
import { stagingPlayerOf } from '../../../src/lib/stagingPlayer.js'
import { wireHeaders } from '../../../src/lib/slabWire.js'

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

// The town's share-card record (scripts/publish-towns-record.mjs, written by its Publish): `{ [map]: … }` at its own key
// (src/lib/townsRecordKeys.js#stagingTownsKey), the shape production reads. ⛔ A missing file is null and said, never `{}`:
// a town with no record gets no card tags and the response says why (shareCard.js#cardFor), never a stand-in.
const _towns = new Map()
async function townRecord(env, map) {
  const hit = _towns.get(map)
  if (hit && Date.now() - hit.at < 60_000) return hit.table
  const obj = await env.ASSETS.get(stagingTownsKey(map))
  const table = obj ? await obj.json() : null
  _towns.set(map, { table, at: Date.now() })
  return table
}
// Former map names → current ones (`staging/renamed.json`). Read at most once a minute per isolate;
// ⛔ a record that is not a { string: string } object throws — a broken table is never "no renames".
let _renamed = null
async function renamedTable(env) {
  if (_renamed && Date.now() - _renamed.at < 60_000) return _renamed.table
  const obj = await env.ASSETS.get('staging/renamed.json')
  const table = obj ? await obj.json() : {}
  if (!table || typeof table !== 'object' || Array.isArray(table) || Object.values(table).some(v => typeof v !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(v))) {
    throw new Error('staging/renamed.json is not a { "<old map>": "<new map>" } table')
  }
  _renamed = { table, at: Date.now() }
  return table
}

async function shareCard(response, map, url, env, kitBase) {
  const manObj = await env.ASSETS.get(`staging/baked/${map}/manifest.json`)
  const manifest = manObj ? await manObj.json() : null
  const path = url.pathname.slice(`/${map}`.length) || '/'   // the path within the town, as production sees it
  const towns = await townRecord(env, map), tKey = stagingTownsKey(map)
  const card = cardFor({ town: towns?.[map] || null, townWhy: towns ? `${tKey} has no entry for "${map}"` : `no towns record at ${tKey}`, map, path,
    manifest, slabBase: `${env.SLAB_BASE}baked/${map}/`, pageUrl: `${url.origin}/${map}/`,
    ...await placeListings(env, `staging/baked/${map}/`, manifest, path), when: new Date() })
  const { domain } = await townDomain(env, map)
  return withShareCard(new HTMLRewriter()
    // ⭐ WHERE THE SLAB IS — the published player is built with `VITE_ASSET_BASE=runtime` and
    // reads this (`src/lib/bakedUrl.js`), so the same bytes can be promoted to a town's domain.
    // ⛔ `SLAB_BASE` is required: without it the player refuses to load rather than guess.
    // ⭐ WHERE THE RENDERER'S OWN FILES ARE — for a Ward town, the kit bundle its build pins
    // (`src/lib/kitUrl.js`); the kit's player declares its own, so it gets none here.
    .on('head', { element(el) {
      el.prepend(`<meta name="ward-asset-base" content="${env.SLAB_BASE}" />`
        + (kitBase ? `<meta name="ward-kit-base" content="${kitBase}" />` : '')
        + (domain ? `<meta name="ward-domain" content="${domain}" />` : ''), { html: true })
    } }), response, card, { site: 'staging-sites', map })
}

// An object stored encoded is sent as stored, never encoded twice (production-sites#serve, the same rule).
function serve(request, obj, cacheControl) {
  const key = obj.key
  const wire = wireHeaders(obj)
  const headers = new Headers({
    ...wire,
    'cache-control': cacheControl || cacheFor(key, wire['content-type']),
    etag: obj.httpEtag,
    // Unlisted, but durable (ruled 2026-09-21): a partner holds this address and returns
    // to it. ⛔ Unlisted is not private — it is simply not advertised — so the only thing
    // asserted here is that search engines should not index it.
    'x-robots-tag': 'noindex, nofollow',
  })
  if (request.method === 'HEAD') return new Response(null, { headers })
  return new Response(obj.body, 'content-encoding' in wire ? { headers, encodeBody: 'manual' } : { headers })
}
