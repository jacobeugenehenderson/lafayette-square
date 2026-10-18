// window-dump.mjs — a WINDOW of a dumped conformity input (scratch/huron-cost/bake-ground.dump.js's specs.ndjson + deform.json),
// through each conformity variant (base · a · b), metrics.mjs on each output. Offline: no bake. A polygon inside the window goes
// in whole; one crossing it is clipped by Clipper (integer units at CLIP_SCALE: a lattice ring keeps every vertex exactly).
//   node --max-old-space-size=6000 window-dump.mjs <dump dir> <x,z> <R1,R2…> <groundDeformer for the dump's era>
import { readFileSync } from 'fs'
import clipperLib from 'clipper-lib'
import { metrics } from './metrics.mjs'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/'
const { polyTreeToItems } = await import(ROOT + 'cartograph/kerbLift.mjs')
const { CLIP_SCALE } = await import(ROOT + 'src/lib/lattice.js')
const { loadSceneTerrain } = await import(ROOT + 'cartograph/terrainLoad.js')
const [dir, site, radii, defPath] = process.argv.slice(2)
const [px, pz] = site.split(',').map(Number)
const meta = JSON.parse(readFileSync(dir + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const { buildDeformer } = await import(defPath)
const D = buildDeformer({ ...JSON.parse(readFileSync(dir + '/deform.json', 'utf8')), raw: T.getElevationRaw })
const sampler = (x, z) => (D.heightAt(x, z) ?? T.getElevationRaw(x, z)) * T.exag
const { waterLevels } = await import(ROOT + 'cartograph/waterLevel.mjs')
const L = T.water ? waterLevels(T.water) : null, levels = L ? (x, z) => [L.lowAt(x, z) * T.exag, L.highAt(x, z) * T.exag] : null
const specs = readFileSync(dir + '/specs.ndjson', 'utf8').trim().split('\n').map(l => JSON.parse(l))
const V = Object.fromEntries(await Promise.all(['base', 'a', 'b'].map(async v => [v, await import(`./groundConformity.${v}.js`)])))
const det = { stock: V.base.findTJunctions, exact: V.b.findTJunctions }
const toPath = (r) => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))
const bbox = (r) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a }
console.log(`[dump] ${meta.scene} ${meta.at} · groups ${specs.length} · stripe group: ${specs.some(s => s.key === 'mat:stripe') ? 'yes' : 'none'} · site (${px}, ${pz})`)
for (const R of radii.split(',').map(Number)) {
  const W = [px - R, pz - R, px + R, pz + R], rect = toPath([[W[0], W[1]], [W[2], W[1]], [W[2], W[3]], [W[0], W[3]]])
  const win = specs.map(s => ({ key: s.key, refine: s.refine && typeof s.refine === 'object' ? { ...s.refine, sampler: s.refine.sampler ? sampler : null, band: s.refine.band && levels ? { ...s.refine.band, levels } : null } : s.refine,
    polys: s.polys.flatMap(p => { const b = bbox(p.outer); if (b[2] < W[0] || b[0] > W[2] || b[3] < W[1] || b[1] > W[3]) return []
      if (process.env.WHOLE || b[0] >= W[0] && b[2] <= W[2] && b[1] >= W[1] && b[3] <= W[3]) return [p]
      const c = new clipperLib.Clipper(); c.StrictlySimple = true
      c.AddPaths([p.outer, ...(p.holes || [])].map(toPath), clipperLib.PolyType.ptSubject, true); c.AddPath(rect, clipperLib.PolyType.ptClip, true)
      const t = new clipperLib.PolyTree(); if (!c.Execute(clipperLib.ClipType.ctIntersection, t, clipperLib.PolyFillType.pftEvenOdd, clipperLib.PolyFillType.pftNonZero)) throw new Error('clip refused')
      return polyTreeToItems(t).map(it => ({ ...it, ...(p.side != null ? { side: p.side } : {}) })) }) })).filter(s => s.polys.length)
  for (const v of ['base', 'a', 'b']) { const t0 = Date.now(), st = {}
    const out = V[v].conformAndRefine(win.map(s => ({ polys: s.polys, refine: s.refine })), st)
    console.log(`R ${R} m · ${v.padEnd(4)} · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${JSON.stringify(metrics(out, win.map(s => s.key), det, [px, pz, R - 1]))}`) }
}
