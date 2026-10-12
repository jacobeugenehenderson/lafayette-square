#!/usr/bin/env node
/**
 * claims-a-district-is-the-towns-own.mjs — DOES A TOWN'S ROSTER NAME ITS OWN HISTORIC DISTRICT, OR HI-POINTE–DEMUN'S?
 *
 * ⛔ Found 2026-10-11 (cartograph/_archive/BRIEF-a-district-is-the-towns-own-DELIVERED-2026-10-11.md): bake-content.js wrote HPDM's district name, nomination
 *    streets and county exclusion into every town, so 695 Jackson Heights buildings in Queens read "Hi-Pointe–DeMun
 *    Historic District" while the town's own well (MapPLUTO HistDist) carried the real name and the fetch threw it
 *    away. And a town with no district source at all wrote `in_historic_district: false`: "not in a district",
 *    claimed by nothing.
 * ⭐ THE RULE, read from each town's sources (sources.json, its raw parcel wells, content/nr-inventory.json), never
 *    restated here:
 *   · every `historic_district` / `architecture.district` name in the roster is one the town's own sources carry: a
 *     name in its parcel wells, or its declared `historicDistricts`;
 *   · every `architecture.nps_ref` is one the town declares;
 *   · a town with no district source (no well provides the column, no NR inventory, no declaration) writes
 *     `in_historic_district: null`, never false;
 *   · no kit file under cartograph/ names any town's declared or sourced district, or its NRHP ref.
 * ⭐ MUTATION-TESTED EVERY RUN: a foreign district name, a sourceless `false`, and a name pasted back into
 *    bake-content.js must each fail.
 *
 *   node checks/claims-a-district-is-the-towns-own.mjs                  # every town with a roster
 *   node checks/claims-a-district-is-the-towns-own.mjs jacksonheights
 * Read-only. Exit 1 on a failure, 2 if not measured.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, eachTown, declaredScenes } from './_scenes.mjs'

const scene = eachTown('cartograph/data/<scene>/content/roster.json')
process.env.CARTOGRAPH_SCENE = scene   // sources.js reaches config.js, which wants a named scene
const { readSources } = await import(join(ROOT, 'cartograph/sources.js'))

const dataDir = (s) => join(ROOT, 'cartograph/data', s)

/** What a town's own sources say about historic districts. */
function townSources(s) {
  const src = readSources(s)
  if (!src.declared) return { declared: false, names: new Set(), refs: new Set(), hasSource: false }
  const names = new Set(), refs = new Set()
  for (const d of src.historicDistricts) { names.add(d.name); if (d.nps_ref) refs.add(d.nps_ref) }
  let wellProvides = false
  const unwritable = []
  for (const w of src.parcels) {
    if (!(w.provides || []).includes('historic_district')) continue
    wellProvides = true
    const p = join(dataDir(s), 'raw', w.file)
    if (!existsSync(p)) continue
    const marks = new Set()
    for (const par of JSON.parse(readFileSync(p, 'utf8')).parcels || []) {
      const hd = par.historic_district
      if (hd && hd.name) names.add(hd.name)
      if (hd) for (const d of ['national', 'local', 'certified_local']) if (hd[d] === true) marks.add(d)
    }
    for (const d of unwritableDesignations(w.historicDistrictField, marks)) unwritable.push(`${w.id}: raw/${w.file} marks ${d}`)
  }
  const nr = existsSync(join(dataDir(s), 'content/nr-inventory.json'))
  return { declared: true, names, refs, unwritable, hasSource: wellProvides || nr || src.historicDistricts.length > 0 }
}

/** Designations the raw file marks true that the well's declaration could not write on a re-fetch (it would lose them). */
function unwritableDesignations(field, marks) {
  const writable = new Set(field ? (field.columns ? Object.keys(field.columns) : [field.designation]) : [])
  return [...marks].filter(d => !writable.has(d))
}

