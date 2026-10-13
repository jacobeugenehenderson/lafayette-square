// pip-rows-equal.mjs — the deformer's row-indexed even-odd (`ringOdd`, read out of groundDeformer.mjs) against the whole-ring
// walk it replaced, on a dump's real rings (tiles' ring + iA, every band piece, the stencil): random points in each ring's
// bbox, its vertices, its edge midpoints, and points on its vertex rows. Any disagreement is printed. READ-ONLY, seconds.
//   node scratch/ground-height/pip-rows-equal.mjs <dump dir> [points per ring = 200]
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const src = readFileSync(R + 'cartograph/groundDeformer.mjs', 'utf8')
const a = src.indexOf('  const rowsOf = new WeakMap()'), b = src.indexOf('  const pipRings =')
if (a < 0 || b < a) throw new Error('ringOdd not found in groundDeformer.mjs — the probe is stale')
const ringOdd = new Function(src.slice(a, b) + '\nreturn ringOdd')()
const naive = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const A = JSON.parse(readFileSync(process.argv[2] + '/deform.json', 'utf8')), N = Number(process.argv[3] ?? 200)
const rings = []
for (const t of A.tiles || []) { if (t?.ring?.length >= 3) rings.push(t.ring); for (const r of t?.iA || []) if (r?.length >= 3) rings.push(r) }
for (const items of Object.values(A.bands)) for (const it of items || []) for (const r of (Array.isArray(it?.[0]) && typeof it[0][0] === 'number' ? [it] : [it.outer, ...(it.holes || [])])) if (r?.length >= 3) rings.push(r)
if (A.stencil?.length >= 3) rings.push(A.stencil)
let tests = 0, bad = 0, seed = 1
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
for (const r of rings) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z) }
  const pts = [[NaN, z0], [x0, NaN]]
  for (let k = 0; k < N; k++) pts.push([x0 - 1 + rnd() * (x1 - x0 + 2), z0 - 1 + rnd() * (z1 - z0 + 2)])
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]
    pts.push(p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [x0 + rnd() * (x1 - x0), p[1]], [p[0] - 1e-9, p[1]], [p[0], p[1] + 1e-12]) }
  for (const [x, z] of pts) { tests++; if (ringOdd(x, z, r) !== naive(x, z, r)) { if (bad++ < 5) console.log(`differs at (${x}, ${z}) on a ${r.length}-vertex ring`) } }
}
console.log(`[pip rows] ${rings.length} rings · ${tests} points · ${bad} disagree`)
process.exit(bad ? 1 : 0)
