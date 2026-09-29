/**
 * THE DEVICE-LINK URL LANDS ON THE APP'S PAGE — on staging and on a town's own domain.
 *
 * The QR (`src/App.jsx`, via `src/lib/townOrigin.js#currentSiteUrl`) points at
 * `staging.theward.online/<map>/link/<token>` on staging and `<domain>/link/<token>` in production.
 * ⛔ Before 2026-09-26 it pointed at `…/_player/link/<token>`, which both Workers answer as a missing
 * FILE — a 404 on a phone, mid-handoff. This drives each Worker's real `fetch` with a fake bucket and
 * asserts the link path gets the player's index.html (the SPA), not a 404; and that the app's router
 * strips the town segment so `/huron/link/<token>` is the link page.
 *
 *   node checks/claims-the-device-link-page-is-served-on-both-sites.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Workers-runtime stand-ins: a pass-through HTMLRewriter and an in-memory R2.
globalThis.HTMLRewriter = class { on() { return this } transform(r) { return r } }
const obj = (key, body) => ({ key, body, size: body.length, httpEtag: '"x"', httpMetadata: {},
  json: async () => JSON.parse(body) })
const bucket = (keys) => ({
  get: async (k) => (k in keys ? obj(k, keys[k]) : null),
  head: async (k) => (k in keys ? obj(k, '') : null),
})

const staging = (await import('../workers/staging-sites/src/index.js')).default
const production = (await import('../workers/production-sites/src/index.js')).default

let failed = 0
const expect = async (what, res, wantIndex) => {
  const body = res.status === 200 ? await res.text() : ''
  const ok = res.status === 200 && body === wantIndex
  if (ok) console.log(`  ✅ ${what}`)
  else { failed++; console.error(`  ⛔ ${what} — got ${res.status} ${body.slice(0, 80)}`) }
}
console.log('The device-link page is served on both sites\n')

const stgEnv = { SLAB_BASE: 'https://assets.theward.online/staging/', PLAYER_PREFIX: 'staging/player/', SITE_PREFIX: 'staging/sites/',
  ASSETS: bucket({ 'staging/player/index.html': 'STAGING-INDEX', 'staging/baked/huron/manifest.json': '{}',
    // A staging town serves the player its record names (claims-a-staging-town-names-its-player); this route is the kit's.
    'staging/sites/huron/player.json': JSON.stringify({ player: 'legacy' }) }) }
await expect('staging  /huron/link/AbC123 → the player page',
  await staging.fetch(new Request('https://staging.theward.online/huron/link/AbC123'), stgEnv), 'STAGING-INDEX')

const prodEnv = { ASSETS: bucket({
  'hosts/provincetown.online.json': JSON.stringify({ map: 'provincetown', look: 'provincetown', domain: 'provincetown.online' }),
  'player/provincetown/index.html': 'PROD-INDEX', 'baked/provincetown/manifest.json': '{}' }) }
await expect('prod     provincetown.online/link/AbC123 → the player page',
  await production.fetch(new Request('https://provincetown.online/link/AbC123'), prodEnv), 'PROD-INDEX')

// ⛔ Negative control — the URL the QR used to carry. If this ever serves the page, the check above
// proves nothing about the fix.
for (const [site, w, env, url] of [['staging', staging, stgEnv, 'https://staging.theward.online/_player/link/AbC123'],
  ['prod', production, prodEnv, 'https://provincetown.online/_player/link/AbC123']]) {
  const r = await w.fetch(new Request(url), env)
  if (r.status === 404) console.log(`  ✅ ${site.padEnd(8)} the old …/_player/link/<token> 404s (the defect this fixed)`)
  else { failed++; console.error(`  ⛔ ${site} the old _player link answered ${r.status} — the control is not a control`) }
}

// The router: the town segment must be stripped before routes are matched.
const app = readFileSync(path.join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8')
const parse = app.slice(app.indexOf('function parseRoute()'))
if (/TOWN_PATH_PREFIX/.test(parse.slice(0, 800))) console.log('  ✅ parseRoute strips the town segment before matching /link/')
else { failed++; console.error('  ⛔ parseRoute does not strip the town segment — /huron/link/<token> matches no route') }
process.exit(failed ? 2 : 0)
