// Repro for the "no visible ribbons/sidewalks/corners after measure edits"
// regression. Datum, 2026-05-29. Run: node scratch/diag-measure-customs-bandcollapse.mjs
//
// FINDING: the operator's per-fe blockCustoms (written by the polygon-only
// measure redesign — whole-chain edits now fan dense customs across every fe)
// collapse the full V2 build's frontageBands from ~162 → 42 on the merged
// liveRibbons. No throw; bands simply aren't emitted. The bake/static path
// MASKS it because static toy-ribbons.json blockKeys diverge from the live
// (overlay-merged) blockKeys the customs were authored against:
//   static toy-ribbons : 1/25 custom keys match  → customs mostly ignored → 156 bands
//   live merged ribbons: 9/25 custom keys match   → customs apply         → 42 bands
//
// Suspected mechanism: the pass-2 customs re-emit in buildBlockGeometryV2
// (~line 2757-2789) rebuilds asphaltSharp/blockSharp/frontageEdges off the
// re-emitted asphalt. The operator's customs carry large pavementHW (10.7,
// 14.7, 19.4m on ~17-30m toy blocks); the expanded asphalt + blockKey drift
// likely drops most frontage bands when many fes are customized at once.

import { readFileSync } from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
import { mergeLiveRibbons } from '../src/lib/mergeLiveRibbons.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const ROOT = process.cwd()
const ribbons = JSON.parse(readFileSync(ROOT + '/src/data/toy/toy-ribbons.json', 'utf-8'))
const design  = JSON.parse(readFileSync(ROOT + '/public/looks/toy/design.json', 'utf-8'))
const overlay = JSON.parse(readFileSync(ROOT + '/cartograph/data/toy/clean/overlay.json', 'utf-8'))
const sten    = JSON.parse(readFileSync(ROOT + '/cartograph/data/toy/neighborhood_boundary.json', 'utf-8'))

let clip = null
if (sten.boundary?.length) {
  const c = sten.center || [0, 0], r = sten.radius || 1, sf = sten.streetFade
  const tr = sf ? sf.outer + 50 : r, s = r > 0 ? tr / r : 1
  clip = sten.boundary.map(([x, z]) => [c[0] + (x - c[0]) * s, c[1] + (z - c[1]) * s])
}

// Approximate the Designer's centerlineData.streets from overlay.json (keyed
// by name/id) so we can rebuild liveRibbons = mergeLiveRibbons(static, live).
const ov = overlay.streets || {}
const liveStreets = (ribbons.streets || []).map(st => {
  const o = ov[st.skelId] || ov[st.id] || ov[st.name]
  return o ? { id: st.skelId || st.id, name: st.name, points: st.points, ...o }
           : { id: st.skelId || st.id, name: st.name, points: st.points, measure: st.measure }
})
const liveRibbons = mergeLiveRibbons(ribbons, liveStreets)

function build(rib, bc, label) {
  try {
    const v2 = buildBlockGeometryV2(rib, {
      stencil: clip,
      cornerRadiusScale: design.cornerRadiusScale ?? 1,
      cornerRadiusOverrides: design.cornerRadiusOverrides || {},
      cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
      blockCustoms: bc, blockLandUse: design.blockLandUse || null,
      curbWidth: design.curbWidth ?? CURB_WIDTH, useRingBandEmitter: true,
    })
    const fb = v2.frontageBands || []
    const feKeys = new Set((v2.frontageEdges || []).map(f => f.blockKey + '/' + f.edgeOrd))
    const customKeys = Object.entries(bc).flatMap(([bk, e]) => Object.keys(e).map(eo => bk + '/' + eo))
    const matched = customKeys.filter(k => feKeys.has(k)).length
    console.log(label, 'blocks=' + (v2.blocks || []).length, 'frontageBands=' + fb.length,
      'fe_with_SW=' + fb.filter(f => f.sidewalkRings?.length).length,
      'matchedCustomKeys=' + matched + '/' + customKeys.length)
  } catch (e) {
    console.log(label, 'THREW:', e.message)
  }
}

build(ribbons,     design.blockCustoms || {}, 'static toy-ribbons + customs')
build(liveRibbons, {},                        'live(merged)      + NO customs')
build(liveRibbons, design.blockCustoms || {}, 'live(merged)      + customs   ')
