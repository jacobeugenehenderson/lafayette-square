#!/usr/bin/env node
// CLAIM — A TOWN LISTS EACH PLACE ONCE, AND NEVER BY ITS ADDRESS (Ward's PTown sweep, Boz's job, Zob's review, 2026-10-30).
// cartograph/listing-places.js judges what a visitor would be served, whichever producer made it (bake-content.js runs it after
// the overrides and before the ids). Every row runs the module itself on planted listings; every mutant runs the SAME row on a
// changed copy of the source (a data: module), so a test that cannot see its mutant is RED.
//   (1) the witnesses: one identity on one building · on one address · on one parcel (a researched add on the parcel's other
//       footprint) is one place, a join conflict; one identity at two addresses on two parcels is two places, no conflict.
//       MUTANTS: each witness dropped in turn → its planted pair passes, RED
//   (2) the operator decides: places.merge absorbs (gone from the listings, recorded absorbed → kept); places.apart answers a pair;
//       an entry reaching no listing, or one listing by source key and another by id, REFUSES.
//       MUTANTS: merge ignored · apart ignored → RED
//   (3) a name-matched patch (`_match_name`) that reaches two listings refuses, naming both; one listing is patched.
//       MUTANT: the first found taken again → RED
//   (4) an absorbed researched add's authored id is never re-issued (listing-identity.js#assignListingIds `reserved`).
//       MUTANT: reserved ignored → the next business gets the absorbed id, RED
//   (5) a listing named by its own address refuses ("9 Ryder Street" at 9 Ryder Street Extension); a name with words beyond the
//       address ("432 Gallery") and the same words at another address pass. MUTANT: the test off → RED
//   (6) the bake: it judges before it assigns ids, on every producer (hand-curated included), refuses outside a dry run, and the
//       old building-keyed supersede is gone (one mechanism)
//   node checks/claims-a-town-lists-each-place-once.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { assignListingIds } from '../cartograph/listing-identity.js'

let red = 0
const row = (ok, msg) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${msg}`) }
const src = (f) => readFileSync(join(ROOT, f), 'utf8')
const lp = src('cartograph/listing-places.js'), bc = src('cartograph/bake-content.js'), li = src('cartograph/listing-identity.js')
// a changed copy of listing-places.js as a module (its one relative import made absolute); `null` when the change did not apply
const placesWith = async (from, to) => { const code = from == null ? lp : lp.replace(from, to); if (from != null && code === lp) return null
  const abs = code.replace("'../src/lib/addressKey.js'", JSON.stringify(pathToFileURL(join(ROOT, 'src/lib/addressKey.js')).href))
  return import(`data:text/javascript,${encodeURIComponent(abs)}#${Math.random()}`) }
const P = await placesWith(null)

// planted: a node/way pair on one building · a researched add on its parcel's other footprint · two addresses on one name (two places)
const parcelA = { address: '207-209 COMMERCIAL ST' }, parcelB = { address: '56 SHANK PAINTER RD' }, parcelC = { address: '221 COMMERCIAL ST' }
const parcelOf = new Map([['b1', parcelA], ['b2', parcelA], ['b3', parcelB], ['b4', parcelC], ['b6', { address: '2 Y ST' }]])   // b5 stands on no parcel: the building is its only witness
const L = () => [
  { _key: 'osm-1', name: 'Gifford House', building_id: 'b5', address: null },
  { _key: 'osm-n2', name: 'Gifford House', building_id: 'b5', address: null },                                 // the same building
  { _key: 'osm-n3', name: 'Aqua Bar', building_id: 'b1', address: null },
  { id: 'town-lst-0421', name: 'Aqua Bar', building_id: 'b2', address: null },                                 // the parcel's other footprint
  { _key: 'osm-n4', name: 'Dental', building_id: 'b6', address: '86 Harry Kemp Way' },
  { _key: 'osm-n5', name: 'Dental', building_id: 'b4', address: '86 Harry Kemp Way' },                          // the same address only
  { _key: 'osm-n6', name: "Seamen's Bank", building_id: 'b3', address: '56 Shank Painter Road' },
  { _key: 'osm-n7', name: "Seamen's Bank", building_id: 'b4', address: '221 Commercial Street' },               // two places
]
const pairsOf = (r) => r.conflicts.map(c => [c.a._key || c.a.id, c.b._key || c.b.id].sort().join(' · ')).sort()
const WANT = ['osm-1 · osm-n2', 'osm-n3 · town-lst-0421', 'osm-n4 · osm-n5']

