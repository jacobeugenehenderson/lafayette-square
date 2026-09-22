/**
 * boulder-drape-chunk.mjs — IS A CHUNKED DRAPE THE SAME MESH AS AN EAGER ONE?
 * ▶ node scratch/boulder-drape-chunk.mjs
 *
 * ⛔ The test that matters is not the timing. A chunked drape must be GEOMETRICALLY
 * IDENTICAL to the eager one — the same vertices, not "looks the same". A seam gap,
 * a crack or a duplicated strip reads as a thin dark line at a grazing angle and is
 * invisible from above, which is where it would be signed off.
 *
 * ⭐ Two things are compared, because for a MESH they can fail separately:
 *   ① POSITIONS — every triangle of the chunked build must exist in the eager build
 *     with identical vertex positions, and the triangle counts must agree exactly.
 *   ② NORMALS — a boundary vertex's normal is averaged over its triangle fan, and
 *     half that fan lives in the neighbouring chunk. Positions can match perfectly
 *     while normals do not; that is the seam that shows.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadHuronShore, profileArc, crestFn, arcFaces } from '../src/harness/boulders/huron.js'
import { revetmentDrape, drapeGlobals } from '../src/lib/revetmentDrape.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const local = (u) => path.join(ROOT, u.startsWith('/baked') ? 'public' + u : u.replace(/^\//, ''))
const fetcher = {
  json: async (u) => JSON.parse(fs.readFileSync(local(u), 'utf8')),
  bin: async (u) => { const b = fs.readFileSync(local(u)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) },
}

const { arcs, elevAt, armourAt } = await loadHuronShore({ fetcher })
const ARC = Number(process.argv[2] ?? 3)
const arc = arcs[ARC]
const prof = profileArc(arc, elevAt, armourAt)
const crestAt = crestFn(prof)
const poly = arcFaces(arc)[0]

const G = drapeGlobals({ poly, crestAt, octaves: 3 })
console.log(`\narc #${ARC} · ${arc.len.toFixed(0)} m · lattice ${G.nAlong} × ${G.nAcross} stations · step ${G.step.toFixed(3)} m`)

const key = (a, i) => `${a[i * 3].toFixed(4)},${a[i * 3 + 1].toFixed(4)},${a[i * 3 + 2].toFixed(4)}`

// ── eager ────────────────────────────────────────────────────────────────────
let t0 = performance.now()
const eager = revetmentDrape({ poly, crestAt, octaves: 3 })
const eagerCold = performance.now() - t0
t0 = performance.now(); revetmentDrape({ poly, crestAt, octaves: 3 }); const eagerWarm = performance.now() - t0

const EP = eager.geometry.attributes.position.array, EN = eager.geometry.attributes.normal.array, EI = eager.geometry.index.array
const eagerTris = new Set()
const eagerNormal = new Map()
for (let t = 0; t < EI.length / 3; t++) {
  const ks = [0, 1, 2].map(c => key(EP, EI[t * 3 + c]))
  eagerTris.add(ks.join('|'))
  for (let c = 0; c < 3; c++) {
    const v = EI[t * 3 + c]
    eagerNormal.set(key(EP, v), [EN[v * 3], EN[v * 3 + 1], EN[v * 3 + 2]])
  }
}

// ── chunked ──────────────────────────────────────────────────────────────────
const STATIONS_PER_CHUNK = Number(process.argv[3] ?? 64)
const ranges = []
for (let i = 0; i < G.nAlong - 1; i += STATIONS_PER_CHUNK) {
  ranges.push([i, Math.min(G.nAlong - 1, i + STATIONS_PER_CHUNK)])
}
const build = (r) => revetmentDrape({ poly, crestAt, octaves: 3, globals: G, stations: r })
t0 = performance.now()
const chunksCold = ranges.map(build)
const chunkedCold = performance.now() - t0
t0 = performance.now(); ranges.map(build); const chunkedWarm = performance.now() - t0

let tris = 0, missing = 0, normalMismatch = 0, worstN = 0, extra = 0
const seen = new Set()
for (const c of chunksCold) {
  const P = c.geometry.attributes.position.array, N = c.geometry.attributes.normal.array, I = c.geometry.index.array
  tris += I.length / 3
  for (let t = 0; t < I.length / 3; t++) {
    const ks = [0, 1, 2].map(x => key(P, I[t * 3 + x]))
    const sig = ks.join('|')
    if (!eagerTris.has(sig)) missing++
    if (seen.has(sig)) extra++
    seen.add(sig)
    for (let x = 0; x < 3; x++) {
      const v = I[t * 3 + x], k = ks[x]
      const e = eagerNormal.get(k)
      if (!e) continue
      const d = Math.hypot(N[v * 3] - e[0], N[v * 3 + 1] - e[1], N[v * 3 + 2] - e[2])
      if (d > 1e-6) { normalMismatch++; worstN = Math.max(worstN, d) }
    }
  }
}

console.log(`\n① POSITIONS`)
console.log(`   eager   ${eager.stats.tris} triangles`)
console.log(`   chunked ${tris} triangles across ${ranges.length} chunks`)
console.log(`   triangles in chunked but NOT in eager : ${missing}`)
console.log(`   triangles emitted TWICE (overlap)     : ${extra}`)
console.log(`   triangles in eager but never emitted  : ${eagerTris.size - seen.size}`)
console.log(`   ⇒ ${missing === 0 && extra === 0 && eagerTris.size === seen.size && tris === eager.stats.tris ? '✅ IDENTICAL' : '⛔ NOT IDENTICAL'}`)
console.log(`\n② NORMALS`)
console.log(`   vertices whose normal differs from eager: ${normalMismatch}   worst Δ ${worstN.toExponential(2)}`)
console.log(`   ⇒ ${normalMismatch === 0 ? '✅ SEAM-CONSISTENT' : '⛔ SEAM'}`)
console.log(`\n③ TIME`)
console.log(`   eager   cold ${eagerCold.toFixed(0)} ms   warm ${eagerWarm.toFixed(0)} ms`)
console.log(`   chunked cold ${chunkedCold.toFixed(0)} ms   warm ${chunkedWarm.toFixed(0)} ms   (${ranges.length} chunks, whole arc)`)
const inView = Math.min(ranges.length, 11)
const t1 = performance.now(); ranges.slice(0, inView).map(build); const viewWarm = performance.now() - t1
console.log(`   ⭐ ${inView} chunks IN VIEW: ${viewWarm.toFixed(0)} ms warm  (${(viewWarm / inView).toFixed(1)} ms/chunk)`)
console.log('')
