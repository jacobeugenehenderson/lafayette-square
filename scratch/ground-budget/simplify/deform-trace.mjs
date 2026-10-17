// deform-trace.mjs — at a wall site, what the deformer (groundDeformer.mjs buildDeformer, called as bake-ground does)
// returns, and which input carries it: the line's h (the run's `h[]`, lineHeight.mjs), the band's choice, or the terrain.
// Outside any bake, read-only. Tiles from the slab's shape.json; bands from a DEFORM_DUMP (bake-ground's painted bands as
// passed to buildDeformer) — ⚠️ the dump may be from another rev than the slab: say so when you quote it.
//   node --max-old-space-size=8192 scratch/ground-budget/simplify/deform-trace.mjs --slab=<dir> --bands=<inputs.json> --at='x,z;x,z' [--r=3] [--deformer=<groundDeformer.mjs>]
// Per site, the slab's lowest and highest vertex within r: stored aRaw, the deformer's D there, the terrain, the class
// (road side / ped band owner / lot ease / outside), the ② station, its H, the run (skelId·side·segOrd) and the run's h
// at the station, and the terrain at the station.
import { readFileSync } from 'fs'
import { join } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
const arg0 = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
// --deformer=<path>: another groundDeformer.mjs (a worktree's), to trace a change against the same inputs
const { buildDeformer } = await import(resolve(arg0('deformer') || new URL('../../../cartograph/groundDeformer.mjs', import.meta.url).pathname))
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), RAD = +(arg('r') || 3), AT = arg('at').split(';').map(p => p.split(',').map(Number))
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, tiles = JSON.parse(readFileSync(join(dir, 'shape.json'), 'utf8')).tiles, inp = JSON.parse(readFileSync(arg('bands'), 'utf8'))
const design = readBakeDesign(town, town, 'deform-trace')   // as bake-ground reads it
const T = loadSceneTerrain(town), walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = Number.isFinite(design.groundBlendM) && design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const sigma = Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const D = buildDeformer({ tiles, bands: inp.bands, stencil: inp.stencil, raw: T.getElevationRaw,
  limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
const f2 = (v) => v == null ? '—' : (+v).toFixed(2)
// the run that owns the ② vertex nearest the station, and its h projected there (groundDeformer's hOfRun)
const runAt = (ti, sx, sz) => { const t = tiles[ti]; let best = Infinity, out = null
  t.iaFull.forEach((ring, ri) => ring.forEach((p, i) => { const d = Math.hypot(p[0] - sx, p[1] - sz); if (d < best) { best = d; out = { ri, i, arc: t.iaArc?.[ri]?.[i], stamp: t.iaStamp?.[ri]?.[i] } } }))
  if (!out || out.stamp == null) return { ...out, run: null }
  const run = t.runs[out.stamp]; let bd = Infinity, h = null, hp = null
  for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((sx - a[0]) * dx + (sz - a[1]) * dz) / L2)) : 0
    const d = Math.hypot(sx - a[0] - u * dx, sz - a[1] - u * dz); if (d < bd && run.h?.[i] != null && run.h?.[i + 1] != null) { bd = d; h = run.h[i] + u * (run.h[i + 1] - run.h[i]); hp = [a[0] + u * dx, a[1] + u * dz] } }
  const hs = (run.h || []).filter(v => v != null)
  return { ...out, run, h, hp, hMin: Math.min(...hs), hMax: Math.max(...hs), nPoly: run.poly.length } }
for (const [qx, qz] of AT) {
  let lo = null, hi = null
  for (const g of gj.groups) { if (g.rawByteOffset == null) continue
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2]; if (Math.hypot(x - qx, z - qz) > RAD) continue
      const e = { g: g.id, x, z, y: P[v * 3 + 1], raw: R[v], dev: R[v] - T.getElevationRaw(x, z) }
      if (!lo || e.dev < lo.dev) lo = e; if (!hi || e.dev > hi.dev) hi = e } }
  console.log(`\n== site (${qx}, ${qz}) ≤ ${RAD} m`)
  for (const [n, e] of [['lowest', lo], ['highest', hi]]) { if (!e) { console.log(`  ${n}: no vertex`); continue }
    const d = D.heightAt(e.x, e.z), ex = D.explain(e.x, e.z), tr = T.getElevationRaw(e.x, e.z)
    const ped = D._inClass('walk', e.x, e.z) ? 'walk' : D._inClass('lawn', e.x, e.z) ? 'lawn' : D._inClass('curb', e.x, e.z) ? 'curb' : null
    const cls = ex.outside ? 'outside every tile' : ex.deep ? 'beyond reach' : !ex.inBlock || ex.d < 1e-9 ? 'ROAD SIDE (D = the station\'s H)' : ped ? `ped band (${ped})` : 'lot (ease)'
    console.log(`  ${n} vertex ${e.g} (${e.x.toFixed(2)}, ${e.z.toFixed(2)}): stored aRaw ${f2(e.raw)} · y ${e.y.toFixed(3)} · terrain ${f2(tr)} · deformer D ${f2(d)} → ${cls}`)
    if (ex.station) {   // the tile: the one whose ② carries the station
      let tIdx = null, best = Infinity; tiles.forEach((t, i) => (t.iaFull || []).forEach(r => r.forEach(p => { const dd = Math.hypot(p[0] - ex.station[0], p[1] - ex.station[1]); if (dd < best) { best = dd; tIdx = i } })))
      const ra = runAt(tIdx, ex.station[0], ex.station[1])
      console.log(`    ② station (${ex.station[0].toFixed(2)}, ${ex.station[1].toFixed(2)}) d ${ex.d.toFixed(2)} m · H ${f2(ex.H)} · terrain at station ${f2(T.getElevationRaw(ex.station[0], ex.station[1]))} · tile ${tIdx} ring ${ra.ri} v${ra.i}${ra.arc != null ? ` (corner arc ${ra.arc})` : ''}`)
      if (ra.run) console.log(`    run ${ra.stamp}: ${ra.run.skelId} · ${ra.run.side} · segOrd ${ra.run.segOrd} · ${ra.nPoly} pts · its h at the station ${f2(ra.h)} (terrain there ${ra.hp ? f2(T.getElevationRaw(ra.hp[0], ra.hp[1])) : '—'}) · h along the run ${f2(ra.hMin)}..${f2(ra.hMax)}`)
      else console.log(`    the nearest ② vertex has no stamp (H filled from neighbours, or no run)`) } }
}
