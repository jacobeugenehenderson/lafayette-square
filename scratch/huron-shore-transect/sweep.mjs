// EVERY WATER EDGE IN HURON'S FETCH, all four 1 m tiles. Classify the shore:
// is it a WALL (a sharp step) or a RAMP (a gentle grade)?
import { osm, localToWgs84, baked, resample, M_TO_FT } from './common.mjs'
import { utm17, patch } from './lidar.mjs'
const REACH = 60, SPACING = 20
const water = osm.ground.natural.filter(f => f.tags.natural === 'water')
const named = w => w.tags.name || '(unnamed water)'
const byName = {}
for (const w of water) (byName[named(w)] ||= []).push(w)
const pick = Object.entries(byName)
  .map(([n, ws]) => [n, ws, ws.reduce((a, w) => a + w.coords.length, 0)])
  .sort((a, b) => b[2] - a[2]).slice(0, 5)

for (const [name, ways] of pick) {
  let stations = []
  for (const w of ways) stations.push(...resample(w.coords, SPACING))
  const rows = []
  for (let i = 0; i < stations.length; i += 30) {
    const batch = stations.slice(i, i + 30)
    let mnE = Infinity, mxE = -Infinity, mnN = Infinity, mxN = -Infinity
    for (const s of batch) { const [lo, la] = localToWgs84(s.x, s.z); const [E, N] = utm17(lo, la)
      mnE = Math.min(mnE, E); mxE = Math.max(mxE, E); mnN = Math.min(mnN, N); mxN = Math.max(mxN, N) }
    let P; try { P = await patch(mnE - REACH - 5, mnN - REACH - 5, mxE + REACH + 5, mxN + REACH + 5) } catch { continue }
    for (const s of batch) {
      const nx = -s.tz, nz = s.tx
      const walk = sg => { const o = []
        for (let d = 0; d <= REACH; d++) { const x = s.x + nx * sg * d, z = s.z + nz * sg * d
          const [lo, la] = localToWgs84(x, z); const [E, N] = utm17(lo, la)
          o.push({ d, x, z, v: P.get(E, N), b: baked.get(x, z) }) } ; return o }
      const A = walk(1), B = walk(-1)
      const mean = a => { const v = a.filter(p => p.d >= 5 && Number.isFinite(p.v)).map(p => p.v); return v.length < REACH * 0.7 ? -Infinity : v.reduce((x, y) => x + y) / v.length }
      const mA = mean(A), mB = mean(B)
      if (mA === -Infinity && mB === -Infinity) continue
      const land = (mA >= mB ? A : B).filter(p => Number.isFinite(p.v))
      if (land.length < REACH * 0.8) continue
      const e0 = land[0].v
      const at = m => { const p = land.find(q => q.d >= m); return p ? p.v - e0 : NaN }
      let s10 = 0                                   // sharpest rise inside any 10 m window
      for (let j = 0; j < land.length; j++) { const k = land.findIndex(q => q.d >= land[j].d + 10); if (k < 0) break
        const r = land[k].v - land[j].v; if (r > s10) s10 = r }
      const bl = (mA >= mB ? A : B).filter(p => Number.isFinite(p.b))
      const bat = m => { const p = bl.find(q => q.d >= m); return bl.length && p ? p.b - bl[0].b : NaN }
      rows.push({ x: s.x, z: s.z, r10: at(10), r30: at(30), r60: at(60), s10, b30: bat(30), inStencil: baked.inside(s.x, s.z) })
    }
    process.stderr.write(`\r  ${name}: ${Math.min(i + 30, stations.length)}/${stations.length}   `)
  }
  process.stderr.write('\n')
  if (!rows.length) { console.log(`${name}: no usable transects`); continue }
  const fin = a => a.filter(Number.isFinite), q = (a, p) => { const s = fin(a).sort((m, n) => m - n); return s[Math.floor(s.length * p)] }
  const c = k => rows.map(r => r[k])
  const wall = rows.filter(r => r.s10 >= 1.5).length
  const bigwall = rows.filter(r => r.s10 >= 3.0).length
  const inS = rows.filter(r => r.inStencil)
  console.log(`\n${name.toUpperCase()}  — ${rows.length} transects @${SPACING} m (${inS.length} inside the baked stencil)`)
  console.log(`   rise 10 m inland : median ${q(c('r10'),.5).toFixed(2)}  p90 ${q(c('r10'),.9).toFixed(2)}  max ${Math.max(...fin(c('r10'))).toFixed(2)} m`)
  console.log(`   rise 30 m inland : median ${q(c('r30'),.5).toFixed(2)}  p90 ${q(c('r30'),.9).toFixed(2)}  max ${Math.max(...fin(c('r30'))).toFixed(2)} m   (5 m bake: median ${Number.isFinite(q(c('b30'),.5))?q(c('b30'),.5).toFixed(2):'--'}  p90 ${Number.isFinite(q(c('b30'),.9))?q(c('b30'),.9).toFixed(2):'--'})`)
  console.log(`   SHARPEST 10 m rise: median ${q(c('s10'),.5).toFixed(2)}  p90 ${q(c('s10'),.9).toFixed(2)}  max ${Math.max(...fin(c('s10'))).toFixed(2)} m (${(Math.max(...fin(c('s10')))*M_TO_FT).toFixed(1)} ft)`)
  console.log(`   ⇒ WALL-LIKE  (>=1.5 m in 10 m) : ${wall}/${rows.length} = ${(100*wall/rows.length).toFixed(1)}% of this edge`)
  console.log(`   ⇒ TALL WALL  (>=3.0 m in 10 m) : ${bigwall}/${rows.length} = ${(100*bigwall/rows.length).toFixed(1)}%`)
}
