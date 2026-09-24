#!/usr/bin/env node
/**
 * claims-a-listing-keeps-its-id — a business keeps its display id across every bake, whatever else
 * enters or leaves the base.
 *
 * ⛔⛔ THE DEFECT THIS PINS. Display ids (`huro-lst-0245`) were a count down a sorted list, so one new
 * business that sorted early renumbered every listing after it — and a Guardian's claim, a Sheet row
 * of Place Card edits, a menu, a photo and an event's `listing_id` are all keyed by that number. A pour
 * that added one listing re-pointed all of them at the wrong business, silently. Buildings had the same
 * defect and were sealed by `msbf-identity.js`; `listing-identity.js` is the same lock one layer down.
 *
 * ⭐ Two halves, both needed:
 *   · the RULES, on fixtures — a new key never moves an old one, a vanished key's id is never reissued,
 *     an authored id is never handed out, and each unanswerable input throws instead of guessing;
 *   · the SCENES, on disk — every scene that has sealed its ids still agrees with its own registry, so a
 *     listings.json edited or re-baked around the registry is caught.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const { assignListingIds, idsThatWouldMove } = await import(path.join(ROOT, 'cartograph/listing-identity.js'))

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)
const throws = (fn) => { try { fn(); return false } catch { return true } }
const base = (keys) => keys.map(k => ({ _key: k, name: k, building_id: 'b-' + k }))
const idOf = (list, key) => list.find(l => l._key === key)?.id

console.log('\nA listing keeps its id')

// ── the seal reproduces the old positional numbering, so today's ids carry over ──
const sealed = base(['ovt-c', 'ovt-a', 'ovt-b'])
const s1 = assignListingIds(sealed, 'test', null)
if (idOf(sealed, 'ovt-a') === 'test-lst-0001' && idOf(sealed, 'ovt-c') === 'test-lst-0003' && s1.report.sealed) ok('the first bake seals the existing sorted numbering')
else bad('the seal did not reproduce the sorted numbering — every existing id would move on the first sealed bake')

// ── a new key that sorts FIRST moves nothing ──
const grown = base(['ovt-0', 'ovt-a', 'ovt-b', 'ovt-c'])
const s2 = assignListingIds(grown, 'test', s1.registry)
if (idOf(grown, 'ovt-a') === 'test-lst-0001' && idOf(grown, 'ovt-c') === 'test-lst-0003' && idOf(grown, 'ovt-0') === 'test-lst-0004') ok('a new business that sorts first appends; no existing id moves')
else bad(`a new listing renumbered the others: ${grown.map(l => `${l._key}=${l.id}`).join(' ')}`)

// ── a vanished key's id stays reserved ──
const shrunk = base(['ovt-a', 'ovt-c', 'ovt-new'])
const s3 = assignListingIds(shrunk, 'test', s2.registry)
if (idOf(shrunk, 'ovt-new') !== 'test-lst-0002' && idOf(shrunk, 'ovt-c') === 'test-lst-0003') ok("a closed business's id is never handed to another")
else bad('a vanished key\'s id was reissued — a claim on the closed business would now point at a new one')
if (s3.registry.ids['ovt-b'] === 'test-lst-0002') ok('the registry keeps the retired key')
else bad('the registry forgot a retired key')

// ── authored ids ──
const withAdd = [...base(['ovt-a', 'ovt-z']), { id: 'test-lst-0002', name: 'Authored', building_id: 'b-x' }]
const s4 = assignListingIds(withAdd, 'test', null)
if (idOf(withAdd, 'ovt-z') !== 'test-lst-0002') ok('the seal skips an authored id')
else bad('the seal handed an authored id to a base listing')
const clash = [...base(['ovt-a']), { id: s4.registry.ids['ovt-a'], name: 'Clash', building_id: 'b-y' }]
if (throws(() => assignListingIds(clash, 'test', s4.registry))) ok('an authored id that the registry already issued throws')
else bad('an authored id silently reused a permanent id')

const renumbered = [{ ...base(['ovt-a'])[0], id: 'test-lst-0099' }]
if (throws(() => assignListingIds(renumbered, 'test', s1.registry))) ok('authoring a new id for a business the registry numbered throws')
else bad('an authored id silently renumbered a registry-numbered business')

// ── unanswerable inputs throw ──
if (throws(() => assignListingIds([{ name: 'No key' }], 'test', null))) ok('a listing with no id and no source key throws')
else bad('a listing with no source key was numbered anyway')
if (throws(() => assignListingIds(base(['ovt-a', 'ovt-a']), 'test', null))) ok('two listings with one source key throw')
else bad('a duplicated source key was numbered twice')
if (throws(() => assignListingIds(base(['ovt-a']), 'other', s1.registry))) ok("another scene's registry throws")
else bad('a registry with a different prefix was accepted')

// ── the safety net compares same-named twins as a set ──
const twins = [{ id: 'x-1', name: 'School', building_id: 'b' }, { id: 'x-2', name: 'School', building_id: 'b' }]
if (idsThatWouldMove([...twins].reverse(), twins).length === 0) ok('two listings of one name in one building are not reported as a move')
else bad('the seal guard paired one twin with the other and reported a move')
if (idsThatWouldMove([{ id: 'x-9', name: 'School', building_id: 'b' }, twins[1]], twins).length === 1) ok('a real move inside a twin group is reported')
else bad('a real move inside a twin group went unreported')

// ── every sealed scene agrees with its registry ──
const dataDir = path.join(ROOT, 'cartograph/data')
let scenes = 0
for (const scene of readdirSync(dataDir)) {
  const reg = path.join(dataDir, scene, 'content/listing-identity.json')
  const lst = path.join(dataDir, scene, 'content/listings.json')
  if (!existsSync(reg) || !existsSync(lst)) continue
  scenes++
  const { ids } = JSON.parse(readFileSync(reg, 'utf8'))
  const listings = JSON.parse(readFileSync(lst, 'utf8')).listings
  // A listing the registry never numbered carries an AUTHORED id (a patch pins it) — that is the
  // operator's, not a defect. The claim is only that no numbered business has drifted from its id.
  const numbered = listings.filter(l => l.source_key && ids[l.source_key])
  const off = numbered.filter(l => ids[l.source_key] !== l.id)
  if (off.length) bad(`${scene}: ${off.length} listing(s) disagree with their sealed id — e.g. ${off[0].name} is ${off[0].id}, sealed as ${ids[off[0].source_key]}`)
  else ok(`${scene}: all ${numbered.length} registry-numbered listings match their sealed ids`)
}
if (!scenes) { console.log('  (no scene has sealed its listing ids yet — the scene half could not measure)') }

console.log(failed ? `\n${failed} FAILED` : '\nall held')
process.exit(failed ? 1 : 0)
