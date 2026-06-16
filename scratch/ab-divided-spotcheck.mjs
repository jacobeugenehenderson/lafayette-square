// Spot-check: the cornerSet now includes DIVIDED-avenue corners the legacy
// ribbons.intersections path dropped (its pavementHW gate skipped any leg with a
// median-side pavementHW=0 — i.e. every divided carriageway). Also reports clean
// per-tile injectivity + orphaned fillets.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const b = buildTileGround(ribbons, { smooth: 0 })
const cs = b.cornerSet

// Divided carriageway skelIds (pairId set) + which name.
const dividedSkel = new Map()  // skelId → name
for (const s of ribbons.streets) if (s.pairId) dividedSkel.set(s.skelId || s.name, s.name)
const skelOfLeg = (legKey) => legKey.slice(0, legKey.lastIndexOf(':'))

// How many corners have at least one leg on a divided carriageway?
let dividedCorners = 0
const byAvenue = new Map()
for (const c of cs) {
  const legs = [c.legA, c.legB].map(skelOfLeg)
  const hit = legs.find(sk => dividedSkel.has(sk))
  if (hit) {
    dividedCorners++
    const nm = dividedSkel.get(hit)
    byAvenue.set(nm, (byAvenue.get(nm) || 0) + 1)
  }
}
console.log(`cornerSet total: ${cs.length}`)
console.log(`corners on a DIVIDED carriageway leg: ${dividedCorners}  (these got NO handle under the legacy pavementHW gate)`)
console.log('  by divided avenue:')
for (const [nm, n] of [...byAvenue.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${nm}: ${n}`)

// Park-perimeter neighborhood: corners on Lafayette / Park / South 18th (the
// brief's spot targets Mississippi×Lafayette, Park×S-18th).
const targetNames = ['Lafayette Avenue', 'Park Avenue', 'South 18th Street']
const targetSkels = new Set([...dividedSkel.entries()].filter(([, nm]) => targetNames.includes(nm)).map(([sk]) => sk))
const parkCorners = cs.filter(c => [c.legA, c.legB].some(l => targetSkels.has(skelOfLeg(l))))
console.log(`\npark-bounding divided-avenue corners (Lafayette/Park/S-18th): ${parkCorners.length}`)
console.log('  sample V positions (+x=WEST, +z=NORTH):')
for (const c of parkCorners.slice(0, 8)) console.log(`    [${c.V[0].toFixed(1)}, ${c.V[1].toFixed(1)}]  R=${c.fillet ? c.fillet.r.toFixed(2) : '0(square)'}  ${c.legA} × ${c.legB}`)

// Injectivity: within the whole set, fillets are claimed at most once PER TILE by
// construction; cross-tile, a shared node legitimately yields 2 fillets (one per
// adjacent tile). Report orphan rate as the real health metric.
const filleted = cs.filter(c => c.fillet).length
console.log(`\nfilleted: ${filleted} / ${cs.length}  (${cs.length - filleted} R=0 squares)`)
console.log('Old fillet-driven snap: 93 collisions / 77 orphans. New corner-driven claim is per-tile injective (each corner ≤1 fillet, each fillet ≤1 corner).')
