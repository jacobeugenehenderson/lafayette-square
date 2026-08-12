// tipcoupler — by-degree census of junctionMap.nodes over a FRESH pipeline run.
// ⛔ Reads cartograph/data/<scene>/clean/map.json, NOT the committed src/data/ribbons.json
//    (they drift — POLYGON-FIRST §2.1 / PREBAKE §4.0a).
// Degree is GEOMETRIC (tileGround.js:2787 nodeDeg: endpoint=1, interior=2), never legs.length.
// Usage: node scratch/tipcoupler-degree-census.mjs [scene] [--json]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lafayette-square'
const map = JSON.parse(fs.readFileSync(path.join(ROOT, `cartograph/data/${scene}/clean/map.json`), 'utf8'))
const R = map.layers.ribbons
const streets = (R.streets || []).filter(s => s?.points?.length >= 2)
const curbed = s => !s.gradeSeparated && !s.disabled

// derive.js:3377 vKey — the node identity the junction map is keyed by.
const vKey = p => p[0].toFixed(3) + ',' + p[1].toFixed(3)
// Geometric degree over CURBED chains (the population endsAt/interiorAt index).
const deg = new Map()
for (const s of streets) {
  if (!curbed(s)) continue
  const p = s.points
  for (let i = 0; i < p.length; i++) {
    const inc = (i === 0 || i === p.length - 1) ? 1 : 2
    const k = vKey(p[i]); deg.set(k, (deg.get(k) || 0) + inc)
  }
}
const nodes = R.junctionMap?.nodes || []
const rows = {}
for (const n of nodes) {
  const k = vKey(n.at)
  const locatable = deg.has(k)
  const d = locatable ? deg.get(k) : 'UNLOCATABLE'
  const legDeg = (n.legs || []).reduce((a, l) => a + (l.end === 'through' ? 2 : 1), 0)
  const r = rows[d] || (rows[d] = { nodes: 0, withCornersAdjacent: 0, pairs: 0, legDegMismatch: 0 })
  r.nodes++
  if ((n.cornersAdjacent || []).length) { r.withCornersAdjacent++; r.pairs += n.cornersAdjacent.length }
  if (locatable && legDeg !== d) r.legDegMismatch++
}
const order = Object.keys(rows).sort((a, b) => (a === 'UNLOCATABLE') - (b === 'UNLOCATABLE') || a - b)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ scene, totalNodes: nodes.length, rows }, null, 2))
} else {
  console.log(`⚠️  re-run \`node cartograph/pipeline.js --scene=${scene} --skip-elevation\` FIRST — the`)
  console.log(`   committed map.json / ribbons.json disagree with a fresh run (A01 drift, still open).`)
  console.log(`scene=${scene}  nodes=${nodes.length}  curbed chains=${streets.filter(curbed).length}`)
  console.log('geoDeg      nodes  w/cornersAdjacent  pairs  legs.length-degree mismatches')
  for (const d of order) {
    const r = rows[d]
    console.log(`${String(d).padStart(11)} ${String(r.nodes).padStart(5)} ${String(r.withCornersAdjacent).padStart(18)} ${String(r.pairs).padStart(6)} ${String(r.legDegMismatch).padStart(6)}`)
  }
}
