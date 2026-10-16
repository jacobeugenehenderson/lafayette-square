// band.mjs <scene> [tag=.mean] — BRIEF-the-shore-keeps-its-lidar Phase A step 1, read-only. Reads <scene><tag>.json from
// residual-by-distance.mjs (run with TERRAIN_DIR = the scratch true-mean terrain). Prints, for each side of the coast,
// |lidar − served| (H3), |r1| (1 m vs the true 5 m mean) and |r2| (true mean vs served) by distance from the coast line,
// and the band width the curve gives.
// ⭐ THE WIDTH RULE (stated, not typed): the band ends at the first distance d past which every 0.5 m bin out to 30 m
// has p90 |lidar − served| no higher than the REFERENCE level: the same side's p90 at 30–150 m from the coast (for the
// land side also the land-use edges' p90 at 30–150 m, whichever is higher: the open land everywhere carries that much).
// Quantiles are histogram bin edges (30 per decade, ~8% apart), so "no higher" means the same bin or lower.
// The tolerance ladder: cells within the band on that side whose |lidar − served| exceeds each tolerance — the most
// vertices the ground would need to show the band to that tolerance (one per 1 m cell; an upper bound).
import { readFileSync, existsSync } from 'fs'
const [scene, tag = '.mean'] = process.argv.slice(2)
const J = JSON.parse(readFileSync(new URL(`./${scene}${tag}.json`, import.meta.url)))
const old = existsSync(new URL(`./${scene}.json`, import.meta.url)) ? JSON.parse(readFileSync(new URL(`./${scene}.json`, import.meta.url))) : null
const { NB, HB, BIN, KINDS } = J
const edge = (h) => h === 0 ? 0 : Math.pow(10, h / 30 - 4)
const lowEdge = (h) => h === 0 ? 0 : Math.pow(10, (h - 1) / 30 - 4)
const pool = (D, key, k, b0, b1) => { const h = new Float64Array(HB); let n = 0
  for (let b = b0; b < Math.min(b1, NB); b++) { const kb = k * NB + b; n += D.N[kb]; for (let i = 0; i < HB; i++) h[i] += D[key][kb * HB + i] }
  return { n, h } }
const pctBin = (h, n, p) => { if (!n) return -1; let c = 0; for (let i = 0; i < HB; i++) { c += h[i]; if (c >= p * n) return i } return HB - 1 }
const mm = (v) => !Number.isFinite(v) ? '—' : v < 1 ? (v * 1000).toFixed(v < 0.01 ? 1 : 0) + ' mm' : v.toFixed(2) + ' m'
const q3 = (P) => [0.5, 0.9, 0.99].map(p => mm(edge(pctBin(P.h, P.n, p))).padStart(7)).join(' ')
const over = (P, x) => { let c = 0; for (let i = 0; i < HB; i++) if (lowEdge(i) >= x) c += P.h[i]; return c }
const b = (m) => Math.round(m / BIN), REF0 = +(process.env.REF0 || 30), FAR0 = b(REF0), FAR1 = NB - 1   // REF0: where the reference zone starts (default 30 m); the width search runs to it
const LU = KINDS.indexOf('LU')
console.log(`\n=== ${scene} (reference zone ${REF0}–150 m): terrain ${J.terrainDir || 'clean/'} · ${J.cellsDisc.toLocaleString()} 1 m cells in the disc · no lidar ${J.noLidar.toLocaleString()} (on land ${J.noLidarLand.toLocaleString()}) · no whole 5 m mean ${J.noMean.toLocaleString()}`)
const TOLS = [0.5, 0.1, 0.05, 0.02, 0.0078]
// the width the curve of `key` on side k gives against its reference (see the header); null if it never falls inside 30 m
const widthOf = (D, key, k, refBin) => { for (let d = 0; d <= FAR0; d++) { let ok = true
    for (let e = d; e < FAR0 && ok; e++) { const P = pool(D, key, k, e, e + 1); if (P.n && pctBin(P.h, P.n, 0.9) > refBin) ok = false }
    if (ok) return d * BIN } return null }
const refOf = (D, key, ks) => Math.max(...ks.map(k => { const P = pool(D, key, k, FAR0, FAR1); return pctBin(P.h, P.n, 0.9) }))
const hasH4 = !!J.H4
for (const side of ['coast-land', 'coast-water']) {
  const k = KINDS.indexOf(side)
  const all = pool(J, 'H1', k, 0, NB); if (!all.n) { console.log(`\n  ${side}: no cells`); continue }
  // ⭐ ON THE WATER SIDE the served grid is the BED by design (bake-terrain#writeBed), so lidar − served measures the bed's
  // depth, not missing detail: the water side's band is read on r1 (the lidar's own detail) alone.
  const key = side === 'coast-land' ? 'H3' : 'H1'
  const ks = side === 'coast-land' ? [k, LU] : [k]
  const ref = refOf(J, key, ks)
  console.log(`\n  ${side} — ${all.n.toLocaleString()} cells · band read on ${key === 'H3' ? '|lidar − served|' : '|r1| (lidar − the true 5 m mean)'} · reference p90 ${mm(edge(ref))} (${ks.map(x => KINDS[x]).join(' / ')} at ${REF0}–150 m)`)
  console.log(`    d from coast   cells      |lidar−served| p50/p90/p99${hasH4 ? '   same, 4 nodes on land (cells)       ' : ''}   |r1| p50/p90/p99          |r2| p50/p90/p99${old ? '        |r2| BEFORE (overview grid)' : ''}`)
  const EDGES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10, 12.5, 15, 20, 25, 30, 45, 60, 90, 150]
  for (let e = 0; e + 1 < EDGES.length; e++) {
    const b0 = b(EDGES[e]), b1 = b(EDGES[e + 1])
    const P3 = pool(J, 'H3', k, b0, b1); if (!P3.n) continue
    const lab = `${EDGES[e]}–${EDGES[e + 1]} m`.padEnd(12)
    const oldP = old ? pool(old, 'H2', k, b0, b1) : null
    let h4 = ''
    if (hasH4) { const P4 = pool({ ...J, N: J.N4 }, 'H4', k, b0, b1); h4 = `   ${P4.n ? q3(P4) : '      —       —       —'} (${P4.n.toLocaleString().padStart(7)})` }
    console.log(`    ${lab} ${P3.n.toLocaleString().padStart(10)}   ${q3(P3)}${h4}   ${q3(pool(J, 'H1', k, b0, b1))}   ${q3(pool(J, 'H2', k, b0, b1))}${oldP ? '   ' + q3(oldP) : ''}`)
  }
  const width = widthOf(J, key, k, ref)
  const r1w = widthOf(J, 'H1', k, refOf(J, 'H1', ks))
  const oldR1w = old ? widthOf(old, 'H1', k, refOf(old, 'H1', ks)) : null
  if (width == null) { console.log(`    ⇒ BAND: the curve never falls to the reference inside ${REF0} m on this side`); continue }
  const B = pool(J, key, k, 0, b(width))
  console.log(`    ⇒ BAND WIDTH ${width.toFixed(1)} m on ${key === 'H3' ? '|lidar − served|' : '|r1|'} (${B.n.toLocaleString()} cells)${key === 'H3' ? ` · on |r1| alone ${r1w == null ? '> 30' : r1w.toFixed(1)} m` : ''}${oldR1w != null ? ` · |r1| on the step-5 run ${oldR1w.toFixed(1)} m` : ''}`)
  console.log(`      cells over each tolerance (one vertex each, an upper bound): ${TOLS.map(t => `${mm(t)} ${over(B, t).toLocaleString()}`).join(' · ')}`)
}
