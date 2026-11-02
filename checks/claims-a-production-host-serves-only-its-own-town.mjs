/**
 * A TOWN'S PRODUCTION DOMAIN SERVES THAT TOWN AND NOTHING ELSE — and only a domain we own, live.
 *
 * ⭐ Drives the production Worker's routing (`workers/production-sites/src/route.js`) and the one
 * domain decision all three callers share (`src/lib/productionDomain.js`) with no Cloudflare in the
 * loop. The failure this guards is Layer 0 q2 in its worst form: a partner at their own domain shown
 * another town's map, looking entirely normal.
 *
 *   node checks/claims-a-production-host-serves-only-its-own-town.mjs
 */
import { route, wwwRedirect } from '../workers/production-sites/src/route.js'
import { decideProductionDomain } from '../src/lib/productionDomain.js'

const W = 'a'.repeat(40), K = 'b'.repeat(40)
const rec = { v: 2, app: 'ward', map: 'provincetown', look: 'provincetown', ward: W, kit: K } /* fixture */
let failed = 0
const expect = (what, ok, got) => {
  if (ok) console.log(`  ✅ ${what}`)
  else { failed++; console.error(`  ⛔ ${what}\n       got ${JSON.stringify(got)}`) }
}
console.log('A production host serves only its own town\n')

let r = route('/', rec)
expect('the bare domain is this town\'s pinned Ward build', r.kind === 'document' && r.key === `ward/${W}/index.html`, r)
r = route('/place/ptwn-lst-0001', rec)
expect('an SPA route is this town\'s pinned Ward build', r.kind === 'document' && r.key === `ward/${W}/index.html`, r)
r = route('/_player/assets/index-abc12345.js', rec)
expect('/_player/ (the retired legacy player) is refused by name, never read from the bucket', r.kind === 'refuse' && r.status === 404 && /retired/.test(r.why), r)
for (const legacy of [{ v: 2, app: 'legacy', map: 'provincetown', look: 'provincetown' }, { map: 'provincetown', look: 'provincetown', player: '2026-09-28T08:20:15.084Z' }]) {
  r = route('/', legacy)
  expect(`a record naming the retired legacy player (${legacy.v ? 'v2' : 'pre-v2'}) refuses by name, never served the Ward`, r.kind === 'refuse' && r.status === 500 && /retired player \(legacy\)/.test(r.why), r)
}
for (const p of ['/baked/provincetown/scene.json', '/live/provincetown/listings.json', '/setpieces/provincetown/pilgrim-monument.glb']) {
  r = route(p, rec)
  expect(`${p} is this town's prod key`, r.kind === 'slab' && r.key === p.slice(1), r)
}
for (const p of ['/baked/lafayette-square/scene.json', '/live/huron/listings.json', '/staging/baked/provincetown/scene.json',
  '/player/huron/index.html', '/hosts/provincetown.online.json', '/baked/provincetown/../huron/scene.json', '/_player/../hosts/x.json']) {
  r = route(p, rec)
  expect(`${p} is REFUSED`, r.kind === 'refuse' && r.status >= 400, r)
}
r = route('/', { map: 'provincetown' }) /* fixture */
expect('a record with no look is refused, not defaulted', r.kind === 'refuse', r)
r = route('/', null)
expect('no record is refused, not defaulted', r.kind === 'refuse', r)

expect('www 301s to the apex, path and query kept',
  wwwRedirect(new URL('https://www.provincetown.online/place/x?y=1')) === 'https://provincetown.online/place/x?y=1')
expect('the apex is not redirected', wwwRedirect(new URL('https://provincetown.online/')) === null)

const ok = decideProductionDomain('provincetown', { domain: 'Provincetown.online', owned: true, zoneStatus: 'active' }) /* fixture */
expect('owned + active → the domain', ok.domain === 'provincetown.online', ok)
for (const [what, a] of [['not owned', { domain: 'huron.online', owned: false, zoneStatus: 'active' }],
  ['zone pending', { domain: 'provincetown.online', owned: true, zoneStatus: 'pending' }],
  ['no zone', { domain: 'provincetown.online', owned: true }],
  ['no domain', { domain: null }], ['an error', { error: 'no Ward has mapId "x"' }], ['no answer', null]]) {
  const d = decideProductionDomain('x', a)
  expect(`${what} → refused with a reason`, d.domain === null && typeof d.why === 'string' && d.why.length > 0, d)
}
process.exit(failed ? 2 : 0)
