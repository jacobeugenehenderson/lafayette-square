// claims-the-gusset-is-recorded.mjs — DOES THE SLAB SAY WHAT THE BANK IS, FROM HIGH WATER DOWN TO LOW?
//
// ⭐⭐ THE INVARIANT: every vertex of every coast run in a baked shape.json carries the gusset (`shoreGusset.mjs`):
// the water side's ground at the line and the run to LOW across the terrain, or null where LOW is not reached within
// the town's `reachM`. Re-computed here from the terrain and each run's own tile (its ① land, `iaFull`), never trusted.
// ⭐ The water side is the side of the run's EDGE that is not the carrying tile's ① land (Boz, 2026-10-13). It was the
// drawn water at half a terrain step, and 5,747 of Provincetown's 34,687 stations could not decide; two of them are
// this check's fixture (checks/fixtures/gusset-side-provincetown.json, cut by scratch/coast/gusset-fixture.mjs).
// ⭐ Ruled: the gusset is "the bank from [high] down to the LOW-WATER plane" (Jacob 2026-10-11), and its shape decides
// the fill's grain (2026-10-10), so it is RECORDED. Nothing is lowered to make it (Boz, 2026-10-13).
//
// ⛔ WHAT A WRONG RECORD LOOKS LIKE, and what this catches:
//   · the walk on the LAND side: every run reads "not reached", or reads the land's fall as the bank
//   · a null replaced by the reach: the flats read as a bank exactly `reachM` wide, a plausible number
//   · the crossing at the sample, not between samples: the run rounds to the terrain step
//   · a coast with no record (a slab baked before it): the treatment would read nothing and guess
//
// Mutations seen RED (2026-10-13), each by editing shoreGusset.mjs and restoring it:
//   1. the side flipped (`lr ? -tz : tz` / `lr ? tx : -tx` negated)  → self-test "beach", "the land side", "a narrow strip"
//   2. not reached written as the reach (`push(null)` → `push(reachM)`) → self-test "flats"
//   3. the crossing at the sample (`hit = d`)                     → self-test "beach"
//   4. the reach ignores the bed (`dean` → `stepM`)                 → self-test "reach"
//   5. no side → a guess (`if (ll === lr)` → `if (!m)`)             → self-test "no land", "all land"
//   6. a chosen width, not the lattice (`LATTICE_M = 1 / CLIP_SCALE` → `= 2.5`) → self-test "a narrow strip"
//
//   node checks/claims-the-gusset-is-recorded.mjs [scene]      # every baked town, or one
//   SLAB_DIR=<slab> node checks/claims-the-gusset-is-recorded.mjs <scene>   # a scratch slab
//   CARTOGRAPH_TERRAIN_DIR=<terrain> …                        # the terrain that slab was baked from
// Read-only. Exits 1 if a coast in a baked slab carries no gusset, or one that the terrain does not reproduce.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { gussetReach, gussetAlong, landOfTile } from '../cartograph/shoreGusset.mjs'
import { drawnWaterTest } from '../cartograph/shore-armour.mjs'
import { loadSceneTerrain, mapTerrainPaths } from '../cartograph/terrainLoad.js'
import { waterLevels } from '../cartograph/waterLevel.mjs'

