// claims-revert-field-coverage.mjs — CAN THE OPERATOR GET BACK?
//
// ⭐ THE INVARIANT: every field the authoring tools can WRITE into `blockCustoms`
// must be CLEARABLE by some "Revert to Default". A field in neither revert list
// is authored-but-unrevertable: the operator makes a gesture, clicks Revert, the
// tool reports success, and the gesture silently survives. The scene then claims
// to be at the calculated default and is not — Layer 0 q2, inside the one control
// whose whole promise is "you are now at default".
//
// This is the CLASS, not the instance. `capFlip` was the instance (found
// 2026-08-06, LS, 5 flipped caps outliving a whole-scene revert). The next field
// somebody adds gets caught here instead of after a day of "revert did nothing".
//
// ⛔ The lists are PARSED FROM SOURCE, never restated here — a second copy of the
// formula is how they drift apart, which is the same reason feCustomKey is a
// single helper.
//
//   node scratch/claims-revert-field-coverage.mjs
// Read-only. Exits 1 on an orphaned field.
import fs from 'fs'
import path from 'path'

const STORE = 'src/cartograph/stores/useCartographStore.js'
const src = fs.readFileSync(STORE, 'utf8')

const listOf = (name) => {
  const m = src.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`))
  if (!m) throw new Error(`⛔ could not parse ${name} from ${STORE} — the guard is blind; fix the parse before trusting a PASS`)
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

const survey = listOf('_SURVEY_FE_FIELDS')
const section = listOf('_SECTION_FE_FIELDS')
const covered = new Set([...survey, ...section])

console.log(`revert scopes, parsed from ${STORE}:`)
console.log(`  SURVEY : ${survey.join(', ')}`)
console.log(`  SECTION: ${section.join(', ')}`)

// Every field actually present in any scene's authored state.
const looks = fs.readdirSync('public/looks').filter(d => fs.existsSync(path.join('public/looks', d, 'design.json')))
const seen = new Map()   // field -> [{scene, count}]
for (const look of looks) {
  const d = JSON.parse(fs.readFileSync(path.join('public/looks', look, 'design.json'), 'utf8'))
  const bc = d.blockCustoms || {}
  const local = new Map()
  for (const sides of Object.values(bc)) for (const ords of Object.values(sides)) for (const slot of Object.values(ords))
    for (const f of Object.keys(slot)) local.set(f, (local.get(f) || 0) + 1)
  for (const [f, n] of local) {
    if (!seen.has(f)) seen.set(f, [])
    seen.get(f).push(`${look}×${n}`)
  }
}

console.log(`\nfields found in authored state across ${looks.length} scenes:`)
const orphans = []
for (const [f, where] of [...seen].sort()) {
  const scope = section.includes(f) ? 'SECTION' : survey.includes(f) ? 'SURVEY' : null
  console.log(`  ${scope ? '✅ ' + scope.padEnd(7) : '⛔ ORPHAN'}  ${f.padEnd(14)} ${where.join('  ')}`)
  if (!scope) orphans.push({ f, where })
}

if (orphans.length) {
  console.log(`\n⛔ FAIL — ${orphans.length} authored field(s) NO revert path clears:`)
  for (const o of orphans) console.log(`   ${o.f}  (${o.where.join(', ')})`)
  console.log(`\n   The operator can create these and cannot get back. Either add the field to`)
  console.log(`   _SURVEY_FE_FIELDS / _SECTION_FE_FIELDS in ${STORE}, or, if it is`)
  console.log(`   deliberately permanent, make the tool SAY SO — silence is the defect.`)
  process.exit(1)
}
console.log(`\n✅ PASS — every authored field is clearable by some revert.`)
console.log(`⚠️ Scope note: this proves a field is IN a revert list. It does not prove the`)
console.log(`   gesture to reach that revert exists — a cap has no per-cap revert (⌃-click`)
console.log(`   on a cap IS the flip), so it is reachable only by the whole-scene button.`)
