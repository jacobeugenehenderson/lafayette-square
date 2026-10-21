#!/usr/bin/env node
/**
 * CLAIM: a town that keeps its LISTINGS by hand (`meta.baseSource: "hand-curated"`) still gets its ROSTER from
 *        `bake-content`, and the bake leaves its listings.json byte-identical and writes no listing-id registry;
 *        and NO served roster record carries a field a parcel well supplied that the kit withholds
 *        (`WITHHELD_PARCEL_FIELDS`) — not at the top, not in `architecture`, not in `prominence.signals`, nowhere.
 *
 * ⛔ THE REGRESSION (2026-10-21): `bakeContent` returned `{ skipped: true }` for a hand-curated town BEFORE building the
 * roster, so LS had no content/roster.json and its Society page said it "hasn't published its buildings".
 * ⛔ THE PRIVACY CLAIM: a parcel well's owner, value, size and dates never reach a served file (St. Louis City's terms;
 * scratch/data-licences/REGISTER.md row 4). The list has ONE home, `cartograph/sources.js#WITHHELD_PARCEL_FIELDS`; this
 * file reads it, and a source row fails any check that restates it. ⚠️ Zob's review (2026-10-21) found the first version
 * blind to `prominence.signals`, which carried each value field's percentile: the scan is now the WHOLE record, recursively.
 *
 * ⭐ A FIXTURE, NOT LS: four buildings, a hand-kept listings.json, and a parcel well that supplies every withheld field
 * the loader reads, with values — built and torn down by this file, so it runs on any machine with no town on disk.
 * It writes the fixture into cartograph/data/ and public/baked/ (the bake reads only there), so it is local-effect.
 *
 * ⭐ MUTATION TEST, every run, on the OUTPUT the real bake wrote: no roster · a withheld value at the top, in
 * `architecture`, in `prominence.signals`, named in `prominence.unknown` · listings.json changed · a registry written ·
 * the list restated in a check — each RED. And the class is real on this fixture: the bake's dry run (which stops before
 * the write-time strip) carries withheld signals, so the strip is what makes the served file clean.
 * ⚠️ The mutants act on the output, not on a copy of bake-content.js: a copy imported or spawned is code tier.mjs cannot
 * read, which put this check in `live` where it never ran.
 *   node checks/claims-a-hand-curated-town-gets-its-roster.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PARCEL_FIELDS, WITHHELD_PARCEL_FIELDS } from '../cartograph/sources.js'
import { bakeContent } from '../cartograph/bake-content.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FX = '_fixture-hand-curated'
const sceneDir = join(ROOT, 'cartograph', 'data', FX), slabDir = join(ROOT, 'public', 'baked', FX), cdir = join(sceneDir, 'content')

const fails = []
const fail = (m) => { fails.push(m); console.error(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

function buildFixture() {
  rmSync(sceneDir, { recursive: true, force: true }); rmSync(slabDir, { recursive: true, force: true })
  for (const d of ['clean', 'raw', 'content']) mkdirSync(join(sceneDir, d), { recursive: true })
  mkdirSync(slabDir, { recursive: true })
  const W = (p, o) => writeFileSync(p, JSON.stringify(o, null, 1) + '\n')
  const sq = (x, z, r) => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]]
  const ids = [1, 2, 3, 4], at = (i) => [i * 60, 0]
  W(join(sceneDir, 'geography.json'), { lat: 38.6, lon: -90.2, timezone: 'America/Chicago', lonToMeters: 87000, latToMeters: 111000,
    bbox: { minLat: 38.59, maxLat: 38.61, minLon: -90.21, maxLon: -90.19 } })
  W(join(sceneDir, 'clean', 'map.json'), { buildings: ids.map(i => ({ osmId: i, ring: sq(...at(i), 8).map(([x, z]) => ({ x, z })) })) })
  W(join(slabDir, 'buildings.json'), { buildings: ids.map(i => ({ id: `osm-${i}`, stories: 2 })) })
  W(join(sceneDir, 'raw', 'osm.json'), { bbox: {}, ground: {}, pois: [], buildings: [] })
  // a parcel well that supplies, with values, every withheld field the loader reads — so a leak is a number, not a null
  const provides = ['handle', 'address', 'land_use_code', 'zoning', ...WITHHELD_PARCEL_FIELDS.filter(f => PARCEL_FIELDS.includes(f))]
  W(join(sceneDir, 'sources.json'), {
    parcels: [{ id: 'fixture-well', jurisdiction: 'city', file: 'fixture_parcels.json', provides, absent: PARCEL_FIELDS.filter(f => !provides.includes(f)) }],
    landUseCodes: null,
  })
  W(join(sceneDir, 'raw', 'fixture_parcels.json'), { parcels: ids.map(i => ({
    handle: `P${i}`, address: `${i} Fixture St`, centroid: at(i), rings: [sq(...at(i), 25)],
    owner: `Owner ${i}`, appraised_value: 100000 + i * 50000, land_area: 500 + i, building_sqft: 2000 + i * 500, units: 1 + i,
    num_buildings: 1, year_built: 1890 + i, land_use_code: '1100', zoning: 'B' })) })
  W(join(cdir, 'listings.overrides.json'), { meta: { baseSource: 'hand-curated' }, adds: [], patches: {} })
  W(join(cdir, 'listings.json'), { meta: { scene: FX, generator: 'authored' }, listings: [
    { id: 'fx-1', name: 'Fixture Cafe', category: 'dining', subcategory: 'cafe', building_id: 'osm-1' },
    { id: 'fx-2', name: 'Fixture Books', category: 'shopping', subcategory: 'books', building_id: 'osm-3' }] })
}

/** the bake, as the operator runs it, quietly: its result, or the refusal's text */
function bake(opts = {}) {
  const log = console.log, warn = console.warn
  console.log = () => {}; console.warn = () => {}
  try { return { ok: true, r: bakeContent({ scene: FX, ...opts }) } }
  catch (e) { return { ok: false, out: e.message } }
  finally { console.log = log; console.warn = warn }
}

