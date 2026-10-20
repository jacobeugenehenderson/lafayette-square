// READ-ONLY: Provincetown Commercial Street — OSM tags, sidewalk/kerb evidence near it, and for every footprint whose
// baked neon.frontage names COMMERCIAL STREET (identity, not proximity): centreline→face distance vs the painted bands
// read along the perpendicular from the nearest OSM centreline point through the footprint's nearest point.
// node --max-old-space-size=4000 scratch/footprint-census/commercial.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const ROOT = new URL('../../', import.meta.url).pathname
const town = 'provincetown', dir = join(ROOT, 'public/baked', town)
const osm = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'raw/osm.json')))
const kerbs = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'raw/osm_kerbs.json')))
const out = []

const ways = osm.ground.highway.filter(w => /^commercial street$/i.test(w.tags.name || ''))
out.push('### Commercial Street ways (raw/osm.json ground.highway)\n')
out.push('| osmId | highway | oneway | lanes | width | surface | maxspeed | sidewalk*/kerb*/footway* | other | nodes |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
for (const w of ways) {
  const t = w.tags, sk = Object.entries(t).filter(([k]) => /^(sidewalk|kerb|footway|parking|shoulder)/.test(k)).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)'
  const other = Object.entries(t).filter(([k]) => /^(cycleway|bicycle|foot|access|living_street|pedestrian|motor_vehicle|ref)/.test(k)).map(([k, v]) => `${k}=${v}`).join(' ')
  out.push(`| ${w.osmId} | ${t.highway} | ${t.oneway ?? ''} | ${t.lanes ?? ''} | ${t.width ?? ''} | ${t.surface ?? ''} | ${t.maxspeed ?? ''} | ${sk} | ${other} | ${w.coords.length} |`)
}
const segs = []
for (const w of ways) for (let i = 0; i + 1 < w.coords.length; i++) segs.push([w.coords[i].x, w.coords[i].z, w.coords[i + 1].x, w.coords[i + 1].z, w.osmId])
nearest.one = (q, x, z) => { const [ax, az, bx, bz] = q, dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz; let u = L ? ((x - ax) * dx + (z - az) * dz) / L : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(x - ax - u * dx, z - az - u * dz) }
function nearest(x, z) {
  let best = { d: Infinity }
  for (const [ax, az, bx, bz, id] of segs) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz
    let u = L ? ((x - ax) * dx + (z - az) * dz) / L : 0; u = Math.max(0, Math.min(1, u))
    const qx = ax + u * dx, qz = az + u * dz, d = Math.hypot(x - qx, z - qz)
    if (d < best.d) best = { d, qx, qz, id }
  }
  return best
}
const lenOf = c => c.reduce((a, p, i) => i ? a + Math.hypot(p.x - c[i - 1].x, p.z - c[i - 1].z) : 0, 0)
const fwNear = osm.ground.highway.filter(w => w.tags.footway === 'sidewalk' && w.coords.some(p => nearest(p.x, p.z).d < 20))
out.push(`\nfootway=sidewalk ways with any node within 20 m of a Commercial Street centreline: ${fwNear.length}` + (fwNear.length ? ' — ' + fwNear.map(w => `${w.osmId} (${lenOf(w.coords).toFixed(0)} m)`).join(', ') : ''))
const crossNear = osm.ground.highway.filter(w => w.tags.footway === 'crossing' && w.coords.some(p => nearest(p.x, p.z).d < 20))
out.push(`footway=crossing ways within 20 m: ${crossNear.length}`)
const kn = kerbs.nodes.filter(n => nearest(n.x, n.z).d < 20)
out.push(`kerb nodes (raw/osm_kerbs.json) within 20 m: ${kn.length}` + (kn.length ? ' — ' + kn.map(n => `${n.osmId} kerb=${n.tags.kerb ?? n.tags.barrier}`).join(', ') : ''))
const totalLen = ways.reduce((a, w) => a + lenOf(w.coords), 0)
out.push(`Commercial Street centreline length: ${totalLen.toFixed(0)} m\n`)

