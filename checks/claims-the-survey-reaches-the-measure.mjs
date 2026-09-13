#!/usr/bin/env node
// ⭐⭐⭐ DOES THE CITY'S SURVEY REACH THE MAP? — the join, scored, for any town that has one.
// `raw/survey.json` is a KIT INPUT: per-street, per-side distances from centreline to the SIDEWALK
// CENTRELINE. `skeleton.js`'s `fromSurveyDist` turns each into a ped section:
//     swInner  = swDist − SV_SIDEWALK/2
//     pav      = min(seed.pavementHW, swInner − CURB_WIDTH)     ← asphalt CLAMPED to the sidewalk
//     treelawn = max(0, swInner − (pav + CURB_WIDTH))
// ⛔ SO A TREELAWN THE SURVEY EVIDENCED CAN BE CRUSHED TO EXACTLY 0 BY THE ASPHALT GUESS, silently:
// when the lanes/AASHTO seed is wider than the room to the surveyed walk, `pav` is clamped flush
// and the gap the city measured disappears. Nothing errors; the map simply loses its treelawns.
// This scores that: of the sides the survey pinned, how many carry a treelawn, and how many are
// zero BECAUSE the asphalt was clamped flush rather than because the city measured no gap.
//
// ⛔ IT READS BOTH SOURCES AND RESTATES NEITHER — the constants are imported from
// `streetProfiles.js`, the formula's inputs are read back off the derived measure, and the survey
// is read raw. It cannot go stale against a change to either side.
// ⚠️ SIDE IDENTITY IS NOT JOINED BY KEY. `skeleton.js` warns that survey's `sidewalkLeft/Right` are
// point-order-relative to the ORIGINAL OSM segments and survive neither welding nor the canonical
// flip, so which physical side each lands on is re-resolved per chain. Joining by the key would
// manufacture disagreements. Each street's two values are matched to its two measured sides as
// SORTED MULTISETS (near↔near, far↔far), which is side-agnostic and reversal-proof.
// ▶ node checks/claims-the-survey-reaches-the-measure.mjs [scene]
import fs from 'fs'
import { SV_SIDEWALK, CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
import { feed } from './_proto-feed.mjs'

const scene = process.argv[2] || 'lafayette-square'
const sp = `cartograph/data/${scene}/raw/survey.json`
if (!fs.existsSync(sp)) {
  console.log(`⛔ ${scene}: no raw/survey.json — this town has NO city survey, so the join cannot be`)
  console.log(`   checked here and its ped sections are AASHTO guesses. Reported, not skipped silently.`)
  process.exit(0)
}
const survey = JSON.parse(fs.readFileSync(sp, 'utf8')).streets || {}
const f = feed(scene); if (!f) process.exit(1)

// survey distances per street name, as a sorted multiset (side-agnostic — see the note above)
const swOf = (v) => [v.sidewalkLeft, v.sidewalkRight].filter(Number.isFinite).sort((a, b) => a - b)

let sides = 0, withTL = 0, zeroClamped = 0, zeroHonest = 0, noSurvey = 0
const worst = []
for (const st of f.ribbons.streets) {
  const v = survey[st.name]; const m = st.measure
  if (!v || !m) continue
  const dists = swOf(v); if (!dists.length) continue
  const ms = ['left', 'right'].map(k => m[k]).filter(s => s && s.terminal === 'sidewalk')
  if (!ms.length) continue
  ms.sort((a, b) => (a.pavementHW + a.treelawn) - (b.pavementHW + b.treelawn))
  for (let i = 0; i < ms.length; i++) {
    const sd = ms[i], swDist = dists[Math.min(i, dists.length - 1)]
    sides++
    const swInner = swDist - SV_SIDEWALK / 2
    const room = swInner - CURB_WIDTH                 // where the asphalt would have to stop
    if (!(sd.treelawn > 0.01)) {
      // clamped ⇔ the asphalt sits flush at the room the survey left it
      if (Math.abs(sd.pavementHW - room) < 0.02 && room > 0) { zeroClamped++; worst.push({ n: st.name, sk: st.skelId, room, pav: sd.pavementHW }) }
      else zeroHonest++
    } else withTL++
  }
}
for (const st of f.ribbons.streets) if (!survey[st.name]) noSurvey++
console.log(`${scene}: ${sides} survey-pinned street-side(s) on ${Object.keys(survey).length} surveyed street(s)`)
console.log(`   carry a TREELAWN                      : ${withTL}`)
console.log(`   ⛔ treelawn 0, ASPHALT CLAMPED FLUSH  : ${zeroClamped}  ← the survey's gap, eaten by the lanes guess`)
console.log(`   treelawn 0, honestly (no room measured): ${zeroHonest}`)
console.log(`   chains with no surveyed street        : ${noSurvey}`)
if (zeroClamped) {
  const seen = new Set(), rows = worst.filter(w => !seen.has(w.n) && seen.add(w.n)).slice(0, 12)
  console.log(`\n   the clamp, street by street (asphalt half-width pinned to the room the survey left):`)
  for (const w of rows) console.log(`     ${w.name || w.n} [${w.sk}] room ${w.room.toFixed(2)} m · asphalt ${w.pav.toFixed(2)} m ⇒ treelawn 0.00`)
  console.log(`\n   ⛔ THE ASPHALT IS A GUESS (OSM lanes → AASHTO); THE SIDEWALK IS A MEASUREMENT.`)
  console.log(`   Where they conflict the guess currently wins and the measurement vanishes, with no`)
  console.log(`   warning. On a town with no operator eye that is a silently wrong cross-section.`)
} else console.log(`\n   ✅ no side has its surveyed treelawn crushed by the asphalt clamp.`)
