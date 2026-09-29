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

const rec = { v: 2, app: 'legacy', map: 'provincetown', look: 'provincetown' }
let failed = 0
const expect = (what, ok, got) => {
  if (ok) console.log(`  ✅ ${what}`)
  else { failed++; console.error(`  ⛔ ${what}\n       got ${JSON.stringify(got)}`) }
}
console.log('A production host serves only its own town\n')

let r = route('/', rec)
expect('the bare domain is this town\'s pinned player', r.kind === 'document' && r.key === 'player/provincetown/index.html', r)
r = route('/place/ptwn-lst-0001', rec)
expect('an SPA route is this town\'s pinned player', r.kind === 'document' && r.key === 'player/provincetown/index.html', r)
r = route('/_player/assets/index-abc12345.js', rec)
expect('/_player/ is this town\'s PINNED copy, not the shared staging player', r.kind === 'player' && r.key === 'player/provincetown/assets/index-abc12345.js', r)
for (const p of ['/baked/provincetown/scene.json', '/live/provincetown/listings.json', '/setpieces/provincetown/pilgrim-monument.glb']) {
  r = route(p, rec)
  expect(`${p} is this town's prod key`, r.kind === 'slab' && r.key === p.slice(1), r)
}
for (const p of ['/baked/lafayette-square/scene.json', '/live/huron/listings.json', '/staging/baked/provincetown/scene.json',
  '/player/huron/index.html', '/hosts/provincetown.online.json', '/baked/provincetown/../huron/scene.json', '/_player/../hosts/x.json']) {
  r = route(p, rec)
  expect(`${p} is REFUSED`, r.kind === 'refuse' && r.status >= 400, r)
}
r = route('/', { map: 'provincetown' })
expect('a record with no look is refused, not defaulted', r.kind === 'refuse', r)
r = route('/', null)
expect('no record is refused, not defaulted', r.kind === 'refuse', r)

expect('www 301s to the apex, path and query kept',
  wwwRedirect(new URL('https://www.provincetown.online/place/x?y=1')) === 'https://provincetown.online/place/x?y=1')
expect('the apex is not redirected', wwwRedirect(new URL('https://provincetown.online/')) === null)

const ok = decideProductionDomain('provincetown', { domain: 'Provincetown.online', owned: true, zoneStatus: 'active' })
expect('owned + active → the domain', ok.domain === 'provincetown.online', ok)
for (const [what, a] of [['not owned', { domain: 'huron.online', owned: false, zoneStatus: 'active' }],
  ['zone pending', { domain: 'provincetown.online', owned: true, zoneStatus: 'pending' }],
  ['no zone', { domain: 'provincetown.online', owned: true }],
  ['no domain', { domain: null }], ['an error', { error: 'no Ward has mapId "x"' }], ['no answer', null]]) {
  const d = decideProductionDomain('x', a)
  expect(`${what} → refused with a reason`, d.domain === null && typeof d.why === 'string' && d.why.length > 0, d)
}
process.exit(failed ? 2 : 0)
