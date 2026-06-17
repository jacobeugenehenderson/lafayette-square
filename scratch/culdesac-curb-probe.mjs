// Cul-de-sac curb probe — reproduce the LIVE curb/ROW the operator sees and
// locate the notch at the stem→bulb tangent points (Jacob's marks: upper
// ~[-421,-157], lower ~[-418,-173]; bulb center ~[-409,-160]).
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const out = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true })

const C = [-409.2, -160.1]
const TANGENTS = { upper: [-421, -157], lower: [-418, -173] }
const near = (rr, c, rad) => rr.some(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < rad)
// sharp turns within `rad` of a probe point
function sharpNear(ring, c, rad) {
  const n = ring.length, hits = []
  for (let i = 0; i < n; i++) {
    const b = ring[i]; if (Math.hypot(b[0] - c[0], b[1] - c[1]) > rad) continue
    const a = ring[(i - 1 + n) % n], d2 = ring[(i + 1) % n]
    const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [d2[0] - b[0], d2[1] - b[1]]
    const m1 = Math.hypot(...v1), m2 = Math.hypot(...v2); if (m1 < 1e-6 || m2 < 1e-6) continue
    let ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (m1 * m2)))) * 180 / Math.PI
    const cross = v1[0] * v2[1] - v1[1] * v2[0]
    if (ang > 20) hits.push({ pt: [+b[0].toFixed(1), +b[1].toFixed(1)], turn: +ang.toFixed(0), reflex: cross < 0 })
  }
  return hits
}
for (const [layer, rings] of [['asphalt', out.asphalt || []], ['curb', out.curb || []], ['sidewalk', (out.luByClass?.sidewalk) || []], ['treelawn', (out.luByClass?.treelawn) || []]]) {
  const local = rings.filter(rr => near(rr, C, 30))
  console.log(`\n=== ${layer}: ${local.length} ring(s) near SV cul-de-sac ===`)
  local.forEach((ring, k) => {
    for (const [lbl, t] of Object.entries(TANGENTS)) {
      const h = sharpNear(ring, t, 5)
      if (h.length) console.log(`  ring#${k} (${ring.length} verts) @${lbl}: ${JSON.stringify(h)}`)
    }
  })
}
