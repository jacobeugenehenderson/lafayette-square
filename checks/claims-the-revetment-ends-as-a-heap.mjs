// claims-the-revetment-ends-as-a-heap.mjs — DOES THE STONE STOP IN A CUT?
//
// ⭐⭐ THE INVARIANT (Jacob, 2026-09-26, "revetment still just abruptly stops"; RULED): wherever
// armour ends — a hard→soft change, an arc tip — the heap ends as a dumped heap does, slumping
// at riprap's angle of repose in plan as well as in section. The run of each end is that end's
// crest / tan(repose), from the material constant the slab stamps. Toward the toe the stones
// thin out and shrink, so it reads as a scatter, not a cut.
//
// ⭐ Tested through the map's own code: `revetmentFromSlab.js` (crestAt, taperAt, ends) and
// `shoreChunks.js` (the stones SlabRevetment places). Nothing here restates the taper.
//
// PER END, FAILS WHEN:
//   ① the crest along the run is not monotone to ~0 at crest/tan(repose), or falls FASTER than
//      the repose slope (a blunt cut is an infinitely fast fall), or — at an arc tip — stands
//      above the cone rising from the tip
//   ② a placed stone, binned by quarter of the run, stands above the heap's cone by more than
//      one stone
// PER TOWN (pooled over every end, because one short end holds a handful of stones):
//   ③ the stones do not thin toward the toe, never reach the last quarter of the run, never lie
//      where the heap is under half a course of armour (they stopped at the wall's floor), or
//      are not smaller at the toe than on the wall
//   ⚠️ Mutation-tested: removing the taper, steepening the slump, keeping the wall's floor, or
//      removing the thinning all go red. Removing ONLY the extra shrink does not — the falling
//      crest already shrinks the stones, and no threshold here separates the two without being
//      tuned to one town.
//
//   node checks/claims-the-revetment-ends-as-a-heap.mjs                 # the shipped revetment.json
//   node checks/claims-the-revetment-ends-as-a-heap.mjs --dir=<dir>     # <dir>/<look>/revetment.json (a --out bake)
// Read-only. Exits 1 on any blunt end.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'
import { shoreContext, resolveWindow, CHUNK_M } from '../src/lib/shoreChunks.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const dirArg = process.argv.find(a => a.startsWith('--dir='))?.slice(6)
const base = dirArg || join(ROOT, 'public', 'baked')
const looks = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
const BINS = 4
let failed = false, audited = 0

