#!/usr/bin/env node
/**
 * "IS THIS CAP A DEAD END, OR A COVER OVER A FRAGMENT SEAM?"
 *
 * The skeleton already derives a cap for every chain end, WITH the node degree:
 *     street.caps = { start: {cap, degree}, end: {cap, degree} }
 * The operator's overlay (`clean/overlay.json`) can override it per end with
 * capStart / capEnd. This compares the two and — the part that matters —
 * reports the DEGREE of the node each authored cap sits on.
 *
 * ⭐ WHY THE DEGREE IS THE WHOLE QUESTION. A cap is the end of a road. A
 *   degree-1 node genuinely is one, and a `round` cap there is a turning
 *   circle — real, and often data-derivable from OSM turning_circle /
 *   turning_loop. A node with degree >= 2 is a place the street CONTINUES, and
 *   at degree >= 3 it is a junction. A round turning-circle disk authored at a
 *   junction is not a design choice about that junction; it is a cover over the
 *   seam left where one named street was split into several skelId fragments.
 *
 * ⛔ This is the ONE case where an override is not automatically the product.
 *   `CLAUDE.md` Layer 0 q3 says an override is first-class and never a bug to
 *   drive to zero — and that stands for every cap on a degree-1 end. But Jacob
 *   ruled on 2026-06-13 (`POLYGON-FIRST §5`) that the cap is DATA-DERIVABLE and
 *   the cap-chooser was a STOPGAP for when we could not yet build the geometry,
 *   so those curations are "data-defects to automate, NOT legitimate authoring."
 *   The kit invariant behind it (`SKELETON §6`): data-derivable => must be
 *   automatic; a manual override is a bug; only genuinely-creative LOOK is
 *   authored. So: report BOTH, and never collapse them into one number.
 *
 * ⛔ Read-only. Writes nothing.
 *
 * Usage:  node scratch/claims-cap-vs-skeleton.mjs [scene]
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const DATA = join(ROOT, 'cartograph/data')

const scenes = process.argv[2] ? [process.argv[2]]
  : readdirSync(DATA).filter(d => existsSync(join(DATA, d, 'clean/overlay.json'))
                               && existsSync(join(DATA, d, 'clean/skeleton.json')))

let grandSeam = 0, grandTip = 0
for (const scene of scenes) {
  const sk = JSON.parse(readFileSync(join(DATA, scene, 'clean/skeleton.json'), 'utf8'))
  const ov = JSON.parse(readFileSync(join(DATA, scene, 'clean/overlay.json'), 'utf8')).streets || {}
  const byId = Object.fromEntries((sk.streets || []).map(s => [s.id, s]))

  let agree = 0, override = 0, tip = 0, seam = 0
  const seams = []
  for (const [id, o] of Object.entries(ov)) {
    const s = byId[id]
    if (!s?.caps) continue
    for (const which of ['start', 'end']) {
      const val = o[which === 'start' ? 'capStart' : 'capEnd']
      if (val === undefined || val === null) continue
      const derived = s.caps[which] || {}
      derived.cap === val ? agree++ : override++
      if (derived.degree === 1) tip++
      else { seam++; seams.push([id, which, val, derived.cap, derived.degree]) }
    }
  }
  const total = agree + override
  if (!total) { console.log(`${scene}: no authored caps`); continue }

  grandSeam += seam; grandTip += tip
  console.log(`\n━━ ${scene} — ${total} authored cap values`)
  console.log(`   agree with the skeleton's derived cap : ${agree}`)
  console.log(`   override it                           : ${override}`)
  console.log(`   ✅ on a degree-1 end (a REAL road end) : ${tip}`)
  console.log(`   ⛔ on a node where the street CONTINUES: ${seam}${seam ? '   ← covers over fragment seams' : ''}`)
  for (const [id, which, val, der, deg] of seams)
    console.log(`      ⛔ ${id.padEnd(28)} ${which.padEnd(6)} authored=${String(val).padEnd(8)} skeleton=${String(der).padEnd(6)} degree=${deg}`)
}

console.log(`\n═══ TOTAL across ${scenes.length} scene(s): ${grandTip} on real road ends · ${grandSeam} on continuing nodes`)
if (grandSeam) {
  console.log(`⛔ ${grandSeam} authored caps sit where the street does not end.`)
  console.log(`   A cap there is not a turning circle — it is a cover over a chain-fragment seam,`)
  console.log(`   and it is authored DATA the freeze downstream consumes as if it were intent.`)
  console.log(`   → POLYGON-FIRST §2.1 (the dead-end class), SECTION §6.3 "answer the hole, not the cover".`)
} else {
  console.log('✅ Every authored cap sits on a genuine degree-1 road end.')
}
