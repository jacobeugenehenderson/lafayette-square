/**
 * dossier-resolve-rate.mjs — THE PILOT'S DELIVERABLE.
 *
 * Runs every raw observation in scratch/dossier-raw-observations.jsonl through
 * arborist/vocabulary.mjs and reports what resolves. ⛔ It NEVER writes a token
 * anywhere — it only counts. The candidate-axis table below says which AXIS a
 * source FIELD is a candidate for; the VALUES stay raw and vocabulary.mjs decides.
 *
 * ⭐ Reads the axis list from rubric.json rather than restating it (CLAUDE.md:
 * "a check must READ the source, never restate it").
 */
import { readFileSync } from 'node:fs'
import { resolveTerm, axisTerms, TERM_REDIRECTS as REDIRECTS, NOT_A_TRAIT, normalize } from '../arborist/vocabulary.mjs'

const rubric = JSON.parse(readFileSync('arborist/rubric.json', 'utf8'))
const AXES = rubric.axes.map(a => a.id)
const AUTHORED = new Set(['leaf.growthway','leaf.face','leaf.occupancy','bark.color',
  'bark.groove_depth','bark.plate_size','bark.scale_frequency','bark.exfoliation_density'])

// source field  ->  the axis it is a candidate for. Enum axes only get resolved;
// scalar/curve/dual axes are counted as "has a source number" without term resolution.
const CANDIDATE = {
  'ncsu|Habit/Form':'chassis.habit', 'selectree|tree_shape':'chassis.habit', 'usda|Shape and Orientation':'chassis.habit',
  'ncsu|Texture':'crown.texture', 'usda|Foliage Texture':'crown.texture',
  'usda|Foliage Porosity Summer':'chassis.density',
  // ⛔ HARVESTED SINCE THE FIRST RUN AND MAPPED TO NOTHING. 14 observations of USDA
  // `Growth Form` sat in the JSONL feeding no axis, so chassis.spread read
  // NO SOURCE FETCHED while the source was already in the file. An alias is only half
  // a mapping — the field has to arrive. (Rook found the mirror of this in the
  // hydrator's FIELD_MAP the same night: three axes fed by no field at all.)
  'usda|Growth Form':'chassis.spread',
  'ncsu|Woody Plant Leaf Characteristics':'leaf.foliage_type', 'selectree|foliage_type':'leaf.foliage_type',
  // ⛔ USDA 'Leaf Retention' is NOT a foliage type — it is a Yes/No boolean, and the
  // survey warns it is scored BY DEFAULT for woody plants. Mapping it here produced 14
  // phantom "No" values. USDA cannot answer this axis; that is the finding.

  'ncsu|Leaf Type':'leaf.type', 'selectree|leaf_form':'leaf.type',
  'ncsu|Leaf Shape':'leaf.shape', 'selectree|leaflet_shape':'leaf.shape',
  'ncsu|Leaf Margin':'leaf.margin',
  'ncsu|Leaf Arrangement':'leaf.arrangement', 'selectree|leaf_arrangement':'leaf.arrangement',
  'ncsu|Surface/Attachment':'bark.texture', 'selectree|bark_texture':'bark.texture',
  'ncsu|Bark Plate Shape':'bark.plate_outline',
  'ncsu|Fruit Type':'overlay.fruit_type', 'selectree|fruit_type':'overlay.fruit_type',
  'selectree|flower_showiness':'overlay.conspicuous',
  // scalar / numeric axes — a source NUMBER exists, no term resolution applies
  'ncsu|Leaf Length':'leaf.length', 'ncsu|Leaf Width':'leaf.width',
  'ncsu|Dimensions':'chassis.size', 'selectree|height_high':'chassis.size',
  'usda|Height, Mature (feet)':'chassis.size', 'utd|TreeHt_median':'chassis.size',
  'usda|Height at 20 Years, Maximum (feet)':'tree.age',
  'utd|CrnBase_median':'crown.base_height', 'utd|CrnHt_over_TreeHt_median':'crown.ratio',
}
const SCALARISH = new Set(rubric.axes.filter(a => a.kind !== 'enum' && a.kind !== 'ordinal').map(a => a.id))

