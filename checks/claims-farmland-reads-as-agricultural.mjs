// claims-farmland-reads-as-agricultural.mjs
//
// ⭐⭐ THE INVARIANT (Jacob, 2026-10-05 — "add the fix"): a parcel code that SAYS farmland reads as
// `agricultural` LAND (`classifyUseFromText`, which derive.js paints the ground from), while a BUILDING on
// such a parcel stays a dwelling (`residential`, subtype `farm` — bake-content.js maps it, once).
//
// ⛔⛔ WHY. The reader answered the building question for both: `farm|agricultur → residential`, and
// `vacant` tested first. Huron's grain farms painted as houses and its CAUV farmland ("Agr-CAUV-Vacant
// Land", assessed in agricultural use) as empty lots — 808 ha of farm faces read `vacant` once parcels
// were weighed by area. ⭐ Each case below is a code text that exists in a declared parcel well.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. move the agricultural test BELOW `vacant`                      → "Agr-CAUV-Vacant Land"
//   2. restore `farm|agricultur → residential`, drop the new test      → every farm case
//   3. in bake-content.js, make `buildingUseOf` return its input       → the building case
//   4. drop the word boundary on `farm`                                → "Farmers market"
//   5. drop `\bres-` from the residential test                       → "550: Res-Condo"
//
//   node checks/claims-farmland-reads-as-agricultural.mjs
// Read-only, hermetic.
import fs from 'fs'
import { classifyUseFromText } from '../cartograph/parcel-landuse.mjs'

let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }
const reads = (t) => classifyUseFromText(t).use
for (const [t, want] of [
  ['111: Agr-CAUV-Cash-Grain Farm', 'agricultural'], ['101: Agr-Cash-Grain Farm', 'agricultural'],
  ['110: Agr-CAUV-Vacant Land', 'agricultural'], ['100: Agr-Vacant Land', 'agricultural'],
  ['199: Agr-CAUV-Other', 'agricultural'], ['190: Agr-Other', 'agricultural'],
  ['500: Res-Vacant Land', 'vacant'], ['510: Res-Single Family', 'residential'],
  ['630: Exm-Township', 'institutional'], ['499: Com-Other', 'commercial'],
  ['Farmers market', 'unknown'],
  ['550: Res-Condo', 'residential'], ['599: Res-Other', 'residential'], ['399: Ind-Other', 'industrial'], ['830: Utl-Land and Improvement', 'industrial'],
]) say(reads(t) === want, `"${t}" reads as ${want} — got ${reads(t)}`)
// the building on farmland stays a dwelling: bake-content.js's one mapping
{
  const src = fs.readFileSync('cartograph/bake-content.js', 'utf8')
  const m = src.match(/function buildingUseOf\(u\) \{[\s\S]*?\n\}/)
  say(!!m, 'bake-content.js carries `buildingUseOf`')
  if (m) {
    const buildingUseOf = new Function(`${m[0]}; return buildingUseOf`)()
    const b = buildingUseOf(classifyUseFromText('111: Agr-CAUV-Cash-Grain Farm'))
    say(b.use === 'residential' && b.use_subtype === 'farm', `a building on a grain farm is a residential farmstead — got ${b.use}/${b.use_subtype}`)
    const r = buildingUseOf(classifyUseFromText('499: Com-Other'))
    say(r.use === 'commercial', `and every other class passes through unchanged — got ${r.use}`)
  }
}
console.log(`\n${failed ? '⛔ RED' : '✅ GREEN — farmland reads as agricultural land; the farmhouse on it is still a dwelling.'}`)
process.exit(failed ? 1 : 0)
