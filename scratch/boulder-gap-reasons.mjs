// boulder-gap-reasons.mjs — WHY IS THE WALL OPEN HERE?
// For every substantial BARE gap with armour on at least one side, report the reason
// composition of its stations. Distinguishes a COVERAGE gap (the arc leaves the baked
// heightfield — no ruling was possible) from a RULING that the shore is bare.
// ▶ node scratch/boulder-gap-reasons.mjs [minGapM]
import { readFileSync } from 'node:fs'
import { shoreArmourFor } from '../cartograph/shore-armour.mjs'
const MIN = Number(process.argv[2] ?? 25)
const doc = JSON.parse(readFileSync('public/baked/huron/revetment.json', 'utf8'))
const osm = JSON.parse(readFileSync('cartograph/data/huron/raw/osm.json', 'utf8'))
const armourAt = shoreArmourFor(osm.ground || {})

const tally = {}, gaps = []
for (const a of doc.arcs) {
  const st = a.stations, segs = []; let i = 0
  while (i < st.length) {
    const v = !!st[i].armour; let j = i, len = 0
    while (j < st.length && !!st[j].armour === v) { if (j > i) len += Math.hypot(st[j].x - st[j-1].x, st[j].z - st[j-1].z); j++ }
    segs.push({ v, len, i0: i, i1: j - 1 }); i = j
  }
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k]
    if (s.v || s.len < MIN) continue
    const touchesArmour = (k > 0 && segs[k-1].v) || (k < segs.length - 1 && segs[k+1].v)
    if (!touchesArmour) continue
    const why = {}
    for (let n = s.i0; n <= s.i1; n++) {
      const p = st[n]
      // ⭐ crest null IS the no-terrain case: bake-revetment writes null when the
      // heightfield has nothing under the station, and armourAt then says so itself.
      const w = p.crest == null ? 'no-height' : armourAt(p.x, p.z, p.crest).why
      why[w] = (why[w] || 0) + 1
      tally[w] = (tally[w] || 0) + 1
    }
    const mid = st[(s.i0 + s.i1) >> 1]
    gaps.push({ arc: a.index, len: s.len, x: mid.x, z: mid.z, why })
  }
}
gaps.sort((p, q) => q.len - p.len)
console.log(`bare gaps >= ${MIN} m with armour on at least one side: ${gaps.length}\n`)
console.log('  len(m)   arc   centre x,z            reason composition')
for (const g of gaps.slice(0, 20)) {
  const w = Object.entries(g.why).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join(' · ')
  console.log(`  ${g.len.toFixed(0).padStart(6)}  ${String(g.arc).padStart(4)}   ${g.x.toFixed(0).padStart(7)},${g.z.toFixed(0).padStart(7)}   ${w}`)
}
console.log(`\nALL GAP STATIONS BY REASON:`)
const tot = Object.values(tally).reduce((p,c)=>p+c,0)
for (const [k,n] of Object.entries(tally).sort((a,b)=>b[1]-a[1])) console.log(`   ${k.padEnd(20)} ${String(n).padStart(4)}  ${(100*n/tot).toFixed(1)}%`)
