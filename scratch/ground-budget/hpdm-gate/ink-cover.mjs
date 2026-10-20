// ink-cover.mjs — read-only: is the ① strip beside every tile edge held by an ink piece? Every 0.5 m along every tile's ①
// ring, a probe ε (PROTO_HW) outside the ring and inside the disc goes to the deformer: in another tile · in ink · on the grid · in nothing.
//   node --max-old-space-size=6000 ink-cover.mjs <dump.json> <groundDeformer.mjs>
import { readFileSync } from 'fs'
import { resolve } from 'path'
const dump = JSON.parse(readFileSync(process.argv[2], 'utf8')), { buildDeformer } = await import(resolve(process.argv[3]))
const D = buildDeformer({ town: 'hipointedemun', tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw: () => 0,
  line: { step: 1, heightAt: () => 0 }, limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 } })
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const eps = 0.005, cnt = { probes: 0, offDisc: 0, tile: 0 }, before = { ...D.stats }, miss = []
for (const t of dump.tiles) { const r = t.ring, n = r.length
  for (let i = 0; i < n; i++) { const p = r[i], q = r[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 1e-6) continue
    const nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L, mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, sgn = pip(mx + nx * 1e-4, mz + nz * 1e-4, r) ? -1 : 1
    for (let s = 0.25; s < L; s += 0.5) { const x = p[0] + (q[0] - p[0]) * s / L + sgn * nx * eps, z = p[1] + (q[1] - p[1]) * s / L + sgn * nz * eps
      if (dump.stencil && !pip(x, z, dump.stencil)) { cnt.offDisc++; continue }
      cnt.probes++; const o = D.stats.outside, k = D.stats.road + D.stats.evaluated + D.stats.deep; D.heightAt(x, z)
      if (D.stats.road + D.stats.evaluated + D.stats.deep > k) cnt.tile++
      if (D.stats.outside > o && miss.length < 2000) miss.push([x, z, t.ringOwner[i]?.skelId ?? t.ringOwner[i]?.kind]) } } }
const d = (k) => D.stats[k] - before[k]
const by = new Map(); for (const m of miss) by.set(m[2], (by.get(m[2]) || 0) + 1)
console.log(`probes ${cnt.probes} (off the disc ${cnt.offDisc}) · in another tile ${cnt.tile} · in ink ${d('ink')} (crossing ${d('inkCrossing')}) · on the grid ${d('inkOnGrid')} · IN NOTHING ${d('outside')}`)
console.log(`in nothing, by the edge's owner (first 2000): ${[...by].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`first: ${miss.slice(0, 6).map(m => `(${m[0].toFixed(2)}, ${m[1].toFixed(2)}) ${m[2]}`).join(' · ')}`)
