#!/usr/bin/env node
// claims-a-recommit-changes-nothing.mjs — DOES THE EXTENT COMMIT CARRY EVERY KEY IT DOES NOT OWN, AND DOES A RE-COMMIT OF
// UNCHANGED INPUTS LEAVE EVERY FILE AS IT WAS?
//
// ⭐ THE CLASS (2026-10-25, LS): POST /<scene>/commit-extent rebuilt neighborhood.json from fixed fields, so a re-commit
// dropped `sides` (the LIVE extent mechanism) and `_note`, and it overwrote geography.json's `_comment`. A commit is a
// ratchet step the operator presses; it may change only what the gesture addresses.
// READS each town's own files and runs the route's own record builder (cartograph/commitExtent.mjs#commitExtentRecords,
// which serve.js calls) on the request Extent would send for the town as it stands: the applied centre, the draft's
// radius, name, blurb and exclusion loops. Then:
//   · CARRIED — every key of the prior neighborhood.json and geography.json that the commit does not own is still
//     there, with the same value (RED otherwise, naming the key);
//   · UNCHANGED — where the draft IS the applied extent (radius and loops), all three records come back value-identical,
//     so the route writes none of them (RED otherwise). A town whose draft differs is REPORTED, not failed: committing a
//     draft is the gesture, and the line says what it would apply.
// ⭐ MUTANTS (--mutants), each RED: the old fixed-field neighborhood (drops `sides`/`_note`); the old geography `_comment`
// overwrite.
//   node checks/claims-a-recommit-changes-nothing.mjs [--mutants]
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { commitExtentRecords, flattenBoundaryPath, sameJson } from '../cartograph/commitExtent.mjs'
import { splitBoundary } from '../cartograph/boundaryRecords.mjs'

const NB_OWNED = new Set(['draftRadius', 'radius', 'timezone', 'exclusions', 'committed', 'name', 'blurb', 'polygon', 'polygonSource'])
const GEO_OWNED = new Set(['timezone'])
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'))

function towns() {
  const D = join(ROOT, 'cartograph/data')
  return readdirSync(D).filter(s => ['geography.json', 'neighborhood.json', 'neighborhood_boundary.json'].every(f => existsSync(join(D, s, f))))
}

function judge(scene, mutate = (r) => r) {
  const D = join(ROOT, 'cartograph/data', scene)
  const geo = rd(join(D, 'geography.json')), nbh = rd(join(D, 'neighborhood.json')), bnd = rd(join(D, 'neighborhood_boundary.json'))
  const recs = splitBoundary(bnd, scene)
  if (!Array.isArray(bnd.center)) return { scene, skip: 'the boundary carries no centre (refused by the one reader)' }
  const latToM = geo.latToMeters || 111000
  const center = { lon: geo.lon + bnd.center[0] / geo.lonToMeters, lat: geo.lat - bnd.center[1] / latToM }
  const radius = Number.isFinite(nbh.draftRadius) ? nbh.draftRadius : bnd.radius
  const body = { center, radius, name: nbh.name, blurb: nbh.blurb, exclusions: nbh.exclusions || [] }
  const r = mutate(commitExtentRecords({ geo, prev: { neighborhood: nbh, boundaryRecords: recs }, body, timezone: geo.timezone, scene }))
  const lostNb = Object.keys(nbh).filter(k => !NB_OWNED.has(k) && !sameJson(nbh[k], r.neighborhood[k]))
  const lostGeo = Object.keys(geo).filter(k => !GEO_OWNED.has(k) && !sameJson(geo[k], r.geography[k]))
  // is the draft the applied extent? (radius, and the loops as the route would flatten them)
  const applied = (bnd.exclusions || []), wouldApply = (nbh.exclusions || []).map(l => flattenBoundaryPath(l, geo)).filter(p => p?.length >= 3)
  const draftDiff = [radius !== bnd.radius && `radius ${bnd.radius} → ${radius}`,
    !sameJson(applied, wouldApply) && `exclusions ${applied.length} → ${wouldApply.length} loop(s)`].filter(Boolean)
  const changed = ['geography', 'neighborhood', 'boundary'].filter(k => !sameJson(r[k], { geography: geo, neighborhood: nbh, boundary: bnd }[k]))
  return { scene, lostNb, lostGeo, draftDiff, changed }
}

const report = (j) => {
  if (j.skip) return { red: true, line: `⛔ ${j.scene}: NOT CHECKED — ${j.skip}` }
  const carried = !j.lostNb.length && !j.lostGeo.length
  const unchangedOk = j.draftDiff.length || !j.changed.length
  const red = !carried || !unchangedOk
  const parts = [carried ? 'every unowned key carried' : `DROPPED/CHANGED unowned key(s): ${[...j.lostNb.map(k => 'neighborhood.' + k), ...j.lostGeo.map(k => 'geography.' + k)].join(', ')}`,
    j.draftDiff.length ? `the draft is not the applied extent (${j.draftDiff.join('; ')}): committing it would write ${j.changed.join(', ') || 'nothing'}`
      : (j.changed.length ? `an UNCHANGED re-commit would rewrite ${j.changed.join(', ')}` : 'an unchanged re-commit writes nothing')]
  return { red, line: `${red ? '⛔' : '✅'} ${j.scene}: ${parts.join(' · ')}` }
}

let red = 0
for (const s of towns()) { const r = report(judge(s)); if (r.red) red++; console.log(r.line) }
if (process.argv.includes('--mutants')) {
  const MUT = [
    ['the old fixed-field neighborhood.json (sides/_note dropped)', (r) => ({ ...r, neighborhood: Object.fromEntries(Object.entries(r.neighborhood).filter(([k]) => NB_OWNED.has(k))) })],
    ['the old geography _comment overwrite', (r) => ({ ...r, geography: { ...r.geography, _comment: 'Committed extent — frame origin FROZEN at the fetch center' } })],
  ]
  for (const [name, m] of MUT) {
    const hit = towns().some(s => report(judge(s, m)).red)
    if (!hit) red++
    console.log(`  ${hit ? '✅' : '⛔'} mutant: ${name} → ${hit ? 'RED, as it must be' : 'stayed GREEN — the check cannot see it'}`)
  }
}
console.log(red ? '\n⛔ RED — the extent commit drops or rewrites what it does not own (cartograph/commitExtent.mjs)' : '\n✅ GREEN — a commit carries every key it does not own, and an unchanged re-commit writes nothing')
process.exit(red ? 1 : 0)
