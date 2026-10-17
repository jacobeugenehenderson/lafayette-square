// claims-the-ground-meets-its-terrain.mjs — DOES THE DRAWN GROUND'S TERRAIN PART STAY ON ITS TERRAIN, WITH NO WALLS?
//
// ⭐ THE INVARIANT (BRIEF-the-ground-knows-its-height §5): the deformer moves the ground off the raw terrain only by the
// profile it sweeps across ② — the line's smoothed height, the walk and the lawn taking up the rise at their own limits,
// the ease. So across any drawn triangle, its terrain part (`aRaw × terrainExag`, terrainShader `baked`) may rise more
// than the terrain under it by at most what the STEEPEST piece the kit draws on purpose allows: the town's lawn limit
// (`lawn.slopeMax`, norms.json through `resolveLawnNorm`, never restated) times the triangle's span. More than that is a
// WALL: a vertex standing metres off its terrain beside one that is on it (HPDM 2026-10-17: a 23.8 m wall in the asphalt,
// ② carrying a height filled from 906 m along it).
// ⭐ The limit is a DRAWN slope (the deformer divides it by the exaggeration so it holds as drawn), so the comparison is
//   drawn against drawn: aRaw × E against the terrain × E.
// ⭐ THE KERB IS NOT HERE: the mesh's own y (the kerb, unexaggerated) has its own law (`claims-the-kerb-stands-and-drops-
//   at-each-cut`); this reads the terrain part alone.
// ⭐ SUB-LATTICE: an excess under the partition's lattice (`LATTICE_M`, src/lib/lattice.js, read) cannot show.
// ⛔ A SLAB WITH NO BAKED TERRAIN PART (the 5 m texture path, a slab older than the deformer) CANNOT BE JUDGED: its terrain
//   part IS the terrain, so a pass would say nothing. It fails, said so, until it is re-baked.
// ⛔ A town naming no lawn limit cannot be judged either: the deformer then lets the lawn take any rise, and no bound exists.
//
//   node checks/claims-the-ground-meets-its-terrain.mjs [--town=a,b] [--dir=<slab dir>] [--show=n] [--selftest]
// Read-only. Exits 1 on any wall, on a slab that cannot be judged, or on a town whose limit cannot be read.
// --selftest: lifts one vertex of the first judged group in memory, 1 m (drawn) beyond what the lawn's limit allows across
// its longest incident edge: the check must then report a wall it did not report before.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../cartograph/terrainLoad.js'
import { resolveLawnNorm } from '../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../src/lib/lattice.js'

const ROOT = new URL('../public/baked/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SHOW = +(arg('show') || 8)
const SELFTEST = process.argv.includes('--selftest')
const dirs = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'ground.json')))).map(t => arg('dir') ? t : join(ROOT, t))

