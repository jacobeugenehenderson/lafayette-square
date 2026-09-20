/**
 * REPORT: does each town's block fill actually reach the fade band?
 *
 * ⭐⭐ THIS CHECK EXISTS BECAUSE THE ANSWER IS CURRENTLY INVISIBLE, AND THAT IS THE
 * WHOLE POINT. On 2026-09-20 the fade was briefly made ADDITIVE — `fade.inner =
 * radius`, running outward. It failed the eye gate on LS with a pale, straight-sided,
 * hard-cut overlay, and the cause was not the fade: BLOCK FILL TERMINATES INSIDE THE
 * RIM IN 261 OF 360 BEARINGS. Additive put it at full alpha exactly where it ran out,
 * so its ragged edge rendered at full opacity.
 *
 * ⛔ THE FADE WAS REVERTED TO INWARD, WHICH HIDES THE GAP AGAIN. An inward feather
 * drives block fill to alpha 0 by the rim, so the shortfall stops being visible — as
 * it had been, unnoticed, for the entire life of the product. ⭐ A defect that is
 * invisible BY DESIGN is the worst state for a finding to be in, so the number lives
 * here instead of in a comment beside code that no longer runs (CLAUDE.md §PRUNE #1:
 * if it can be checked by running something, it is a check, not prose).
 *
 * ⛔ THIS GATES NOTHING. A shortfall is not a build failure — it is a fact about the
 * artifact, reported so it can be acted on deliberately. It DOES fail loudly when it
 * cannot measure at all, because a silent "no data" would defeat the purpose.
 *
 * ⚠️ SCOPE IS NOT ESTABLISHED AND THIS CHECK SAYS SO. Only LS carries
 * `clean/block.json`; poured towns build their block fill at runtime from
 * `stencil − ribbons`, which would be round. Whether they share the shortfall is
 * UNMEASURED — do not infer it from LS, which is the mould and the usual source of
 * false generalisations here.
 *
 * ▶ node checks/claims-fade-has-something-to-dissolve.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { deriveFade } from '../cartograph/boundaryRecords.mjs'

const DATA = 'cartograph/data'
let hardFails = 0
const die = (m) => { console.log(`  ❌ ${m}`); hardFails++ }

// Max radius of any block vertex, per 1° bearing from the disc centre.
function reachByBearing(blockJson, cx, cz) {
  const bear = new Array(360).fill(0)
  const take = (x, z) => {
    const dx = x - cx, dz = z - cz
    let a = Math.round(Math.atan2(dz, dx) * 180 / Math.PI)
    if (a < 0) a += 360
    a %= 360
    const d = Math.hypot(dx, dz)
    if (d > bear[a]) bear[a] = d
  }
  const walk = (o) => {
    if (Array.isArray(o)) {
      if (o.length === 2 && typeof o[0] === 'number' && typeof o[1] === 'number') return take(o[0], o[1])
      for (const v of o) walk(v)
      return
    }
    if (o && typeof o === 'object') {
      if (typeof o.x === 'number' && typeof o.z === 'number') return take(o.x, o.z)
      for (const v of Object.values(o)) walk(v)
    }
  }
  walk(blockJson)
  return bear
}

const scenes = readdirSync(DATA)
  .filter(s => existsSync(join(DATA, s, 'neighborhood_boundary.json')))
  .sort()

console.log('BLOCK-FILL REACH vs the fade band, per town\n')
console.log('  A shortfall means block fill stops before the feather does. Under the')
console.log('  INWARD fade this is invisible — the feather has already reached alpha 0.\n')

let measured = 0
for (const s of scenes) {
  const nb = JSON.parse(readFileSync(join(DATA, s, 'neighborhood_boundary.json'), 'utf8'))
  const blockP = join(DATA, s, 'clean', 'block.json')
  if (!existsSync(blockP)) {
    console.log(`  ·  ${s.padEnd(26)} no clean/block.json — block fill is built at runtime (stencil − ribbons). UNMEASURED.`)
    continue
  }
  if (!Number.isFinite(nb.fadeBand)) {
    console.log(`  ·  ${s.padEnd(26)} no fadeBand — no dissolve, nothing to reach`)
    continue
  }
  let blocks
  try { blocks = JSON.parse(readFileSync(blockP, 'utf8')) }
  catch { die(`${s}: clean/block.json is unparseable — cannot measure, and silence here is the defect`); continue }

  const { inner, outer } = deriveFade(nb.radius, nb.fadeBand)
  const bear = reachByBearing(blocks, nb.center[0], nb.center[1])
  const any = bear.filter(v => v > 0).length
  if (!any) { die(`${s}: block.json parsed but yielded NO coordinates — the walker found nothing`); continue }
  measured++

  const reachesOuter = bear.filter(v => v >= outer).length
  const shortOfInner = bear.filter(v => v > 0 && v < inner).length
  const inBand = bear.filter(v => v >= inner && v < outer).length

  console.log(`  ${s}   R=${nb.radius}  band=${nb.fadeBand}  fade ${inner} → ${outer}`)
  console.log(`      bearings with block geometry : ${any}/360`)
  console.log(`      reaching the rim (${outer})       : ${reachesOuter}/360`)
  console.log(`      ending INSIDE the band          : ${inBand}/360`)
  console.log(`      ending BEFORE the band even starts (<${inner}) : ${shortOfInner}/360`)

  // Contiguous runs of reach-vs-short: the silhouette's segment count. A round edge
  // would be ~1 run; many runs is a ragged, straight-sided outline.
  let runs = 0, prev = null
  for (let a = 0; a < 360; a++) {
    const full = bear[a] >= outer
    if (full !== prev) { runs++; prev = full }
  }
  console.log(`      silhouette runs                 : ${runs}  ${runs > 4 ? '(ragged — straight-sided, not a circle)' : '(smooth)'}`)
  if (reachesOuter < 360) {
    console.log(`      ⚠️  ${360 - reachesOuter}/360 bearings do not reach the rim. Under an OUTWARD fade this`)
    console.log(`          renders at full alpha against a ragged edge — that is what failed the`)
    console.log(`          eye gate on 2026-09-20. Inward hides it; it is still true.`)
  }
  console.log()
}

if (!measured) console.log('  ⚠️  nothing measurable on disk — every town builds block fill at runtime.')
console.log(hardFails === 0
  ? '✅ reported (this check gates nothing — a shortfall is a fact, not a failure)'
  : `❌ ${hardFails} town(s) could not be measured — that IS a failure`)
process.exit(hardFails === 0 ? 0 : 1)
