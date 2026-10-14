// rimgap.mjs <dump> <classified.json> --scene=hipointedemun — READ-ONLY (Tern, 2026-10-14; Boz). For classify.mjs's rim rows (the nearest span's
// ray starts 'beyond' the disc): along that ray, the gap from the disc crossing to the first point the deformer's own point test reads a
// band (0.5 mm steps). Run from the checkout the dump was taken on.
import { readFileSync } from 'fs'
const R = process.cwd() + '/', [dump, rowsF] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const F = JSON.parse(readFileSync(dump + '/deform.json', 'utf8')), rows = JSON.parse(readFileSync(rowsF, 'utf8'))
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js'); const T = loadSceneTerrain('hipointedemun')
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs'); const D = buildDeformer({ ...F, raw: T.getElevationRaw })
const cls = (x, z) => ['walk', 'lawn', 'curb'].find(c => D._inClass(c, x, z)) || 'lot'
const rim = rows.filter(r => r.cands && r.verdict !== 'window' && r.cands[0].seq.startsWith('beyond'))
const gaps = [], byTile = {}
for (const r of rim) { const e = D.explain(r.x, r.z), [sx, sz] = e.station, L = Math.hypot(r.x - sx, r.z - sz), ux = (r.x - sx) / L, uz = (r.z - sz) / L
  const B = D._bandsAlong(sx, sz, ux, uz, L + 1), tDisc = B.find(b => b.cls === 'beyond')?.to ?? 0
  let tBand = null, first = null; for (let t = tDisc; t <= L + 1e-9; t += 0.0005) { const c = cls(sx + ux * t, sz + uz * t); if (c !== 'lot') { tBand = t; first = c; break } }
  const g = tBand == null ? null : tBand - tDisc; gaps.push(g); (byTile[r.tile] ??= []).push(g == null ? 'none' : (g * 1000).toFixed(1) + `mm→${first}`) }
const num = gaps.filter(g => g != null).sort((a, b) => a - b)
console.log(`rim rows ${rim.length} · along the nearest span's ray, from the disc crossing (the ray's 'beyond' end) to the first point the point test reads a band (0.5 mm steps): none ${gaps.filter(g => g == null).length} · min ${(num[0] * 1000).toFixed(1)} mm · median ${(num[num.length >> 1] * 1000).toFixed(1)} mm · max ${(num.at(-1) * 1000).toFixed(1)} mm · ≤ 1 mm ${num.filter(g => g <= 0.001).length} · > 1 mm ${num.filter(g => g > 0.001).length}`)
for (const [t, v] of Object.entries(byTile)) console.log(`  tile ${t}: ${[...new Set(v)].slice(0, 6).join(' · ')}${new Set(v).size > 6 ? ' …' : ''}`)
