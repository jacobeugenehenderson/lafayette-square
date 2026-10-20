// crease-site.mjs — at one centreline site, the road triangles under ±δ: group, vertices (xz, aRaw), and the deformer's D
// at the two points with WHY (groundDeformer.why-road.mjs). Read-only. node crease-site.mjs --slab=… --dump=… --why=… --at=x,z
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const [qx, qz] = arg('at').split(',').map(Number), town = gj.look, T = loadSceneTerrain(town), raw = T.getElevationRaw, design = readBakeDesign(town, town, 'crease-site')
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null), sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const LH = lineHeights({ streets: JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, raw, sigma }), dump = JSON.parse(readFileSync(arg('dump'), 'utf8'))
const { buildDeformer } = await import(resolve(arg('why')))
const D = buildDeformer({ town, tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: LH.heightAt }, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
for (const g of gj.groups) { if (!/^(asphalt|highway|stripe)$/.test(g.id)) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]], cx = v.reduce((s, w) => s + P[w * 3], 0) / 3, cz = v.reduce((s, w) => s + P[w * 3 + 2], 0) / 3
    if (Math.hypot(cx - qx, cz - qz) > 1.5) continue
    const L = Math.max(...[[0, 1], [1, 2], [2, 0]].map(([a, b]) => Math.hypot(P[v[a] * 3] - P[v[b] * 3], P[v[a] * 3 + 2] - P[v[b] * 3 + 2])))
    console.log(`${g.id} tri ${k / 3} (longest edge ${L.toFixed(2)} m): ${v.map(w => `(${P[w * 3].toFixed(2)}, ${P[w * 3 + 2].toFixed(2)}) raw ${R[w].toFixed(3)} D ${D.heightAt(P[w * 3], P[w * 3 + 2])?.toFixed(3)}`).join(' · ')}`) } }
for (const [x, z] of [[qx, qz]]) { const w = D._why(x, z); console.log(`at (${x}, ${z}): D ${w.v?.toFixed(3)} · owner ${w.owner} · ${JSON.stringify(w.why)?.slice(0, 300)} · terrain ${raw(x, z).toFixed(3)}`) }
