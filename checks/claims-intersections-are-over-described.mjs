#!/usr/bin/env node
// ⭐⭐⭐ HOW OVER-DESCRIBED IS AN INTERSECTION? *(Jacob, 2026-09-08: "We need to simplify the corners
// so they are able to reliably generate the correct conditions for corners.")*
// A clean crossing is TWO roads meeting at ONE node. What the kit actually has at a junction is a
// cluster of CHAIN ENDPOINTS (one road cut into many chains) plus whatever centreline sampling
// runs through it — and every one of those is a place ① can turn, i.e. a place a corner can be
// minted, missed, or doubled. This sizes that before anyone designs the cure.
// ⛔ Clusters are found by GEOMETRY (endpoints within `R`), never by chain name — a road's name is
// exactly what a cut throws away, so grouping by it would hide the thing being measured.
// ▶ node checks/claims-intersections-are-over-described.mjs [scene] [radius=12]
import { feed } from './_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
const R = Number(process.argv[3] || 12)
const f = feed(scene); if (!f) process.exit(1)
const XY = p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]
const S = f.ribbons.streets.filter(s => (s.points||[]).length > 1)
const ends = []
for (const s of S) { const P = (s.points||[]).map(XY); ends.push({ s, p: P[0] }, { s, p: P[P.length-1] }) }
// single-link clustering on endpoint proximity
const used = new Array(ends.length).fill(false), clusters = []
for (let i = 0; i < ends.length; i++) { if (used[i]) continue
  const q = [i]; used[i] = true; const c = [ends[i]]
  while (q.length) { const k = q.pop()
    for (let j = 0; j < ends.length; j++) { if (used[j]) continue
      if (Math.hypot(ends[k].p[0]-ends[j].p[0], ends[k].p[1]-ends[j].p[1]) <= R) { used[j]=true; q.push(j); c.push(ends[j]) } } }
  clusters.push(c) }
const junctions = clusters.filter(c => c.length >= 2)
const stats = junctions.map(c => {
  const chains = new Set(c.map(e => e.s.skelId))
  const cx = c.reduce((a,e)=>a+e.p[0],0)/c.length, cz = c.reduce((a,e)=>a+e.p[1],0)/c.length
  // centreline vertices of ANY chain passing within R of the cluster centre
  let thru = 0
  for (const s of S) for (const p of (s.points||[]).map(XY)) if (Math.hypot(p[0]-cx,p[1]-cz) <= R) thru++
  return { ends: c.length, chains: chains.size, thru }
})
const q = (a,p) => { const b=[...a].sort((x,y)=>x-y); return b.length? b[Math.min(b.length-1,Math.floor(b.length*p))] : NaN }
const E = stats.map(s=>s.ends), C = stats.map(s=>s.chains), T = stats.map(s=>s.thru)
console.log(`${scene}: ${S.length} chains · ${junctions.length} endpoint clusters within ${R} m`)
console.log(`   chain ENDPOINTS per junction : median ${q(E,.5)} · p90 ${q(E,.9)} · max ${q(E,1)}`)
console.log(`   distinct CHAINS per junction : median ${q(C,.5)} · p90 ${q(C,.9)} · max ${q(C,1)}`)
console.log(`   centreline VERTICES within ${R} m: median ${q(T,.5)} · p90 ${q(T,.9)} · max ${q(T,1)}`)
console.log(`   ⛔ junctions with MORE THAN 4 chain endpoints: ${E.filter(v=>v>4).length} (${(100*E.filter(v=>v>4).length/E.length).toFixed(0)}%)`)
console.log(`   ⛔ junctions with MORE THAN 8 centreline vertices in the box: ${T.filter(v=>v>8).length} (${(100*T.filter(v=>v>8).length/T.length).toFixed(0)}%)`)
console.log(`   ⭐ a clean crossing is 4 endpoints and ~5 vertices. Every extra of either is a place ① can turn.`)
