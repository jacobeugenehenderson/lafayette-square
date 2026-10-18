// tri-at.mjs — read-only: the road-group wall triangles whose centroid is within 0.3 m of (x, z): each vertex's stored raw, terrain, and the deformer's branch there
//   node tri-at.mjs <slab dir> <dump.json> <groundDeformer.mjs> x z
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveLawnNorm, resolveWalkNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
const [dir, dumpF, defF, X, Z] = process.argv.slice(2), x0 = +X, z0 = +Z, gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag, lawn = resolveLawnNorm(town, null).slopeMax, design = readBakeDesign(town, town, 'ta')
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const LH = lineHeights({ streets: JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, raw, sigma })
const dump = JSON.parse(readFileSync(dumpF, 'utf8')), { buildDeformer } = await import(resolve(defF))
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: (id, p) => LH.heightAt(id, p) }, limits: { walkMax: resolveWalkNorm(town, null).crossSlopeMax ?? 0, lawnMax: lawn, exag: E, blend, sigma } })
let shown = 0
for (const g of gj.groups) { if (g.rawByteOffset == null || !/^(asphalt|highway|stripe)$/.test(g.id)) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), Rw = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  for (let k = 0; k < I.length && shown < 3; k += 3) { const v = [I[k], I[k + 1], I[k + 2]], cx = v.reduce((a, w) => a + P[w * 3], 0) / 3, cz = v.reduce((a, w) => a + P[w * 3 + 2], 0) / 3
    if (Math.hypot(cx - x0, cz - z0) > 0.3) continue
    const h = v.map(w => Rw[w]), tr = v.map(w => raw(P[w * 3], P[w * 3 + 2])), ex = (Math.max(...h) - Math.min(...h)) * E - (Math.max(...tr) - Math.min(...tr)) * E
    const span = Math.max(...[0, 1, 2].map(i => Math.hypot(P[v[i] * 3] - P[v[(i + 1) % 3] * 3], P[v[i] * 3 + 2] - P[v[(i + 1) % 3] * 3 + 2])))
    if (!(ex > lawn * span)) continue; shown++
    console.log(`${g.id} triangle at (${cx.toFixed(2)}, ${cz.toFixed(2)}): excess ${ex.toFixed(3)} m over span ${span.toFixed(3)} m`)
    for (const w of v) { const x = P[w * 3], z = P[w * 3 + 2], s0 = { ...D.stats }, d = D.heightAt(x, z), br = Object.keys(D.stats).filter(k => D.stats[k] !== s0[k] && k !== 'rays').join('+') || 'memo', e = D.explain(x, z)
      console.log(`   (${x.toFixed(3)}, ${z.toFixed(3)}) stored ${Rw[w].toFixed(3)} · D ${d?.toFixed(3)} · terrain ${raw(x, z).toFixed(3)} · ${br}${e.inBlock === false ? ' road side' : e.inBlock ? ' in block' : ''} · d② ${e.d?.toFixed(3)} · owner ${D.ownerAt(x, z)}`) } } }
