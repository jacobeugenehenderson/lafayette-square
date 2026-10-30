// the take-out on the arrangement (plumb/takeout-arrangement-2): PTown v5 fixture, deck 0's loc ring round edges 82-88 with their tags, the site the open refuses at. node scratch/cut-once/takeout-84-trace.mjs
import fs from 'fs'
const S = await import('../../cartograph/structures.mjs'), K = await import('../../cartograph/openClose.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`../../checks/fixtures/cut-once-${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks'), stepM = coast.fineM, cellU = stepM * 1000
const toP = (r) => r.map(([x, z]) => ({ X: Math.round(x * 1000), Y: Math.round(z * 1000) }))
const mine = (rs) => K.tagOwn(rs.map(toP)), waterT = mine(coast.water.flatMap(b => [b.outer, ...b.holes])), decksT = sd.rings.map(r => mine([r]))
const w0 = K.boolOf('minus', waterT, decksT.flat(), 'w0'), D = decksT[0], loc = K.boolOf('intersect', w0, K.growBy(D, 2 * cellU, 'deck 0'), 'loc')
const R = loc[0], n = R.length
console.log(`loc: ${loc.length} ring(s); ring 0 ${n} edges; edges 82–88:`)
for (let i = 82; i <= 88; i++) { const a = R[i % n], b = R[(i + 1) % n]; console.log(`  e${i} (${a.X},${a.Y}) → (${b.X},${b.Y}) ${Math.hypot(b.X - a.X, b.Y - a.Y).toFixed(1)} u ${(Math.atan2(b.Y - a.Y, b.X - a.X) * 180 / Math.PI).toFixed(2)}°`) }
const lab = (t) => JSON.stringify(t)
for (let i = 83; i <= 87; i++) console.log(`  tag e${i}: ${lab(R[i % n].tag)}`)