// --- painted ground: point location over partition triangles near Commercial Street ---
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin'))
const gbuf = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const cls = g => { const id = g.id; if (g.kind !== 'mat') return 'lot:' + id; if (id === 'asphalt' || id === 'stripe') return 'asphalt'; if (id === 'curb' || id === 'curbCut') return 'curb'; if (id === 'sidewalk') return 'sidewalk'; if (id.startsWith('treelawn')) return 'treelawn'; return 'mat:' + id }
let X0 = Infinity, Z0 = Infinity, X1 = -Infinity, Z1 = -Infinity
for (const s of segs) { X0 = Math.min(X0, s[0], s[2]); X1 = Math.max(X1, s[0], s[2]); Z0 = Math.min(Z0, s[1], s[3]); Z1 = Math.max(Z1, s[1], s[3]) }
X0 -= 80; Z0 -= 80; X1 += 80; Z1 += 80
const CELL = 4, GW = Math.ceil((X1 - X0) / CELL), GH = Math.ceil((Z1 - Z0) / CELL), grid = new Map(), T = [], TC = []
for (const g of gj.groups) {
  if (!g.partition) continue
  const P = new Float32Array(gbuf, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(gbuf, g.indexByteOffset, g.indexCount), c = cls(g)
  for (let t = 0; t < I.length; t += 3) {
    let a = [P[I[t] * 3], P[I[t] * 3 + 2]], b = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 2]], d = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 2]]
    const mnx = Math.min(a[0], b[0], d[0]), mxx = Math.max(a[0], b[0], d[0]), mnz = Math.min(a[1], b[1], d[1]), mxz = Math.max(a[1], b[1], d[1])
    if (mxx < X0 || mnx > X1 || mxz < Z0 || mnz > Z1) continue
    const sa = (b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1]); if (Math.abs(sa) < 1e-9) continue
    if (sa < 0) [b, d] = [d, b]
    const k = T.length; T.push([a, b, d]); TC.push(c)
    for (let j = Math.max(0, Math.floor((mnz - Z0) / CELL)); j <= Math.min(GH - 1, Math.floor((mxz - Z0) / CELL)); j++)
      for (let i = Math.max(0, Math.floor((mnx - X0) / CELL)); i <= Math.min(GW - 1, Math.floor((mxx - X0) / CELL)); i++) {
        const key = j * GW + i; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(k)
      }
  }
}
const cr = (p, q, x, z) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0])
function at(x, z) { const l = grid.get(Math.floor((z - Z0) / CELL) * GW + Math.floor((x - X0) / CELL)) || []; for (const k of l) { const [a, b, d] = T[k]; if (cr(a, b, x, z) >= -1e-9 && cr(b, d, x, z) >= -1e-9 && cr(d, a, x, z) >= -1e-9) return TC[k] } return 'none' }

