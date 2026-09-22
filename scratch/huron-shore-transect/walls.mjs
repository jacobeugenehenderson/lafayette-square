// CROSS-SECTION EVERY NOTED WALL FEATURE — huron, 1 m lidar vs the shipped 5 m bake.
// Perpendicular transects across each way; what we want is the DROP across it.
import { osm, localToWgs84, baked, resample, M_TO_FT } from './common.mjs'
import { utm17, patch } from './lidar.mjs'

const REACH = 25, SPACING = 10
const g = osm.ground
const groups = {
  'barrier=retaining_wall': g.barrier.filter(f => f.tags.barrier === 'retaining_wall'),
  'barrier=wall':           g.barrier.filter(f => f.tags.barrier === 'wall'),
  'man_made=breakwater':    g.other.filter(f => f.tags.man_made === 'breakwater'),
  'man_made=groyne':        g.other.filter(f => f.tags.man_made === 'groyne'),
  'man_made=pier':          g.other.filter(f => f.tags.man_made === 'pier'),
  'natural=beach':          g.natural.filter(f => f.tags.natural === 'beach'),
}

for (const [name, feats] of Object.entries(groups)) {
  const rows = []
  let outside = 0
  for (const f of feats) {
    const st = resample(f.coords, SPACING).filter(s => baked.inside(s.x, s.z))
    if (!st.length) { outside++; continue }
    for (let i = 0; i < st.length; i += 25) {
      const batch = st.slice(i, i + 25)
      let mnE = Infinity, mxE = -Infinity, mnN = Infinity, mxN = -Infinity
      for (const s of batch) { const [lo, la] = localToWgs84(s.x, s.z); const [E, N] = utm17(lo, la)
        mnE = Math.min(mnE, E); mxE = Math.max(mxE, E); mnN = Math.min(mnN, N); mxN = Math.max(mxN, N) }
      const P = await patch(mnE - REACH - 5, mnN - REACH - 5, mxE + REACH + 5, mxN + REACH + 5)
      for (const s of batch) {
        const nx = -s.tz, nz = s.tx
        const prof = []
        for (let d = -REACH; d <= REACH; d++) {
          const x = s.x + nx * d, z = s.z + nz * d
          const [lo, la] = localToWgs84(x, z); const [E, N] = utm17(lo, la)
          prof.push({ d, v: P.get(E, N), b: baked.get(x, z) })
        }
        const v = prof.filter(p => Number.isFinite(p.v))
        if (v.length < REACH) continue
        const vs = v.map(p => p.v)
        const drop = Math.max(...vs) - Math.min(...vs)
        let step = 0
        for (let j = 1; j < v.length; j++) { const r = Math.abs(v[j].v - v[j - 1].v); if (r > step) step = r }
        const bs = prof.filter(p => Number.isFinite(p.b)).map(p => p.b)
        const bdrop = bs.length ? Math.max(...bs) - Math.min(...bs) : NaN
        rows.push({ osmId: f.osmId, x: s.x, z: s.z, drop, step, bdrop })
      }
    }
  }
  const fin = a => a.filter(Number.isFinite)
  const q = (a, p) => { const s = fin(a).sort((m, n) => m - n); return s.length ? s[Math.floor(s.length * p)] : NaN }
  const c = k => rows.map(r => r[k])
  if (!rows.length) { console.log(`\n${name}: ${feats.length} features, ${outside} wholly outside the stencil — no usable cross-section`); continue }
  console.log(`\n${name}  —  ${feats.length} features (${outside} outside the stencil), ${rows.length} cross-sections`)
  console.log(`   1 m  relief across ±25 m : median ${q(c('drop'),.5).toFixed(2)} m   p90 ${q(c('drop'),.9).toFixed(2)}   max ${Math.max(...fin(c('drop'))).toFixed(2)} m (${(Math.max(...fin(c('drop')))*M_TO_FT).toFixed(1)} ft)`)
  console.log(`   1 m  steepest 1 m step   : median ${q(c('step'),.5).toFixed(2)} m   p90 ${q(c('step'),.9).toFixed(2)}   max ${Math.max(...fin(c('step'))).toFixed(2)} m`)
  console.log(`   5 m bake relief          : median ${q(c('bdrop'),.5).toFixed(2)} m   p90 ${q(c('bdrop'),.9).toFixed(2)}   max ${Math.max(...fin(c('bdrop'))).toFixed(2)} m`)
  rows.slice().sort((a, b) => b.drop - a.drop).slice(0, 4).forEach(r =>
    console.log(`     steepest: osm ${r.osmId}  x${r.x.toFixed(0)} z${r.z.toFixed(0)}  drop ${r.drop.toFixed(2)} m (${(r.drop*M_TO_FT).toFixed(1)} ft)  step ${r.step.toFixed(2)}  bake ${Number.isFinite(r.bdrop)?r.bdrop.toFixed(2):'--'}`))
}
