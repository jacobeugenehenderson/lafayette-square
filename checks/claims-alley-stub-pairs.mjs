#!/usr/bin/env node
// ⭐⭐⭐ IS "BRIDGE THE ALLEY ACROSS A JUNCTION" A RULE, OR A SPECIAL CASE?
// An alley crossing a street is stored as TWO chains with a hole where the street is, so the alley
// RIBBON has a gap exactly where a subtraction would need to bite. Bridging the two stubs would
// make the ped stop at the alley — but only if the pairing is decidable from GEOMETRY, without
// asking the chain graph which street split them (`A15`: no proximity recovery of a chain label).
// This scores the population BEFORE any code is written:
//   · how many stub pairs look bridgeable (facing, roughly colinear, a gap)
//   · the gap distribution — a rule that bridges 14 m must not join two unrelated alleys 14 m apart
//   · whether a STREET actually lies in the gap (what makes it a junction rather than a hole)
// ▶ node checks/claims-alley-stub-pairs.mjs [scene]
import { feed } from '../scratch/_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
const f = feed(scene); if (!f) process.exit(1)
const XY = p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]
const A = (f.ribbons.alleys || []).map((a, i) => ({ i, pts: (a.points || []).map(XY) })).filter(a => a.pts.length > 1)
const ends = []
for (const a of A) {
  const P = a.pts
  ends.push({ a: a.i, p: P[0],            dir: unit(P[1], P[0]) })              // outward at the start
  ends.push({ a: a.i, p: P[P.length - 1], dir: unit(P[P.length - 2], P[P.length - 1]) })
}
function unit(from, to) { const dx = to[0]-from[0], dz = to[1]-from[1], L = Math.hypot(dx,dz)||1; return [dx/L, dz/L] }
const STREETS = f.ribbons.streets.filter(s => (s.points||[]).length > 1)
const segDist = (P, x, z) => { let best = Infinity
  for (let i = 0; i + 1 < P.length; i++) { const [ax,az]=P[i],[bx,bz]=P[i+1]
    const dx=bx-ax, dz=bz-az, L2=dx*dx+dz*dz||1
    let t=((x-ax)*dx+(z-az)*dz)/L2; t=Math.max(0,Math.min(1,t))
    best = Math.min(best, Math.hypot(x-(ax+dx*t), z-(az+dz*t))) }
  return best }
const pairs = []
for (let i = 0; i < ends.length; i++) for (let j = i+1; j < ends.length; j++) {
  const e = ends[i], g = ends[j]
  if (e.a === g.a) continue                                   // same alley's own two ends
  const gap = Math.hypot(e.p[0]-g.p[0], e.p[1]-g.p[1])
  if (gap > 30) continue
  // FACING: each stub's outward direction points at the other
  const toG = unit(e.p, g.p)
  const facingE = e.dir[0]*toG[0] + e.dir[1]*toG[1]
  const facingG = g.dir[0]*(-toG[0]) + g.dir[1]*(-toG[1])
  if (facingE < 0.85 || facingG < 0.85) continue               // not aimed at each other
  // is a STREET in the gap? (that is what makes it a junction, not a hole in the data)
  const mx=(e.p[0]+g.p[0])/2, mz=(e.p[1]+g.p[1])/2
  let nearest = Infinity, who = null
  for (const s of STREETS) { const d = segDist((s.points||[]).map(XY), mx, mz); if (d < nearest) { nearest = d; who = s } }
  pairs.push({ gap, nearest, who: who?.skelId, colin: Math.min(facingE, facingG) })
}
const q = (a,p) => { const b=[...a].sort((x,y)=>x-y); return b.length? b[Math.min(b.length-1,Math.floor(b.length*p))] : NaN }
const gaps = pairs.map(p=>p.gap)
const withStreet = pairs.filter(p => p.nearest < 2)
console.log(`${scene}: ${A.length} alley chains · ${ends.length} stub ends`)
console.log(`   facing pairs within 30 m           : ${pairs.length}`)
if (pairs.length) console.log(`   gap (m): p10 ${q(gaps,.1).toFixed(1)} · median ${q(gaps,.5).toFixed(1)} · p90 ${q(gaps,.9).toFixed(1)} · max ${q(gaps,1).toFixed(1)}`)
console.log(`   ⭐ pairs with a STREET centreline in the gap (<2 m): ${withStreet.length}`)
console.log(`   ⛔ pairs with NO street in the gap                 : ${pairs.length - withStreet.length}  ← bridging these would join unrelated alleys`)
for (const p of withStreet.sort((a,b)=>a.gap-b.gap).slice(0,12))
  console.log(`      gap ${p.gap.toFixed(1).padStart(5)} m · street ${String(p.who).padEnd(24)} ${p.nearest.toFixed(2)} m from the midpoint`)
