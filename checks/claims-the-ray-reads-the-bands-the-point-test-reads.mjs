#!/usr/bin/env node
/**
 * claims-the-ray-reads-the-bands-the-point-test-reads.mjs — DOES THE DEFORMER'S RAY SEE THE BANDS ITS OWN POINT TEST SEES?
 *
 * ⛔ KNOWN RED, found 2026-10-13 (Brace's real Huron bake on d09644cc refused: "ped vertices in a drawn band that NO painted
 *    band owns"; Tern's probe of the deformer's own input, Boz's ruling). A ped point is owned by the ② span whose RAY, traced
 *    inward from its station by `bandsAlong`, reaches it through curb/lawn/walk. Along fox-road (Huron tile 20) the point
 *    test (`inClass`) reads curb 0.05–0.35 · treelawn 0.40–1.85 · walk 1.90–3.35 m, and the ray reads lawn to 0.458 and LOT
 *    after it. There two treelawn pieces leave a 0.8 mm gap (below the 1 mm lattice) with a 0.9 mm sliver between them; the
 *    ray applies the crossings within ONE lattice of the group's FIRST crossing, so the next piece's entry, 1.3 mm on, falls
 *    outside the group; the class reads 'lot', and the ray ends at the first lot after a band. 2,240 vertices went unowned.
 * ⭐ THE RULE, read from the deformer itself: along a ray from a ② station toward a point, the class `bandsAlong` gives at a
 *    distance is the class the deformer's own point test gives there (away from a band edge by more than the lattice), and
 *    a point in a band beside its street is owned.
 * ⭐ MUTATION-TESTED: `--selftest` runs the rows on two copies of groundDeformer's source: the window CHAINED (each crossing
 *    within one lattice of the previous joins the group: the rows must go GREEN, so the RED here is the window and nothing
 *    else), and the window shrunk to nothing (the rows must stay RED).
 * Fixture: checks/fixtures/deformer-ray-huron-t20.json, cut by scratch/ground-budget/nan-fixture.mjs (CROP=40, every band
 * piece clipped to the box) from a dump of the deformer's input on d09644cc's shape.
 *
 *   node checks/claims-the-ray-reads-the-bands-the-point-test-reads.mjs [--selftest]
 * Read-only, under a second. Exit 1 on a failure.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'
const ROOT = new URL('..', import.meta.url).pathname
const F = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/deformer-ray-huron-t20.json'), 'utf8'))
const EDGE = 0.003                     // a sample this near a band edge (either reading's) is the lattice's, not a verdict

const rows = async (url) => {
  const { buildDeformer } = await import(url)
  const P = F.terrain.patch
  const data = new Proxy({}, { get: (_, k) => { const idx = Number(k), j = Math.floor(idx / F.terrain.width) - P.j0, i = idx % F.terrain.width - P.i0
    return i >= 0 && j >= 0 && i < P.w && j < P.h ? P.data[j * P.w + i] : 0 } })
  const D = buildDeformer({ ...structuredClone(F.deform), raw: makeElevationSampler({ width: F.terrain.width, height: F.terrain.height, bounds: F.terrain.bounds, data }).getElevationRaw })
  const cls = (x, z) => ['walk', 'lawn', 'curb'].find(c => D._inClass(c, x, z)) || 'lot'
  let live = 0, samples = 0; const parted = [], unowned = []
  for (const [x, z] of F.points) {
    const e = D.explain(x, z), [sx, sz] = e.station, L = Math.hypot(x - sx, z - sz), ux = (x - sx) / L, uz = (z - sz) / L
    if (cls(x, z) !== 'lot') live++
    const B = D._bandsAlong(sx, sz, ux, uz, L + 1)
    const rayAt = (t) => (B.find(b => t >= b.from && t < b.to) || B.at(-1)).cls
    for (let t = 0.01; t <= L; t += 0.01) {
      if (B.some(b => Math.abs(t - b.from) < EDGE || Math.abs(t - b.to) < EDGE)) continue
      const p = cls(sx + ux * t, sz + uz * t); if (cls(sx + ux * (t - EDGE), sz + uz * (t - EDGE)) !== p || cls(sx + ux * (t + EDGE), sz + uz * (t + EDGE)) !== p) continue
      samples++; const r = rayAt(t); if (r !== p) { parted.push(`(${x}, ${z}) at ${t.toFixed(2)} m: the ray reads ${r}, the point test ${p}`); break }
    }
    if (D.unownedIn(x, z) != null) unowned.push(`(${x}, ${z})`)
  }
  return [
    [`the fixture is live: ${live} of ${F.points.length} points lie in a painted band (the point test)`, live === F.points.length],
    [`the ray and the point test agree along ② → each point (${samples} samples, 1 cm)${parted.length ? ` — ${parted.join(' · ')}` : ''}`, parted.length === 0 && samples > 0],
    [`each point in a band beside its street is owned${unowned.length ? ` — unowned: ${unowned.join(' · ')}` : ''}`, unowned.length === 0],
  ]
}

const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const self = process.argv.includes('--selftest')
// ⭐ ONE mutated copy (checks/tier.mjs reads one temp-dir `mutant`) carrying both mutations behind a switch read at call
// time: the window CHAINED from the previous crossing, or shrunk to nothing
const mutant = () => { const src = readFileSync(HOME, 'utf8')
  const win = 'while (pending.length && pending[0].t - t0 <= LATTICE) { const h = pending.shift()'
  if (src.split(win).length !== 2) throw new Error('selftest: groundDeformer.mjs no longer groups a ray\'s crossings by `pending[0].t - t0 <= LATTICE` — re-aim the mutation')
  const f = join(mkdtempSync(join(tmpdir(), 'ray-reads-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(win, "let tp = t0; while (pending.length && pending[0].t - (globalThis.__RAY_WIN === 'chained' ? tp : t0) <= (globalThis.__RAY_WIN === 'none' ? 0 : LATTICE)) { const h = pending.shift(); tp = h.t")
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
const url = self ? mutant() : pathToFileURL(HOME).href
if (self) {
  const show = (name, R) => { console.log(`  ${name}:`); for (const [m, ok] of R) console.log(`    ${ok ? '✅' : '⛔'} ${m}`) }
  globalThis.__RAY_WIN = 'chained'; const A = await rows(url)
  globalThis.__RAY_WIN = 'none'; const Z = await rows(url)
  show('the window chained from the previous crossing', A); show('the window shrunk to nothing', Z)
  const s1 = A.every(r => r[1]), s2 = Z[0][1] && (!Z[1][1] || !Z[2][1])
  console.log(s1 ? '✅ selftest: with the window chained, every row is GREEN (the RED is the window)' : '⛔ selftest: the rows stay RED with the window chained — the RED is not (only) the window')
  console.log(s2 ? '✅ selftest: with no window, the rows are RED' : '⛔ selftest: the check does not catch a ray that reads lot between two abutting pieces')
  process.exit(s1 && s2 ? 0 : 1) }
const R = await rows(url)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the ray reads the bands the point test reads' : '⛔ the deformer\'s ray reads a lot where its own point test reads a band'); process.exit(ok ? 0 : 1)
