// READ-ONLY census: on OSM ways carrying `width`, the parcel-to-parcel gap across the centreline (a perpendicular ray each way
// to the first parcel boundary, ≤ 40 m), against the tag. Ratio width / gap ≈ 1 → the tag is the whole ROW; well under → the
// carriageway. Data measured against data; nothing here feeds the pour.   node scratch/footprint-census/width-vs-parcels.mjs <town>
import fs from 'node:fs'
const town = process.argv[2], R = `/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/${town}/raw`
const osm = JSON.parse(fs.readFileSync(`${R}/osm.json`, 'utf8'))
const E = []; for (const f of fs.readdirSync(R).filter(f => /_parcels\.json$/.test(f))) for (const p of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8')).parcels) for (const r of p.rings || []) for (let i = 0; i < r.length; i++) E.push([r[i], r[(i + 1) % r.length]])
const G = 20, grid = new Map(); E.forEach((e, i) => { const x0 = Math.floor(Math.min(e[0][0], e[1][0]) / G), x1 = Math.floor(Math.max(e[0][0], e[1][0]) / G), z0 = Math.floor(Math.min(e[0][1], e[1][1]) / G), z1 = Math.floor(Math.max(e[0][1], e[1][1]) / G); for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(i) } })
const ray = (P, d, max = 40) => { let best = Infinity; const seen = new Set(); for (let s = 0; s <= max; s += G / 2) { const q = [P[0] + d[0] * s, P[1] + d[1] * s]; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) for (const i of grid.get(`${Math.floor(q[0] / G) + dx},${Math.floor(q[1] / G) + dz}`) || []) { if (seen.has(i)) continue; seen.add(i); const [a, b] = E[i], ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex; if (Math.abs(den) < 1e-12) continue
  const t = ((a[0] - P[0]) * ez - (a[1] - P[1]) * ex) / den, u = ((a[0] - P[0]) * d[1] - (a[1] - P[1]) * d[0]) / den; if (t > 0.05 && t <= max && u >= 0 && u <= 1 && t < best) best = t } if (best < s) break } return best }
const byCls = {}
for (const w of osm.ground.highway || []) { const t = w.tags || {}, W = parseFloat(t.width); if (!(W > 0) || !t.highway) continue; const C = w.coords
  for (let i = 0; i + 1 < C.length; i++) { const L = Math.hypot(C[i + 1].x - C[i].x, C[i + 1].z - C[i].z); if (L < 4) continue
    const m = [(C[i].x + C[i + 1].x) / 2, (C[i].z + C[i + 1].z) / 2], n = [-(C[i + 1].z - C[i].z) / L, (C[i + 1].x - C[i].x) / L]
    const g = ray(m, n) + ray(m, [-n[0], -n[1]]); if (!Number.isFinite(g)) continue
    const k = t.highway; (byCls[k] ||= []).push({ W, g, r: W / g, name: t.name }) } }
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]
for (const [k, v] of Object.entries(byCls).sort((a, b) => b[1].length - a[1].length)) { const r = v.map(x => x.r).sort((a, b) => a - b), g = v.map(x => x.g).sort((a, b) => a - b), W = v.map(x => x.W).sort((a, b) => a - b)
  console.log(`${town} ${k}: ${v.length} segment(s) with a width tag and parcels both sides · tag p50 ${q(W, .5).toFixed(1)} m · parcel gap p50 ${q(g, .5).toFixed(1)} m · tag/gap p10 ${q(r, .1).toFixed(2)} p50 ${q(r, .5).toFixed(2)} p90 ${q(r, .9).toFixed(2)}`) }
const cs = (byCls.living_street || []).filter(x => /Commercial/.test(x.name || '')); if (cs.length) { const g = cs.map(x => x.g).sort((a, b) => a - b); console.log(`${town} Commercial Street: ${cs.length} segment(s) · tags ${[...new Set(cs.map(x => x.W))].join('/')} m · parcel gap p50 ${q(g, .5).toFixed(1)} m`) }
