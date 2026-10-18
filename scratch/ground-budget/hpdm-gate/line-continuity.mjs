// line-continuity.mjs — read-only: IS THE LINE A CONTINUOUS FUNCTION OF THE POINT? Around every vertex of every at-grade chain
// that turns, points on circles of radius r ∈ {1, 2, 4, 8, 16} m every 0.25° ask heightAt(chain, P); a JUMP is two neighbouring
// samples whose heights differ by more than their spacing (steeper than 1:1 — no smoothed line rises that fast; a discontinuity does).
//   node line-continuity.mjs <lineHeight module>
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
const { lineHeights } = await import(resolve(process.argv[2]))
const T = loadSceneTerrain('hipointedemun'), streets = JSON.parse(readFileSync('cartograph/data/hipointedemun/clean/ribbons.json', 'utf8')).streets
const LH = lineHeights({ streets, raw: T.getElevationRaw, sigma: 5 })
const byR = new Map(); let verts = 0, worst = { d: 0 }
for (const st of streets) { if (!(st?.points?.length >= 3) || st.gradeSeparated) continue; const id = st.skelId ?? st.name, P = st.points
  for (let i = 1; i + 1 < P.length; i++) { const d1 = [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]], d2 = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]]
    if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 1e-9) continue; verts++
    for (const r of [1, 2, 4, 8, 16]) { let prev = null, jumps = 0; const step = 0.25 * Math.PI / 180, sp = r * step
      for (let k = 0; k <= 1440; k++) { const a = k * step, h = LH.heightAt(id, [P[i][0] + r * Math.cos(a), P[i][1] + r * Math.sin(a)])
        if (prev != null && h != null && Math.abs(h - prev) > sp) { jumps++; if (Math.abs(h - prev) > worst.d) worst = { d: Math.abs(h - prev), id, at: P[i], r } } prev = h }
      const e = byR.get(r) || { jumps: 0, verts: 0 }; e.jumps += jumps; if (jumps) e.verts++; byR.set(r, e) } } }
console.log(`${process.argv[2].split('/').pop()}: ${verts} turning vertices · jumps by radius: ${[...byR].map(([r, e]) => `${r} m ${e.jumps} at ${e.verts} vertices`).join(' · ')} · worst ${worst.d.toFixed(3)} m${worst.id ? ` (${worst.id} at (${worst.at.map(v => v.toFixed(1)).join(', ')}), r ${worst.r})` : ''}${LH.wedge ? ` · wedge reads ${LH.wedge.n}` : ''}`)
