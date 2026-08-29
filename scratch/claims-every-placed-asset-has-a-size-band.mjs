/**
 * EVERY ASSET THE MAP PLACES MUST HAVE A SOURCED SIZE BAND.
 *
 * ⛔ THE DEFECT (2026-08-28). The dossier harvest's ROWS table is ranked by ROSTER demand
 * — the census count for a species name. But what the GPU draws is the ASSET the slab
 * places AFTER substitution, and the two diverge wherever substitution concentrates:
 *     oak_white        9 in the census   →  519 on the slab   (57.7×)
 *     oak_bur         45                 →  595              (13.2×)
 *     acer_saccharum   no roster row     →  251              (category fallback)
 * "Oak, White" fell below the harvest cut as a rounding error and then carried a tenth of
 * the map. It had NO DOSSIER AT ALL until it was hunted by hand, and 519 placements
 * rendered at a flat 1:1 scale the whole time — silently, because a species with no band
 * simply omits `scale` and the runtime defaults to 1.
 *
 * ⭐ WHY THIS IS THE CHECK. It ranks by what the slab PLACES, which is the only axis that
 * predicts render load, and asks one question of each: does it have a band a human could
 * cite? No thresholds, no species list, no operator who already knows which trees matter.
 * A town nobody has opened gets it free, and the amplification column shows WHY a species
 * mattered so the next harvest can be ranked correctly rather than re-derived by hand.
 *
 * ⚠️ CHICKEN-AND-EGG, STATED NOT HIDDEN: placed demand requires a bake to exist. A town's
 * FIRST pour must rank by roster demand; this check is what you run AFTER it, to find what
 * that ranking could not see. It is a second pass, not a replacement.
 *
 *   node scratch/claims-every-placed-asset-has-a-size-band.mjs [look ...]
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { dossierForSalonSpecies } from '../arborist/salon-options.js'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')

// ⛔ PIN the rule bake-trees actually applies — if `bandFor`'s precedence moves, this
// check is modelling something that no longer exists and must say so, not pass.
const src = readFileSync(path.join(ROOT, 'arborist/bake-trees.js'), 'utf8')
for (const [what, re] of [
  ['chassis.size.band first', /band = req\?\.\['chassis\.size'\]\?\.band/],
  ['USDA 20yr→max fallback', /chassis\.size_20yr'\]\?\.target[\s\S]{0,120}chassis\.size_max'\]\?\.target/],
]) {
  if (!re.test(src)) { console.error(`⛔ PIN DRIFT — bake-trees no longer reads "${what}". Update this check.`); process.exit(2) }
}

const looks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(BAKED).filter(d => existsSync(path.join(BAKED, d, 'trees.json')))

let failed = 0
console.log(`Every asset the map places must have a sourced size band — ${looks.length} look(s)\n`)

for (const look of looks) {
  const trees = JSON.parse(readFileSync(path.join(BAKED, look, 'trees.json'), 'utf8'))
  const placed = new Map()
  for (const i of trees.instances || []) placed.set(i.species, (placed.get(i.species) || 0) + 1)
  if (!placed.size) { console.log(`  ${look.padEnd(24)} — 0 placements`); continue }

  const bad = []
  for (const [sp, n] of [...placed].sort((a, b) => b[1] - a[1])) {
    let d = null
    try { d = dossierForSalonSpecies(sp) } catch { /* unresolved ⇒ no band */ }
    const R = d?.required || {}
    const b = R['chassis.size']?.band
    const lo = R['chassis.size_20yr']?.target, hi = R['chassis.size_max']?.target
    const ok = (b && b.hi > b.lo) || (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)
    if (!ok) bad.push([sp, n, d ? 'dossier exists, no usable band' : 'NO DOSSIER'])
  }

  if (!bad.length) {
    console.log(`  ✅ ${look.padEnd(24)} all ${placed.size} placed assets carry a sourced band`)
    continue
  }
  failed++
  const n = bad.reduce((t, r) => t + r[1], 0)
  const tot = [...placed.values()].reduce((a, b) => a + b, 0)
  console.error(`  ⛔ ${look.padEnd(24)} ${n} of ${tot} placements (${(100 * n / tot).toFixed(1)}%) render at a FLAT 1:1 —`)
  for (const [sp, c, why] of bad) console.error(`       ${sp.padEnd(22)} ${String(c).padStart(5)} placements   ${why}`)
  console.error(`       ▶ harvest them: add a ROWS entry in scratch/dossier-harvest.mjs, run it, then`)
  console.error(`         node arborist/mint-dossiers.mjs --in <observations> --write`)
}

console.log()
if (failed) { console.error(`⛔ ${failed} look(s) place assets with no size band.`); process.exit(1) }
console.log(`✅ every placed asset carries a sourced size band.`)
