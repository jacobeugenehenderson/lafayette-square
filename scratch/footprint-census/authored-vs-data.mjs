// READ-ONLY (BRIEF-the-street-ends-at-the-parcel §3e): authored widths are ground truth — how close do the DATA rungs come?
// For every authored street side (blockCustoms skelId/side, all its segOrds pooled — a caveat), at each chain segment:
//   · the authored back of street = pavementHW + curb + treelawn + sidewalk (authored where set, else the frozen measure's)
//   · the parcel line on that side = a perpendicular ray from the chain to the first parcel boundary (≤ 40 m)
//   · the width tag of the chain's own OSM source ways (by id: skeleton.json `sources`), tag/2 vs authored pavementHW
// Side convention: measure-RIGHT = (-dz, dx) of the point-order-forward tangent (skeleton.js chainSidewalkDistances).
//   node scratch/footprint-census/authored-vs-data.mjs <town> <look> [skeleton from git: HEAD]
import fs from 'node:fs'; import { execFileSync } from 'node:child_process'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync', [town, look, fromGit] = process.argv.slice(2)
const skel = JSON.parse(fromGit ? execFileSync('git', ['-C', ROOT, 'show', `${fromGit}:cartograph/data/${town}/clean/skeleton.json`], { encoding: 'utf8', maxBuffer: 1 << 30 }) : fs.readFileSync(`${ROOT}/cartograph/data/${town}/clean/skeleton.json`, 'utf8'))
const design = JSON.parse(fs.readFileSync(`${ROOT}/public/looks/${look}/design.json`, 'utf8')), BC = design.blockCustoms || {}, CURB = design.curbWidth
const R = `${ROOT}/cartograph/data/${town}/raw`, osm = JSON.parse(fs.readFileSync(`${R}/osm.json`, 'utf8'))
const tagW = new Map(); for (const w of osm.ground.highway || []) { const W = parseFloat(w.tags?.width); if (W > 0) tagW.set(w.osmId, W) }
const E = []; for (const f of fs.readdirSync(R).filter(f => /_parcels\.json$/.test(f))) for (const p of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8')).parcels) for (const r of p.rings || []) for (let i = 0; i < r.length; i++) E.push([r[i], r[(i + 1) % r.length]])
const G = 20, grid = new Map(); E.forEach((e, i) => { const x0 = Math.floor(Math.min(e[0][0], e[1][0]) / G), x1 = Math.floor(Math.max(e[0][0], e[1][0]) / G), z0 = Math.floor(Math.min(e[0][1], e[1][1]) / G), z1 = Math.floor(Math.max(e[0][1], e[1][1]) / G); for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(i) } })
const ray = (P, d, max = 40) => { let best = Infinity; const seen = new Set(); for (let s = 0; s <= max; s += G / 2) { const q = [P[0] + d[0] * s, P[1] + d[1] * s]; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) for (const i of grid.get(`${Math.floor(q[0] / G) + dx},${Math.floor(q[1] / G) + dz}`) || []) { if (seen.has(i)) continue; seen.add(i); const [a, b] = E[i], ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex; if (Math.abs(den) < 1e-12) continue
  const t = ((a[0] - P[0]) * ez - (a[1] - P[1]) * ex) / den, u = ((a[0] - P[0]) * d[1] - (a[1] - P[1]) * d[0]) / den; if (t > 0.05 && t <= max && u >= 0 && u <= 1 && t < best) best = t } if (best < s) break } return best }
const byId = new Map(skel.streets.map(s => [s.id, s])), parcelErr = [], tagErr = [], rows = []
for (const [id, sides] of Object.entries(BC)) { const s = byId.get(id); if (!s) { rows.push(`${id}: not in skeleton`); continue }
  for (const [side, segs] of Object.entries(sides)) { const c = Object.values(segs).find(v => Number.isFinite(v?.pavementHW)); if (!c) continue
    const m = s.measure?.[side] || s.seed || {}, tl = Number.isFinite(c.treelawn) ? c.treelawn : (m.treelawn ?? 0), sw = Number.isFinite(c.sidewalk) ? c.sidewalk : (m.sidewalk ?? 0)
    const ped = c.terminal === 'none' ? 0 : tl + sw, back = c.pavementHW + (c.terminal === 'none' ? 0 : CURB) + ped
    const P = s.points, sg = side === 'right' ? 1 : -1, ds = []
    for (let i = 0; i + 1 < P.length; i++) { const L = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z); if (L < 4) continue
      const n = [sg * -(P[i + 1].z - P[i].z) / L, sg * (P[i + 1].x - P[i].x) / L], d = ray([(P[i].x + P[i + 1].x) / 2, (P[i].z + P[i + 1].z) / 2], n); if (Number.isFinite(d)) ds.push(d) }
    ds.sort((a, b) => a - b); const med = ds.length ? ds[Math.floor(ds.length / 2)] : null
    if (med != null) parcelErr.push(med - back)
    const tags = (s.sources || []).map(i => tagW.get(i)).filter(Boolean); const tw = tags.length ? tags.sort((a, b) => a - b)[Math.floor(tags.length / 2)] : null
    if (tw) tagErr.push(tw / 2 - c.pavementHW)
    rows.push(`${id} ${side}: authored pavementHW ${c.pavementHW.toFixed(2)}${c.terminal === 'none' ? ' (no ped realm)' : ''} · back ${back.toFixed(2)} · parcel line ${med != null ? med.toFixed(2) + ` (${ds.length} segs)` : 'none within 40 m'} · width tag ${tw ?? '—'}`) } }
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(2) : '—' }
console.log(`${town}: ${rows.length} authored side(s)`); for (const r of rows) console.log('  ' + r)
console.log(`  parcel line − authored back (m): n ${parcelErr.length} · p10 ${q(parcelErr, .1)} · p50 ${q(parcelErr, .5)} · p90 ${q(parcelErr, .9)} · |err| ≤ 0.5 m ${parcelErr.filter(e => Math.abs(e) <= 0.5).length}`)
console.log(`  width tag/2 − authored pavementHW (m): n ${tagErr.length} · p10 ${q(tagErr, .1)} · p50 ${q(tagErr, .5)} · p90 ${q(tagErr, .9)}`)
