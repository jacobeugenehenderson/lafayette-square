// near-only.mjs — WHY does a near chunk keep stone where its far chunk keeps none, after the nested lattice? For each near-only
// chunk in the bake's info table: the crest at its far stations and at the near stations between, and how many near stations
// are armoured (h ≥ MIN_ARMOUR_D50_M) while a far station beside them is bare. Read-only.
// ▶ node scratch/far-shore/near-only.mjs --look=<id>   (reads public/baked/<id>)
import { readFileSync } from 'node:fs'
import { prepareFaces, chunkRanges } from '../../cartograph/bake-revetment-far.js'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
const look = process.argv.find(a => a.startsWith('--look='))?.slice(7), dir = `public/baked/${look}`
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const far = JSON.parse(readFileSync(`${dir}/revetment-far.json`, 'utf8'))
const lone = far.info.filter(c => c.nearTris > 0 && !c.farTris)
const { faces } = prepareFaces({ revetment: JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8')), terrainJson: JSON.parse(readFileSync(`${dir}/terrain.json`, 'utf8')),
  terrainBin: ab(`${dir}/terrain.bin`), groundJson: JSON.parse(readFileSync(`${dir}/ground.json`, 'utf8')), groundBin: ab(`${dir}/ground.bin`) })
const byKey = new Map(faces.map(f => [f.key, f]))
const kinds = {}
for (const c of lone) {
  const f = byKey.get(c.face), { G1, G3, ranges } = chunkRanges(f), r = ranges[c.k], nest = G3.nest
  const h = (G, i) => f.crestAt((G.s0 + (G.s1 - G.s0) * i / (G.nAlong - 1)) / G.total)
  const farBare = [], nearOn = []
  for (let I = r.far[0]; I <= r.far[1]; I++) farBare.push(h(G1, I) < MIN_ARMOUR_D50_M)
  for (let i = r.near[0]; i <= r.near[1]; i++) nearOn.push(h(G3, i) >= MIN_ARMOUR_D50_M)
  // a far quad (I, I+1) needs both its stations built; the near builds every armoured station between
  let thin = 0
  for (let q = 0; q < farBare.length - 1; q++) if ((farBare[q] || farBare[q + 1]) && nearOn.slice(q * nest, (q + 1) * nest + 1).some(Boolean)) thin++
  const kind = thin ? 'armour narrower than a far quad (a far station beside it is bare)' : 'both far stations built: the far trim keeps none where the near keeps some'
  kinds[kind] = (kinds[kind] || 0) + 1
  console.log(`  ${c.face}#${c.k} · ${c.nearTris} near tris · far stations bare ${farBare.map(b => (b ? 'x' : '·')).join('')} · far step ${G1.step.toFixed(2)} m · ${kind}`)
}
console.log(`${look}: ${lone.length} near-only chunks —`, kinds)
