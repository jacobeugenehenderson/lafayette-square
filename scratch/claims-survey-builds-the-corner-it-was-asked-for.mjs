// CLAIM: every corner Survey records gets the fillet it was asked for.
//
// Jacob, 2026-09-08, on the park: "The curb is totally wrong; the survey isn't
// creating a corner so the painter can't even paint it."
// He named the STAGE. `cornerSet` is Survey's own corner structure — each entry
// carries the requested radius `vertR` and the built `fillet`. A corner whose
// fillet is ABSENT, or built well under `vertR`, is a corner the painter is
// handed nothing to paint.
//
// ⛔ Not an angle test and not a threshold of mine: it compares what the corner
// ASKED FOR against what was BUILT, both read off the same record.
//
// ⛔⛔ READ THE `① SOURCE` LINE — only lafayette-square is frozen (`ROADMAP A20`).
//
// ▶ node scratch/claims-survey-builds-the-corner-it-was-asked-for.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'

const SHORTFALL = 0.9      // built/asked below this counts as short-built

for (const scene of (process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync('cartograph/data').filter(s => fs.existsSync(`cartograph/data/${s}/clean`)))) {
  const f = feed(scene); if (!f) continue
  const tg = buildProto(f)
  const CS = tg.cornerSet || []
  if (!CS.length) { console.log(`⛔ ${scene}: build returned NO cornerSet — NOT measured`); continue }
  let none = 0, short = 0, ok = 0, noAsk = 0
  const worst = []
  for (const c of CS) {
    const asked = c.vertR
    if (!(asked > 0)) { noAsk++; continue }
    const built = c.fillet?.r
    if (!(built > 0)) { none++; worst.push({ key: c.key, asked, built: null, ratio: 0 }); continue }
    const ratio = built / asked
    if (ratio < SHORTFALL) { short++; worst.push({ key: c.key, asked: +asked.toFixed(2), built: +built.toFixed(2), ratio: +ratio.toFixed(2) }) }
    else ok++
  }
  // ⭐ THE SHAPE OF THE FAILURES. A key is `coord|streetA:side|streetB:side`. When both
  // legs are the SAME base street (its chain ordinal stripped), the "corner" is a street
  // meeting ITSELF where it continues through — the case `SKELETON §5h`'s prevailing-
  // direction overlay describes. ⛔ Reading Survey's own key, not recovering identity by
  // proximity: `cornerSet` is street-keyed because Survey is.
  const baseOf = (leg) => (leg || '').split(':')[0].replace(/-\d+$/, '')
  const sameStreet = (k) => { const p = (k || '').split('|'); return p.length >= 3 && baseOf(p[1]) !== '?' && baseOf(p[1]) === baseOf(p[2]) }
  const selfNone = worst.filter(w => w.built === null && sameStreet(w.key)).length
  const selfAll  = CS.filter(c => sameStreet(c.key)).length
  worst.sort((a, b) => a.ratio - b.ratio)
  const bad = none + short
  console.log(`\n${scene}  (look ${f.look} · ${f.slots} authored slots)`)
  console.log(`  ① SOURCE: ${tg.protoSource}`)
  console.log(`  ${CS.length} corners recorded · ${noAsk} asked for no radius`)
  console.log(`  ⇒ ${bad ? '⛔ FAIL' : '✅ PASS'}: ${none} built NO fillet at all · ${short} built under ${SHORTFALL * 100}% of the radius asked for · ${ok} built as asked`)
  console.log(`     of the ${none} with no fillet, ${selfNone} are a street meeting ITSELF (both legs one base street) — ${selfAll} such corners exist in all`)
  for (const w of worst.slice(0, 6))
    console.log(`     ${w.built === null ? 'NO FILLET' : `${w.built} m of ${w.asked} m (${(w.ratio * 100).toFixed(0)}%)`}  ${w.key}`)
}
