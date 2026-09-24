// claims-a-false-map-is-not-a-fallback.mjs — IS ANY INPUT'S ABSENCE PRETENDING TO BE FINE?
//
// ⭐⭐ THE INVARIANT: an intake row whose absence produces a map that LIES may not declare
// its absence a documented fallback. Today that is the ELEVATION row, by Jacob's ruling of
// 2026-09-23; the check is written for the class so the next one cannot slip in quietly.
//
// ⛔⛔ WHY. `ABSENT.FALLBACK` means "falls back to a documented, town-NEUTRAL default" —
// OSM tags, AASHTO widths: things defensibly right in any town. The elevation row used it
// with the note "flat ground (bake-terrain.js exits)". ⭐ But flat ground is town-neutral
// only where the town is flat. Provincetown is DUNES. Baking it as a plane is not a
// degraded map, it is a FALSE one — and because the row called it a fallback, the pour ran
// `--skip-elevation`, bake-terrain exited, and the entire trace was one line in the Bake's
// `skipped` array. The operator saw a poured town, not a missing input. That is Layer 0's
// plausible-looking success, declared as policy in a data table.
//
// ⇒ Such a row must say ABSENT.REFUSES: the pour stops, and the operator may proceed only
// by recording `verifiedAbsent` on the town — a decision with a date and an author.
//
// ⭐ MUTATION TEST: set the elevation row back to ABSENT.FALLBACK and this must go RED.
//
//   node checks/claims-a-false-map-is-not-a-fallback.mjs
// Read-only. Exits 1 if a listed row declares a false map to be a fallback.
import { INTAKE_ROWS, ABSENT } from '../cartograph/intake-rows.mjs'

// ⛔ A LIST, AND IT IS NOT A SKIP LIST — it is the opposite. These are rows whose absence
// has been RULED to produce a false map rather than a poorer one. Adding to it makes the
// kit stricter; nothing here exempts anything. Each entry carries who ruled and when.
const MUST_REFUSE = [
  { id: 'elevation', why: 'a flat dune town is a false map, not a degraded one', ruledBy: 'Jacob', ruledOn: '2026-09-23' },
]

let failed = false
console.log(`checking ${MUST_REFUSE.length} row(s) whose absence would falsify the map\n`)
for (const want of MUST_REFUSE) {
  const row = INTAKE_ROWS.find(r => r.id === want.id)
  if (!row) {
    console.log(`  ⛔ row "${want.id}" no longer exists in INTAKE_ROWS — it was ruled to refuse, and now nothing does`)
    failed = true; continue
  }
  const kind = row.absent?.kind
  const ok = kind === ABSENT.REFUSES
  console.log(`  ${ok ? '✅' : '⛔'} ${row.id.padEnd(12)} absent.kind = ${kind ?? '(unset)'}   [${want.ruledBy}, ${want.ruledOn}]`)
  if (!ok) {
    console.log(`       ${want.why}`)
    console.log(`       ⛔ "${kind}" lets this town pour anyway and say nothing. Expected "${ABSENT.REFUSES}".`)
    failed = true
  }
}
if (failed) {
  console.log('\n⛔ an input whose absence falsifies the map is declared a fallback — the pour will not say so')
  process.exit(1)
}
console.log('\n✅ every input whose absence would falsify the map refuses to pour instead')
