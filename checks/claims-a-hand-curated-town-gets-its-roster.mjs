#!/usr/bin/env node
/**
 * CLAIM: a town that keeps its LISTINGS by hand (`meta.baseSource: "hand-curated"`) still gets its ROSTER from
 *        `bake-content`, and the bake leaves its listings.json byte-identical and writes no listing-id registry;
 *        and NO roster carries a field a parcel well supplied that the kit withholds (`WITHHELD_PARCEL_FIELDS`).
 *
 * ⛔ THE REGRESSION (2026-10-21): `bakeContent` returned `{ skipped: true }` for a hand-curated town BEFORE building the
 * roster, so LS — the one hand-curated town — had no content/roster.json and its Society page said it "hasn't published
 * its buildings". `meta.baseSource` is a LISTINGS field (Layer 2); the roster (Layer 1) is baked for every town (Boz's
 * ruling, 2026-10-21).
 * ⛔ THE PRIVACY CLAIM: a parcel well's owner, value, size and dates never reach a served file — St. Louis City's terms
 * forbid redistribution without written permission (scratch/data-licences/REGISTER.md row 4). The list has ONE home,
 * `cartograph/sources.js#WITHHELD_PARCEL_FIELDS`; this file reads it, and a source row fails any check that restates it.
 *
 * ⭐ A FIXTURE, NOT LS: four buildings, a hand-kept listings.json, and a parcel well that supplies every withheld field
 * the loader reads, with values — built and torn down by this file, so it runs on any machine with no town on disk.
 * It drives the real CLI, the operator's gesture (as `claims-an-external-base-survives-a-bake.mjs` does, and for the
 * same tier reasons).
 *
 * ⭐ MUTATION TEST, every run: a copy of bake-content.js with (1) the old early return put back → no roster → RED;
 * (2) the parcel read without the withholding → a withheld value in roster.json → RED; and (3) the list restated in a
 * check's source → RED. The copies are written beside the original and removed, including on failure.
 *   node checks/claims-a-hand-curated-town-gets-its-roster.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PARCEL_FIELDS, WITHHELD_PARCEL_FIELDS } from '../cartograph/sources.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FX = '_fixture-hand-curated'
const sceneDir = join(ROOT, 'cartograph', 'data', FX), slabDir = join(ROOT, 'public', 'baked', FX), cdir = join(sceneDir, 'content')
const BAKE = join(ROOT, 'cartograph', 'bake-content.js'), MUTANT = join(ROOT, 'cartograph', '.mutant-bake-content.mjs')

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
    owner: `Owner ${i}`, appraised_value: 100000 + i, land_area: 500 + i, building_sqft: 2000 + i, units: 1 + i,
    num_buildings: 1, year_built: 1890 + i, land_use_code: '1100', zoning: 'B' })) })
  W(join(cdir, 'listings.overrides.json'), { meta: { baseSource: 'hand-curated' }, adds: [], patches: {} })
  W(join(cdir, 'listings.json'), { meta: { scene: FX, generator: 'authored' }, listings: [
    { id: 'fx-1', name: 'Fixture Cafe', category: 'dining', subcategory: 'cafe', building_id: 'osm-1' },
    { id: 'fx-2', name: 'Fixture Books', category: 'shopping', subcategory: 'books', building_id: 'osm-3' }] })
}

const bake = (script = BAKE) => {
  try { return { ok: true, out: execFileSync('node', [script, `--scene=${FX}`], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }) } }
  catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

/** the claim, as one verdict: [] when it holds, else what broke */
function judge(listingsBefore, contentBefore) {
  const bad = [], rp = join(cdir, 'roster.json')
  if (!existsSync(rp)) return ['no roster.json was written for a hand-curated town']
  const roster = JSON.parse(readFileSync(rp, 'utf8')).buildings
  if (roster.length !== 4) bad.push(`roster.json has ${roster.length} records, expected 4`)
  const hosted = roster.filter(b => b.listing_ids?.length).length
  if (hosted !== 2) bad.push(`${hosted} roster records host a listing, expected 2 — the roster is not joined to the hand-kept listings`)
  if (readFileSync(join(cdir, 'listings.json'), 'utf8') !== listingsBefore) bad.push('listings.json changed — a hand-kept file was written')
  const added = readdirSync(cdir).filter(f => !contentBefore.includes(f) && f !== 'roster.json')
  if (added.length) bad.push(`the bake wrote ${added.join(', ')} beside the hand-kept listings (the id registry must be untouched)`)
  bad.push(...leaks(roster))
  return bad
}
/** every withheld field holding a value in a served roster record (top level or `architecture`) */
export function leaks(roster) {
  const out = []
  for (const b of roster) for (const f of WITHHELD_PARCEL_FIELDS)
    for (const [where, v] of [[f, b[f]], [`architecture.${f}`, b.architecture?.[f]]]) if (v != null) out.push(`${b.id}.${where} = ${v}`)
  return out.length ? [`roster.json carries ${out.length} withheld parcel value(s): ${out.slice(0, 4).join(' · ')}`] : []
}

