// Forensic (Sward): how much of each agricultural-classed piece actually lies under a mapped OSM field
// (landuse=farmland/meadow/farmyard/plant_nursery — the tags OSM_TO_LU maps to `agricultural`).
// Usage: CARTOGRAPH_SCENE=huron node scratch/huron-median-lu/farmland-under-crop.mjs [town]
import fs from 'fs'
import { OSM_TO_LU, luCoverageForFace } from '../../cartograph/derive.js'
import { unreadableFace } from '../../cartograph/osm-vocabulary.mjs'
const town = process.argv[2] || 'huron'
const S = JSON.parse(fs.readFileSync(`public/baked/${town}/shape.json`)), osm = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/osm.json`))
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const polys = []
for (const f of osm.ground?.landuse || []) {
  const tag = `landuse:${f.tags?.landuse}`; if (OSM_TO_LU[tag] !== 'agricultural' || !f.coords || f.coords.length < 3) continue
  const u = unreadableFace(f); if (u && u !== 'compound') continue
  let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const p of f.coords) b = [Math.min(b[0], p.x), Math.max(b[1], p.x), Math.min(b[2], p.z), Math.max(b[3], p.z)]
  polys.push({ lu: 'agricultural', tag: 'field', ring: f.coords, holes: f.holes || [], bb: b })
}
let tot = 0, under = 0
S.tiles.forEach((t, ti) => t.iA.forEach((r, k) => {
  if (A(r) <= 0 || t.luByPiece?.[k] !== 'agricultural') return
  const a = A(r), f = luCoverageForFace(r, polys).field?.area || 0; tot += a; under += f
  console.log(`tile ${String(ti).padStart(3)} piece #${k} ${(a / 1e4).toFixed(2).padStart(7)} ha agricultural · under a mapped field ${(f / 1e4).toFixed(2).padStart(6)} ha (${Math.round(100 * f / a)}%)`)
}))
console.log(`${town}: agricultural pieces ${(tot / 1e4).toFixed(1)} ha, of which under a mapped field ${(under / 1e4).toFixed(1)} ha (${Math.round(100 * under / tot)}%)`)
