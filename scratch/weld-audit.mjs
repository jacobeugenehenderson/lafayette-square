// Audit the extractFaces endpoint-weld: replicate snapEnd exactly, report every
// cluster where genuinely-distinct endpoints (>1mm) merged. Loop-closure (same
// chain's two ends) is expected; cross-chain merges need a look (could be a
// legit near-miss slit, or a spurious junction merge).
import { readFileSync } from 'fs'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const ENDPOINT_SNAP = 0.15
const streets = r.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated)

// collect endpoints with provenance, in the SAME order extractFaces registers them
const ends = []
for (const s of streets) {
  const id = s.skelId || s.name
  ends.push({ id, which: 'start', p: s.points[0] })
  ends.push({ id, which: 'end', p: s.points[s.points.length - 1] })
}

// greedy reps (snapEnd)
const reps = []
const repIdx = []
for (const e of ends) {
  let found = -1
  for (let i = 0; i < reps.length; i++) if (Math.hypot(e.p[0] - reps[i][0], e.p[1] - reps[i][1]) < ENDPOINT_SNAP) { found = i; break }
  if (found < 0) { found = reps.length; reps.push(e.p) }
  repIdx.push(found)
}

// group endpoints by rep
const byRep = new Map()
ends.forEach((e, i) => { const k = repIdx[i]; if (!byRep.has(k)) byRep.set(k, []); byRep.get(k).push(e) })

let loopCloses = 0, exactJunctions = 0, weldClusters = 0
const flagged = []
for (const [k, grp] of byRep) {
  // max pairwise distance within the cluster
  let maxD = 0
  for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++)
    maxD = Math.max(maxD, Math.hypot(grp[i].p[0] - grp[j].p[0], grp[i].p[1] - grp[j].p[1]))
  if (maxD <= 0.001) { if (grp.length > 1) exactJunctions++; continue }   // exact-coincident junction, no real weld
  weldClusters++
  const ids = [...new Set(grp.map(e => e.id))]
  const isLoopClose = ids.length === 1 && grp.length === 2 && grp[0].id === grp[1].id
  if (isLoopClose) loopCloses++
  else flagged.push({ rep: reps[k].map(v => +v.toFixed(2)), maxD: +maxD.toFixed(3), members: grp.map(e => `${e.id}.${e.which}`) })
}

console.log(`endpoints: ${ends.length} | reps: ${reps.length}`)
console.log(`exact-coincident junctions (no weld): ${exactJunctions}`)
console.log(`genuine weld clusters (>1mm): ${weldClusters}  [loop closes: ${loopCloses}, cross-chain/other: ${flagged.length}]`)
console.log('')
if (flagged.length) {
  console.log('CROSS-CHAIN / NON-LOOP WELDS (review each):')
  for (const f of flagged) console.log(`  rep ${JSON.stringify(f.rep)}  maxGap=${f.maxD}m  ${JSON.stringify(f.members)}`)
} else {
  console.log('No cross-chain welds — every >1mm weld is a single-chain loop closure.')
}
