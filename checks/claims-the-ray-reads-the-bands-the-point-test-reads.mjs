#!/usr/bin/env node
/**
 * claims-the-ray-reads-the-bands-the-point-test-reads.mjs — DOES THE DEFORMER'S RAY SEE THE BANDS ITS OWN POINT TEST SEES?
 *
 * Found 2026-10-13 (Brace's Huron bake refused: "ped vertices in a drawn band that NO painted band owns"; Tern's probe, Boz's
 * ruling). A ped point is owned by the ② span whose RAY, traced inward from its station by `bandsAlong`, reaches it through
 * curb/lawn/walk. Along Huron's fox-road two treelawn pieces leave a 0.8 mm gap (below the 1 mm lattice) with a 0.9 mm sliver
 * between them; grouped from the FIRST crossing, the next piece's entry 1.3 mm on fell outside the group, the class read 'lot',
 * and the ray ended there. ⭐ FIXED 2026-10-20 (Jacob: "chain the window"): a crossing within one lattice of the PREVIOUS joins.
 * ⭐ And a perpendicular corner's extension, past its leg's tangent where no station's ray reaches, is its leg's (Mitre,
 * BRIEF-the-height-code-owns-what-is-drawn §1.1): the fixture carries one such point, owned only through the legs' records.
 * ⭐ The leg's region is its PAINTED faces (`faces`), never its float rect (`rings`): HPDM's 74 slab vertices on an
 * extension's rounded outer edge lay in the band and up to 0.5 mm outside the rect, owned by nothing (2026-10-21). A second
 * fixture carries two of them.
 * ⭐ THE RULE, read from the deformer itself: along a ray from a ② station toward a point, the class `bandsAlong` gives at a
 *    distance is the class the deformer's own point test gives there (away from a band edge by more than the lattice), and
 *    a point in a band is owned.
 * ⭐ MUTATION-TESTED: `--selftest` runs the rows on a copy of groundDeformer's source with the window grouped from the FIRST
 *    crossing again, with no window at all, and with the leg read off its float rect again (each must go RED), and on the
 *    live source with the legs' records dropped (the leg point must go unowned).
 * Fixtures: checks/fixtures/deformer-ray-huron-t20.json, cut 2026-10-20 from a producer dump of Huron's deformer input
 * (mitre/height-owns-drawn): tiles 20 (fox-road) and 10 (a perpendicular corner) whole, their legs' records, the ink and the
 * bands within 40 m of the points, terrain patches 80 m round them (0 beyond: finite), and the street centrelines the tiles
 * name, from which the line is BUILT here (`lineHeights`), never stored · checks/fixtures/deformer-legface-hpdm-t67.json, cut
 * the same way 2026-10-21 from HPDM's tile 67 at two vertices of the bake's unowned list. Both fixtures' legs carry the faces
 * their tiles paint (mitre/leg-faces).
 *
 *   node checks/claims-the-ray-reads-the-bands-the-point-test-reads.mjs [--selftest]
 * Read-only, a few seconds. Exit 1 on a failure.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'
import { lineHeights } from '../cartograph/lineHeight.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'
const ROOT = new URL('..', import.meta.url).pathname
const EDGE = 0.003                     // a sample this near a band edge (either reading's) is the lattice's, not a verdict
const fixture = (f) => { const F = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures', f), 'utf8'))
  // the terrain: the fixture's patches laid into the full grid (0 elsewhere), so the real sampler reads it unchanged
  const grid = new Float32Array(F.terrain.width * F.terrain.height)
  for (const P of F.terrain.patches) for (let j = 0; j < P.h; j++) for (let i = 0; i < P.w; i++) grid[(P.j0 + j) * F.terrain.width + P.i0 + i] = P.data[j * P.w + i]
  const raw = makeElevationSampler({ width: F.terrain.width, height: F.terrain.height, bounds: F.terrain.bounds, data: grid }).getElevationRaw
  const LH = lineHeights({ streets: F.streets, raw, sigma: F.deform.limits.sigma }), W = F.water ? waterLevels(F.water) : null
  return { F, raw, line: { step: LH.step, heightAt: (id, p) => id === '__water__' ? W.highAt(p[0], p[1]) : LH.heightAt(id, p) } } }
const FX = ['deformer-ray-huron-t20.json', 'deformer-legface-hpdm-t67.json'].map(fixture)

const rows = async (url, { legs = true } = {}) => {
  const { buildDeformer } = await import(url)
  let live = 0, samples = 0, n = 0; const parted = [], unowned = [], notLeg = []
  for (const { F, raw, line } of FX) {
  const D = buildDeformer({ ...structuredClone(F.deform), legs: legs ? structuredClone(F.deform.legs) : [], raw, line })
  const cls = (x, z) => ['walk', 'lawn', 'curb'].find(c => D._inClass(c, x, z)) || 'lot'
  n += F.points.length
  F.points.forEach(([x, z], k) => {
    if (cls(x, z) !== 'lot') live++
    if (D.unownedIn(x, z) != null) unowned.push(`(${x}, ${z})`)
    if (/^leg/.test(F.kinds[k])) { if (!/\|leg\|/.test(D.ownerAt(x, z) || '')) notLeg.push(`(${x}, ${z}) owned by ${D.ownerAt(x, z)}`); return }
    const e = D.explain(x, z), [sx, sz] = e.station, L = Math.hypot(x - sx, z - sz), ux = (x - sx) / L, uz = (z - sz) / L
    const B = D._bandsAlong(sx, sz, ux, uz, L + 1)
    const rayAt = (t) => (B.find(b => t >= b.from && t < b.to) || B.at(-1)).cls
    for (let t = 0.01; t <= L; t += 0.01) {
      if (B.some(b => Math.abs(t - b.from) < EDGE || Math.abs(t - b.to) < EDGE)) continue
      const p = cls(sx + ux * t, sz + uz * t); if (cls(sx + ux * (t - EDGE), sz + uz * (t - EDGE)) !== p || cls(sx + ux * (t + EDGE), sz + uz * (t + EDGE)) !== p) continue
      samples++; const r = rayAt(t); if (r !== p) { parted.push(`(${x}, ${z}) at ${t.toFixed(2)} m: the ray reads ${r}, the point test ${p}`); break }
    }
  }) }
  return [
    [`the fixtures are live: ${live} of ${n} points lie in a painted band (the point test)`, live === n],
    [`the ray and the point test agree along ② → each ray point (${samples} samples, 1 cm)${parted.length ? ` — ${parted.join(' · ')}` : ''}`, parted.length === 0 && samples > 0],
    [`each point in a band is owned${unowned.length ? ` — unowned: ${unowned.join(' · ')}` : ''}`, unowned.length === 0],
    [`each extension point is owned by its leg, the two on its rounded outer edge included${notLeg.length ? ` — ${notLeg.join(' · ')}` : ''}`, notLeg.length === 0],
  ]
}

const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const self = process.argv.includes('--selftest')
// ⭐ ONE mutated copy (checks/tier.mjs reads one temp-dir `mutant`) carrying its mutations behind a switch read at call
// time: grouped from the FIRST crossing again, no window at all, or the leg read off its float rect
const mutant = () => { const src = readFileSync(HOME, 'utf8')
  const win = 'let tp = t0; while (pending.length && pending[0].t - tp <= LATTICE) { const h = pending.shift(); tp = h.t'
  const face = 'const rings = (x.faces || []).filter(r => r?.length >= 3).map(frozenCopy)'
  if (src.split(win).length !== 2) throw new Error('selftest: groundDeformer.mjs no longer chains a ray\'s crossings by `pending[0].t - tp <= LATTICE` — re-aim the mutation')
  if (src.split(face).length !== 2) throw new Error('selftest: groundDeformer.mjs no longer reads a leg\'s region off `x.faces` — re-aim the mutation')
  const f = join(mkdtempSync(join(tmpdir(), 'ray-reads-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(win, "let tp = t0; while (pending.length && pending[0].t - (globalThis.__RAY_WIN === 'first' ? t0 : tp) <= (globalThis.__RAY_WIN === 'none' ? 0 : LATTICE)) { const h = pending.shift(); tp = h.t")
    .replace(face, "const rings = (globalThis.__RAY_WIN === 'rect' ? x.rings : x.faces || []).filter(r => r?.length >= 3).map(frozenCopy)")
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
if (self) {
  const show = (name, R) => { console.log(`  ${name}:`); for (const [m, ok] of R) console.log(`    ${ok ? '✅' : '⛔'} ${m}`) }
  const url = mutant()
  globalThis.__RAY_WIN = 'first'; const A = await rows(url)
  globalThis.__RAY_WIN = 'none'; const Z = await rows(url)
  globalThis.__RAY_WIN = 'rect'; const Q = await rows(url)
  const L = await rows(pathToFileURL(HOME).href, { legs: false })
  show('the window grouped from the FIRST crossing (as before 2026-10-20)', A); show('no window at all', Z); show('the leg read off its float rect (as before 2026-10-21)', Q); show('the legs\' records dropped', L)
  const s1 = A[0][1] && (!A[1][1] || !A[2][1]), s2 = Z[0][1] && (!Z[1][1] || !Z[2][1]), s3 = L[0][1] && !L[3][1], s4 = Q[0][1] && !Q[3][1]
  console.log(s1 ? '✅ selftest: grouped from the first crossing, the rows are RED' : '⛔ selftest: the check does not see the first-crossing window')
  console.log(s2 ? '✅ selftest: with no window, the rows are RED' : '⛔ selftest: the check does not catch a ray that reads lot between two abutting pieces')
  console.log(s3 ? '✅ selftest: with the legs dropped, the extension point is not its leg\'s (RED)' : '⛔ selftest: the check does not see the legs dropped')
  console.log(s4 ? '✅ selftest: read off the float rect, the outer-edge points are not their leg\'s (RED)' : '⛔ selftest: the check does not see the leg read off its float rect')
  process.exit(s1 && s2 && s3 && s4 ? 0 : 1) }
const R = await rows(pathToFileURL(HOME).href)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the ray reads the bands the point test reads, and a leg owns its extension' : '⛔ the deformer\'s ray reads a lot where its own point test reads a band, or a leg\'s extension has no owner'); process.exit(ok ? 0 : 1)
