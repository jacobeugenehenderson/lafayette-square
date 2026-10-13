// conformAndRefine ALONE on a dumped input (`bake-ground.dump.js`, CONFORM_DUMP=<dir>): the deformer and the tide band
// rebuilt from the dump exactly as the bake builds them, the sampler wrapped to count and time its calls, and the timed
// scratch copy of groundConformity for per-phase time. RSS and swap at the start and the end; peak RSS from /usr/bin/time -l. Read-only.
//   node --max-old-space-size=14000 scratch/huron-cost/conform-alone.mjs <dump dir> [deform|raw] [conformity module]
//   module defaults to the timed scratch copy (per-phase time); pass a path (e.g. cartograph/groundConformity.js) to run that.
//   PED_FLOOR=<m> sets the ped bands' minEdge (the floor; tol stays the dump's); PED_POLICY=lots gives the ped bands the lots'
//   policy (tol, minEdge from meta.json: the 10-11 policy point). The ped bands are read from bake-ground.js's PED_KEYS.
//   INPUT_ONLY=1 turns every group's refinement off: the input side only (polygons, input T-junctions), in seconds.
//   Prints the detector's count on the output (as the bake runs it) and a sha256 over every group's positions, indices, side.
//   deform = the bake's sampler (`terrainPartAt` × exag) · raw = the terrain's own (`getElevation`, 10-11's sampler)
import { readFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { resolve } from 'path'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs')
const { waterLevels } = await import(R + 'cartograph/waterLevel.mjs')
const [dir, which = 'deform', modPath] = process.argv.slice(2)
const { conformAndRefine, findTJunctions } = await import(modPath ? resolve(modPath) : './groundConformity.timed.js')
console.log(`[module] ${modPath ? resolve(modPath) : 'groundConformity.timed.js'}`)
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
console.log(`[policy] ped = ${pedEq.join(', ')}, ${pedPre.map(p => p + '*').join(', ')} · ${LOTS ? `lots' policy (tol ${meta.refineTol}, minEdge ${meta.refineMinEdge})` : FLOOR != null ? `floor ${FLOOR} m` : 'as dumped'}`)
const specs = []
for await (const line of createInterface({ input: createReadStream(dir + '/specs.ndjson'), crlfDelay: Infinity })) {
  if (!line) continue
  const s = JSON.parse(line), r = s.refine
  const refine = r && typeof r === 'object'
    ? { ...r, sampler: r.sampler ? sampler : null, band: r.band && levels ? { ...r.band, levels } : null }
    : r
  if (isPed(s.key) && refine?.mode === 'adaptive') {
    if (LOTS) { refine.tol = meta.refineTol; refine.minEdge = meta.refineMinEdge }
    else if (FLOOR != null) refine.minEdge = FLOOR
  }
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
console.log(`[end] ${mem()} (peak RSS: run under /usr/bin/time -l)`)
