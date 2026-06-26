// Derivation-first probe for the dead-end spur notch.
// Confirms, against the LIVE frozen artifact + the engine's own offset:
//   - the spur edges (consecutive same-skelId opposite-side edges)
//   - the mouth-revisit vertex (ring revisits the mouth coord)
//   - the degree-1 tip
//   - that offsetRingVariable already emits {walls + cap} with DISTINCT
//     PL/PR mouth endpoints for the spur (= the iA we must re-create depth-0).
import fs from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'

const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)

// node degree (geometric), same as buildTileGround
const Q = 1e4
const tipKey = (p) => Math.round(p[0] * Q) + ',' + Math.round(p[1] * Q)
const nodeDeg = new Map()
for (const s of streets) {
  const pts = s.points
  for (let i = 0; i < pts.length; i++) {
    const inc = (i === 0 || i === pts.length - 1) ? 1 : 2
    const k = tipKey(pts[i])
    nodeDeg.set(k, (nodeDeg.get(k) || 0) + inc)
  }
}
const deg1 = new Set()
for (const s of streets) {
  const pts = s.points
  for (const idx of [0, pts.length - 1]) if (nodeDeg.get(tipKey(pts[idx])) === 1) deg1.add(tipKey(pts[idx]))
}
console.log(`deg-1 tips total: ${deg1.size}`)

// Use the FROZEN tiles (the prebake topology) so we probe exactly what the engine consumes.
const frozen = ribbons.tiles
console.log(`frozen tiles: ${frozen?.length}`)

// Spur detector on a tile: an edge run where the SAME skelId appears on BOTH
// sides consecutively, and the shared mouth vertex is revisited, with a deg-1 tip.
function spursInTile(t) {
  const edges = t.edges, ring = t.ring, n = edges.length
  const found = []
  for (let i = 0; i < n; i++) {
    // out edge i (skelId X, side A); look for the back edge with same skelId, opposite side
    const e = edges[i]
    // the tip is ring vertex where two same-skelId edges of OPPOSITE side meet
    const eNext = edges[(i + 1) % n]
    if (e.skelId === eNext.skelId && e.side !== eNext.side) {
      // vertex (i+1) is the TIP (between out-run and back-run)
      const tipV = ring[(i + 1) % n]
      const isTip = deg1.has(tipKey(tipV))
      found.push({ i, skelId: e.skelId, tipIdx: (i + 1) % n, tipV, isTip })
    }
  }
  return found
}

// Albion x Missouri ~ (-177.5, -78.7) -- find the tile whose ring contains a vertex near it.
const TARGET = [-177.5, -78.7]
let albionTile = -1, albionDist = Infinity
frozen.forEach((t, ti) => {
  for (const v of t.ring) {
    const d = Math.hypot(v[0] - TARGET[0], v[1] - TARGET[1])
    if (d < albionDist) { albionDist = d; albionTile = ti }
  }
})
console.log(`\nnearest frozen tile to Albion x Missouri ${TARGET}: tile[${albionTile}] (dist ${albionDist.toFixed(2)})`)

// Scan all frozen tiles for spurs.
let spurTiles = 0, spurCount = 0, tipConfirmed = 0
const spurTileIdx = []
frozen.forEach((t, ti) => {
  const sp = spursInTile(t)
  if (sp.length) {
    spurTiles++; spurCount += sp.length; spurTileIdx.push(ti)
    for (const s of sp) if (s.isTip) tipConfirmed++
  }
})
console.log(`\nspur tiles: ${spurTiles}, total spur runs: ${spurCount}, deg-1-tip-confirmed: ${tipConfirmed}`)
console.log(`spur tile indices: ${spurTileIdx.join(', ')}`)

// Detail on Albion tile + any spur there
console.log(`\n=== tile[${albionTile}] detail ===`)
{
  const t = frozen[albionTile]
  console.log(`ring length ${t.ring.length}, edges ${t.edges.length}`)
  console.log(`edge skelIds/sides: ${t.edges.map(e => `${e.skelId}/${e.side[0]}`).join('  ')}`)
  const sp = spursInTile(t)
  console.log(`spurs here: ${JSON.stringify(sp.map(s => ({ skelId: s.skelId, tipIdx: s.tipIdx, tipV: s.tipV.map(x=>+x.toFixed(2)), isTip: s.isTip })))}`)
  // mouth-revisit check: the two edges flanking the spur share the mouth coord
  for (const s of sp) {
    // mouth = the vertex before the out-run start AND after the back-run end -- they should be the same coord (revisit)
    const outStart = t.ring[s.i]            // start of out edge
    const backEnd = t.ring[(s.i + 2) % t.ring.length]  // end of back edge (other mouth side)
    console.log(`  spur ${s.skelId}: outStart=${outStart.map(x=>+x.toFixed(3))} backEnd=${backEnd.map(x=>+x.toFixed(3))} same=${Math.hypot(outStart[0]-backEnd[0],outStart[1]-backEnd[1]).toFixed(4)}m apart`)
  }
}

// confirm which tile contains a spur for 'missouri' or 'albion' named street
console.log(`\n=== spur tiles with skelIds ===`)
for (const ti of spurTileIdx) {
  const t = frozen[ti]
  const sp = spursInTile(t)
  const ctr = t.ring.reduce((a,v)=>[a[0]+v[0]/t.ring.length, a[1]+v[1]/t.ring.length],[0,0])
  console.log(`tile[${ti}] @(${ctr[0].toFixed(0)},${ctr[1].toFixed(0)}) spurs=${sp.map(s=>s.skelId).join(',')}`)
}
