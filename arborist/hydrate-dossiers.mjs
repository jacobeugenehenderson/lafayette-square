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
import { resolveTerm, resolveSpecies, aliasesFor, normalize, verifyTaxon, TERM_REDIRECTS, NOT_A_TRAIT } from './vocabulary.mjs'

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
  // ⚠️ Added 2026-08-25. NCSU's fruit field was never mapped, so 18 observations sat in
  // UNMAPPED and this hydrator had never read an NCSU fruit type. `Achene` -- the term
  // Jacob just ruled into the rubric -- reaches us ONLY through here; the peer session's
  // instrument had the field and mine did not, which is why they could see a term my
  // unresolved list never mentioned.
  'Fruit Type': 'overlay.fruit_type',
  // ⚠️ Same class as 'Fruit Type', found the same way: the harvest session wired aliases
  // for chassis.density and overlay.conspicuous, and BOTH read 0/20 here because no field
  // in this map fed those axes. Their alias work was stranded — correct, and unreachable.
  // An alias is only half a mapping; the field has to arrive.
  'Foliage Porosity Summer': 'chassis.density',
  flower_showiness: 'overlay.conspicuous',
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
// ⭐⭐ `sourced: true` IS THE LINE BETWEEN MACHINE OUTPUT AND AUTHORING, and it must be on
// EVERY machine write. "The override is the product" is about the OPERATOR's decisions; a
// scraped value is not an override, and treating it as one makes every machine error
// permanent and self-protecting. mint-dossiers.mjs already stamps this; hydrate did not,
// so its own bad writes could never be re-derived.
// ⛔⛔ A SCRAPED VALUE IS NEVER HARD. Jacob's "hard for identity axes" ruling governs what
// an AUTHORED dossier asserts; applying it to unratified machine output turns a database
// guess into a tol-0 constraint. That is what made the bad `erect → columnar` alias fatal
// rather than merely wrong: quercus_rubra could only ever match a columnar chassis. 18
// cells were written hard this way.
// mint-dossiers.mjs already had this right -- soft, with `owedHardness` naming the
// promotion as the authoring step. Two scripts writing the same dossiers under opposite
// rules is its own defect; hydrate now follows mint.
const spec = (axis, target) => {
  const scalar = axisKind.get(axis) === 'scalar'
  const cell = { target, hardness: 'soft', tol: scalar ? 0.4 : 1, sourced: true }
  if (HARD.has(axis)) cell.owedHardness = 'identity axis — author must confirm and promote to hard'
  return cell
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
let rederived = 0, taxonDropped = 0
// ⛔⛔ PER-SOURCE TAXON GATE. hydrate had NONE — mint got one and hydrate did not, purely
// because mint was where the Elm/Ulmus case surfaced. Batch 2 produced the live instance
// the moment it ran: SelecTree answered a `Sorbus americana` query with `Sorbus decora`
// (showy mountain-ash, a different species) and emitted its traits anyway behind a warning
// flag. mint refuses that species, so nothing reached a dossier — but only because no
// dossier existed yet. Containment by accident is not containment.
//
// Drop every observation from a (species, source) pair whose `_matched_taxon` does not
// verify against that species' `_taxon_queried`. Reported, never silent.
const queried = new Map()          // species -> queried binomial
const rejectedSources = new Map()  // "species|source" -> reason
for (const o of obs) if (o.field === '_taxon_queried') queried.set(o.species, o.value)
for (const o of obs) {
  if (o.field !== '_matched_taxon') continue
  const q = queried.get(o.species)
  if (!q) continue
  const v = verifyTaxon(q, o.value)
  if (v.match === 'mismatch') rejectedSources.set(`${o.species}|${o.source}`, `${o.source} answered "${v.returned}" — ${v.reason}`)
}

const unresolved = new Map()   // "axis :: rawvalue" -> count
const discarded = new Map()    // "axis :: rawvalue (reason)" -> count
const unmapped = new Map()     // source field -> count
const conflicts = []
const pending = new Map()      // file -> { [axis]: spec }
const tally = new Map()        // file -> axis -> value -> votes
const ties = []
const noDossier = new Set()
let applied = 0, skippedAuthored = 0

for (const o of obs) {
  if (IGNORE.has(o.field)) continue
  if (rejectedSources.has(`${o.species}|${o.source}`)) { taxonDropped++; continue }
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
  // ⛔ A FILLED CELL IS NOT AUTOMATICALLY THE OPERATOR'S. This used to `continue` on any
  // non-null target, so a wrong MACHINE value protected itself forever: correcting the bad
  // `erect → columnar` alias could not undo the `columnar` it had already written into
  // quercus_rubra, and the cells had to be cleared by hand. `sourced` distinguishes them --
  // machine output is re-derivable, authored values are untouchable.
  if (existing && existing.target != null && !existing.sourced) {
    if (String(existing.target) !== String(target)) {
      conflicts.push(`${file}  ${axis}  authored="${existing.target}"  ${o.source} says "${target}"`)
    }
    continue                                   // ⛔ the operator's value stands, always
  }
  // A sourced cell ALWAYS re-derives. Skipping when only the target matched left 11 cells
  // carrying the old `hardness: hard` after that rule was corrected -- the value was right
  // and the constraint was still wrong.
  if (existing && existing.sourced) rederived++

  // ⛔⛔ FIRST-WRITER-WINS DISCARDED THE MAJORITY. Habit and shape are MULTI-SELECT at the
  // source -- NCSU returned five habits for green ash in one record -- so whichever value
  // happened to appear first in the JSONL won. Red oak's sources say Rounded x2, Conical
  // x1; hydrate wrote `conical`, purely on line order.
  // Tally instead, and take the plurality. ⛔ NO PLURALITY, NO TARGET -- the same rule
  // mint-dossiers.mjs already ships. This is not a new selection policy: it is the rule
  // the sibling script committed, applied to a path that had none.
  // ▶ Any ranking BEYOND plurality (source priority, trusting NCSU over USDA) is Jacob's
  //   ruling and is deliberately NOT made here.
  if (!tally.has(file)) tally.set(file, new Map())
  const perFile = tally.get(file)
  if (!perFile.has(axis)) perFile.set(axis, new Map())
  const votes = perFile.get(axis)
  if (!votes.has(target)) votes.set(target, new Set())
  votes.get(target).add(o.source)
  ;(perAxis.get(axis) || perAxis.set(axis, new Set()).get(axis)).add(sp)
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
if (rejectedSources.size) {
  console.log(`\n⛔ ${rejectedSources.size} SOURCE(S) REJECTED ON TAXON — ${taxonDropped} observation(s) dropped:`)
  for (const [k, why] of rejectedSources) console.log(`   ${k.split('|')[0]}: ${why}`)
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

// ⭐⭐ PUBLISH THE DISAGREEMENT; THE OPERATOR SETTLES IT (Jacob, 2026-08-25).
//
// Sources disagree constantly -- NCSU's Habit/Form is multi-select and returned five
// habits for green ash in one record -- and none of the obvious rules is honest. Taking
// the most frequent invents a consensus that does not exist. Ranking by source priority
// asserts an authority we have not established. Writing nothing leaves the operator an
// EMPTY CELL that looks identical to "nobody has scraped this yet", which is the silent
// substitution this kit exists to refuse.
//
// So the disagreement itself is the artifact. Every candidate is written with the sources
// that claimed it, the cell is marked `contested`, and it renders in the Salon for the
// operator to settle. Settling it is authoring: the operator's pick drops `sourced` and
// the cell stops being ours.
//
// ⛔ A tie still writes NO TARGET -- but it now writes the CANDIDATES, which is the part
// that was missing. Empty-and-silent was the defect, not empty.
for (const [file, perAxis2] of tally) {
  for (const [axis, votes] of perAxis2) {
    const ranked = [...votes].sort((a, b) => b[1].size - a[1].size)
    const candidates = ranked.map(([value, srcs]) => ({ value, seen: srcs.size, sources: [...srcs].sort() }))
    const tied = ranked.length > 1 && ranked[0][1].size === ranked[1][1].size
    const contested = ranked.length > 1

    if (!pending.has(file)) pending.set(file, {})
    const cell = spec(axis, tied ? null : ranked[0][0])
    if (contested) {
      cell.contested = true
      cell.candidates = candidates
      cell.settle = tied
        ? 'sources tie — no target. Pick one in the Salon; that pick is authoring.'
        : 'plurality shown as target, but sources disagree. Confirm or pick another.'
    }
    if (tied) ties.push(`${file}  ${axis}  ${candidates.map(c => `${c.value} (${c.sources.join('+')})`).join(' / ')}`)
    pending.get(file)[axis] = cell
    applied++
  }
}
if (ties.length) {
  console.log(`\n⚖️  ${ties.length} TIED AXIS/AXES — no target written, candidates PUBLISHED for the operator:`)
  for (const t of ties) console.log(`   ${t}`)
}

console.log('')
if (!WRITE) { console.log(`DRY RUN — would set ${applied} cell(s) across ${pending.size} dossier(s). Re-run with --write.`); process.exit(0) }
for (const [file, add] of pending) {
  const p = path.join(dDir, file); const d = rd(p)
  d.required = { ...(d.required || {}), ...add }
  d.provenance = { ...(d.provenance || {}), hydratedAt: '2026-08-24', hydratedAxes: Object.keys(add) }
  writeFileSync(p, JSON.stringify(d, null, 2) + '\n')
}
console.log(`✅ wrote ${applied} cell(s) across ${pending.size} dossier(s).` +
  (rederived ? `  (${rederived} re-derived over prior MACHINE values; authored cells untouched)` : ''))
console.log('▶ node scratch/claims-axis-keys-resolve.mjs   — confirm no key went stale')