for (const look of looks) {
  const p = join(base, look, 'revetment.json')
  if (!existsSync(p)) continue
  const doc = JSON.parse(readFileSync(p, 'utf8'))
  if (!doc.arcs?.length) continue
  audited++
  const tan = Math.tan((doc.material.riprapReposeDeg * Math.PI) / 180)
  const faces = revetmentFaces(doc).filter(f => f.anyArmour)
  const bad = []
  let ends = 0
  const pooled = Array.from({ length: BINS }, () => ({ n: 0, size: 0, len: 0 }))
  // ⭐ The scatter must run on BELOW the wall's own floor: on the wall no stone stands where the
  // heap is under one course (`material.minArmourD50M`), so a heap that stops there is the cut.
  const course = doc.material.minArmourD50M
  let belowHalfCourse = 0

  for (const f of faces) {
    const L = f.lengthM
    const crest = (s) => f.crestAt(s / L)
    const ctx = shoreContext({ poly: f.poly, crestAt: f.crestAt, taperAt: f.taperAt, seed: doc.seed })
    const cache = new Map()
    const stonesNear = (s0, s1) => {
      const out = []
      for (let c = Math.max(0, Math.floor(s0 / CHUNK_M)); c <= Math.min(ctx.nChunks - 1, Math.floor(s1 / CHUNK_M)); c++) {
        if (!cache.has(c)) { const lo = c * 100000; cache.set(c, resolveWindow(ctx, c, 2).filter(st => st.id >= lo && st.id < lo + 100000)) }
        for (const st of cache.get(c)) if (st.along >= s0 && st.along <= s1) out.push(st)
      }
      return out
    }
    for (const e of f.ends) {
      ends++
      const where = `${f.key} end @ ${e.s.toFixed(1)} m (${e.tip ? 'arc tip' : 'hard→soft'}, crest ${e.H.toFixed(2)} m, run ${e.run.toFixed(2)} m)`
      // x = distance from the wall toward the toe. An interior end's toe is run beyond it; a tip's toe IS the tip.
      const sOf = (x) => e.tip ? e.s + e.dir * (e.run - x) : e.s + e.dir * x
      // ① the crest
      const N = 40
      let prev = Infinity, why = null
      for (let k = 0; k <= N && !why; k++) {
        const x = (e.run * k) / N, s = sOf(x)
        if (s < 0 || s > L) continue
        const h = crest(s)
        if (e.tip) {
          const y = e.run - x   // distance from the tip
          if (h > y * tan + 1e-6) why = `stands ${h.toFixed(2)} m at ${y.toFixed(2)} m from the tip, above the repose cone (${(y * tan).toFixed(2)} m) — a blunt tip`
        } else {
          if (h > prev + 1e-6) why = `crest rises toward the toe at ${x.toFixed(2)} m (${prev.toFixed(3)} → ${h.toFixed(3)})`
          else if (h < e.H - x * tan - 1e-6) why = `crest falls faster than repose at ${x.toFixed(2)} m (${h.toFixed(2)} < ${(e.H - x * tan).toFixed(2)}) — a cut`
          prev = h
        }
      }
      if (!why && crest(sOf(e.run)) > 1e-3) why = `crest is still ${crest(sOf(e.run)).toFixed(2)} m at the toe`
      if (why) { bad.push(`${where}: ${why}`); continue }
      // ② the placed stones
      const z0 = Math.min(sOf(0), sOf(e.run)), z1 = Math.max(sOf(0), sOf(e.run))
      const bins = Array.from({ length: BINS }, () => ({ top: 0, hMax: 0 }))
      for (const st of stonesNear(z0, z1)) {
        const x = e.tip ? e.run - (st.along - e.s) * e.dir : (st.along - e.s) * e.dir
        const b = Math.min(BINS - 1, Math.max(0, Math.floor((x / e.run) * BINS)))
        const sz = st.s[1]
        bins[b].top = Math.max(bins[b].top, st.p[1] + sz / 2); bins[b].hMax = Math.max(bins[b].hMax, sz)
        pooled[b].n++; pooled[b].size += (st.s[0] + st.s[1] + st.s[2]) / 3
        if (crest(st.along) < course / 2) belowHalfCourse++
      }
      for (let b = 0; b < BINS; b++) pooled[b].len += e.run / BINS
      // ⭐ The stones are judged against the heap's ENVELOPE, which falls monotonically by ①:
      // no quarter's stone may stand above the cone at that quarter's start by more than one
      // stone. ⛔ Not quarter against quarter — a short end holds a handful of stones and a
      // sparse quarter's single pebble is thinning, not a rise.
      for (let b = 0; b < BINS; b++) {
        const cone = e.tip ? Math.min(e.H, (e.run - (e.run * b) / BINS) * tan) : e.H - ((e.run * b) / BINS) * tan
        if (bins[b].top > cone + bins[b].hMax + 1e-6) { bad.push(`${where}: stones in quarter ${b + 1} reach ${bins[b].top.toFixed(2)} m, above the heap (${cone.toFixed(2)} m + one stone)`); break }
      }
    }
  }
  // ③ pooled thinning and shrinking
  const dens = pooled.map(b => b.n / Math.max(1e-9, b.len))
  const size = pooled.map(b => b.n ? b.size / b.n : 0)
  // Packing makes the first two quarters jostle (a big wall stone blocks its neighbours), so
  // thinning is judged half against half, and toe against wall.
  if (!(dens[2] + dens[3] < dens[0] + dens[1] && dens[3] < dens[0])) bad.push(`stones do not thin toward the toe: ${dens.map(d => d.toFixed(1)).join(' → ')} per metre`)
  if (!belowHalfCourse) bad.push(`no stone lies where the heap is under half a course (${(course / 2).toFixed(2)} m) — the stones stop at the wall's floor instead of scattering to the toe`)
  if (!pooled[BINS - 1].n) bad.push('no stone reaches the last quarter of any end — the heap stops short of its toe (a cut)')
  else if (size[BINS - 1] >= size[0]) bad.push(`stones are not smaller at the toe (${size[BINS - 1].toFixed(2)} m) than on the wall (${size[0].toFixed(2)} m)`)

  console.log(`  ${bad.length ? '⛔' : '✅'} ${look.padEnd(16)} ${ends} armour end(s) · ${belowHalfCourse} stone(s) scattered below half a course · stones per metre by quarter of the run: ${dens.map(d => d.toFixed(1)).join(' → ')} · mean size ${size.map(s => s.toFixed(2)).join(' → ')} m`)
  for (const b of bad.slice(0, 5)) console.log(`       ${b}`)
  if (bad.length > 5) console.log(`       … and ${bad.length - 5} more`)
  if (bad.length) failed = true
}
console.log(`\n  ${audited} revetment(s) audited from ${dirArg ? dirArg : 'public/baked'}`)
if (failed) { console.log('\n⛔ a revetment ends in a cut, not a heap'); process.exit(1) }
console.log('\n✅ every armour end slumps to nothing at the angle of repose, and the stones scatter out to its toe')
