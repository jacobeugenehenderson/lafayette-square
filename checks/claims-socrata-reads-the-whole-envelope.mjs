#!/usr/bin/env node
/**
 * claims-socrata-reads-the-whole-envelope.mjs — a Socrata well (cartograph/socrata-fetch.mjs, the `socrata` protocol of
 * cartograph/states/index.mjs) is read over EXACTLY the town's envelope, WHOLE, or not at all.
 *
 *   node checks/claims-socrata-reads-the-whole-envelope.mjs
 *
 * BRIEF-nyc-adapter §3.2a (Jacob: "a Socrata fetcher, with each well declaring its protocol"). Hermetic — the GET is
 * injected, so this runs offline and drives the code the fetchers run:
 *  1. THE ENVELOPE — `within_box(geom, north, west, south, east)`: Socrata's argument order is lat-first and NW→SE.
 *     A swapped order still parses and returns a different (often empty) box: a quiet wrong town.
 *  2. THE WELL'S OWN `where` is ANDed in, parenthesised; '1=1' and absent add nothing.
 *  3. WHOLE OR NOTHING — a server that returns fewer rows than it counted is REFUSED, never written.
 *  4. NYC's address composition (states/ny.mjs `nyc-addresspoint`): hyphenated Queens numbers kept whole, the BIN rides
 *     along, a record with no number or street is not an address.
 * ⭐ MUTANTS (each RED): swap lat/lon in withinBox · drop the `where` AND · accept a short set · compose without the BIN.
 */
import { withinBox, envelopeClause, socrataFetchAll } from '../cartograph/socrata-fetch.mjs'
import { STATES } from '../cartograph/states/index.mjs'

const fails = [], ok = []
const check = (name, pass, detail = '') => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(e.message) } }

// 1. the envelope
const bbox = { minLon: -73.897, minLat: 40.745, maxLon: -73.868, maxLat: 40.762 }
const wb = withinBox('the_geom', bbox)
check('within_box is (geom, north, west, south, east)', wb === 'within_box(the_geom, 40.762, -73.897, 40.745, -73.868)', wb)
check('a bbox missing a number THROWS', throws(() => withinBox('the_geom', { ...bbox, maxLat: undefined }), /no numeric `maxLat`/))
check('a geometry column that is not a plain name THROWS (it is spliced into the query)', throws(() => withinBox('x) OR (1=1', bbox), /not a Socrata column/))

// 2. the well's where
check("the well's where is ANDed, parenthesised", envelopeClause('g', "borough = 'QN'", bbox).endsWith(" AND (borough = 'QN')"))
check("'1=1' and no where add nothing", envelopeClause('g', '1=1', bbox) === withinBox('g', bbox) && envelopeClause('g', undefined, bbox) === withinBox('g', bbox))

// 3. whole or nothing — an injected server
const server = (total, serve = total) => {
  const rows = Array.from({ length: serve }, (_, i) => ({ i }))
  return (_r, p) => p.$select === 'count(*)' ? [{ count: String(total) }] : rows.slice(Number(p.$offset), Number(p.$offset) + Number(p.$limit))
}
const base = { resource: 'r', geomField: 'g', select: '*', bbox, tmpPath: '/dev/null', page: 4 }
{ const r = socrataFetchAll({ ...base, get: server(10) }); check('a whole set over 3 pages is read entire', r.rows.length === 10 && r.count === 10, `${r.rows.length}/${r.count}`) }
check('a server that returns fewer rows than it counted is REFUSED', throws(() => socrataFetchAll({ ...base, get: server(10, 7) }), /partial set/))
check('a server that gives no count is REFUSED', throws(() => socrataFetchAll({ ...base, get: () => [{}] }), /no count/))
{ let where = null; socrataFetchAll({ ...base, where: "x = 1", get: (_r, p) => { where = p.$where; return p.$select === 'count(*)' ? [{ count: '0' }] : [] } })
  check('the request carries the envelope AND the where', where === `${withinBox('g', bbox)} AND (x = 1)`, where) }

// 4. NYC address composition
const ap = STATES.NY.addressPoints['nyc-addresspoint']
check('NY addressPoints is a socrata well on the_geom', ap.protocol === 'socrata' && ap.geomField === 'the_geom')
const c1 = ap.compose({ house_number: '81-11', full_street_name: '37 AVE', bin: '4029691' })
check('a Queens number is kept whole and the BIN rides along', c1?.address === '81-11 37 AVE' && c1.bin === '4029691', JSON.stringify(c1))
const c2 = ap.compose({ house_number: '12', house_number_suffix: 'A', full_street_name: '  85   ST ', bin: '4000001' })
check('a suffix is kept, whitespace tidied', c2?.address === '12 A 85 ST', JSON.stringify(c2))
check('no house number → not an address', ap.compose({ full_street_name: '85 ST' }) === null)
check('no street → not an address', ap.compose({ house_number: '12' }) === null)

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
