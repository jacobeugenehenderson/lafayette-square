// deadend-triple-sets.mjs — is the 70/29/50 dead-end discrepancy a clean
// nesting (29 pendant-tip ⊂ 50 cap ⊂ 70 deadend), or do the three subsystems
// disagree on WHICH nodes are dead ends? Answers the premise CP1 rests on.
// READ-ONLY. Positions quantized to 0.1 m for spatial coincidence.
import fs from 'fs'
const r = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const Q = 10
const key = (x, z) => Math.round(x * Q) + ',' + Math.round(z * Q)

// SET A — skeleton deadend nodes (junctions kind=deadend) → 70
const A = new Map()
for (const j of r.junctions || []) if (j.kind === 'deadend') A.set(key(j.x, j.z), j)

// SET B — junctionMap pendant-tip → 29
const B = new Map()
for (const n of r.junctionMap?.nodes || []) if ((n.kinds || []).includes('pendant-tip')) B.set(key(n.at[0], n.at[1]), n)

// SET C — frozen face caps (tiles[].caps → ring[vertexIdx]) → 50
const C = new Map()
for (const t of r.tiles || []) for (const c of t.caps || []) {
  const p = t.ring[c.vertexIdx]; if (p) C.set(key(p[0], p[1]), { ...c, at: p })
}

console.log(`SET A deadend (skeleton junctions) : ${A.size}`)
console.log(`SET B pendant-tip (junctionMap)    : ${B.size}`)
console.log(`SET C cap (frozen face topology)   : ${C.size}  (distinct positions; ${[...r.tiles].reduce((s,t)=>s+(t.caps?.length||0),0)} cap records)`)

// Nearest-match overlap (positions may quantize apart by cm across derivations):
// count a member of X "present in Y" if some Y key is within TOL metres.
const TOL = 1.0
const near = (pk, other) => {
  const [x, z] = pk.split(',').map(Number).map(v => v / Q)
  for (const ok of other.keys()) {
    const [ox, oz] = ok.split(',').map(Number).map(v => v / Q)
    if (Math.hypot(x - ox, z - oz) <= TOL) return true
  }
  return false
}
const overlap = (X, Y) => [...X.keys()].filter(k => near(k, Y)).length
console.log(`\n--- pairwise overlap (within ${TOL} m) ---`)
console.log(`B(pendant) ⊂ A(deadend)? ${overlap(B, A)}/${B.size}`)
console.log(`B(pendant) ⊂ C(cap)?     ${overlap(B, C)}/${B.size}`)
console.log(`C(cap)     ⊂ A(deadend)? ${overlap(C, A)}/${C.size}`)
console.log(`C(cap)     ⊂ B(pendant)? ${overlap(C, B)}/${C.size}`)
console.log(`A(deadend) ⊂ C(cap)?     ${overlap(A, C)}/${A.size}`)
console.log(`A(deadend) ⊂ B(pendant)? ${overlap(A, B)}/${A.size}`)

// Who's in C (real rendered cap) but NOT pendant-tip? (junctionMap under-stamps)
console.log(`\n--- C caps NOT stamped pendant-tip in junctionMap (the 50→29 gap) ---`)
let miss = 0
for (const [k, c] of C) if (!near(k, B)) { miss++; if (miss <= 25) console.log(`  ${c.skelId} @ [${c.at[0].toFixed(1)},${c.at[1].toFixed(1)}] capEnd=${c.capEnd}`) }
console.log(`  total: ${miss}`)

// Who's a skeleton deadend but NOT a real cap? (the boundary danglers, 70→50)
console.log(`\n--- A deadends that are NOT real face caps (the 70→50 gap = danglers?) ---`)
let dang = 0
for (const [k, j] of A) if (!near(k, C)) { dang++; if (dang <= 25) console.log(`  deg=${j.degree} @ [${j.x.toFixed(1)},${j.z.toFixed(1)}]`) }
console.log(`  total: ${dang}`)
