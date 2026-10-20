// site-trace.mjs — at each wall site (claims-the-ground-meets-its-terrain), the WORST wall triangle there, vertex by vertex:
// its group, the stored terrain part (aRaw), the terrain, and the deformer's D with WHY (groundDeformer.why.mjs, make-why.mjs):
// the branch, the owning ② span (tile · ring · vertex · its run skelId·side·segOrd, or its corner arc), the station's H and
// the run's own h there, and the profile's inputs. Built as bake-ground calls buildDeformer, from a DEFORM dump of the same
// rev's painted bands + tiles (make-producer.mjs's dump). Read-only.
//   node --max-old-space-size=8000 site-trace.mjs --slab=<dir> --dump=<bands.json> --why=<groundDeformer.why.mjs> --at='x,z;x,z' [--r=0.2]
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { buildDeformer } = await import(resolve(arg('why')))
const dir = arg('slab'), RAD = +(arg('r') || 0.2), AT = arg('at').split(';').map(p => p.split(',').map(Number))
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), tiles = dump.tiles
const design = readBakeDesign(town, town, 'site-trace'), T = loadSceneTerrain(town), E = T.exag
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = Number.isFinite(design.groundBlendM) && design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const sigma = Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const lawn = lawnN.slopeMax
const D = buildDeformer({ town, tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw,
  limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: E, blend, sigma } })
console.log(`${town} · exag ${E} · B ${blend} m · σ ${sigma} m · walk ≤ ${walkN.crossSlopeMax} · lawn ≤ ${lawn}`)
const f2 = (v) => v == null ? '—' : (+v).toFixed(2)
const hOfRun = (run, p) => { if (!run || !Array.isArray(run.h)) return null; let bd = Infinity, out = null
  for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1]; if (run.h[i] == null || run.h[i + 1] == null) continue
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    const d = Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz); if (d < bd) { bd = d; out = run.h[i] + u * (run.h[i + 1] - run.h[i]) } }
  return out }
const who = (w) => { if (w.t == null) return ''; const t = tiles[w.t]
  if (w.arc != null) return `tile ${w.t} ring ${w.k} v${w.i} · corner arc ${w.arc}`
  const run = w.stamp != null ? t.runs[w.stamp] : null, cap = t.iaCap?.[w.k]?.[w.i]
  return `tile ${w.t} ring ${w.k} v${w.i} · ${run ? `run ${w.stamp} ${run.skelId}·${run.side}·${run.segOrd} (h there ${f2(hOfRun(run, w.st))}${run.noLine ? `, no line: ${run.noLine}` : ''})` : cap != null ? `cap ${t.caps[cap].skelId}` : 'no run'}` }
for (const [qx, qz] of AT) {
  let worst = null
  for (const g of gj.groups) { if (g.rawByteOffset == null) continue
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), Rw = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]], cx = (P[v[0] * 3] + P[v[1] * 3] + P[v[2] * 3]) / 3, cz = (P[v[0] * 3 + 2] + P[v[1] * 3 + 2] + P[v[2] * 3 + 2]) / 3
      if (Math.hypot(cx - qx, cz - qz) > RAD) continue
      const d = v.map(w => Rw[w] * E), tr = v.map(w => T.getElevationRaw(P[w * 3], P[w * 3 + 2]) * E)
      const ex = Math.max(...d) - Math.min(...d) - (Math.max(...tr) - Math.min(...tr))
      const span = Math.max(...[[0, 1], [1, 2], [2, 0]].map(([a, b]) => Math.hypot(P[v[a] * 3] - P[v[b] * 3], P[v[a] * 3 + 2] - P[v[b] * 3 + 2])))
      if (!worst || ex > worst.ex) worst = { g: `${g.kind}:${g.id}`, ex, span, vs: v.map(w => ({ x: P[w * 3], z: P[w * 3 + 2], raw: Rw[w] })) } } }
  console.log(`\n== site (${qx}, ${qz}): ${worst ? `${worst.g} · excess ${worst.ex.toFixed(2)} m across ${worst.span.toFixed(2)} m (bound ${(lawn * worst.span).toFixed(2)}${worst.ex > LATTICE_M && worst.ex > lawn * worst.span ? ', a WALL' : ''})` : 'no triangle'}`)
  if (!worst) continue
  for (const v of worst.vs) { const r = D._why(v.x, v.z), w = r.why || {}
    console.log(`  (${v.x.toFixed(3)}, ${v.z.toFixed(3)}) stored ${f2(v.raw)} · terrain ${f2(T.getElevationRaw(v.x, v.z))} · D ${f2(r.v)} · ${w.branch || '—'}${w.lot ? ' (the lot: nearest span)' : ''}${w.held ? ' (held by its band)' : ''}${w.byBand ? ', NOT the nearest span' : ''}`)
    if (w.t != null) console.log(`      owner ${who(w)} · station ${w.st ? `(${w.st[0].toFixed(2)}, ${w.st[1].toFixed(2)})` : '—'} d ${f2(w.d)} · H ${f2(w.H)} · terrain at station ${w.st ? f2(T.getElevationRaw(w.st[0], w.st[1])) : '—'}`)
    if (w.R != null) console.log(`      profile: R ${f2(w.R)} · bands [${w.ped}] · back ${f2(w.back)} · lawn ${f2(w.lawnW)} m cap ${f2(w.lawnCap)} took ${f2(w.byLawn)} · walk ${f2(w.walkW)} m took ${f2(w.byWalk)} · B ${w.blend}${w.hBack != null ? ` · hBack ${f2(w.hBack)} f ${w.f.toFixed(3)}` : ''}`) }
}
