// line-residual.mjs — read-only: the continuity check's jumps that a lineHeight module still has at radius r, with the vertex's
// turn, its two segments' lengths, and whether the jump's two samples' nearest segments are ADJACENT (the wedge rule's reach).
//   node line-residual.mjs <lineHeight module> <r>
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
const { lineHeights } = await import(resolve(process.argv[2])), r = +process.argv[3]
const T = loadSceneTerrain('hipointedemun'), streets = JSON.parse(readFileSync('cartograph/data/hipointedemun/clean/ribbons.json', 'utf8')).streets, LH = lineHeights({ streets, raw: T.getElevationRaw, sigma: 5 })
const segOf = (P, p) => { let best = Infinity, k = -1; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0, d = (p[0] - a[0] - u * dx) ** 2 + (p[1] - a[1] - u * dz) ** 2; if (d < best) { best = d; k = i } } return k }
const cls = new Map(), ex = new Map()
for (const st of streets) { if (!(st?.points?.length >= 3) || st.gradeSeparated) continue; const id = st.skelId ?? st.name, P = st.points
  for (let i = 1; i + 1 < P.length; i++) { const d1 = [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]], d2 = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]]
    if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 1e-9) continue
    const turn = Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1])) * 180 / Math.PI, l1 = Math.hypot(...d1), l2 = Math.hypot(...d2)
    let prev = null, pp = null; const step = 0.25 * Math.PI / 180
    for (let k = 0; k <= 1440; k++) { const a = k * step, p = [P[i][0] + r * Math.cos(a), P[i][1] + r * Math.sin(a)], h = LH.heightAt(id, p)
      if (prev != null && h != null && Math.abs(h - prev) > r * step) { const s0 = segOf(P, pp), s1 = segOf(P, p), adj = Math.abs(s0 - s1) <= 1
        const key = `${adj ? 'adjacent segments' : `segments ${Math.abs(s0 - s1)} apart`} · ${Math.min(l1, l2) < r ? 'a leg shorter than r' : 'legs ≥ r'}${s0 === 0 || s1 === P.length - 2 ? ' · at the chain\'s end segment' : ''}`
        cls.set(key, (cls.get(key) || 0) + 1); if (!ex.has(key)) ex.set(key, `${id} at (${P[i].map(v => v.toFixed(1)).join(', ')}) turn ${turn.toFixed(1)}° legs ${l1.toFixed(2)}/${l2.toFixed(2)} m · Δh ${Math.abs(h - prev).toFixed(3)}`) }
      prev = h; pp = p } } }
for (const [k, v] of [...cls].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)}  ${k}   e.g. ${ex.get(k)}`)
