// READ-ONLY — Verge divided/median forensic. For each divided site, measure:
//  - frozen median ring(s) health (area, mean width)
//  - the rendered median TILE: its iA/block coverage vs the asphalt union
//  - WHERE the visible sliver comes from (asphalt covers the gap? clip? curb bow?)
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const base = { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true }

function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
function bbox(ring){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[x,y]of ring){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y}return[x0,y0,x1,y1]}
// crude mean width of a strip = area / longest-dimension
function meanWidth(ring){const a=area(ring);const b=bbox(ring);const len=Math.max(b[2]-b[0],b[3]-b[1]);return len>0?a/len:0}

// frozen median rings
const medians = (r.medians||[]).filter(m=>m.kind==='median' && Array.isArray(m.ring) && m.ring.length>=3)
console.log(`Frozen median rings: ${medians.length}`)

const art = buildTileGround(r, { ...base })._shapeArtifact
console.log(`Shape tiles: ${art.length}`)

// Identify median tiles (replicate isMedianTile heuristic against frozen medians)
function ringBBox(ring){return bbox(ring)}
const medRings = medians.map(m=>m.ring), medBoxes=medRings.map(ringBBox)
// crude clip test: which median ring's bbox overlaps the tile bbox AND area-share>0.5
function medCoverApprox(tileRing){
  const tb=bbox(tileRing); const ta=area(tileRing)
  let best=0, bestIdx=-1
  for(let i=0;i<medRings.length;i++){const mb=medBoxes[i]
    if(mb[0]<=tb[2]&&mb[2]>=tb[0]&&mb[1]<=tb[3]&&mb[3]>=tb[1]){
      const ma=area(medRings[i]); if(ma>best){best=ma;bestIdx=i}
    }
  }
  return {medArea:best, medIdx:bestIdx, tileArea:ta}
}

// Sites by name → centroid box
const SITES = {
  'Chouteau': [[280,560],[-560,-480]],            // x range, then we filter by name
  'S-Jefferson': null,
  'Officer-David-Haynes': null,
}

// Walk tiles, find ones whose bounding runs touch a divided carriageway
const streets = r.streets
const divBySkel = new Map()
for(const s of streets) if(s.phase&&s.phase.kind==='divided') divBySkel.set(s.skelId,s)

let report=[]
art.forEach((st,ti)=>{
  // does this tile border a divided carriageway? check runMeta via _perRunMeta not available here; use ring overlap with median bbox
  const mc = medCoverApprox(st.ring)
  const ta = area(st.ring)
  const isMed = mc.medArea>0.5 && mc.medArea>0.5*ta
  if(!isMed) return
  // rendered "median" = the block rings (iA carve) area inside this median tile
  const iaArea = (st.iA||[]).reduce((a,ring)=>a+area(ring),0)
  const b=bbox(st.ring)
  report.push({ti, bbox:b.map(v=>v.toFixed(0)).join(','),
    tileArea:ta.toFixed(0), frozenMed:mc.medArea.toFixed(0),
    iaArea:iaArea.toFixed(0), tl:st.tl, sw:st.sw,
    medMeanW:meanWidth(medRings[mc.medIdx]).toFixed(2)})
})
console.log(`\nMedian tiles found: ${report.length}`)
for(const rr of report) console.log(JSON.stringify(rr))

// median ring health summary
const widths = medians.map(m=>meanWidth(m.ring))
widths.sort((a,b)=>a-b)
console.log(`\nMedian ring mean-widths: min=${widths[0].toFixed(2)} p25=${widths[Math.floor(widths.length*0.25)].toFixed(2)} med=${widths[Math.floor(widths.length/2)].toFixed(2)} max=${widths[widths.length-1].toFixed(2)}`)
const areas = medians.map(m=>area(m.ring)).sort((a,b)=>a-b)
console.log(`Median ring areas: min=${areas[0].toFixed(1)} med=${areas[Math.floor(areas.length/2)].toFixed(1)} max=${areas[areas.length-1].toFixed(1)}`)
