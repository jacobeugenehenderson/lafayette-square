// redeform.mjs — a slab's mesh re-heighted by a given groundDeformer.mjs, offline: each vertex's aRaw becomes that
// deformer's D (the terrain where D is null, as bake-ground's terrainPartAt), aGrad recomputed as bake-ground terrainPart
// does. The mesh itself is NOT re-refined (the bake refines against D), so this previews a deformer change on a fixed mesh;
// it is not a bake. Writes ground.json/.bin + shape.json into --out (scratch only).
//   node --max-old-space-size=12000 scratch/ground-budget/deform-fix/redeform.mjs --slab=<dir> --bands=<DEFORM_DUMP json> --deformer=<groundDeformer.mjs> --out=<dir>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('deformer')))
const dir = arg('slab'), out = arg('out'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
const buf = Buffer.from(readFileSync(join(dir, gj.bin))), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, tiles = JSON.parse(readFileSync(join(dir, 'shape.json'), 'utf8')).tiles, inp = JSON.parse(readFileSync(arg('bands'), 'utf8'))
const design = readBakeDesign(town, town, 'redeform'), T = loadSceneTerrain(town), walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = Number.isFinite(design.groundBlendM) && design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const sigma = Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
// --annotate: stamp each line-less run's `noLine` as bake-ground now does (a shape.json older than the field carries none)
if (process.argv.includes('--annotate')) { const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8'))
  const bridgeIds = new Set((rib.streets || []).filter(st => st?.gradeSeparated).map(st => st.skelId ?? st.name))
  for (const t of tiles) for (const run of t?.runs || []) if (!Array.isArray(run.h)) run.noLine = run.skelId === '__highway__' ? 'highway' : run.skelId === '__boundary__' ? 'rim' : bridgeIds.has(run.skelId) ? 'bridge' : 'unknown' }
const t0 = Date.now()
const D = buildDeformer({ town, tiles, bands: inp.bands, stencil: inp.stencil, raw: T.getElevationRaw, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
let n = 0, nul = 0, moved = 0, maxMove = 0
for (const g of gj.groups) { if (g.rawByteOffset == null) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const R = new Float32Array(AB, g.rawByteOffset, g.vertexCount), G = new Float32Array(AB, g.gradByteOffset, g.vertexCount * 4)
  for (let v = 0; v < g.vertexCount; v++) { let d = D.heightAt(P[v * 3], P[v * 3 + 2]); if (d == null) { d = T.getElevationRaw(P[v * 3], P[v * 3 + 2]); nul++ }
    const m = Math.abs(d - R[v]); if (m > 1e-3) moved++; if (m > maxMove) maxMove = m; R[v] = d; n++ }
  G.fill(0); const W = new Float64Array(g.vertexCount)
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]
    const e1x = P[b * 3] - P[a * 3], e1z = P[b * 3 + 2] - P[a * 3 + 2], e2x = P[c * 3] - P[a * 3], e2z = P[c * 3 + 2] - P[a * 3 + 2]
    const det = e1x * e2z - e2x * e1z, area = Math.abs(det) / 2; if (!(area > 0)) continue
    const gr = (h0, h1, h2) => { const d1 = h1 - h0, d2 = h2 - h0; return [(d1 * e2z - d2 * e1z) / det, (e1x * d2 - e2x * d1) / det] }
    const gd = gr(R[a], R[b], R[c]), gy = gr(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1])
    for (const v of [a, b, c]) { G[v * 4] += gd[0] * area; G[v * 4 + 1] += gd[1] * area; G[v * 4 + 2] += gy[0] * area; G[v * 4 + 3] += gy[1] * area; W[v] += area } }
  for (let v = 0; v < g.vertexCount; v++) if (W[v] > 0) for (let k = 0; k < 4; k++) G[v * 4 + k] /= W[v] }
mkdirSync(out, { recursive: true })
writeFileSync(join(out, gj.bin), Buffer.from(AB))
writeFileSync(join(out, 'ground.json'), JSON.stringify({ ...gj, redeformed: { from: dir, deformer: arg('deformer'), bands: arg('bands'), note: 'mesh not re-refined — a preview, not a bake' } }))
copyFileSync(join(dir, 'shape.json'), join(out, 'shape.json'))
console.log(`redeform ${arg('deformer')}: ${n} vertices · D null (terrain) ${nul} · moved > 1 mm ${moved} · max move ${maxMove.toFixed(2)} m · stats ${JSON.stringify({ arcBlended: D.stats.arcBlended, hFilled: D.stats.hFilled, noH: D.stats.noH, onTerrain: D.stats.onTerrain, previewUnstamped: D.stats.previewUnstamped })} · ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`)
