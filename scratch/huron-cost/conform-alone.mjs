// conformAndRefine ALONE on a dumped input (`bake-ground.dump.js`, CONFORM_DUMP=<dir>): the deformer and the tide band
// rebuilt from the dump exactly as the bake builds them, the sampler wrapped to count and time its calls, and the timed
// scratch copy of groundConformity for per-phase time. RSS and swap at the start and the end; peak RSS from /usr/bin/time -l. Read-only.
//   node --max-old-space-size=14000 scratch/huron-cost/conform-alone.mjs <dump dir> [deform|raw]
//   deform = the bake's sampler (`terrainPartAt` × exag) · raw = the terrain's own (`getElevation`, 10-11's sampler)
import { readFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { execSync } from 'child_process'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs')
const { waterLevels } = await import(R + 'cartograph/waterLevel.mjs')
const { conformAndRefine } = await import('./groundConformity.timed.js')
const [dir, which = 'deform'] = process.argv.slice(2)
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
const specs = []
for await (const line of createInterface({ input: createReadStream(dir + '/specs.ndjson'), crlfDelay: Infinity })) {
  if (!line) continue
  const s = JSON.parse(line), r = s.refine
  const refine = r && typeof r === 'object'
    ? { ...r, sampler: r.sampler ? sampler : null, band: r.band && levels ? { ...r.band, levels } : null }
    : r
  specs.push({ key: s.key, polys: s.polys, refine, yLift: s.yLift })
}
console.log(`[input] ${specs.length} groups · ${specs.reduce((n, s) => n + s.polys.length, 0)} polygons · ${mem()}`)
const st = {}
t = Date.now()
const out = conformAndRefine(specs, st)
const sec = (Date.now() - t) / 1000, tris = out.reduce((n, b) => n + b.indices.length / 3, 0)
console.log(`[conform] ${which}: ${sec.toFixed(1)} s · ${tris} tris · inTJ ${st.inputTJunctions} · closures ${st.closures} · refTJ ${st.refineTJunctions} · passes ${st.passes}`)
console.log(`[phases] ${Object.entries(st.phaseMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`).join(' · ')}`)
console.log(`[sampler] ${calls} calls · ${(Number(ns) / 1e9).toFixed(1)} s inside the sampler · ${(Number(ns) / 1e3 / Math.max(1, calls)).toFixed(2)} µs/call`)
console.log(`[end] ${mem()} (peak RSS: run under /usr/bin/time -l)`)
