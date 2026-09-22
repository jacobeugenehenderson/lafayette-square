// DOES OSM ALREADY KNOW WHAT EACH STRETCH OF SHORE IS?
// Walk the slab's shoreline arc; for every vertex ask which OSM feature is
// nearest, and compare that label against the crest height the DEM measures.
import fs from 'fs'
import { osm, baked, ROOT, M_TO_FT } from './common.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const bin = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const wg = gj.groups.find(g => g.id === 'water:lake')
const WY = new Float32Array(bin.buffer, bin.byteOffset + wg.vertexByteOffset, 3)[1]
const shape = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/shape.json`, 'utf8'))
const seen = new Set(); const arcs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) if (r.skelId === '__water__') {
  const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
  if (!seen.has(k)) { seen.add(k); arcs.push(r.poly) }
}
const g = osm.ground
const pick = (arr, fn) => arr.filter(fn)
const CLASSES = {
  'HARD  retaining_wall': pick(g.barrier, f => f.tags.barrier === 'retaining_wall'),
  'HARD  wall':           pick(g.barrier, f => f.tags.barrier === 'wall'),
  'HARD  breakwater':     pick(g.other,   f => f.tags.man_made === 'breakwater'),
  'HARD  groyne':         pick(g.other,   f => f.tags.man_made === 'groyne'),
  'HARD  pier':           pick(g.other,   f => f.tags.man_made === 'pier'),
  'SOFT  beach':          pick(g.natural, f => f.tags.natural === 'beach'),
  'SOFT  sand':           pick(g.natural, f => f.tags.natural === 'sand'),
  'SOFT  wetland':        pick(g.natural, f => f.tags.natural === 'wetland'),
  'SOFT  scree':          pick(g.natural, f => f.tags.natural === 'scree'),
}
const d2seg = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx*dx + dz*dz
  const t = L2 ? Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / L2)) : 0
  return Math.hypot(px - (ax + t*dx), pz - (az + t*dz))
}
const nearest = (feats, x, z) => { let b = Infinity
  for (const f of feats) for (let i = 1; i < f.coords.length; i++)
    { const d = d2seg(x, z, f.coords[i-1].x, f.coords[i-1].z, f.coords[i].x, f.coords[i].z); if (d < b) b = d }
  return b }

const R = 15
const tally = {}, heights = {}
let n = 0, unlabelled = 0, unlabelledH = []
for (const poly of arcs) for (let i = 0; i < poly.length; i++) {
  const [x, z] = poly[i]
  const v = baked.get(x, z); if (!Number.isFinite(v)) continue
  const h = (v - baked.meta.baseElev) - WY
  n++
  let best = null, bestD = R
  for (const [name, feats] of Object.entries(CLASSES)) {
    const d = nearest(feats, x, z)
    if (d < bestD) { bestD = d; best = name }
  }
  if (!best) { unlabelled++; unlabelledH.push(h); continue }
  tally[best] = (tally[best] || 0) + 1
  ;(heights[best] ||= []).push(h)
}
const q = (a, p) => { const s = a.slice().sort((m,n)=>m-n); return s[Math.floor(s.length*p)] }
console.log(`${n.toLocaleString()} shoreline vertices (26.2 km). Nearest OSM feature within ${R} m:\n`)
console.log('  label                     vertices    share     crest height (median / p90)')
for (const [k, c] of Object.entries(tally).sort((a,b)=>b[1]-a[1]))
  console.log(`  ${k.padEnd(24)} ${String(c).padStart(6)}   ${(100*c/n).toFixed(1).padStart(5)}%     ${q(heights[k],.5).toFixed(2)} m / ${q(heights[k],.9).toFixed(2)} m`)
console.log(`  ${'—— NOTHING WITHIN 15 m'.padEnd(24)} ${String(unlabelled).padStart(6)}   ${(100*unlabelled/n).toFixed(1).padStart(5)}%     ${q(unlabelledH,.5).toFixed(2)} m / ${q(unlabelledH,.9).toFixed(2)} m`)
const hard = Object.entries(tally).filter(([k])=>k.startsWith('HARD')).reduce((a,[,c])=>a+c,0)
const soft = Object.entries(tally).filter(([k])=>k.startsWith('SOFT')).reduce((a,[,c])=>a+c,0)
console.log(`\n  ⇒ OSM labels this shore HARD ${(100*hard/n).toFixed(1)}%  ·  SOFT ${(100*soft/n).toFixed(1)}%  ·  SILENT ${(100*unlabelled/n).toFixed(1)}%`)
console.log(`  ⇒ and the DEM says the SILENT stretches have a median ${q(unlabelledH,.5).toFixed(2)} m wall anyway.`)
