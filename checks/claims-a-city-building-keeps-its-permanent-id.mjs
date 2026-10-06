#!/usr/bin/env node
/**
 * claims-a-city-building-keeps-its-permanent-id.mjs — where a town's footprint well carries a PERMANENT id (NYC's BIN),
 * that id IS the building's identity; where it does not, the building is keyed by centroid and SAYS why. Every
 * building names the well it came from.
 *
 *   node checks/claims-a-city-building-keeps-its-permanent-id.mjs            (hermetic + data-derived placeholders)
 *   node checks/claims-a-city-building-keeps-its-permanent-id.mjs --offline  (hermetic only — says NOT MEASURED)
 *
 * BRIEF-nyc-adapter §3.2a + step 3 rulings (Boz, 2026-10-05):
 *  1. ONE NORMALISATION — BIN arrives as "4029691" and as 4043753.0 (BES): a naive join matched 26 of 2,863.
 *  2. PLACEHOLDERS ARE NOT IDS — NYC's borough "million BINs" (x000000) sit on several footprints at once: keyed by
 *     centroid, counted, and never joined to an attribute. ⭐ The set is DERIVED FROM THE DATA (every BIN on more than
 *     one footprint citywide) as well as the pattern, so a new placeholder form turns this RED instead of slipping in.
 *  3. A REPEATED PERMANENT ID THROWS, naming it — the lock would collapse two buildings into one.
 *  4. IDS: `bin-<BIN>` · `<well>-<n>` (centroid registry) · msbf-/osm- unchanged (membership.mjs#buildingIdOf).
 *  5. UNITS: roof height arrives in US feet; the kit's `height` is metres.
 *  6. ATTRIBUTES (BES) join by BIN only; placeholder / unparseable / repeated rows join nothing, counted.
 *  7. ADDRESSES join by BIN first; containment is the CHECK — a disagreement is reported, never re-assigned.
 *  8. EVERY BUILDING SOURCED — each record in a town's declared well names its well, key kind and why; and a courtyard
 *     hole the kit cannot draw is kept on the record and counted (`holesUnsupported`), never filled quietly.
 * ⭐ MUTANTS (each RED): normalise without the ".0" · let a placeholder keep its BIN · let a repeated BIN pass · mint
 *    `bin-` without the kind · skip the ft→m · join a placeholder BES row · let containment beat the id.
 */
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normaliseId } from '../cartograph/permanent-id.mjs'
import { classifyIdentity, fieldsToTags, joinAttributes } from '../cartograph/fetch-buildings.mjs'
import { buildingIdOf } from '../cartograph/membership.mjs'
import { resolveAddress } from '../cartograph/building-address.mjs'
import { STATES } from '../cartograph/states/index.mjs'
import { footprintWell } from '../cartograph/footprint-well.mjs'
import { socrataGet } from '../cartograph/socrata-fetch.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fails = [], ok = []
const check = (name, pass, detail = '') => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(e.message) } }
const W = STATES.NY.buildings['nyc-buildings'], SPEC = W.permanentId

// 1. normalisation
for (const [v, want] of [['4029691', '4029691'], [4029691, '4029691'], ['4043753.0', '4043753'], [' 4043753 ', '4043753'],
  ['', null], [null, null], ['abc', null], ['4.5', null], [-3, null], [0, null]])
  check(`normaliseId(${JSON.stringify(v)}) → ${want}`, normaliseId(v) === want, String(normaliseId(v)))

// 2–3. identity
const { out, counts } = classifyIdentity(['4029691', '4000000', '4000000', '4043753.0', 'n/a', null], SPEC)
check('a permanent BIN keys by BIN', out[0].keyKind === 'bin' && out[0].permanentId === '4029691')
check('a placeholder BIN (x000000) keys by centroid, SAYING so — and may repeat', out[1].keyKind === 'centroid' && /placeholder/.test(out[1].keyWhy) && out[2].keyKind === 'centroid')
check('BES-style "4043753.0" normalises to a permanent BIN', out[3].permanentId === '4043753')
check('an unparseable or absent BIN keys by centroid, SAYING so', out[4].keyKind === 'centroid' && /not an id/.test(out[4].keyWhy) && out[5].keyKind === 'centroid')
check('the counts add up', counts.bin === 2 && counts.placeholder === 2 && counts.unparseable === 2, JSON.stringify(counts))
check('a REPEATED permanent BIN throws, naming it', throws(() => classifyIdentity(['4029691', '4029691.0'], SPEC), /4029691 ×2/))

// 4. ids
check('bin-<BIN>', buildingIdOf({ well: 'nyc-buildings', keyKind: 'bin', permanentId: '4029691' }) === 'bin-4029691')
check('<well>-<n> for a centroid-keyed footprint', buildingIdOf({ well: 'nyc-buildings', keyKind: 'centroid', wellN: 3 }) === 'nyc-buildings-3')
check('msbf-/osm- unchanged', buildingIdOf({ msbfId: 7 }) === 'msbf-7' && buildingIdOf({ osmId: 9 }) === 'osm-9')

// 5. units
check('height_roof 30 ft → 9.14 m', fieldsToTags({ height_roof: '30' }, W.fields).height === 9.14, JSON.stringify(fieldsToTags({ height_roof: '30' }, W.fields)))
check('an undeclared unit THROWS', throws(() => fieldsToTags({ a: '1' }, { a: { from: 'a', unit: 'furlong' } }), /not one the kit converts/))

