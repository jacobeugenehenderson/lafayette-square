// lawn-overlap.mjs — CENSUS ONLY: where painted lawn pieces of DIFFERENT land-use keys cover the same ground, on a dump
// (scratch/ground-height/ab/dump.sh, which writes `lawnKeys`). Per key pair and per tile (the tile whose ① ring holds the
// overlap's first vertex, by geometry): count of overlapping piece pairs, area, and the widest… no: area and an example
// point. Also the same-key overlaps, for comparison. READ-ONLY.
//   node scratch/ground-height/seams/lawn-overlap.mjs <dump inputs.json>
import { readFileSync } from 'fs'
const R = new URL('../../../', import.meta.url).pathname
const { intersectRings } = await import(R + 'src/lib/buildBlockGeometryV2.js')
const dump = JSON.parse(readFileSync(process.argv[2]))
if (!dump.lawnKeys) throw new Error('the dump carries no lawnKeys — re-dump with scratch/ground-height/ab/dump.sh')
const keyOf = []; for (const [k, n] of dump.lawnKeys) for (let i = 0; i < n; i++) keyOf.push(k)
const L = dump.bands.lawn; if (keyOf.length !== L.length) throw new Error(`lawnKeys count ${keyOf.length} ≠ lawn items ${L.length}`)
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const area = (rs) => Math.abs(rs.reduce((t, r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return t + a / 2 }, 0))
const bb = L.map(it => { const o = it.outer || it; let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of o) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a, b, c, d] })
const rings = (it) => [it.outer || it, ...(it.holes || [])]
const tileOf = (x, z) => dump.tiles.findIndex(t => t?.ring?.length >= 3 && pip(x, z, t.ring))
const byPair = new Map(), byTile = new Map(); let n = 0, A = 0, sameN = 0, sameA = 0
for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
  const a = bb[i], b = bb[j]; if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue
  const ov = intersectRings(rings(L[i]), rings(L[j])); if (!ov.length) continue
  const ar = area(ov); if (!(ar > 0)) continue
  if (keyOf[i] === keyOf[j]) { sameN++; sameA += ar; continue }
  n++; A += ar
  const k = [keyOf[i], keyOf[j]].sort().join(' | '), p = byPair.get(k) || byPair.set(k, { n: 0, a: 0, ex: null, max: 0 }).get(k)
  p.n++; p.a += ar; if (ar > p.max) { p.max = ar; p.ex = ov[0][0] }
  const t = tileOf(...ov[0][0]), q = byTile.get(t) || byTile.set(t, { n: 0, a: 0 }).get(t); q.n++; q.a += ar
}
console.log(`lawn pieces ${L.length} · overlapping pairs of DIFFERENT keys ${n}, ${A.toFixed(3)} m² · of the SAME key ${sameN}, ${sameA.toFixed(3)} m²`)
console.log('by key pair (pairs · m² · largest at):')
for (const [k, p] of [...byPair].sort((a, b) => b[1].a - a[1].a)) console.log(`   ${k}: ${p.n} · ${p.a.toFixed(3)} m² · largest ${p.max.toFixed(3)} m² at (${p.ex.map(v => v.toFixed(3))})`)
console.log(`by tile (${byTile.size} tiles; top 15 by m²):`)
for (const [t, q] of [...byTile].sort((a, b) => b[1].a - a[1].a).slice(0, 15)) console.log(`   tile ${t}: ${q.n} · ${q.a.toFixed(3)} m²`)
