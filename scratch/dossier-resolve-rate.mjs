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
import { resolveTerm, axisTerms, TERM_REDIRECTS as REDIRECTS, normalize } from '../arborist/vocabulary.mjs'

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
for (const o of obs) {
  if (String(o.field).startsWith('_')) continue
  const axis = CANDIDATE[`${o.source}|${o.field}`]
  if (!axis) continue
  if (!grid.has(axis)) grid.set(axis, new Map())
  const per = grid.get(axis)
  if (!per.has(o.species)) per.set(o.species, { resolved: new Set(), raw: new Set() })
  const cell = per.get(o.species)
  cell.raw.add(String(o.value))
  if (SCALARISH.has(axis)) { cell.resolved.add(String(o.value)); continue }
  // ⭐ A VALUE CAN CHANGE ITS OWN AXIS. vocabulary.mjs's TERM_REDIRECTS sends
  // `Leaf Shape :: Palmately-lobed` to `leaf.margin :: lobed`, so measuring only the
  // field's nominal axis under-reports: the term reads unresolved on leaf.shape while
  // it is in fact landing on leaf.margin. Ask the redirect target too.
  const rd = REDIRECTS[axis]?.[normalize(o.value)]
  const r = rd ? { ...resolveTerm(rd.axis, rd.value), redirectedTo: rd.axis } : resolveTerm(axis, o.value)
  if (r.resolved) cell.resolved.add(r.value)
  else {
    if (!unresolved.has(axis)) unresolved.set(axis, new Map())
    const u = unresolved.get(axis)
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

console.log('\n══ ⭐ THE ALIAS WORK — source terms that DO NOT RESOLVE ══')
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
  const axis = CANDIDATE[`${o.source}|${o.field}`]; if (!axis) continue
  const ok = SCALARISH.has(axis) || resolveTerm(axis, o.value).resolved
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
