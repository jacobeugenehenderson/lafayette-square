import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const root = new URL('../', import.meta.url)
const ribbons = JSON.parse(fs.readFileSync(new URL('src/data/ribbons.json', root)))
const design = JSON.parse(fs.readFileSync(new URL('public/looks/lafayette-square/design.json', root)))
const opts = { curbWidth: CURB_WIDTH, smooth: STREET_SMOOTH, blockLandUse: design.blockLandUse||null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale)?design.cornerRadiusScale:1,
  cornerRadiusOverrides: design.cornerRadiusOverrides||null, cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides||null,
  blockCustoms: design.blockCustoms||null, emitArtifact: true }
const log=console.log; console.log=()=>{}
const OFF = buildTileGround(ribbons, { ...opts, deadEndMouthWrap:false })
const ON  = buildTileGround(ribbons, { ...opts, deadEndMouthWrap:true })
console.log=log
const offA = OFF._shapeArtifact, onA = ON._shapeArtifact
const bbox = rings => { let xn=1e9,yn=1e9,xx=-1e9,yx=-1e9; for(const r of rings) for(const p of r){xn=Math.min(xn,p[0]);yn=Math.min(yn,p[1]);xx=Math.max(xx,p[0]);yx=Math.max(yx,p[1])} return [xn,yn,xx,yx] }
const area = rings => rings.reduce((s,r)=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return s+Math.abs(a/2)},0)

// 1. which tiles got mouths
const mouthTiles = onA.map((t,i)=>({i,n:(t.mouths||[]).length})).filter(o=>o.n>0)
console.log(`tiles with mouths: ${mouthTiles.length}  total mouths: ${mouthTiles.reduce((s,o)=>s+o.n,0)}`)
console.log(`  multi-mouth tiles: ${mouthTiles.filter(o=>o.n>1).map(o=>`tile[${o.i}]=${o.n}`).join(', ')}`)

// 2. iA bbox/area change per tile (the iA itself should be byte-identical — fix touches FILL+runMeta only)
let iaChanged=0, maxBboxShift=0, maxAreaDelta=0
for(let i=0;i<offA.length;i++){
  const ba=JSON.stringify(offA[i].iA), bb=JSON.stringify(onA[i].iA)
  if(ba!==bb){ iaChanged++;
    const b0=bbox(offA[i].iA), b1=bbox(onA[i].iA)
    const sh=Math.max(Math.abs(b0[0]-b1[0]),Math.abs(b0[1]-b1[1]),Math.abs(b0[2]-b1[2]),Math.abs(b0[3]-b1[3]))
    const da=Math.abs(area(offA[i].iA)-area(onA[i].iA))
    maxBboxShift=Math.max(maxBboxShift,sh); maxAreaDelta=Math.max(maxAreaDelta,da)
    console.log(`  iA CHANGED tile[${i}] bboxShift=${sh.toFixed(3)}m areaDelta=${da.toFixed(3)}m²`)
  }
}
console.log(`iA changed tiles: ${iaChanged} (expect 0 — fix touches runMeta+FILL, not iA) maxBboxShift=${maxBboxShift.toFixed(3)} maxAreaDelta=${maxAreaDelta.toFixed(3)}`)

// 3. runMeta poly change per tile (the snap) — should be ONLY at mouth tiles, tiny moves (<12m, the apex offset)
let runChanged=0, maxRunMove=0
const mouthTileSet=new Set(mouthTiles.map(o=>o.i))
for(let i=0;i<offA.length;i++){
  const a=offA[i].runs, b=onA[i].runs
  let moved=false, mv=0
  for(let r=0;r<a.length;r++){
    const pa=a[r].poly, pb=b[r].poly
    for(let p=0;p<pa.length;p++){ const d=Math.hypot(pa[p][0]-pb[p][0],pa[p][1]-pb[p][1]); if(d>1e-6){moved=true; mv=Math.max(mv,d)} }
  }
  if(moved){ runChanged++; maxRunMove=Math.max(maxRunMove,mv); if(!mouthTileSet.has(i)) console.log(`  ⚠️ runMeta moved on NON-mouth tile[${i}] max=${mv.toFixed(2)}`) }
}
console.log(`runMeta changed tiles: ${runChanged} (all should be mouth tiles) maxRunMove=${maxRunMove.toFixed(2)}m (≈ apex offset ~10m)`)

// 4. Benton — find tiles bounded by benton, confirm unchanged
const bentonTiles=[]
onA.forEach((t,i)=>{ if((t.runs||[]).some(r=>/benton/.test(r.skelId||''))) bentonTiles.push(i) })
let bentonChanged=0
for(const i of bentonTiles){ if(JSON.stringify(offA[i].iA)!==JSON.stringify(onA[i].iA)) bentonChanged++ }
console.log(`Benton tiles: ${bentonTiles.length} iA-changed: ${bentonChanged} (expect 0)`)
