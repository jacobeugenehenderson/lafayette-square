// Boundary-deviation hotspots: sample NEW block boundaries at 1m; for each
// sample, distance to the nearest HEAD boundary. Cluster deviations >0.5m and
// report cluster centers + max dev. Localizes every geometry change.
import { build } from './tresaguet-setup.mjs'
import fs from 'fs'
const head = JSON.parse(fs.readFileSync('scratch/tresaguet-blocks-HEAD.json', 'utf8'))
const g = build()

// grid index of HEAD boundary segments
const CELL = 8
const grid = new Map()
const gk = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL)
for (const r of head.block) for (let i = 0; i < r.length; i++) {
  const a = r[i], b = r[(i + 1) % r.length]
  const minx = Math.min(a[0], b[0]), maxx = Math.max(a[0], b[0])
  const minz = Math.min(a[1], b[1]), maxz = Math.max(a[1], b[1])
  for (let cx = Math.floor(minx / CELL); cx <= Math.floor(maxx / CELL); cx++)
    for (let cz = Math.floor(minz / CELL); cz <= Math.floor(maxz / CELL); cz++) {
      const k = cx + ',' + cz
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push([a, b])
    }
}
const dSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t))
}
const dHead = (p) => {
  let d = 1e9
  const cx = Math.floor(p[0] / CELL), cz = Math.floor(p[1] / CELL)
  for (let ring = 0; ring < 3 && d === 1e9; ring++) {
    for (let i = -ring - 1; i <= ring + 1; i++) for (let j = -ring - 1; j <= ring + 1; j++) {
      for (const [a, b] of grid.get((cx + i) + ',' + (cz + j)) || []) d = Math.min(d, dSeg(p, a, b))
    }
  }
  return d
}
// sample + cluster
const devs = []
for (const r of g.block) for (let i = 0; i < r.length; i++) {
  const a = r[i], b = r[(i + 1) % r.length]
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(1, Math.ceil(L))
  for (let k = 0; k < n; k++) {
    const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]
    const d = dHead(p)
    if (d > 0.5 && d < 1e8) devs.push({ p, d })
  }
}
const clusters = []
for (const { p, d } of devs) {
  let c = clusters.find(c => Math.hypot(c.x / c.n - p[0], c.z / c.n - p[1]) < 25)
  if (!c) { c = { x: 0, z: 0, n: 0, max: 0 }; clusters.push(c) }
  c.x += p[0]; c.z += p[1]; c.n++; c.max = Math.max(c.max, d)
}
clusters.sort((a, b) => b.max - a.max)
console.log(devs.length, 'deviating samples,', clusters.length, 'clusters:')
for (const c of clusters) console.log(`  @(${(c.x / c.n).toFixed(0)},${(c.z / c.n).toFixed(0)}) max=${c.max.toFixed(2)}m n=${c.n}`)
