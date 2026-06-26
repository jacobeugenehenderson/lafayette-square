import fs from 'fs'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const frozen = ribbons.tiles
const t = frozen[53]
console.log(`tile[53] ring length ${t.ring.length}`)
t.ring.forEach((v,i)=>console.log(`  [${i}] ${v.map(x=>+x.toFixed(3))}  edge->: skelId=${t.edges[i]?.skelId} side=${t.edges[i]?.side}`))
// find albion-place spur: consecutive same skelId opposite side
const n = t.edges.length
for (let i=0;i<n;i++){
  const e=t.edges[i], en=t.edges[(i+1)%n]
  if (e.skelId===en.skelId && e.side!==en.side){
    const tip = t.ring[(i+1)%n]
    const mouthA = t.ring[i]
    const mouthB = t.ring[(i+2)%n]
    console.log(`\nSPUR ${e.skelId}: out-edge[${i}] back-edge[${(i+1)%n}]`)
    console.log(`  tip vertex[${(i+1)%n}] = ${tip.map(x=>+x.toFixed(3))}`)
    console.log(`  mouthA vertex[${i}] = ${mouthA.map(x=>+x.toFixed(3))}`)
    console.log(`  mouthB vertex[${(i+2)%n}] = ${mouthB.map(x=>+x.toFixed(3))}`)
    console.log(`  mouthA<->mouthB distance = ${Math.hypot(mouthA[0]-mouthB[0],mouthA[1]-mouthB[1]).toFixed(5)} m  (collapse => ~0)`)
  }
}
