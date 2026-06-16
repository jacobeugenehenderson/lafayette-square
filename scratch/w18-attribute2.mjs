// READ-ONLY forensic v2 — locate the tiles whose geometry actually touches each
// w18 crop, dump per-run depth/step/flip + thin/neck flags, AND directly measure
// cross-face ped overlap (the "sidewalk rings cross" signature).
import { readFileSync } from 'fs'
import { buildTileGround, resolvePedDepths } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth, customs = d.blockCustoms || null
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: customs, emitArtifact: true })
const tiles = pr._shapeArtifact
const signedArea = (rr) => { let a=0; for(let i=0;i<rr.length;i++){const j=(i+1)%rr.length;a+=rr[i][0]*rr[j][1]-rr[j][0]*rr[i][1]} return a/2 }
const runCustom = (run) => customs?.[run.skelId]?.[run.side]?.[run.segOrd] || null
// nearest distance from a point to any iA vertex of a tile (cheap proximity)
const nearDist = (iA, px, py) => { let m=1e9; for(const rr of iA) for(const p of rr){const dx=p[0]-px,dy=p[1]-py;const dd=dx*dx+dy*dy; if(dd<m)m=dd} return Math.sqrt(m) }

const CROPS = { rcorner:[609,-391,40], lcorner:[516,-414,40], mid:[562,-402,65] }
for (const [name,[px,py,rad]] of Object.entries(CROPS)) {
  console.log(`\n========== ${name} @(${px},${py}) r=${rad} ==========`)
  const hits = []
  for (let ti=0; ti<tiles.length; ti++) {
    const st = tiles[ti]; const iA = st.iA||[]; if(!iA.length) continue
    if (nearDist(iA, px, py) > rad) continue
    let area=0, perim=0
    for (const rr of iA){ area+=Math.abs(signedArea(rr)); for(let i=0;i<rr.length;i++){const j=(i+1)%rr.length;perim+=Math.hypot(rr[j][0]-rr[i][0],rr[j][1]-rr[i][1])} }
    const meanW = perim>1e-6?2*area/perim:0
    const WBnom = cw+st.tl+st.sw
    const thinTile = perim>1e-6 && meanW<WBnom
    const clamped = st.cap < WBnom-1e-6
    const neck = thinTile && !clamped
    const runInfo = (st.runs||[]).map(run=>{ const c=runCustom(run); const ped=resolvePedDepths(run.baseMeasure,run.side,c); const m=run.measure?.[run.side]||{}; return {skelId:run.skelId,side:run.side,segOrd:run.segOrd,hasTL:ped.hasTL,tl:+ped.tl.toFixed(2),sw:+ped.sw.toFixed(2),pavHW:m.pavementHW!=null?+m.pavementHW.toFixed(2):null} })
    const byKey={}; for(const ri of runInfo){const k=ri.skelId+'|'+ri.side;(byKey[k]=byKey[k]||[]).push(ri)}
    let steps=0,flips=0
    for(const k of Object.keys(byKey)){const g=byKey[k];for(let i=1;i<g.length;i++){if(g[i].pavHW!=null&&g[i-1].pavHW!=null&&Math.abs(g[i].pavHW-g[i-1].pavHW)>=0.5)steps++;if(g[i].hasTL!==g[i-1].hasTL)flips++}}
    hits.push({ti,area:+area.toFixed(0),meanW:+meanW.toFixed(2),WBnom:+WBnom.toFixed(2),cap:+st.cap.toFixed(2),tl:+st.tl.toFixed(2),sw:+st.sw.toFixed(2),thinTile,clamped,neck,nRuns:runInfo.length,steps,flips,bandJoin:st.bandJoin,roundTips:(st.roundTips||[]).length,bluntTips:(st.bluntTips||[]).length,runInfo})
  }
  hits.sort((a,b)=>a.area-b.area)
  for(const h of hits){
    const tag=h.neck?'⛔NECK':h.thinTile?(h.clamped?'·capped':'thin'):''
    console.log(`tile#${h.ti} area=${h.area}m² meanW=${h.meanW} WBnom=${h.WBnom} cap=${h.cap}(tl${h.tl}/sw${h.sw}) join=${h.bandJoin} rTips=${h.roundTips} bTips=${h.bluntTips} runs=${h.nRuns} steps=${h.steps} flips=${h.flips} ${tag}`)
    if(h.neck||h.steps||h.flips||h.area<60){ for(const ri of h.runInfo) console.log(`     ${ri.skelId} ${ri.side} seg${ri.segOrd} hasTL=${ri.hasTL} tl=${ri.tl} sw=${ri.sw} pavHW=${ri.pavHW}`) }
  }
  if(!hits.length) console.log('  (no tiles within radius — defect is between faces, pure asphalt-junction throat)')
}