/** every withheld field holding a value anywhere in a record, or named as a string inside it: ['<id>.<path> = <v>'] */
export function leaksIn(rec, path = '', out = []) {
  if (Array.isArray(rec)) rec.forEach((v, i) => {
    if (typeof v === 'string' && WITHHELD_PARCEL_FIELDS.includes(v)) out.push(`${path}[${i}] names ${v}`)
    else if (v && typeof v === 'object') leaksIn(v, `${path}[${i}]`, out) })
  else if (rec && typeof rec === 'object') for (const [k, v] of Object.entries(rec)) {
    if (WITHHELD_PARCEL_FIELDS.includes(k) && v != null) out.push(`${path}${path ? '.' : ''}${k} = ${JSON.stringify(v)}`)
    else if (v && typeof v === 'object') leaksIn(v, `${path}${path ? '.' : ''}${k}`, out) }
  return out
}
const leaks = (roster) => roster.flatMap(b => leaksIn(b).map(l => `${b.id}: ${l}`))

/** the claim, as one verdict over what the bake left on disk: [] when it holds, else what broke */
export function judge({ roster, listingsBytes, files }, before) {
  if (!roster) return ['no roster.json was written for a hand-curated town']
  const bad = []
  if (roster.length !== 4) bad.push(`roster.json has ${roster.length} records, expected 4`)
  const hosted = roster.filter(b => b.listing_ids?.length).length
  if (hosted !== 2) bad.push(`${hosted} roster records host a listing, expected 2 — the roster is not joined to the hand-kept listings`)
  if (listingsBytes !== before.listingsBytes) bad.push('listings.json changed — a hand-kept file was written')
  const added = files.filter(f => !before.files.includes(f) && f !== 'roster.json')
  if (added.length) bad.push(`the bake wrote ${added.join(', ')} beside the hand-kept listings (the id registry must be untouched)`)
  const l = leaks(roster)
  if (l.length) bad.push(`roster.json carries ${l.length} withheld parcel field(s): ${l.slice(0, 3).join(' · ')}`)
  return bad
}
const onDisk = () => ({
  roster: existsSync(join(cdir, 'roster.json')) ? JSON.parse(readFileSync(join(cdir, 'roster.json'), 'utf8')).buildings : null,
  listingsBytes: readFileSync(join(cdir, 'listings.json'), 'utf8'), files: readdirSync(cdir) })

