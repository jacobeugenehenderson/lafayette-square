// claims-sky-follows-its-town.mjs — IS THE SKY PAINTED ON THIS TOWN'S SCHEDULE?
//
// ⭐ THE INVARIANT: the 4 × 24 × 5 seasonal colour table is sampled at the HOST MAP's
// lat/lon, never at one privileged town's. Jacob, 2026-09-20: "the sky should be set to
// the lat long of its host map, another place where LS is totally inappropriate."
//
// The defect it models (BRIEF-ls-bleed-excision site 6): ANCHOR_CARDS was 118 lines of
// checked-in hex, generated once at Lafayette Square's 38.6160/-90.2161 and shipped to
// every town. The SUN was already right everywhere — CelestialBodies computes it from
// INSTANCE.geography — so the sky stood in the correct place while being PAINTED on
// St. Louis's schedule. In Łódź the sun set ~90 min before the dome darkened.
//
// ⛔ THE REGRESSION THIS EXISTS TO CATCH is not "somebody deleted the feature" — it is
// somebody reintroducing a constant. Three ways that happens, and all three fail here:
//   ① the derivation stops depending on latitude at all (towns collapse to one table)
//   ② the derivation drifts so LS's own sky changes above the horizon (the retired constant is the oracle)
//   ③ a hemisphere is handled by a northern assumption
//
//   node checks/claims-sky-follows-its-town.mjs
// Read-only. Exits 1 on any failure.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import SunCalc from 'suncalc'
import { buildAnchorCards, standardUtcOffsetHours, SKY_SEASONS } from '../cartograph/proceduralSky.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BANDS = ['horizon', 'low', 'mid', 'high', 'sunGlow']
const cells = (c) => SKY_SEASONS.flatMap(s => c[s].flatMap(h => BANDS.map(b => h[b])))
const diff = (a, b) => { const x = cells(a), y = cells(b); return x.filter((v, i) => v !== y[i]).length }

let failed = 0
const fail = (m) => { console.log(`  ⛔ ${m}`); failed++ }

// ── ① THE ORACLE, AND IT IS READ, NEVER TYPED. The 480 values that shipped from
//    2026-05-20 until site 6 are archived verbatim in the Diary; this imports them and
//    compares ALL of them. ⛔ I first wrote this with nine hand-transcribed samples and
//    six of the nine were wrong — the check failed against MY TYPING, not against the
//    code. That is `CLAUDE.md`'s "never write the explanation of a number" in miniature,
//    and the fix is the repo's standing rule: A CHECK MUST READ THE SOURCE, NEVER RESTATE IT.
// ⛔ Do not regenerate the archived file to make this pass. Its whole value is that it
//    predates the change; if it stops matching, LS's sky MOVED.
const ORACLE_PATH = '../cartograph/_archive/skyGrid-anchor-cards-LS-static-2026-09-20.mjs'
const LS = { lat: 38.6160, lon: -90.2161, tzOffset: -6 }
if (!existsSync(join(ROOT, 'cartograph/_archive/skyGrid-anchor-cards-LS-static-2026-09-20.mjs')))
  throw new Error('⛔ the archived anchor-card oracle is missing — LS cannot be proven unmoved. NOT CHECKED.')
const { ANCHOR_CARDS_PROCEDURAL: ORACLE } = await import(ORACLE_PATH)
const lsCards = buildAnchorCards(SunCalc, LS.lat, LS.lon, LS.tzOffset)
// ⭐ The oracle holds wherever the sun is above −1.1° (−0.02 rad). Below it the ladder was DELIBERATELY re-cut on
// 2026-09-27 — the blue hour holds through nautical twilight and night is reached at −18°, not −6.9° (Jacob's ruling,
// BRIEF-tod-kit-default) — so those cells are checked for that property instead of against the retired constant.
const REF = { winter: [2026, 11, 21], spring: [2026, 2, 20], summer: [2026, 5, 21], autumn: [2026, 8, 22] }
const altAt = (season, h) => { const [y, m, d] = REF[season]
  return SunCalc.getPosition(new Date(Date.UTC(y, m, d, h - LS.tzOffset)), LS.lat, LS.lon).altitude }
