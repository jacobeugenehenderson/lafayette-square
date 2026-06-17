#!/usr/bin/env node
// Map-wide: per junction node (by kind), find the worst nearby asphalt "tab/spike"
// (turn>40°, leg<1.5m within 10m) — the seam-protrusion signature — AND look for
// the brief's claimed mechanism: a CONVEX rounded lobe in the block/iA at PLAIN nodes.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
  emitArtifact: true,
})
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
function turnDeg(ring, i) {
  const n = ring.length, A = ring[(i-1+n)%n], V = ring[i], B = ring[(i+1)%n]
  let ix=V[0]-A[0],iy=V[1]-A[1],ox=B[0]-V[0],oy=B[1]-V[1]
  const li=Math.hypot(ix,iy),lo=Math.hypot(ox,oy)
  if(li<1e-6||lo<1e-6)return{deg:0,leg:0,cross:0}
  ix/=li;iy/=li;ox/=lo;oy/=lo
  return{deg:Math.acos(Math.max(-1,Math.min(1,ix*ox+iy*oy)))*180/Math.PI,cross:ix*oy-iy*ox,leg:Math.min(li,lo)}
}
const asph = (r.asphalt || []).filter(x => x.length >= 3)
// worst tab near a point: max turn among vertices with leg<1.5m within 10m
function worstTab(pt) {
  let best = null
  for (const ring of asph) for (let i = 0; i < ring.length; i++) {
    if (dist(ring[i], pt) > 10) continue
    const t = turnDeg(ring, i)
    if (t.leg < 1.5 && t.deg > 40 && (!best || t.deg > best.deg)) best = { ...t, at: ring[i] }
  }
  return best
}
const byKind = {}
const worstByKind = {}
for (const n of ribbons.junctionMap.nodes) {
  const k = [...(n.kinds || [])].sort().join('+') || 'none'
  byKind[k] = (byKind[k] || 0) + 1
  const tab = worstTab(n.at)
  if (tab) {
    worstByKind[k] = worstByKind[k] || []
    worstByKind[k].push({ at: n.at, deg: tab.deg, leg: tab.leg, tabAt: tab.at })
  }
}
console.log('=== junction nodes by kind: count, #with-asphalt-tab(>40°,leg<1.5m,within10m) ===')
for (const k of Object.keys(byKind).sort()) {
  const w = worstByKind[k] || []
  console.log(`  ${k.padEnd(28)} nodes=${String(byKind[k]).padStart(3)}  with-tab=${String(w.length).padStart(3)}`)
}
console.log('\n=== worst 15 tabs map-wide (with node kind) ===')
const all = []
for (const [k, arr] of Object.entries(worstByKind)) for (const x of arr) all.push({ k, ...x })
all.sort((a, b) => b.deg - a.deg)
for (const x of all.slice(0, 15)) console.log(`  ${x.k.padEnd(26)} node[${x.at.map(v=>v.toFixed(0))}]  tab ${x.deg.toFixed(0)}° leg=${x.leg.toFixed(2)}m @[${x.tabAt.map(v=>v.toFixed(0))}]`)

// brief's mechanism: convex rounded lobe in block ring at PLAIN-only nodes
console.log('\n=== PLAIN-only nodes: any convex fillet lobe in block/iA? ===')
const tiles = r._shapeArtifact || []
let plainLobes = 0
for (const n of ribbons.junctionMap.nodes) {
  if (!(n.kinds?.length === 1 && n.kinds.includes ? false : ([...(n.kinds||[])].length === 1 && [...(n.kinds||[])][0] === 'plain'))) continue
  // a convex run of short legs (a rounded arc) within 8m = a lobe
  let lobe = null
  for (const t of tiles) for (const ring of (t.iA || [])) {
    let convexShort = 0
    for (let i = 0; i < ring.length; i++) { if (dist(ring[i], n.at) > 8) continue; const tt = turnDeg(ring, i); if (tt.cross > 0 && tt.leg < 0.6 && tt.deg > 8) convexShort++ }
    if (convexShort >= 4 && (!lobe || convexShort > lobe)) lobe = convexShort
  }
  if (lobe) { plainLobes++; if (plainLobes <= 10) console.log(`  plain node[${n.at.map(v=>v.toFixed(0))}]  convex-short-arc-vtx=${lobe}`) }
}
console.log(`plain-only nodes with a convex arc lobe: ${plainLobes}`)