// (1) the witnesses
{ const got = pairsOf(P.onePlacePerIdentity(L(), { parcelOf }))
  row(JSON.stringify(got) === JSON.stringify(WANT), `(1) one identity on one building, one address or one parcel is one place; two addresses on two parcels are two: ${got.join(' | ') || 'none'}`)
  for (const [w, from, to, lost] of [
    ['building', "if (a.building_id && a.building_id === b.building_id) out.push('building')", '', 'osm-1 · osm-n2'],
    ['address', "if (ka && ka === kb) out.push('address')", '', 'osm-n4 · osm-n5'],
    ['parcel', "out.push('parcel')", 'void 0', 'osm-n3 · town-lst-0421']]) {
    const M = await placesWith(from, to), g = M ? pairsOf(M.onePlacePerIdentity(L(), { parcelOf })) : null
    row(g !== null && !g.includes(lost), `(1) mutant: the ${w} witness dropped → ${g === null ? 'NOT MUTATED (the line moved)' : g.includes(lost) ? `${lost} still a conflict — the row cannot see it` : `${lost} passes, RED as it must be`}`) } }

// (2) the operator decides
const decided = { merge: { 'town-lst-0421': ['osm-n3'], 'osm-1': ['osm-n2'] }, apart: [['osm-n4', 'osm-n5']] }
{ const r = P.onePlacePerIdentity(L(), { parcelOf, places: decided })
  const ok = r.conflicts.length === 0 && r.refusals.length === 0 && r.listings.length === 6 && !r.listings.some(l => l._key === 'osm-n3' || l._key === 'osm-n2') && r.absorbed.map(x => `${x.absorbed._key}→${x.kept._key || x.kept.id}`).sort().join(',') === 'osm-n2→osm-1,osm-n3→town-lst-0421'
  row(ok, `(2) merge absorbs (${r.absorbed.map(x => `${x.absorbed._key} → ${x.kept._key || x.kept.id}`).join(', ')}) and apart answers its pair: ${r.conflicts.length} conflict(s), ${r.refusals.length} refusal(s), ${r.listings.length} listings`)
  const bad = P.onePlacePerIdentity([...L(), { _key: 'town-lst-0421', name: 'x', building_id: 'b9' }], { parcelOf, places: { merge: { 'osm-404': ['osm-n2'], 'town-lst-0421': ['osm-n3'] }, apart: [['osm-n4', 'nope']] } })
  const says = (re) => bad.refusals.some(x => re.test(x))
  row(says(/"osm-404" reaches no listing/) && says(/"nope" reaches no listing/) && says(/"town-lst-0421" names two listings, one by source key/), `(2) an entry that reaches no listing, or two listings across the namespaces, refuses: ${bad.refusals.length} refusal(s)`)
  for (const [w, from, to] of [['merge', 'gone.add(a.l); absorbed.push', 'void gone; absorbed.push'], ['apart', 'apart.add(pair(idOf(a.l), idOf(b.l)))', 'void 0']]) {
    const M = await placesWith(from, to), m = M && M.onePlacePerIdentity(L(), { parcelOf, places: decided })
    row(!!m && m.conflicts.length > 0, `(2) mutant: ${w} ignored → ${!m ? 'NOT MUTATED (the line moved)' : m.conflicts.length ? `${m.conflicts.length} conflict(s) stand, RED as it must be` : 'no conflict — the row cannot see it'}`) } }

// (3) the name-matched patch, run from bake-content.js's own applyListingOverrides (its patch half; no add reaches the anchor code)
const overridesOf = (code) => { const a = code.indexOf('export function applyListingOverrides('), b = code.indexOf('\n}\n', a) + 2, s = code.indexOf('function stripMeta('), e = code.indexOf('\n}\n', s) + 2
  return new Function('normName', 'addressKey', 'joinPointToBuilding', `${code.slice(s, e)}; ${code.slice(a, b).replace('export ', '')}; return applyListingOverrides`)(P.normName, () => null, () => null) }
