// Gunter: which tile EDGE (segment) runs nearest P, and whose measure does it read?
import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = (r.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const tiles = extractFaces(streets)
const P = [Number(process.argv[2] ?? 240.3), Number(process.argv[3] ?? 229.5)]
const segDist = (p, a, b) => {
  const vx = b[0] - a[0], vz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (vx * vx + vz * vz || 1)))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vz))
}
for (let ti = 0; ti < tiles.length; ti++) {
  const t = tiles[ti]
  for (let i = 0; i < t.ring.length; i++) {
    const a = t.ring[i], b = t.ring[(i + 1) % t.ring.length]
    if (segDist(P, a, b) < 2) {
      const e = t.edges[i]
      const s = streets[e.streetIdx]
      const m = s?.measure?.[e.side]
      console.log(`tile#${ti} edge#${i} → ${s?.skelId} side=${e.side} fwd=${e.forward} anchor=${s?.anchor} innerSign=${s?.innerSign} pav=${m?.pavementHW} segMeasures=${s?.segmentMeasures ? Object.keys(s.segmentMeasures).join('/') : '—'}`)
      break
    }
  }
}