// --- assessor parcels (raw/ma_parcels.json, MassGIS L3) as an independent property line ---
const parcels = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'raw/ma_parcels.json'))).parcels.map(p => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const r of p.rings) for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return { rings: p.rings, x0, z0, x1, z1 } })
const pipR = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const inParcel = (x, z) => parcels.some(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.rings.reduce((c, r) => c !== pipR(r, x, z), false))
// --- buildings fronting COMMERCIAL STREET (baked neon.frontage) ---
const bj = JSON.parse(readFileSync(join(dir, 'buildings.json'))), bb = readFileSync(join(dir, 'buildings.bin'))
const fp = new Float32Array(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength), bj.footprintByteOffset, bj.footprintPointCount * 2)
const rows = []
for (const b of bj.buildings) {
  if (!(b.neon?.frontage || []).some(f => f.street === 'COMMERCIAL STREET')) continue
  const [s, n] = b.footprintRange, pts = []; for (let i = 0; i < n; i++) pts.push([fp[(s + i) * 2], fp[(s + i) * 2 + 1]])
  // closest approach of the footprint (vertices + edge samples) to the centreline
  let best = { d: Infinity }
  for (let i = 0; i < n; i++) { const P = pts[i], Q = pts[(i + 1) % n], L = Math.hypot(Q[0] - P[0], Q[1] - P[1]), m = Math.max(1, Math.ceil(L / 0.1)); for (let k = 0; k < m; k++) { const x = P[0] + (Q[0] - P[0]) * k / m, z = P[1] + (Q[1] - P[1]) * k / m, r = nearest(x, z); if (r.d < best.d) best = { ...r, x, z } } }
  if (best.d > 40) continue
  // walk along the centreline segment's normal, oriented to the footprint centroid's side, 0..20 m
  const cx = pts.reduce((a, p) => a + p[0], 0) / n, cz = pts.reduce((a, p) => a + p[1], 0) / n
  const sg = segs.find(q => { const r = nearest.one(q, best.qx, best.qz); return r < 1e-6 })
  let nx = -(sg[3] - sg[1]), nz = sg[2] - sg[0]; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl
  if ((cx - best.qx) * nx + (cz - best.qz) * nz < 0) { nx = -nx; nz = -nz }
  const runs = []; let prev = null
  for (let t = 0.1; t <= 20; t += 0.05) { const c = at(best.qx + nx * t, best.qz + nz * t); if (c !== prev) { runs.push([c, +t.toFixed(2)]); prev = c } }
  const S = ['asphalt', 'curb', 'treelawn', 'sidewalk']
  const endOf = c => { for (let i = 0; i < runs.length; i++) if (runs[i][0] === c) { let j = i; while (runs[j + 1] && runs[j + 1][0] === c) j++; return runs[j + 1] ? runs[j + 1][1] : null } return null }
  const widthOf = c => { let w = 0; for (let i = 0; i < runs.length; i++) if (runs[i][0] === c) { if (i && !S.includes(runs[i - 1][0]) && runs[i - 1][1] > 0.2 && c !== 'asphalt') break; w += (runs[i + 1] ? runs[i + 1][1] : 20) - runs[i][1] } return +w.toFixed(2) }
  let lastS = null; for (let i = 0; i < runs.length; i++) { if (!S.includes(runs[i][0])) { if (i > 0) { lastS = runs[i][1]; break } } }
  let parcelAt = null; for (let t = 0.1; t <= 20; t += 0.05) if (inParcel(best.qx + nx * t, best.qz + nz * t)) { parcelAt = +t.toFixed(2); break }
  rows.push({ parcelAt, id: b.id, address: b.address, src: b.id.split('-')[0], wayId: best.id, centreToFace: +best.d.toFixed(2), curbAt: runs.find(r => r[0] === 'curb')?.[1] ?? null, tl: widthOf('treelawn'), sw: widthOf('sidewalk'), streetRealmEnd: lastS, runs: runs.map(r => `${r[0]}@${r[1]}`).join(' '), faceInsideBand: lastS != null && best.d < lastS })
}
rows.sort((a, b) => a.centreToFace - b.centreToFace)
const med = a => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null }
out.push(`### Footprints whose baked neon.frontage names COMMERCIAL STREET: ${rows.length} (msbf ${rows.filter(r => r.src === 'msbf').length}, osm ${rows.filter(r => r.src === 'osm').length})\n`)
out.push(`median centreline→nearest footprint point: ${med(rows.map(r => r.centreToFace))} m · median centreline→first curb: ${med(rows.map(r => r.curbAt))} m · median painted treelawn ${med(rows.map(r => r.tl))} m · sidewalk ${med(rows.map(r => r.sw))} m · median centreline→end of painted street realm (property-line side) along the same ray: ${med(rows.map(r => r.streetRealmEnd))} m`)
out.push(`median centreline→first assessor parcel along the same ray: ${med(rows.map(r => r.parcelAt))} m (rays reaching a parcel within 20 m: ${rows.filter(r => r.parcelAt != null).length}) · painted property line beyond the parcel line: ${rows.filter(r => r.parcelAt != null && r.streetRealmEnd != null && r.streetRealmEnd > r.parcelAt + 0.5).length} rays (>0.5 m); face nearer than the parcel line: ${rows.filter(r => r.parcelAt != null && r.centreToFace < r.parcelAt - 0.5).length}`)
out.push(`face nearer the centreline than the painted property line: ${rows.filter(r => r.faceInsideBand).length} of ${rows.length}`)
out.push('\nPer way (fronting footprints): tagged width vs painted 2×(centreline→curb), and band depths (medians):\n')
out.push('| way | highway | tagged width | n | 2×curbAt | tl | sw | property line at | parcel line at | face at | faces inside band |'); out.push('|---|---|---|---|---|---|---|---|---|---|---|')
for (const w of ways) { const R = rows.filter(r => r.wayId === w.osmId); if (!R.length) continue; out.push(`| ${w.osmId} | ${w.tags.highway} | ${w.tags.width ?? ''} | ${R.length} | ${(2 * med(R.map(r => r.curbAt))).toFixed(2)} | ${med(R.map(r => r.tl))} | ${med(R.map(r => r.sw))} | ${med(R.map(r => r.streetRealmEnd))} | ${med(R.map(r => r.parcelAt))} | ${med(R.map(r => r.centreToFace))} | ${R.filter(r => r.faceInsideBand).length} |`) }
const B = [[-Infinity, 0], [0, 1], [1, 2], [2, 3], [3, 5], [5, Infinity]]
out.push('\n(property-line distance − face distance) histogram, m — positive = face sits inside the painted band:\n')
out.push('| ' + B.map(([a, b]) => `${a}..${b}`).join(' | ') + ' |'); out.push('|' + '---|'.repeat(B.length))
out.push('| ' + B.map(([a, b]) => rows.filter(r => r.streetRealmEnd != null && (r.streetRealmEnd - r.centreToFace) >= a && (r.streetRealmEnd - r.centreToFace) < b).length).join(' | ') + ' |')
out.push('\nPainted classes along the ray (class@distance from OSM centreline, m), 25 nearest faces:\n')
out.push('| id | address | way | centre→face | parcel at | runs |'); out.push('|---|---|---|---|---|---|')
for (const r of rows.slice(0, 15)) out.push(`| ${r.id} | ${r.address ?? ''} | ${r.wayId} | ${r.centreToFace} | ${r.parcelAt ?? ''} | ${r.runs} |`)
writeFileSync(join(ROOT, 'scratch/footprint-census/commercial.json'), JSON.stringify(rows, null, 1))
console.log(out.join('\n'))
