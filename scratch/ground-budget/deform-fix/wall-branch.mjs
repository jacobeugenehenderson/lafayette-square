// wall-branch.mjs — the walls of a redeformed preview (claims-the-ground-meets-its-terrain's rule: a triangle whose terrain part
// rises more than its terrain by over lawn.slopeMax × its span), each classed by the DEFORMER BRANCH that set the height at
// its most-departing vertex: road side (outside iA: D = the nearest ② station's H) · ped band · lot (ease) · outside every
// tile (terrain). Read-only.
//   node --max-old-space-size=12000 scratch/ground-budget/deform-fix/wall-branch.mjs --slab=<preview> --shape=<shape.json> --bands=<dump> --deformer=<mjs>
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('deformer')))
const dir = arg('slab'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, tiles = JSON.parse(readFileSync(arg('shape'), 'utf8')).tiles, inp = JSON.parse(readFileSync(arg('bands'), 'utf8'))
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')), bridgeIds = new Set((rib.streets || []).filter(s => s.gradeSeparated).map(s => s.skelId ?? s.name))
for (const t of tiles) for (const run of t?.runs || []) if (!Array.isArray(run.h)) run.noLine = run.skelId === '__highway__' ? 'highway' : run.skelId === '__boundary__' ? 'rim' : bridgeIds.has(run.skelId) ? 'bridge' : 'unknown'
const design = readBakeDesign(town, town, 'wall-branch'), T = loadSceneTerrain(town), E = T.exag, lawn = resolveLawnNorm(town, null).slopeMax
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const D = buildDeformer({ town, tiles, bands: inp.bands, stencil: inp.stencil, raw: T.getElevationRaw, limits: { walkMax: resolveWalkNorm(town, null).crossSlopeMax, lawnMax: lawn, exag: E, blend, sigma } })
const branch = (x, z) => { const ex = D.explain(x, z); if (ex.outside) return 'outside every tile'; if (ex.deep) return 'beyond reach (terrain)'
  if (!ex.inBlock || ex.d < 1e-9) return 'ROAD SIDE'
  return D._inClass('walk', x, z) || D._inClass('lawn', x, z) || D._inClass('curb', x, z) ? 'ped band' : 'lot (ease)' }
const by = new Map(), byG = new Map()
let walls = 0
for (const g of gj.groups) { if (g.rawByteOffset == null) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  for (let k = 0; k < I.length; k += 3) { const vs = [I[k], I[k + 1], I[k + 2]], d = vs.map(v => R[v] * E), t = vs.map(v => T.getElevationRaw(P[v * 3], P[v * 3 + 2]) * E)
    const ex = (Math.max(...d) - Math.min(...d)) - (Math.max(...t) - Math.min(...t)); if (!(ex > LATTICE_M)) continue
    const span = Math.max(...[[0, 1], [1, 2], [2, 0]].map(([a, b]) => Math.hypot(P[vs[a] * 3] - P[vs[b] * 3], P[vs[a] * 3 + 2] - P[vs[b] * 3 + 2])))
    if (ex <= lawn * span) continue
    walls++
    let w = vs[0], wd = -1; for (let j = 0; j < 3; j++) { const dd = Math.abs(d[j] - t[j]); if (dd > wd) { wd = dd; w = vs[j] } }
    const b = branch(P[w * 3], P[w * 3 + 2]); by.set(b, (by.get(b) || 0) + 1)
    const kk = `${b} · ${g.kind}:${g.id}`; byG.set(kk, (byG.get(kk) || 0) + 1) } }
console.log(`${dir}: ${walls} wall triangles, by the branch at the most-departing vertex:`)
for (const [k, v] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`)
console.log('  top branch · group:'); for (const [k, v] of [...byG].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(v).padStart(6)}  ${k}`)
