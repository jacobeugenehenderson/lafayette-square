/**
 * rename-chassis-to-form.mjs — a chassis is a FORM, not a species.
 *
 * ⭐ Jacob, 2026-08-25: "strip the names from the chassises such that they aren't species
 * specific anymore after the native instantiation; it's just 'oval'."
 *
 * ⛔ THE DEFECT THIS FIXES. A chassis is named for the species it was de-leafed FROM, so
 * every consumer has to answer "is `maple_sugar` an asset or a species?" — a question that
 * should not exist. It broke the bake's eligibility gate three times in one afternoon
 * (resolving `maple_sugar` to a cultivar row, then to Maple, Norway, both red, both
 * silently dropping a green species). And it makes CORRECT compositions read as mistakes:
 * `ash_green → white_oak_a` is a green ash using an oval chassis, which is exactly right
 * and looks exactly wrong.
 *
 * ⛔ PROVENANCE IS NOT DISCARDED — it moves. The species a chassis was derived from is a
 * real fact and stays in `derivedFrom`; it just stops being the identity.
 *
 * ⛔ ONLY chassis with a HABIT are renamed. The 85 in `_unassigned/` are not forms yet —
 * renaming them `unassigned_NN` would assert a form we have not determined. They keep
 * their names until tagged, which is honest and reversible.
 *
 *   node scratch/rename-chassis-to-form.mjs            # dry run
 *   node scratch/rename-chassis-to-form.mjs --write
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'node:fs'
import path from 'node:path'

const WRITE = process.argv.includes('--write')
const ROOT = path.join(import.meta.dirname, '..')
const PART_INDEX = path.join(ROOT, 'arborist/state/part-index.json')
const LIB = path.join(ROOT, 'public/library/chassises')

const pi = JSON.parse(readFileSync(PART_INDEX, 'utf8'))
const chassis = (pi.parts || []).filter(p => p.partType === 'chassis')

// form id: <habit>_<nn>, stable and collision-free within a habit. Ordered by the CURRENT
// id so a re-run produces identical names — ⛔ a rename that renumbers on every run would
// make every downstream reference a moving target.
const byHabit = new Map()
for (const p of [...chassis].sort((a, b) => String(a.partId).localeCompare(String(b.partId)))) {
  const h = p.tags?.['chassis.habit']?.value
  if (!h) continue
  if (!byHabit.has(h)) byHabit.set(h, [])
  byHabit.get(h).push(p)
}

const rename = new Map()          // oldId -> newId
for (const [habit, list] of byHabit) {
  list.forEach((p, i) => rename.set(p.partId, `${habit}_${String(i + 1).padStart(2, '0')}`))
}

console.log(`chassis: ${chassis.length}   with a habit: ${rename.size}   unassigned (kept): ${chassis.length - rename.size}`)
console.log('')
for (const [habit, list] of byHabit) {
  console.log(`  ${habit} (${list.length})`)
  for (const p of list.slice(0, 3)) console.log(`     ${String(p.partId).padEnd(34)} → ${rename.get(p.partId)}`)
  if (list.length > 3) console.log(`     …and ${list.length - 3} more`)
}

// ── every reference site, found rather than assumed ──────────────────────────
const compRefs = []
const stateDir = path.join(ROOT, 'arborist/state')
for (const d of readdirSync(stateDir)) {
  const p = path.join(stateDir, d, 'compositions.json')
  if (!existsSync(p)) continue
  const j = JSON.parse(readFileSync(p, 'utf8'))
  const list = Array.isArray(j) ? j : (j.compositions || [])
  for (const c of list) if (c.chassis && rename.has(c.chassis)) compRefs.push({ file: p, species: d, from: c.chassis, to: rename.get(c.chassis) })
}
console.log(`\ncompositions to repoint: ${compRefs.length}`)
for (const r of compRefs) console.log(`   ${r.species.padEnd(20)} ${r.from.padEnd(32)} → ${r.to}`)

// library dirs
const libMoves = []
if (existsSync(LIB)) {
  for (const habitDir of readdirSync(LIB)) {
    const hp = path.join(LIB, habitDir)
    try { readdirSync(hp) } catch { continue }
    for (const id of readdirSync(hp)) {
      if (!rename.has(id)) continue
      libMoves.push({ from: path.join(hp, id), to: path.join(hp, rename.get(id)), id, next: rename.get(id) })
    }
  }
}
console.log(`\nlibrary directories to move: ${libMoves.length}`)

if (!WRITE) { console.log('\nDRY RUN — re-run with --write.'); process.exit(0) }

// ── apply ────────────────────────────────────────────────────────────────────
for (const p of chassis) {
  const next = rename.get(p.partId)
  if (!next) continue
  p.derivedFrom = p.derivedFrom || p.partId      // ⛔ provenance moves, never disappears
  p.partId = next
}
writeFileSync(PART_INDEX, JSON.stringify(pi, null, 2) + '\n')

for (const r of compRefs) {
  const j = JSON.parse(readFileSync(r.file, 'utf8'))
  const list = Array.isArray(j) ? j : (j.compositions || [])
  for (const c of list) if (c.chassis === r.from) { c.derivedFrom = c.derivedFrom || c.chassis; c.chassis = r.to }
  writeFileSync(r.file, JSON.stringify(j, null, 2) + '\n')
}

for (const m of libMoves) {
  if (!existsSync(m.from) || existsSync(m.to)) continue
  renameSync(m.from, m.to)
  const meta = path.join(m.to, 'meta.json')
  if (existsSync(meta)) {
    const j = JSON.parse(readFileSync(meta, 'utf8'))
    j.derivedFrom = j.derivedFrom || j.id || m.id
    j.id = m.next
    writeFileSync(meta, JSON.stringify(j, null, 2) + '\n')
  }
}
console.log(`\n✅ renamed ${rename.size} chassis · repointed ${compRefs.length} composition(s) · moved ${libMoves.length} director(ies)`)
