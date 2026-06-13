// READ-ONLY forensic — attribute each w18 ped defect to A (band-neck) / C1 (width
// steps) / C2 (treelawn flips), on the REAL frozen tiles. No production touched.
import { readFileSync } from 'fs'
import { buildTileGround, resolvePedDepths } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const customs = d.blockCustoms || null
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: customs, emitArtifact: true })
const tiles = pr._shapeArtifact

const signedArea = (rr) => { let a=0; for(let i=0;i<rr.length;i++){const j=(i+1)%rr.length;a+=rr[i][0]*rr[j][1]-rr[j][0]*rr[i][1]} return a/2 }
const bbox = (rings) => { let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9; for(const rr of rings) for(const p of rr){mnx=Math.min(mnx,p[0]);mny=Math.min(mny,p[1]);mxx=Math.max(mxx,p[0]);mxy=Math.max(mxy,p[1])} return [mnx,mny,mxx,mxy] }
const overlaps = (b, [x0,y0,x1,y1]) => b[0]<x1 && b[2]>x0 && b[1]<y1 && b[3]>y0

// the w18 render window (union of the three crops, padded)
const WIN = [480, -455, 650, -355]
const runCustom = (run) => customs?.[run.skelId]?.[run.side]?.[run.segOrd] || null

let nThin=0, nNeck=0, nClamped=0, nStep=0, nFlip=0
const rows = []
for (let ti=0; ti<tiles.length; ti++) {
  const st = tiles[ti]
  const iA = st.iA || []
  if (!iA.length) continue
  const b = bbox(iA)
  if (!overlaps(b, WIN)) continue
  const cx = (b[0]+b[2])/2, cy = (b[1]+b[3])/2
  // mean width + thinTile (mirror tileGround.js:2378-2383)
  let area=0, perim=0
  for (const rr of iA) { area+=Math.abs(signedArea(rr)); for(let i=0;i<rr.length;i++){const j=(i+1)%rr.length;perim+=Math.hypot(rr[j][0]-rr[i][0],rr[j][1]-rr[i][1])} }
  const meanW = perim>1e-6 ? 2*area/perim : 0
  const WBnom = cw + st.tl + st.sw
  const thinTile = perim>1e-6 && meanW < WBnom
  const clamped = st.cap < WBnom - 1e-6
  const neck = thinTile && !clamped     // Part A orphan: flagged thin, NOT clamped
  if (thinTile) nThin++
  if (clamped) nClamped++
  if (neck) nNeck++
  // per-run ped depths + treelawn Y/N + width steps
  const runInfo = (st.runs||[]).map(run => {
    const c = runCustom(run)
    const ped = resolvePedDepths(run.baseMeasure, run.side, c)
    const m = run.measure?.[run.side] || run.baseMeasure?.[run.side] || {}
    return { skelId: run.skelId, side: run.side, segOrd: run.segOrd, hasTL: ped.hasTL, tl: +ped.tl.toFixed(2), sw: +ped.sw.toFixed(2), pavHW: m.pavementHW!=null?+m.pavementHW.toFixed(2):null }
  })
  // adjacent-run steps + flips WITHIN this tile, grouped by skelId+side (continuation)
  let stepHere=0, flipHere=0
  const byKey = {}
  for (const ri of runInfo) { const k=ri.skelId+'|'+ri.side; (byKey[k]=byKey[k]||[]).push(ri) }
  for (const k of Object.keys(byKey)) {
    const g = byKey[k]
    for (let i=1;i<g.length;i++){
      if (g[i].pavHW!=null && g[i-1].pavHW!=null && Math.abs(g[i].pavHW-g[i-1].pavHW)>=0.5) stepHere++
      if (g[i].hasTL !== g[i-1].hasTL) flipHere++
    }
  }
  nStep+=stepHere; nFlip+=flipHere
  rows.push({ ti, cx:+cx.toFixed(0), cy:+cy.toFixed(0), meanW:+meanW.toFixed(2), WBnom:+WBnom.toFixed(2), cap:+st.cap.toFixed(2), thinTile, clamped, neck, nRuns:runInfo.length, stepHere, flipHere, runInfo })
}

rows.sort((a,b)=> (b.neck?1:0)-(a.neck?1:0) || a.meanW-b.meanW)
console.log(`\n=== w18 region: ${rows.length} tiles in window ${JSON.stringify(WIN)} ===`)
console.log(`thinTile=${nThin}  clamped(full-collapse)=${nClamped}  BAND-NECK(orphan A)=${nNeck}  width-steps(C1)=${nStep}  treelawn-flips(C2)=${nFlip}\n`)
for (const row of rows) {
  const tag = row.neck ? '⛔NECK' : row.thinTile ? (row.clamped?'·capped':'thin') : ''
  console.log(`tile#${row.ti} @(${row.cx},${row.cy}) meanW=${row.meanW} WBnom=${row.WBnom} cap=${row.cap} runs=${row.nRuns} steps=${row.stepHere} flips=${row.flipHere} ${tag}`)
  if (row.neck || row.stepHere || row.flipHere) {
    for (const ri of row.runInfo) console.log(`     ${ri.skelId} ${ri.side} seg${ri.segOrd}  hasTL=${ri.hasTL} tl=${ri.tl} sw=${ri.sw} pavHW=${ri.pavHW}`)
  }
}
