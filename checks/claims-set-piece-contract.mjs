#!/usr/bin/env node
/**
 * "DOES EVERY DECLARED SET-PIECE MEET THE SLOT'S CONTRACT?" (BRIEF-set-piece-contract)
 *
 * A town declares a set-piece in src/instances/<town>.js (`setPiece`), and the slot (SetPiece.jsx) owes it the
 * same things every landmark has. Towns are found from the registry, never listed. For each one that declares a
 * set-piece, and each of its Looks, this fails when:
 *   · 1 BUILDING  the declaration names no `buildingId`, or the slab (public/baked/<look>/buildings.json, the id
 *                 set the listings, the card and the picking join to) has no record for it
 *   · 1 ONCE      the slab built geometry (wall / roof / foundation ranges) for that building: it would stand
 *                 twice, the slab's box inside the set-piece
 *   · 1 LISTING   no listing in content/listings.json is on that building, so clicking it opens nothing
 *   · 2 2D        the town's clean/map.json (what the Designer's 2D building layer draws) has no such building.
 *                 Ids are read by `buildingIdOf` (cartograph/membership.mjs), never restated.
 *   · 2 PLAN      the renderer does not declare `.plan`. `null` = the building's footprint IS the 2D outline (printed);
 *                 a non-null plan (a model with a deck) FAILS until the 2D draw of a model plan is built, so a
 *                 deck never lands undrawn in 2D. Read from SetPiece.jsx's RENDERERS and the renderer's source.
 *   · 3 LIGHT     the Look's scene.json carries no `setPieceLight` channel with values
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-set-piece-contract.mjs [--self-test]
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { registeredMaps, instanceForMap } from '../src/instances/registry.js'
import { buildingIdOf } from '../cartograph/membership.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null

// kind → the renderer's declared `.plan` expression (source text), or undefined. Read from SetPiece.jsx, never restated.
function planOf(kind) {
  const mount = readFileSync(join(ROOT, 'src/components/SetPiece.jsx'), 'utf8')
  const comp = mount.match(new RegExp(`'${kind}'\\s*:\\s*(\\w+)`))?.[1]
  const file = comp && mount.match(new RegExp(`import ${comp} from '\\./([^']+)'`))?.[1]
  if (!file) return undefined
  return readFileSync(join(ROOT, 'src/components', file), 'utf8').match(new RegExp(`^${comp}\\.plan\\s*=\\s*([^\\n]+?)\\s*$`, 'm'))?.[1]
}

/** One town, one Look. `inputs` are plain data so the self-test can mutate each one. */
export function audit({ town, look, sp, mapBuildingIds, slab, listings, scene, plan }) {
  const f = [], at = `${town}/${look}`
  const id = sp.buildingId
  if (!id) return [`${at}: setPiece declares no buildingId — a set-piece stands on one of the town's buildings`]
  if (plan === undefined) f.push(`${at}: the "${sp.kind}" renderer declares no .plan (null = its building's footprint is the 2D outline)`)
  else if (plan !== 'null') f.push(`${at}: the "${sp.kind}" renderer declares its own plan (${plan}), and the 2D draw of a model plan is not built — it would be missing from the Designer`)
  if (!slab) f.push(`${at}: no baked slab (public/baked/${look}/buildings.json) — NOT CHECKED, bake the town`)
  else {
    const b = slab.buildings.find(x => x.id === id)
    if (!b) f.push(`${at}: the slab has no building ${id} — the set-piece has no id, listing or card`)
    else {
      if (!(b.footprintRange?.[1] >= 3)) f.push(`${at}: the slab's ${id} has no footprint (footprintRange ${JSON.stringify(b.footprintRange)})`)
      const built = ['wall', 'roof', 'foundation'].filter(k => b.ranges?.[k])
      if (built.length) f.push(`${at}: the slab built ${built.join(' + ')} for ${id}, the set-piece's building — it stands twice`)
    }
  }
  if (!listings) f.push(`${at}: no content/listings.json — NOT CHECKED`)
  else if (!listings.some(l => l.building_id === id)) f.push(`${at}: no listing is on ${id} — clicking the set-piece opens nothing`)
  if (!mapBuildingIds) f.push(`${at}: no clean/map.json — NOT CHECKED`)
  else if (!mapBuildingIds.has(id)) f.push(`${at}: clean/map.json has no building ${id} — the 2D views don't draw it (hidden in building-overrides.json?)`)
  if (!scene) f.push(`${at}: no baked scene.json — NOT CHECKED`)
  else if (!scene.setPieceLight?.values || !Object.keys(scene.setPieceLight.values).length) f.push(`${at}: scene.json has no setPieceLight channel with values — the set-piece has no lighting`)
  return f
}

