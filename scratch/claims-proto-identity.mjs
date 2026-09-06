import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const rb = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const r = buildTileGround(rb, { grout: 'proto', smooth: 0 })
console.log('proto rings:', r.proto?.length)
console.log('refused    :', r.protoRefused === null ? '✅ none — identity carried' : '⛔ ' + r.protoRefused)
if (r.protoLabels) {
  const L = r.protoLabels
  console.log('labelled rings:', L.length)
  let edges = 0, owners = new Set()
  for (const ring of L) { edges += ring.length; for (const v of ring) owners.add(v) }
  console.log('labelled edges:', edges, '| distinct owning chains:', owners.size)
  const sizes = L.map(x => x.length).sort((a, b) => a - b)
  console.log('ring sizes: min', sizes[0], 'median', sizes[Math.floor(sizes.length / 2)], 'max', sizes.at(-1))
}
