/**
 * theward-staging-sites — every town's staging site, from one Worker; each town names its player.
 *
 *   `staging.theward.online/_player/<file>`      →  R2 `staging/player/<file>`     (the kit's player)
 *   `staging.theward.online/_ward/<sha>/<file>`  →  R2 `staging/ward/<sha>/<file>` (The Ward's build)
 *   `staging.theward.online/<map>/…`             →  the document of the player that town's record names
 *   `staging.theward.online/<former map>/…`      →  301 to `/<map>/…`, from R2 `staging/renamed.json`
 *
 * ⭐⭐ EACH TOWN NAMES ITS PLAYER, AND A TOWN THAT NAMES NONE IS A 404 (BRIEF-ward-on-staging, 2026-09-28).
 * `staging/sites/<map>/player.json` says `ward` or `legacy`; `scripts/set-staging-player.mjs` writes it.
 * ⛔ There is no default player: a town silently served the wrong one is the plausible-looking
 * success `CLAUDE.md` Layer 0 q2 forbids. `ward` serves the build `staging/ward/current.json` points at
 * and stamps `<meta name="ward-kit-base">` — the versioned renderer bundle on the asset host
 * (`scripts/publish-kit-bundle.mjs`) for the kit that build was made against. `legacy` serves the kit's
 * player below, which declares its own kit base. ⚠️ `/_player/` and `legacy` are deleted at cutover
 * (the Ward's README §9), not before: until then `legacy` needs them.
 *
 * ⭐⭐ ONE BUILD PER PLAYER, NOT ONE PER TOWN. A town is a slab instantiated inside the player,
 * so each player is compiled once and every town on it is served the same bytes; the app
 * reads its town off the first path segment and fetches that town's slab from R2 at runtime. ⛔ A
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
// The path segments that are NOT towns (a map id cannot start with `_`). ⛔ Keep each in step
// with its build's `--base`.
const PLAYER_SEGMENT = '_player'
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

    // ⛔⛔ WHICH PLAYER — the town's record says, and nothing else may. No record is a 404 that
    // names the town and the record; an unreadable or unknown record is a 500 that says so.
    const recordKey = `${env.SITE_PREFIX}${map}/player.json`
    const recordObj = await env.ASSETS.get(recordKey)
    if (!recordObj) {
      return text(`"${map}" names no player — nothing at ${recordKey}. There is no default player. `
        + `▶ node scripts/set-staging-player.mjs --map=${map} --player=ward`, 404)
    }
    let player
    try { player = (await recordObj.json()).player } catch { player = undefined }

    // Anything under a town that looks like a FILE is that town's own asset; everything
    // else is an SPA route and gets the town's player.
    const wantsTownFile = Boolean(rest) && looksLikeFile(rest)
    if (wantsTownFile) {
      const obj = await env.ASSETS.get(`${env.SITE_PREFIX}${map}/${rest}`)
      return obj ? serve(request, obj) : text(`"${map}" has no "${rest}".`, 404)
    }

    // ⛔ SAY WHICH THING IS MISSING. A town without an asset and a DEPLOY with no player in it
    // look identical from outside; the second is every town on that player at once.
    if (player === 'legacy') {
      const obj = await env.ASSETS.get(`${env.PLAYER_PREFIX}index.html`)
      if (!obj) {
        return text(`the kit's player is not published — nothing at ${env.PLAYER_PREFIX}index.html. `
          + `This affects EVERY town on "legacy", not just "${map}". ▶ node scripts/publish-player-to-staging.mjs`, 404)
      }
      return shareCard(serve(request, obj), map, url, env, null)
    }
    if (player === 'ward') {
      const ward = await wardBuild(env)
      if (ward.error) return text(`${ward.error} This affects EVERY town on "ward", not just "${map}".`, ward.status)
      return shareCard(serve(request, ward.doc), map, url, env, `${env.SLAB_BASE}kit/${ward.kit}/`)
    }
    return text(`${recordKey} names player ${JSON.stringify(player)}; a town's player is "ward" or "legacy". `
      + `▶ node scripts/set-staging-player.mjs --map=${map} --player=ward`, 500)
  },
}

/**
 * The Ward build every "ward" town serves: `current.json` (written LAST by the Ward's publish, so a
 * half-upload never serves), that build's document, and proof its kit bundle is on the asset host —
 * a page pointed at a missing bundle would draw with no textures and no clouds, and look like a site.
 */
async function wardBuild(env) {
  const pointerKey = `${env.WARD_PREFIX}current.json`
  const pointer = await env.ASSETS.get(pointerKey)
  if (!pointer) return { status: 404, error: `the Ward is not published — nothing at ${pointerKey}. ▶ theward: npm run publish:staging` }
  let cur
  try { cur = await pointer.json() } catch { cur = null }
  const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)
  if (!isSha(cur?.sha) || !isSha(cur?.kit)) {
    return { status: 500, error: `${pointerKey} must name a Ward commit ("sha") and the kit commit it was built against ("kit"); it says ${JSON.stringify(cur)}.` }
  }
  const bundleKey = `staging/kit/${cur.kit}/manifest.json`
  if (!(await env.ASSETS.head(bundleKey))) {
    return { status: 404, error: `the kit bundle for ${cur.kit} is not published — nothing at ${bundleKey}. ▶ node scripts/publish-kit-bundle.mjs --sha=${cur.kit}` }
  }
  const doc = await env.ASSETS.get(`${env.WARD_PREFIX}${cur.sha}/index.html`)
  if (!doc) return { status: 404, error: `the Ward build ${cur.sha} has no index.html, though ${pointerKey} points at it.` }
  return { doc, kit: cur.kit }
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
    // ⭐ WHERE THE RENDERER'S OWN FILES ARE — for a Ward town, the kit bundle its build pins
    // (`src/lib/kitUrl.js`); the kit's player declares its own, so it gets none here.
    .on('head', { element(el) {
      el.prepend(`<meta name="ward-asset-base" content="${env.SLAB_BASE}" />`
        + (kitBase ? `<meta name="ward-kit-base" content="${kitBase}" />` : '')
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

function serve(request, obj, cacheControl) {
  const key = obj.key
  const contentType = obj.httpMetadata?.contentType || typeFor(key)
  const headers = new Headers({
    'content-type': contentType,
    'cache-control': cacheControl || cacheFor(key, contentType),
    etag: obj.httpEtag,
    // Unlisted, but durable (ruled 2026-09-21): a partner holds this address and returns
    // to it. ⛔ Unlisted is not private — it is simply not advertised — so the only thing
    // asserted here is that search engines should not index it.
    'x-robots-tag': 'noindex, nofollow',
  })
  if (request.method === 'HEAD') return new Response(null, { headers })
  return new Response(obj.body, { headers })
}
