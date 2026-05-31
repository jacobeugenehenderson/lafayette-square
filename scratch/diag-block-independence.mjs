// Trammel, 2026-05-30 (rewritten after a corrupted-shell false start).
// Q: when the operator authors a custom on ONE edge of ONE block, what else
// changes? Distinguishes (a) within-block monowidth (keystone-correct: block
// depth = max over the block's fes) from (b) cross-block leak (bug).
//
// Drift-proof: band->block attribution is by point-in-ring against the STABLE
// v2.blocks[].ring geometry, NOT by blockKey (which drifts under pass-2 asphalt
// expansion — the d7a bug — and would fabricate phantom "other" blocks).
// Run: node scratch/diag-block-independence.mjs
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
const ov = overlay.streets || {}
const liveStreets = (ribbons.streets || []).map(st => {
  const o = ov[st.skelId] || ov[st.id] || ov[st.name]
  return o ? { id: st.skelId || st.id, name: st.name, points: st.points, ...o }
           : { id: st.skelId || st.id, name: st.name, points: st.points, measure: st.measure }
})
const liveRibbons = mergeLiveRibbons(ribbons, liveStreets)
const OPTS = (bc) => ({
  stencil: clip, cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms: bc, blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? CURB_WIDTH, useRingBandEmitter: true,
})

function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i+1)%r.length; a += r[i][0]*r[j][1] - r[j][0]*r[i][1] } return Math.abs(a)/2 }
function centroid(r) { let x=0,z=0; for (const p of r){x+=p[0];z+=p[1]} return [x/r.length, z/r.length] }
function pip(pt, ring) { let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],zi=ring[i][1],xj=ring[j][0],zj=ring[j][1];const hit=((zi>pt[1])!==(zj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-zi)/(zj-zi)+xi);if(hit)inside=!inside}return inside }

// Stable physical-block id = smallest-area v2.blocks ring whose PIP contains
// the point (smallest-enclosing-area beats centroid-match on donut topology).
function blockIdFor(pt, blocks) {
  let best = null, bestA = Infinity
  for (let i = 0; i < blocks.length; i++) {
    const ring = blocks[i].ring
    if (!ring || ring.length < 3) continue
    if (pip(pt, ring)) { const a = ringArea(ring); if (a < bestA) { bestA = a; best = i } }
  }
  return best
}

// Per-physical-block total band area (drift-proof), keyed by stable block index.
function sig(v2) {
  const blocks = v2.blocks || []
  const m = new Map()
  for (const fb of v2.frontageBands || []) {
    const rings = [...(fb.sidewalkRings || []), ...(fb.treelawnRings || [])]
    for (const r of rings) {
      if (!r || r.length < 3) continue
      const id = blockIdFor(centroid(r), blocks)
      const key = id == null ? 'UNASSIGNED' : id
      m.set(key, (m.get(key) || 0) + ringArea(r))
    }
  }
  return m
}

const base = buildBlockGeometryV2(liveRibbons, OPTS({}))
const baseSig = sig(base)
// stable id of a target block: pick the fe on the block with the most fes that
// isn't the giant central plaza, to exercise a normal block.
const fes = base.frontageEdges || []
const target = fes.find(f => f.blockKey && f.edgeOrd != null)
const targetBlockId = blockIdFor(centroid((base.frontageBands.find(fb => fb.blockKey===target.blockKey&&(fb.sidewalkRings?.length||fb.treelawnRings?.length))?.sidewalkRings?.[0]||base.blocks[0].ring)), base.blocks)

function runEdit(label, edit) {
  const bc = { [target.blockKey]: { [target.edgeOrd]: edit } }
  const ed = buildBlockGeometryV2(liveRibbons, OPTS(bc))
  const edSig = sig(ed)
  const keys = new Set([...baseSig.keys(), ...edSig.keys()])
  let changedOther = 0, changedTarget = false
  const lines = []
  for (const k of [...keys].sort()) {
    const b = baseSig.get(k)||0, e = edSig.get(k)||0, d = e-b
    if (Math.abs(d) > 1) {
      const isTarget = (k === targetBlockId)
      if (isTarget) changedTarget = true; else if (k !== 'UNASSIGNED') changedOther++
      lines.push('   ' + (isTarget?'* TARGET-block ':(k==='UNASSIGNED'?'  unassigned   ':'  OTHER-block  ')) + k + '  ' + b.toFixed(0)+' -> '+e.toFixed(0)+' (Δ'+d.toFixed(0)+')')
    }
  }
  console.log('\n=== ' + label + ' (author block '+target.blockKey+' edge '+target.edgeOrd+') ===')
  console.log(lines.join('\n'))
  console.log('   => target changed: ' + changedTarget + ' ; OTHER physical blocks changed: ' + changedOther +
    (changedOther === 0 ? '  [INDEPENDENT]' : '  [CROSS-BLOCK COUPLING]'))
}

console.log('target physical block id =', targetBlockId, ' total physical blocks =', base.blocks.length)
runEdit('A. sidewalk/treelawn only (no pavementHW change)', { treelawn: 6, sidewalk: 9, terminal: 'sidewalk' })
runEdit('B. pavementHW widen (asphalt expansion)', { pavementHW: 14, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' })