// ⛔⛔ SELF-TEST FIRST: the module on a bank whose answer is known by construction.
{
  const line = Array.from({ length: 11 }, (_, i) => [i * 10, 0])          // +x; the tile's land is −z unless said
  const landMinus = (x, z) => z < 0, landPlus = (x, z) => z > 0
  const low = () => -0.5
  // a beach: 2 m at the line falling 0.1 per metre into the water (+z), rising inland → LOW at 25 m
  const beach = (x, z) => z > 0 ? 2 - 0.1 * z : 2 - 0.05 * z
  const fails = []
  const want = (what, got, exp) => { if (JSON.stringify(got) !== JSON.stringify(exp)) fails.push(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`) }
  const run = (ground, landAt, reachM, stepM = 2) => gussetAlong(line, { ground, lowAt: low, landAt, stepM, reachM })
  const n = line.length, all = (v) => Array(n).fill(v)
  { const g = run(beach, landMinus, 100); want('beach: ground at the line', g.ground, all(2)); want('beach: run to LOW (between samples)', g.toLow, all(25)) }
  { const g = run((x, z) => z > 0 ? 1 : 1 + 0.1 * -z, landMinus, 100); want('flats: never reaching LOW is null, not the reach', g.toLow, all(null)); want('flats: counted', g.notReached, n) }
  { const g = run(beach, landMinus, 20); want('reach: LOW beyond the reach is null', g.toLow, all(null)) }
  { const g = run((x, z) => z < 0 ? 2 + 0.1 * z : 2 - 0.05 * -z, landPlus, 100); want('the land side: the walk crosses away from the tile, not inland', g.toLow, all(25)) }
  { const g = run(beach, () => false, 100); want('no land: no side, no guess', [g.ground, g.toLow, g.noSide], [all(null), all(null), n]) }
  { const g = run(beach, () => true, 100); want('all land: no side, no guess', [g.ground, g.toLow, g.noSide], [all(null), all(null), n]) }
  { const g = run((x, z) => -1 - 0.1 * Math.max(0, z), landMinus, 100); want('already below LOW at the line', g.toLow, all(0)) }
  // a narrow strip: the tile's land is 1 m wide below the line, with water beyond it too. A probe wider than the strip
  // finds water on both sides; the edge asked one lattice step off reads the tile.
  { const g = run(beach, (x, z) => z < 0 && z > -1, 100); want('a narrow strip: the tile decides, whatever lies beyond it', g.toLow, all(25)) }
  // ⭐ TODAY'S STATIONS (Provincetown, 2026-10-13): the drawn-water probe could not decide them; the tile must.
  const FX = JSON.parse(readFileSync(join(ROOT, 'checks', 'fixtures', 'gusset-side-provincetown.json'), 'utf8'))
  for (const c of FX.cases) {
    const p = c.run, i = c.station, a = p[i - 1], b = p[i + 1], tx = b[0] - a[0], tz = b[1] - a[1], m = Math.hypot(tx, tz), wet = drawnWaterTest(c.water)
    const old = [wet(p[i][0] - tz / m * FX.probeM, p[i][1] + tx / m * FX.probeM), wet(p[i][0] + tz / m * FX.probeM, p[i][1] - tx / m * FX.probeM)]
    if (old[0] !== old[1]) fails.push(`fixture @ ${c.at}: the drawn-water probe now decides it — the fixture no longer holds today's failure`)
    const g = gussetAlong(p, { ground: () => 1, lowAt: () => 0, landAt: landOfTile(c.iaFull), stepM: 1, reachM: 1 })
    if (g.ground[i] == null) fails.push(`fixture @ ${c.at} (${c.kind}): the tile's edge does not decide the water side`)
  }
  const lv = (hi, lo) => ({ range: { high: [hi - 0.2, hi], low: [lo, lo + 0.3] }, highName: 'H', lowName: 'L' })
  want('reach: the bed\'s run over the widest range', +gussetReach({ bed: { A: 0.125 }, levels: lv(2.258, -0.702), stepM: 5 }).reachM.toFixed(2), +Math.pow(2.96 / 0.125, 1.5).toFixed(2))
  want('reach: a lake is one terrain step', gussetReach({ bed: { A: 0.125 }, levels: lv(0, 0), stepM: 5 }).reachM, 5)
  let threw = false; try { gussetReach({ bed: null, levels: lv(1, 0), stepM: 5 }) } catch { threw = true }
  if (!threw) fails.push('reach: a terrain with no bed was accepted')
  if (fails.length) { console.error(`⛔ SELF-TEST FAILED — the gusset module is wrong, so its record in any slab means nothing:\n   ${fails.join('\n   ')}`); process.exit(2) }
}

const only = process.argv[2] || null
const slabOf = (s) => process.env.SLAB_DIR && only ? process.env.SLAB_DIR : join(ROOT, 'public', 'baked', s)
const list = only ? [only] : scenes('public/baked/<scene>/shape.json', { label: 'baked shape' })
const fail = []
let coasts = 0, dry = 0
for (const scene of list) {
  const sPath = join(slabOf(scene), 'shape.json')
  if (!existsSync(sPath)) { fail.push(`${scene}: no baked shape.json at ${sPath}`); continue }
  const shape = JSON.parse(readFileSync(sPath, 'utf8'))
  const runs = (shape.tiles || []).flatMap(t => (t.runs || []).filter(r => r.skelId === '__water__' && r.poly?.length >= 2).map(r => ({ r, t })))
  if (!runs.length) { console.log(`  ${scene.padEnd(18)} no coast — no gusset`); dry++; continue }
  coasts++
  const G = shape.gusset
  if (!G) { fail.push(`${scene}: ${runs.length} coast run(s) and no shape.json#gusset — baked before the record. ▶ re-bake the ground`); continue }
  const T = loadSceneTerrain(scene)
  if (!T?.water) { fail.push(`${scene}: a gusset record but no terrain water record to re-measure it — CANNOT VERIFY`); continue }
  const L = waterLevels(T.water)
  const bed = JSON.parse(readFileSync(mapTerrainPaths(scene).json, 'utf8')).bed
  const R = gussetReach({ bed, levels: L, stepM: T.stepM })
  if (Math.abs(R.reachM - G.reachM) > 1e-3 || Math.abs(T.stepM - G.stepM) > 1e-4) fail.push(`${scene}: the record says step ${G.stepM} / reach ${G.reachM} m, the terrain gives ${T.stepM.toFixed(4)} / ${R.reachM.toFixed(3)} — measured on another terrain`)
  let stations = 0, off = 0, missing = 0, nulls = 0, reached = 0
  const worst = []
  for (const { r, t } of runs) {
    if (!r.gusset || r.gusset.ground?.length !== r.poly.length || r.gusset.toLow?.length !== r.poly.length) { missing++; continue }
    const g = gussetAlong(r.poly, { ground: T.getElevationRaw, lowAt: L.lowAt, landAt: landOfTile(t.iaFull), stepM: G.stepM, reachM: G.reachM })
    for (let i = 0; i < r.poly.length; i++) {
      stations++
      const a = [r.gusset.ground[i], r.gusset.toLow[i]], b = [g.ground[i], g.toLow[i]]
      if (a[1] == null) nulls++; else reached++
      if (a[0] !== b[0] || a[1] !== b[1]) { off++; if (worst.length < 3) worst.push(`@ ${r.poly[i].map(v => v.toFixed(1)).join(',')}: recorded ${JSON.stringify(a)}, re-measured ${JSON.stringify(b)}`) }
    }
  }
  const ok = !missing && !off
  console.log(`  ${ok ? '✅' : '⛔'} ${scene.padEnd(16)} ${stations} station(s) on ${runs.length} run(s) · ${reached} reach ${G.low} (within ${G.reachM} m, ${G.reachFrom}) · ${nulls} null (not reached, or no side) · walked every ${G.stepM} m`)
  if (missing) fail.push(`${scene}: ${missing} coast run(s) carry no gusset, or one not aligned to their vertices`)
  if (off) fail.push(`${scene}: ${off} station(s) the terrain does not reproduce:\n     ${worst.join('\n     ')}`)
}
console.log(`\n  ${coasts} coast(s) · ${dry} town(s) without one`)
if (fail.length) { console.error(`\n⛔ THE GUSSET IS NOT RECORDED AS THE TERRAIN STANDS:\n   ${fail.join('\n   ')}`); process.exit(1) }
console.log('\n✅ every coast station records its bank: the ground at the line and the run to LOW, or that LOW was not reached')
