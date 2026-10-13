// conformAndRefine ALONE on a dumped input (`bake-ground.dump.js`, CONFORM_DUMP=<dir>): the deformer and the tide band
// rebuilt from the dump exactly as the bake builds them, the sampler wrapped to count and time its calls, and the timed
// scratch copy of groundConformity for per-phase time. RSS and swap at the start and the end; peak RSS from /usr/bin/time -l. Read-only.
//   node --max-old-space-size=14000 scratch/huron-cost/conform-alone.mjs <dump dir> [deform|raw] [conformity module]
//   module defaults to the timed scratch copy (per-phase time); pass a path (e.g. cartograph/groundConformity.js) to run that.
//   PED_FLOOR=<m> sets the ped bands' minEdge (the floor; tol stays the dump's); PED_POLICY=lots gives the ped bands the lots'
//   policy (tol, minEdge from meta.json: the 10-11 policy point). The ped bands are read from bake-ground.js's PED_KEYS.
//   PED_TOL_X=<k> multiplies the ped bands' tol (the dumped 7.8 mm) by k; the tide band's own tol is untouched.
//   INPUT_ONLY=1 turns every group's refinement off: the input side only (polygons, input T-junctions), in seconds.
//   Prints the detector's count on the output (as the bake runs it) and a sha256 over every group's positions, indices, side.
//   DEFORMER=<path>: import that groundDeformer instead of the repo's (sha logged).
//   ACCURACY=1 (Brace, 2026-10-13): after conformity, the ped bands' vertical error of the DRAWN ground against the deformer's
//   own heightAt (null → the raw terrain, as bake-ground's terrainPartAt), whatever sampler refined the mesh. The drawn ground
//   is what the runtime interpolates: heightAt at each vertex, linear across the triangle. Each triangle is read at its 7
//   non-vertex points of a third-grid (edge thirds + centroid), each weighted by area/7; p50/p99/max in metres, unexaggerated.
//   deform = the bake's sampler (`terrainPartAt` × exag) · raw = the terrain's own (`getElevation`, 10-11's sampler)
import { readFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { resolve } from 'path'
const R = new URL('../../', import.meta.url).pathname
const [dir, which = 'deform', modPath] = process.argv.slice(2)
const CONF = modPath ? resolve(modPath) : new URL('./groundConformity.timed.js', import.meta.url).pathname
// the code under every number, recorded rather than inferred: each file hashed before and after its import, and a run
// whose file changed while it was being imported refuses (Boz, 2026-10-13, after a deformer edit sat in the tree mid-sweep)
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
// DEFORMER=<path> runs another deformer (e.g. a worktree's, read-only) against the same dump; its sha is logged with the rest
const DEF = process.env.DEFORMER ? resolve(process.env.DEFORMER) : R + 'cartograph/groundDeformer.mjs'
const CODE = [DEF, CONF, R + 'cartograph/terrainLoad.js', R + 'cartograph/waterLevel.mjs']
const before = CODE.map(sha)
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(DEF)
const { waterLevels } = await import(R + 'cartograph/waterLevel.mjs')
const { conformAndRefine, findTJunctions } = await import(CONF)
const after = CODE.map(sha)
CODE.forEach((f, i) => console.log(`[code] ${f.replace(R, '')} sha256 ${after[i]}${before[i] === after[i] ? '' : ` ⛔ CHANGED DURING IMPORT (was ${before[i]})`}`))
if (before.some((h, i) => h !== after[i])) { console.log('[code] ⛔ a file changed while it was imported — this run measures unknown code; refusing'); process.exit(2) }
const swap = () => execSync('sysctl -n vm.swapusage').toString().trim()
const mem = () => `rss ${Math.round(process.memoryUsage().rss / 1e6)} MB · heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB · swap ${swap()} · load ${execSync('sysctl -n vm.loadavg').toString().trim()}`
console.log(`[start] ${which} · ${mem()}`)
const meta = JSON.parse(readFileSync(dir + '/meta.json', 'utf8'))
const T = loadSceneTerrain(meta.scene)
let t = Date.now()
let base
if (which === 'deform') {
  const A = JSON.parse(readFileSync(dir + '/deform.json', 'utf8'))
  const D = buildDeformer({ ...A, raw: T.getElevationRaw })
  base = (x, z) => (D.heightAt(x, z) ?? T.getElevationRaw(x, z)) * T.exag
} else base = T.getElevation
console.log(`[sampler] ${which} built in ${((Date.now() - t) / 1000).toFixed(1)} s`)
let calls = 0, ns = 0n
const sampler = (x, z) => { calls++; const a = process.hrtime.bigint(); const y = base(x, z); ns += process.hrtime.bigint() - a; return y }
const L = T.water ? waterLevels(T.water) : null
const levels = L ? (x, z) => [L.lowAt(x, z) * T.exag, L.highAt(x, z) * T.exag] : null
// the ped bands: PED_KEYS read from the bake's source, never restated
const pedSrc = readFileSync(R + 'cartograph/bake-ground.js', 'utf8').match(/const PED_KEYS = \(key\) => (.*)/)?.[1]
if (!pedSrc) throw new Error('PED_KEYS not found in cartograph/bake-ground.js')
const pedEq = [...pedSrc.matchAll(/key === '([^']+)'/g)].map(m => m[1]), pedPre = [...pedSrc.matchAll(/key\.startsWith\('([^']+)'\)/g)].map(m => m[1])
const isPed = (k) => { const key = k.slice(k.indexOf(':') + 1); return pedEq.includes(key) || pedPre.some(p => key.startsWith(p)) }
const FLOOR = process.env.PED_FLOOR ? Number(process.env.PED_FLOOR) : null, LOTS = process.env.PED_POLICY === 'lots'
const TOLX = process.env.PED_TOL_X ? Number(process.env.PED_TOL_X) : null
console.log(`[policy] ped = ${pedEq.join(', ')}, ${pedPre.map(p => p + '*').join(', ')} · ${LOTS ? `lots' policy (tol ${meta.refineTol}, minEdge ${meta.refineMinEdge})` : [FLOOR != null && `floor ${FLOOR} m`, TOLX != null && `tol ×${TOLX}`].filter(Boolean).join(' · ') || 'as dumped'}`)
const specs = []
for await (const line of createInterface({ input: createReadStream(dir + '/specs.ndjson'), crlfDelay: Infinity })) {
  if (!line) continue
  const s = JSON.parse(line), r = s.refine
  const refine = r && typeof r === 'object'
    ? { ...r, sampler: r.sampler ? sampler : null, band: r.band && levels ? { ...r.band, levels } : null }
    : r
  if (isPed(s.key) && refine?.mode === 'adaptive') {
    if (LOTS) { refine.tol = meta.refineTol; refine.minEdge = meta.refineMinEdge }
    else {
      if (FLOOR != null) refine.minEdge = FLOOR
      if (TOLX != null) refine.tol *= TOLX
    }
  }
  if (isPed(s.key) && refine?.mode === 'adaptive' && specs.filter(x => isPed(x.key)).length === 0) console.log(`[policy] first ped group ${s.key}: tol ${refine.tol} · minEdge ${refine.minEdge}`)
  specs.push({ key: s.key, polys: s.polys, refine: process.env.INPUT_ONLY ? null : refine, yLift: s.yLift })
}
console.log(`[input] ${specs.length} groups · ${specs.reduce((n, s) => n + s.polys.length, 0)} polygons · ${mem()}`)
const st = {}
t = Date.now()
const out = conformAndRefine(specs, st)
const sec = (Date.now() - t) / 1000, tris = out.reduce((n, b) => n + b.indices.length / 3, 0)
console.log(`[conform] ${which}: ${sec.toFixed(1)} s · ${tris} tris · inTJ ${st.inputTJunctions} · closures ${st.closures} · refTJ ${st.refineTJunctions} · passes ${st.passes}`)
const pedTris = out.reduce((n, b, i) => n + (isPed(specs[i].key) ? b.indices.length / 3 : 0), 0)
console.log(`[split] ped ${pedTris} tris (${specs.filter(s => isPed(s.key)).length} groups) · the rest ${tris - pedTris}`)
const h = createHash('sha256')
for (const b of out) for (const a of [b.positions, b.indices, b.side]) { h.update(String(a?.length ?? -1)); if (a) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)) }
console.log(`[hash] ${h.digest('hex')}`)
if (st.phaseMs) console.log(`[phases] ${Object.entries(st.phaseMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`).join(' · ')}`)
console.log(`[sampler] ${calls} calls · ${(Number(ns) / 1e9).toFixed(1)} s inside the sampler · ${(Number(ns) / 1e3 / Math.max(1, calls)).toFixed(2)} µs/call`)
t = Date.now()
const tj = findTJunctions(out.map((b, i) => ({ id: specs[i].key, ...b })))
const w = tj.found?.[0]
console.log(`[detector] ${tj.total} T-junction(s) · ${tj.within} within a group · ${tj.cross} across${w ? ` · first at (${w.x.toFixed(2)}, ${w.z.toFixed(2)}), a ${w.vertexGroup} vertex on a ${w.edgeGroup} edge` : ''} · ${((Date.now() - t) / 1000).toFixed(1)} s`)
if (process.env.ACCURACY) {
  t = Date.now()
  const A = JSON.parse(readFileSync(dir + '/deform.json', 'utf8'))
  const Dref = buildDeformer({ ...A, raw: T.getElevationRaw })
  const H = (x, z) => Dref.heightAt(x, z) ?? T.getElevationRaw(x, z)
  const W = (u, v) => [u / 3, v / 3]   // barycentric (b, c) of the third-grid's non-vertex points
  const PTS = [[1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [2, 1], [1, 1]].map(([u, v]) => W(u, v))
  const errs = [], wts = [], where = []
  let area = 0, n = 0
  out.forEach((b, gi) => {
    if (!isPed(specs[gi].key)) return
    const P = b.positions, I = b.indices, nv = P.length / 3, Hv = new Float64Array(nv)
    for (let v = 0; v < nv; v++) Hv[v] = H(P[v * 3], P[v * 3 + 2])
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], c1 = I[k + 1], c2 = I[k + 2]
      const ax = P[a * 3], az = P[a * 3 + 2], e1x = P[c1 * 3] - ax, e1z = P[c1 * 3 + 2] - az, e2x = P[c2 * 3] - ax, e2z = P[c2 * 3 + 2] - az
      const ar = Math.abs(e1x * e2z - e2x * e1z) / 2; if (!(ar > 0)) continue
      area += ar
      for (const [bb, cc] of PTS) {
        const drawn = Hv[a] + bb * (Hv[c1] - Hv[a]) + cc * (Hv[c2] - Hv[a])
        const px = ax + bb * e1x + cc * e2x, pz = az + bb * e1z + cc * e2z, ref = Dref.heightAt(px, pz)
        errs.push(Math.abs(drawn - (ref ?? T.getElevationRaw(px, pz)))); wts.push(ar / PTS.length); n++
        if (errs[errs.length - 1] > 0.5) where.push({ e: errs[errs.length - 1], x: px, z: pz, g: specs[gi].key, owned: ref != null,
          vOwned: [a, c1, c2].map(v => Dref.heightAt(P[v * 3], P[v * 3 + 2]) != null).join(''), edge: Math.sqrt(Math.max(e1x * e1x + e1z * e1z, e2x * e2x + e2z * e2z)),
          tri: [a, c1, c2].map(v => [+P[v * 3].toFixed(3), +P[v * 3 + 2].toFixed(3)]) })
      }
    }
  })
  const ord = Uint32Array.from(errs.keys()).sort((i, j) => errs[i] - errs[j])
  const q = (f) => { let acc = 0; for (const i of ord) { acc += wts[i]; if (acc >= f * area) return errs[i] } return errs[ord[ord.length - 1]] }
  const over = (m) => { let a = 0; errs.forEach((e, i) => { if (e > m) a += wts[i] }); return `>${m * 1000} mm ${(100 * a / area).toFixed(3)}%` }
  console.log(`[accuracy] area over: ${[0.0078, 0.05, 0.1, 0.5].map(over).join(' · ')}`)
  where.sort((p, q) => q.e - p.e)
  const byG = {}; for (const w of where) byG[w.g] = (byG[w.g] || 0) + 1
  console.log(`[accuracy] ${where.length} point(s) > 0.5 m by group: ${Object.entries(byG).map(([k, v]) => k + ' ' + v).join(' · ')} · the point owned by a band: ${where.filter(w => w.owned).length} · all 3 vertices owned: ${where.filter(w => w.vOwned === 'truetruetrue').length}`)
  for (const w of where.slice(0, 8)) console.log(`[accuracy]   ${(w.e).toFixed(3)} m at (${w.x.toFixed(2)}, ${w.z.toFixed(2)}) ${w.g} · point ${w.owned ? 'owned' : 'past reach'} · vertices owned ${w.vOwned} · longest edge ${w.edge.toFixed(2)} m · tri ${JSON.stringify(w.tri)}`)
  console.log(`[accuracy] ped drawn vs heightAt, area-weighted over ${n} points (${(area / 1e6).toFixed(3)} km²): p50 ${(q(0.5) * 1000).toFixed(2)} mm · p99 ${(q(0.99) * 1000).toFixed(2)} mm · max ${(errs[ord[ord.length - 1]] * 1000).toFixed(2)} mm · ${((Date.now() - t) / 1000).toFixed(1)} s`)
}
console.log(`[end] ${mem()} (peak RSS: run under /usr/bin/time -l)`)
