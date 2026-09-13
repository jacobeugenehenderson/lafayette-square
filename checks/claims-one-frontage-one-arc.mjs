#!/usr/bin/env node
// ⭐⭐⭐ THINK IN ①. A block IS a closed polygon; each edge carries one owner; a CORNER is a vertex
// where the owner CHANGES. ⇒ A block with N frontages has exactly N corners. ⛔ If an owner appears
// in TWO arcs, one is a mis-attribution, and every extra arc mints a corner the block does not have.
// ▶ node checks/claims-one-frontage-one-arc.mjs [scene ...]
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
const roadOf = id => String(id ?? '').replace(/-\d+$/, '')
let bad = 0
for (const scene of (process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square','hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  let rings = 0, ok = 0, frag = 0, extra = 0, tiny = 0, arcsAll = 0, minted = 0, raw = 0
  for (const t of T) for (const [ri, ring] of (t.iaFull || []).entries()) {
    const n = ring.length, stp = t.iaStamp[ri] || []; if (n < 3) continue
    const own = q => { const r = stp[q]; return r == null ? null : `${roadOf(t.runs[r].skelId)}|${t.runs[r].side}` }
    const seq = [], len = []
    for (let q = 0; q < n; q++) { const o = own(q); if (o == null) continue
      const a = ring[q], b = ring[(q + 1) % n]; seq.push(o); len.push(Math.hypot(b[0]-a[0], b[1]-a[1])) }
    if (!seq.length) continue
    rings++
    const arcs = [], alen = []
    for (let i = 0; i < seq.length; i++) { if (i === 0 || seq[i] !== seq[i-1]) { arcs.push(seq[i]); alen.push(0) } alen[alen.length-1] += len[i] }
    if (arcs.length > 1 && arcs[0] === arcs[arcs.length-1]) { alen[0] += alen.pop(); arcs.pop() }
    arcsAll += arcs.length; tiny += alen.filter(x => x < 2).length
    const distinct = new Set(seq).size
    if (arcs.length === distinct) ok++; else { frag++; extra += arcs.length - distinct }
    // ⭐ AND WHAT THE PAINTER MINTS, with contiguity enforced the way `sectionPassProtoTile` does:
    // keep each owner's longest arc, absorb the others into the longer neighbour.
    { const best=new Map()
      for(let i=0;i<arcs.length;i++) if(!best.has(arcs[i])||alen[i]>alen[best.get(arcs[i])]) best.set(arcs[i],i)
      const fixed=arcs.slice()
      for(let i=0;i<arcs.length;i++){ if(best.get(arcs[i])===i) continue
        const pi=(i-1+arcs.length)%arcs.length, ni=(i+1)%arcs.length
        fixed[i]= (alen[pi]>=alen[ni]? fixed[pi] : fixed[ni]) }
      let mint=0; for(let i=0;i<fixed.length;i++) if(fixed[i]!==fixed[(i-1+fixed.length)%fixed.length]) mint++
      minted+=mint; raw+=arcs.length }
  }
  console.log(`\n══ ${scene} ══`)
  console.log(`  ① rings ${rings} · ✅ every owner in ONE arc ${ok} · ⛔ FRAGMENTED ${frag}`)
  console.log(`  ⛔ extra corners minted by the fragments: ${extra}`)
  console.log(`  ·  arcs ${arcsAll}, of which under 2 m (owner flicker): ${tiny}`)
  console.log(`  ⭐ CORNERS THE PAINTER MINTS, contiguity enforced: ${minted}  (was ${raw} — ${raw-minted} false corners removed)`)
  if (frag) bad++
}
console.log(bad ? `\n⛔ FAIL — a frontage appears in more than one arc, so the block has corners it does not have.`
                : `\n✅ PASS — one frontage, one arc, one corner per frontage.`)
process.exit(bad ? 1 : 0)
