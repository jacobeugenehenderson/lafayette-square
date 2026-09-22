// The actual cross-section, printed. Water plane on Lake Erie = 174.44 m NAVD88
// (the hydro-flattened value the 1 m DEM carries).
import { osm, localToWgs84, baked, resample, M_TO_FT } from './common.mjs'
import { utm17, patch } from './lidar.mjs'
const WATER = 174.44, REACH = 30
const g = osm.ground
const lake = g.natural.find(f => f.tags.natural === 'water' && f.tags.name === 'Lake Erie').coords
const d2lake = (x, z) => Math.min(...lake.map(p => Math.hypot(p.x - x, p.z - z)))

const cands = [
  ...g.barrier.filter(f => ['retaining_wall', 'wall'].includes(f.tags.barrier)).map(f => [`barrier=${f.tags.barrier}`, f]),
  ...g.other.filter(f => ['breakwater', 'groyne'].includes(f.tags.man_made)).map(f => [`man_made=${f.tags.man_made}`, f]),
].filter(([, f]) => { const c = f.coords[Math.floor(f.coords.length / 2)]; return d2lake(c.x, c.z) <= 15 && baked.inside(c.x, c.z) })

console.log(`${cands.length} wall/revetment features sit ON the waterline (<=15 m). Cross-section at the midpoint:\n`)
for (const [kind, f] of cands) {
  const st = resample(f.coords, 1e9)
  const s = resample(f.coords, Math.max(2, f.coords.reduce((a, c, i, arr) => i ? a + Math.hypot(c.x - arr[i-1].x, c.z - arr[i-1].z) : 0, 0) / 2))[1] || st[0]
  if (!s) continue
  const [lo, la] = localToWgs84(s.x, s.z); const [E0, N0] = utm17(lo, la)
  const P = await patch(E0 - REACH - 5, N0 - REACH - 5, E0 + REACH + 5, N0 + REACH + 5)
  const nx = -s.tz, nz = s.tx
  const prof = []
  for (let d = -REACH; d <= REACH; d += 2) {
    const x = s.x + nx * d, z = s.z + nz * d
    const [l2, a2] = localToWgs84(x, z); const [E, N] = utm17(l2, a2)
    prof.push({ d, v: P.get(E, N), b: baked.get(x, z) })
  }
  const vs = prof.filter(p => Number.isFinite(p.v)).map(p => p.v)
  const crest = Math.max(...vs)
  console.log(`${kind}  osm ${f.osmId}  x${s.x.toFixed(0)} z${s.z.toFixed(0)}  — crest ${crest.toFixed(2)} m = ${((crest - WATER) * M_TO_FT).toFixed(1)} ft above the lake`)
  const fmt = k => prof.map(p => Number.isFinite(p[k]) ? (p[k] - WATER).toFixed(1).padStart(5) : '   --').join('')
  console.log(`   d(m):${prof.map(p => String(p.d).padStart(5)).join('')}`)
  console.log(`   1 m :${fmt('v')}`)
  console.log(`   5 m :${fmt('b')}\n`)
}
