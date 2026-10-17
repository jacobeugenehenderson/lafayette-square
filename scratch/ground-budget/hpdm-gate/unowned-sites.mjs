// unowned-sites.mjs — the ped vertices a slab drew AT THE TERRAIN inside a tile: the gate-only bake's unowned (D null → the
// terrain) — read off the slab alone, so a slab with no band dump can be compared. A ped vertex (curb · curbCut · sidewalk ·
// treelawn group) whose stored aRaw is the terrain's float32 exactly, and which lies inside a tile's ① ring (shape.json):
// outside every tile is the reach edge, not unowned. Keyed as bake-ground keys unowned (x,z toFixed(2)), so the count is
// comparable to the manifest's deform.unowned. --why=<groundDeformer.why.mjs> --dump=<json>: also asks the deformer, to
// validate the read. Writes the sites as JSON.
//   node unowned-sites.mjs --slab=<dir> --out=<json> [--why=… --dump=…]
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const tiles = JSON.parse(readFileSync(join(dir, 'shape.json'), 'utf8')).tiles, T = loadSceneTerrain(gj.look)
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const bb = tiles.map(t => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of t.ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a, b, c, d] })
const tileOf = (x, z) => tiles.findIndex((t, i) => x >= bb[i][0] && x <= bb[i][2] && z >= bb[i][1] && z <= bb[i][3] && pip(x, z, t.ring))
const PED = /^mat:(curb|curbCut|sidewalk|treelawn)/, f32 = new Float32Array(1)
const sites = new Map()
for (const g of gj.groups) { const gid = `${g.kind}:${g.id}`; if (g.rawByteOffset == null || !PED.test(gid)) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), Rw = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2]; f32[0] = T.getElevationRaw(x, z); if (Rw[v] !== f32[0]) continue
    const k = `${x.toFixed(2)},${z.toFixed(2)}`; if (sites.has(k)) continue; const ti = tileOf(x, z); if (ti < 0) continue
    sites.set(k, { p: [x, z], g: gid, ti }) } }
console.log(`${dir}: ${sites.size} ped vertex(es) drawn at the terrain inside a tile · the manifest says ${gj.deform?.unowned}`)
if (arg('why')) { const { buildDeformer } = await import(resolve(arg('why'))), dump = JSON.parse(readFileSync(arg('dump'), 'utf8'))
  const { readBakeDesign } = await import('../../../cartograph/lookDesign.mjs'), { resolveWalkNorm, resolveLawnNorm } = await import('../../../cartograph/curb-cut-norm.mjs')
  const town = gj.look, design = readBakeDesign(town, town, 'unowned-sites'), walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
  const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
  const D = buildDeformer({ town, tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
  let un = 0, other = new Map(); for (const s of sites.values()) { const r = D._why(s.p[0], s.p[1]); if (r.unowned != null) un++; else { const b = r.why?.branch || 'none'; other.set(b, (other.get(b) || 0) + 1) } }
  console.log(`  the deformer: ${un} unowned · the rest ${[...other].map(([b, n]) => `${b} ${n}`).join(' · ') || '0'}`) }
writeFileSync(arg('out'), JSON.stringify([...sites.values()]))