function judge(dir, mutate = false) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
  const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const town = gj.look
  if (!town) return { town: dir, refused: 'the slab names no town (`look`)' }
  const lawn = resolveLawnNorm(town, null).slopeMax
  if (!(lawn > 0)) return { town, refused: 'the town names no lawn slope limit (norms.json lawn.slopeMax) — no bound on how steep the drawn ground may depart from its terrain' }
  const groups = gj.groups.filter(g => g.rawByteOffset != null)
  if (!groups.length) return { town, refused: `no group carries a baked terrain part (aRaw): the slab is on the 5 m texture path, older than the deformer — its terrain part IS the terrain, so there is nothing to judge. Re-bake the ground` }
  const T = loadSceneTerrain(town), E = T.exag
  if (!(E > 0)) return { town, refused: 'the town names no exaggeration' }
  const t = (x, z) => T.getElevationRaw(x, z) * E
  const by = new Map(), walls = []
  let tri = 0, mutated = null
  for (const g of groups) {
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    let R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    // the mutation: one vertex lifted 1 m (drawn) more than the lawn's limit allows across its longest incident edge
    if (mutate && !mutated && g.vertexCount > 10) { R = Float32Array.from(R); const v = g.vertexCount >> 1; let L = 0
      for (let k = 0; k < I.length; k += 3) if (I[k] === v || I[k + 1] === v || I[k + 2] === v) for (const w of [I[k], I[k + 1], I[k + 2]]) L = Math.max(L, Math.hypot(P[w * 3] - P[v * 3], P[w * 3 + 2] - P[v * 3 + 2]))
      R[v] += (1 + lawn * L) / E; mutated = `${g.kind}:${g.id} v${v} by ${(1 + lawn * L).toFixed(2)} m` }
    const ter = new Float64Array(g.vertexCount); for (let v = 0; v < g.vertexCount; v++) ter[v] = t(P[v * 3], P[v * 3 + 2])
    let n = 0
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2]
      const da = R[a] * E, db = R[b] * E, dc = R[c] * E
      const rise = Math.max(da, db, dc) - Math.min(da, db, dc), trise = Math.max(ter[a], ter[b], ter[c]) - Math.min(ter[a], ter[b], ter[c])
      const ex = rise - trise
      if (!(ex > LATTICE_M)) continue
      const span = Math.max(Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]), Math.hypot(P[b * 3] - P[c * 3], P[b * 3 + 2] - P[c * 3 + 2]), Math.hypot(P[c * 3] - P[a * 3], P[c * 3 + 2] - P[a * 3 + 2]))
      if (ex <= lawn * span) continue
      n++
      walls.push({ ex, s: `${g.kind}:${g.id} at (${((P[a * 3] + P[b * 3] + P[c * 3]) / 3).toFixed(1)}, ${((P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3).toFixed(1)}): rises ${ex.toFixed(2)} m more than its terrain across ${span.toFixed(2)} m (the lawn's limit allows ${(lawn * span).toFixed(2)})` })
    }
    tri += I.length / 3
    if (n) by.set(`${g.kind}:${g.id}`, n)
  }
  walls.sort((p, q) => q.ex - p.ex)
  return { town, lawn, E, tri, walls, by, mutated, texture: gj.groups.length - groups.length }
}

const say = (r) => {
  if (r.refused) { console.log(`  ⛔   ${r.town}: cannot be judged — ${r.refused}`); return 1 }
  const head = `${r.town}: ${r.tri} triangle(s) with a baked terrain part · exag ${r.E} · bound: the lawn's limit ${(r.lawn * 100).toFixed(1)}% × the triangle's span (scene)${r.texture ? ` · ⛔ ${r.texture} group(s) on the texture path, not judged` : ''}`
  if (!r.walls.length) { console.log(`  ✓   ${head} · no wall`); return r.texture ? 1 : 0 }
  console.log(`  ⛔   ${head}\n        ${r.walls.length} WALL triangle(s), worst ${r.walls[0].ex.toFixed(2)} m · by group: ${[...r.by].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
  for (const w of r.walls.slice(0, SHOW)) console.log(`          ${w.s}`)
  return 1
}

if (SELFTEST) {
  const dir = dirs[0], base = judge(dir), mut = judge(dir, true)
  if (base.refused) { console.log(`⛔ selftest: ${dir} cannot be judged — ${base.refused}`); process.exit(1) }
  const ok = mut.walls.length > base.walls.length
  console.log(`${ok ? '✓' : '⛔'} selftest on ${base.town}: lifting ${mut.mutated} → walls ${base.walls.length} → ${mut.walls.length}${ok ? '' : ' — THE CHECK DID NOT SEE IT'}`)
  process.exit(ok ? 0 : 1)
}
let bad = 0
for (const d of dirs) bad += say(judge(d))
console.log(bad ? `⛔ ${bad} slab(s) whose ground leaves its terrain in a wall, or that cannot be judged` : '✓ every slab\'s ground meets its terrain')
process.exit(bad ? 1 : 0)
