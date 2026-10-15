// summary.mjs <scene> [refineTol m] — reads <scene>.json from residual-by-distance.mjs. Prints, per edge kind, |r1| (real
// detail: 1 m vs the true 5 m mean) and |r2| (resampling: true mean vs served) by distance from the nearest line, the
// share of cells over the deformer's own refineTol (a line on the curve, never the cut), and the curve's
// near/far ratio (p90 within 2 m vs 30–150 m). No width is derived here: the curves are read, by eye, in the report.
import { readFileSync } from 'fs'
const [scene, tolArg] = process.argv.slice(2)
const J = JSON.parse(readFileSync(new URL(`./${scene}.json`, import.meta.url)))
const { NB, HB, BIN, KINDS, N, S1, H1, H2 } = J
const tol = tolArg ? +tolArg : null
const edge = (h) => h === 0 ? 0 : Math.pow(10, (h) / 30 - 4)          // upper edge of hist bin h
const lowEdge = (h) => h === 0 ? 0 : Math.pow(10, (h - 1) / 30 - 4)
const pool = (k, b0, b1) => { const h = new Float64Array(HB), g = new Float64Array(HB); let n = 0, s = 0
  for (let b = b0; b < Math.min(b1, NB); b++) { const kb = k * NB + b; n += N[kb]; s += S1[kb]; for (let i = 0; i < HB; i++) { h[i] += H1[kb * HB + i]; g[i] += H2[kb * HB + i] } }
  return { n, s, h, g } }
const pct = (h, n, p) => { if (!n) return NaN; let c = 0, t = p * n; for (let i = 0; i < HB; i++) { c += h[i]; if (c >= t) return edge(i) } return Infinity }
const over = (h, x) => { let c = 0; for (let i = 0; i < HB; i++) if (lowEdge(i) >= x) c += h[i]; return c }  // cells whose whole bin lies ≥ x
const mm = (v) => !Number.isFinite(v) ? '—' : v < 1 ? (v * 1000).toFixed(v < 0.01 ? 1 : 0) + ' mm' : v.toFixed(2) + ' m'
const total = N.reduce((a, b) => a + b, 0), totalS = S1.reduce((a, b) => a + b, 0)
console.log(`\n=== ${scene}: ${J.cellsDisc.toLocaleString()} 1 m cells in the disc · no lidar ${J.noLidar.toLocaleString()} (${(100 * J.noLidar / J.cellsDisc).toFixed(2)}%) (on land ${J.noLidarLand?.toLocaleString()}) · land cells ${J.landCells?.toLocaleString()} · no whole 5 m mean ${J.noMean.toLocaleString()} · measured ${total.toLocaleString()} · grid step ${J.step.toFixed(4)} m${tol ? ` · refineTol ${mm(tol)}` : ' · refineTol not on record'}`)
const EDGES = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7.5, 10, 15, 20, 30, 45, 60, 90, 150, Infinity]
const widths = {}
for (let k = 0; k < KINDS.length; k++) {
  const all = pool(k, 0, NB); if (!all.n) continue
  console.log(`\n  ${KINDS[k]} — ${all.n.toLocaleString()} cells (${(100 * all.n / total).toFixed(1)}%), ${(100 * all.s / totalS).toFixed(1)}% of Σ|r1|`)
  console.log(`    d from line   cells       |r1| p50 / p90 / p99         |r2| p50 / p90 / p99        ${tol ? '|r1| > tol' : ''}`)
  for (let e = 0; e + 1 < EDGES.length; e++) {
    const b0 = Math.round(EDGES[e] / BIN), b1 = Number.isFinite(EDGES[e + 1]) ? Math.round(EDGES[e + 1] / BIN) : NB
    const P = pool(k, b0, b1); if (!P.n) continue
    const lab = `${EDGES[e]}–${Number.isFinite(EDGES[e + 1]) ? EDGES[e + 1] : '∞'} m`.padEnd(12)
    console.log(`    ${lab} ${P.n.toLocaleString().padStart(10)}   ${[0.5, 0.9, 0.99].map(p => mm(pct(P.h, P.n, p)).padStart(8)).join(' ')}   ${[0.5, 0.9, 0.99].map(p => mm(pct(P.g, P.n, p)).padStart(8)).join(' ')}   ${tol ? (100 * over(P.h, tol) / P.n).toFixed(1).padStart(5) + '%' : ''}`)
  }
  const near = pool(k, 0, Math.round(2 / BIN)), far = pool(k, Math.round(30 / BIN), NB - 1)
  if (near.n && far.n) console.log(`    ⇒ p90 |r1| within 2 m of the line ${mm(pct(near.h, near.n, 0.9))} · at 30–150 m ${mm(pct(far.h, far.n, 0.9))} (ratio ${(pct(near.h, near.n, 0.9) / pct(far.h, far.n, 0.9)).toFixed(2)})`)
}

