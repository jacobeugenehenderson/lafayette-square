// gusset.mjs — Jacob's SHORE GUSSET (BRIEF-the-ground-knows-its-height §5, 2026-10-10), measured. READ-ONLY.
// The drawn shoreline (① coast stroke, shape.json `__water__`) is one line in plan with two sides. Every 1 m along it:
//   · the water's level there (waterLevel.mjs: LOW and HIGH; the sheet stands between them, drawn flat)
//   · the DRAWN ground 0.3 m to the land side and 0.3 m to the water side (per-vertex terrain raw + mesh y, barycentric —
//     the GPU's surface at exag 1), and which group it is (a water-side point with no ground is NOTHING under the sheet)
//   · whether the line is an OPEN EDGE of the drawn ground (a ground-triangle edge used once, lying on the line):
//     there the ground stops and only the water sheet continues.
// THE GUSSET = the height of land above the water at the line (land − level), where it is positive: a wall from the
// sheet's edge up to the land's lip. It OPENS TO THE SKY where the water side carries no ground to close it.
// Usage: node --max-old-space-size=12000 scratch/ground-height/gusset.mjs <scene>
//   env: SLAB_DIR (a scratch slab, default the served one) · SIDE_OFF (metres off the line, default 0.3; below 1 cm it reads
//   ①'s ε band, not the gusset) · GUSSET_OUT (where the record goes, default scratch/ground-height/gusset-<scene>.json)
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
import { waterRuns } from '../../cartograph/shoreRuns.mjs'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
const scene = process.argv[2]
const root = new URL('../../', import.meta.url).pathname
const slab = process.env.SLAB_DIR || join(root, 'public/baked', scene)   // SLAB_DIR: a scratch slab
const gj = JSON.parse(readFileSync(join(slab, 'ground.json')))
const gb = readFileSync(join(slab, 'ground.bin')); const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const T = loadSceneTerrain(scene), raw = T.getElevationRaw
const W = waterLevels(T.water)
const st = gj.stencil
const runs = waterRuns(shape)
const CELL = 10, near = new Set()
for (const r of runs) for (let i = 0; i + 1 < r.length; i++) {
  const [a, b] = [r[i], r[i + 1]], L = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-9)
  for (let s = 0; s <= L; s += CELL / 2) near.add(Math.floor((a[0] + (b[0] - a[0]) * s / L) / CELL) + ',' + Math.floor((a[1] + (b[1] - a[1]) * s / L) / CELL))
}
const grid = new Map()
const edgeUse = new Map()   // open-edge census, ground groups only (not the water sheet), near the shore
const kq = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`
for (const g of gj.groups) {
  if (g.partition === false && g.id !== 'water') continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  // ⭐ the TERRAIN PART each vertex is drawn with: the slab's baked one (the deformer's, `rawByteOffset`) where the group
  // carries it, else the field at the vertex — what the runtime draws (terrainShader baked vs texture). Fixed 2026-10-12:
  // this read the field only, so on a deformed slab it measured the ground BEFORE the deformer (Swale).
  const Rb = g.rawByteOffset != null ? new Float32Array(AB, g.rawByteOffset, g.vertexCount) : null
  for (let i = 0; i < I.length; i += 3) {
    const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2], Rb ? Rb[k] : raw(P[k * 3], P[k * 3 + 2])])
    const x0 = Math.floor(Math.min(v[0][0], v[1][0], v[2][0]) / CELL), x1 = Math.floor(Math.max(v[0][0], v[1][0], v[2][0]) / CELL)
    const z0 = Math.floor(Math.min(v[0][2], v[1][2], v[2][2]) / CELL), z1 = Math.floor(Math.max(v[0][2], v[1][2], v[2][2]) / CELL)
    let any = false
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 40000) {
      for (const k of near) { const [cx, cz] = k.split(',').map(Number); if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) { any = true; if (!grid.has(k)) grid.set(k, []); grid.get(k).push({ g: g.id, v }) } }
    } else for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x + ',' + z; if (!near.has(k)) continue; any = true; if (!grid.has(k)) grid.set(k, []); grid.get(k).push({ g: g.id, v }) }
    if (any && g.id !== 'water') for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3], ka = kq(a[0], a[2]), kb = kq(b[0], b[2]); if (ka === kb) continue
      const key = ka < kb ? ka + '|' + kb : kb + '|' + ka
      const r = edgeUse.get(key); if (r) r.n++; else edgeUse.set(key, { n: 1, a: [a[0], a[2]], b: [b[0], b[2]] })
    }
  }
}
// open edges lying ON the shoreline (both ends within 5 cm of a shore segment)
const segs = []; for (const r of runs) for (let i = 0; i + 1 < r.length; i++) segs.push([r[i], r[i + 1]])
const sgrid = new Map(); for (const s of segs) for (const p of [s[0], s[1], [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2]]) { const k = Math.floor(p[0] / CELL) + ',' + Math.floor(p[1] / CELL); if (!sgrid.has(k)) sgrid.set(k, new Set()); sgrid.get(k).add(s) }
const dSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-18, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const onShore = (p) => { const cx = Math.floor(p[0] / CELL), cz = Math.floor(p[1] / CELL); for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const s of sgrid.get(x + ',' + z) || []) if (dSeg(p, s[0], s[1]) < 0.05) return true; return false }
// every ground vertex near the shore, by group, to tell an UNCLOSED edge from a T-junction
const vByCell = new Map()
for (const [k, list] of grid) for (const t of list) if (t.g !== 'water') for (const v of t.v) { const c = Math.floor(v[0] / 2) + ',' + Math.floor(v[2] / 2); if (!vByCell.has(c)) vByCell.set(c, []); vByCell.get(c).push([v[0], v[2], t.g]) }
function innerVertex(a, b) {   // a ground vertex strictly inside edge a–b (≤ 5 mm off it)?
  const seen = new Set()
  for (let x = Math.floor(Math.min(a[0], b[0]) / 2) - 1; x <= Math.floor(Math.max(a[0], b[0]) / 2) + 1; x++)
    for (let z = Math.floor(Math.min(a[1], b[1]) / 2) - 1; z <= Math.floor(Math.max(a[1], b[1]) / 2) + 1; z++)
      for (const p of vByCell.get(x + ',' + z) || []) {
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
        if (t <= 1e-4 || t >= 1 - 1e-4) continue
        if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) < 0.005) return p[2]
      }
  return null
}
let openOnShoreM = 0, openOnShoreN = 0, tjN = 0, tjM = 0
const tjBy = {}
let spotted = 0
function spot(r) {   // EDGE_SPOT=1: dump every triangle (any group) with a vertex at either end of one unclosed edge
  if (!process.env.EDGE_SPOT || spotted++ >= 2) return
  console.log(`  [spot] unclosed edge (${r.a.map(v => v.toFixed(3))}) → (${r.b.map(v => v.toFixed(3))})`)
  for (const g of gj.groups) { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    for (let i = 0; i < I.length; i += 3) { const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]]); if (v.some(p => Math.hypot(p[0] - r.a[0], p[1] - r.a[1]) < 0.002 || Math.hypot(p[0] - r.b[0], p[1] - r.b[1]) < 0.002)) console.log(`     ${g.id} (partition ${g.partition}): ${v.map(p => p.map(x => x.toFixed(3)).join(',')).join(' | ')}`) } }
}
const inDisc = (x, z) => !st || Math.hypot(x - st.center[0], z - st.center[1]) <= (st.fade?.inner ?? st.radius)
for (const r of edgeUse.values()) if (r.n === 1 && onShore(r.a) && onShore(r.b) && inDisc(...r.a)) { const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); const g = innerVertex(r.a, r.b); if (g) { tjN++; tjM += L; tjBy[g] = (tjBy[g] || 0) + 1 } else { openOnShoreN++; openOnShoreM += L; spot(r) } }

function drawnAt(x, z) {
  let water = null
  for (const t of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
    const [a, b, c] = t.v
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2
    if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue
    if (t.g === 'water') { water = true; continue }
    return { g: t.g, h: l1 * (a[3] + a[1]) + l2 * (b[3] + b[1]) + l3 * (c[3] + c[1]) }
  }
  return water ? { g: 'water-only' } : null
}
const rows = []
const _cum = new Map()
function rowS(r, i) { if (!_cum.has(r)) { const c = [0]; for (let k = 1; k < r.length; k++) c.push(c[k - 1] + Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1])); _cum.set(r, c) } return _cum.get(r)[i] }
for (const r of runs) for (let i = 0; i + 1 < r.length; i++) {
  const [a, b] = [r[i], r[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue
  const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L
  for (let s = 0; s < L; s += 1) {
    const x = a[0] + tx * s, z = a[1] + tz * s
    if (!inDisc(x, z)) continue
    const OFF = +(process.env.SIDE_OFF || 0.3), A = drawnAt(x - tz * OFF, z + tx * OFF), B = drawnAt(x + tz * OFF, z - tx * OFF)   // SIDE_OFF: metres off the line
    // the water side is the side whose point has the water sheet over it (or nothing but water)
    const wa = A?.g === 'water-only' || (A && /bed|water/.test(A.g)), wb = B?.g === 'water-only' || (B && /bed|water/.test(B.g))
    if (wa === wb) continue                                   // both or neither: not a land/water edge here
    const [land, wet] = wa ? [B, A] : [A, B]
    if (!land || land.g === 'water-only') continue
    rows.push({ run: runs.indexOf(r), s: +(rowS(r, i) + s).toFixed(1), x, z, land: land.h, landG: land.g, wet: wet?.g === 'water-only' ? null : wet?.h ?? null, wetG: wet?.g ?? 'nothing', hi: W.highAt(x, z), lo: W.lowAt(x, z) })
  }
}
const q = (a, ps) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return ps.map(p => s.length ? s[Math.floor(p * (s.length - 1))] : NaN) }
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : '—', pct = v => (100 * v).toFixed(1) + '%'
console.log(`\n=== ${scene}: ${rows.length} land|water stations along the drawn shore inside the disc · levels ${W.lowName} ${f2(W.range.low[0])}…${f2(W.range.low[1])} · ${W.highName} ${f2(W.range.high[0])}…${f2(W.range.high[1])}`)
const wg = {}; for (const r of rows) wg[r.wetG] = (wg[r.wetG] || 0) + 1
console.log(`  water side of the line has: ${Object.entries(wg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${pct(v / rows.length)})`).join(' · ')}`)
for (const [nm, lvl] of [['HIGH', r => r.hi], ['LOW', r => r.lo]]) {
  const gus = rows.map(r => r.land - lvl(r)), pos = gus.filter(v => v > 0)
  const [g50, g90, g99] = q(pos, [0.5, 0.9, 0.99])
  const open = rows.filter(r => r.land - lvl(r) > 0 && r.wet == null)
  const [o50, o90] = q(open.map(r => r.land - lvl(r)), [0.5, 0.9])
  console.log(`  at ${nm}: land above the water at the line on ${pct(pos.length / rows.length)} · the step (land − level) p50 ${f2(g50)} p90 ${f2(g90)} p99 ${f2(g99)} m`)
  console.log(`         …with NO ground on the water side to close it: ${open.length} stations (${pct(open.length / rows.length)}), step p50 ${f2(o50)} p90 ${f2(o90)} m`)
}
const closed = rows.filter(r => r.wet != null)
const [c50, c90, c99] = q(closed.map(r => Math.abs(r.land - r.wet)), [0.5, 0.9, 0.99])
console.log(`  where both sides have ground: |land − water-side ground| across 0.6 m: p50 ${f2(c50)} p90 ${f2(c90)} p99 ${f2(c99)} m`)
console.log(`  edges used once lying on the shoreline (inside the disc): ${tjN} with another ground vertex inside them (T-junction, ${tjM.toFixed(0)} m; inner vertex group ${JSON.stringify(tjBy)}) · ${openOnShoreN} with none: UNCLOSED (${openOnShoreM.toFixed(0)} m)`)
const site = new Map(); for (const r of rows.filter(r => r.wet == null && r.land - r.hi > 0.25)) { const k = `${Math.round(r.x / 50) * 50},${Math.round(r.z / 50) * 50}`; site.set(k, (site.get(k) || 0) + 1) }
console.log(`  where a step > 0.25 m above HIGH has nothing beneath the water side (50 m cells): ${[...site].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `(${k}) ${v}`).join(' · ') || 'none'}`)
const near1417 = rows.filter(r => Math.hypot(r.x - 1423, r.z + 323) < 15)
if (near1417.length) console.log(`  near (1417–1430, −320…−326): ${near1417.length} stations · land ${f2(q(near1417.map(r => r.land), [0.5])[0])} m · water side ${[...new Set(near1417.map(r => r.wetG))].join('/')} · HIGH ${f2(near1417[0].hi)}`)