/** a check's source restating the list: an array literal holding three or more of its names */
export function restates(src) {
  return [...src.matchAll(/\[([^\[\]]*)\]/g)].some(m => WITHHELD_PARCEL_FIELDS.filter(f => new RegExp(`['"\`]${f}['"\`]`).test(m[1])).length >= 3)
}

try {
  buildFixture()
  const before = { listingsBytes: readFileSync(join(cdir, 'listings.json'), 'utf8'), files: readdirSync(cdir) }

  // the class is real here: the dry run stops before the write-time strip, so its breakdown still carries the signals
  const dry = bake({ dryRun: true })
  const dryLeaks = dry.ok ? leaks(dry.r.roster) : []
  if (!dry.ok) fail(`the dry run refused: ${dry.out}`)
  else if (!dryLeaks.length) fail('the fixture exercises nothing: even the unstripped roster carries no withheld field, so a clean roster.json proves nothing')
  else ok(`the fixture exercises the class: before the write, ${dryLeaks.length} withheld field(s) sit in the roster (e.g. ${dryLeaks[0]})`)

  const real = bake()
  const state = real.ok ? onDisk() : null
  const verdict = real.ok ? judge(state, before) : [`the bake refused: ${real.out}`]
  if (verdict.length) for (const m of verdict) fail(m)
  else ok('a hand-curated town gets its roster (4 records, 2 hosting its hand-kept listings), listings.json byte-identical, no registry written, no withheld field anywhere in a served record')

  // ── the instrument, seen to fail: each mutation of what the bake wrote must read RED ──
  if (state) {
    const clone = () => JSON.parse(JSON.stringify(state))
    const plant = (f) => { const s = clone(); f(s.roster[0]); return s }
    const mutants = [
      ['no roster.json (the old early return)', { ...clone(), roster: null }],
      ['a withheld value at the top of a record', plant(b => { b.appraised_value = 123456 })],
      ['a withheld value in architecture', plant(b => { b.architecture = { ...(b.architecture || {}), year_built: 1891 } })],
      ['a withheld signal kept in prominence.signals', plant(b => { b.prominence.signals.appraised_value = 3.2 })],
      ['a withheld field named in prominence.unknown', plant(b => { b.prominence.unknown = [...b.prominence.unknown, 'units'] })],
      ['listings.json changed', { ...clone(), listingsBytes: state.listingsBytes + ' ' }],
      ['an id registry written', { ...clone(), files: [...state.files, 'listing-identity.json'] }],
    ]
    for (const [name, s] of mutants) {
      const got = judge(s, before)
      if (got.length) ok(`mutant: ${name} → RED`)
      else fail(`mutant: ${name} → still green: this check cannot see the defect it guards`)
    }
  }

  // the list has one home: no check restates it
  const restating = readdirSync(join(ROOT, 'checks')).filter(f => /\.m?js$/.test(f)).filter(f => restates(readFileSync(join(ROOT, 'checks', f), 'utf8')))
  if (restating.length) fail(`the withheld list is restated in ${restating.join(', ')} — import WITHHELD_PARCEL_FIELDS from cartograph/sources.js`)
  else ok('no check restates the withheld list (it is read from cartograph/sources.js)')
  if (restates(`const F = [${WITHHELD_PARCEL_FIELDS.slice(0, 3).map(f => `'${f}'`).join(', ')}]`)) ok('mutant: a restated list → RED')
  else fail('mutant: a restated list was not seen: the source row is blind')
} catch (e) {
  fail(`the check itself threw: ${e.message}`)
} finally {
  rmSync(sceneDir, { recursive: true, force: true }); rmSync(slabDir, { recursive: true, force: true })
}

console.log('')
console.log(fails.length ? `⛔ FAIL — ${fails.length}` : '✅ PASS')
process.exit(fails.length ? 1 : 0)
