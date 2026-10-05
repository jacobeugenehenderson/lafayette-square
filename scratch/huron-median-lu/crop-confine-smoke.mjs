// Forensic (Sward): crop confined to mapped fields, WITHOUT a pour. Builds the pour's `ribbons.fields` in memory
// from raw OSM through the live vocabulary (OSM_TO_LU → 'agricultural', the readable geometry rule), runs the
// real ①②③ build, and reports the agricultural / underived paint and any agricultural paint outside a field.
// Usage: node scratch/huron-median-lu/crop-confine-smoke.mjs [town]
import fs from 'fs'
import { feed, buildProto } from '../_proto-feed.mjs'
import { OSM_TO_LU } from '../../cartograph/derive.js'
import { unreadableFace } from '../../cartograph/osm-vocabulary.mjs'
import { fieldRegionOf } from '../../src/lib/tileGround.js'
import { differenceRings } from '../../src/lib/buildBlockGeometryV2.js'
const town = process.argv[2] || 'huron'
const f = feed(town), osm = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/osm.json`))
const fields = []
for (const [cat, key] of [['landuse', 'landuse'], ['leisure', 'leisure'], ['natural', 'natural'], ['amenity', 'amenity']])
  for (const g of osm.ground?.[cat] || []) { const tag = `${cat}:${g.tags?.[key]}`; if (OSM_TO_LU[tag] !== 'agricultural' || !(g.coords?.length >= 3)) continue
    const u = unreadableFace(g); if (u && u !== 'compound') continue
    fields.push({ tag, ring: g.coords.map(p => [p.x, p.z]), holes: (g.holes || []).map(h => h.map(p => [p.x ?? p[0], p.z ?? p[1]])) }) }
f.ribbons = { ...f.ribbons, fields }
const w = console.warn; const warns = []; console.warn = (m) => warns.push(String(m))
const g = buildProto(f, { protoArtifact: true, protoProducer: true }); console.warn = w
const SA = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const area = rs => Math.abs((rs || []).reduce((s, r) => s + SA(r), 0))
const per = rs => (rs || []).reduce((s, r) => { let p = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) p += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return s + p }, 0)
const ag = g.luByClass.agricultural || [], region = fieldRegionOf(fields)
const out = area(differenceRings(ag, region)), tol = per(ag) * 0.001   // Clipper's 1 mm lattice × the paint's own perimeter
console.log(`${town}: ${fields.length} mapped field(s) · paint: agricultural ${(area(ag) / 1e4).toFixed(1)} ha · underived ${(area(g.luByClass.underived) / 1e4).toFixed(1)} ha · treelawn:agricultural ${(area(g.treelawnByLu.agricultural) / 1e4).toFixed(2)} ha`)
console.log(`   agricultural paint OUTSIDE every mapped field: ${out.toFixed(2)} m² (lattice tolerance ${tol.toFixed(2)} m²) ${out <= tol ? '✅' : '⛔'}`)
console.log(`   [tileGround][LU] warnings: ${warns.filter(m => m.includes('[LU]')).length}${warns.some(m => m.includes('NO mapped fields')) ? ' — incl. NO mapped fields ⛔' : ''}`)