function inputsFor(map) {
  const town = instanceForMap(map)
  const looks = (readJson(join(ROOT, 'public/looks/index.json'))?.looks || []).filter(l => l.scene === map).map(l => l.id)
  const mapJson = readJson(join(ROOT, 'cartograph/data', map, 'clean/map.json'))
  const mapBuildingIds = mapJson ? new Set((mapJson.buildings || []).map(buildingIdOf).filter(Boolean)) : null
  const listings = readJson(join(ROOT, 'cartograph/data', map, 'content/listings.json'))?.listings ?? null
  const plan = planOf(town.setPiece.kind)
  return looks.map(look => ({
    town: map, look, sp: town.setPiece, mapBuildingIds, listings, plan,
    slab: readJson(join(ROOT, 'public/baked', look, 'buildings.json')),
    scene: readJson(join(ROOT, 'public/baked', look, 'scene.json')),
  }))
}

const declared = registeredMaps().filter(m => instanceForMap(m)?.setPiece)
const runs = [], orphans = []
for (const m of declared) {
  const r = inputsFor(m)
  if (!r.length) orphans.push(m)
  runs.push(...r)
}

if (process.argv.includes('--self-test')) {
  // A synthetic town that meets the contract, then each clause broken in turn.
  const ok = {
    town: 't2', look: 't2', sp: { kind: 'k', buildingId: 'osm-1' }, mapBuildingIds: new Set(['osm-1']),
    slab: { buildings: [{ id: 'osm-1', footprintRange: [0, 4], ranges: {} }] },
    listings: [{ id: 'l1', building_id: 'osm-1' }], scene: { setPieceLight: { values: { a: 0 } } }, plan: 'null',
  }
  const cases = [
    ['the baseline passes', () => audit(ok).length === 0],
    ['no buildingId', () => audit({ ...ok, sp: { kind: 'k' } }).length > 0],
    ['the slab lacks the building', () => audit({ ...ok, slab: { buildings: [] } }).length > 0],
    ['the slab extruded it', () => audit({ ...ok, slab: { buildings: [{ id: 'osm-1', footprintRange: [0, 4], ranges: { wall: [0, 8] } }] } }).length > 0],
    ['no footprint in the slab', () => audit({ ...ok, slab: { buildings: [{ id: 'osm-1', footprintRange: [0, 0], ranges: {} }] } }).length > 0],
    ['no listing on it', () => audit({ ...ok, listings: [{ id: 'l1', building_id: 'osm-2' }] }).length > 0],
    ['not in the 2D map', () => audit({ ...ok, mapBuildingIds: new Set() }).length > 0],
    ['no lighting channel', () => audit({ ...ok, scene: {} }).length > 0],
    ['the renderer declares no plan', () => audit({ ...ok, plan: undefined }).length > 0],
    ['the renderer declares a deck', () => audit({ ...ok, plan: 'DECK_RING' }).length > 0],
  ]
  // And on the real towns, once they pass: break the slab record and the listing.
  for (const r of runs.filter(r => audit(r).length === 0)) {
    cases.push([`${r.look}: the slab extrudes its set-piece`, () => audit({ ...r, slab: { buildings: r.slab.buildings.map(b => b.id === r.sp.buildingId ? { ...b, ranges: { wall: [0, 8] } } : b) } }).length > 0])
    cases.push([`${r.look}: its listing moves off`, () => audit({ ...r, listings: r.listings.filter(l => l.building_id !== r.sp.buildingId) }).length > 0])
  }
  let bad = 0
  for (const [n, run] of cases) { const c = run(); if (!c) bad++; console.log(`${c ? '✅' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

console.log(`towns declaring a set-piece: ${declared.join(', ') || 'none'}`)
for (const r of runs) console.log(`  ${r.look}: 2D outline = ${r.plan === 'null' ? `the building record ${r.sp.buildingId} (the renderer declares no plan of its own)` : `the renderer's plan (${r.plan})`}`)
const f = [...orphans.map(m => `${m} declares a set-piece and has no Look in public/looks/index.json`), ...runs.flatMap(audit)]
if (f.length) { console.log(`⛔ FAIL\n   ${f.join('\n   ')}`); process.exit(1) }
console.log(`✅ every declared set-piece stands on a slab building with no geometry of its own, has a listing, is in the 2D map and has a lighting channel (${runs.map(r => r.look).join(', ')})`)