// ⭐ THE GUSSET'S SHAPE AS DATA (Jacob, 2026-10-10: "it would determine particulate/fill size"): each contiguous stretch
// of the line (stations ≤ 1.5 m apart on one run) where the land stands above the water, at HIGH and at LOW — its
// length along the shore and its height profile. Written for a treatment to read; nothing reads it yet.
const segs2 = {}
for (const [nm, lvl] of [['high', r => r.hi], ['low', r => r.lo]]) {
  const out = []; let cur = null
  for (const r of rows) {
    const h = r.land - lvl(r), up = h > 0
    if (cur && (!up || r.run !== cur.run || r.s - cur.lastS > 1.5)) { out.push(cur); cur = null }
    if (!up) continue
    if (!cur) cur = { run: r.run, from: [+r.x.toFixed(1), +r.z.toFixed(1)], s0: r.s, lastS: r.s, h: [], open: 0 }
    cur.lastS = r.s; cur.to = [+r.x.toFixed(1), +r.z.toFixed(1)]; cur.h.push(+h.toFixed(2)); if (r.wet == null) cur.open++
  }
  if (cur) out.push(cur)
  segs2[nm] = out.map(c => { const hs = [...c.h].sort((a, b) => a - b); return { run: c.run, from: c.from, to: c.to, lengthM: +(c.lastS - c.s0 + 1).toFixed(1), heightP50: hs[Math.floor(hs.length / 2)], heightMax: hs[hs.length - 1], openStations: c.open, profileM: c.h } })
  const L = segs2[nm].map(c => c.lengthM), [l50, l90] = q(L, [0.5, 0.9])
  console.log(`  gusset segments at ${nm.toUpperCase()}: ${L.length} · length along the shore p50 ${f2(l50)} p90 ${f2(l90)} max ${f2(Math.max(0, ...L))} m · total ${L.reduce((a, b) => a + b, 0).toFixed(0)} m`)
}
writeFileSync(process.env.GUSSET_OUT || join(root, 'scratch/ground-height', `gusset-${scene}.json`), JSON.stringify({ scene, levels: { low: W.lowName, high: W.highName }, segments: segs2 }))