let drift = 0, reCut = 0
for (const s of SKY_SEASONS) for (let h = 0; h < 24; h++) {
  const alt = altAt(s, h)
  for (const b of BANDS) {
    if (lsCards[s][h][b] === ORACLE[s][h][b]) continue
    if (alt < -0.02 && b !== 'sunGlow') { reCut++; continue }
    drift++
    if (drift < 6) console.log(`       ${s} ${String(h).padStart(2, '0')}:00 ${b} (sun ${(alt * 180 / Math.PI).toFixed(1)}°): ${ORACLE[s][h][b]} → ${lsCards[s][h][b]}`)
  }
}
if (drift) fail(`LS's sky MOVED above −1.1°: ${drift} cells differ from the constant that shipped for 16 months.`)
else console.log(`✅ LS reproduces the retired constant on every cell with the sun above −1.1° (${reCut} twilight cells re-cut by the 2026-09-27 blue-hour ladder).`)
// The re-cut's own property: a cell below −18° is night; a cell in nautical twilight (−12°…−6°) is NOT night yet.
{
  const night = lsCards.summer.find((_, h) => altAt('summer', h) < -0.35)
  const naut = SKY_SEASONS.flatMap(s => lsCards[s].filter((_, h) => { const a = altAt(s, h); return a < -0.105 && a > -0.209 }))
  if (!night) fail('no LS summer hour below −18° to test the night end of the ladder')
  if (!naut.length) console.log('   (no LS hour lands in nautical twilight on the four reference days — blue-hour cell not sampled)')
  else if (naut.every(c => c.high === night.high)) fail('nautical-twilight cells are already night — the blue hour is gone')
  else console.log(`✅ the blue hour holds in nautical twilight (${naut.length} cell(s) not yet night)`)
}

// ── ② EVERY POURED TOWN GETS ITS OWN SKY. Derived from what is on disk, never a list.
const dataDir = join(ROOT, 'cartograph', 'data')
const scenes = readdirSync(dataDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(dataDir, d.name, 'geography.json')))
  .map(d => d.name).sort()
if (!scenes.length) throw new Error('⛔ no scene carries geography.json — NOT CHECKED.')

console.log(`\n${scenes.length} poured town(s), each sampled at its OWN coordinates:`)
for (const s of scenes) {
  const g = JSON.parse(readFileSync(join(dataDir, s, 'geography.json'), 'utf8'))
  if (typeof g.lat !== 'number' || typeof g.lon !== 'number' || !g.timezone) {
    fail(`${s}: geography.json lacks lat/lon/timezone — its sky cannot be placed`); continue
  }
  const off = standardUtcOffsetHours(g.timezone)
  const d = diff(buildAnchorCards(SunCalc, g.lat, g.lon, off), lsCards)
  const isLS = Math.abs(g.lat - LS.lat) < 1e-4 && Math.abs(g.lon - LS.lon) < 1e-4
  const verdict = isLS ? (d === 0 ? '✅ identical (it IS Lafayette Square)' : `⛔ LS differs from itself by ${d}`)
                       : (d > 0 ? `✅ ${d}/480 cells differ from LS` : '⛔ IDENTICAL TO LS — its latitude is not reaching the sky')
  if (verdict.startsWith('⛔')) failed++
  console.log(`  ${s.padEnd(26)} lat ${String(g.lat).padEnd(10)} ${g.timezone.padEnd(20)} ${verdict}`)
}

// ── ③ THE SOUTHERN HEMISPHERE. No install is south yet, which is exactly why this is a
//    check and not an observation: the first one must not arrive to a northern sky.
//    Sydney's December (their summer) must match a northern summer of the same sun.
const syd = buildAnchorCards(SunCalc, -33.87, 151.21, 10)
if (syd.winter[12].mid !== lsCards.summer[12].mid)
  fail(`southern summer (Sydney, Dec) ${syd.winter[12].mid} ≠ northern summer ${lsCards.summer[12].mid} — the tint did not flip`)
if (syd.summer[12].mid === lsCards.summer[12].mid)
  fail('southern JUNE is painted as summer — the hemisphere flip is not applied')
console.log(`\n③ southern hemisphere: Sydney Dec noon ${syd.winter[12].mid} vs LS Jun noon ${lsCards.summer[12].mid}` +
  (failed ? '' : '  ✅ same sun, same tint'))

// ── ④ THE OFFSET IS DERIVED, NOT TABULATED. A half-hour zone and a southern zone are
//    the two shapes a hardcoded map always gets wrong.
for (const [tz, want] of [['America/Chicago', -6], ['Asia/Kolkata', 5.5], ['Australia/Sydney', 10], ['UTC', 0]]) {
  const got = standardUtcOffsetHours(tz)
  if (got !== want) fail(`standardUtcOffsetHours('${tz}') = ${got}, want ${want}`)
}

console.log(failed ? `\n⛔ FAIL — ${failed} problem(s).` : '\n✅ PASS — every town\'s sky is sampled at its own lat/lon; LS is unmoved above the horizon.')
process.exit(failed ? 1 : 0)
