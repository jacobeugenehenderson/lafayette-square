/**
 * hydrate-dossiers.mjs — turn the pilot's RAW observations into dossier `required` blocks.
 *
 * The agent emits raw source values and never writes a dossier (BRIEF-dossier-hydration.md §0).
 * This is the other half: it decides what a raw value MEANS, using `vocabulary.mjs` and nothing
 * else. ⭐ That split is what makes the no-heuristics rule structural — an unmappable term
 * cannot become a wrong token, because the only thing that can mint a token is the resolver.
 *
 *   node arborist/hydrate-dossiers.mjs                 # DRY RUN — reports, writes nothing
 *   node arborist/hydrate-dossiers.mjs --write         # write the dossiers
 *   node arborist/hydrate-dossiers.mjs --in path.jsonl
 *
 * ⛔ NEVER overwrites an authored value. An existing cell is the operator's; a source that
 * disagrees is REPORTED as a conflict, never applied. Rook, 2026-08-24.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { resolveTerm, resolveSpecies, aliasesFor, normalize, TERM_REDIRECTS, NOT_A_TRAIT } from './vocabulary.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
// ⚠️ `indexOf` returns -1 when the flag is absent and -1 + 1 is 0, so the old form read
// args[0] -- which on a real run is `--write`. Dry runs pass no positional argument, so
// this looked correct every single time until the one invocation that mattered.
const inFlag = args.indexOf('--in')
const IN = (inFlag >= 0 ? args[inFlag + 1] : null) || 'scratch/dossier-raw-observations.jsonl'
if (inFlag >= 0 && !IN) { console.error('⛔ --in given with no path'); process.exit(1) }
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'))

// ── source field → our axis ─────────────────────────────────────────────────
// ⛔ EXPLICIT AND EXHAUSTIVE ON PURPOSE. A field with no entry here is NOT dropped — it is
// reported as UNMAPPED, because it is either a surplus trait worth an axis or a mapping I
// missed, and both are findings. Silence would lose them.
const FIELD_MAP = {
  // ⭐ KEYED ON THE FIELD NAMES ACTUALLY OBSERVED IN THE JSONL, not on labels copied from a
  // brief. My first cut invented `habit`/`leaf_shape`/`bark_attachment`; the real data says
  // `Habit/Form`, `Leaf Shape`, `Surface/Attachment`, and the resolve rate was ~0 as a result.
  // That is exactly the trap TRAIT-SURVEY-FINDINGS flagged: "key on field_key, never a copied
  // label." ▶ re-derive with:
  //   node -e "…split the jsonl, count by source+field…"   (see the commit message)

  // ── NC State ──
  'Habit/Form': 'chassis.habit',
  'Leaf Shape': 'leaf.shape',
  'Leaf Margin': 'leaf.margin',
  'Leaf Arrangement': 'leaf.arrangement',
  'Surface/Attachment': 'bark.texture',
  'Texture': 'crown.texture',
  'Plant Type': 'leaf.foliage_type',
  'Dimensions': 'chassis.size',
  // ── SelecTree ──
  bark_texture: 'bark.texture',
  tree_shape: 'chassis.habit',
  leaf_form: 'leaf.type',
  leaflet_shape: 'leaf.shape',
  leaf_arrangement: 'leaf.arrangement',
  foliage_type: 'leaf.foliage_type',
  fruit_type: 'overlay.fruit_type',
  height_high: 'chassis.size',
  // ── USDA PLANTS ──
  'Growth Form': 'chassis.habit',
  'Shape and Orientation': 'chassis.habit',
  'Foliage Texture': 'crown.texture',
  'Leaf Retention': 'leaf.foliage_type',
  'Height, Mature (feet)': 'chassis.size',
  // ── Urban Tree Database ──
  crown_base_height: 'crown.base_height',
  crown_ratio: 'crown.ratio',
}
// Harvest bookkeeping — not traits. Ignored silently so the UNMAPPED report stays signal.
const IGNORE = new Set(['_matched_taxon', '_taxon_queried', 'family'])
// ⛔ AUTHORED, never hydrated (BRIEF §2). A value found for one of these is a coincidence.
const AUTHORED = new Set([
  'leaf.growthway', 'leaf.face', 'leaf.occupancy', 'bark.color',
  'bark.groove_depth', 'bark.plate_size', 'bark.scale_frequency', 'bark.exfoliation_density',
])
// Jacob's ruling 2026-08-24: hard for the IDENTITY axes, soft for the rest.
const HARD = new Set(['leaf.type', 'leaf.shape', 'chassis.habit'])

const rubric = rd(path.join(ROOT, 'arborist/rubric.json'))
const axisKind = new Map(rubric.axes.map(a => [a.id, a.kind]))
const spec = (axis, target) => {
  const hard = HARD.has(axis)
  const scalar = axisKind.get(axis) === 'scalar'
  return { target, hardness: hard ? 'hard' : 'soft', tol: hard ? 0 : (scalar ? 0.4 : 1) }
}

// ── load observations ───────────────────────────────────────────────────────
const inPath = path.join(ROOT, IN)
if (!existsSync(inPath)) { console.error(`⛔ no observations at ${IN} — has the pilot finished?`); process.exit(1) }
const obs = readFileSync(inPath, 'utf8').split('\n').filter(Boolean).map((l, i) => {
  try { return JSON.parse(l) } catch { console.error(`  ⚠️ line ${i + 1} is not JSON — skipped`); return null }
}).filter(Boolean)
console.log(`observations: ${obs.length}  from ${new Set(obs.map(o => o.source)).size} source(s)`)

// ── index dossiers by every alias so a species finds its own file ───────────
const dDir = path.join(ROOT, 'arborist/dossiers')
const fileFor = new Map()
for (const f of readdirSync(dDir).filter(x => x.endsWith('.json'))) {
  const d = rd(path.join(dDir, f))
  for (const n of [d.key, d.canonicalId, d.scientific, f.replace(/\.json$/, ''), ...(d.inventoryNames || [])])
    if (n) fileFor.set(normalize(n), f)
}

// ── resolve ─────────────────────────────────────────────────────────────────
const perAxis = new Map()      // axis -> Set(species) that got a value
const unresolved = new Map()   // "axis :: rawvalue" -> count
const discarded = new Map()    // "axis :: rawvalue (reason)" -> count
const unmapped = new Map()     // source field -> count
const conflicts = []
const pending = new Map()      // file -> { [axis]: spec }
const noDossier = new Set()
let applied = 0, skippedAuthored = 0

for (const o of obs) {
  if (IGNORE.has(o.field)) continue
  let axis = FIELD_MAP[o.field]
  if (!axis) { unmapped.set(o.field, (unmapped.get(o.field) || 0) + 1); continue }

  // ⛔ NOT A TRAIT — a value carrying no morphology under a heading we mapped. Counted
  // and printed, never silently dropped: that report is how a MISMAPPED FIELD surfaces.
  const nv = normalize(o.value)
  const why = NOT_A_TRAIT[axis]?.[nv]
  if (why) { const k = `${axis} :: ${o.value}  (${why})`; discarded.set(k, (discarded.get(k) || 0) + 1); continue }

  // ⭐ VALUE-LEVEL AXIS REDIRECT — the value, not the field, decides the axis.
  let forced = null
  const redir = TERM_REDIRECTS[axis]?.[nv]
  if (redir) { axis = redir.axis; forced = redir.value }

  if (AUTHORED.has(axis)) { skippedAuthored++; continue }
  if (!axisKind.has(axis)) { console.error(`  ⛔ FIELD_MAP points at "${axis}", which is not a live rubric axis`); continue }

  let target = null
  if (axisKind.get(axis) === 'scalar') {
    const n = parseFloat(String(o.value).replace(/[^\d.-]/g, ''))
    target = Number.isFinite(n) ? n : null
  } else {
    if (forced != null) { target = forced }
    else { const r = resolveTerm(axis, o.value); target = r.resolved ? r.value : null }
  }
  if (target == null) {
    const k = `${axis} :: ${o.value}`
    unresolved.set(k, (unresolved.get(k) || 0) + 1)
    continue
  }

  const sp = resolveSpecies(o.species).value
  const file = [sp, ...aliasesFor(sp), o.species].map(normalize).map(n => fileFor.get(n)).find(Boolean)
  if (!file) { noDossier.add(sp); continue }

  const d = rd(path.join(dDir, file))
  const existing = d.required?.[axis]
  if (existing && existing.target != null && String(existing.target) !== String(target)) {
    conflicts.push(`${file}  ${axis}  authored="${existing.target}"  ${o.source} says "${target}"`)
    continue                                   // ⛔ the operator's value stands
  }
  if (existing && existing.target != null) continue   // already there, same answer

  if (!pending.has(file)) pending.set(file, {})
  pending.get(file)[axis] = spec(axis, target)
  ;(perAxis.get(axis) || perAxis.set(axis, new Set()).get(axis)).add(sp)
  applied++
}

// ── report ──────────────────────────────────────────────────────────────────
const speciesSeen = new Set(obs.map(o => resolveSpecies(o.species).value)).size
console.log(`species in file: ${speciesSeen}`)
console.log('')
console.log('RESOLVE RATE — species with a value, per axis:')
for (const a of rubric.axes.map(x => x.id)) {
  if (AUTHORED.has(a)) continue
  const n = perAxis.get(a)?.size || 0
  console.log(`  ${a.padEnd(22)} ${String(n).padStart(3)} / ${speciesSeen}${n === 0 ? '   ⛔ nothing resolved' : ''}`)
}
if (discarded.size) {
  console.log(`\n🗑  DISCARDED — not traits (${discarded.size} distinct). A big count here means a MISMAPPED FIELD:`)
  for (const [k, n] of [...discarded].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x  ${k}`)
}
if (unresolved.size) {
  console.log(`\n⛔ UNRESOLVED (${unresolved.size} distinct) — the ALIAS WORK before the corpus run:`)
  for (const [k, n] of [...unresolved].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x  ${k}`)
}
if (unmapped.size) {
  console.log(`\n⚠️ UNMAPPED FIELDS (${unmapped.size}) — surplus traits, or a mapping I missed:`)
  for (const [k, n] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x  ${k}`)
}
if (conflicts.length) {
  console.log(`\n⚠️ CONFLICTS (${conflicts.length}) — the AUTHORED value stands; nothing overwritten:`)
  for (const c of conflicts) console.log('  ' + c)
}
if (noDossier.size) console.log(`\n⚠️ NO DOSSIER for ${noDossier.size} species (create them, then re-run): ${[...noDossier].join(' · ')}`)
if (skippedAuthored) console.log(`\nskipped ${skippedAuthored} observation(s) on AUTHORED axes — correct, those are not researched`)

console.log('')
if (!WRITE) { console.log(`DRY RUN — would set ${applied} cell(s) across ${pending.size} dossier(s). Re-run with --write.`); process.exit(0) }
for (const [file, add] of pending) {
  const p = path.join(dDir, file); const d = rd(p)
  d.required = { ...(d.required || {}), ...add }
  d.provenance = { ...(d.provenance || {}), hydratedAt: '2026-08-24', hydratedAxes: Object.keys(add) }
  writeFileSync(p, JSON.stringify(d, null, 2) + '\n')
}
console.log(`✅ wrote ${applied} cell(s) across ${pending.size} dossier(s).`)
console.log('▶ node scratch/claims-axis-keys-resolve.mjs   — confirm no key went stale')
