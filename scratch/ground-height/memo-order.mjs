// memo-order.mjs — does the deformer's height depend on the ORDER it is asked in? (Boz's ruling 2026-10-12, Cairn's
// reading: `groundDeformer.mjs#resolve` memoizes by the 1 mm lattice cell, so the first point into a cell answers for all.)
// READ-ONLY. The real deformer input from a bake dump (`scratch/huron-cost/dump`: deform.json + specs.ndjson).
// Point set: every input polygon vertex, plus each edge's 1/4 · 1/2 · 3/4 points (off-lattice, as refine makes them).
// Four fresh deformers, each asked every point once: today's key forward · today's key reversed · exact key forward ·
// exact key reversed. Reports, per pair: heights that differ, max |Δ| (raw m), owner flips, unowned flips.
//   node --max-old-space-size=8000 scratch/ground-height/memo-order.mjs <dump dir>
import { readFileSync, writeFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const dir = process.argv[2]
if (!dir) throw new Error('usage: memo-order.mjs <dump dir>')
const meta = JSON.parse(readFileSync(dir + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const A = JSON.parse(readFileSync(dir + '/deform.json', 'utf8'))

// the exact-key variant: today's source, the memo key line replaced, written beside this probe
const src = readFileSync(R + 'cartograph/groundDeformer.mjs', 'utf8')
const KEY = 'const mk = `${Math.round(x * CLIP_SCALE)},${Math.round(z * CLIP_SCALE)}`'
if (src.split(KEY).length !== 2) throw new Error('memo key line not found exactly once in groundDeformer.mjs — the probe is stale')
const exactPath = new URL('./groundDeformer.exactkey.mjs', import.meta.url).pathname
writeFileSync(exactPath, src.replace(KEY, 'const mk = `${x},${z}`').replace("'../src/lib/lattice.js'", `'${R}src/lib/lattice.js'`))
const variants = { today: (await import(R + 'cartograph/groundDeformer.mjs')).buildDeformer, exact: (await import(exactPath)).buildDeformer }

const pts = []
for await (const line of createInterface({ input: createReadStream(dir + '/specs.ndjson'), crlfDelay: Infinity })) {
  if (!line) continue
  for (const p of JSON.parse(line).polys) for (const r of [p.outer, ...(p.holes || [])]) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]; pts.push(a)
    for (const f of [0.25, 0.5, 0.75]) pts.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])])
  }
}
const cells = new Map()
for (const [x, z] of pts) { const k = `${Math.round(x * 1000)},${Math.round(z * 1000)}`; let s = cells.get(k); if (!s) cells.set(k, s = new Set()); s.add(`${x},${z}`) }
let shared = 0; for (const s of cells.values()) if (s.size > 1) shared++
console.log(`[points] ${pts.length} · ${cells.size} lattice cells · ${shared} cells hold ≥2 distinct points`)

function ask(name, reverse) {
  const D = variants[name]({ ...A, raw: T.getElevationRaw }), n = pts.length, out = new Array(n)
  for (let j = 0; j < n; j++) { const i = reverse ? n - 1 - j : j, [x, z] = pts[i]; out[i] = [D.heightAt(x, z), D.ownerAt(x, z), D.unownedIn(x, z)] }
  return out
}
function compare(label, P, Q) {
  let dh = 0, maxd = 0, at = null, own = 0, unown = 0, nul = 0
  for (let i = 0; i < P.length; i++) {
    const [h1, o1, u1] = P[i], [h2, o2, u2] = Q[i]
    if ((h1 == null) !== (h2 == null)) nul++
    else if (h1 !== h2) { dh++; const d = Math.abs(h1 - h2); if (d > maxd) { maxd = d; at = pts[i] } }
    if (o1 !== o2) own++
    if (u1 !== u2) unown++
  }
  console.log(`[${label}] heights differ ${dh} · max |Δ| ${maxd.toExponential(3)} m${at ? ` at (${at[0].toFixed(4)}, ${at[1].toFixed(4)})` : ''} · null↔value ${nul} · owner flips ${own} · unowned flips ${unown}`)
}
let t = Date.now()
const tf = ask('today', false), tr = ask('today', true), ef = ask('exact', false), er = ask('exact', true)
console.log(`[asked] 4 × ${pts.length} in ${((Date.now() - t) / 1000).toFixed(1)} s`)
compare('today: forward vs reversed', tf, tr)
compare('exact: forward vs reversed', ef, er)
compare('today forward vs exact', tf, ef)
compare('today reversed vs exact', tr, ef)
