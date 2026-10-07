#!/usr/bin/env node
/**
 * CLAIM: a town's bed is cut where the bottom stops being seen AT LOW WATER — the visibility depth below the town's LOW
 * level — never at the visibility depth below y = 0 (the survey flight's water, which no one chose).
 *
 * WHY (Jacob, 2026-10-07, ruling (a)): since the 09-27 ruling the water stands between LOW and HIGH. writeBed still cut
 * the bed at visibility below y = 0, so on a tidal town whose LOW sits below y = 0 no water reached its own colour at low
 * tide: Provincetown at 2 pm (phase 0.10) had 0 ha deeper than its 3.95 m visibility, and a sand floor showed through the
 * whole harbour. Invisible at high tide, which is when it was looked at.
 *
 * ⭐ READS THE BAKE, AND NAMES THE MECHANISM, not a threshold. Where the cap bites, the bed piles onto ONE line (millions of
 * cells on Provincetown). Per town with water, cells within 1 cm of each candidate line are counted:
 *   · LOW − visibility (waterLevel.mjs lowAt, the reader the player uses) — the ruled cut;
 *   · −visibility, where that line differs from LOW's by more than 2 cm — the y = 0 cut.
 * Fails when the y = 0 line holds ≥ 1% of the pile. ⚠️ A town whose LOW is within 2 cm of y = 0 cannot tell the two
 * apart; it is reported NOT EXERCISED, never passed. A town whose bed never reaches its cut is reported the same way.
 * ⛔ NO FALLBACK: a town with drawn water and no `water` / `bed` record in terrain.json FAILS.
 *
 * ⭐ SEEN TO FAIL: --self-test re-cuts each exercised town's bed at the y = 0 line in memory and must see it caught.
 *   node checks/claims-the-bed-is-seen-to-depth-at-low-water.mjs [--town=a,b] [--dir=<slab dir with terrain.json/.bin>] [--self-test]
 * READ-ONLY.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waterLevels } from '../cartograph/waterLevel.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const SELF = process.argv.includes('--self-test')
const BAKED = join(ROOT, 'public/baked')
const towns = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') ?? readdirSync(BAKED).filter((t) => existsSync(join(BAKED, t, 'terrain.json'))))
const TOL = 0.01, APART = 0.02

/** The piles on the two lines, for one heightfield. */
function piles(T, data) {
  const L = waterLevels(T.water), vis = T.bed.visibleToM
  const { minX, maxX, minZ, maxZ } = T.bounds, sx = (maxX - minX) / (T.width - 1), sz = (maxZ - minZ) / (T.height - 1)
  let atLow = 0, atZero = 0, apart = 0, deepestAtLow = -Infinity
  for (let j = 0; j < T.height; j++) for (let i = 0; i < T.width; i++) {
    const b = data[j * T.width + i]
    if (!Number.isFinite(b)) continue
    const low = L.lowAt(minX + i * sx, minZ + j * sz), cutLow = low - vis
    if (b > low) continue                                   // not under the water at low: not bed this claim reads
    deepestAtLow = Math.max(deepestAtLow, low - b)
    if (Math.abs(b - cutLow) < TOL) atLow++
    if (Math.abs(low) > APART) { apart++; if (Math.abs(b + vis) < TOL) atZero++ }
  }
  return { vis, lowName: L.lowName, low: L.range.low, atLow, atZero, apart, deepestAtLow }
}

let failed = 0, exercised = 0
const say = (ok, what) => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}`); if (!ok) failed++ }
for (const t of towns) {
  const dir = arg('dir') ? t : join(BAKED, t), name = arg('dir') ? t : t
  const T = JSON.parse(readFileSync(join(dir, 'terrain.json'), 'utf8'))
  if (!T.water && !T.bed) { console.log(`  ·  ${name}: no water drawn (datum ${T.datum}) — nothing to cut`); continue }
  if (!T.water || !T.bed?.visibleToM) { say(false, `${name}: water drawn but terrain.json carries no ${!T.water ? '`water`' : '`bed.visibleToM`'} — the cut cannot be read`); continue }
  const data = new Float32Array(readFileSync(join(dir, 'terrain.bin')).buffer.slice(0))
  const p = piles(T, data)
  const head = `${name}: ${p.lowName} ${p.low.map((v) => v.toFixed(2)).join('…')} m · visibility ${p.vis} m · deepest at low ${p.deepestAtLow.toFixed(2)} m`
  if (!p.apart) { console.log(`  ⚠️ NOT EXERCISED  ${head} — LOW is within ${APART * 100} cm of y = 0, so the two cuts coincide`); continue }
  if (!(p.atLow + p.atZero)) { console.log(`  ⚠️ NOT EXERCISED  ${head} — the bed never reaches either cut`); continue }
  exercised++
  const share = p.atZero / (p.atLow + p.atZero)
  say(share < 0.01, `${head} · cut at LOW − visibility: ${p.atLow.toLocaleString()} cells · at −visibility (y = 0): ${p.atZero.toLocaleString()} (${(100 * share).toFixed(1)}%)`)
  if (SELF) {
    // the mutation: the same bed, cut at the y = 0 line where it reached LOW's
    const m = new Float32Array(data), L = waterLevels(T.water)
    const { minX, maxX, minZ, maxZ } = T.bounds, sx = (maxX - minX) / (T.width - 1), sz = (maxZ - minZ) / (T.height - 1)
    for (let k = 0; k < m.length; k++) { const low = L.lowAt(minX + (k % T.width) * sx, minZ + Math.floor(k / T.width) * sz); if (m[k] <= low && m[k] < -p.vis) m[k] = -p.vis }
    const q = piles(T, m), caught = q.atZero / Math.max(1, q.atLow + q.atZero) >= 0.01
    console.log(`  ${caught ? '✅ caught' : '⛔ MISSED'} — ${name} with its bed cut at y = 0 − visibility (${q.atZero.toLocaleString()} cells on that line)`)
    if (!caught) failed++
  }
}
if (!exercised) { console.log('\n❌ no town exercised the claim — it proves nothing here'); process.exit(1) }
console.log(failed ? `\n❌ ${failed} failed` : `\n✅ every exercised town cuts its bed at the visibility depth below its LOW water`)
process.exit(failed ? 1 : 0)
