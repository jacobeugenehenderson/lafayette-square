// Mercator — which streets own tile#11's boundary edges near the corner window?
import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = (r.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const tiles = extractFaces(streets)
const NODE = [166.5, 221.9]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const t = tiles.find(t => t.ring.some(p => dist(p, NODE) < 0.5) && t.ring.some(p => p[0] > 400))
const inWin = p => p[0] > 140 && p[0] < 280 && p[1] > 100 && p[1] < 245
console.log('tile ring verts:', t.ring.length)
t.ring.forEach((p, i) => {
  const q = t.ring[(i + 1) % t.ring.length]
  if (!inWin(p) && !inWin(q)) return
  const e = t.edges[i]
  const s = streets[e.streetIdx]
  console.log(`v${i} (${p[0].toFixed(1)},${p[1].toFixed(1)}) →(${q[0].toFixed(1)},${q[1].toFixed(1)})  ${s.skelId}/${e.side}${e.forward ? '+' : '-'}`)
})
