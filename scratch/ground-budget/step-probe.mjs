// Pin a heightAt step between two points: bisect to 1 mm, then name the owner on each side (Brace, 2026-10-13).
//   node --max-old-space-size=8000 scratch/ground-budget/step-probe.mjs <dump dir> x0 z0 x1 z1
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const [dir, ...n] = process.argv.slice(2), [x0, z0, x1, z1] = n.map(Number)
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs')
const meta = JSON.parse(readFileSync(dir + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const A = JSON.parse(readFileSync(dir + '/deform.json', 'utf8'))
const D = buildDeformer({ ...A, raw: T.getElevationRaw })
const at = (f) => [x0 + f * (x1 - x0), z0 + f * (z1 - z0)]
const h = (f) => D.heightAt(...at(f))
let lo = 0, hi = 1, hl = h(0), hh = h(1)
const len = Math.hypot(x1 - x0, z1 - z0)
while ((hi - lo) * len > 0.001) { const m = (lo + hi) / 2, hm = h(m); if (Math.abs(hm - hl) < Math.abs(hm - hh)) { lo = m; hl = hm } else { hi = m; hh = hm } }
console.log(`step over ${((hi - lo) * len * 1000).toFixed(2)} mm at (${at(lo).map(v => v.toFixed(3))}): heightAt ${hl.toFixed(3)} → ${hh.toFixed(3)} (Δ ${(hh - hl).toFixed(3)} m)`)
for (const [side, f] of [['before', lo], ['after', hi]]) {
  const p = at(f), ex = D.explain(...p), ow = D._owners(...p)
  console.log(`  ${side}: station (${ex.station?.map(v => v.toFixed(2))}) d ${ex.d?.toFixed(3)} H ${ex.H?.toFixed(3)} · raw ${T.getElevationRaw(...p).toFixed(3)} · ownerAt ${JSON.stringify(D.ownerAt?.(...p))?.slice(0, 160)}`)
  for (const o of ow.slice(0, 4)) console.log(`     candidate ${o.key} run ${JSON.stringify(o.run)?.slice(0, 80)} d ${o.d.toFixed(3)} H ${o.H?.toFixed(3)} bands ${o.bands.map(b => b.cls + ' ' + b.from.toFixed(2) + '–' + b.to.toFixed(2)).join(', ')}`)
}
// the tile's runs near each station: skelId, side, h
const tiles = A.tiles, near = (p) => tiles.flatMap((t, ti) => (t.runs || []).map(r => ({ ti, skelId: r.skelId, side: r.side, segOrd: r.segOrd, h: r.h }))).length
console.log(`  (tiles in the deformer's input: ${tiles.length})`)
