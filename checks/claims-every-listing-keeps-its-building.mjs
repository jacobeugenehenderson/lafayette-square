#!/usr/bin/env node
// claims-every-listing-keeps-its-building.mjs — DOES EVERY LISTING'S BUILDING STAY IN THE NEIGHBORHOOD?
//
// ⭐ THE CLASS (Jacob, 2026-10-25: "we need to keep all the commercial listings we can"). A listing is joined to its
// building (`building_id`); a membership change (an exclusion loop, a hide, a narrower polygon) that drops the building
// silently orphans the listing — the place vanishes from the town. On LS, applying the draft exclusion loops would have
// dropped bldg-1703 and with it "Architectural Artifacts of St. Louis". The fix is the operator's own channel — an
// `activate` in building-overrides.json, the membership formula's force-in term — never a code exception.
// ASKS THE PRODUCER, never re-applies the formula: each town's buildings as the slab loads them
// (bake-buildings.js#loadBuildings) and its keep-decision (bake-buildings.js#keptBy: the boundary, building-overrides.json,
// and today's ledger exemption). RED, naming listing and building, where the listing's building is absent or not kept.
// Towns come from the looks manifest (_scenes.mjs#declaredScenes): no listings file is SAID, a missing boundary is NOT
// CHECKED (red), an absent overrides file is named, and listings with no building_id are counted.
//   node checks/claims-every-listing-keeps-its-building.mjs [scene …]
//   … --scene=<t> --boundary=<file> [--overrides=<file>]   (a HYPOTHETICAL membership, e.g. a dry run of loops)
// ⭐ MUTATION TEST: --selftest hides one listed building of a real town through the overrides (must go RED, naming it)
// and leaves the town as it is (must be as before).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, refuseUnknownFlags, declaredScenes } from './_scenes.mjs'
import { loadBuildings, keptBy } from '../cartograph/bake-buildings.js'

refuseUnknownFlags(['scene', 'boundary', 'overrides', 'selftest'])
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'))

function inputs(scene, { boundary, overrides } = {}) {
  const D = join(ROOT, 'cartograph/data', scene)
  const lp = join(D, 'content/listings.json')
  if (!existsSync(lp)) return { scene, none: true }
  if (!existsSync(join(D, 'neighborhood_boundary.json')) && !boundary) return { scene, refused: 'no neighborhood_boundary.json' }
  const L = rd(lp), listings = L.listings || L
  const quiet = (f) => { const log = console.log, warn = console.warn; console.log = console.warn = () => {}; try { return f() } finally { console.log = log; console.warn = warn } }
  const all = quiet(() => loadBuildings(scene))
  if (!all.length) return { scene, refused: 'the slab has no building source (no data/<t>/buildings.json ledger, no clean/map.json)' }
  const k = quiet(() => keptBy(scene, all, { nb: boundary ? rd(boundary) : undefined, overrides: overrides ? rd(overrides) : undefined }))
  return { scene, listings, all, k }
}

function judge(I) {
  if (I.none) return { bad: [], line: `·  ${I.scene}: no content/listings.json — no listings to keep` }
  if (I.refused) return { bad: null, line: `⛔ ${I.scene}: NOT CHECKED — ${I.refused}` }
  const exists = new Set(I.all.map(b => b.id)), keptIds = new Set(I.k.buildings.map(b => b.id))
  const bad = [], onB = I.listings.filter(l => l.building_id != null)
  for (const l of onB) {
    if (!exists.has(l.building_id)) bad.push(`"${l.name}" → ${l.building_id} (no such building in the slab's source)`)
    else if (!keptIds.has(l.building_id)) bad.push(`"${l.name}" → ${l.building_id} (not kept by bake-buildings)`)
  }
  const how = `${I.k.ledger ? 'LEDGER, no boundary cull' : I.k.culled ? 'culled by the boundary' : 'no cull'} · overrides ${I.k.overridesFrom}`
  return { bad, line: `${bad.length ? '⛔' : '✅'} ${I.scene}: ${onB.length} listing(s) on a building, ${I.listings.length - onB.length} with none (${how}) · ${bad.length} lose it${bad.length ? ':\n     ' + bad.slice(0, 12).join('\n     ') : ''}` }
}

const towns = () => declaredScenes()

if (process.argv.includes('--selftest')) {
  let fails = 0
  for (const s of towns()) {
    const I = inputs(s); if (I.refused || I.none || I.k.ledger || !I.k.culled) continue
    const base = judge(I).bad.length, victim = I.listings.find(l => l.building_id != null && I.k.buildings.some(b => b.id === l.building_id))
    if (!victim) continue
    const ovP = join(ROOT, 'cartograph/data', s, 'building-overrides.json'), ov = existsSync(ovP) ? rd(ovP) : {}
    const k2 = keptBy(s, I.all, { overrides: { ...ov, hide: [...(ov.hide || []), victim.building_id] } })
    const J = judge({ ...I, k: k2 })
    const ok = J.bad.length === base + 1 && J.bad.some(x => x.includes(victim.building_id))
    if (!ok) fails++
    console.log(`  ${ok ? '✅' : '⛔'} ${s}: hiding ${victim.building_id} ("${victim.name}") → ${J.bad.length - base} more listing(s) RED (must be 1, naming it)`)
    break
  }
  process.exit(fails ? 1 : 0)
}

const one = arg('scene')
const list = one ? [one] : (process.argv.slice(2).filter(a => !a.startsWith('--')).length ? process.argv.slice(2).filter(a => !a.startsWith('--')) : towns())
let red = 0
for (const s of list) { const r = judge(inputs(s, { boundary: arg('boundary'), overrides: arg('overrides') })); if (r.bad === null || r.bad.length) red++; console.log(r.line) }
console.log(red ? '\n⛔ RED — a listing loses its building (add the building to building-overrides.json `activate`, the operator\'s channel)' : '\n✅ GREEN — every listing keeps its building')
process.exit(red ? 1 : 0)
