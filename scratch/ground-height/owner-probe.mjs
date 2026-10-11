// owner-probe.mjs — the band decides (Jacob 2026-10-11): rebuild the deformer from the bake's own dumped inputs and read
// the walk cross-section (front · middle · back) at each station the gate found over, under the deformer as it now is.
// READ-ONLY.  node scratch/ground-height/owner-probe.mjs <scene> <dump inputs.json> <over.json from the check's --json>
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(process.env.HEAD ? R + 'scratch/ground-height/groundDeformer.head.mjs' : process.env.NEARER ? R + 'scratch/ground-height/groundDeformer.nearer.mjs' : R + 'cartograph/groundDeformer.mjs')
const { resolveWalkNorm, resolveLawnNorm } = await import(R + 'cartograph/curb-cut-norm.mjs')
const [scene, dumpP, overP] = process.argv.slice(2)
const dump = JSON.parse(readFileSync(dumpP)), over = JSON.parse(readFileSync(overP)), T = loadSceneTerrain(scene), E = T.exag
const lim = resolveWalkNorm(scene).crossSlopeMax
const t0 = Date.now()
const D = buildDeformer({ tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw,
  limits: { walkMax: lim, lawnMax: resolveLawnNorm(scene).slopeMax ?? null, exag: E, blend: dump.limits?.blend ?? T.stepM, sigma: dump.limits?.sigma ?? T.stepM } })
console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const rows = []
for (const o of over) {
  const [f, b] = o.walk, ds = [f + 0.01, (f + b) / 2, b - 0.01]
  const h = ds.map(d => D.heightAt(o.at[0] + o.n[0] * d, o.at[1] + o.n[1] * d))
  if (h.some(v => v == null)) { rows.push({ ...o, now: null }); continue }
  let fall = 0; for (const [p0, p1] of [[0, 1], [1, 2]]) fall = Math.max(fall, E * Math.abs(h[p1] - h[p0]) / (ds[p1] - ds[p0]))
  rows.push({ ...o, now: fall })
}
const still = rows.filter(r => r.now != null && r.now > lim), none = rows.filter(r => r.now == null)
console.log(`${over.length} over stations → now over ${still.length} · no owner ${none.length} · fixed ${over.length - still.length - none.length}`)
console.log('stats', JSON.stringify(D.stats), 'unownedAt', JSON.stringify(D.unownedAt?.slice(0, 5)))
const by = (a) => { const m = new Map(); for (const r of a) m.set(r.key, (m.get(r.key) || 0) + 1); return [...m].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, n]) => `${k} ${n}`).join(' · ') }
console.log('still over by stretch:', by(still))
const ca = rows.filter(r => r.key.startsWith('central-avenue-0')); console.log('central-avenue-0:', ca.length, 'over before → now', ca.filter(r => r.now != null && r.now > lim).length, 'unowned', ca.filter(r => r.now == null).length, 'worst now', Math.max(...ca.map(r => r.now ?? 0)).toFixed(4))
if (process.env.SHOW) for (const r of rows.filter(r => r.key.startsWith(process.env.SHOW) && r.now > lim).slice(0, +process.env.N || 2)) {
  const [f, b] = r.walk; console.log(`${r.key} at (${r.at.map(v => v.toFixed(2))}) now ${(r.now * 100).toFixed(2)}%`)
  for (const d of [f + 0.01, (f + b) / 2, b - 0.01]) { const x = r.at[0] + r.n[0] * d, z = r.at[1] + r.n[1] * d
    console.log(`   d ${d.toFixed(2)} (${x.toFixed(2)}, ${z.toFixed(2)}) D ${D.heightAt(x, z).toFixed(3)} T ${T.getElevationRaw(x, z).toFixed(3)}`)
    for (const c of D._owners(x, z).slice(0, 3)) console.log(`      ${c.key} d ${c.d.toFixed(2)} H ${c.H.toFixed(2)} → ${c.bands.slice(0, 5).map(b => `${b.cls} ${b.from.toFixed(2)}-${b.to.toFixed(2)}`).join(' ')}`) } }
