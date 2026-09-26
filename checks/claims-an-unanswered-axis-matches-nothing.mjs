// claims-an-unanswered-axis-matches-nothing.mjs — WHEN A SPECIES HAS NO ANSWER ON AN AXIS, DOES ANY PART "MATCH" IT?
//
// A dossier axis with `target: null` means the sources tied or nobody spoke. Until 2026-09-25
// matcher.js compared that null as a value: `null <= tol` is true in JS and closeness came out
// 1, so every tagged part scored a PERFECT match on an axis the species never answered, and
// readiness counted it (39 of 114 dossier×plate workable counts were inflated, e.g. white oak's
// leaf 15 → 0). This reads every real dossier and every real part and asks the real matcher.
//
// ▶ MUTATION-TEST IT: in matcher.js compareAxis, delete the `reqSpec.target == null` branch → RED.
//
//   node checks/claims-an-unanswered-axis-matches-nothing.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { matchOne } from '../arborist/matcher.js'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rubric = JSON.parse(fs.readFileSync(path.join(REPO, 'arborist/rubric.json'), 'utf8'))
const parts = JSON.parse(fs.readFileSync(path.join(REPO, 'arborist/state/part-index.json'), 'utf8')).parts
const dir = path.join(REPO, 'arborist/dossiers')
let tested = 0
const bad = []
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  for (const p of parts) for (const x of matchOne(rubric, d, p).perAxis) {
    if (x.required != null || x.actual == null) continue
    const kind = (rubric.axes.find(a => a.id === x.axis) || {}).kind
    if (kind === 'band' || kind === 'dual' || kind === 'curve') continue
    tested++
    if (x.withinTol || x.closeness > 0) bad.push(`${f.replace('.json', '')} · ${x.axis} · ${p.partId} (closeness ${x.closeness})`)
  }
}
if (!tested) { console.log('⛔ FAIL — no unanswered axis met a tagged part; the check tested nothing'); process.exit(1) }
if (bad.length) {
  console.log(`⛔ FAIL — ${bad.length} of ${tested} unanswered-axis comparisons scored as a match, e.g.`)
  for (const b of bad.slice(0, 5)) console.log(`   ${b}`)
  process.exit(1)
}
console.log(`✅ PASS — ${tested} comparisons against an unanswered axis; none scored as a match`)