/** The roster's claims against the town's sources. */
function auditRoster(roster, own) {
  const out = [], foreign = new Map(), foreignRef = new Map()
  let sourcelessClaims = 0
  for (const b of roster) {
    for (const n of [b.historic_district, b.architecture && b.architecture.district]) {
      if (n && !own.names.has(n)) foreign.set(n, (foreign.get(n) || 0) + 1)
    }
    const ref = b.architecture && b.architecture.nps_ref
    if (ref && !own.refs.has(ref)) foreignRef.set(ref, (foreignRef.get(ref) || 0) + 1)
    if (!own.hasSource && b.in_historic_district !== null && b.in_historic_district !== undefined) sourcelessClaims++
  }
  for (const [n, k] of foreign) out.push(`${k} field(s) name "${n}", which none of this town's sources carry`)
  for (const [r, k] of foreignRef) out.push(`${k} building(s) carry nps_ref ${r}, which this town does not declare`)
  if (sourcelessClaims) out.push(`${sourcelessClaims} building(s) write in_historic_district non-null, but the town has no district source (no well column, no NR inventory, no declaration) — must be null`)
  return out
}

/** Kit code that names any town's district or NRHP ref. */
const KIT_DIRS = ['cartograph', 'cartograph/states']
const kitFiles = KIT_DIRS.flatMap(d => readdirSync(join(ROOT, d)).filter(f => /\.(m?js)$/.test(f)).map(f => join(d, f)))
function auditKit(texts, needles) {
  const out = []
  for (const [file, text] of texts) for (const n of needles) if (text.includes(n)) out.push(`${file} names "${n}" — a town's district belongs in that town's data, never kit code`)
  return out
}

const fails = []
const own = townSources(scene)
const roster = JSON.parse(readFileSync(join(dataDir(scene), 'content/roster.json'), 'utf8'))
const rows = Array.isArray(roster) ? roster : (roster.buildings || roster.roster || [])
if (!rows.length) { console.error(`⛔ NOT MEASURED — ${scene}'s roster has no buildings.`); process.exit(2) }
console.log(`   ${scene}: ${rows.length} buildings · district source: ${own.hasSource ? 'yes' : 'NONE'} · own names: ${[...own.names].map(n => `"${n}"`).join(', ') || '(none)'}`)
fails.push(...auditRoster(rows, own))
// ⭐ A re-fetch must not lose a designation the data on disk carries (HPDM's 2,628 certified_local parcels, 2026-10-12).
for (const u of own.unwritable) fails.push(`${u}, which its historicDistrictField cannot write — a re-fetch through fetch-parcels.mjs would drop it`)

// Every declared town's districts are needles for the kit scan — read from their data, not typed here.
const needles = new Set()
for (const t of declaredScenes()) {
  if (!existsSync(join(dataDir(t), 'sources.json'))) continue
  const o = townSources(t)
  for (const n of o.names) needles.add(n)
  for (const r of o.refs) needles.add(r)
}
const texts = kitFiles.map(f => [f, readFileSync(join(ROOT, f), 'utf8')])
fails.push(...auditKit(texts, needles))

// ── Mutations: each must fail ──
const mut = []
const foreignName = [...needles].find(n => !own.names.has(n) && !/^\d+$/.test(n)) || '⟨another town’s district⟩'
mut.push(['a district name the town\'s sources do not carry', auditRoster([{ historic_district: foreignName }], own)])
mut.push(['in_historic_district: false in a town with no district source', auditRoster([{ in_historic_district: false }], { ...own, hasSource: false })])
const bake = texts.find(([f]) => f.endsWith('bake-content.js'))
mut.push(['a district name pasted back into bake-content.js', auditKit([[bake[0], bake[1] + `\n'${[...needles][0] || foreignName}'`]], needles.size ? needles : new Set([foreignName]))])
mut.push(['a declaration that cannot write a designation the raw file carries', unwritableDesignations({ holds: 'code', designation: 'national' }, new Set(['national', 'certified_local']))])
for (const [what, out] of mut) {
  console.log(`   mutation (${what}) ${out.length ? 'caught ✓' : 'NOT caught'}`)
  if (!out.length) fails.push(`MUTATION NOT CAUGHT: ${what}`)
}

if (fails.length) { for (const f of fails) console.log(`   ⛔ ${f}`); process.exit(1) }
console.log(`   ✅ every district this roster names is the town's own`)