// 6. attributes
{ const BES = STATES.NY.buildingAttributes['nyc-bes']
  const bs = [{ keyKind: 'bin', permanentId: '4043753', tags: {} }, { keyKind: 'bin', permanentId: '4011111', tags: {} }, { keyKind: 'centroid', wellN: 0, tags: {} }]
  const c = joinAttributes(bs, [{ bin: '4043753.0', z_grade: '41.2' }, { bin: '4000000.0', z_grade: '9' }, { bin: '4011111', z_grade: '1' }, { bin: '4011111.0', z_grade: '2' }, { bin: 'x', z_grade: '3' }], BES, SPEC)
  check('BES "4043753.0" joins BIN 4043753', bs[0].tags['nyc:z_grade_ft_navd88'] === '41.2', JSON.stringify(bs[0].tags))
  check('a repeated BES BIN is ambiguous — joins nothing, counted', !('nyc:z_grade_ft_navd88' in bs[1].tags) && c.repeated === 1, JSON.stringify(c))
  check('a placeholder and an unparseable BES row join nothing, counted', c.placeholder === 1 && c.unparseable === 1 && !('nyc:z_grade_ft_navd88' in bs[2].tags)) }

// 7. addresses — identity first, containment the check
{ const sq = (x, z, s = 10) => [{ x, z }, { x: x + s, z }, { x: x + s, z: z + s }, { x, z: z + s }]
  const me = { rings: [sq(0, 0)], keyKind: 'bin', permanentId: '4029691' }
  const out1 = { address: '81-11 37 AVE', bin: '4029691', x: 30, z: 30 }      // names me, stands outside
  const in2 = { address: '9 OTHER ST', bin: '4011111', x: 5, z: 5 }           // inside me, names another
  const r = resolveAddress(me, [], { addressPoints: [out1, in2] })
  check('the point naming the building wins by identity', r.address === '81-11 37 AVE' && r.addressSource === 'address-point-by-id', JSON.stringify(r))
  check('…and its containment disagreement is REPORTED (outside + foreign inside)', r.idContainment?.outside?.[0] === '81-11 37 AVE' && /4011111/.test(r.idContainment?.foreignInside?.[0] || ''), JSON.stringify(r.idContainment))
  const plain = resolveAddress({ rings: [sq(0, 0)] }, [], { addressPoints: [in2] })
  check('a building with no permanent id is unchanged (containment)', plain.addressSource === 'address-point' && !plain.idContainment, JSON.stringify(plain)) }

// 8. every building sourced — each town's declared well file
const townBuildings = []
let notMeasured = false
for (const t of readdirSync(join(ROOT, 'cartograph/data')).filter(d => statSync(join(ROOT, 'cartograph/data', d)).isDirectory())) {
  const fw = footprintWell(t)
  if (!fw.declared) continue
  if (!existsSync(fw.path)) { notMeasured = true; console.log(`  ⛔ NOT MEASURED: ${t} declares ${fw.wellId}, not yet fetched`); continue }
  const bs = JSON.parse(readFileSync(fw.path, 'utf8')).buildings || []
  const bad = bs.filter(b => b.well !== fw.wellId || !b.keyKind || !b.keyWhy || !buildingIdOf(b))
  check(`${t}: every footprint in ${fw.file} names its well, key kind and why`, bad.length === 0, `${bad.length} of ${bs.length}`)
  const quiet = bs.filter(b => (b.holes?.length || 0) !== (b.holesUnsupported || 0))
  check(`${t}: every courtyard hole is KEPT and counted as unsupported, never filled quietly`, quiet.length === 0, `${quiet.length} record(s)`)
  townBuildings.push([t, bs])
}

// 2'. the placeholder set, DERIVED FROM THE DATA
if (process.argv.includes('--offline')) { notMeasured = true; console.log('  ⛔ NOT MEASURED: --offline — the citywide placeholder set was not read') }
else {
  try {
    const rows = socrataGet(W.endpoint, { $select: 'bin, count(*) AS n', $group: 'bin', $having: 'count(*) > 1', $limit: 1000 },
      join(ROOT, 'scratch', '._placeholder_bins.json'))
    const repeated = rows.map(r => normaliseId(r.bin)).filter(Boolean)
    const pat = new RegExp(SPEC.placeholder)
    const outside = repeated.filter(b => !pat.test(b))
    check('every BIN on more than one footprint citywide matches the placeholder pattern (else the intake rule is stale)', outside.length === 0, outside.slice(0, 10).join(', '))
    const set = new Set([...repeated])
    for (const [t, bs] of townBuildings) {
      const held = bs.filter(b => b.keyKind === 'bin' && (set.has(b.permanentId) || pat.test(b.permanentId)))
      check(`${t}: no building is keyed by a placeholder BIN`, held.length === 0, held.slice(0, 5).map(b => b.permanentId).join(', '))
    }
    console.log(`  citywide: ${repeated.length} BIN(s) on more than one footprint — ${repeated.join(', ')}`)
  } catch (e) { notMeasured = true; console.log(`  ⛔ NOT MEASURED: could not ask NYC Open Data for the citywide placeholder set — ${e.message.split('\n')[0]}`) }
}

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
if (fails.length) process.exit(1)
if (notMeasured) { console.log('⛔ NOT MEASURED — hermetic cases passed; a data-derived leg did not run. Not a pass.'); process.exit(2) }
process.exit(0)
