// Is conformAndRefine's run time superlinear in its input? A synthetic town: N×N 100 m blocks, each ringed by asphalt,
// a 0.15 m curb and a 1.5 m walk around a lot, over a bumpy sampler. The ped bands (curb, walk) take the policy given
// (tol, minEdge); everything else the lots' (0.5 m, 6 m). Times each phase via the timed scratch copy (timers only).
//   node scratch/huron-cost/scale.mjs <N> <pedTol m> <pedMinEdge m>
import { conformAndRefine } from './groundConformity.timed.js'
const [N, pedTol, pedMin] = process.argv.slice(2).map(Number)
const sq = (ox, oz, a, b) => [[ox + a, oz + a], [ox + b, oz + a], [ox + b, oz + b], [ox + a, oz + b]]
const ring = (ox, oz, a, b, c, d) => ({ outer: sq(ox, oz, a, b), holes: [sq(ox, oz, c, d).reverse()] })
const sampler = (x, z) => 3 * Math.sin(x / 37) * Math.cos(z / 53) + 0.4 * Math.sin(x / 7 + z / 11)
const lots = { mode: 'adaptive', sampler, tol: 0.5, minEdge: 6, maxEdge: 50 }
const ped = { mode: 'adaptive', sampler, tol: pedTol, minEdge: pedMin, maxEdge: 50 }
const G = { asphalt: [], curb: [], walk: [], lot: [] }
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const ox = i * 100 - N * 50, oz = j * 100 - N * 50
  G.asphalt.push(ring(ox, oz, 0, 100, 4, 96)); G.curb.push(ring(ox, oz, 4, 96, 4.15, 95.85))
  G.walk.push(ring(ox, oz, 4.15, 95.85, 5.65, 94.35)); G.lot.push({ outer: sq(ox, oz, 5.65, 94.35) })
}
const specs = [{ polys: G.asphalt, refine: lots }, { polys: G.curb, refine: ped }, { polys: G.walk, refine: ped }, { polys: G.lot, refine: lots }]
const st = {}, t0 = performance.now()
const out = conformAndRefine(specs, st)
const ms = performance.now() - t0, tris = out.reduce((n, b) => n + b.indices.length / 3, 0)
console.log(`N ${N} · ped tol ${pedTol} min ${pedMin} · ${tris} tris · ${(ms / 1000).toFixed(2)} s · ${(ms * 1000 / tris).toFixed(2)} µs/tri · closures ${st.closures} · inTJ ${st.inputTJunctions} · refTJ ${st.refineTJunctions} · passes ${st.passes} · phases ${Object.entries(st.phaseMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}`).join(' ')}`)