const obs = readFileSync('scratch/dossier-raw-observations.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l))
const species = [...new Set(obs.map(o => o.species))]

// axis -> species -> { resolved:Set, raw:Set }
const grid = new Map()
const unresolved = new Map()   // axis -> Map(rawValue -> {n, sources:Set})
const discarded = new Map()    // same shape, for values NOT_A_TRAIT explains
const discardReason = new Map()
for (const o of obs) {
  if (String(o.field).startsWith('_')) continue
  const nominal = CANDIDATE[`${o.source}|${o.field}`]
  if (!nominal) continue
  // ⭐⭐ A VALUE CHOOSES ITS OWN AXIS, AND THE CREDIT MUST FOLLOW IT THERE.
  // vocabulary.mjs sends `Shape and Orientation :: Erect` to chassis.ORIENTATION and
  // `Leaf Shape :: Palmately-lobed` to leaf.MARGIN. Resolving against the target while
  // crediting the nominal axis — which is what this did — is worse than not following
  // the redirect at all: it credited `Erect` ×20 to chassis.habit, the single axis that
  // value must never touch, and reported chassis.orientation as NO SOURCE FETCHED while
  // 15 species had one. Both halves of the redirect, or neither.
  const rd = REDIRECTS[nominal]?.[normalize(o.value)]
  const axis = rd ? rd.axis : nominal
  if (!grid.has(axis)) grid.set(axis, new Map())
  const per = grid.get(axis)
  if (!per.has(o.species)) per.set(o.species, { resolved: new Set(), raw: new Set() })
  const cell = per.get(o.species)
  cell.raw.add(String(o.value))
  if (SCALARISH.has(axis)) { cell.resolved.add(String(o.value)); continue }
  const r = rd ? resolveTerm(rd.axis, rd.value) : resolveTerm(axis, o.value)
  if (r.resolved) cell.resolved.add(r.value)
  else {
    // ⛔ A REASONED DISCARD IS NOT OWED WORK. `Erect` is deliberately unmappable —
    // it is an orientation, and aliasing it wrote `columnar` into red oak at tol 0.
    // Printing it under "add an alias for these", 20x every run, is exactly how the
    // bad alias gets re-added in six months by someone following this report. It is
    // NOT_A_TRAIT with a reason; file it there, and keep this section for real gaps.
    const why = NOT_A_TRAIT[axis]?.[normalize(o.value)]
    const bucket = why ? discarded : unresolved
    if (why) discardReason.set(`${axis}::${o.value}`, why)
    if (!bucket.has(axis)) bucket.set(axis, new Map())
    const u = bucket.get(axis)
    const k = String(o.value)
    if (!u.has(k)) u.set(k, { n: 0, sources: new Set() })
    u.get(k).n++; u.get(k).sources.add(o.source)
  }
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`observations ${obs.length} · species ${species.length} · rubric axes ${AXES.length} (${AUTHORED.size} authored, not collected)\n`)

console.log('══ PER AXIS — how many of the 20 species got a value ══')
console.log(pad('axis', 24), pad('kind', 8), 'RESOLVED  hasRAW   verdict')
let collectible = 0, anyResolved = 0
for (const a of rubric.axes) {
  if (AUTHORED.has(a.id)) continue
  collectible++
  const per = grid.get(a.id)
  const nRes = per ? [...per.values()].filter(c => c.resolved.size).length : 0
  const nRaw = per ? [...per.values()].filter(c => c.raw.size).length : 0
  if (nRes) anyResolved++
  const verdict = !nRaw ? 'NO SOURCE FETCHED' : nRes === 0 ? '⛔ raw found, NOTHING resolves' : nRes < nRaw ? '⚠️ partial' : 'ok'
  console.log(pad(a.id, 24), pad(a.kind, 8), pad(`${nRes}/20`, 9), pad(`${nRaw}/20`, 8), verdict)
}
console.log(`\ncollectible axes ${collectible} · axes with ≥1 resolved value ${anyResolved}`)

console.log('\n══ PER SPECIES ══')
console.log(pad('species', 24), 'axesRESOLVED  axesWithRAW')
for (const s of species) {
  let r = 0, w = 0
  for (const [axis, per] of grid) { const c = per.get(s); if (!c) continue; if (c.raw.size) w++; if (c.resolved.size) r++ }
  console.log(pad(s, 24), pad(`${r}/${collectible}`, 13), `${w}/${collectible}`)
}

console.log('\n══ 🗑  REASONED DISCARDS — settled, NOT owed work ══')
{
  const rows = []
  for (const [axis, u] of discarded) for (const [val, meta] of u) rows.push({ axis, val, n: meta.n, src: [...meta.sources].join(',') })
  rows.sort((a, b) => a.axis.localeCompare(b.axis) || b.n - a.n)
  for (const r of rows) console.log(`  ${pad(r.axis, 16)} ${pad(r.val, 12)} ×${pad(r.n, 4)} ${pad(r.src, 12)} ${discardReason.get(`${r.axis}::${r.val}`)}`)
  if (!rows.length) console.log('  (none)')
}

console.log('\n══ ⭐ THE ALIAS WORK — source terms that DO NOT RESOLVE AND HAVE NO REASON ══')
const rows = []
for (const [axis, u] of unresolved) for (const [val, meta] of u) rows.push({ axis, val, n: meta.n, src: [...meta.sources].join(',') })
rows.sort((a, b) => a.axis.localeCompare(b.axis) || b.n - a.n)
let cur = ''
for (const r of rows) {
  if (r.axis !== cur) { cur = r.axis; console.log(`\n  ${cur}  [rubric terms: ${axisTerms(cur).length ? axisTerms(cur).join(' · ') : '⛔ NONE — axis unknown to vocabulary.mjs'}]`) }
  console.log(`    ${pad(r.val, 34)} ×${pad(r.n, 4)} ${r.src}`)
}
console.log(`\n  ${rows.length} distinct unresolved source terms across ${unresolved.size} axes.`)

// ── which SOURCE answered which axis ────────────────────────────────────────
console.log('\n══ WHICH SOURCE ANSWERS WHICH AXIS (species covered, resolved-only) ══')
const bySrc = new Map()
for (const o of obs) {
  if (String(o.field).startsWith('_')) continue
  const nominal = CANDIDATE[`${o.source}|${o.field}`]; if (!nominal) continue
  const rd = REDIRECTS[nominal]?.[normalize(o.value)]      // same redirect, same credit
  const axis = rd ? rd.axis : nominal
  const ok = SCALARISH.has(axis) || (rd ? resolveTerm(rd.axis, rd.value) : resolveTerm(axis, o.value)).resolved
  if (!ok) continue
  if (!bySrc.has(axis)) bySrc.set(axis, {})
  const m = bySrc.get(axis); (m[o.source] = m[o.source] || new Set()).add(o.species)
}
console.log(pad('axis', 24), pad('ncsu', 7), pad('selectree', 11), pad('usda', 7), 'utd')
for (const a of rubric.axes) {
  if (AUTHORED.has(a.id)) continue
  const m = bySrc.get(a.id) || {}
  const c = (s) => m[s] ? String(m[s].size) : '·'
  console.log(pad(a.id, 24), pad(c('ncsu'), 7), pad(c('selectree'), 11), pad(c('usda'), 7), c('utd'))
}

// headline
let cells = 0
for (const [, per] of grid) for (const [, c] of per) if (c.resolved.size) cells++
console.log(`\n══ HEADLINE ══`)
console.log(`filled cells ${cells} of ${20 * collectible} (20 species × ${collectible} collectible axes) = ${(100*cells/(20*collectible)).toFixed(1)}%`)

// cross-source disagreement on the identity (hard) axes
console.log('\n══ ⚠️ CROSS-SOURCE DISAGREEMENT on the three HARD identity axes ══')
for (const axis of ['leaf.type', 'leaf.shape', 'chassis.habit']) {
  const per = grid.get(axis); if (!per) continue
  for (const [sp, c] of per) if (c.resolved.size > 1) console.log(`  ${pad(axis,16)} ${pad(sp,24)} ${[...c.resolved].join(' / ')}`)
}
