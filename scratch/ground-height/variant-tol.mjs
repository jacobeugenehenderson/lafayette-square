// variant-tol.mjs — writes an instrumented copy of cartograph/bake-ground.js whose draped groups refine at a tolerance
// DERIVED per group: min(the kit's GROUND_REFINE_TOL_M, the group's median piece width / 48 — ADA's 1:48 cross-slope,
// the ruled norm). Width of a piece = 2·area / perimeter of its outer ring (a strip's width). A MEASUREMENT variant for
// Boz/Jacob's tolerance choice (Boz 2026-10-10 ruling 3); nothing served reads it. Run via scratch/kerb-cut/swap.mjs.
//   node scratch/ground-height/variant-tol.mjs <out file>
import { readFileSync, writeFileSync } from 'fs'
const out = process.argv[2]
const src = readFileSync(new URL('../../cartograph/bake-ground.js', import.meta.url), 'utf8')
const at = `tol: key === 'bed' || key === 'shore' ? bedTol : refineTol,`
if (!src.includes(at)) throw new Error('variant-tol: the policy line moved — update the anchor')
// Width: AREA-WEIGHTED mean of 2·area/perimeter over the group's pieces, area net of holes and perimeter including them (Σ 2A²/P ÷ Σ A), so slivers — numerous, tiny —
// do not decide it (the median did: treelawn 0.06 m, sidewalk 0.60 m, 2026-10-10 first run).
const helper = `(() => { let num = 0, den = 0; for (const p of toPolys(items)) { let A = 0, P = 0; [p.outer, ...(p.holes || [])].forEach((r, k) => { let a2 = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; a2 += (a[0] * b[1] - b[0] * a[1]) / 2; P += Math.hypot(b[0] - a[0], b[1] - a[1]) } A += k === 0 ? Math.abs(a2) : -Math.abs(a2) }); A = Math.max(A, 0); if (P > 0) { num += 2 * A * A / P; den += A } } const w = den > 0 ? num / den : Infinity; const t = Math.min(refineTol, w / 48); console.log('  [variant-tol] ' + kind + ':' + key + ' area-weighted width ' + w.toFixed(2) + ' m → tol ' + t.toFixed(3) + ' m'); return t })()`
writeFileSync(out, src.replace(at, `tol: key === 'bed' || key === 'shore' ? bedTol : ${helper},`))
console.log('wrote', out)