/** a check's source restating the list: an array literal holding three or more of its names */
export function restates(src) {
  return [...src.matchAll(/\[([^\[\]]*)\]/g)].some(m => WITHHELD_PARCEL_FIELDS.filter(f => new RegExp(`['"\`]${f}['"\`]`).test(m[1])).length >= 3)
}

const run = (script) => { buildFixture()
  const listingsBefore = readFileSync(join(cdir, 'listings.json'), 'utf8'), contentBefore = readdirSync(cdir)
  const r = bake(script)
  return r.ok ? judge(listingsBefore, contentBefore) : [`the bake refused: ${r.out.trim().split('\n').slice(-2).join(' / ')}`] }

try {
  const real = run(BAKE)
  if (real.length) for (const m of real) fail(m)
  else ok('a hand-curated town gets its roster (4 records, 2 hosting its hand-kept listings), listings.json byte-identical, no registry written, no withheld value served')

  const src = readFileSync(BAKE, 'utf8')
  const mutants = [
    ['(1) the old early return put back', src.replace(/(const declaredBase = [^\n]*\n)/, "$1  if (declaredBase === 'hand-curated' && !force) return { skipped: true }\n")],
    ['(2) the parcel read without the withholding', src.replace(/const served = par && [^\n]*\n/, 'const served = par\n')],
  ]
  for (const [name, text] of mutants) {
    if (text === src) { fail(`${name}: the mutation did not apply — the code it targets moved, so this check is blind to it`); continue }
    writeFileSync(MUTANT, text)
    const got = run(MUTANT)
    if (got.length) ok(`${name} → RED (${got[0]})`)
    else fail(`${name} → still green: this check cannot see the defect it guards`)
  }

  // (3) the list has one home: no check restates it
  const restating = readdirSync(join(ROOT, 'checks')).filter(f => /\.m?js$/.test(f)).filter(f => restates(readFileSync(join(ROOT, 'checks', f), 'utf8')))
  if (restating.length) fail(`the withheld list is restated in ${restating.join(', ')} — import WITHHELD_PARCEL_FIELDS from cartograph/sources.js`)
  else ok('no check restates the withheld list (it is read from cartograph/sources.js)')
  if (restates(`const F = [${WITHHELD_PARCEL_FIELDS.slice(0, 3).map(f => `'${f}'`).join(', ')}]`)) ok('(3) a restated list → RED')
  else fail('(3) a restated list was not seen: the source row is blind')
} catch (e) {
  fail(`the check itself threw: ${e.message}`)
} finally {
  rmSync(MUTANT, { force: true })
  rmSync(sceneDir, { recursive: true, force: true }); rmSync(slabDir, { recursive: true, force: true })
}

console.log('')
console.log(fails.length ? `⛔ FAIL — ${fails.length}` : '✅ PASS')
process.exit(fails.length ? 1 : 0)
