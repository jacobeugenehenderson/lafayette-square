// disjoint-gate.mjs — the gate for the disjoint land-use cut (Boz 2026-10-12), between two dumps of the deformer's inputs:
// walk, curb, disc and tiles byte-identical; painted lawn's UNION unchanged to the lattice; the lawn's summed area falls by
// what was painted twice; each (tile, key)'s area moves by no more than that tile's before-overlap. READ-ONLY.
//   node scratch/ground-height/seams/disjoint-gate.mjs <before inputs.json> <after inputs.json>
import { readFileSync } from 'fs'
const R = new URL('../../../', import.meta.url).pathname
const { intersectRings } = await import(R + 'src/lib/buildBlockGeometryV2.js')
const [A, B] = process.argv.slice(2).map(p => JSON.parse(readFileSync(p)))
const same = (k) => JSON.stringify(k(A)) === JSON.stringify(k(B))
console.log(`walk byte-identical ${same(d => d.bands.walk)} · curb ${same(d => d.bands.curb)} · disc ${same(d => d.stencil)} · tiles ${same(d => d.tiles)}`)
const area = (rs) => rs.reduce((t, r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return t + a / 2 }, 0)
const itemArea = (it) => Math.abs(area([it.outer || it])) - (it.holes || []).reduce((t, h) => t + Math.abs(area([h])), 0)
const perim = (it) => [it.outer || it, ...(it.holes || [])].reduce((t, r) => { let q = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) q += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return t + q }, 0)
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const keys = (d) => { const k = []; for (const [n, c] of d.lawnKeys) for (let i = 0; i < c; i++) k.push(n); return k }
const tileOf = (d, [x, z]) => d.tiles.findIndex(t => t?.ring?.length >= 3 && pip(x, z, t.ring))
const tally = (d) => { const K = keys(d), m = new Map(); let sum = 0, P = 0
  d.bands.lawn.forEach((it, i) => { const a = itemArea(it); sum += a; P += perim(it); const k = `${tileOf(d, (it.outer || it)[0])}|${K[i]}`; m.set(k, (m.get(k) || 0) + a) })
  return { m, sum, P } }
// union area of the whole lawn: the sum of item areas minus every pairwise overlap (no triple overlaps were found)
const overlap = (d) => { const L = d.bands.lawn, bb = L.map(it => { let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity; for (const [x, z] of (it.outer || it)) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); e = Math.max(e, z) } return [a, b, c, e] })
  let o = 0; const byTile = new Map()
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const p = bb[i], q = bb[j]; if (p[0] > q[2] || q[0] > p[2] || p[1] > q[3] || q[1] > p[3]) continue
    const ov = intersectRings([L[i].outer || L[i], ...(L[i].holes || [])], [L[j].outer || L[j], ...(L[j].holes || [])]); const a = Math.abs(area(ov)); if (!(a > 0)) continue
    o += a; const t = tileOf(d, ov[0][0]); byTile.set(t, (byTile.get(t) || 0) + a) }
  return { o, byTile } }
const ta = tally(A), tb = tally(B), oa = overlap(A), ob = overlap(B)
console.log(`lawn pieces ${A.bands.lawn.length} → ${B.bands.lawn.length} · summed area ${ta.sum.toFixed(3)} → ${tb.sum.toFixed(3)} m² (Δ ${(tb.sum - ta.sum).toFixed(3)}) · overlap ${oa.o.toFixed(3)} → ${ob.o.toFixed(3)} m²`)
const ua = ta.sum - oa.o, ub = tb.sum - ob.o, tol = Math.max(ta.P, tb.P) * 0.001
console.log(`lawn UNION ${ua.toFixed(3)} → ${ub.toFixed(3)} m² (Δ ${(ub - ua).toFixed(3)}) · lattice tolerance (perimeter × 1 mm) ${tol.toFixed(1)} m² · within: ${Math.abs(ub - ua) <= tol}`)
let worst = 0, over = []
for (const k of new Set([...ta.m.keys(), ...tb.m.keys()])) { const d = Math.abs((tb.m.get(k) || 0) - (ta.m.get(k) || 0)); if (d < 1e-9) continue
  const t = +k.split('|')[0], cap = oa.byTile.get(t) || 0; worst = Math.max(worst, d); if (d > cap + 1e-4) over.push(`${k} moved ${d.toFixed(4)} m² > tile overlap ${cap.toFixed(4)}`) }
console.log(`(tile, key) areas that moved: worst ${worst.toFixed(4)} m² · moved more than their tile's overlap: ${over.length}`); for (const s of over.slice(0, 10)) console.log('   ' + s)