const patched = (fn) => { const base = [...L(), { _key: 'osm-n8', name: "Liz's Cafe", building_id: 'b7' }], r = fn(base, { patches: { 'osm-gone': { _match_name: "Seamen's Bank", phone: '1' }, 'osm-gone-2': { _match_name: 'Gifford House', phone: '2' }, 'osm-gone-3': { _match_name: "Liz's Cafe", phone: '3' } } }, { buildingGrid: null, bakedIds: new Set(), parcels: [], parcelByAddr: new Map() })
  return { r, phones: base.filter(l => l.phone).map(l => `${l._key}:${l.phone}`) } }
{ const { r, phones } = patched(overridesOf(bc))
  row(r.report.match_name_ambiguous.length === 2 && r.report.match_name_ambiguous.every(x => / reaches 2 listings: /.test(x)) && phones.join(',') === 'osm-n8:3',
    `(3) a _match_name reaching two listings refuses, naming both (${r.report.match_name_ambiguous.length} of 2); one reaching one is patched (${phones.join(', ')})`)
  const M = bc.replace('if (hits.length > 1) {', 'if (false) {'), m = M === bc ? null : patched(overridesOf(M))
  row(!!m && m.phones.length > 1, `(3) mutant: the first found taken again → ${!m ? 'NOT MUTATED (the line moved)' : m.phones.length > 1 ? `a chain's patch lands on ${m.phones.join(', ')}, RED as it must be` : 'still refused — the row cannot see it'}`) }

// (4) an absorbed researched add's id stays reserved (high water 3; the absorbed add held 0004)
const idsAfter = (assign) => { const reg = { meta: { prefix: 'town', highWater: 3 }, ids: { 'osm-a': 'town-lst-0001', 'osm-b': 'town-lst-0002', 'osm-c': 'town-lst-0003' } }
  const ls = ['osm-a', 'osm-b', 'osm-c', 'osm-new'].map(k => ({ _key: k, name: k })); assign(ls, reg, { reserved: ['town-lst-0004'] }); return ls.find(l => l._key === 'osm-new').id }
{ const got = idsAfter(assignListingIds)
  row(got === 'town-lst-0005', `(4) an absorbed add's authored id (town-lst-0004, above the high water) is not re-issued: the next business gets ${got}`)
  const M = li.replace('skip = new Set([...pinned, ...reserved])', 'skip = new Set([...pinned])')
  const m = M === li ? null : idsAfter((await import(`data:text/javascript,${encodeURIComponent(M)}`)).assignListingIds)
  row(m === 'town-lst-0004', `(4) mutant: reserved ignored → ${m === null ? 'NOT MUTATED (the line moved)' : m === 'town-lst-0004' ? 'the next business gets the absorbed id, RED as it must be' : `${m} — the row cannot see it`}`) }

// (5) named by its own address
const named = [{ _key: 'a', name: '9 Ryder Street', address: '9 Ryder Street Extension' }, { _key: 'b', name: '432 Gallery', address: '432 Commercial Street' },
  { _key: 'c', name: '9 Ryder Street', address: '12 Pearl Street' }, { _key: 'd', name: '86 Harry Kemp Way', address: '86 Harry Kemp Way' }]
{ const got = P.addressNamed(named).map(l => l._key).join(',')
  row(got === 'a,d', `(5) named by its own address: ${got} (a, d); "432 Gallery" and the same words at another address pass`)
  const M = await placesWith("return m[1].toUpperCase().replace(/[A-Z]$/, '') === own.house &&", 'return false &&'), m = M && M.addressNamed(named).length
  row(m === 0, `(5) mutant: the test off → ${M ? (m === 0 ? 'nothing refused, RED as it must be' : `${m} still refused — the row cannot see it`) : 'NOT MUTATED (the line moved)'}`) }

// (6) the bake
{ const judge = bc.indexOf('const places = onePlacePerIdentity(overridden'), assign = bc.indexOf('assignListingIds(merged'), curated = /if \(skipListings\) \{ listings = baseListings; judgePlaces\(onePlacePerIdentity\(baseListings, \{ parcelOf \}\), \{ handCurated: true \}\) \}/.test(bc)
  const refuses = /catch \(e\) \{ if \(!dryRun\) throw e;/.test(bc), reserved = /reserved: places\.absorbed\.map\(x => x\.absorbed\.id\)/.test(bc), gone = !/byBidName|base_superseded|consumed\.has/.test(bc)
  row(judge > 0 && assign > judge && curated && refuses && reserved && gone, `(6) the bake judges the places before it assigns ids (${judge > 0 && assign > judge}), on a hand-curated town too (${curated}), refuses outside a dry run (${refuses}), reserves the absorbed ids (${reserved}), and the building-keyed supersede is gone (${gone})`) }

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ a town lists each place once, and never by its address')
process.exit(red ? 1 : 0)
