// TRANSECT THE SHORE — v2. The 1 m DEM is HYDRO-FLATTENED (Lake Erie is a constant
// 174.44 m plane), so landward is chosen by mean elevation, not by voids.
import { osm, localToWgs84, baked, resample, M_TO_FT } from './common.mjs'
import { utm17, patch } from './lidar.mjs'

const SPACING = 20, REACH = 120
const lake = osm.ground.natural.find(f => f.tags.natural === 'water' && f.tags.name === 'Lake Erie')
let stations = resample(lake.coords, SPACING).filter(s => baked.inside(s.x, s.z))
console.log(`Lake Erie way: ${lake.coords.length} pts → ${stations.length} stations @${SPACING} m inside the stencil`)

const rows = []
for (let i = 0; i < stations.length; i += 30) {
  const batch = stations.slice(i, i + 30)
  let mnE = Infinity, mxE = -Infinity, mnN = Infinity, mxN = -Infinity
  for (const s of batch) { const [lo, la] = localToWgs84(s.x, s.z); const [E, N] = utm17(lo, la)
    mnE = Math.min(mnE, E); mxE = Math.max(mxE, E); mnN = Math.min(mnN, N); mxN = Math.max(mxN, N) }
  const P = await patch(mnE - REACH - 5, mnN - REACH - 5, mxE + REACH + 5, mxN + REACH + 5)

  for (const s of batch) {
    const nx = -s.tz, nz = s.tx
    const walk = sign => { const o = []
      for (let d = 0; d <= REACH; d++) { const x = s.x + nx * sign * d, z = s.z + nz * sign * d
        const [lo, la] = localToWgs84(x, z); const [E, N] = utm17(lo, la)
        o.push({ d, x, z, v: P.get(E, N), b: baked.get(x, z) }) }
      return o }
    const A = walk(1), B = walk(-1)
    const mean = a => { const v = a.filter(p => p.d >= 5 && Number.isFinite(p.v)).map(p => p.v); return v.length < 40 ? -Infinity : v.reduce((x, y) => x + y) / v.length }
    const mA = mean(A), mB = mean(B)
    if (!Number.isFinite(mA) && !Number.isFinite(mB)) continue
    const land = mA >= mB ? A : B, water = mA >= mB ? B : A
    const prof = land.filter(p => Number.isFinite(p.v))
    if (prof.length < REACH * 0.8) continue
    const e0 = prof[0].v
    const at = m => { const p = prof.find(q => q.d >= m); return p ? p.v - e0 : NaN }
    let step = 0, stepAt = 0, step3 = 0
    for (let j = 1; j < prof.length; j++) {
      if (prof[j].d <= 60) { const r = prof[j].v - prof[j - 1].v; if (r > step) { step = r; stepAt = prof[j].d } }
      if (j >= 3 && prof[j].d <= 60) { const r3 = prof[j].v - prof[j - 3].v; if (r3 > step3) step3 = r3 }
    }
    const wv = water.filter(p => Number.isFinite(p.v) && p.d >= 5).map(p => p.v)
    const wFlat = wv.length ? (Math.max(...wv) - Math.min(...wv)) : NaN
    const bprof = land.filter(p => Number.isFinite(p.b))
    const b0 = bprof.length ? bprof[0].b : NaN
    const bat = m => { const p = bprof.find(q => q.d >= m); return p ? p.b - b0 : NaN }
    rows.push({ x: s.x, z: s.z, e0, r5: at(5), r10: at(10), r25: at(25), r60: at(60), r120: at(120),
                step, step3, stepAt, wFlat, b25: bat(25), b60: bat(60), b120: bat(120) })
  }
  process.stderr.write(`\r  ${Math.min(i + 30, stations.length)}/${stations.length}`)
}
process.stderr.write('\n')

const fin = a => a.filter(Number.isFinite)
const q = (a, p) => { const s = fin(a).sort((m, n) => m - n); return s[Math.floor(s.length * p)] }
const col = k => rows.map(r => r[k])
const line = (label, c) => console.log(`${label.padEnd(22)}${q(c,.5).toFixed(2).padStart(8)}${q(c,.9).toFixed(2).padStart(9)}${q(c,.99).toFixed(2).padStart(9)}${Math.max(...fin(c)).toFixed(2).padStart(9)}   ${(q(c,.99)*M_TO_FT).toFixed(1).padStart(5)} ft /${(Math.max(...fin(c))*M_TO_FT).toFixed(1).padStart(6)} ft`)

console.log(`\nusable transects: ${rows.length}`)
console.log(`water-side flatness (max-min over 5..120 m): median ${q(col('wFlat'),.5).toFixed(2)} m  — near 0 confirms the hydro-flattened plane\n`)
console.log('1 m LIDAR              median      p90      p99      max        p99 / max')
line('rise   5 m inland', col('r5')); line('rise  10 m inland', col('r10')); line('rise  25 m inland', col('r25'))
line('rise  60 m inland', col('r60')); line('rise 120 m inland', col('r120'))
line('steepest 1 m step', col('step')); line('steepest 3 m step', col('step3'))
console.log('\nSHIPPED 5 m BAKE (control)')
line('rise  25 m inland', col('b25')); line('rise  60 m inland', col('b60')); line('rise 120 m inland', col('b120'))
const pct = (n) => `${n} / ${rows.length}  (${(100*n/rows.length).toFixed(1)}%)`
console.log(`\ntransects with a >=1.0 m rise in ONE 1 m step        : ${pct(rows.filter(r=>r.step>=1).length)}`)
console.log(`transects rising >=3.0 m (10 ft) within 25 m         : ${pct(rows.filter(r=>r.r25>=3).length)}`)
console.log(`transects rising >=4.6 m (15 ft) within 25 m         : ${pct(rows.filter(r=>r.r25>=4.6).length)}`)
console.log(`transects rising >=4.6 m (15 ft) within 60 m         : ${pct(rows.filter(r=>r.r60>=4.6).length)}`)
console.log('\nsteepest 15 stations:')
rows.slice().sort((a,b)=>b.step-a.step).slice(0,15).forEach(r=>
  console.log(`  x${r.x.toFixed(0).padStart(6)} z${r.z.toFixed(0).padStart(6)}  toe ${r.e0.toFixed(1)} m  step ${r.step.toFixed(2)}@${r.stepAt}m  3m-step ${r.step3.toFixed(2)}  rise25 ${r.r25.toFixed(2)} (${(r.r25*M_TO_FT).toFixed(1)} ft)  bake25 ${Number.isFinite(r.b25)?r.b25.toFixed(2):'--'}`))
