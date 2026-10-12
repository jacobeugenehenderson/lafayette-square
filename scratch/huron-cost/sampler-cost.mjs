// What one adaptive-refinement sampler call costs: the deformer's heightAt (today's sampler for every draped group,
// `terrainPartAt`) against the raw terrain lookup (10-11's sampler). The deformer is rebuilt offline from a slab's own
// bands, as `scratch/ground-height/deform-diag.mjs` does; points are the slab's sidewalk and lot vertices. Read-only.
//   node scratch/huron-cost/sampler-cost.mjs <scene> <slab dir>
import { readFileSync } from 'fs'
import { join } from 'path'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { lineHeights } = await import(R + 'cartograph/lineHeight.mjs')
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs')
const { resolveWalkNorm, resolveLawnNorm } = await import(R + 'cartograph/curb-cut-norm.mjs')
const [scene, dir] = process.argv.slice(2)
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const shape = JSON.parse(readFileSync(join(dir, 'shape.json')))
const T = loadSceneTerrain(scene)
const grp = (id) => gj.groups.find(g => g.id === id)
const tris = (id) => { const g = grp(id); if (!g) return []; const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const out = []; for (let i = 0; i < I.length; i += 3) out.push([I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])); return out }
const ribbons = JSON.parse(readFileSync(join(R, 'cartograph/data', scene, 'clean/ribbons.json')))
let t = Date.now()
const LH = lineHeights({ streets: ribbons.streets, raw: T.getElevationRaw, sigma: T.stepM })
for (const tl of shape.tiles) for (const run of tl.runs || []) { const h = run.poly.map(p => LH.heightAt(run.skelId, p)); run.h = h.every(v => v != null) ? h : null }
const lawn = gj.groups.filter(g => g.id.startsWith('treelawn')).flatMap(g => tris(g.id))
const D = buildDeformer({ tiles: shape.tiles, bands: { curb: [...tris('curb'), ...tris('curbCut')], lawn, walk: tris('sidewalk') }, raw: T.getElevationRaw,
  limits: { walkMax: resolveWalkNorm(scene).crossSlopeMax ?? 0, lawnMax: resolveLawnNorm(scene).slopeMax ?? null, exag: T.exag, blend: T.stepM, sigma: T.stepM } })
console.log(`built in ${((Date.now() - t) / 1000).toFixed(1)} s`)
const pts = (id, n) => { const g = grp(id), P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), out = []
  for (let k = 0; k < n; k++) { const v = Math.floor(Math.random() * g.vertexCount); out.push([P[v * 3] + (Math.random() - 0.5), P[v * 3 + 2] + (Math.random() - 0.5)]) } return out }
for (const id of ['sidewalk', 'residential', 'underived']) {
  const Q = pts(id, 100000)
  for (const [lab, f] of [['heightAt', (x, z) => D.heightAt(x, z) ?? T.getElevationRaw(x, z)], ['raw', T.getElevationRaw]]) {
    let s = 0; const t0 = performance.now(); for (const [x, z] of Q) s += f(x, z) || 0
    console.log(`   ${id.padEnd(12)} ${lab.padEnd(9)} ${((performance.now() - t0) * 1000 / Q.length).toFixed(2)} µs/call`)
  }
}
