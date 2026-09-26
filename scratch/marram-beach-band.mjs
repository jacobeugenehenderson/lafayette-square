// marram-beach-band.mjs — HOW WIDE IS A TOWN'S BEACH BAND, MEASURED FROM ITS OWN DATA?
// ▶ node scratch/marram-beach-band.mjs [--scene=provincetown] [--look=provincetown]
// For every `natural` polygon of use beach / sand / dune in clean/map.json, samples a 2 m grid
// inside it and reads the baked coastDist channel (context.json; metres = v × mPerUnit; exact
// within two texels of the shore, EDT beyond with error ≤ farErrorBoundM). Reports, per use,
// the area-weighted distance-from-waterline distribution. Writes nothing.
// Measures q-beach-band-width's own suggested route: "the natural=beach polygons' own width
// against the coast arcs".
import { readFileSync } from 'node:fs'
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1]
const scene = arg('scene', 'provincetown'), look = arg('look', scene)
const map = JSON.parse(readFileSync(`cartograph/data/${scene}/clean/map.json`, 'utf8'))
const ctx = JSON.parse(readFileSync(`public/baked/${look}/context.json`, 'utf8')).channels.coastDist
const buf = readFileSync(`public/baked/${look}/${ctx.bin}`)
const U = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
const { minX, maxX, minZ, maxZ } = ctx.bounds, W = ctx.width, H = ctx.height
const sx = (maxX - minX) / (W - 1), sz = (maxZ - minZ) / (H - 1)
const at = (x, z) => {                                   // bilinear, metres
  const fi = (x - minX) / sx, fj = (z - minZ) / sz
  const i = Math.floor(fi), j = Math.floor(fj)
  if (i < 0 || j < 0 || i >= W - 1 || j >= H - 1) return NaN
  const a = fi - i, b = fj - j, v = (ii, jj) => U[jj * W + ii]
  return ((1 - a) * (1 - b) * v(i, j) + a * (1 - b) * v(i + 1, j) + (1 - a) * b * v(i, j + 1) + a * b * v(i + 1, j + 1)) * ctx.mPerUnit
}
const inside = (ring, x, z) => { let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const A = ring[i], B = ring[j]
    if ((A.z > z) !== (B.z > z) && x < (B.x - A.x) * (z - A.z) / (B.z - A.z) + A.x) c = !c }
  return c }
const STEP = 2
const pct = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
for (const use of ['beach', 'sand', 'dune']) {
  const polys = map.layers.natural.filter(f => f.use === use && f.ring?.length > 2)
  const d = [], widths = []
  for (const f of polys) {
    const xs = f.ring.map(p => p.x), zs = f.ring.map(p => p.z)
    const mine = []
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += STEP)
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += STEP)
        if (inside(f.ring, x, z)) { const v = at(x, z); if (Number.isFinite(v)) { d.push(v); mine.push(v) } }
    if (mine.length) { mine.sort((a, b) => a - b); widths.push(pct(mine, 0.95)) }
  }
  d.sort((a, b) => a - b); widths.sort((a, b) => a - b)
  const ha = d.length * STEP * STEP / 1e4
  console.log(`${use.padEnd(5)} ${String(polys.length).padStart(3)} polys · ${ha.toFixed(1).padStart(7)} ha · distance from waterline (m), area-weighted: p50 ${pct(d, .5)?.toFixed(0)}  p75 ${pct(d, .75)?.toFixed(0)}  p90 ${pct(d, .9)?.toFixed(0)}  p95 ${pct(d, .95)?.toFixed(0)} · per-polygon p95 width: median ${pct(widths, .5)?.toFixed(0)}  p90 ${pct(widths, .9)?.toFixed(0)}`)
}
console.log(`coastDist texel ${ctx.texelM.map(v => v.toFixed(1)).join('×')} m · exact ≤ 2 texels of shore, EDT beyond (error ≤ ${ctx.farErrorBoundM} m)`)
