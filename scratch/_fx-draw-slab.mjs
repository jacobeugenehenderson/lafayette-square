// Draw a top-down window of a BAKED slab as SVG — the live geometry, not a rebuild.
// usage: node scratch/_fx-draw-slab.mjs <slabdir> <cx> <cz> <span> <out.svg>
import { loadSlab, trisIn } from './_fx-live-slab.mjs'
import fs from 'fs'
const [dir, cxs, czs, spans, out] = process.argv.slice(2)
const cx = +cxs, cz = +czs, span = +spans
const x0 = cx - span / 2, x1 = cx + span / 2, z0 = cz - span / 2, z1 = cz + span / 2
const S = 1200 / span
const P = ([x, z]) => `${((x - x0) * S).toFixed(2)},${((z - z0) * S).toFixed(2)}`
const slab = loadSlab(dir)
// draw order: asphalt, curb, treelawn(all), sidewalk on top — the ribbon stack
const order = [['mat:asphalt', '#3a3a3e'], ['mat:median', '#4a5a3a'], ['mat:curb', '#9a9a96'],
  ...[...slab.groups.keys()].filter(k => k.startsWith('mat:treelawn')).map(k => [k, '#4e7a34']),
  ['mat:sidewalk', '#d8d4c8']]
let body = '', counts = []
for (const [k, col] of order) {
  const g = slab.groups.get(k); if (!g) continue
  const tris = trisIn(g, x0, z0, x1, z1); counts.push(`${k}=${tris.length}`)
  for (const t of tris) body += `<polygon points="${t.map(P).join(' ')}" fill="${col}" stroke="${col}" stroke-width="0.3"/>`
}
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
<rect width="1200" height="1200" fill="#191b17"/><g>${body}</g>
<text x="10" y="24" fill="#fff" font-family="monospace" font-size="16">BAKED SLAB ${dir.split('/').pop()} — window ${span} m at (${cx}, ${cz}) — 1 px = ${(1/S).toFixed(3)} m</text></svg>`)
console.log(out, counts.join(' '))
